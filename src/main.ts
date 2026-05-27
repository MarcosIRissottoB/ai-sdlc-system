import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, bodyLimit: 5 * 1024 * 1024 }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('AI SDLC System — AI Engineer RAG')
    .setDescription(
      'Sistema RAG avanzado con AI Engineer senior.\n\n' +
        '**Pipeline RAG:** Retrieval (hybrid + multi-query + reranking) → Context Builder → Reasoning → Decision Output\n\n' +
        '**Agente conversacional:** tools + memoria por sesión\n\n' +
        '**Ingesta:** chunking semántico + enrichment + embeddings (text-embedding-3-small)',
    )
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
    .addTag('ai-architect', 'Pipeline RAG completo — decisión técnica fundamentada')
    .addTag('agent', 'Agente conversacional con tools y memoria')
    .addTag('ingestion', 'Carga, chunking e indexación de documentos')
    .addTag('health', 'Estado de los servicios de infraestructura')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  app.getHttpAdapter().getInstance().addContentTypeParser(
    'text/plain',
    { parseAs: 'string', bodyLimit: 5 * 1024 * 1024 },
    (_req: unknown, body: unknown, done: (err: Error | null, result?: unknown) => void) => {
      done(null, body);
    },
  );

  const basePort = Number(process.env['PORT'] ?? 3000);
  const maxRetries = 10;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const port = basePort + attempt;
    try {
      await app.listen(port, '0.0.0.0');
      logger.log(`Application running on: http://localhost:${port}`);
      logger.log(`Swagger docs: http://localhost:${port}/docs`);
      return;
    } catch (err: unknown) {
      const isPortBusy =
        err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EADDRINUSE';
      if (isPortBusy && attempt < maxRetries - 1) {
        logger.warn(`Port ${port} busy, trying ${port + 1}...`);
        continue;
      }
      throw err;
    }
  }
}

bootstrap().catch((err) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start application', err);
  process.exit(1);
});
