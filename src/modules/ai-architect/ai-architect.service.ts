import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { RetrievalService } from '../retrieval/retrieval.service';
import { ContextBuilderService } from '../context-builder/context-builder.service';
import { ReasoningService } from '../reasoning/reasoning.service';
import { PrismaService } from '../../database/prisma.service';
import { TechLeadService } from './tech-lead.service';
import {
  Citation,
  QueryMode,
  RagDecisionOutput,
  RetrievedChunk,
  RetrievalOptions,
} from '../../common/types/rag.types';
import { logPipelineStep, logPipelineError } from '../../common/utils/logger.util';

export interface QueryRequest {
  query: string;
  retrievalOptions?: RetrievalOptions;
  compressContext?: boolean;
  mode?: QueryMode;
  decompose?: boolean;
  context?: string;
}

export interface QueryResponse extends RagDecisionOutput {
  metadata: {
    retrievedChunks: number;
    contextGroups: number;
    hasContradictions: boolean;
    insufficientInformation: boolean;
    latencyMs: number;
    scoreMin: number;
    scoreMax: number;
    retrievalScore: number;
    groundingScore: number;
    coverageScore: number;
    citationDensity: number;
    verifiedCitations: number;
    unverifiedCitations: number;
  };
}

@Injectable()
export class AiArchitectService {
  private readonly logger = new Logger(AiArchitectService.name);

  constructor(
    private readonly retrieval: RetrievalService,
    private readonly contextBuilder: ContextBuilderService,
    private readonly reasoning: ReasoningService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly techLead: TechLeadService,
  ) {}

  async query(request: QueryRequest): Promise<QueryResponse> {
    const startTime = Date.now();
    const mode = request.mode ?? 'assistant';

    logPipelineStep(this.logger, 'PIPELINE:START', { query: request.query, mode });

    try {
      // ETAPA 0: Tech Lead (solo si decompose está activado)
      if (request.decompose) {
        const analysis = await this.techLead.analyze(request.query);

        if (analysis.complexity === 'complex' && analysis.sub_queries.length > 1) {
          logPipelineStep(this.logger, 'PIPELINE:TECH_LEAD_DECOMPOSE', {
            subQueries: analysis.sub_queries.length,
            reasoning: analysis.reasoning,
          });
          return this.executeComplexQuery(request, analysis.sub_queries, startTime);
        }
      }

      // Query directa — pipeline normal
      return this.executeSingleQuery(request, startTime);
    } catch (error) {
      logPipelineError(this.logger, 'PIPELINE', error);
      throw error;
    }
  }

  /**
   * Ejecuta una query compleja: corre el pipeline para cada sub-query
   * y sintetiza los resultados.
   */
  private async executeComplexQuery(
    request: QueryRequest,
    subQueries: string[],
    startTime: number,
  ): Promise<QueryResponse> {
    const parallel = this.configService.get('TL_PARALLEL_SUBQUERIES', 'false') === 'true';

    logPipelineStep(this.logger, `PIPELINE:${parallel ? 'PARALLEL' : 'SEQUENTIAL'}_START`, {
      subQueries: subQueries.length,
      queries: subQueries,
    });

    // Paralelo o serie según configuración (TL_PARALLEL_SUBQUERIES=true)
    let subResponses: QueryResponse[];
    if (parallel) {
      subResponses = await Promise.all(
        subQueries.map((subQuery) =>
          this.executeSingleQuery({ ...request, query: subQuery }, Date.now()),
        ),
      );
    } else {
      subResponses = [];
      for (const subQuery of subQueries) {
        const subResponse = await this.executeSingleQuery(
          { ...request, query: subQuery },
          Date.now(),
        );
        subResponses.push(subResponse);
      }
    }

    // Sintetizar respuestas
    const synthesized = await this.techLead.synthesize(request.query, subResponses);

    // Agregar métricas combinadas
    const latencyMs = Date.now() - startTime;
    const allChunks = subResponses.reduce((sum, r) => sum + r.metadata.retrievedChunks, 0);
    const allGroups = subResponses.reduce((sum, r) => sum + r.metadata.contextGroups, 0);
    const hasContradictions = subResponses.some((r) => r.metadata.hasContradictions);
    const avgRetrievalScore =
      subResponses.length > 0
        ? subResponses.reduce((sum, r) => sum + r.metadata.retrievalScore, 0) / subResponses.length
        : 0;

    const totalVerified = subResponses.reduce((sum, r) => sum + r.metadata.verifiedCitations, 0);
    const totalUnverified = subResponses.reduce((sum, r) => sum + r.metadata.unverifiedCitations, 0);
    const totalCitationsCount = synthesized.citations.length + synthesized.official_sources.length;
    const groundingScore = totalCitationsCount > 0
      ? Math.min(totalVerified / totalCitationsCount, 1)
      : 0;

    const allScoreMins = subResponses.map((r) => r.metadata.scoreMin);
    const allScoreMaxs = subResponses.map((r) => r.metadata.scoreMax);

    // Coverage: proporción de sub-queries que tuvieron buena cobertura
    const goodCoverage = subResponses.filter((r) => r.metadata.coverageScore >= 0.5).length;
    const coverageScore = subResponses.length > 0 ? goodCoverage / subResponses.length : 0;

    const citationDensity = allGroups > 0 ? synthesized.citations.length / allGroups : 0;

    logPipelineStep(this.logger, 'PIPELINE:COMPLEX_COMPLETE', {
      subQueries: subQueries.length,
      totalLatencyMs: latencyMs,
      totalVerified,
      coverageScore,
    });

    return {
      ...synthesized,
      metadata: {
        retrievedChunks: allChunks,
        contextGroups: allGroups,
        hasContradictions,
        insufficientInformation: subResponses.every((r) => r.metadata.insufficientInformation),
        latencyMs,
        scoreMin: allScoreMins.length > 0 ? Math.min(...allScoreMins) : 0,
        scoreMax: allScoreMaxs.length > 0 ? Math.max(...allScoreMaxs) : 0,
        retrievalScore: avgRetrievalScore,
        groundingScore,
        coverageScore,
        citationDensity,
        verifiedCitations: totalVerified,
        unverifiedCitations: totalUnverified,
      },
    };
  }

  /**
   * Pipeline original para una sola query.
   */
  private async executeSingleQuery(
    request: QueryRequest,
    startTime: number,
  ): Promise<QueryResponse> {
    const mode = request.mode ?? 'assistant';

    // ETAPA 1: Retrieval
    logPipelineStep(this.logger, 'PIPELINE:STEP_1_RETRIEVAL', {});
    const chunks = await this.retrieval.retrieve(request.query, request.retrievalOptions);

    // ETAPA 2: Context Builder
    logPipelineStep(this.logger, 'PIPELINE:STEP_2_CONTEXT_BUILDER', {
      chunksFound: chunks.length,
      compress: request.compressContext ?? false,
    });
    const context = await this.contextBuilder.build(
      request.query,
      chunks,
      request.compressContext ?? false,
    );

    // ETAPA 3: AI Engineer Reasoning
    logPipelineStep(this.logger, 'PIPELINE:STEP_3_REASONING', {
      mode,
      groups: context.groups.length,
      insufficient: context.insufficientInformation,
    });
    const output = await this.reasoning.reason(request.query, context, mode, request.context);

    // ETAPA 4: Decision Output
    const latencyMs = Date.now() - startTime;
    const hasContradictions = context.groups.some((g) => g.hasContradictions);

    // Verificar citas contra chunks recuperados
    const { verified, unverified } = this.verifyCitations(output.citations, chunks);

    const scores = chunks.map((c) => c.score);
    const scoreMin = scores.length ? Math.min(...scores) : 0;
    const scoreMax = scores.length ? Math.max(...scores) : 0;
    const retrievalScore = scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;

    const totalCitations = output.citations.length + output.official_sources.length;
    const groundingScore =
      totalCitations > 0
        ? Math.min(verified.length / totalCitations, 1)
        : 0;

    const uniqueCitedSources = new Set(verified.map((c) => c.source)).size;
    const totalRetrievedSources = new Set(chunks.map((c) => c.metadata.source)).size;
    const coverageScore =
      totalRetrievedSources > 0 ? uniqueCitedSources / totalRetrievedSources : 0;

    const citationDensity =
      context.groups.length > 0 ? output.citations.length / context.groups.length : 0;

    const insufficientInformation = this.evaluateInsufficiency(
      verified,
      chunks.length,
      scores,
    );

    const scoreDistribution = this.computeScoreDistribution(scores);
    logPipelineStep(this.logger, 'PIPELINE:SCORE_DISTRIBUTION', scoreDistribution);

    logPipelineStep(this.logger, 'PIPELINE:STEP_4_DECISION_OUTPUT', {
      latencyMs,
      retrievalScore,
      groundingScore,
      coverageScore,
      citationDensity,
      insufficientInformation,
    });

    await this.logQuery({
      query: request.query,
      output,
      chunks,
      latencyMs,
      scoreMin,
      scoreMax,
      scoreAvg: retrievalScore,
      rerankApplied: request.retrievalOptions?.useReranking ?? true,
    });

    return {
      ...output,
      metadata: {
        retrievedChunks: chunks.length,
        contextGroups: context.groups.length,
        hasContradictions,
        insufficientInformation,
        latencyMs,
        scoreMin,
        scoreMax,
        retrievalScore,
        groundingScore,
        coverageScore,
        citationDensity,
        verifiedCitations: verified.length,
        unverifiedCitations: unverified.length,
      },
    };
  }

  /**
   * Evalúa insuficiencia de información basándose en señales del sistema,
   * sin depender del texto generado por el LLM.
   *
   * Señal 1 (hard): noCitations — el LLM no extrajo ninguna cita verificada → insuficiente
   * Señal 2 (hard): veryLowRetrieval — score promedio < 0.1 → chunks tan irrelevantes que
   *   cualquier cita es coincidencia, no evidencia real
   * Señal 3+4 (combinadas): lowRetrievalQuality AND lowCoverage — ambas señales débiles
   *   juntas indican que el retrieval no encontró material útil
   */
  private evaluateInsufficiency(
    citations: Citation[],
    retrievedChunks: number,
    scores: number[],
  ): boolean {
    const noCitations = citations.length === 0;

    const avgScore =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    // Score promedio < 0.1 = chunks basicamente irrelevantes, marcar insuficiente
    // independientemente de si el LLM generó citas
    const veryLowRetrieval = avgScore < 0.1;

    const scoreThreshold = Number(this.configService.get('INSUFFICIENCY_SCORE_THRESHOLD', '0.3'));
    const lowRetrievalQuality = avgScore < scoreThreshold;

    const coverageThreshold = Number(this.configService.get('INSUFFICIENCY_COVERAGE_THRESHOLD', '0.2'));
    const lowCoverage =
      retrievedChunks > 0 ? citations.length / retrievedChunks < coverageThreshold : true;

    return noCitations || veryLowRetrieval || (lowRetrievalQuality && lowCoverage);
  }

  /**
   * Calcula la distribución estadística de scores de retrieval.
   * Loguear en cada query permite calibrar thresholds (0.3, etc.) con data real.
   */
  private computeScoreDistribution(scores: number[]): Record<string, number> {
    if (scores.length === 0) {
      return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p90: 0 };
    }
    const sorted = [...scores].sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
    const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
    return {
      count: sorted.length,
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      avg: Math.round(avg * 1000) / 1000,
      p50: Math.round(p50 * 1000) / 1000,
      p90: Math.round(p90 * 1000) / 1000,
    };
  }

  /**
   * Verifica citas del LLM contra los chunks recuperados.
   * Una cita es "verificada" si al menos 60% de sus palabras significativas
   * aparecen en algun chunk recuperado.
   */
  private verifyCitations(
    citations: Citation[],
    chunks: RetrievedChunk[],
  ): { verified: Citation[]; unverified: Citation[] } {
    const chunkContents = chunks.map((c) => this.normalizeForMatch(c.content));
    const verified: Citation[] = [];
    const unverified: Citation[] = [];

    for (const citation of citations) {
      const normalizedCitation = this.normalizeForMatch(citation.text);
      const isVerified = chunkContents.some((content) =>
        this.fuzzyContains(content, normalizedCitation),
      );
      if (isVerified) {
        verified.push(citation);
      } else {
        unverified.push(citation);
      }
    }

    if (unverified.length > 0) {
      this.logger.warn(
        `${unverified.length} of ${citations.length} citations could not be verified against retrieved chunks`,
      );
    }

    return { verified, unverified };
  }

  private normalizeForMatch(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private fuzzyContains(haystack: string, needle: string): boolean {
    const needleWords = new Set(needle.split(' ').filter((w) => w.length > 3));
    if (needleWords.size === 0) return false;
    const haystackWords = new Set(haystack.split(' ').filter((w) => w.length > 3));
    const matches = [...needleWords].filter((w) => haystackWords.has(w));
    return matches.length / needleWords.size >= 0.6;
  }

  private async logQuery(params: {
    query: string;
    output: RagDecisionOutput;
    chunks: { id: string; content: string; score: number; metadata: Record<string, unknown> }[];
    latencyMs: number;
    scoreMin: number;
    scoreMax: number;
    scoreAvg: number;
    rerankApplied: boolean;
  }): Promise<void> {
    try {
      await this.prisma.queryLog.create({
        data: {
          query: params.query,
          retrievedDocs: params.chunks.map((c) => ({
            id: c.id,
            score: c.score,
          })) as unknown as Prisma.InputJsonValue,
          decision: params.output.decision,
          reasoning: params.output.reasoning,
          tradeoffs: params.output.tradeoffs as unknown as Prisma.InputJsonValue,
          examples: params.output.examples as unknown as Prisma.InputJsonValue,
          citations: params.output.citations as unknown as Prisma.InputJsonValue,
          latencyMs: params.latencyMs,
          scoreMin: params.scoreMin,
          scoreMax: params.scoreMax,
          scoreAvg: params.scoreAvg,
          rerankApplied: params.rerankApplied,
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to log query: ${String(error)}`);
    }
  }
}
