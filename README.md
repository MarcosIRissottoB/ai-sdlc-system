# AI SDLC System — AI Engineer RAG

Sistema RAG avanzado que actúa como un **AI Engineer senior** especializado en LLMs, RAG, embeddings y sistemas multi-agente. Alimentalo con documentación técnica y consultalo como consultarías a un arquitecto senior que leyó todo lo que le diste.

## Qué hace

Resuelve un problema concreto: **tomar decisiones técnicas fundamentadas en evidencia, no en opinión**.

Ingestás documentación (artículos, docs oficiales, lecturas de cursos, specs internas) y el sistema la fragmenta inteligentemente, la enriquece con metadata semántica, y la indexa. Cuando hacés una consulta técnica, un pipeline de 4 etapas busca la información relevante, la agrupa, detecta contradicciones entre fuentes, y un LLM razona como arquitecto para devolverte una **decisión con citas textuales verificadas, trade-offs y ejemplos prácticos**.

No es un chatbot genérico. Es un knowledge base técnico con inteligencia — las respuestas están ancladas en lo que vos le diste, no en el conocimiento general del modelo.

## Cómo funciona

### Pipeline RAG de 4 etapas

```
Query del usuario
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. RETRIEVAL                                                    │
│    Multi-query expansion (LLM genera variantes de la query)     │
│    Vector search (ChromaDB + cosine similarity)                 │
│    Keyword search (PostgreSQL full-text search)                 │
│    Reciprocal Rank Fusion (unifica rankings, k=60)              │
│    Re-ranking con LLM (puntúa relevancia real)                  │
└─────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. CONTEXT BUILDER                                              │
│    Agrupación por tema/concepto vía LLM                         │
│    Detección de contradicciones entre fuentes                   │
│    Compresión opcional de contexto (reduce hasta 70% tokens)    │
└─────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. REASONING                                                    │
│    GPT-4o razona como arquitecto senior                         │
│    Dos modos: assistant (recomendación libre) / qa (estricto)   │
│    Citas textuales obligatorias — nunca parafrasea              │
│    Deduplicación de citas por similitud Jaccard (0.85)          │
│    Guardrail QA con containment coefficient                     │
└─────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. DECISION OUTPUT                                              │
│    Verificación de citas contra chunks (fuzzy matching 60%)     │
│    Evaluación multi-señal de suficiencia de información         │
│    Métricas: grounding, coverage, citation density              │
│    Logging completo a PostgreSQL                                │
└─────────────────────────────────────────────────────────────────┘
  │
  ▼
JSON estructurado: citas, decisión, razonamiento, trade-offs, ejemplos, métricas
```

### Ingestion inteligente

El sistema no hace chunking genérico. Detecta el tipo de contenido y aplica la estrategia apropiada:

| Tipo | Estrategia |
|------|------------|
| **Markdown** | Chunking por headings con tracking de jerarquía (`# Tema > ## Subtema`) |
| **Código** | Respeta funciones, clases y bloques |
| **Texto plano** | Corta en párrafos y oraciones completas |

Cada chunk se enriquece con LLM: summary, keywords, nivel (básico/intermedio/avanzado) y tipo (concepto/ejemplo/código/arquitectura/referencia). Esto mejora la precisión del retrieval.

Los documentos se segregan por **dominios** (colecciones independientes en ChromaDB): `general`, `rag`, `architecture`, etc.

### Agente conversacional

Además del pipeline RAG one-shot, el sistema tiene un agente conversacional con:

- **LangGraph + ReAct pattern** — el agente decide cuándo y qué herramientas usar
- **4 tools**: búsqueda en knowledge base, búsqueda por tema, estadísticas, comparación de enfoques
- **Memoria por sesión** — persiste historial en PostgreSQL para conversaciones multi-turno

### Calidad y observabilidad

- **Verificación de citas**: cada cita del LLM se verifica contra los chunks recuperados (fuzzy matching)
- **Métricas por query**: retrieval score, grounding score, coverage score, citation density
- **Score distribution**: estadísticas (min, max, avg, p50, p90) logueadas en cada consulta
- **Correlation ID**: trazabilidad de requests de punta a punta
- **Reconciliación**: endpoint para detectar desincronización entre Postgres y ChromaDB

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Framework | NestJS 11 + Fastify |
| Lenguaje | TypeScript (strict) |
| Base de datos | PostgreSQL 16 + Prisma ORM |
| Vector DB | ChromaDB (HNSW, cosine) |
| LLM | OpenAI GPT-4o |
| Embeddings | text-embedding-3-small |
| Orquestación | LangChain + LangGraph |
| Validación | Zod (parsing de JSON del LLM) |
| Testing | Jest + ts-jest |
| Docs | Swagger (OpenAPI) |

## Arquitectura del proyecto

```
src/
├── main.ts                              # Entrypoint: Fastify + Swagger + ValidationPipe
├── app.module.ts                        # Módulo raíz con guards globales
├── database/
│   ├── database.module.ts               # Módulo global de DB
│   └── prisma.service.ts                # Prisma client injectable
├── vector-store/
│   └── vector-store.service.ts          # ChromaDB wrapper (multi-colección)
├── common/
│   ├── types/rag.types.ts               # Tipos del dominio
│   ├── exceptions/rag.exceptions.ts     # Excepciones tipadas
│   ├── context/request-context.ts       # AsyncLocalStorage para correlation ID
│   ├── middleware/correlation-id.middleware.ts
│   ├── filters/all-exceptions.filter.ts # ExceptionFilter global
│   ├── guards/api-key.guard.ts          # Guard de API key (opcional)
│   ├── decorators/public.decorator.ts   # Decorator para rutas sin auth
│   └── utils/
│       ├── logger.util.ts               # Logger con correlation ID
│       ├── llm-json.util.ts             # Parsing robusto de JSON del LLM + Zod
│       ├── query-sanitizer.util.ts      # Sanitización anti prompt-injection
│       └── token-estimator.util.ts      # Estimación de tokens
├── prompts/
│   └── ai-engineer.prompt.ts            # System prompts (assistant + QA)
└── modules/
    ├── ingestion/                       # Carga + chunking + enrichment + embeddings
    │   ├── ingestion.service.ts         # Orquesta la ingesta completa
    │   ├── ingestion.controller.ts      # Endpoints: /text, /url, /raw, /documents, /stats
    │   ├── smart-chunker.service.ts     # 3 estrategias de chunking
    │   └── chunk-enricher.service.ts    # Enrichment batch con LLM
    ├── retrieval/                       # Búsqueda híbrida + multi-query + reranking
    │   └── retrieval.service.ts
    ├── context-builder/                 # Agrupación por tema + contradicciones
    │   └── context-builder.service.ts
    ├── reasoning/                       # Razonamiento con LLM + guardrails
    │   └── reasoning.service.ts
    ├── ai-architect/                    # Orquestador del pipeline + métricas
    │   ├── ai-architect.service.ts
    │   └── ai-architect.controller.ts
    ├── agent/                           # Agente conversacional con tools
    │   ├── agent.service.ts
    │   └── agent.controller.ts
    └── health/                          # Health check + reconciliación
        └── health.controller.ts
```

## Modelo de datos

```
┌─────────────────┐       ┌─────────────────────┐
│    Document      │       │    QueryLog          │
├─────────────────┤       ├─────────────────────┤
│ id               │       │ query                │
│ title            │       │ decision             │
│ source (unique)  │       │ reasoning            │
│ domain           │       │ citations            │
│ rawContent       │       │ scoreMin/Max/Avg     │
│ metadata         │       │ latencyMs            │
└────────┬────────┘       └─────────────────────┘
         │ 1:N
         ▼
┌─────────────────┐       ┌─────────────────────┐
│     Chunk        │       │ ConversationSession  │
├─────────────────┤       ├─────────────────────┤
│ content          │       │ id                   │
│ vectorId         │───►   └────────┬────────────┘
│ summary          │  ChromaDB              │ 1:N
│ keywords[]       │                        ▼
│ level            │       ┌─────────────────────┐
│ chunkType        │       │ ConversationMessage  │
│ tokenCount       │       ├─────────────────────┤
└─────────────────┘       │ role (user/assistant)│
                           │ content              │
                           └─────────────────────┘
```

## Seguridad

| Mecanismo | Detalle |
|-----------|---------|
| **API Key** | Header `x-api-key` (opcional — sin key = modo desarrollo) |
| **Rate limiting** | Configurable por endpoint (30/min general, 10/min queries, 5/min agent) |
| **Prompt injection** | Sanitización de queries antes de interpolación en prompts LLM |
| **SSRF protection** | Validación de URLs: bloquea localhost, IPs privadas, cloud metadata, resolución DNS |
| **Validation** | `whitelist + forbidNonWhitelisted` en todos los endpoints |
| **Error handling** | ExceptionFilter global — loguea stack traces internamente, devuelve JSON genérico |

## Setup rápido

### 1. Clonar y configurar

```bash
cp .env.example .env
# Editar .env con tus credenciales (mínimo: DATABASE_URL + OPENAI_API_KEY)
```

### 2. Levantar infraestructura

```bash
docker-compose up -d
```

### 3. Inicializar base de datos

```bash
npm install
npm run prisma:migrate
npm run prisma:generate
```

### 4. Correr el servidor

```bash
npm run start:dev
```

- API: http://localhost:3000
- Swagger UI: http://localhost:3000/docs
- REST Client: `requests.http`

## Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/ai-architect/query` | **Pipeline RAG completo** — decisión técnica con citas |
| `POST` | `/agent/chat` | **Agente conversacional** — tools + memoria por sesión |
| `POST` | `/ingestion/text` | Ingestar texto/markdown con chunking + enrichment |
| `POST` | `/ingestion/url` | Ingestar desde URL |
| `POST` | `/ingestion/raw` | Ingestar texto plano directo (sin JSON) |
| `GET`  | `/ingestion/documents` | Listar documentos (filtrable por `?domain=`) |
| `DELETE` | `/ingestion/documents/:id` | Eliminar documento + chunks |
| `GET`  | `/ingestion/stats` | Total de vectores en ChromaDB |
| `GET`  | `/health` | Health check (PostgreSQL + ChromaDB) |
| `GET`  | `/health/reconciliation` | Consistencia Postgres vs ChromaDB |
| `GET`  | `/docs` | Swagger UI |

## Ejemplo: pipeline completo

### 1. Ingestar documentación

```bash
curl -X POST http://localhost:3000/ingestion/text \
  -H "Content-Type: application/json" \
  -d '{
    "text": "# RAG Best Practices\n\nRAG systems benefit from smaller chunks...",
    "title": "RAG Best Practices",
    "source": "internal-docs",
    "contentType": "text/markdown",
    "domain": "rag"
  }'
```

### 2. Consultar al AI Engineer

```bash
curl -X POST http://localhost:3000/ai-architect/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Qué estrategia de chunking es mejor para documentos técnicos largos?",
    "domain": "rag"
  }'
```

### 3. Respuesta estructurada

```json
{
  "citations": [
    { "source": "internal-docs", "text": "RAG systems benefit from smaller chunks..." }
  ],
  "decision": "Usar chunks de 512 tokens con 10% de overlap para documentos técnicos.",
  "reasoning": "Basado en la documentación recuperada...",
  "tradeoffs": ["Chunks pequeños pierden contexto", "Chunks grandes aumentan ruido"],
  "examples": ["new RecursiveCharacterTextSplitter({ chunkSize: 512, chunkOverlap: 50 })"],
  "metadata": {
    "retrievedChunks": 5,
    "groundingScore": 0.8,
    "coverageScore": 0.6,
    "verifiedCitations": 3,
    "latencyMs": 2341
  }
}
```

## Variables de entorno

```env
# Requeridas
DATABASE_URL=postgresql://user:password@localhost:5432/ai_sdlc?schema=public
OPENAI_API_KEY=sk-...

# Modelos
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_CHAT_MODEL=gpt-4o

# ChromaDB
CHROMA_HOST=http://localhost:8000
CHROMA_COLLECTION_NAME=ai_engineer_knowledge

# Seguridad (opcionales)
API_KEY=                        # Si se define, protege endpoints con x-api-key
THROTTLE_TTL=60000
THROTTLE_LIMIT=30

# Tuning (opcionales)
LLM_TIMEOUT=30000
MAX_CONTEXT_TOKENS=100000
GROUNDING_THRESHOLD=0.5
RETRIEVAL_TOP_K=5
RETRIEVAL_SCORE_THRESHOLD=0.3
```

## Comandos

```bash
npm run start:dev       # desarrollo con hot-reload
npm run build           # build producción
npm run test            # tests
npm run test:cov        # tests con cobertura
npm run lint            # ESLint
npm run format          # Prettier
npm run prisma:studio   # GUI de la base de datos
npm run prisma:migrate  # aplicar migraciones
```
