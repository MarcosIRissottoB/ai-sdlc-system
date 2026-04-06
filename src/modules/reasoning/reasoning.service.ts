import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import {
  BuiltContext,
  Citation,
  QueryMode,
  RagDecisionOutput,
} from '../../common/types/rag.types';
import { ReasoningError } from '../../common/exceptions/rag.exceptions';
import { REASONING_PROMPT_TEMPLATE } from '../../prompts/ai-engineer.prompt';
import { logPipelineStep, logPipelineError } from '../../common/utils/logger.util';
import { sanitizeChunkForPrompt } from '../../common/utils/prompt-sanitizer.util';
import { safeParseLlmJson } from '../../common/utils/llm-json.util';
import { estimateTokens } from '../../common/utils/token-estimator.util';

const ragOutputSchema = z.object({
  citations: z.array(z.object({ source: z.string(), text: z.string() })).default([]),
  official_sources: z.array(z.object({ source: z.string(), text: z.string(), url: z.string().default('') })).default([]),
  decision: z.string().default('Sin decisión'),
  reasoning: z.string().default('Sin razonamiento'),
  tradeoffs: z.array(z.string()).default([]),
  examples: z.array(z.string()).default([]),
  stack_decisions: z.record(z.string(), z.string()).default({}),
  modules: z.array(z.string()).default([]),
  next_steps: z.array(z.string()).default([]),
  open_questions: z.array(z.string()).default([]),
});

@Injectable()
export class ReasoningService {
  private readonly logger = new Logger(ReasoningService.name);
  private readonly llm: ChatOpenAI;

  constructor(private readonly configService: ConfigService) {
    this.llm = new ChatOpenAI({
      openAIApiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
      modelName: this.configService.get<string>('OPENAI_CHAT_MODEL', 'gpt-4o'),
      temperature: 0.1,
      maxTokens: 4096,
      timeout: Number(this.configService.get('LLM_TIMEOUT', '30000')),
    });
  }

  async reason(
    query: string,
    context: BuiltContext,
    mode: QueryMode = 'assistant',
    projectContext?: string,
  ): Promise<RagDecisionOutput> {
    logPipelineStep(this.logger, 'REASONING:START', {
      query,
      mode,
      groups: context.groups.length,
      insufficient: context.insufficientInformation,
    });

    const hasContradictions = context.groups.some((g) => g.hasContradictions);
    const contextText = this.buildContextText(context);

    const prompt = REASONING_PROMPT_TEMPLATE({
      query,
      context: contextText,
      hasContradictions,
      insufficientInfo: context.insufficientInformation,
      mode,
      projectContext,
    });

    try {
      const response = await this.llm.invoke(prompt);
      const text = typeof response.content === 'string' ? response.content : '';

      const rawOutput = this.parseOutput(text);

      const deduplicated = this.deduplicateCitations(rawOutput.citations);
      const output: RagDecisionOutput = { ...rawOutput, citations: deduplicated };

      let finalOutput = output;
      if (mode === 'qa') {
        finalOutput = this.applyQaGroundingFallback(output);
      }

      logPipelineStep(this.logger, 'REASONING:COMPLETE', {
        mode,
        citationsCount: finalOutput.citations.length,
        officialSourcesCount: finalOutput.official_sources.length,
        tradeoffsCount: finalOutput.tradeoffs.length,
        deduplicatedCitations: rawOutput.citations.length - output.citations.length,
      });

      return finalOutput;
    } catch (error) {
      logPipelineError(this.logger, 'REASONING', error);
      throw new ReasoningError(
        `Reasoning failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Guardrail para modo QA: verifica que la respuesta esté anclada en las citas.
   * Usa containment coefficient en vez de substring para robustez ante paráfrasis,
   * acentos y variaciones menores de texto.
   *
   * Si el check falla → devuelve fallback estructurado en lugar de lanzar excepción,
   * preservando las citas recuperadas para debugging.
   */
  private applyQaGroundingFallback(output: RagDecisionOutput): RagDecisionOutput {
    if (output.citations.length === 0) {
      this.logger.warn('QA mode: no citations in output — returning fallback');
      return this.buildQaFallback(output, 'no-citations');
    }

    const normalizedDecision = this.normalizeForComparison(output.decision);
    const groundingThreshold = Number(this.configService.get('GROUNDING_THRESHOLD', '0.5'));
    const isGrounded = output.citations.some(
      (c) => this.containmentSimilarity(this.normalizeForComparison(c.text), normalizedDecision) >= groundingThreshold,
    );

    if (!isGrounded) {
      this.logger.warn(`QA mode: grounding check failed (containment < ${groundingThreshold}) — returning fallback`);
      return this.buildQaFallback(output, 'low-containment');
    }

    return output;
  }

  private buildQaFallback(
    output: RagDecisionOutput,
    reason: 'no-citations' | 'low-containment',
  ): RagDecisionOutput {
    return {
      ...output,
      decision:
        'No se encontró información suficiente en el contexto recuperado para responder esta pregunta.',
      reasoning: `${output.reasoning} [Guardrail QA activado: ${reason}. La respuesta generada no pudo verificarse contra las citas recuperadas.]`,
      isFallback: true,
    };
  }

  /**
   * Containment coefficient: mide qué fracción del vocabulario de `shorter`
   * aparece en `longer`. Robusto para comparar textos de distinta longitud,
   * acentos y paráfrasis leves.
   *
   * containment(citation, decision) = |words(citation) ∩ words(decision)| / |words(citation)|
   *
   * Threshold actual: 0.3 (conservador — reduce falsos positivos del fallback)
   * Ajuste futuro: subir a 0.4–0.5 si se detectan respuestas vagas que pasan el guardrail,
   * o combinar con similarity semántica por embeddings para mayor precisión.
   */
  private containmentSimilarity(shorter: string, longer: string): number {
    const wordsA = new Set(shorter.split(' ').filter((w) => w.length > 2));
    const wordsB = new Set(longer.split(' ').filter((w) => w.length > 2));
    if (wordsA.size === 0) return 0;
    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    return intersection.size / wordsA.size;
  }

  /**
   * Elimina citas semánticamente duplicadas usando Jaccard sobre texto
   * normalizado (lowercase, sin puntuación, palabras > 2 chars).
   * Threshold: 0.85 → dos citas con 85%+ de vocabulario compartido se consideran iguales.
   */
  private deduplicateCitations(citations: Citation[]): Citation[] {
    const result: Citation[] = [];
    for (const candidate of citations) {
      const normalizedCandidate = this.normalizeForComparison(candidate.text);
      const isDuplicate = result.some(
        (existing) =>
          this.jaccardSimilarity(
            normalizedCandidate,
            this.normalizeForComparison(existing.text),
          ) > 0.85,
      );
      if (!isDuplicate) result.push(candidate);
    }
    return result;
  }

  private normalizeForComparison(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private jaccardSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.split(' ').filter((w) => w.length > 2));
    const wordsB = new Set(b.split(' ').filter((w) => w.length > 2));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    return intersection.size / union.size;
  }

  private buildContextText(context: BuiltContext): string {
    if (context.insufficientInformation && context.groups.length === 0) {
      return 'No hay información disponible en la base de conocimiento.';
    }

    const maxContextTokens = Number(
      this.configService.get('MAX_CONTEXT_TOKENS', '100000'),
    );
    // Reserve tokens for system prompt + query + output instructions
    const budget = maxContextTokens - 2000;
    let usedTokens = 0;
    let truncated = false;
    const parts: string[] = [];

    for (const group of context.groups) {
      const contradictionWarning = group.hasContradictions
        ? `\n⚠️ CONTRADICCIÓN DETECTADA: ${group.contradictionDetails ?? ''}\n`
        : '';

      const header = `TEMA: ${group.topic}${contradictionWarning}\n`;
      const headerTokens = estimateTokens(header);

      if (usedTokens + headerTokens > budget) {
        truncated = true;
        break;
      }

      usedTokens += headerTokens;
      const chunkLines: string[] = [];

      // Chunks are already sorted by score from context builder
      for (const chunk of group.chunks) {
        const isOfficial = this.isOfficialSource(chunk.content);
        const sourceLabel = isOfficial ? '📌 FUENTE OFICIAL' : 'Fuente';
        const line = `  ${sourceLabel}: "${chunk.metadata.source}"\n  Texto: "${sanitizeChunkForPrompt(chunk.content)}"`;
        const lineTokens = estimateTokens(line);

        if (usedTokens + lineTokens > budget) {
          truncated = true;
          break;
        }

        usedTokens += lineTokens;
        chunkLines.push(line);
      }

      parts.push(`${header}${chunkLines.join('\n\n')}`);
      if (truncated) break;
    }

    if (truncated) {
      this.logger.warn(
        `Context truncated at ~${usedTokens} tokens (budget: ${budget}). Some chunks were dropped.`,
      );
    }

    return parts.join('\n\n===\n\n');
  }

  /**
   * Detecta si un chunk proviene de documentación oficial (contiene URLs de docs).
   */
  private isOfficialSource(content: string): boolean {
    const officialPatterns = [
      'developers.openai.com',
      'platform.openai.com',
      'docs.pydantic.dev',
      'langfuse.com',
      'docs.anthropic.com',
      'python.langchain.com',
      'js.langchain.com',
      'learn.microsoft.com',
      'Fuente oficial',
      'Fecha de consulta',
    ];
    return officialPatterns.some((pattern) => content.includes(pattern));
  }

  private parseOutput(text: string): RagDecisionOutput {
    const result = safeParseLlmJson(text, ragOutputSchema);
    if (!result) {
      throw new ReasoningError('Failed to parse or validate LLM JSON output');
    }
    return result;
  }
}
