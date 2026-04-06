import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { VectorStoreModule } from './vector-store/vector-store.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { RetrievalModule } from './modules/retrieval/retrieval.module';
import { ContextBuilderModule } from './modules/context-builder/context-builder.module';
import { ReasoningModule } from './modules/reasoning/reasoning.module';
import { AiArchitectModule } from './modules/ai-architect/ai-architect.module';
import { AgentModule } from './modules/agent/agent.module';
import { HealthModule } from './modules/health/health.module';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: Number(config.get('THROTTLE_TTL', '60000')),
            limit: Number(config.get('THROTTLE_LIMIT', '30')),
          },
        ],
      }),
    }),
    DatabaseModule,
    VectorStoreModule,
    IngestionModule,
    RetrievalModule,
    ContextBuilderModule,
    ReasoningModule,
    AiArchitectModule,
    AgentModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
