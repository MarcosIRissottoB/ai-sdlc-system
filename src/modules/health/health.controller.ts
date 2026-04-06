import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../database/prisma.service';
import { VectorStoreService } from '../../vector-store/vector-store.service';

interface ServiceStatus {
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  services: {
    postgres: ServiceStatus;
    chromadb: ServiceStatus;
  };
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vectorStore: VectorStoreService,
  ) {}

  @Get()
  @Public()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Health check del sistema',
    description: 'Verifica la conectividad y latencia de PostgreSQL y ChromaDB.',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado del sistema y latencia por servicio',
    schema: {
      example: {
        status: 'ok',
        timestamp: '2026-03-31T12:00:00.000Z',
        services: {
          postgres: { status: 'ok', latencyMs: 3 },
          chromadb: { status: 'ok', latencyMs: 12 },
        },
      },
    },
  })
  async check(): Promise<HealthResponse> {
    const [postgres, chromadb] = await Promise.all([
      this.checkPostgres(),
      this.checkChromadb(),
    ]);

    const allOk = postgres.status === 'ok' && chromadb.status === 'ok';

    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: { postgres, chromadb },
    };
  }

  private async checkPostgres(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (error) {
      return { status: 'error', error: String(error) };
    }
  }

  private async checkChromadb(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      await this.vectorStore.getCollectionCount();
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (error) {
      return { status: 'error', error: String(error) };
    }
  }

  @Get('reconciliation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reconciliacion Postgres vs ChromaDB',
    description:
      'Compara chunk IDs en Postgres contra vector IDs en ChromaDB para detectar desincronizacion.',
  })
  async reconciliation() {
    const [postgresChunks, chromaIds] = await Promise.all([
      this.prisma.chunk.findMany({ select: { id: true } }),
      this.vectorStore.getAllIds(),
    ]);

    const postgresIds = new Set(postgresChunks.map((c) => c.id));
    const chromaSet = new Set(chromaIds);

    const orphanedRecords = [...postgresIds].filter((id) => !chromaSet.has(id));
    const orphanedVectors = [...chromaSet].filter((id) => !postgresIds.has(id));

    return {
      postgresCount: postgresIds.size,
      chromaCount: chromaSet.size,
      orphanedRecords,
      orphanedVectors,
      isConsistent: orphanedRecords.length === 0 && orphanedVectors.length === 0,
    };
  }
}
