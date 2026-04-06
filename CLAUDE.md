# CLAUDE.md — AI SDLC System

## Descripción del proyecto

Sistema RAG avanzado que actúa como AI Engineer senior especializado en LLMs, RAG, embeddings y sistemas multi-agente. Implementa un pipeline interno cerrado de 4 etapas.

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Framework | NestJS 11 + Fastify |
| Lenguaje | TypeScript (strict) |
| Base de datos | PostgreSQL + Prisma |
| Vector DB | ChromaDB |
| LLM / Embeddings | OpenAI (GPT-4o + text-embedding-3-small) |
| Orquestación | LangChain + @langchain/openai |
| Testing | Jest + ts-jest |
| Docs | Swagger (OpenAPI) |

## Arquitectura del pipeline RAG

```
Query
  │
  ▼
[1. RETRIEVAL]
  Busca chunks relevantes en ChromaDB via embeddings
  │
  ▼
[2. CONTEXT BUILDER]
  Ordena por relevancia, agrupa por tema, detecta contradicciones
  │
  ▼
[3. AI ENGINEER REASONING]
  Analiza como arquitecto, evalúa trade-offs, identifica gaps
  │
  ▼
[4. DECISION OUTPUT]
  JSON estructurado con citas, decisión, razonamiento, ejemplos
```

## Estructura del proyecto

```
src/
├── main.ts                          # Entrypoint Fastify + Swagger
├── app.module.ts                    # Módulo raíz
├── database/
│   ├── database.module.ts           # Módulo global de DB
│   └── prisma.service.ts            # Prisma client injectable
├── vector-store/
│   ├── vector-store.module.ts
│   └── vector-store.service.ts      # ChromaDB wrapper
├── common/
│   ├── types/rag.types.ts           # Tipos TypeScript del dominio
│   ├── exceptions/rag.exceptions.ts # Excepciones tipadas
│   ├── context/request-context.ts   # AsyncLocalStorage para correlation ID
│   ├── middleware/correlation-id.middleware.ts # Middleware de correlation ID
│   ├── filters/all-exceptions.filter.ts       # ExceptionFilter global
│   ├── guards/api-key.guard.ts      # Guard de API key opcional
│   ├── decorators/public.decorator.ts # Decorator para rutas públicas
│   └── utils/
│       ├── logger.util.ts           # Logger con correlation ID
│       ├── llm-json.util.ts         # Parsing robusto de JSON del LLM + Zod
│       ├── query-sanitizer.util.ts  # Sanitización de queries
│       └── token-estimator.util.ts  # Estimación de tokens
├── prompts/
│   └── ai-engineer.prompt.ts        # Prompts del agente
└── modules/
    ├── ingestion/                   # Carga + chunking + embeddings
    ├── retrieval/                   # Búsqueda semántica
    ├── context-builder/             # Agrupación + detección de contradicciones
    ├── reasoning/                   # Razonamiento con LLM
    └── ai-architect/                # Orquestador del pipeline completo
prisma/
└── schema.prisma                    # Document, Chunk, QueryLog
```

## Comandos esenciales

```bash
# Desarrollo
npm run start:dev

# Build producción
npm run build && npm run start:prod

# Tests
npm run test
npm run test:cov

# Prisma
npm run prisma:generate   # Generar cliente
npm run prisma:migrate    # Aplicar migraciones
npm run prisma:studio     # GUI de DB

# Lint / Format
npm run lint
npm run format
```

## Variables de entorno requeridas

```env
DATABASE_URL=postgresql://user:password@localhost:5432/ai_sdlc?schema=public
OPENAI_API_KEY=sk-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_CHAT_MODEL=gpt-4o
CHROMA_HOST=http://localhost:8000
CHROMA_COLLECTION_NAME=ai_engineer_knowledge
```

## Endpoints principales

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/ai-architect/query` | **Pipeline principal** — consulta al AI Engineer |
| POST | `/agent/chat` | **Agente conversacional** — multi-turn con tools y memoria |
| POST | `/ingestion/text` | Ingestar texto o markdown (soporta `domain`) |
| POST | `/ingestion/url` | Ingestar desde URL |
| POST | `/ingestion/raw` | Ingestar texto plano directo (query params para metadata) |
| GET | `/ingestion/documents` | Listar documentos ingestados (filtrable por `?domain=`) |
| DELETE | `/ingestion/documents/:id` | Eliminar documento + chunks |
| GET | `/ingestion/stats` | Estadísticas del vector store |
| GET | `/health` | Health check (público, sin auth) |
| GET | `/health/reconciliation` | Verificar consistencia Postgres vs ChromaDB |
| GET | `/docs` | Swagger UI |

## Output del pipeline

```json
{
  "citations": [
    { "source": "fuente", "text": "cita textual exacta" }
  ],
  "official_sources": [
    { "source": "docs oficiales", "text": "cita exacta", "url": "https://..." }
  ],
  "decision": "decisión técnica clara",
  "reasoning": "razonamiento detallado",
  "tradeoffs": ["trade-off 1", "trade-off 2"],
  "examples": ["ejemplo práctico 1"],
  "metadata": {
    "retrievedChunks": 5,
    "contextGroups": 2,
    "hasContradictions": false,
    "insufficientInformation": false,
    "latencyMs": 1234
  }
}
```

## Reglas de desarrollo

1. **TypeScript strict**: sin `any`, sin `as unknown`, tipos explícitos
2. **Módulos independientes**: cada etapa del pipeline es un módulo NestJS aislado
3. **Comunicación vía JSON**: los módulos se comunican solo mediante tipos definidos en `common/types`
4. **Sin mezcla de responsabilidades**: ingestion solo chunking, retrieval solo búsqueda, etc.
5. **Logging claro**: usar `logPipelineStep()` para cada etapa del pipeline
6. **Citas textuales**: el LLM debe citar textualmente, nunca parafrasear

## Patrones de diseño

- **Module pattern** de NestJS para cada etapa del pipeline
- **Repository pattern** implícito via PrismaService
- **Dependency injection** para todos los servicios
- **Strategy pattern** para opciones de retrieval configurables

## Infraestructura local (docker-compose recomendado)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ai_sdlc
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"

  chromadb:
    image: chromadb/chroma:latest
    ports:
      - "8000:8000"
```

## Variables opcionales

```env
API_KEY=                        # Si se define, protege endpoints con header x-api-key. Si no, modo abierto (desarrollo local)
THROTTLE_TTL=60000              # Ventana de rate limiting en ms (default: 60s)
THROTTLE_LIMIT=30               # Max requests por ventana (default: 30)
MAX_CONTEXT_TOKENS=100000       # Max tokens para contexto en reasoning (default: 100K)
GROUNDING_THRESHOLD=0.5         # Min containment score para QA grounding (default: 0.5)
```

## Backups

```bash
# Crear backup
docker exec ai_sdlc_postgres pg_dump -U user -d ai_sdlc --format=custom > backups/ai_sdlc_$(date +%Y%m%d_%H%M%S).dump

# Restaurar backup
docker exec -i ai_sdlc_postgres pg_restore -U user -d ai_sdlc --clean < backups/nombre_del_backup.dump
```

## Contexto del negocio

Este sistema es parte de un AI-driven SDLC pipeline. El AI Engineer RAG es el componente de decisión técnica: recibe queries de arquitectura y devuelve decisiones fundamentadas en documentación ingestada previamente.
