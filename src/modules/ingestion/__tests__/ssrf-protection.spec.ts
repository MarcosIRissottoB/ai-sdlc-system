import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IngestionService } from '../ingestion.service';
import { SmartChunkerService } from '../smart-chunker.service';
import { ChunkEnricherService } from '../chunk-enricher.service';
import { VectorStoreService } from '../../../vector-store/vector-store.service';
import { PrismaService } from '../../../database/prisma.service';
import { IngestionError } from '../../../common/exceptions/rag.exceptions';

jest.mock('@langchain/openai', () => ({
  OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedDocuments: jest.fn(),
  })),
}));

// Mock dns.resolve4 to simulate DNS rebinding attacks
const mockResolve4 = jest.fn();
jest.mock('node:dns/promises', () => ({
  resolve4: (...args: unknown[]) => mockResolve4(...args),
}));

const mockFetch = jest.fn() as jest.Mock;
const originalFetch = global.fetch;

describe('IngestionService — SSRF Protection', () => {
  let service: IngestionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: DNS resolves to public IP
    mockResolve4.mockResolvedValue(['93.184.216.34']);
    // Mock global fetch to avoid real HTTP calls
    global.fetch = mockFetch;
    mockFetch.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionService,
        { provide: PrismaService, useValue: { document: { findUnique: jest.fn() } } },
        { provide: VectorStoreService, useValue: {} },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('sk-test'),
            get: jest.fn().mockImplementation((_k: string, d?: string) => d),
          },
        },
        { provide: SmartChunkerService, useValue: {} },
        { provide: ChunkEnricherService, useValue: {} },
      ],
    }).compile();

    service = module.get<IngestionService>(IngestionService);
  });

  describe('Literal IP blocking', () => {
    it.each([
      ['http://localhost/secret', 'localhost'],
      ['http://127.0.0.1/admin', '127.0.0.1'],
      ['http://0.0.0.0:8080/', '0.0.0.0'],
      ['http://[::1]/internal', '[::1]'],
      ['http://169.254.169.254/metadata', '169.254.169.254'],
    ])('should block %s', async (url) => {
      await expect(service.ingestUrl(url)).rejects.toThrow(IngestionError);
    });
  });

  describe('Cloud metadata hostnames', () => {
    it.each([
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://metadata.google.com/computeMetadata/',
      'http://metadata.azure.com/metadata/instance',
    ])('should block %s', async (url) => {
      await expect(service.ingestUrl(url)).rejects.toThrow(IngestionError);
    });
  });

  describe('Protocol blocking', () => {
    it('should block ftp protocol', async () => {
      await expect(service.ingestUrl('ftp://example.com/file')).rejects.toThrow(
        /protocol ftp: is not allowed/,
      );
    });

    it('should block file protocol', async () => {
      await expect(service.ingestUrl('file:///etc/passwd')).rejects.toThrow(
        /protocol file: is not allowed/,
      );
    });
  });

  describe('DNS rebinding (resolved IP validation)', () => {
    it('should block when DNS resolves to private 10.x.x.x range', async () => {
      mockResolve4.mockResolvedValue(['10.0.0.1']);
      await expect(service.ingestUrl('http://evil.example.com/data')).rejects.toThrow(
        /restricted range/,
      );
    });

    it('should block when DNS resolves to 192.168.x.x range', async () => {
      mockResolve4.mockResolvedValue(['192.168.1.1']);
      await expect(service.ingestUrl('http://evil.example.com/data')).rejects.toThrow(
        /restricted range/,
      );
    });

    it('should block when DNS resolves to 172.16-31.x.x range', async () => {
      mockResolve4.mockResolvedValue(['172.16.0.1']);
      await expect(service.ingestUrl('http://evil.example.com/data')).rejects.toThrow(
        /restricted range/,
      );
    });

    it('should block when DNS resolves to link-local 169.254.x.x', async () => {
      mockResolve4.mockResolvedValue(['169.254.1.1']);
      await expect(service.ingestUrl('http://evil.example.com/data')).rejects.toThrow(
        /restricted range/,
      );
    });

    it('should block when DNS resolves to loopback 127.x.x.x', async () => {
      mockResolve4.mockResolvedValue(['127.0.0.1']);
      await expect(service.ingestUrl('http://evil.example.com/data')).rejects.toThrow(
        /restricted range/,
      );
    });

    it('should block CGNAT range 100.64-127.x.x', async () => {
      mockResolve4.mockResolvedValue(['100.64.0.1']);
      await expect(service.ingestUrl('http://evil.example.com/data')).rejects.toThrow(
        /restricted range/,
      );
    });

    it('should block benchmarking range 198.18-19.x.x', async () => {
      mockResolve4.mockResolvedValue(['198.18.0.1']);
      await expect(service.ingestUrl('http://evil.example.com/data')).rejects.toThrow(
        /restricted range/,
      );
    });

    it('should block multicast range (>=224)', async () => {
      mockResolve4.mockResolvedValue(['224.0.0.1']);
      await expect(service.ingestUrl('http://evil.example.com/data')).rejects.toThrow(
        /restricted range/,
      );
    });
  });

  describe('DNS resolution failure', () => {
    it('should block when hostname cannot be resolved', async () => {
      mockResolve4.mockRejectedValue(new Error('ENOTFOUND'));
      await expect(service.ingestUrl('http://nonexistent.invalid/data')).rejects.toThrow(
        /unable to resolve hostname/,
      );
    });
  });

  describe('Allowed URLs', () => {
    it('should allow URL that resolves to public IP', async () => {
      mockResolve4.mockResolvedValue(['93.184.216.34']);
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      // Should pass URL validation and reach fetch
      await expect(service.ingestUrl('http://example.com/docs')).rejects.toThrow(
        /Failed to fetch URL/,
      );
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should use resolved IP in fetch URL for HTTP (TOCTOU mitigation)', async () => {
      mockResolve4.mockResolvedValue(['93.184.216.34']);
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      await expect(service.ingestUrl('http://example.com/docs')).rejects.toThrow();
      const fetchedUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchedUrl).toContain('93.184.216.34');
    });

    it('should pass redirect: error option to fetch', async () => {
      mockResolve4.mockResolvedValue(['93.184.216.34']);
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      await expect(service.ingestUrl('http://example.com/docs')).rejects.toThrow();
      const fetchOptions = mockFetch.mock.calls[0][1] as RequestInit;
      expect(fetchOptions.redirect).toBe('error');
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });
});
