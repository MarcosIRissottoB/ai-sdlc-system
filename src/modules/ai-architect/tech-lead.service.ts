import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { safeParseLlmJson } from '../../common/utils/llm-json.util';
import { sanitizeQueryForPrompt } from '../../common/utils/query-sanitizer.util';
import { logPipelineStep } from '../../common/utils/logger.util';
import { QueryResponse } from './ai-architect.service';
import { RagDecisionOutput, Citation, OfficialSource, ModuleSpec } from '../../common/types/rag.types';

const analysisSchema = z.object({
  complexity: z.enum(['simple', 'complex']),
  sub_queries: z.array(z.string()),
  reasoning: z.string(),
});

type QueryAnalysis = z.infer<typeof analysisSchema>;

@Injectable()
export class TechLeadService {
  private readonly logger = new Logger(TechLeadService.name);
  private readonly llm: ChatOpenAI;

  constructor(private readonly configService: ConfigService) {
    this.llm = new ChatOpenAI({
      openAIApiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
      modelName: this.configService.get<string>('OPENAI_CHAT_MODEL', 'gpt-4o'),
      temperature: 0,
      maxTokens: 1024,
      timeout: Number(this.configService.get('LLM_TIMEOUT', '30000')),
    });
  }

  /**
   * Heurística rápida: si la query toca 3+ dominios técnicos distintos,
   * es compleja sin necesidad de preguntarle al LLM.
   */
  private detectMultipleDomains(query: string): string[] {
    // Patrones ESTRICTOS: solo matchean cuando la query PREGUNTA sobre el dominio,
    // no cuando lo menciona como contexto. Requieren términos más específicos.
    const domainPatterns: Record<string, RegExp[]> = {
      'vision/ocr/pdf': [/gpt.?4o.*vision/i, /ocr/i, /pdf.*multipágina/i, /detail.*(low|high)/i, /base64.*pdf/i],
      'multi-agente': [/patrón.*agente/i, /diseño.*agente/i, /arquitectura.*agente/i, /orquestador/i, /handoff/i],
      'validación/schema': [/pydantic/i, /structured.?output/i, /response_format/i, /model_validate/i, /json.?schema/i],
      'observabilidad': [/langfuse/i, /observabilidad/i, /trac(e|ing).*span/i, /@observe/i],
      'riesgos/producción': [/riesgo.*producción/i, /falla.*producción/i, /risk.*production/i],
    };

    const detected: string[] = [];
    for (const [domain, patterns] of Object.entries(domainPatterns)) {
      if (patterns.some((p) => p.test(query))) {
        detected.push(domain);
      }
    }
    return detected;
  }

  async analyze(query: string): Promise<QueryAnalysis> {
    // Fast path: heurística de dominios
    const domains = this.detectMultipleDomains(query);
    if (domains.length >= 3) {
      logPipelineStep(this.logger, 'TECH_LEAD:HEURISTIC_COMPLEX', {
        domains,
        count: domains.length,
      });
      // Usar LLM solo para descomponer, no para decidir complejidad
      return this.decomposeQuery(query, domains);
    }

    const sanitized = sanitizeQueryForPrompt(query);

    const prompt = `Sos un Tech Lead que clasifica consultas técnicas. Decidí si una consulta es SIMPLE o COMPLEJA.

DEFINICIONES:
- SIMPLE: la consulta se responde mejor con UN SOLO retrieval porque todas las preguntas requieren la MISMA documentación/knowledge base.
  Ejemplos SIMPLES:
  - "¿Cómo proceso PDFs con GPT-4o? ¿Límites? ¿Pricing? ¿Detail level?" → TODO necesita docs de OpenAI Vision = SIMPLE
  - "¿Cómo uso Langfuse? ¿Traces? ¿Spans? ¿@observe?" → TODO necesita docs de Langfuse = SIMPLE
  - "¿Structured Outputs o Pydantic? ¿Limitaciones?" → TODO necesita docs de OpenAI + Pydantic = SIMPLE

- COMPLEJA: la consulta necesita MÚLTIPLES retrievals porque las preguntas requieren DOCUMENTACIÓN DISTINTA.
  Ejemplos COMPLEJOS:
  - "¿Qué patrón multi-agente usar + cómo procesar PDFs + cómo validar output?" → necesita docs de multi-agente + OpenAI Vision + Pydantic = COMPLEJA
  - "Diseñar sistema completo: OCR + agentes + validación + observabilidad + riesgos" → 4+ dominios técnicos distintos = COMPLEJA

CLAVE: NO confundir "mismo proyecto" con "mismo dominio técnico". Un proyecto puede tocar múltiples dominios técnicos que requieren knowledge bases distintas. Si la query menciona 3+ tecnologías/conceptos distintos (ej: Vision + multi-agente + Pydantic + Langfuse), es COMPLEJA.

Si es COMPLEJA, descomponé en sub-queries (máx 4). Cada sub-query debe:
1. Incluir el contexto del proyecto
2. Cubrir UN solo dominio técnico
3. Agrupar todas las preguntas del mismo dominio

CONSULTA:
<user_query>${sanitized}</user_query>

Respondé SOLO con JSON:
{
  "complexity": "simple" | "complex",
  "sub_queries": [],
  "reasoning": "por qué"
}

Si es SIMPLE, "sub_queries" DEBE estar vacío [].`;

    try {
      const response = await this.llm.invoke(prompt);
      const text = typeof response.content === 'string' ? response.content : '';
      const result = safeParseLlmJson(text, analysisSchema);

      if (!result) {
        this.logger.warn('Tech Lead analysis failed to parse, defaulting to simple');
        return { complexity: 'simple', sub_queries: [], reasoning: 'Parse error, defaulting' };
      }

      // Safety: si dice complex pero no hay sub-queries, tratar como simple
      if (result.complexity === 'complex' && result.sub_queries.length <= 1) {
        result.complexity = 'simple';
        result.sub_queries = [];
      }

      logPipelineStep(this.logger, 'TECH_LEAD:ANALYSIS', {
        complexity: result.complexity,
        subQueries: result.sub_queries.length,
        reasoning: result.reasoning,
      });

      return result;
    } catch (error) {
      this.logger.warn(`Tech Lead analysis failed: ${String(error)}, defaulting to simple`);
      return { complexity: 'simple', sub_queries: [], reasoning: 'Error, defaulting' };
    }
  }

  /**
   * Le pide al LLM que descomponga una query compleja en sub-queries.
   * La decisión de complejidad ya fue tomada por la heurística.
   */
  private async decomposeQuery(query: string, domains: string[]): Promise<QueryAnalysis> {
    const sanitized = sanitizeQueryForPrompt(query);
    const prompt = `Descomponé esta consulta técnica en sub-queries focalizadas. La consulta toca estos dominios: ${domains.join(', ')}.

REGLAS:
- Una sub-query por dominio técnico
- Cada sub-query debe incluir el contexto del proyecto
- Cada sub-query debe ser autocontenida
- Máximo ${Math.min(domains.length, 4)} sub-queries
- Agrupá dominios relacionados si hay más de 4

CONSULTA:
<user_query>${sanitized}</user_query>

Respondé SOLO con JSON:
{
  "sub_queries": ["sub-query 1", "sub-query 2", ...]
}`;

    try {
      const response = await this.llm.invoke(prompt);
      const text = typeof response.content === 'string' ? response.content : '';
      const schema = z.object({ sub_queries: z.array(z.string()) });
      const result = safeParseLlmJson(text, schema);

      if (!result || result.sub_queries.length <= 1) {
        return { complexity: 'simple', sub_queries: [], reasoning: 'Decomposition failed' };
      }

      return {
        complexity: 'complex',
        sub_queries: result.sub_queries.slice(0, 4),
        reasoning: `Heurística detectó ${domains.length} dominios: ${domains.join(', ')}`,
      };
    } catch {
      return { complexity: 'simple', sub_queries: [], reasoning: 'Decomposition error' };
    }
  }

  async synthesize(
    originalQuery: string,
    responses: QueryResponse[],
  ): Promise<RagDecisionOutput> {
    const allCitations: Citation[] = [];
    const allOfficialSources: OfficialSource[] = [];
    const allTradeoffs: string[] = [];
    const allExamples: string[] = [];

    for (const response of responses) {
      allCitations.push(...response.citations);
      allOfficialSources.push(...response.official_sources);
      allTradeoffs.push(...response.tradeoffs);
      allExamples.push(...response.examples);
    }

    const uniqueCitations = this.deduplicateByText(allCitations);
    const uniqueOfficialSources = this.deduplicateByText(allOfficialSources);

    // Limitar tradeoffs y examples para evitar verbosidad
    const uniqueTradeoffs = [...new Set(allTradeoffs)].slice(0, 5);
    const uniqueExamples = [...new Set(allExamples)].slice(0, 4);

    const decisionsText = responses
      .map((r, i) => `[Decisión ${i + 1}]: ${r.decision}`)
      .join('\n\n');

    const reasoningsText = responses
      .map((r, i) => `[Razonamiento ${i + 1}]: ${r.reasoning}`)
      .join('\n\n');

    const sanitized = sanitizeQueryForPrompt(originalQuery);
    const prompt = `Sos un Tech Lead senior que sintetiza respuestas de un AI Architect.

TAREA:
1. UNIFICAR las decisiones parciales en UNA decisión coherente que cubra TODOS los aspectos de la consulta original
2. DETECTAR y RESOLVER inconsistencias entre respuestas
3. SINTETIZAR — no repetir ni concatenar

CONSULTA ORIGINAL:
<user_query>${sanitized}</user_query>

DECISIONES DEL ARCHITECT:
${decisionsText}

RAZONAMIENTOS DEL ARCHITECT:
${reasoningsText}

REGLAS:
- La decisión unificada DEBE responder CADA punto de la consulta original
- Si dos decisiones se contradicen, elegí la que tiene mejor fundamento y explicá por qué
- NO agregues información que no esté en las decisiones del Architect
- Sé conciso: máximo 3-4 oraciones para decision, máximo 4-5 oraciones para reasoning

Respondé SOLO con JSON:
{
  "decision": "decisión unificada",
  "reasoning": "razonamiento sintetizado",
  "inconsistencies_found": "descripción o 'ninguna'"
}`;

    try {
      const response = await this.llm.invoke(prompt);
      const text = typeof response.content === 'string' ? response.content : '';

      const synthesisSchema = z.object({
        decision: z.string(),
        reasoning: z.string(),
        inconsistencies_found: z.string().default('ninguna'),
      });

      const result = safeParseLlmJson(text, synthesisSchema);

      if (!result) {
        return this.fallbackSynthesis(responses, uniqueCitations, uniqueOfficialSources, uniqueTradeoffs, uniqueExamples);
      }

      logPipelineStep(this.logger, 'TECH_LEAD:SYNTHESIS', {
        inconsistencies: result.inconsistencies_found,
        citationsCount: uniqueCitations.length,
        officialSourcesCount: uniqueOfficialSources.length,
      });

      // Merge ADR fields from sub-responses
      const merged = this.mergeAdrFields(responses);

      return {
        citations: uniqueCitations,
        official_sources: uniqueOfficialSources,
        decision: result.decision,
        reasoning: result.reasoning,
        tradeoffs: uniqueTradeoffs,
        examples: uniqueExamples,
        ...merged,
      };
    } catch (error) {
      this.logger.warn(`Tech Lead synthesis failed: ${String(error)}`);
      return this.fallbackSynthesis(responses, uniqueCitations, uniqueOfficialSources, uniqueTradeoffs, uniqueExamples);
    }
  }

  private fallbackSynthesis(
    responses: QueryResponse[],
    citations: Citation[],
    officialSources: OfficialSource[],
    tradeoffs: string[],
    examples: string[],
  ): RagDecisionOutput {
    const merged = this.mergeAdrFields(responses);
    return {
      citations,
      official_sources: officialSources,
      decision: responses.map((r, i) => `[${i + 1}] ${r.decision}`).join(' | '),
      reasoning: responses.map((r, i) => `[${i + 1}] ${r.reasoning}`).join(' | '),
      tradeoffs,
      examples,
      ...merged,
    };
  }

  private mergeAdrFields(responses: QueryResponse[]): Pick<RagDecisionOutput,
    'stack_decisions' | 'modules' | 'next_steps' | 'open_questions' |
    'context' | 'pydantic_schema' | 'langfuse_observability' |
    'estructura_proyecto' | 'env_vars' | 'error_handling' | 'casos_de_prueba'
  > {
    const mergedStackDecisions: Record<string, string> = {};
    const mergedModules: ModuleSpec[] = [];
    const seenModuleArchivos = new Set<string>();
    const mergedNextSteps: string[] = [];
    const mergedOpenQuestions: string[] = [];
    const mergedEnvVars: Record<string, string> = {};
    const mergedErrorHandling: Record<string, string> = {};
    const mergedDirEntries: string[] = [];
    const mergedTestCases: { par: number; tipo: string; archivos: string[]; cambios_esperados: string[] }[] = [];

    let context: string | undefined;
    let pydanticSchema: RagDecisionOutput['pydantic_schema'];
    let langfuseObs: RagDecisionOutput['langfuse_observability'];

    for (const r of responses) {
      Object.assign(mergedStackDecisions, r.stack_decisions ?? {});

      for (const m of r.modules ?? []) {
        if (!seenModuleArchivos.has(m.archivo)) {
          seenModuleArchivos.add(m.archivo);
          mergedModules.push(m);
        }
      }

      mergedNextSteps.push(...(r.next_steps ?? []));
      mergedOpenQuestions.push(...(r.open_questions ?? []));
      Object.assign(mergedEnvVars, r.env_vars ?? {});
      Object.assign(mergedErrorHandling, r.error_handling ?? {});

      if (r.context && !context) context = r.context;
      if (r.pydantic_schema && !pydanticSchema) pydanticSchema = r.pydantic_schema;
      if (r.langfuse_observability && !langfuseObs) langfuseObs = r.langfuse_observability;

      if (r.estructura_proyecto?.directorios) {
        mergedDirEntries.push(...r.estructura_proyecto.directorios);
      }
      if (r.casos_de_prueba) {
        mergedTestCases.push(...r.casos_de_prueba);
      }
    }

    return {
      stack_decisions: mergedStackDecisions,
      modules: mergedModules,
      next_steps: [...new Set(mergedNextSteps)],
      open_questions: [...new Set(mergedOpenQuestions)],
      ...(context ? { context } : {}),
      ...(pydanticSchema ? { pydantic_schema: pydanticSchema } : {}),
      ...(langfuseObs ? { langfuse_observability: langfuseObs } : {}),
      ...(mergedDirEntries.length > 0
        ? { estructura_proyecto: { directorios: [...new Set(mergedDirEntries)] } }
        : {}),
      ...(Object.keys(mergedEnvVars).length > 0 ? { env_vars: mergedEnvVars } : {}),
      ...(Object.keys(mergedErrorHandling).length > 0 ? { error_handling: mergedErrorHandling } : {}),
      ...(mergedTestCases.length > 0 ? { casos_de_prueba: mergedTestCases } : {}),
    };
  }

  private deduplicateByText<T extends { text: string }>(items: T[]): T[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      const normalized = item.text.toLowerCase().trim();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }
}
