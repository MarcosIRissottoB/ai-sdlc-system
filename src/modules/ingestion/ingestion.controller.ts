import { Controller, Post, Body, Get, Delete, Param, Logger, Query, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiConsumes, ApiQuery, ApiSecurity } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IngestionService } from './ingestion.service';
import { ScraperService } from './scraper.service';
import { IngestTextDto, IngestUrlDto, IngestBulkUrlsDto } from './dto/ingest-text.dto';
import { VectorStoreService } from '../../vector-store/vector-store.service';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('ingestion')
@ApiSecurity('api-key')
@Throttle({ default: { ttl: 60000, limit: 20 } })
@Controller('ingestion')
export class IngestionController {
  private readonly logger = new Logger(IngestionController.name);

  constructor(
    private readonly ingestionService: IngestionService,
    private readonly scraperService: ScraperService,
    private readonly vectorStoreService: VectorStoreService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('text')
  @ApiOperation({
    summary: 'Ingestar texto con chunking semántico + enrichment',
    description:
      'Divide el contenido en chunks semánticamente coherentes, genera embeddings con text-embedding-3-small y los almacena en ChromaDB + PostgreSQL.',
  })
  @ApiBody({
    type: IngestTextDto,
    examples: {
      minimal: {
        summary: 'Texto simple',
        value: {
          text: 'RAG systems benefit from smaller, focused chunks of 256-512 tokens. Larger chunks increase noise in retrieval.',
          title: 'RAG Best Practices',
          source: 'internal-docs',
        },
      },
      markdown: {
        summary: 'Documento markdown con opciones de chunking',
        value: {
          text: '# Vector Databases\n\n## ChromaDB\nChromaDB is an open-source embedding database...\n\n## pgvector\npgvector adds vector similarity search to PostgreSQL...',
          title: 'Vector Databases Comparison',
          source: 'https://docs.trychroma.com',
          contentType: 'text/markdown',
          chunkSize: 800,
          chunkOverlap: 150,
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Documento ingestado exitosamente',
    schema: {
      example: {
        documentId: 'clx1234567890abcdef',
        chunksCreated: 12,
        title: 'RAG Best Practices',
        source: 'internal-docs',
      },
    },
  })
  async ingestText(@Body() dto: IngestTextDto) {
    return this.ingestionService.ingestText(dto.text, {
      title: dto.title,
      source: dto.source,
      contentType: dto.contentType,
      domain: dto.domain,
      chunkSize: dto.chunkSize,
      chunkOverlap: dto.chunkOverlap,
      force: dto.force,
    });
  }

  @Post('url')
  @ApiOperation({
    summary: 'Ingestar documento desde URL',
    description: 'Descarga el contenido de la URL, lo parsea y lo ingesta con chunking semántico.',
  })
  @ApiBody({
    type: IngestUrlDto,
    examples: {
      docs: {
        summary: 'Documentación oficial',
        value: {
          url: 'https://docs.trychroma.com/guides',
          title: 'ChromaDB Official Docs',
        },
      },
      minimal: {
        summary: 'Solo URL',
        value: {
          url: 'https://python.langchain.com/docs/modules/data_connection/retrievers/',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'URL ingestada exitosamente',
    schema: {
      example: {
        documentId: 'clx0987654321fedcba',
        chunksCreated: 28,
        title: 'ChromaDB Official Docs',
        source: 'https://docs.trychroma.com/guides',
      },
    },
  })
  async ingestUrl(@Body() dto: IngestUrlDto) {
    if (dto.renderJs) {
      this.logger.log(`[URL+JS] Scraping with Playwright: ${dto.url}`);
      const text = await this.scraperService.extractText(dto.url, true);
      return this.ingestionService.ingestText(text, {
        source: dto.url,
        title: dto.title ?? dto.url,
        contentType: 'text/markdown',
      });
    }
    return this.ingestionService.ingestUrl(dto.url, { title: dto.title });
  }

  @Post('bulk-urls')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({
    summary: 'Ingestar múltiples URLs de documentación en batch',
    description:
      'Recibe una lista de URLs, las descarga e ingesta secuencialmente. Ideal para cargar documentación oficial completa (OpenAI, Langfuse, Anthropic, etc.). Reporta resultados individuales por URL.',
  })
  @ApiBody({
    type: IngestBulkUrlsDto,
    examples: {
      openai: {
        summary: 'Documentación OpenAI',
        value: {
          urls: [
            { url: 'https://platform.openai.com/docs/guides/vision', title: 'OpenAI Vision Guide' },
            { url: 'https://platform.openai.com/docs/guides/structured-outputs', title: 'OpenAI Structured Outputs' },
          ],
          domain: 'openai-docs',
          force: false,
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Resultados de la ingesta bulk',
    schema: {
      example: {
        total: 2,
        succeeded: 2,
        failed: 0,
        results: [
          { url: 'https://...', status: 'ok', documentId: 'abc123', chunksCreated: 14 },
        ],
      },
    },
  })
  async ingestBulkUrls(@Body() dto: IngestBulkUrlsDto) {
    const results: Array<{
      url: string;
      title?: string;
      status: 'ok' | 'skipped' | 'error';
      documentId?: string;
      chunksCreated?: number;
      error?: string;
    }> = [];

    for (const entry of dto.urls) {
      try {
        const result = await this.ingestionService.ingestUrl(entry.url, {
          title: entry.title,
          domain: dto.domain,
          force: dto.force,
        });
        results.push({
          url: entry.url,
          title: entry.title,
          status: result.skipped ? 'skipped' : 'ok',
          documentId: result.documentId,
          chunksCreated: result.chunksCreated,
        });
      } catch (error) {
        this.logger.error(`Bulk ingestion failed for ${entry.url}: ${String(error)}`);
        results.push({
          url: entry.url,
          title: entry.title,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      total: dto.urls.length,
      succeeded: results.filter((r) => r.status === 'ok').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'error').length,
      results,
    };
  }

  @Post('raw')
  @ApiConsumes('text/plain')
  @ApiOperation({
    summary: 'Ingestar texto plano directo — pegá sin escaping',
    description:
      'El body es el texto tal cual (sin JSON). Ideal para pegar lecturas, artículos o documentos directamente desde el portapapeles. ' +
      'Los metadatos se pasan como query params. El `contentType` por defecto es `text/markdown` para aprovechar chunking por headers.',
  })
  @ApiBody({
    description: 'Texto a ingestar. Pegalo directo, sin comillas ni escaping.',
    required: true,
    schema: { type: 'string', example: '# Mi documento\n\nContenido del documento...' },
  })
  @ApiQuery({ name: 'title', required: false, description: 'Título del documento', example: 'M4L1 - Multimodalidad y validación estructurada' })
  @ApiQuery({ name: 'source', required: false, description: 'Fuente o identificador del documento', example: 'curso-ai-engineer-m4l1' })
  @ApiQuery({ name: 'contentType', required: false, description: 'Tipo de contenido: text/plain o text/markdown (default: text/markdown)', example: 'text/markdown' })
  @ApiQuery({ name: 'chunkSize', required: false, description: 'Tamaño de cada chunk en caracteres (default: 1000)', example: '1200' })
  @ApiQuery({ name: 'chunkOverlap', required: false, description: 'Superposición entre chunks (default: 200)', example: '200' })
  @ApiQuery({ name: 'domain', required: false, description: 'Dominio/colección del knowledge base (default: general)', example: 'rag' })
  @ApiQuery({ name: 'force', required: false, description: 'Si true, elimina el documento existente y reingestsa', example: 'false' })
  @ApiResponse({
    status: 201,
    description: 'Documento ingestado exitosamente',
    schema: {
      example: { documentId: 'clx1234567890abcdef', chunksCreated: 14, title: 'M4L1 - Multimodalidad', source: 'curso-ai-engineer-m4l1' },
    },
  })
  async ingestRaw(
    @Body() text: string,
    @Query('title') title?: string,
    @Query('source') source?: string,
    @Query('contentType') contentType?: string,
    @Query('chunkSize') chunkSize?: string,
    @Query('chunkOverlap') chunkOverlap?: string,
    @Query('domain') domain?: string,
    @Query('force') force?: string,
  ) {
    if (!text || text.trim().length === 0) {
      throw new BadRequestException('El body no puede estar vacío');
    }
    if (text.length > 5_000_000) {
      throw new BadRequestException('El body excede el tamaño máximo de 5MB');
    }
    this.logger.log(`[RAW] Ingesting "${title ?? 'sin título'}" | ${text.length} chars`);
    return this.ingestionService.ingestText(text, {
      title,
      source,
      contentType: contentType ?? 'text/markdown',
      domain,
      chunkSize: chunkSize ? Number(chunkSize) : undefined,
      chunkOverlap: chunkOverlap ? Number(chunkOverlap) : undefined,
      force: force === 'true',
    });
  }

  @Get('documents')
  @ApiOperation({
    summary: 'Listar documentos ingestados',
    description: 'Devuelve todos los documentos con cantidad de chunks, domain y fecha de creación. Filtrable por domain.',
  })
  @ApiQuery({ name: 'domain', required: false, description: 'Filtrar por dominio', example: 'rag' })
  @ApiResponse({
    status: 200,
    description: 'Lista de documentos',
    schema: {
      example: [
        {
          id: 'clx123',
          title: 'RAG Best Practices',
          source: 'curso-m4l1',
          domain: 'rag',
          contentType: 'text/markdown',
          chunksCount: 14,
          createdAt: '2026-04-01T12:00:00.000Z',
        },
      ],
    },
  })
  async listDocuments(@Query('domain') domain?: string) {
    const where = domain ? { domain } : {};
    const documents = await this.prisma.document.findMany({
      where,
      select: {
        id: true,
        title: true,
        source: true,
        domain: true,
        contentType: true,
        createdAt: true,
        _count: { select: { chunks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      source: doc.source,
      domain: doc.domain,
      contentType: doc.contentType,
      chunksCount: doc._count.chunks,
      createdAt: doc.createdAt,
    }));
  }

  @Delete('documents/:id')
  @ApiOperation({
    summary: 'Eliminar un documento y sus chunks',
    description: 'Elimina el documento de Postgres (cascade borra chunks) y limpia vectores de ChromaDB.',
  })
  @ApiResponse({ status: 200, description: 'Documento eliminado' })
  @ApiResponse({ status: 404, description: 'Documento no encontrado' })
  async deleteDocument(@Param('id') id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: { id: true, title: true, domain: true, _count: { select: { chunks: true } } },
    });

    if (!document) {
      throw new NotFoundException(`Document ${id} not found`);
    }

    // Postgres first (source of truth), then ChromaDB cleanup
    await this.prisma.document.delete({ where: { id } });
    try {
      await this.vectorStoreService.deleteByDocumentId(id, document.domain);
    } catch (error) {
      this.logger.warn(`ChromaDB cleanup failed for ${id}: ${String(error)}`);
    }

    this.logger.log(`Deleted document "${document.title}" (${id}) — ${document._count.chunks} chunks`);

    return {
      deleted: true,
      documentId: id,
      title: document.title,
      chunksDeleted: document._count.chunks,
    };
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Estadísticas del vector store',
    description: 'Devuelve el número total de vectores almacenados en ChromaDB.',
  })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas del vector store',
    schema: {
      example: {
        totalVectors: 1247,
      },
    },
  })
  async getStats() {
    const count = await this.vectorStoreService.getCollectionCount();
    return { totalVectors: count };
  }
}
