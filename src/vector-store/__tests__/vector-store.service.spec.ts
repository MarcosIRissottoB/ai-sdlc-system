import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VectorStoreService } from '../vector-store.service';

const mockQuery = jest.fn();
const mockAdd = jest.fn();
const mockDelete = jest.fn();
const mockGet = jest.fn();
const mockCount = jest.fn();

const makeCollection = (name: string) => ({
  name,
  query: mockQuery,
  add: mockAdd,
  delete: mockDelete,
  get: mockGet,
  count: mockCount,
});

const mockGetOrCreateCollection = jest.fn();
const mockGetCollection = jest.fn();
const mockListCollections = jest.fn();

jest.mock('chromadb', () => ({
  ChromaClient: jest.fn().mockImplementation(() => ({
    getOrCreateCollection: mockGetOrCreateCollection,
    getCollection: mockGetCollection,
    listCollections: mockListCollections,
  })),
}));

describe('VectorStoreService', () => {
  let service: VectorStoreService;

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string, def?: string) => {
      if (key === 'CHROMA_HOST') return 'http://localhost:8000';
      if (key === 'CHROMA_COLLECTION_NAME') return 'test_collection';
      return def;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetOrCreateCollection.mockImplementation(({ name }: { name: string }) =>
      Promise.resolve(makeCollection(name)),
    );
    mockGetCollection.mockImplementation(({ name }: { name: string }) =>
      Promise.resolve(makeCollection(name)),
    );
    mockListCollections.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VectorStoreService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<VectorStoreService>(VectorStoreService);
  });

  describe('query with specific domain', () => {
    it('should query only the specified domain collection', async () => {
      mockQuery.mockResolvedValue({
        ids: [['id-1']],
        documents: [['content 1']],
        distances: [[0.1]],
        metadatas: [[{ source: 'doc.md' }]],
      });

      const results = await service.query(
        { queryEmbedding: [0.1, 0.2], topK: 5 },
        'rag',
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.score).toBeCloseTo(0.9); // 1 - 0.1
      expect(mockGetOrCreateCollection).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test_collection_rag' }),
      );
    });
  });

  describe('query without domain (multi-collection)', () => {
    it('should discover and query all collections', async () => {
      mockListCollections.mockResolvedValue([
        { name: 'test_collection' },
        { name: 'test_collection_extra-lectures' },
      ]);

      mockQuery
        .mockResolvedValueOnce({
          ids: [['id-general']],
          documents: [['general content']],
          distances: [[0.3]],
          metadatas: [[{ source: 'general.md' }]],
        })
        .mockResolvedValueOnce({
          ids: [['id-extra']],
          documents: [['extra content']],
          distances: [[0.1]],
          metadatas: [[{ source: 'extra.md' }]],
        });

      const results = await service.query(
        { queryEmbedding: [0.1, 0.2], topK: 5 },
      );

      // Should have results from both collections
      expect(results).toHaveLength(2);
      // Sorted by score descending: extra (0.9) > general (0.7)
      expect(results[0]!.id).toBe('id-extra');
      expect(results[1]!.id).toBe('id-general');
    });

    it('should respect topK across merged results', async () => {
      mockListCollections.mockResolvedValue([
        { name: 'col_a' },
        { name: 'col_b' },
      ]);

      mockQuery
        .mockResolvedValueOnce({
          ids: [['a1', 'a2', 'a3']],
          documents: [['a1', 'a2', 'a3']],
          distances: [[0.1, 0.3, 0.5]],
          metadatas: [[{}, {}, {}]],
        })
        .mockResolvedValueOnce({
          ids: [['b1', 'b2', 'b3']],
          documents: [['b1', 'b2', 'b3']],
          distances: [[0.05, 0.2, 0.4]],
          metadatas: [[{}, {}, {}]],
        });

      const results = await service.query(
        { queryEmbedding: [0.1], topK: 3 },
      );

      // topK=3: should take best 3 from 6 total
      expect(results).toHaveLength(3);
      // Best scores: b1 (0.95), a1 (0.9), b2 (0.8)
      expect(results[0]!.id).toBe('b1');
      expect(results[1]!.id).toBe('a1');
      expect(results[2]!.id).toBe('b2');
    });

    it('should return empty array when no collections exist', async () => {
      mockListCollections.mockResolvedValue([]);
      // Clear the default collection that was cached in onModuleInit
      (service as unknown as { collections: Map<string, unknown> }).collections.clear();

      const results = await service.query(
        { queryEmbedding: [0.1], topK: 5 },
      );

      expect(results).toHaveLength(0);
    });

    it('should handle discovery failure gracefully', async () => {
      mockListCollections.mockRejectedValue(new Error('ChromaDB unreachable'));

      // Should still work with cached collections (none in this case after clear)
      const results = await service.query(
        { queryEmbedding: [0.1], topK: 5 },
      );

      // Returns results from whatever collections are cached
      expect(results).toBeDefined();
    });
  });

  describe('resolveCollectionName', () => {
    it('should use default collection for "general" domain', async () => {
      mockQuery.mockResolvedValue({ ids: [[]], documents: [[]], distances: [[]], metadatas: [[]] });

      await service.query({ queryEmbedding: [0.1], topK: 5 }, 'general');

      expect(mockGetOrCreateCollection).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test_collection' }),
      );
    });

    it('should append domain suffix for non-general domains', async () => {
      mockQuery.mockResolvedValue({ ids: [[]], documents: [[]], distances: [[]], metadatas: [[]] });

      await service.query({ queryEmbedding: [0.1], topK: 5 }, 'extra-lectures');

      expect(mockGetOrCreateCollection).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test_collection_extra-lectures' }),
      );
    });
  });
});
