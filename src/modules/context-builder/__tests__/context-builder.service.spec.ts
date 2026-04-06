import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ContextBuilderService } from '../context-builder.service';
import { RetrievedChunk } from '../../../common/types/rag.types';

const mockLlmInvoke = jest.fn();
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: mockLlmInvoke,
  })),
}));

const makeChunk = (id: string, content: string, source: string, score: number): RetrievedChunk => ({
  id,
  content,
  score,
  metadata: { source, title: source, chunkIndex: 0, documentId: `doc-${id}`, contentType: 'text/plain' },
});

describe('ContextBuilderService', () => {
  let service: ContextBuilderService;

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('sk-test'),
    get: jest.fn().mockImplementation((_key: string, defaultValue?: string) => defaultValue),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextBuilderService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ContextBuilderService>(ContextBuilderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return insufficient when chunks are empty', async () => {
    const result = await service.build('test query', []);

    expect(result.groups).toHaveLength(0);
    expect(result.totalChunks).toBe(0);
    expect(result.insufficientInformation).toBe(true);
  });

  it('should group chunks by topic from LLM response', async () => {
    const chunks = [
      makeChunk('c1', 'Embeddings represent text as vectors', 'embeddings.md', 0.9),
      makeChunk('c2', 'ChromaDB stores vector embeddings', 'chroma.md', 0.85),
      makeChunk('c3', 'BM25 is a keyword ranking function', 'search.md', 0.8),
    ];

    // Mock topic grouping
    mockLlmInvoke.mockResolvedValueOnce({
      content: JSON.stringify({
        topics: [
          { topic: 'Embeddings', chunkIds: ['CHUNK_0', 'CHUNK_1'] },
          { topic: 'Search', chunkIds: ['CHUNK_2'] },
        ],
      }),
    });

    // Mock contradiction detection (only group "Embeddings" has >= 2 chunks, "Search" is skipped)
    mockLlmInvoke.mockResolvedValueOnce({
      content: JSON.stringify({ hasContradictions: false, details: '' }),
    });

    const result = await service.build('embeddings vs search', chunks);

    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]!.topic).toBe('Embeddings');
    expect(result.groups[0]!.chunks).toHaveLength(2);
    expect(result.groups[1]!.topic).toBe('Search');
  });

  it('should detect contradictions between chunks', async () => {
    const chunks = [
      makeChunk('c1', 'Small chunks of 256 tokens are best', 'doc1.md', 0.9),
      makeChunk('c2', 'Large chunks of 2048 tokens are best', 'doc2.md', 0.85),
    ];

    mockLlmInvoke.mockResolvedValueOnce({
      content: JSON.stringify({
        topics: [{ topic: 'Chunk sizing', chunkIds: ['CHUNK_0', 'CHUNK_1'] }],
      }),
    });

    mockLlmInvoke.mockResolvedValueOnce({
      content: JSON.stringify({
        hasContradictions: true,
        details: 'doc1 says 256 tokens, doc2 says 2048 tokens',
      }),
    });

    const result = await service.build('chunk size', chunks);

    expect(result.groups[0]!.hasContradictions).toBe(true);
    expect(result.groups[0]!.contradictionDetails).toContain('256');
  });

  it('should fall back to single group when topic grouping fails', async () => {
    const chunks = [makeChunk('c1', 'Some content', 'doc.md', 0.9)];

    mockLlmInvoke.mockRejectedValueOnce(new Error('LLM failed'));

    const result = await service.build('test', chunks);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.topic).toBe('General');
    expect(result.groups[0]!.chunks).toHaveLength(1);
  });

  it('should sort chunks by relevance score (descending)', async () => {
    const chunks = [
      makeChunk('c1', 'Low relevance', 'doc1.md', 0.5),
      makeChunk('c2', 'High relevance', 'doc2.md', 0.95),
      makeChunk('c3', 'Medium relevance', 'doc3.md', 0.75),
    ];

    mockLlmInvoke.mockResolvedValueOnce({
      content: JSON.stringify({
        topics: [{ topic: 'All', chunkIds: ['CHUNK_0', 'CHUNK_1', 'CHUNK_2'] }],
      }),
    });
    mockLlmInvoke.mockResolvedValueOnce({
      content: JSON.stringify({ hasContradictions: false, details: '' }),
    });

    const result = await service.build('test', chunks);

    // Chunks should be sorted: highest score first
    const scores = result.groups[0]!.chunks.map((c) => c.score);
    expect(scores[0]).toBeGreaterThanOrEqual(scores[1]!);
    expect(scores[1]).toBeGreaterThanOrEqual(scores[2]!);
  });

  it('should mark insufficient when fewer than 2 chunks', async () => {
    const chunks = [makeChunk('c1', 'Only one chunk', 'doc.md', 0.9)];

    mockLlmInvoke.mockRejectedValueOnce(new Error('fail'));

    const result = await service.build('test', chunks);

    expect(result.insufficientInformation).toBe(true);
  });

  it('should handle contradiction detection failure gracefully', async () => {
    const chunks = [
      makeChunk('c1', 'Content A', 'doc1.md', 0.9),
      makeChunk('c2', 'Content B', 'doc2.md', 0.85),
    ];

    mockLlmInvoke.mockResolvedValueOnce({
      content: JSON.stringify({
        topics: [{ topic: 'Topic', chunkIds: ['CHUNK_0', 'CHUNK_1'] }],
      }),
    });
    mockLlmInvoke.mockRejectedValueOnce(new Error('contradiction check failed'));

    const result = await service.build('test', chunks);

    expect(result.groups[0]!.hasContradictions).toBe(false);
  });
});
