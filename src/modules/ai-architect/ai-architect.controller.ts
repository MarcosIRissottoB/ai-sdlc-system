import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiSecurity } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AiArchitectService } from './ai-architect.service';
import { QueryDto } from './dto/query.dto';

@ApiTags('ai-architect')
@ApiSecurity('api-key')
@Controller('ai-architect')
export class AiArchitectController {
  private readonly logger = new Logger(AiArchitectController.name);

  constructor(private readonly aiArchitectService: AiArchitectService) {}

  @Post('query')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pipeline RAG completo — Consultar al AI Engineer',
    description:
      'Ejecuta el pipeline completo: Retrieval (hybrid + multi-query + reranking) → Context Builder → Reasoning → Decision Output estructurado con citas textuales.',
  })
  @ApiBody({
    type: QueryDto,
    examples: {
      minimal: {
        summary: 'Query básico',
        value: {
          query: '¿Qué estrategia de chunking es mejor para documentos técnicos largos?',
        },
      },
      full: {
        summary: 'Query con todas las opciones',
        value: {
          query: '¿Cuándo usar pgvector vs ChromaDB como vector store?',
          topK: 8,
          scoreThreshold: 0.65,
          useHybrid: true,
          useMultiQuery: true,
          useReranking: true,
          compressContext: false,
          domain: 'architecture',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Decisión técnica con citas, razonamiento y trade-offs',
    schema: {
      example: {
        citations: [
          {
            source: 'rag-best-practices.pdf',
            text: 'RAG systems benefit from smaller, focused chunks of 256-512 tokens.',
          },
        ],
        official_sources: [
          {
            source: 'LangChain Docs — Text Splitters',
            text: 'RecursiveCharacterTextSplitter is recommended for most use cases.',
            url: 'https://python.langchain.com/docs/modules/data_connection/document_transformers/',
          },
        ],
        decision: 'Usar chunks de 512 tokens con 10% de overlap para documentos técnicos.',
        reasoning:
          'Basado en la documentación recuperada, chunks más pequeños mejoran la precisión del retrieval sin perder contexto semántico relevante.',
        tradeoffs: [
          'Chunks pequeños pueden perder contexto entre secciones',
          'Chunks grandes aumentan el ruido en el retrieval',
        ],
        examples: ["new RecursiveCharacterTextSplitter({ chunkSize: 512, chunkOverlap: 50 })"],
        metadata: {
          retrievedChunks: 5,
          contextGroups: 2,
          hasContradictions: false,
          insufficientInformation: false,
          latencyMs: 2341,
        },
      },
    },
  })
  async query(@Body() dto: QueryDto) {
    this.logger.log(`Query received: "${dto.query}"`);
    return this.aiArchitectService.query({
      query: dto.query,
      compressContext: dto.compressContext,
      mode: dto.mode,
      decompose: dto.decompose,
      context: dto.context,
      retrievalOptions: {
        topK: dto.topK,
        scoreThreshold: dto.scoreThreshold,
        domain: dto.domain,
        useHybrid: dto.useHybrid,
        useMultiQuery: dto.useMultiQuery,
        useReranking: dto.useReranking,
      },
    });
  }
}
