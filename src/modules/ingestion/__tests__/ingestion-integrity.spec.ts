import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IngestionService } from '../ingestion.service';
import { SmartChunkerService } from '../smart-chunker.service';
import { ChunkEnricherService } from '../chunk-enricher.service';
import { VectorStoreService } from '../../../vector-store/vector-store.service';
import { PrismaService } from '../../../database/prisma.service';
import { IngestionError } from '../../../common/exceptions/rag.exceptions';

const mockEmbedDocuments = jest.fn();
jest.mock('@langchain/openai', () => ({
  OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedDocuments: mockEmbedDocuments,
  })),
}));

describe('IngestionService — Data Integrity', () => {
  let service: IngestionService;
  let mockPrisma: Record<string, unknown>;
  let mockVectorStore: Record<string, jest.Mock>;

  const mockSmartChunker = {
    chunk: jest.fn().mockResolvedValue([
      { content: 'chunk 1', chunkIndex: 0, headingPath: 'S1' },
      { content: 'chunk 2', chunkIndex: 1, headingPath: 'S2' },
    ]),
  };

  const mockChunkEnricher = {
    enrichBatch: jest.fn().mockResolvedValue([
      { summary: 'S1', keywords: ['k1'], level: 'intermedio', chunkType: 'concepto' },
      { summary: 'S2', keywords: ['k2'], level: 'avanzado', chunkType: 'ejemplo' },
    ]),
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('sk-test'),
    get: jest.fn().mockImplementation((_key: string, def?: string) => def),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEmbedDocuments.mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]);

    mockPrisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'doc-1', title: 'Test', source: 'test.md', domain: 'general',
        }),
        delete: jest.fn(),
      },
      chunk: {
        createMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(
        async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
      ),
    };

    mockVectorStore = {
      addDocuments: jest.fn(),
      deleteByDocumentId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: VectorStoreService, useValue: mockVectorStore },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SmartChunkerService, useValue: mockSmartChunker },
        { provide: ChunkEnricherService, useValue: mockChunkEnricher },
      ],
    }).compile();

    service = module.get<IngestionService>(IngestionService);
  });

  describe('Batch create (N+1 fix)', () => {
    it('should use createMany instead of individual creates', async () => {
      await service.ingestText('content', { source: 'test.md' });

      expect((mockPrisma.chunk as Record<string, jest.Mock>).createMany).toHaveBeenCalledTimes(1);
      const call = (mockPrisma.chunk as Record<string, jest.Mock>).createMany.mock.calls[0]![0];
      expect(call.data).toHaveLength(2);
    });

    it('should generate unique IDs with vectorId = id for each chunk', async () => {
      await service.ingestText('content', { source: 'test.md' });

      const call = (mockPrisma.chunk as Record<string, jest.Mock>).createMany.mock.calls[0]![0];
      for (const chunk of call.data) {
        expect(chunk.id).toBeDefined();
        expect(chunk.vectorId).toBe(chunk.id);
      }
      // IDs are unique
      const ids = call.data.map((c: { id: string }) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('Transaction wrapping', () => {
    it('should use $transaction for document + chunks creation', async () => {
      await service.ingestText('content', { source: 'test.md' });

      expect((mockPrisma as Record<string, jest.Mock>).$transaction).toHaveBeenCalledTimes(1);
    });

    it('should set correct documentId on all chunks inside transaction', async () => {
      await service.ingestText('content', { source: 'test.md' });

      const call = (mockPrisma.chunk as Record<string, jest.Mock>).createMany.mock.calls[0]![0];
      for (const chunk of call.data) {
        expect(chunk.documentId).toBe('doc-1');
      }
    });
  });

  describe('Compensating transaction (ChromaDB failure)', () => {
    it('should rollback Postgres when ChromaDB addDocuments fails', async () => {
      mockVectorStore.addDocuments.mockRejectedValue(new Error('ChromaDB down'));

      await expect(
        service.ingestText('content', { source: 'test.md' }),
      ).rejects.toThrow(IngestionError);

      // Document should be rolled back
      expect((mockPrisma.document as Record<string, jest.Mock>).delete).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
      });
    });

    it('should include ChromaDB error message in thrown IngestionError', async () => {
      mockVectorStore.addDocuments.mockRejectedValue(new Error('Connection refused'));

      await expect(
        service.ingestText('content', { source: 'test.md' }),
      ).rejects.toThrow(/Connection refused/);
    });
  });

  describe('Force delete order (Postgres first)', () => {
    it('should delete from Postgres before ChromaDB on force re-ingest', async () => {
      const callOrder: string[] = [];

      (mockPrisma.document as Record<string, jest.Mock>).findUnique.mockResolvedValue({
        id: 'existing-doc', title: 'Old', domain: 'general', chunks: [{ id: 'c1' }],
      });
      (mockPrisma.document as Record<string, jest.Mock>).delete.mockImplementation(async () => {
        callOrder.push('postgres-delete');
      });
      mockVectorStore.deleteByDocumentId.mockImplementation(async () => {
        callOrder.push('chroma-delete');
      });

      await service.ingestText('new content', { source: 'test.md', force: true });

      expect(callOrder[0]).toBe('postgres-delete');
      expect(callOrder[1]).toBe('chroma-delete');
    });

    it('should continue when ChromaDB cleanup fails on force delete', async () => {
      (mockPrisma.document as Record<string, jest.Mock>).findUnique.mockResolvedValue({
        id: 'existing-doc', title: 'Old', domain: 'general', chunks: [{ id: 'c1' }],
      });
      mockVectorStore.deleteByDocumentId.mockRejectedValue(new Error('ChromaDB timeout'));

      // Should NOT throw — ChromaDB cleanup failure is non-fatal
      const result = await service.ingestText('new content', { source: 'test.md', force: true });
      expect(result.documentId).toBe('doc-1');
    });
  });
});
