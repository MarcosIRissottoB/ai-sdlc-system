import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { VectorStoreService } from '../../vector-store/vector-store.service';
import { IngestionError } from '../../common/exceptions/rag.exceptions';
import { IngestionOptions } from '../../common/types/rag.types';
import { logPipelineStep, logPipelineError } from '../../common/utils/logger.util';
import { SmartChunkerService } from './smart-chunker.service';
import { ChunkEnricherService } from './chunk-enricher.service';

export interface IngestionResult {
  documentId: string;
  chunksCreated: number;
  source: string;
  title: string;
  /** true cuando el documento ya existía y se omitió la re-ingestión */
  skipped?: boolean;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private readonly embeddings: OpenAIEmbeddings;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vectorStore: VectorStoreService,
    private readonly configService: ConfigService,
    private readonly smartChunker: SmartChunkerService,
    private readonly chunkEnricher: ChunkEnricherService,
  ) {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
      modelName: this.configService.get<string>(
        'OPENAI_EMBEDDING_MODEL',
        'text-embedding-3-small',
      ),
    });
  }

  async ingestText(text: string, options: IngestionOptions = {}): Promise<IngestionResult> {
    const {
      chunkSize = Number(this.configService.get('CHUNK_SIZE', '1000')),
      chunkOverlap = Number(this.configService.get('CHUNK_OVERLAP', '200')),
      source = 'manual',
      title = 'Untitled',
      contentType = 'text/plain',
      domain = 'general',
      metadata = {},
      force = false,
    } = options;

    try {
      // DEDUPLICACIÓN: verificar si ya existe un documento con este source
      const existingDocument = await this.prisma.document.findUnique({
        where: { source },
        select: { id: true, title: true, domain: true, chunks: { select: { id: true } } },
      });

      if (existingDocument) {
        if (!force) {
          logPipelineStep(this.logger, 'INGESTION:SKIPPED', {
            source,
            documentId: existingDocument.id,
            reason: 'Document already exists. Use force=true to re-ingest.',
          });
          return {
            documentId: existingDocument.id,
            chunksCreated: existingDocument.chunks.length,
            source,
            title: existingDocument.title,
            skipped: true,
          };
        }

        logPipelineStep(this.logger, 'INGESTION:FORCE_DELETE', {
          source,
          documentId: existingDocument.id,
          chunksToDelete: existingDocument.chunks.length,
        });
        // Postgres first (source of truth) — cascade deletes chunks
        await this.prisma.document.delete({ where: { id: existingDocument.id } });
        // ChromaDB cleanup — idempotent; orphaned vectors are harmless without Postgres metadata
        try {
          await this.vectorStore.deleteByDocumentId(existingDocument.id, existingDocument.domain);
        } catch (chromaError) {
          this.logger.warn(
            `ChromaDB cleanup failed for ${existingDocument.id}: ${String(chromaError)}. Orphaned vectors will be cleaned by reconciliation.`,
          );
        }
      }

      logPipelineStep(this.logger, 'INGESTION:START', {
        title,
        source,
        domain,
        textLength: text.length,
      });

      // ETAPA 1: Chunking semántico
      const chunkResults = await this.smartChunker.chunk(text, {
        chunkSize,
        chunkOverlap,
        contentType,
      });
      logPipelineStep(this.logger, 'INGESTION:CHUNKED', { chunks: chunkResults.length });

      // ETAPA 2: Enriquecimiento (summary, keywords, level, type)
      const chunkContents = chunkResults.map((c) => c.content);
      const enrichments = await this.chunkEnricher.enrichBatch(chunkContents);

      // ETAPA 3: Embeddings en batch (antes de persistir — si falla, no hay datos huerfanos)
      const embeddingVectors = await this.embeddings.embedDocuments(chunkContents);

      // ETAPA 4: Preparar datos de chunks con IDs generados upfront
      const chunkIds: string[] = [];
      const chunkEmbeddings: number[][] = [];
      const chunkTexts: string[] = [];
      const chunkMetadatas: Record<string, string | number | boolean>[] = [];
      const chunkDataArray: Prisma.ChunkCreateManyInput[] = [];

      for (let i = 0; i < chunkResults.length; i++) {
        const chunkResult = chunkResults[i]!;
        const enrichment = enrichments[i]!;
        const chunkId = randomUUID();

        chunkDataArray.push({
          id: chunkId,
          vectorId: chunkId,
          documentId: '', // placeholder — set after document creation
          content: chunkResult.content,
          chunkIndex: i,
          tokenCount: Math.ceil(chunkResult.content.length / 4),
          summary: enrichment.summary,
          keywords: enrichment.keywords,
          level: enrichment.level,
          chunkType: enrichment.chunkType,
          metadata: {
            source,
            title,
            contentType,
            domain,
            headingPath: chunkResult.headingPath,
            ...metadata,
          },
        });

        chunkIds.push(chunkId);
        chunkEmbeddings.push(embeddingVectors[i] ?? []);
        chunkTexts.push(chunkResult.content);
        chunkMetadatas.push({
          source,
          title,
          domain,
          chunkIndex: i,
          documentId: '', // placeholder — set after document creation
          contentType,
          level: enrichment.level,
          chunkType: enrichment.chunkType,
          headingPath: chunkResult.headingPath ?? '',
          keywords: enrichment.keywords.join(','),
          ...metadata,
        });
      }

      // ETAPA 5: Persistencia atomica en Postgres (document + chunks en una transaccion)
      const document = await this.prisma.$transaction(async (tx) => {
        const doc = await tx.document.create({
          data: {
            title,
            source,
            contentType,
            domain,
            rawContent: text,
            metadata: metadata as Prisma.InputJsonValue,
          },
        });

        // Setear documentId real en los datos de chunks
        for (const chunkData of chunkDataArray) {
          chunkData.documentId = doc.id;
        }
        for (const chromaMeta of chunkMetadatas) {
          chromaMeta.documentId = doc.id;
        }

        await tx.chunk.createMany({ data: chunkDataArray });

        return doc;
      });

      // ETAPA 6: Indexar en vector store — con compensacion si falla
      try {
        await this.vectorStore.addDocuments(
          {
            ids: chunkIds,
            embeddings: chunkEmbeddings,
            documents: chunkTexts,
            metadatas: chunkMetadatas,
          },
          domain,
        );
      } catch (chromaError) {
        this.logger.error(
          `ChromaDB indexing failed, rolling back Postgres records for document ${document.id}`,
        );
        await this.prisma.document.delete({ where: { id: document.id } });
        throw new IngestionError(
          `ChromaDB indexing failed: ${chromaError instanceof Error ? chromaError.message : String(chromaError)}`,
        );
      }

      logPipelineStep(this.logger, 'INGESTION:COMPLETE', {
        documentId: document.id,
        chunksCreated: chunkResults.length,
        domain,
      });

      return {
        documentId: document.id,
        chunksCreated: chunkResults.length,
        source,
        title,
      };
    } catch (error) {
      logPipelineError(this.logger, 'INGESTION', error);
      throw new IngestionError(
        `Failed to ingest document: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async ingestUrl(url: string, options: IngestionOptions = {}): Promise<IngestionResult> {
    logPipelineStep(this.logger, 'INGESTION:URL', { url });

    const fetchUrl = await this.validateAndResolveUrl(url);

    const response = await fetch(fetchUrl.href, {
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
      headers: {
        'User-Agent': 'AI-SDLC-Ingestion/1.0',
        'Host': new URL(url).host,
      },
    });
    if (!response.ok) {
      throw new IngestionError(`Failed to fetch URL: ${url} (${response.status})`);
    }
    const text = await response.text();
    return this.ingestText(text, {
      source: url,
      title: options.title ?? url,
      contentType: 'text/html',
      ...options,
    });
  }

  /**
   * Validates a URL against SSRF vectors and returns a fetch-safe URL.
   * For HTTP: replaces hostname with resolved IP to prevent TOCTOU DNS rebinding.
   * For HTTPS: keeps original hostname (TLS requires it) but blocks redirects.
   */
  private async validateAndResolveUrl(url: string): Promise<URL> {
    const parsed = new URL(url);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new IngestionError(`URL blocked: protocol ${parsed.protocol} is not allowed`);
    }

    const hostname = parsed.hostname.toLowerCase();

    const blockedHostnames = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '[::1]',
      '::1',
      'metadata.google.internal',
      'metadata.google.com',
      '169.254.169.254',
      'metadata.azure.com',
    ];

    if (blockedHostnames.includes(hostname)) {
      throw new IngestionError(`URL blocked: ${hostname} is not allowed`);
    }

    const { isIP } = await import('node:net');
    let resolvedIp: string;

    if (isIP(hostname)) {
      resolvedIp = hostname;
    } else {
      const dns = await import('node:dns/promises');
      let ips: string[];
      try {
        ips = await dns.resolve4(hostname);
      } catch {
        throw new IngestionError(`URL blocked: unable to resolve hostname ${hostname}`);
      }
      if (ips.length === 0) {
        throw new IngestionError(`URL blocked: hostname ${hostname} resolved to no addresses`);
      }
      for (const ip of ips) {
        this.validateIp(ip);
      }
      resolvedIp = ips[0]!;
    }

    this.validateIp(resolvedIp);

    // For HTTP: replace hostname with resolved IP to prevent TOCTOU
    // For HTTPS: keep original hostname (TLS certificate requires matching hostname)
    if (parsed.protocol === 'http:') {
      const resolved = new URL(url);
      resolved.hostname = resolvedIp;
      return resolved;
    }

    return parsed;
  }

  private validateIp(ip: string): void {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;

    if (
      a === 0 ||                                              // 0.0.0.0/8
      a === 10 ||                                             // 10.0.0.0/8
      a === 127 ||                                            // 127.0.0.0/8
      (a === 172 && b !== undefined && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) ||                             // 192.168.0.0/16
      (a === 169 && b === 254) ||                             // 169.254.0.0/16 (link-local)
      (a === 100 && b !== undefined && b >= 64 && b <= 127) || // 100.64.0.0/10 (CGNAT)
      (a === 198 && (b === 18 || b === 19)) ||                // 198.18.0.0/15 (benchmarking)
      (a !== undefined && a >= 224)                           // multicast + reserved
    ) {
      throw new IngestionError(`URL blocked: resolved IP ${ip} is in a restricted range`);
    }
  }
}
