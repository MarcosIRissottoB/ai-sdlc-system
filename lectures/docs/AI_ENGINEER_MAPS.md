# Mapas Mentales y Conceptuales — AI Engineer

Guia de referencia rapida con buenas practicas, estrategias y patrones
extraidos del curso completo (M1-M3) y los proyectos (m1p, m2p, m3p).

---

## 1. MAPA MENTAL: Taxonomia de Productos de un AI Engineer

```
                        AI ENGINEER PRODUCTS
                               |
         ┌─────────────────────┼──────────────────────┐
         |                     |                      |
   SINGLE-TASK APIs      RAG SYSTEMS          MULTI-AGENT SYSTEMS
   (M1 / Proyecto 1)    (M2 / Proyecto 2)     (M3 / Proyecto 3)
         |                     |                      |
  ┌──────┴──────┐      ┌──────┴──────┐       ┌───────┴───────┐
  |             |      |             |       |               |
Clasificadores  Resumidores  FAQ Bots    Soporte  Orquestador + Agentes
de tickets     de texto     con RAG    tecnico  especializados (HR,
                                       con RAG  IT, Finance, Legal)
         |                     |                      |
  ┌──────┴──────┐      ┌──────┴──────┐       ┌───────┴───────┐
  |             |      |             |       |               |
JSON           Metricas  Chunking +    Busqueda  Routing por     Tracing +
estructurado   (tokens,  Embeddings   hibrida   intencion       Evaluacion
               latencia,                        (function       (Langfuse/
               costo)                           calling)        LangSmith)
```

---

## 2. MAPA CONCEPTUAL: Pipeline Universal de un AI Engineer

```
┌─────────────────────────────────────────────────────────────────────┐
|                    PIPELINE UNIVERSAL AI ENGINEER                   |
├─────────────────────────────────────────────────────────────────────┤
|                                                                     |
|  FASE 1: DEFINIR          FASE 2: DISENAR          FASE 3: MEDIR  |
|  ┌─────────────┐          ┌─────────────┐          ┌────────────┐ |
|  | Problema →   |          | Prompt v1 → |          | Tokens     | |
|  | Tarea de IA  |    →     | Llamada API  |    →    | Latencia   | |
|  | KPI claro    |          | Validar JSON |          | Costo/req  | |
|  └─────────────┘          └─────────────┘          └────────────┘ |
|         |                        |                        |        |
|         v                        v                        v        |
|  FASE 4: ITERAR           FASE 5: PROTEGER         FASE 6: OPERAR |
|  ┌─────────────┐          ┌─────────────┐          ┌────────────┐ |
|  | Refinar      |          | Guardrails   |          | Monitoreo  | |
|  | prompt       |    →     | Moderacion   |    →    | Alertas    | |
|  | A/B testing  |          | PII masking  |          | Feedback   | |
|  └─────────────┘          └─────────────┘          └────────────┘ |
|                                                                     |
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. MAPA DE DECISIONES: Que Tipo de Sistema Construir

```
Pregunta del negocio
        |
        v
¿Necesita conocimiento externo/privado?
        |
   NO ──┤── SI
   |         |
   v         v
SINGLE-TASK  ¿Multiples dominios/departamentos?
(Proyecto 1)      |
   |         NO ──┤── SI
   |         |         |
   |         v         v
   |     RAG SIMPLE    MULTI-AGENT
   |    (Proyecto 2)   (Proyecto 3)
   |
   ├── Clasificacion → temperature=0.1, JSON forzado, max_tokens bajo
   ├── Resumido → temperature=0.3, evidencia + citas
   ├── Generacion creativa → temperature=0.7-1.0
   └── Extraccion de datos → response_format=json_object
```

---

## 4. BUENAS PRACTICAS POR CAPA

### 4.1 Prompt Engineering (M1L3)

| Estrategia | Cuando usarla | Tokens | Latencia | Calidad |
|---|---|---|---|---|
| Zero-shot | Prototipos, tareas simples | Bajo | Baja | Variable |
| Few-shot | Formato consistente, estilo controlado | Medio | Media | Alta |
| Chain-of-thought | Razonamiento complejo, debugging | Alto | Alta | Muy alta |

**Reglas de oro:**
- Empezar SIEMPRE con zero-shot → medir → escalar si hace falta
- System message corto, estable y especifico del dominio
- Forzar JSON con `response_format={"type": "json_object"}`
- Versionar prompts como codigo (prompt_v1.txt, prompt_v2.txt)
- Medir tokens, latencia y costo por CADA variante

### 4.2 RAG Pipeline (M2)

```
INGESTION PIPELINE                    QUERY PIPELINE
┌────────────────────┐                ┌────────────────────┐
| 1. Cargar docs     |                | 1. Embed query     |
| 2. Chunk (500-1000 |                | 2. Busqueda top-K  |
|    tokens, 10-20%  |                |    (K = 3-10)      |
|    overlap)        |                | 3. Construir prompt|
| 3. Embed chunks    |                |    con contexto    |
| 4. Indexar en      |                | 4. Llamar LLM      |
|    vector store    |                | 5. Validar/citar   |
└────────────────────┘                └────────────────────┘
```

**Reglas de oro:**
- MISMO modelo de embeddings para corpus y queries (misma dimensionalidad)
- Metadata en cada chunk (source, chunk_index, timestamp)
- Presupuesto de tokens: medir ANTES de enviar al LLM
- Cache de embeddings y resultados de retrieval frecuentes
- Deduplicar chunks solapados en top-K
- Provenance obligatoria: cada respuesta debe citar su fuente

### 4.3 Multi-Agent Systems (M3)

```
                    ┌─────────────────┐
                    |  ORQUESTADOR    |
                    |  (clasifica     |
                    |   intencion)    |
                    └───────┬─────────┘
              ┌─────────────┼─────────────┐
              v             v             v
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        | AGENTE   |  | AGENTE   |  | AGENTE   |
        | HR       |  | TECH     |  | FINANCE  |
        | (RAG +   |  | (RAG +   |  | (RAG +   |
        |  docs HR)|  |  docs IT)|  |  docs $) |
        └──────────┘  └──────────┘  └──────────┘
```

**Reglas de oro:**
- Roles claros y sin solapamiento entre agentes
- Handoff con context bundling (no perder info entre agentes)
- Delegacion: ruteo directo, paralelo o secuencial segun la consulta
- El orquestador NO resuelve — solo enruta al especialista
- Tracing obligatorio (Langfuse/LangSmith) en cada paso
- Fallback a humano cuando confianza < umbral

### 4.4 Seguridad y Guardrails (M1L4)

```
ENTRADA                           SALIDA
┌─────────┐                       ┌─────────┐
| INPUT   | ──→ COMPUERTA 1 ──→  | OUTPUT  | ──→ COMPUERTA 2
| usuario |    (sanitizar,        | modelo  |    (mascarar PII,
└─────────┘     rate limit,       └─────────┘     moderar,
                separar canales)                   bloquear/flag)
```

**5 modos de fallo y su defensa:**

| Modo de fallo | Donde ocurre | Defensa clave |
|---|---|---|
| Inyeccion de prompt | Construccion del prompt | Separar canales `<RULES>` / `<USER>`, filtrar frases de control |
| Filtracion de datos | Prompt + logs | Minimizar contexto, redactar PII, hashear logs |
| Sesgo | Inferencia | Prompts neutrales, evaluacion con variantes demograficas |
| Alucinacion | Generacion | RAG + grounding, umbral de confianza, "no lo se" |
| Violacion de privacidad | Entrega de salida | Mascarar PII en output, nunca loguear texto crudo |

---

## 5. MAPA DE OBSERVABILIDAD Y METRICAS

```
┌─────────────────────────────────────────────────────────┐
|              METRICAS QUE TODO AI ENGINEER DEBE MEDIR   |
├──────────────────┬──────────────────┬───────────────────┤
|    CALIDAD       |   RENDIMIENTO    |      COSTO        |
├──────────────────┼──────────────────┼───────────────────┤
| Accuracy         | Latencia p50/p95 | $/1K tokens       |
| Recall@K         | Throughput (QPS) | $/1K requests     |
| Precision@K      | Trace complete-  | Tokens total/mes  |
| Overlap@5        |   ness           | Costo total/mes   |
| Fidelity (RAG)   | Time-to-first-   |                   |
| CSAT (usuario)   |   token          |                   |
└──────────────────┴──────────────────┴───────────────────┘
```

**Logging minimo por request:**
```json
{
  "request_id": "uuid",
  "timestamp": "ISO-8601",
  "model": "gpt-4o-mini",
  "prompt_version": "v3",
  "tokens_input": 42,
  "tokens_output": 58,
  "latency_ms": 340,
  "cost_usd": 0.00063,
  "action": "allow|flag|block",
  "confidence": 0.92
}
```

---

## 6. MAPA DE HERRAMIENTAS DEL AI ENGINEER

```
CAPA                  HERRAMIENTAS
─────────────────────────────────────────────────────────
LLM Providers         OpenAI (GPT-4o/5) | Anthropic (Claude) | Google (Gemini)
Embeddings            text-embedding-3-small | Sentence-Transformers (MiniLM)
Vector Stores         ChromaDB | FAISS | Pinecone | Weaviate | Qdrant
Frameworks            LangChain | LangGraph
Tracing               Langfuse | LangSmith
Evaluacion            Golden datasets | Evaluator agents | nDCG@k, MRR
Tokenizacion          tiktoken
Seguridad             Moderation API | Middleware custom | PII masking
Infraestructura       Docker | PostgreSQL + Prisma | NestJS/FastAPI
```

---

## 7. PATRON DE PROYECTO TIPO (Checklist Universal)

Aplica a cualquier producto de AI Engineer, sea clasificador, RAG o multi-agent:

### Pre-desarrollo
- [ ] Problema de negocio → tarea de IA clara y medible
- [ ] KPI definido (latencia, accuracy, costo, CSAT)
- [ ] Modelo seleccionado con justificacion (costo vs calidad)
- [ ] Prompt v1 diseñado y testeado manualmente

### Desarrollo
- [ ] Structured output (JSON con schema fijo)
- [ ] Metricas por request (tokens, latencia, costo)
- [ ] Al menos 1 test automatizado (validacion JSON, schema)
- [ ] Manejo de errores (retry, backoff, circuit breaker)
- [ ] API keys en variables de entorno (nunca hardcoded)

### Seguridad
- [ ] Input sanitizado (frases de control, PII)
- [ ] Output filtrado (mascarar PII, moderar contenido)
- [ ] Logs sin texto crudo (solo hashes)
- [ ] Fallback a humano para baja confianza

### Produccion
- [ ] Observabilidad (logging estructurado JSON)
- [ ] Dashboard de metricas (latencia, costo, errores)
- [ ] Golden dataset para regression testing
- [ ] Versionado de prompts como codigo
- [ ] Abstraccion de proveedor (cambiar modelo = cambiar config)

### Documentacion
- [ ] README con setup, uso y limitaciones
- [ ] Reporte tecnico con decisiones y trade-offs
- [ ] .env.example con todas las variables
- [ ] requirements.txt con versiones fijadas

---

## 8. ANTI-PATRONES: Lo que NO Hacer

| Anti-patron | Por que falla | Que hacer en cambio |
|---|---|---|
| Elegir el modelo mas caro primero | Gasto innecesario, sin baseline | Empezar con el mas barato que resuelva el problema |
| Prompt sin estructura | Outputs impredecibles | System message + roles + JSON forzado |
| RAG sin metadata en chunks | Respuestas sin citas ni trazabilidad | Siempre incluir source, chunk_index, score |
| Concatenar reglas + input usuario | Vulnerable a inyeccion | Canales separados: `<RULES>`, `<USER>`, `<CONTEXT>` |
| Loguear texto crudo | Violacion de privacidad | Hashear IDs, redactar PII, solo hashes en logs |
| Un solo agente para todo | Cuello de botella, baja precision | Orquestador + agentes especializados por dominio |
| No medir tokens ni costo | Facturas sorpresa | Telemetria desde dia 1: tokens, latencia, $/request |
| Confiar en la primera respuesta del modelo | Alucinaciones sin detectar | Grounding (RAG), umbral de confianza, "no lo se" |
| Hardcodear API keys | Filtracion de secretos | .env + secrets manager, keys separadas por entorno |
| No versionar prompts | Regresiones invisibles | prompt_v1.txt, changelog, tests de regresion |

---

## 9. FLUJO DE MADURACION DE PRODUCTOS IA

```
PROTOTIPO              MVP                    PRODUCCION
(dias)                 (semanas)              (meses)
─────────────────────────────────────────────────────────
Zero-shot prompt   →   Few-shot + JSON    →   RAG + multi-agent
Un solo modelo     →   Abstraccion multi  →   Hibrido + failover
                       proveedor
print() debugging  →   Logging JSON       →   Langfuse/LangSmith
                                               + golden datasets
Sin seguridad      →   Sanitizar input    →   Middleware moderacion
                                               + PII masking
Manual testing     →   1-5 tests          →   CI/CD + regression
                                               suite completo
README basico      →   Reporte tecnico    →   Runbook operativo
                                               + alertas + SLOs
```

---

*Generado a partir del curriculum completo del AI Engineer (M1-M3) y los
proyectos m1p, m2p, m3p. Usar como referencia rapida para tomar decisiones
de arquitectura, diseño de prompts, seguridad y observabilidad en cualquier
producto de IA.*
