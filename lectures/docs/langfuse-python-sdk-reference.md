# Langfuse Python SDK -- Referencia Tecnica

**Fuente oficial**: https://langfuse.com/docs/sdk/python
**Repositorio SDK**: https://github.com/langfuse/langfuse-python
**Documentacion oficial**: https://langfuse.com/docs
**Fecha de consulta**: 2026-04-05

---

## 1. Instalacion y configuracion

### 1.1 Instalacion

```bash
pip install langfuse
```

Para la integracion con OpenAI:

```bash
pip install langfuse openai
```

> "The integration supports OpenAI SDK versions `>=0.27.8` with enhanced capabilities for async and streaming in versions `>=1.0.0`."
> -- Source: https://langfuse.com/docs/integrations/openai/python/get-started

### 1.2 Variables de entorno

Las credenciales se obtienen desde la pagina de configuracion del proyecto en Langfuse Cloud o tu instancia self-hosted.

```bash
LANGFUSE_SECRET_KEY="sk-lf-..."
LANGFUSE_PUBLIC_KEY="pk-lf-..."
LANGFUSE_BASE_URL="https://cloud.langfuse.com"  # Region EU (default)
# LANGFUSE_BASE_URL="https://us.cloud.langfuse.com"  # Region US
```

> -- Source: https://langfuse.com/docs/sdk/python

### 1.3 Tabla completa de opciones de configuracion

| Parametro constructor | Variable de entorno | Descripcion | Default | Source |
|---|---|---|---|---|
| `public_key` | `LANGFUSE_PUBLIC_KEY` | Clave publica del proyecto | Requerido | https://langfuse.com/docs/sdk/python |
| `secret_key` | `LANGFUSE_SECRET_KEY` | Clave secreta del proyecto | Requerido | https://langfuse.com/docs/sdk/python |
| `base_url` | `LANGFUSE_BASE_URL` | URL base de la API Langfuse | `https://cloud.langfuse.com` | https://langfuse.com/docs/sdk/python |
| `environment` | `LANGFUSE_ENVIRONMENT` [VERIFICAR] | Categoriza traces por entorno (production, staging, etc.) | `None` | https://github.com/langfuse/langfuse-python (llms.txt) |
| `release` | `LANGFUSE_RELEASE` [VERIFICAR] | Identifica la version/release de la app | `None` | https://github.com/langfuse/langfuse-python (llms.txt) |
| `sample_rate` | `LANGFUSE_SAMPLE_RATE` | Tasa de muestreo para traces (0.0 a 1.0) | `1.0` | https://langfuse.com/docs/integrations/openai/python/get-started |
| `debug` | `LANGFUSE_DEBUG` | Activa logging de debug | `False` | https://langfuse.com/docs/integrations/openai/python/get-started |
| `tracing_enabled` | `LANGFUSE_TRACING_ENABLED` | Habilita/deshabilita tracing globalmente | `True` | https://langfuse.com/docs/integrations/openai/python/get-started |
| -- | `LANGFUSE_OBSERVE_DECORATOR_IO_CAPTURE_ENABLED` | Habilita/deshabilita captura de I/O en decoradores | `True` | https://langfuse.com/docs/sdk/python/decorators |

### 1.4 Inicializacion del cliente

**Via variables de entorno (recomendado para produccion):**

```python
from langfuse import get_client

langfuse = get_client()

# Verificar conexion
if langfuse.auth_check():
    print("Langfuse client is authenticated and ready!")
```

> -- Source: https://langfuse.com/docs/sdk/python

**Via constructor (configuracion explicita):**

```python
from langfuse import Langfuse

langfuse = Langfuse(
    public_key="pk-lf-...",
    secret_key="sk-lf-...",
    base_url="https://cloud.langfuse.com",
    environment="production",
    release="v1.2.3",
    sample_rate=1.0,
    debug=False,
)
```

> -- Source: https://github.com/langfuse/langfuse-python (llms.txt)

**Patron singleton:**

> "If you create multiple `Langfuse` instances with the same `public_key`, the singleton instance is reused."
> -- Source: https://langfuse.com/docs/sdk/python

### 1.5 Flush y shutdown

En aplicaciones de corta duracion (scripts, lambdas, etc.) es OBLIGATORIO llamar a `flush()` para garantizar el envio de eventos:

```python
langfuse.flush()
langfuse.shutdown()
```

> "Call `langfuse.flush()` in short-lived applications to ensure all events reach Langfuse before shutdown."
> -- Source: https://langfuse.com/docs/sdk/python

### 1.6 Caracteristicas clave del SDK

> "Fully async requests, meaning Langfuse adds almost no latency"
> -- Source: https://langfuse.com/docs/sdk/python

> "SDK errors are caught and logged" — los errores del SDK no pueden romper tu aplicacion.
> -- Source: https://langfuse.com/docs/sdk/python/low-level-sdk

> "The Python SDK builds on OpenTelemetry, enabling native integration with third-party instrumentation libraries while supporting Langfuse-specific features like scoring and media handling."
> -- Source: https://langfuse.com/docs/sdk/python/low-level-sdk

---

## 2. Crear traces y spans programaticamente

El SDK Python ofrece tres enfoques de instrumentacion: **context managers**, **decoradores** y **observaciones manuales**.

### 2.1 Context managers (patron principal del low-level SDK)

El metodo `start_as_current_observation()` crea una nueva observacion dentro del contexto de trace actual, gestionando automaticamente el ciclo de vida, captura de errores y relaciones padre-hijo.

```python
from langfuse import get_client

langfuse = get_client()

# Crear un span usando context manager
with langfuse.start_as_current_observation(as_type="span", name="process-request") as span:
    span.update(output="Processing complete")

    # Crear una generation anidada para una llamada LLM
    with langfuse.start_as_current_observation(
        as_type="generation",
        name="llm-response",
        model="gpt-3.5-turbo"
    ) as generation:
        generation.update(output="Generated response")

# Todos los spans se cierran automaticamente al salir de su bloque de contexto
langfuse.flush()
```

> -- Source: https://langfuse.com/docs/sdk/python/low-level-sdk

### 2.2 Parametros de `start_as_current_observation()`

| Parametro | Tipo | Requerido | Descripcion | Source |
|---|---|---|---|---|
| `name` | `string` | Si | Nombre descriptivo de la observacion | https://github.com/langfuse/langfuse-python (llms.txt) |
| `as_type` | `string` | No | Tipo de observacion. Valores: `"span"`, `"generation"`, `"tool"`, `"agent"`, `"chain"`, `"retriever"`, `"embedding"`, `"evaluator"`, `"guardrail"` | https://github.com/langfuse/langfuse-python (llms.txt) |
| `input` | `object` | No | Datos de entrada de la observacion | https://github.com/langfuse/langfuse-python (llms.txt) |
| `output` | `object` | No | Datos de salida. Tipicamente se actualiza tras completar la operacion | https://github.com/langfuse/langfuse-python (llms.txt) |
| `model` | `string` | No | Nombre del modelo para observaciones tipo generation (ej: `"gpt-4"`) | https://github.com/langfuse/langfuse-python (llms.txt) |
| `model_parameters` | `object` | No | Parametros del modelo (ej: `{"temperature": 0.7, "max_tokens": 500}`) | https://github.com/langfuse/langfuse-python (llms.txt) |
| `usage_details` | `object` | No | Detalles de uso de tokens (ej: `{"prompt_tokens": 15, "completion_tokens": 120, "total_tokens": 135}`) | https://github.com/langfuse/langfuse-python (llms.txt) |
| `cost_details` | `object` | No | Detalles de costo (ej: `{"total": 0.0023}`) | https://github.com/langfuse/langfuse-python (llms.txt) |
| `trace_context` | `object` | No | Contexto de trace para vincular a un trace existente (ej: `{"trace_id": "..."}`) | https://github.com/langfuse/langfuse-docs (integration_langgraph.ipynb) |

### 2.3 Ejemplo completo: trace jerarquico con generation y tool

```python
from langfuse import Langfuse

langfuse = Langfuse()

# Crear un root span con context manager
with langfuse.start_as_current_observation(name="process-user-query") as root_span:
    user_query = "What is machine learning?"

    # Crear un generation span anidado para llamadas LLM
    with root_span.start_as_current_observation(
        name="generate-response",
        as_type="generation",
        model="gpt-4",
        input={"messages": [{"role": "user", "content": user_query}]},
        model_parameters={"temperature": 0.7, "max_tokens": 500}
    ) as generation:
        # Simular respuesta LLM
        response = "Machine learning is a subset of artificial intelligence..."

        # Actualizar generation con output y metricas de uso
        generation.update(
            output=response,
            usage_details={
                "prompt_tokens": 15,
                "completion_tokens": 120,
                "total_tokens": 135
            },
            cost_details={"total": 0.0023}
        )

    # Crear una observacion de tipo tool para llamadas a APIs externas
    with root_span.start_as_current_observation(
        name="fetch-related-articles",
        as_type="tool",
        input={"query": user_query}
    ) as tool_span:
        articles = [{"title": "ML Basics", "url": "..."}]
        tool_span.update(output=articles)
```

> -- Source: https://github.com/langfuse/langfuse-python (llms.txt)

### 2.4 Tipos de observacion disponibles

Los tipos soportados por `as_type` son:

| Tipo | Proposito | Source |
|---|---|---|
| `"span"` | Operacion generica (default) | https://github.com/langfuse/langfuse-python (llms.txt) |
| `"generation"` | Llamadas a LLM — soporta metricas extendidas (model, tokens, cost) | https://github.com/langfuse/langfuse-python (llms.txt) |
| `"tool"` | Ejecucion de herramientas externas | https://github.com/langfuse/langfuse-python (llms.txt) |
| `"agent"` | Span de agente en sistemas multi-agente | https://github.com/langfuse/langfuse-python (llms.txt) |
| `"chain"` | Cadena de operaciones | https://github.com/langfuse/langfuse-python (llms.txt) |
| `"retriever"` | Operaciones de retrieval (RAG) | https://github.com/langfuse/langfuse-python (llms.txt) |
| `"embedding"` | Generacion de embeddings | https://github.com/langfuse/langfuse-python (llms.txt) |
| `"evaluator"` | Evaluacion automatica | https://github.com/langfuse/langfuse-python (llms.txt) |
| `"guardrail"` | Validacion de guardrails | https://github.com/langfuse/langfuse-python (llms.txt) |

---

## 3. Decorador `@observe` -- como usarlo

El decorador `@observe()` captura automaticamente inputs, outputs, tiempos y errores de funciones sin modificar la logica interna.

### 3.1 Importacion

```python
from langfuse import observe
# o alternativamente:
from langfuse.decorators import observe
```

> -- Source: https://langfuse.com/docs/sdk/python/decorators

### 3.2 Uso basico

```python
from langfuse import observe

@observe()
def my_data_processing_function(data, parameter):
    return {"processed_data": data, "status": "ok"}

@observe(name="llm-call", as_type="generation")
async def my_async_llm_call(prompt_text):
    return "LLM response"
```

> -- Source: https://langfuse.com/docs/sdk/python/decorators

### 3.3 Parametros del decorador

| Parametro | Tipo | Descripcion | Default | Source |
|---|---|---|---|---|
| `name` | `string` | Nombre personalizado de la observacion | Nombre de la funcion | https://langfuse.com/docs/sdk/python/decorators |
| `as_type` | `string` | Tipo de observacion (`"span"`, `"generation"`, etc.) | `"span"` | https://langfuse.com/docs/sdk/python/decorators |
| `capture_input` | `boolean` | Habilita/deshabilita captura del input | `True` [VERIFICAR: la doc del SDK dice enabled by default, pero la API doc dice False] | https://langfuse.com/docs/sdk/python/decorators |
| `capture_output` | `boolean` | Habilita/deshabilita captura del output | `True` [VERIFICAR: misma discrepancia] | https://langfuse.com/docs/sdk/python/decorators |

### 3.4 Anidamiento automatico

Las jerarquias de llamadas de funciones se capturan automaticamente y se reflejan en los traces:

```python
from langfuse.decorators import observe
from langfuse.openai import openai

@observe()
def story():
    return openai.chat.completions.create(
        model="gpt-4o",
        max_tokens=100,
        messages=[
          {"role": "system", "content": "You are a great storyteller."},
          {"role": "user", "content": "Once upon a time in a galaxy far, far away..."}
        ],
    ).choices[0].message.content

@observe()
def main():
    return story()

main()
```

> -- Source: https://github.com/langfuse/langfuse-docs (blog/2024-04-python-decorator.mdx)

Cuando `main()` llama a `story()`, Langfuse crea automaticamente un trace con `main` como span padre y `story` como span hijo. La llamada a OpenAI queda registrada como una generation anidada dentro de `story`.

### 3.5 Propagacion de atributos con `propagate_attributes()`

Para heredar atributos del trace padre (user_id, session_id, metadata) en funciones hijas:

```python
from langfuse import observe, propagate_attributes

@observe()
def my_llm_pipeline(user_id: str, session_id: str):
    with propagate_attributes(
        user_id=user_id,
        session_id=session_id,
        metadata={"pipeline": "main"}
    ):
        result = call_llm()
        return result

@observe()
def call_llm():
    pass
```

> -- Source: https://langfuse.com/docs/sdk/python/decorators

### 3.6 Establecer I/O a nivel de trace desde funciones decoradas

```python
from langfuse import observe, get_client

@observe()
def process_user_query(user_question: str):
    langfuse = get_client()
    answer = call_llm(user_question)
    langfuse.set_current_trace_io(
        input={"question": user_question},
        output={"answer": answer}
    )
    return answer
```

> -- Source: https://langfuse.com/docs/sdk/python/decorators

### 3.7 Obtener trace URL y IDs desde funciones decoradas

```python
from langfuse import observe, get_client

@observe()
def process_data():
    langfuse = get_client()

    # Obtener la URL del trace actual
    trace_url = langfuse.get_trace_url()
    print(f"View trace at: {trace_url}")

    # O pasar el trace_id explicitamente
    trace_id = langfuse.get_current_trace_id()
    trace_url = langfuse.get_trace_url(trace_id=trace_id)
```

> -- Source: https://langfuse.com/docs/tracing/url

### 3.8 Optimizacion de rendimiento

> "Capturing large inputs/outputs may add overhead. Disable IO capture per decorator (`capture_input=False`, `capture_output=False`) or via the `LANGFUSE_OBSERVE_DECORATOR_IO_CAPTURE_ENABLED` env var."
> -- Source: https://langfuse.com/docs/sdk/python/decorators

---

## 4. Integracion con OpenAI

Langfuse ofrece un **drop-in replacement** para el SDK de OpenAI que habilita observabilidad automatica cambiando SOLO el import.

### 4.1 Import de reemplazo

```python
# Cambiar este unico import para habilitar tracing automatico
from langfuse.openai import openai
```

Imports alternativos basados en clases:

```python
from langfuse.openai import OpenAI, AsyncOpenAI, AzureOpenAI, AsyncAzureOpenAI
```

> -- Source: https://langfuse.com/docs/integrations/openai/python/get-started

### 4.2 Que se trackea automaticamente

> "Langfuse automatically tracks: All prompts/completions with support for streaming, async and functions, Latencies, API Errors, Model usage (tokens) and cost (USD)."
> -- Source: https://langfuse.com/docs/integrations/openai/python/get-started

### 4.3 Ejemplo basico

```python
from langfuse.openai import openai

# Todas las llamadas OpenAI ahora se tracean automaticamente
client = openai.OpenAI()

# Chat completions - traceado automatico con model, tokens, cost
response = client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain quantum computing"}
    ],
    temperature=0.7,
    # Parametros opcionales especificos de Langfuse
    name="quantum-explanation",       # Nombre personalizado del span
    metadata={"user_tier": "premium"},  # Metadata personalizada
    trace_id="existing-trace-id",     # Vincular a un trace existente
)
```

> -- Source: https://github.com/langfuse/langfuse-python (llms.txt)

### 4.4 Propiedades personalizadas en llamadas OpenAI

```python
result = openai.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[
        {"role": "system", "content": "You are a very accurate calculator."},
        {"role": "user", "content": "1 + 1 = "}
    ],
    name="test-chat",
    metadata={
        "langfuse_session_id": "session_123",
        "langfuse_user_id": "user_456",
        "langfuse_tags": ["calculator"],
        "someMetadataKey": "someValue"
    }
)
```

> -- Source: https://langfuse.com/docs/integrations/openai/python/get-started

### 4.5 Streaming con tracking de tokens

Para tracking preciso de tokens en respuestas streamed, habilitar `include_usage`:

```python
from langfuse import get_client
from langfuse.openai import openai

client = openai.OpenAI()

stream = client.chat.completions.create(
  model="gpt-4o",
  messages=[{"role": "user", "content": "How are you?"}],
  stream=True,
  stream_options={"include_usage": True},
)

result = ""

for chunk in stream:
  if chunk.choices:
    result += chunk.choices[0].delta.content or ""

get_client().flush()
```

> -- Source: https://langfuse.com/docs/integrations/openai/python/get-started

### 4.6 Soporte async

```python
from langfuse.openai import openai

async_client = openai.AsyncOpenAI()
async_response = await async_client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello"}]
)
```

> -- Source: https://github.com/langfuse/langfuse-python (llms.txt)

### 4.7 Embeddings tambien se tracean

```python
from langfuse.openai import openai

embeddings = client.embeddings.create(
    model="text-embedding-ada-002",
    input=["Hello world", "Langfuse is great"]
)
```

> -- Source: https://github.com/langfuse/langfuse-python (llms.txt)

### 4.8 Combinacion con `@observe()` para agrupar multiples llamadas

```python
from langfuse import observe
from langfuse.openai import openai

@observe()
def capital_poem_generator(country):
  capital = openai.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[
        {"role": "system", "content": "What is the capital of the country?"},
        {"role": "user", "content": country}],
    name="get-capital",
  ).choices[0].message.content

  poem = openai.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[
        {"role": "system", "content": "You are a poet. Create a poem about this city."},
        {"role": "user", "content": capital}],
    name="generate-poem",
  ).choices[0].message.content
  return poem

capital_poem_generator("Bulgaria")
```

> -- Source: https://langfuse.com/docs/integrations/openai/python/get-started

### 4.9 Combinacion con context managers para atributos avanzados

```python
from langfuse import get_client, propagate_attributes
from langfuse.openai import openai

langfuse = get_client()

with langfuse.start_as_current_observation(as_type="span", name="calculator-request") as span:
    with propagate_attributes(
        session_id="session_123",
        user_id="user_456",
        tags=["calculator"]
    ):
        result = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a very accurate calculator."},
                {"role": "user", "content": "1 + 1 = "}
            ],
            name="test-chat",
            metadata={"someMetadataKey": "someValue"},
        )
```

> -- Source: https://langfuse.com/docs/integrations/openai/python/get-started

### 4.10 Tracking de errores

La integracion captura automaticamente errores de la API de OpenAI via campos `level` y `statusMessage`:

```python
from langfuse.openai import openai

openai.base_url = "https://example.com"

country = openai.chat.completions.create(
  name="will-error",
  model="gpt-3.5-turbo",
  messages=[
      {"role": "user", "content": "How are you?"}],
)
```

> -- Source: https://langfuse.com/docs/integrations/openai/python/get-started

### 4.11 Configuracion programatica del wrapper OpenAI

```python
openai.langfuse_public_key = "pk-lf-..."
openai.langfuse_secret_key = "sk-lf-..."
openai.langfuse_enabled = True
openai.LANGFUSE_BASE_URL = "https://cloud.langfuse.com"
openai.api_key = "sk-..."
```

> -- Source: https://langfuse.com/docs/integrations/openai/python/get-started

### 4.12 Limitaciones

> "Tracing of the assistants api is not supported by this integration"
> -- Source: https://langfuse.com/docs/integrations/openai/python/get-started

---

## 5. Como registrar input, output, tokens consumidos, latencia

### 5.1 Registro automatico (integracion OpenAI)

Al usar el drop-in replacement de OpenAI, tokens, latencia y costo se registran **automaticamente** sin configuracion adicional:

> "Langfuse automatically tracks: All prompts/completions with support for streaming, async and functions, Latencies, API Errors, Model usage (tokens) and cost (USD)."
> -- Source: https://langfuse.com/docs/integrations/openai/python/get-started

### 5.2 Registro manual via context managers

Usar `.update()` sobre la referencia de la observacion:

```python
from langfuse import Langfuse

langfuse = Langfuse()

with langfuse.start_as_current_observation(
    name="my-generation",
    as_type="generation",
    model="gpt-4",
    input={"messages": [{"role": "user", "content": "Hello"}]},
    model_parameters={"temperature": 0.7, "max_tokens": 500}
) as generation:
    response = "Respuesta del LLM..."

    generation.update(
        output=response,
        usage_details={
            "prompt_tokens": 15,
            "completion_tokens": 120,
            "total_tokens": 135
        },
        cost_details={"total": 0.0023}
    )
```

> -- Source: https://github.com/langfuse/langfuse-python (llms.txt)

### 5.3 Campos disponibles para `.update()`

| Campo | Tipo | Descripcion | Source |
|---|---|---|---|
| `input` | `object` | Datos de entrada | https://github.com/langfuse/langfuse-python (llms.txt) |
| `output` | `object` | Datos de salida | https://github.com/langfuse/langfuse-python (llms.txt) |
| `usage_details` | `dict` | Uso de tokens: `{"prompt_tokens": N, "completion_tokens": N, "total_tokens": N}` | https://github.com/langfuse/langfuse-python (llms.txt) |
| `cost_details` | `dict` | Costo: `{"total": float}` | https://github.com/langfuse/langfuse-python (llms.txt) |
| `model` | `string` | Nombre del modelo | https://github.com/langfuse/langfuse-python (llms.txt) |
| `model_parameters` | `dict` | Parametros del modelo | https://github.com/langfuse/langfuse-python (llms.txt) |
| `metadata` | `dict` | Metadata personalizada | https://langfuse.com/docs/sdk/python/low-level-sdk |

### 5.4 Actualizar el span actual sin referencia directa

Dentro de un context manager, se puede usar `update_current_span()` o `update_current_generation()`:

```python
from langfuse import get_client

langfuse = get_client()

with langfuse.start_as_current_observation(as_type="span", name="data-processing"):
    langfuse.update_current_span(metadata={"step1_complete": True})
    langfuse.update_current_span(output={"result": "final_data"})
```

> "The SDK provides `langfuse.update_current_span()` and `langfuse.update_current_generation()` to update the currently active observation in the context (without needing a direct reference to it)."
> -- Source: https://langfuse.com/docs/sdk/python/decorators

### 5.5 Latencia

La latencia se registra **automaticamente** basada en el tiempo de inicio y fin de cada observacion (span, generation, etc.). No se requiere configuracion manual.

> -- Source: inferido del comportamiento documentado de `start_as_current_observation` que gestiona el ciclo de vida automaticamente. https://langfuse.com/docs/sdk/python/low-level-sdk

### 5.6 Analizar metricas de observaciones programaticamente

```python
for obs in trace.observations:
    print(f"  {obs.type}: {obs.name}")
    if obs.type == "GENERATION":
        print(f"    Model: {obs.model}")
        print(f"    Tokens: {obs.usage}")
        print(f"    Cost: {obs.calculated_total_cost}")
```

> -- Source: https://github.com/langfuse/langfuse-python (llms.txt)

---

## 6. Multi-agent tracing -- como crear jerarquias de spans

### 6.1 Concepto

Para sistemas multi-agente donde un agente orquestador usa sub-agentes, Langfuse soporta agrupar todos los spans correspondientes en un unico trace unificado.

> "For multi-agent setups where one LangGraph agent orchestrates or uses other LangGraph agents, Langfuse supports grouping all corresponding spans into a single unified trace. This is accomplished by generating a deterministic trace ID using `Langfuse.create_trace_id()` and passing it to all sub-agents through the `trace_context` parameter when starting observations."
> -- Source: https://github.com/langfuse/langfuse-docs (integration_langgraph.ipynb)

### 6.2 Patron basico: anidamiento automatico con `@observe()`

La forma mas simple de crear jerarquias es anidar funciones decoradas con `@observe()`:

```python
from langfuse import observe
from langfuse.openai import openai

@observe()
def retrieve_context(query: str) -> list:
    """Agente de retrieval"""
    return [{"doc": "relevant content", "score": 0.95}]

@observe(name="llm-generation", as_type="generation")
async def generate_response(query: str, context: list) -> str:
    """Agente de generacion"""
    return "Generated response"

@observe(capture_input=True, capture_output=True)
def process_request(user_id: str, query: str) -> dict:
    """Orquestador principal -- los spans hijos se conectan automaticamente"""
    context = retrieve_context(query)
    return {"response": "Processed response", "sources": context}
```

> -- Source: https://github.com/langfuse/langfuse-python (llms.txt)

### 6.3 Patron avanzado: trace_id compartido entre agentes independientes

Para sistemas donde los agentes son procesos independientes o se ejecutan en diferentes contextos, se usa un `trace_id` compartido via `trace_context`:

**Definir sub-agente como tool:**

```python
from langchain_core.tools import tool

@tool
def langgraph_research(question):
  """Conducts research for various topics."""

  with langfuse.start_as_current_observation(
      name="sub-research-agent",
      trace_context={"trace_id": predefined_trace_id}
  ) as span:
      span.update(input=question)

      response = sub_agent.invoke(
          {"messages": [HumanMessage(content=question)]},
          config={"callbacks": [langfuse_handler]}
      )
    
      span.update(output=response["messages"][1].content)

  return response["messages"][1].content
```

> -- Source: https://github.com/langfuse/langfuse-docs (integration_langgraph.ipynb)

**Invocar agente principal con el mismo trace_id:**

```python
user_question = "What is Langfuse?"

# Usar el trace ID predefinido con trace_context
with langfuse.start_as_current_observation(
    name="main-agent",
    trace_context={"trace_id": predefined_trace_id}
) as span:
    span.update(input=user_question)
 
    # La ejecucion de LangChain sera parte de este trace
    response = main_agent.invoke(
        {"messages": [{"role": "user", "content": user_question}]},
        config={"callbacks": [langfuse_handler]}
    )

    span.update(output=response["messages"][1].content)
 
print(f"Trace ID: {predefined_trace_id}")
```

> -- Source: https://github.com/langfuse/langfuse-docs (integration_langgraph.ipynb)

### 6.4 Propagacion de contexto distribuido

Para obtener el trace_id y observation_id actuales y propagarlos a otros servicios:

```python
from langfuse import get_client

langfuse = get_client()

trace_id = langfuse.get_current_trace_id()
obs_id = langfuse.get_current_observation_id()
```

> -- Source: https://langfuse.com/docs/tracing/url

### 6.5 Sessions para agrupar traces de interacciones multi-turn

```python
from langfuse import observe, propagate_attributes

@observe()
def process_request():
    with propagate_attributes(session_id="your-session-id"):
        result = process_chat_message()
        return result
```

> -- Source: https://langfuse.com/docs/tracing/sessions

---

## 7. Snippet de codigo oficial: tracing de un pipeline multi-agente

### 7.1 Pipeline RAG multi-step con `@observe()` + OpenAI wrapper

Este ejemplo combina el decorador `@observe()` con la integracion OpenAI para tracear un pipeline completo con multiples generaciones anidadas:

```python
from langfuse.openai import openai
from langfuse import observe

@observe()  # decorator to automatically create trace and nest generations
def main(country: str, user_id: str, **kwargs) -> str:
    # nested generation 1: use openai to get capital of country
    capital = openai.chat.completions.create(
      name="geography-teacher",
      model="gpt-4o",
      messages=[
          {"role": "system", "content": "You are a Geography teacher helping students learn the capitals of countries. Output only the capital when being asked."},
          {"role": "user", "content": country}],
      temperature=0,
    ).choices[0].message.content

    # nested generation 2: use openai to write poem on capital
    poem = openai.chat.completions.create(
      name="poet",
      model="gpt-4o",
      messages=[
          {"role": "system", "content": "You are a poet. Create a poem about a city."},
          {"role": "user", "content": capital}],
      temperature=1,
      max_tokens=200,
    ).choices[0].message.content

    return poem

# run main function and let Langfuse decorator do the rest
print(main("Bulgaria", "admin"))
```

> -- Source: https://github.com/langfuse/langfuse-docs (integration_openai_sdk.ipynb)

### 7.2 Pipeline multi-agente completo con context managers (low-level SDK)

Este ejemplo muestra un pipeline con orquestador, retrieval, generacion y tool, usando exclusivamente context managers para control fino:

```python
from langfuse import Langfuse, get_client

langfuse = get_client()

# === Pipeline multi-agente con jerarquia completa ===

with langfuse.start_as_current_observation(
    name="multi-agent-pipeline",
    as_type="span"
) as orchestrator:
    user_query = "What is machine learning?"
    orchestrator.update(input={"query": user_query})

    # --- Agente 1: Retrieval ---
    with orchestrator.start_as_current_observation(
        name="retrieval-agent",
        as_type="retriever",
        input={"query": user_query}
    ) as retriever:
        # Simular busqueda semantica
        chunks = [
            {"text": "ML is a subset of AI...", "score": 0.95},
            {"text": "Neural networks are...", "score": 0.87}
        ]
        retriever.update(output=chunks)

    # --- Agente 2: Generacion LLM ---
    with orchestrator.start_as_current_observation(
        name="reasoning-agent",
        as_type="generation",
        model="gpt-4",
        input={"messages": [
            {"role": "system", "content": "You are an AI architect."},
            {"role": "user", "content": user_query}
        ]},
        model_parameters={"temperature": 0.3, "max_tokens": 1000}
    ) as generation:
        response = "Machine learning is a subset of artificial intelligence..."
        generation.update(
            output=response,
            usage_details={
                "prompt_tokens": 250,
                "completion_tokens": 180,
                "total_tokens": 430
            },
            cost_details={"total": 0.0156}
        )

    # --- Agente 3: Tool call ---
    with orchestrator.start_as_current_observation(
        name="validation-tool",
        as_type="tool",
        input={"response": response, "chunks": chunks}
    ) as tool:
        validation = {"grounded": True, "score": 0.92}
        tool.update(output=validation)

    # Actualizar orquestador con resultado final
    orchestrator.update(output={
        "response": response,
        "validation": validation,
        "sources": chunks
    })

langfuse.flush()
```

> -- Source: Snippet construido a partir de patrones documentados en https://github.com/langfuse/langfuse-python (llms.txt) y https://langfuse.com/docs/sdk/python/low-level-sdk. Los metodos y parametros son exactos de la documentacion; la composicion del pipeline es ilustrativa.

### 7.3 Multi-agente distribuido con trace_id compartido

Patron para cuando los agentes son procesos independientes que deben compartir un trace:

```python
from langfuse import Langfuse

langfuse = Langfuse()

# Generar un trace_id determinista para compartir entre agentes
predefined_trace_id = langfuse.create_trace_id()

# --- Agente principal ---
with langfuse.start_as_current_observation(
    name="main-agent",
    trace_context={"trace_id": predefined_trace_id}
) as main_span:
    main_span.update(input="What is Langfuse?")

    # Delegar a sub-agente (puede estar en otro proceso/servicio)
    with langfuse.start_as_current_observation(
        name="sub-research-agent",
        trace_context={"trace_id": predefined_trace_id}
    ) as sub_span:
        sub_span.update(input="Research about Langfuse")
        # ... logica del sub-agente ...
        sub_span.update(output="Langfuse is an LLM observability platform")

    main_span.update(output="Langfuse is an LLM observability platform")

print(f"Trace ID: {predefined_trace_id}")
```

> -- Source: Patron basado en https://github.com/langfuse/langfuse-docs (integration_langgraph.ipynb). El uso de `create_trace_id()` y `trace_context` es exacto de la documentacion oficial.

---

## Apendice: Resumen rapido de imports

```python
# Cliente
from langfuse import Langfuse, get_client

# Decorador
from langfuse import observe
# o: from langfuse.decorators import observe

# Propagacion de atributos
from langfuse import propagate_attributes

# Integracion OpenAI (drop-in replacement)
from langfuse.openai import openai
# o clases individuales:
from langfuse.openai import OpenAI, AsyncOpenAI, AzureOpenAI, AsyncAzureOpenAI
```

---

## Apendice: Variables de entorno completas

```bash
# === Requeridas ===
LANGFUSE_PUBLIC_KEY="pk-lf-..."
LANGFUSE_SECRET_KEY="sk-lf-..."

# === Opcionales ===
LANGFUSE_BASE_URL="https://cloud.langfuse.com"        # Default: EU region
LANGFUSE_SAMPLE_RATE="1.0"                             # 0.0 a 1.0
LANGFUSE_DEBUG="false"                                 # true/false
LANGFUSE_TRACING_ENABLED="true"                        # true/false
LANGFUSE_OBSERVE_DECORATOR_IO_CAPTURE_ENABLED="true"   # true/false

# === Para integracion OpenAI ===
OPENAI_API_KEY="sk-..."
```

> -- Sources: https://langfuse.com/docs/sdk/python, https://langfuse.com/docs/integrations/openai/python/get-started, https://langfuse.com/docs/sdk/python/decorators
