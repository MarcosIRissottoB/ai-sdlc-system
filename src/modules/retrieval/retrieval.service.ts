import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { VectorStoreService } from '../../vector-store/vector-store.service';
import { PrismaService } from '../../database/prisma.service';
import { RetrievedChunk, RetrievalOptions, ChunkMetadata } from '../../common/types/rag.types';
import { logPipelineStep } from '../../common/utils/logger.util';
import { safeParseLlmJson } from '../../common/utils/llm-json.util';
import { sanitizeQueryForPrompt } from '../../common/utils/query-sanitizer.util';
import { sanitizeChunkForPrompt } from '../../common/utils/prompt-sanitizer.util';

const queryVariantsSchema = z.array(z.string());
const rerankScoresSchema = z.array(z.object({ id: z.string(), score: z.number() }));

interface ChunkRow {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  rank: string;
}

interface CachedEmbedding {
  vector: number[];
  timestamp: number;
}

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);
  private readonly embeddings: OpenAIEmbeddings;
  private readonly llm: ChatOpenAI;
  private readonly embeddingCache = new Map<string, CachedEmbedding>();
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutos

  constructor(
    private readonly vectorStore: VectorStoreService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
      modelName: this.configService.get<string>(
        'OPENAI_EMBEDDING_MODEL',
        'text-embedding-3-small',
      ),
    });

    this.llm = new ChatOpenAI({
      openAIApiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
      modelName: this.configService.get<string>('OPENAI_CHAT_MODEL', 'gpt-4o'),
      temperature: 0,
      timeout: Number(this.configService.get('LLM_TIMEOUT', '30000')),
    });
  }

  async retrieve(query: string, options: RetrievalOptions = {}): Promise<RetrievedChunk[]> {
    const {
      topK = Number(this.configService.get('RETRIEVAL_TOP_K', '15')),
      scoreThreshold = Number(this.configService.get('RETRIEVAL_SCORE_THRESHOLD', '0.3')),
      filter,
      domain,
      useHybrid = true,
      useMultiQuery = true,
      useReranking = true,
    } = options;

    logPipelineStep(this.logger, 'RETRIEVAL:START', {
      query,
      topK,
      scoreThreshold,
      useHybrid,
      useMultiQuery,
      useReranking,
    });

    // Paso 1: Multi-query expansion
    const queries = useMultiQuery ? await this.expandQuery(query) : [query];
    logPipelineStep(this.logger, 'RETRIEVAL:MULTI_QUERY', { variants: queries.length });

    // Paso 2: Vector search para cada variante de query (con caché de embeddings)
    const vectorLists: RetrievedChunk[][] = [];
    for (const q of queries) {
      const embedding = await this.getCachedEmbedding(q);
      const results = await this.vectorStore.query(
        { queryEmbedding: embedding, topK, filter },
        domain,
      );
      const filtered = results.filter((c) => c.score >= scoreThreshold);
      vectorLists.push(filtered);
    }

    // Paso 3: Keyword search (PostgreSQL FTS / BM25)
    const keywordResults = useHybrid ? await this.keywordSearch(query, topK) : [];
    logPipelineStep(this.logger, 'RETRIEVAL:KEYWORD_SEARCH', {
      keywordHits: keywordResults.length,
    });

    // Paso 4: Reciprocal Rank Fusion — unifica todos los rankings
    const allLists = [...vectorLists, ...(useHybrid ? [keywordResults] : [])];
    const fusedResults = this.reciprocalRankFusion(allLists);
    logPipelineStep(this.logger, 'RETRIEVAL:RRF', { uniqueChunks: fusedResults.length });

    // Paso 5: Re-ranking con LLM sobre los top candidatos
    const candidates = fusedResults.slice(0, topK * 2);
    const finalResults =
      useReranking && candidates.length > 1
        ? await this.rerank(query, candidates, topK)
        : candidates.slice(0, topK);

    logPipelineStep(this.logger, 'RETRIEVAL:COMPLETE', {
      finalChunks: finalResults.length,
    });

    return finalResults;
  }

  /**
   * Usa el LLM para generar variantes de la query original.
   * Mejora el recall al capturar más formas de expresar la misma intención.
   */
  private async expandQuery(query: string): Promise<string[]> {
    const sanitized = sanitizeQueryForPrompt(query);
    const prompt = `Generate 3 different search query variants to improve document retrieval coverage.
Each variant should express the same intent but using different keywords or phrasing.
Return ONLY a valid JSON array of strings with no explanation or extra text.

Original query:
<user_query>${sanitized}</user_query>

JSON array:`;

    try {
      const response = await this.llm.invoke(prompt);
      const text = typeof response.content === 'string' ? response.content : '';
      const variants = safeParseLlmJson(text, queryVariantsSchema);
      if (!variants) return [query];

      return [query, ...variants.slice(0, 3)];
    } catch {
      this.logger.warn('Multi-query expansion failed, using original query');
      return [query];
    }
  }

  /**
   * BM25 aproximado via PostgreSQL full-text search (ts_rank + plainto_tsquery).
   * Usa config 'simple' para soportar contenido en español e inglés sin stemming.
   */
  private async keywordSearch(query: string, topK: number): Promise<RetrievedChunk[]> {
    try {
      const rows = await this.prisma.$queryRaw<ChunkRow[]>`
        SELECT
          c.id,
          c.content,
          c.metadata,
          ts_rank(
            to_tsvector('simple', c.content),
            plainto_tsquery('simple', ${query})
          )::text AS rank
        FROM chunks c
        WHERE to_tsvector('simple', c.content) @@ plainto_tsquery('simple', ${query})
        ORDER BY rank DESC
        LIMIT ${topK}
      `;

      return rows.map((row) => ({
        id: row.id,
        content: row.content,
        score: parseFloat(row.rank),
        metadata: row.metadata as ChunkMetadata,
      }));
    } catch (error) {
      this.logger.warn(`Keyword search failed: ${String(error)}`);
      return [];
    }
  }

  /**
   * Reciprocal Rank Fusion (RRF): combina múltiples rankings en uno solo.
   * score(d) = Σ 1 / (k + rank_i(d)) para cada lista i donde d aparece.
   * k=60 es el valor estándar de la literatura.
   */
  private reciprocalRankFusion(lists: RetrievedChunk[][], k: number = 60): RetrievedChunk[] {
    const scores = new Map<string, number>();
    const chunkMap = new Map<string, RetrievedChunk>();

    for (const list of lists) {
      list.forEach((chunk, rank) => {
        const rrfScore = 1 / (k + rank + 1);
        scores.set(chunk.id, (scores.get(chunk.id) ?? 0) + rrfScore);
        if (!chunkMap.has(chunk.id)) {
          chunkMap.set(chunk.id, chunk);
        }
      });
    }

    return Array.from(chunkMap.values())
      .map((chunk) => ({ ...chunk, score: scores.get(chunk.id) ?? 0 }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Re-ranking con LLM: puntúa la relevancia real de cada chunk contra la query.
   * Mitiga falsos positivos del retrieval semántico y del keyword search.
   * Se aplica sobre los top (topK * 2) candidatos para no encarcer el proceso.
   */
  private async rerank(
    query: string,
    chunks: RetrievedChunk[],
    topK: number,
  ): Promise<RetrievedChunk[]> {
    if (chunks.length <= 1) return chunks.slice(0, topK);

    const docsText = chunks
      .map((c, i) => `[DOC_${i}]\n${sanitizeChunkForPrompt(c.content, 500)}`)
      .join('\n\n---\n\n');

    const sanitized = sanitizeQueryForPrompt(query);
    const prompt = `Rate the relevance of each document to the query on a scale from 0 to 10.
A score of 10 means perfectly relevant. A score of 0 means completely irrelevant.

Query:
<user_query>${sanitized}</user_query>

Documents:
${docsText}

Return ONLY a valid JSON array with ALL documents rated: [{"id": "DOC_0", "score": 8}, {"id": "DOC_1", "score": 3}, ...]
No explanation, only the JSON array.`;

    try {
      const response = await this.llm.invoke(prompt);
      const text = typeof response.content === 'string' ? response.content : '';
      const scores = safeParseLlmJson(text, rerankScoresSchema);
      if (!scores) return chunks.slice(0, topK);

      const scoreMap = new Map<string, number>();
      for (const entry of scores) {
        scoreMap.set(entry.id, entry.score);
      }

      logPipelineStep(this.logger, 'RETRIEVAL:RERANK', { scored: scoreMap.size });

      return chunks
        .map((chunk, i) => ({
          ...chunk,
          score: scoreMap.get(`DOC_${i}`) ?? chunk.score,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    } catch {
      this.logger.warn('Re-ranking failed, returning original order');
      return chunks.slice(0, topK);
    }
  }

  /**
   * Obtiene embedding cacheado o lo genera y cachea.
   * TTL de 5 minutos — evita llamadas duplicadas a OpenAI para la misma query.
   */
  private async getCachedEmbedding(query: string): Promise<number[]> {
    const key = query.toLowerCase().trim();
    const cached = this.embeddingCache.get(key);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.cacheTtlMs) {
      logPipelineStep(this.logger, 'RETRIEVAL:EMBEDDING_CACHE_HIT', { query: key.slice(0, 50) });
      return cached.vector;
    }

    const vector = await this.embeddings.embedQuery(query);
    this.embeddingCache.set(key, { vector, timestamp: now });

    // Limpiar entradas expiradas periódicamente
    if (this.embeddingCache.size > 100) {
      for (const [k, v] of this.embeddingCache) {
        if (now - v.timestamp > this.cacheTtlMs) this.embeddingCache.delete(k);
      }
    }

    return vector;
  }
}
