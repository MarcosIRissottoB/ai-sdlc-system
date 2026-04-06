# Analisis del Proyecto — AI SDLC System

**Fecha:** 2026-04-01
**Ultima actualizacion:** 2026-04-05
**Estado:** Pre-produccion (uso personal) — Todas las mejoras implementadas

---

## 1. Features implementados

### Pipeline RAG completo (4 etapas)

| Etapa | Modulo | Descripcion |
|-------|--------|-------------|
| Ingestion | `ingestion/` | Carga de texto, URLs y markdown con chunking inteligente y enriquecimiento via LLM |
| Retrieval | `retrieval/` | Busqueda hibrida: vectorial (ChromaDB) + keyword (PostgreSQL FTS) con Reciprocal Rank Fusion |
| Context Builder | `context-builder/` | Agrupacion por tema, deteccion de contradicciones, compresion de contexto |
| Reasoning | `reasoning/` | Razonamiento con LLM, citacion textual, deduplicacion por similitud Jaccard |

### Ingestion inteligente

- **Smart Chunker**: 3 estrategias de chunking (markdown, codigo, texto plano) con tracking de heading paths
- **Chunk Enricher**: Enriquecimiento batch con LLM (resumen, keywords, tipo de chunk)
- **Deduplicacion**: Deteccion de documentos duplicados por `source` con flag `force` para re-ingestion
- **Endpoints**: `/ingestion/text`, `/ingestion/url`, `/ingestion/raw`

### Retrieval hibrido avanzado

- **Multi-query expansion**: LLM genera variantes de la query para mejorar recall
- **Vector search**: Embeddings con `text-embedding-3-small` via ChromaDB
- **Keyword search**: Full-text search en PostgreSQL como fallback
- **Re-ranking**: LLM re-ordena resultados por relevancia
- **Reciprocal Rank Fusion**: Combina scores de multiples estrategias

### Agente conversacional

- **LangGraph + React pattern**: Agente con herramientas integradas
- **4 tools**: `search_knowledge_base`, `search_by_topic`, `get_knowledge_base_stats`, `compare_approaches`
- **Sesiones persistentes**: Historial de conversacion en PostgreSQL

### AI Architect (orquestador)

- **Pipeline completo** con metricas de latencia
- **Evaluacion de suficiencia**: Multi-signal (score promedio, coverage, distribucion)
- **Query logging**: Registro de consultas con contexto y resultados
- **Score distribution**: Analisis de distribucion de relevancia

### Infraestructura

- **NestJS 11 + Fastify**: Framework con adapter de alto rendimiento
- **Prisma ORM**: Migraciones, schema tipado, seed data
- **Docker Compose**: PostgreSQL 16 + ChromaDB con health checks
- **Swagger/OpenAPI**: Documentacion de API auto-generada
- **Validacion global**: `ValidationPipe` con whitelist y forbidNonWhitelisted
- **TypeScript strict**: `noImplicitAny`, `strictNullChecks` habilitados

### Seguridad

- **API Key Guard**: Proteccion opcional via header `x-api-key` (configurable)
- **Rate Limiting**: ThrottlerModule con TTL y limite configurables
- **SSRF Protection**: Validacion de URLs contra localhost, IPs privadas, DNS rebinding
- **AllExceptionsFilter**: Errores genéricos al cliente, stack traces solo en logs

### Observabilidad

- **Correlation ID por request**: Middleware con `AsyncLocalStorage` — cada log incluye el ID de la request
- **Header `x-request-id`**: Acepta ID del cliente o genera UUID, devuelto en response
- **Logging estructurado**: `logPipelineStep` / `logPipelineError` con correlation ID automatico

---

## 2. Errores criticos — RESUELTOS

### CRIT-01: Migracion destructiva sin backup — RESUELTO

- **Archivo:** `prisma/migrations/20260401000000_add_unique_source_document/migration.sql`
- **Solucion aplicada:** La migracion crea `_backup_duplicate_documents` antes del DELETE y limpia el backup al finalizar.

### CRIT-02: Sin ExceptionFilter global — RESUELTO

- **Archivo:** `src/common/filters/all-exceptions.filter.ts`
- **Solucion aplicada:** `AllExceptionsFilter` captura errores, loguea con stack trace + correlation ID, devuelve JSON generico con `correlationId` al cliente.
- **Registrado en:** `main.ts` via `app.useGlobalFilters()`

### CRIT-03: Sin timeout en llamadas LLM — RESUELTO

- **Solucion aplicada:** Todos los servicios (`retrieval`, `reasoning`, `context-builder`, `agent`, `chunk-enricher`) usan `configService.get('LLM_TIMEOUT', '30000')`.

---

## 3. Errores graves — RESUELTOS

### GRAV-01: Parsing fragil de output LLM — RESUELTO

- **Archivo:** `src/common/utils/llm-json.util.ts`
- **Solucion aplicada:** Utilidad `safeParseLlmJson<T>()` con limpieza de markdown fences, extraccion de JSON, y validacion con Zod.

### GRAV-02: Double JSON serialization en logQuery — RESUELTO

- **Archivo:** `ai-architect.service.ts`
- **Solucion aplicada:** Datos pasados directamente como `Prisma.InputJsonValue` sin `JSON.parse(JSON.stringify(...))`.

### GRAV-03: URL fetch sin timeout ni proteccion SSRF — RESUELTO

- **Archivo:** `ingestion.service.ts`
- **Solucion aplicada:** Timeout con `AbortSignal.timeout(15000)`, validacion SSRF con blacklist de hostnames, DNS rebinding protection, validacion de rangos IP privados. 14 test cases de seguridad.

### GRAV-04: Historial de agente carga sin orden correcto — RESUELTO

- **Archivo:** `agent.service.ts`
- **Solucion aplicada:** `orderBy: { createdAt: 'desc' }` + `take` configurable via `AGENT_HISTORY_LIMIT` + `messages.reverse()` para orden cronologico.

---

## 4. Problemas de calidad — RESUELTOS

### QUAL-01: Valores hardcodeados — RESUELTO

Todos los valores extraidos a `ConfigService` con defaults sensatos:

| Variable | Default | Servicio |
|----------|---------|----------|
| `LLM_TIMEOUT` | 30000 | Todos los servicios con ChatOpenAI |
| `ENRICHER_BATCH_SIZE` | 5 | `chunk-enricher.service.ts` |
| `ENRICHER_TRUNCATE_CHARS` | 600 | `chunk-enricher.service.ts` |
| `AGENT_HISTORY_LIMIT` | 20 | `agent.service.ts` |
| `GROUNDING_THRESHOLD` | 0.5 | `reasoning.service.ts` |
| `INSUFFICIENCY_SCORE_THRESHOLD` | 0.3 | `ai-architect.service.ts` |
| `INSUFFICIENCY_COVERAGE_THRESHOLD` | 0.2 | `ai-architect.service.ts` |

### QUAL-02: Cobertura de tests — RESUELTO

20 spec files con 156 tests cubriendo todos los modulos:

| Area | Spec files | Alcance |
|------|-----------|---------|
| Servicios core | 7 | ai-architect, ingestion, retrieval, context-builder, reasoning, agent, vector-store |
| Utilidades | 3 | llm-json, query-sanitizer, token-estimator |
| Guards/Filters/Middleware | 3 | api-key guard, all-exceptions filter, correlation-id middleware |
| Context | 1 | request-context (AsyncLocalStorage) |
| DTOs | 3 | query, chat, ingest-text |
| Seguridad | 2 | ssrf-protection, citation-verification |
| Integridad | 1 | ingestion-integrity (rollback atomico) |

### QUAL-03: Logging estructurado — RESUELTO

- **Correlation ID**: `AsyncLocalStorage` via middleware, inyectado en todos los logs del pipeline
- **Header `x-request-id`**: Acepta ID externo o genera UUID, devuelto en response headers y error bodies
- **Archivos implementados:**
  - `src/common/context/request-context.ts` — store y helpers
  - `src/common/middleware/correlation-id.middleware.ts` — NestJS middleware
  - `src/common/utils/logger.util.ts` — formato con correlation ID
  - `src/common/filters/all-exceptions.filter.ts` — correlation ID en errores

---

## 5. Resumen ejecutivo

| Categoria | Estado |
|-----------|--------|
| Features completos | 6 modulos principales + infraestructura + seguridad + observabilidad |
| Errores criticos | 3/3 resueltos |
| Errores graves | 4/4 resueltos |
| Problemas de calidad | 3/3 resueltos |
| Test coverage | 20 spec files, 156 tests |

### Fortalezas

- Arquitectura modular limpia con separacion de responsabilidades
- Pipeline RAG bien disenado con multiples estrategias de retrieval
- TypeScript strict con buenas definiciones de tipos
- Uso correcto de dependency injection de NestJS
- Schema de base de datos bien pensado con indices apropiados
- Keyword search con `$queryRaw` correctamente parametrizado (no es SQL injection)
- Seguridad proactiva: SSRF protection, API key guard, rate limiting, exception filter
- Observabilidad: correlation ID por request, logging estructurado
- Cobertura de tests solida: servicios, utilidades, seguridad, DTOs, integridad

---

## 6. Checklist pre-produccion

> Estas tareas NO son necesarias para uso local. Solo deben revisarse si se planea exponer el sistema a internet o a multiples usuarios.
> Referencia completa de hallazgos de seguridad en `SECURITY_AUDIT.md`.

### Seguridad — Obligatorio

- [ ] **API_KEY obligatoria**: Hacer que `ApiKeyGuard` falle si `API_KEY` no esta definida y `NODE_ENV=production`. Actualmente solo loguea un warning. (`src/common/guards/api-key.guard.ts`)
- [ ] **Credenciales de DB**: Reemplazar `user/password` del `docker-compose.yml` por secrets inyectados desde el entorno. No commitear credenciales reales.
- [ ] **HTTPS/TLS**: Configurar TLS termination (reverse proxy como nginx/caddy o cloud load balancer). La app escucha en HTTP plano.
- [ ] **CORS**: Configurar origenes permitidos. Actualmente no hay configuracion de CORS — cualquier origen puede hacer requests.
- [ ] **Swagger en produccion**: Deshabilitar o proteger con auth el endpoint `/docs`. Expone el schema completo de la API.
- [ ] **ChromaDB auth**: Evaluar si la version de ChromaDB soporta autenticacion. Si no, asegurar que el puerto no sea accesible desde fuera del cluster.

### Seguridad — Recomendado

- [ ] **Prompt injection classifier** (SEC-01/SEC-07): La sanitizacion actual es regex-based (blacklist). Para produccion multi-usuario, considerar un clasificador dedicado (modelo LLM pequenio o servicio como Rebuff) que detecte intentos de injection en queries y documentos ingestados.
- [ ] **ACL por dominio** (SEC-04): Si distintos usuarios/equipos tienen dominios con datos sensibles separados, implementar control de acceso por dominio (whitelist por API key o por usuario autenticado). Actualmente cualquier usuario autenticado puede consultar cualquier dominio.
- [ ] **Rate limiting por endpoint**: Los endpoints de ingestion y agente tienen throttling, pero revisar los limites para carga de produccion. El endpoint `/ingestion/raw` acepta hasta 5MB — considerar reducir.

### Infraestructura

- [ ] **Validacion de env vars al startup**: Agregar validacion con Joi o Zod en `ConfigModule.forRoot()` para que la app no arranque si faltan variables criticas (`DATABASE_URL`, `OPENAI_API_KEY`, `API_KEY`).
- [ ] **Bind address**: Cambiar `0.0.0.0` a `127.0.0.1` en `main.ts` si la app va detras de un reverse proxy, o dejarlo si corre en un container.
- [ ] **Health checks para orquestacion**: Agregar endpoints de liveness (`/health/live`) y readiness (`/health/ready`) separados si se usa Kubernetes o similar.
- [ ] **Log levels por entorno**: Configurar nivel de log (`debug`/`info`/`warn`) segun `NODE_ENV`. En produccion no deberian verse logs de debug.
- [ ] **Agregacion de logs**: Configurar envio de logs a un servicio centralizado (Datadog, Loki, CloudWatch) para monitoreo y alertas.

### Calidad

- [ ] **E2E tests**: Agregar tests de integracion del pipeline completo (requiere DB + ChromaDB levantados). Actualmente todos los tests son unitarios con mocks.
- [ ] **Dependency audit**: Ejecutar `npm audit` y resolver vulnerabilidades altas antes de deploy. Algunas dependencias transitivas tienen CVEs conocidos.
- [ ] **Actualizar PROJECT_ANALYSIS.md**: Los conteos de tests (21 suites, 179 tests) y archivos deben mantenerse actualizados si se agregan mas.
