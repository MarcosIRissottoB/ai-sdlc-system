import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { logPipelineStep } from '../../common/utils/logger.util';
import { safeParseLlmJson } from '../../common/utils/llm-json.util';
import { sanitizeChunkForPrompt } from '../../common/utils/prompt-sanitizer.util';

const enrichmentArraySchema = z.array(z.object({
  summary: z.string().optional().default(''),
  keywords: z.array(z.unknown()).optional().default([]),
  level: z.string().optional().default('intermedio'),
  chunkType: z.string().optional().default('concepto'),
}));

export interface ChunkEnrichment {
  summary: string;
  keywords: string[];
  level: 'básico' | 'intermedio' | 'avanzado';
  chunkType: 'concepto' | 'ejemplo' | 'código' | 'arquitectura' | 'referencia';
}

interface RawEnrichment {
  summary?: string;
  keywords?: unknown[];
  level?: string;
  chunkType?: string;
}

@Injectable()
export class ChunkEnricherService {
  private readonly logger = new Logger(ChunkEnricherService.name);
  private readonly llm: ChatOpenAI;

  constructor(private readonly configService: ConfigService) {
    this.llm = new ChatOpenAI({
      openAIApiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
      modelName: this.configService.get<string>('OPENAI_CHAT_MODEL', 'gpt-4o'),
      temperature: 0,
      maxTokens: 512,
      timeout: Number(this.configService.get('LLM_TIMEOUT', '30000')),
    });
  }

  /**
   * Enriquece un batch de chunks en una sola llamada al LLM para minimizar costos.
   * Devuelve un array con el mismo orden que el input.
   */
  async enrichBatch(chunks: string[]): Promise<ChunkEnrichment[]> {
    if (chunks.length === 0) return [];

    logPipelineStep(this.logger, 'ENRICHMENT:START', { chunks: chunks.length });

    const batchSize = Number(this.configService.get('ENRICHER_BATCH_SIZE', '5'));
    const results: ChunkEnrichment[] = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const enrichments = await this.enrichBatchInternal(batch);
      results.push(...enrichments);
    }

    logPipelineStep(this.logger, 'ENRICHMENT:COMPLETE', { enriched: results.length });
    return results;
  }

  private async enrichBatchInternal(chunks: string[]): Promise<ChunkEnrichment[]> {
    const chunksText = chunks
      .map(
        (c, i) => {
          const truncate = Number(this.configService.get('ENRICHER_TRUNCATE_CHARS', '600'));
          return `[CHUNK_${i}]:\n${sanitizeChunkForPrompt(c, truncate)}`;
        },
      )
      .join('\n\n---\n\n');

    const prompt = `Analyze the following text chunks and for each one provide:
- summary: 1-2 sentence summary in the same language as the chunk
- keywords: array of 3-7 key terms
- level: one of "básico", "intermedio", "avanzado"
- chunkType: one of "concepto", "ejemplo", "código", "arquitectura", "referencia"

Return ONLY a valid JSON array (one object per chunk, same order):
[
  {"summary": "...", "keywords": ["k1","k2"], "level": "básico", "chunkType": "concepto"},
  ...
]

Chunks:
${chunksText}`;

    try {
      const response = await this.llm.invoke(prompt);
      const text = typeof response.content === 'string' ? response.content : '';
      const parsed = safeParseLlmJson(text, enrichmentArraySchema);
      if (!parsed) return chunks.map(() => this.defaultEnrichment());

      return chunks.map((_, i) => {
        const raw = parsed[i] as RawEnrichment | undefined;
        if (!raw) return this.defaultEnrichment();
        return this.parseEnrichment(raw);
      });
    } catch (error) {
      this.logger.warn(`Enrichment batch failed: ${String(error)}`);
      return chunks.map(() => this.defaultEnrichment());
    }
  }

  private parseEnrichment(raw: RawEnrichment): ChunkEnrichment {
    const validLevels = ['básico', 'intermedio', 'avanzado'] as const;
    const validTypes = ['concepto', 'ejemplo', 'código', 'arquitectura', 'referencia'] as const;

    return {
      summary: typeof raw.summary === 'string' ? raw.summary : '',
      keywords: Array.isArray(raw.keywords)
        ? raw.keywords.filter((k): k is string => typeof k === 'string')
        : [],
      level: validLevels.includes(raw.level as (typeof validLevels)[number])
        ? (raw.level as ChunkEnrichment['level'])
        : 'intermedio',
      chunkType: validTypes.includes(raw.chunkType as (typeof validTypes)[number])
        ? (raw.chunkType as ChunkEnrichment['chunkType'])
        : 'concepto',
    };
  }

  private defaultEnrichment(): ChunkEnrichment {
    return {
      summary: '',
      keywords: [],
      level: 'intermedio',
      chunkType: 'concepto',
    };
  }
}
