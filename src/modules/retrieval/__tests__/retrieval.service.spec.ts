import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RetrievalService } from '../retrieval.service';
import { VectorStoreService } from '../../../vector-store/vector-store.service';
import { PrismaService } from '../../../database/prisma.service';
import { RetrievedChunk } from '../../../common/types/rag.types';

// Mock LangChain
const mockLlmInvoke = jest.fn();
const mockEmbedQuery = jest.fn();
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: mockLlmInvoke,
  })),
  OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedQuery: mockEmbedQuery,
  })),
}));

const chunk1: RetrievedChunk = {
  id: 'c1',
  content: 'Vector databases store embeddings for semantic search',
  score: 0.92,
  metadata: { source: 'vectors.md', title: 'Vectors', chunkIndex: 0, documentId: 'd1', contentType: 'text/plain' },
};

const chunk2: RetrievedChunk = {
  id: 'c2',
  content: 'BM25 is a keyword-based ranking function',
  score: 0.85,
  metadata: { source: 'search.md', title: 'Search', chunkIndex: 0, documentId: 'd2', contentType: 'text/plain' },
};

describe('RetrievalService', () => {
  let service: RetrievalService;

  const mockVectorStore = {
    query: jest.fn().mockResolvedValue([chunk1, chunk2]),
  };

  const mockPrisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('sk-test'),
    get: jest.fn().mockImplementation((_key: string, defaultValue?: string) => defaultValue),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEmbedQuery.mockResolvedValue([0.1, 0.2, 0.3]);
    mockVectorStore.query.mockResolvedValue([chunk1, chunk2]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetrievalService,
        { provide: VectorStoreService, useValue: mockVectorStore },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<RetrievalService>(RetrievalService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should retrieve chunks with default options', async () => {
    mockLlmInvoke.mockResolvedValue({ content: '["variant 1", "variant 2"]' });

    const results = await service.retrieve('semantic search', {
      useReranking: false,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(mockEmbedQuery).toHaveBeenCalled();
  });

  it('should work without multi-query expansion', async () => {
    const results = await service.retrieve('test query', {
      useMultiQuery: false,
      useHybrid: false,
      useReranking: false,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(mockLlmInvoke).not.toHaveBeenCalled();
  });

  it('should filter chunks below score threshold', async () => {
    mockVectorStore.query.mockResolvedValue([
      { ...chunk1, score: 0.1 },
      { ...chunk2, score: 0.05 },
    ]);

    const results = await service.retrieve('test', {
      useMultiQuery: false,
      useHybrid: false,
      useReranking: false,
      scoreThreshold: 0.3,
    });

    expect(results).toHaveLength(0);
  });

  it('should handle multi-query expansion failure gracefully', async () => {
    mockLlmInvoke.mockRejectedValue(new Error('LLM timeout'));

    const results = await service.retrieve('test', {
      useMultiQuery: true,
      useHybrid: false,
      useReranking: false,
    });

    // Should fall back to original query
    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle reranking failure gracefully', async () => {
    mockLlmInvoke
      .mockResolvedValueOnce({ content: '["variant"]' }) // multi-query
      .mockRejectedValueOnce(new Error('rerank failed')); // rerank

    const results = await service.retrieve('test', {
      useMultiQuery: true,
      useHybrid: false,
      useReranking: true,
    });

    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle keyword search failure gracefully', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('DB error'));

    const results = await service.retrieve('test', {
      useMultiQuery: false,
      useHybrid: true,
      useReranking: false,
    });

    // Should still return vector results
    expect(results.length).toBeGreaterThan(0);
  });

  it('should return empty array when no chunks match', async () => {
    mockVectorStore.query.mockResolvedValue([]);

    const results = await service.retrieve('nonexistent topic', {
      useMultiQuery: false,
      useHybrid: false,
      useReranking: false,
    });

    expect(results).toHaveLength(0);
  });

  it('should respect topK limit', async () => {
    const manyChunks = Array.from({ length: 10 }, (_, i) => ({
      ...chunk1,
      id: `c${i}`,
      score: 0.9 - i * 0.05,
    }));
    mockVectorStore.query.mockResolvedValue(manyChunks);

    const results = await service.retrieve('test', {
      topK: 3,
      useMultiQuery: false,
      useHybrid: false,
      useReranking: false,
    });

    expect(results.length).toBeLessThanOrEqual(3);
  });
});
