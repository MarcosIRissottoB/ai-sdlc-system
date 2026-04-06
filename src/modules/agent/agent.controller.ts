import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiSecurity } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AgentService } from './agent.service';
import { ChatDto } from './dto/chat.dto';

@ApiTags('agent')
@ApiSecurity('api-key')
@Controller('agent')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(private readonly agentService: AgentService) {}

  @Post('chat')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Agente conversacional con tools + memoria',
    description:
      'Agente con tools: busca en el knowledge base, compara enfoques y razona sobre la consulta. ' +
      'Soporta memoria conversacional via sessionId. Sin sessionId se crea una sesión nueva.',
  })
  @ApiBody({
    type: ChatDto,
    examples: {
      new_session: {
        summary: 'Nueva sesión',
        value: {
          message: '¿Qué arquitectura usarías para un sistema RAG con 1M de documentos?',
        },
      },
      continue_session: {
        summary: 'Continuar conversación',
        value: {
          message: '¿Y cómo manejarías el reranking en ese escenario?',
          sessionId: 'clx1234567890',
        },
      },
      with_domain: {
        summary: 'Query con dominio específico',
        value: {
          message: '¿Cuáles son las mejores prácticas para embeddings de código fuente?',
          domain: 'embeddings',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Respuesta del agente con sessionId, tools usadas y fuentes',
    schema: {
      example: {
        answer:
          'Para un sistema RAG con 1M de documentos recomendaría usar ChromaDB con HNSW index configurado con ef=200 y m=16. El chunking debería ser semántico con chunks de ~512 tokens...',
        sessionId: 'clx1234567890',
        toolsUsed: ['search_knowledge_base', 'compare_approaches'],
        sources: [
          {
            source: 'vector-db-benchmark-2024.pdf',
            text: 'ChromaDB HNSW achieves 98% recall@10 at 100k QPS for 1M vectors.',
          },
        ],
      },
    },
  })
  async chat(@Body() dto: ChatDto) {
    this.logger.log(`Agent chat: "${dto.message}" | session: ${dto.sessionId ?? 'new'}`);
    return this.agentService.chat(dto.message, dto.sessionId, dto.domain);
  }
}
