import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { RetrievedChunk, BuiltContext, GroupedContext } from '../../common/types/rag.types';
import { logPipelineStep } from '../../common/utils/logger.util';
import { safeParseLlmJson } from '../../common/utils/llm-json.util';
import { sanitizeQueryForPrompt } from '../../common/utils/query-sanitizer.util';
import { sanitizeChunkForPrompt } from '../../common/utils/prompt-sanitizer.util';

const compressedChunksSchema = z.array(z.string());

const topicClassificationSchema = z.object({
  topics: z.array(z.object({
    topic: z.string(),
    chunkIds: z.array(z.string()),
  })),
});

const contradictionSchema = z.object({
  hasContradictions: z.boolean(),
  details: z.string().default(''),
});

interface TopicClassification {
  topic: string;
  chunkIds: string[];
}

@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger(ContextBuilderService.name);
  private readonly llm: ChatOpenAI;

  constructor(private readonly configService: ConfigService) {
    this.llm = new ChatOpenAI({
      openAIApiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
      modelName: this.configService.get<string>('OPENAI_CHAT_MODEL', 'gpt-4o'),
      temperature: 0,
      timeout: Number(this.configService.get('LLM_TIMEOUT', '30000')),
    });
  }

  async build(
    query: string,
    chunks: RetrievedChunk[],
    compress = false,
  ): Promise<BuiltContext> {
    logPipelineStep(this.logger, 'CONTEXT_BUILDER:START', {
      query,
      chunksCount: chunks.length,
      compress,
    });

    if (chunks.length === 0) {
      return {
        groups: [],
        totalChunks: 0,
        insufficientInformation: true,
      };
    }

    const sorted = this.sortByRelevance(chunks);

    // Context compression: resume cada chunk antes de agrupar
    // Reduce tokens enviados al LLM de reasoning y filtra ruido
    const processedChunks = compress ? await this.compressChunks(query, sorted) : sorted;

    const groups = await this.groupByTopic(query, processedChunks);
    const groupsWithContradictions = await this.detectContradictions(groups);

    const result: BuiltContext = {
      groups: groupsWithContradictions,
      totalChunks: chunks.length,
      insufficientInformation: chunks.length < 2,
    };

    logPipelineStep(this.logger, 'CONTEXT_BUILDER:COMPLETE', {
      groups: groupsWithContradictions.length,
      insufficient: result.insufficientInformation,
    });

    return result;
  }

  /**
   * Comprime cada chunk a 1-2 oraciones relevantes a la query.
   * Reduce el contexto enviado al LLM de reasoning hasta en un 70%.
   */
  private async compressChunks(
    query: string,
    chunks: RetrievedChunk[],
  ): Promise<RetrievedChunk[]> {
    const chunksText = chunks
      .map((c, i) => `[CHUNK_${i}] ${sanitizeChunkForPrompt(c.content, 800)}`)
      .join('\n\n---\n\n');

    const sanitized = sanitizeQueryForPrompt(query);
    const prompt = `Given the query:
<user_query>${sanitized}</user_query>

For each chunk below, extract ONLY the sentences most relevant to the query (1-3 sentences max).
If a chunk has no relevant content, return an empty string for it.

Return ONLY a valid JSON array of strings (same order, same count as input):
["compressed chunk 0", "compressed chunk 1", ...]

Chunks:
${chunksText}`;

    try {
      const response = await this.llm.invoke(prompt);
      const text = typeof response.content === 'string' ? response.content : '';
      const compressed = safeParseLlmJson(text, compressedChunksSchema);
      if (!compressed) return chunks;

      return chunks
        .map((chunk, i) => {
          const compressedContent = compressed[i];
          if (!compressedContent || compressedContent.trim() === '') {
            return null;
          }
          return { ...chunk, content: compressedContent };
        })
        .filter((c): c is RetrievedChunk => c !== null);
    } catch {
      this.logger.warn('Context compression failed, using original chunks');
      return chunks;
    }
  }

  private sortByRelevance(chunks: RetrievedChunk[]): RetrievedChunk[] {
    return [...chunks].sort((a, b) => b.score - a.score);
  }

  private async groupByTopic(
    query: string,
    chunks: RetrievedChunk[],
  ): Promise<GroupedContext[]> {
    const chunksText = chunks
      .map((c, i) => `[CHUNK_${i}] (source: ${c.metadata.source})\n${sanitizeChunkForPrompt(c.content)}`)
      .join('\n\n---\n\n');

    const sanitized = sanitizeQueryForPrompt(query);
    const prompt = `Dado el query:
<user_query>${sanitized}</user_query>

Tenés los siguientes fragmentos de documentos. Agrupalos por tema/concepto.
Devolvé ÚNICAMENTE un JSON con este formato:
{
  "topics": [
    {"topic": "nombre del tema", "chunkIds": ["CHUNK_0", "CHUNK_2"]},
    {"topic": "otro tema", "chunkIds": ["CHUNK_1"]}
  ]
}

FRAGMENTOS:
${chunksText}`;

    try {
      const response = await this.llm.invoke(prompt);
      const text = typeof response.content === 'string' ? response.content : '';
      const parsed = safeParseLlmJson(text, topicClassificationSchema);
      if (!parsed) throw new Error('Failed to parse topic classification');

      return parsed.topics.map((t) => {
        const topicChunks = t.chunkIds
          .map((id) => {
            const index = parseInt(id.replace('CHUNK_', ''), 10);
            return chunks[index];
          })
          .filter((c): c is RetrievedChunk => c !== undefined);

        return {
          topic: t.topic,
          chunks: topicChunks,
          hasContradictions: false,
        };
      });
    } catch {
      return [
        {
          topic: 'General',
          chunks,
          hasContradictions: false,
        },
      ];
    }
  }

  private async detectContradictions(groups: GroupedContext[]): Promise<GroupedContext[]> {
    return Promise.all(
      groups.map(async (group) => {
        if (group.chunks.length < 2) {
          return group;
        }

        const chunksText = group.chunks
          .map((c) => `[${c.metadata.source}]: "${sanitizeChunkForPrompt(c.content)}"`)

          .join('\n\n');

        const prompt = `Analizá los siguientes fragmentos sobre el tema "${group.topic}".
¿Alguno de estos fragmentos contradice a otro? Considerá contradicción real SOLO cuando dos fragmentos afirmen cosas opuestas o incompatibles sobre el mismo hecho.
Respondé ÚNICAMENTE con JSON:
{
  "hasContradictions": boolean,
  "details": "descripción de la contradicción si existe, sino cadena vacía"
}

FRAGMENTOS:
${chunksText}`;

        try {
          const response = await this.llm.invoke(prompt);
          const text = typeof response.content === 'string' ? response.content : '';
          const parsed = safeParseLlmJson(text, contradictionSchema);
          if (!parsed) return group;

          return {
            ...group,
            hasContradictions: parsed.hasContradictions,
            contradictionDetails: parsed.details || undefined,
          };
        } catch {
          return group;
        }
      }),
    );
  }
}
