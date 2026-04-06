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

describe('IngestionService', () => {
  let service: IngestionService;

  const mockPrisma = {
    document: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'doc-1', title: 'Test', source: 'test.md', domain: 'general' }),
      delete: jest.fn(),
    },
    chunk: {
      createMany: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
      return fn(mockPrisma);
    }),
  };

  const mockVectorStore = {
    addDocuments: jest.fn(),
    deleteByDocumentId: jest.fn(),
  };

  const mockSmartChunker = {
    chunk: jest.fn().mockResolvedValue([
      { content: 'chunk content 1', chunkIndex: 0, headingPath: 'Section 1' },
    ]),
  };

  const mockChunkEnricher = {
    enrichBatch: jest.fn().mockResolvedValue([
      { summary: 'Summary', keywords: ['key1'], level: 'intermedio', chunkType: 'concepto' },
    ]),
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('sk-test'),
    get: jest.fn().mockImplementation((_key: string, defaultValue?: string) => defaultValue),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEmbedDocuments.mockResolvedValue([[0.1, 0.2, 0.3]]);
    mockPrisma.document.findUnique.mockResolvedValue(null);

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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ingestText', () => {
    it('should ingest text and create document with chunks', async () => {
      const result = await service.ingestText('Some text content', {
        source: 'test.md',
        title: 'Test Doc',
      });

      expect(result.documentId).toBe('doc-1');
      expect(result.chunksCreated).toBe(1);
      expect(mockPrisma.document.create).toHaveBeenCalled();
      expect(mockVectorStore.addDocuments).toHaveBeenCalled();
    });

    it('should skip ingestion when document already exists without force', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        id: 'existing-doc',
        title: 'Existing',
        domain: 'general',
        chunks: [{ id: 'c1' }, { id: 'c2' }],
      });

      const result = await service.ingestText('text', { source: 'existing.md' });

      expect(result.skipped).toBe(true);
      expect(result.documentId).toBe('existing-doc');
      expect(mockPrisma.document.create).not.toHaveBeenCalled();
    });

    it('should re-ingest when force=true and document exists', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        id: 'existing-doc',
        title: 'Existing',
        domain: 'general',
        chunks: [{ id: 'c1' }],
      });

      const result = await service.ingestText('new text', {
        source: 'existing.md',
        force: true,
      });

      expect(result.skipped).toBeUndefined();
      // Postgres delete first (source of truth), then ChromaDB cleanup
      expect(mockPrisma.document.delete).toHaveBeenCalledWith({ where: { id: 'existing-doc' } });
      expect(mockVectorStore.deleteByDocumentId).toHaveBeenCalledWith('existing-doc', 'general');
      expect(mockPrisma.document.create).toHaveBeenCalled();
    });
  });

  describe('ingestUrl', () => {
    it('should block localhost URLs (SSRF protection)', async () => {
      await expect(
        service.ingestUrl('http://localhost:3000/secret'),
      ).rejects.toThrow(IngestionError);
    });

    it('should block 127.0.0.1 URLs', async () => {
      await expect(
        service.ingestUrl('http://127.0.0.1/admin'),
      ).rejects.toThrow(IngestionError);
    });

    it('should block private IP ranges (10.x.x.x)', async () => {
      await expect(
        service.ingestUrl('http://10.0.0.1/internal'),
      ).rejects.toThrow(IngestionError);
    });

    it('should block private IP ranges (192.168.x.x)', async () => {
      await expect(
        service.ingestUrl('http://192.168.1.1/config'),
      ).rejects.toThrow(IngestionError);
    });

    it('should block private IP ranges (172.16-31.x.x)', async () => {
      await expect(
        service.ingestUrl('http://172.16.0.1/internal'),
      ).rejects.toThrow(IngestionError);
    });

    it('should block 0.0.0.0', async () => {
      await expect(
        service.ingestUrl('http://0.0.0.0:8080/'),
      ).rejects.toThrow(IngestionError);
    });
  });
});
