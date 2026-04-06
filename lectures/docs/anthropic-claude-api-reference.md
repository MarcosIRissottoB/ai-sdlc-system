# Anthropic Claude API — Referencia Tecnica
**Fuente oficial**: https://platform.claude.com/docs/en/home (antes https://docs.anthropic.com)
**Fecha de consulta**: 2026-04-05

---

## Tabla de Contenidos

1. [Tool Use / Function Calling](#1-tool-use--function-calling)
2. [Vision Capabilities](#2-vision-capabilities)
3. [Structured Outputs](#3-structured-outputs)
4. [Diferencias Clave con OpenAI](#4-diferencias-clave-con-openai)
5. [Pricing por Modelo](#5-pricing-por-modelo)
6. [Snippets de Codigo Oficial](#6-snippets-de-codigo-oficial)

---

## 1. Tool Use / Function Calling

**Fuente**: https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/implement-tool-use

### 1.1 Concepto General

> "Tool use lets Claude call functions you define or that Anthropic provides. Claude decides when to call a tool based on the user's request and the tool's description, then returns a structured call that your application executes (client tools) or that Anthropic executes (server tools)."
> -- Source: https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/implement-tool-use

Hay dos tipos de tools:
- **Client tools**: se ejecutan en tu aplicacion (tu defines la logica)
- **Server tools**: se ejecutan en la infraestructura de Anthropic (web_search, code_execution, web_fetch, tool_search)

### 1.2 Definicion de Tools — Schema

Cada tool se define con los siguientes parametros:

| Parametro | Descripcion |
|-----------|-------------|
| `name` | Nombre del tool. Debe cumplir regex `^[a-zA-Z0-9_-]{1,64}$` |
| `description` | Descripcion detallada en texto plano de lo que hace el tool |
| `input_schema` | Objeto JSON Schema que define los parametros esperados |
| `input_examples` | (Opcional) Array de objetos de ejemplo para ayudar a Claude |
| `strict` | (Opcional) `true` para habilitar validacion estricta de schema |

> Source: https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/implement-tool-use

#### Ejemplo de definicion de tool (JSON):

```json
{
  "name": "get_weather",
  "description": "Get the current weather in a given location",
  "input_schema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "The city and state, e.g. San Francisco, CA"
      },
      "unit": {
        "type": "string",
        "enum": ["celsius", "fahrenheit"],
        "description": "The unit of temperature, either 'celsius' or 'fahrenheit'"
      }
    },
    "required": ["location"]
  }
}
```

> Source: https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/implement-tool-use

### 1.3 Flujo Completo de Tool Use

El flujo involucra multiples intercambios de mensajes:

1. Envias a Claude un mensaje con tools disponibles en el parametro `tools`
2. Claude analiza el request y decide si usar un tool
3. Si lo usa, la respuesta contiene un bloque `tool_use` con `name`, `id` e `input`
4. Tu ejecutas el tool con esos parametros
5. Envias el resultado de vuelta a Claude en un mensaje con `tool_result`
6. Claude incorpora la informacion en su respuesta final

### 1.4 Respuesta de Claude cuando usa un Tool

Cuando Claude decide usar un tool, el `stop_reason` es `"tool_use"` y la respuesta contiene bloques de contenido:

```json
{
  "id": "msg_01Aq9w938a90dw8q",
  "model": "claude-opus-4-6",
  "stop_reason": "tool_use",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "I'll check the current weather in San Francisco for you."
    },
    {
      "type": "tool_use",
      "id": "toolu_01A09q90qw90lq917835lq9",
      "name": "get_weather",
      "input": { "location": "San Francisco, CA", "unit": "celsius" }
    }
  ]
}
```

> Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

### 1.5 Formato de tool_result

Despues de ejecutar el tool, envias el resultado de vuelta como un mensaje `user` con bloques `tool_result`:

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
      "content": "15 degrees"
    }
  ]
}
```

> Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

**Reglas importantes de formato**:
- Los bloques `tool_result` DEBEN ir inmediatamente despues de los bloques `tool_use` correspondientes en el historial
- En el mensaje user que contiene tool results, los bloques `tool_result` deben ir PRIMERO en el array de content. Cualquier texto debe ir DESPUES de todos los tool results

#### Tool result con error:

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
      "content": "ConnectionError: the weather service API is not available (HTTP 500)",
      "is_error": true
    }
  ]
}
```

> Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

#### Tool result con imagenes:

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
      "content": [
        { "type": "text", "text": "15 degrees" },
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": "/9j/4AAQSkZJRg..."
          }
        }
      ]
    }
  ]
}
```

> Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

### 1.6 tool_choice — Control de cuando Claude usa Tools

> "When working with the tool_choice parameter, there are four possible options:
> - `auto` allows Claude to decide whether to call any provided tools or not. This is the default value when `tools` are provided.
> - `any` tells Claude that it must use one of the provided tools, but doesn't force a particular tool.
> - `tool` forces Claude to always use a particular tool.
> - `none` prevents Claude from using any tools. This is the default value when no `tools` are provided."
> -- Source: https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/implement-tool-use

Para forzar un tool especifico:

```text
tool_choice = {"type": "tool", "name": "get_weather"}
```

**Nota importante sobre Extended Thinking**:
> "When using extended thinking with tool use, `tool_choice: {"type": "any"}` and `tool_choice: {"type": "tool", "name": "..."}` are not supported and will result in an error. Only `tool_choice: {"type": "auto"}` (the default) and `tool_choice: {"type": "none"}` are compatible with extended thinking."
> -- Source: https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/implement-tool-use

### 1.7 Strict Tool Use

> "Setting `strict: true` on a tool definition uses grammar-constrained sampling to guarantee Claude's tool inputs match your JSON Schema."
> -- Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use

Cuando `strict: true` esta habilitado:
- El `input` del tool sigue **estrictamente** el `input_schema`
- El `name` siempre es valido (de los tools proporcionados)
- No necesitas validar ni reintentar tool calls
- Elimina errores de tipos incompatibles (`"2"` en lugar de `2`)

### 1.8 Tokens adicionales por Tool Use

> "When you use `tools`, we also automatically include a special system prompt for the model which enables tool use."
> -- Source: https://platform.claude.com/docs/en/docs/about-claude/pricing

| Modelo | tool_choice `auto`/`none` | tool_choice `any`/`tool` |
|--------|--------------------------|-------------------------|
| Claude Opus 4.6 | 346 tokens | 313 tokens |
| Claude Sonnet 4.6 | 346 tokens | 313 tokens |
| Claude Haiku 4.5 | 346 tokens | 313 tokens |

> Source: https://platform.claude.com/docs/en/docs/about-claude/pricing

### 1.9 input_examples — Ejemplos de uso del Tool

Se puede agregar un campo opcional `input_examples` con un array de objetos de ejemplo que deben ser validos segun el `input_schema`:

```json
{
  "name": "get_weather",
  "description": "Get the current weather in a given location",
  "input_schema": {
    "type": "object",
    "properties": {
      "location": { "type": "string" },
      "unit": { "type": "string", "enum": ["celsius", "fahrenheit"] }
    },
    "required": ["location"]
  },
  "input_examples": [
    { "location": "San Francisco, CA", "unit": "fahrenheit" },
    { "location": "Tokyo, Japan", "unit": "celsius" },
    { "location": "New York, NY" }
  ]
}
```

> "Examples are included in the prompt alongside your tool schema, showing Claude concrete patterns for well-formed tool calls. [...] Token cost: ~20-50 tokens for simple examples, ~100-200 tokens for complex nested objects."
> -- Source: https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/implement-tool-use

### 1.10 Best Practices para Definicion de Tools

Directamente de la documentacion oficial:

> "- **Provide extremely detailed descriptions.** This is by far the most important factor in tool performance. Your descriptions should explain every detail about the tool. [...] Aim for at least 3-4 sentences per tool description, more if the tool is complex.
> - **Consolidate related operations into fewer tools.** Rather than creating a separate tool for every action (`create_pr`, `review_pr`, `merge_pr`), group them into a single tool with an `action` parameter.
> - **Use meaningful namespacing in tool names.** When your tools span multiple services or resources, prefix names with the service (e.g., `github_list_prs`, `slack_send_message`).
> - **Design tool responses to return only high-signal information.** Return semantic, stable identifiers (e.g., slugs or UUIDs) rather than opaque internal references."
> -- Source: https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/implement-tool-use

---

## 2. Vision Capabilities

**Fuente**: https://platform.claude.com/docs/en/docs/build-with-claude/vision

### 2.1 Formatos Soportados

> "Claude currently supports JPEG, PNG, GIF, and WebP image formats, specifically:
> - `image/jpeg`
> - `image/png`
> - `image/gif`
> - `image/webp`"
> -- Source: https://platform.claude.com/docs/en/docs/build-with-claude/vision

### 2.2 Limites de Imagenes

| Limite | Valor |
|--------|-------|
| Tamano maximo por imagen (API) | 5 MB |
| Tamano maximo por imagen (claude.ai) | 10 MB |
| Tamano maximo en pixeles | 8000x8000 px |
| Si > 20 imagenes en un request | Limite baja a 2000x2000 px |
| Max imagenes por request (API) | 600 (100 para modelos con 200k context) |
| Max imagenes por turno (claude.ai) | 20 |

> Source: https://platform.claude.com/docs/en/docs/build-with-claude/vision

### 2.3 Tres Metodos de Input de Imagenes

#### Metodo 1: Base64-encoded

```json
{
  "type": "image",
  "source": {
    "type": "base64",
    "media_type": "image/jpeg",
    "data": "<BASE64_IMAGE_DATA>"
  }
}
```

#### Metodo 2: URL

```json
{
  "type": "image",
  "source": {
    "type": "url",
    "url": "https://upload.wikimedia.org/wikipedia/commons/a/a7/Camponotus_flavomarginatus_ant.jpg"
  }
}
```

#### Metodo 3: Files API (upload una vez, referencia multiples veces)

```json
{
  "type": "image",
  "source": {
    "type": "file",
    "file_id": "file_abc123"
  }
}
```

> "For images you'll use repeatedly or when you want to avoid encoding overhead, use the Files API. Upload the image once, then reference the returned `file_id` in subsequent messages instead of resending base64 data."
> -- Source: https://platform.claude.com/docs/en/docs/build-with-claude/vision

### 2.4 Calculo de Costos de Imagenes

> "If your image does not need to be resized, you can estimate the number of tokens used through this algorithm: `tokens = (width px * height px)/750`"
> -- Source: https://platform.claude.com/docs/en/docs/build-with-claude/vision

Tabla de costos basada en Claude Sonnet 4.6 ($3/MTok input):

| Tamano de imagen | # de Tokens | Costo / imagen | Costo / 1k imagenes |
|-----------------|-------------|----------------|---------------------|
| 200x200 px (0.04 megapixels) | ~54 | ~$0.00016 | ~$0.16 |
| 1000x1000 px (1 megapixel) | ~1334 | ~$0.004 | ~$4.00 |
| 1092x1092 px (1.19 megapixels) | ~1590 | ~$0.0048 | ~$4.80 |

> Source: https://platform.claude.com/docs/en/docs/build-with-claude/vision

### 2.5 Tamanos optimos sin redimensionamiento

> "To improve time-to-first-token, consider resizing images to no more than 1.15 megapixels (and within 1568 pixels in both dimensions)."
> -- Source: https://platform.claude.com/docs/en/docs/build-with-claude/vision

| Aspect ratio | Tamano imagen |
|-------------|---------------|
| 1:1 | 1092x1092 px |
| 3:4 | 951x1268 px |
| 2:3 | 896x1344 px |
| 9:16 | 819x1456 px |
| 1:2 | 784x1568 px |

### 2.6 Limitaciones de Vision

Directamente de la documentacion:

> "- **People identification**: Claude cannot be used to name people in images and refuses to do so.
> - **Accuracy**: Claude may hallucinate or make mistakes when interpreting low-quality, rotated, or very small images under 200 pixels.
> - **Spatial reasoning**: Claude's spatial reasoning abilities are limited. It may struggle with tasks requiring precise localization or layouts.
> - **Counting**: Claude can give approximate counts of objects in an image but may not always be precisely accurate.
> - **AI generated images**: Claude does not know if an image is AI-generated and may be incorrect if asked.
> - **Healthcare applications**: While Claude can analyze general medical images, it is not designed to interpret complex diagnostic scans such as CTs or MRIs."
> -- Source: https://platform.claude.com/docs/en/docs/build-with-claude/vision

### 2.7 Best Practice: Imagenes antes del texto

> "Just as placing long documents before your query improves results in text prompts, Claude works best when images come before text. Images placed after text or interpolated with text still perform well, but if your use case allows it, prefer an image-then-text structure."
> -- Source: https://platform.claude.com/docs/en/docs/build-with-claude/vision

---

## 3. Structured Outputs

**Fuente**: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

### 3.1 Dos Mecanismos Complementarios

> "Structured outputs constrain Claude's responses to follow a specific schema, ensuring valid, parseable output for downstream processing. Two complementary features are available:
> - **JSON outputs** (`output_config.format`): Get Claude's response in a specific JSON format
> - **Strict tool use** (`strict: true`): Guarantee schema validation on tool names and inputs"
> -- Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

**Modelos soportados**: Claude Opus 4.6, Claude Sonnet 4.6, Claude Sonnet 4.5, Claude Opus 4.5, y Claude Haiku 4.5 (GA en API y Amazon Bedrock).

### 3.2 JSON Outputs con output_config.format

El approach nativo de Anthropic usa `output_config.format` con un JSON Schema:

```json
{
  "model": "claude-opus-4-6",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": "Extract the key information from this email: John Smith (john@example.com)..."
    }
  ],
  "output_config": {
    "format": {
      "type": "json_schema",
      "schema": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "email": { "type": "string" },
          "plan_interest": { "type": "string" },
          "demo_requested": { "type": "boolean" }
        },
        "required": ["name", "email", "plan_interest", "demo_requested"],
        "additionalProperties": false
      }
    }
  }
}
```

> Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

La respuesta viene en `response.content[0].text` como JSON valido:

```json
{
  "name": "John Smith",
  "email": "john@example.com",
  "plan_interest": "Enterprise",
  "demo_requested": true
}
```

### 3.3 Strict Tool Use (el otro approach)

Ademas de `output_config.format`, se puede usar `strict: true` en la definicion del tool para garantizar que los inputs del tool cumplan exactamente con el schema:

```json
{
  "name": "get_weather",
  "description": "Get the current weather",
  "strict": true,
  "input_schema": {
    "type": "object",
    "properties": {
      "location": { "type": "string" },
      "unit": { "type": "string", "enum": ["celsius", "fahrenheit"] }
    },
    "required": ["location"],
    "additionalProperties": false
  }
}
```

> Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use

### 3.4 Migracion desde Beta

> "The `output_format` parameter has moved to `output_config.format`, and beta headers are no longer required. The old beta header (`structured-outputs-2025-11-13`) and `output_format` parameter will continue working for a transition period."
> -- Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

### 3.5 Garantias de Structured Outputs

> "Structured outputs guarantee schema-compliant responses through constrained decoding:
> - **Always valid**: No more `JSON.parse()` errors
> - **Type safe**: Guaranteed field types and required fields
> - **Reliable**: No retries needed for schema violations"
> -- Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

### 3.6 Integracion con SDKs Nativos

Los SDKs ofrecen integraciones con librerias de schema nativas:

| Lenguaje | Herramienta | Metodo |
|----------|-------------|--------|
| Python | Pydantic | `client.messages.parse()` |
| TypeScript | Zod | `zodOutputFormat()` |
| Java | Clases Java | `outputConfig(Class<T>)` |
| Ruby | `Anthropic::BaseModel` | `output_config: {format: Model}` |
| C#, Go, PHP | JSON Schema crudo | `output_config` directo |

> Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

---

## 4. Diferencias Clave con OpenAI

> Source principal para comparacion: https://platform.claude.com/docs/en/api/openai-sdk , https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

### 4.1 Arquitectura de Mensajes

| Aspecto | Anthropic (Claude) | OpenAI (GPT) |
|---------|-------------------|---------------|
| Estructura de respuesta | Content blocks: arrays de `text`, `image`, `tool_use`, `tool_result` | Choices con `message` y `tool_calls` separados |
| Role para tool results | `user` con bloque `tool_result` | Role especial `tool` |
| Tool calls en respuesta | Bloque `type: "tool_use"` dentro de `content[]` | Campo separado `tool_calls[]` |
| Stop reason para tools | `"tool_use"` | `"tool_calls"` |
| ID del tool call | `id` en el bloque `tool_use` | `id` en `tool_calls[].id` |

> "Unlike APIs that separate tool use or use special roles like `tool` or `function`, the Claude API integrates tools directly into the `user` and `assistant` message structure. Messages contain arrays of `text`, `image`, `tool_use`, and `tool_result` blocks."
> -- Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

### 4.2 Definicion de Tools

| Aspecto | Anthropic | OpenAI |
|---------|-----------|--------|
| Schema location | `input_schema` directamente en el tool | `parameters` dentro de `function` |
| Wrapper | Sin wrapper: `tools[].input_schema` | Con wrapper: `tools[].function.parameters` |
| Nombre del campo | `name`, `description`, `input_schema` | `type: "function"`, `function: { name, description, parameters }` |
| Strict mode | `strict: true` en el tool | `strict: true` en `function` |
| Ejemplos | `input_examples` nativo | No tiene equivalente directo |

### 4.3 Structured Outputs

| Aspecto | Anthropic | OpenAI |
|---------|-----------|--------|
| Parametro | `output_config.format` con `type: "json_schema"` | `response_format` con `type: "json_schema"` |
| Tool-based approach | `strict: true` en tools | `strict: true` en functions |
| JSON mode simple | No tiene `json_object` mode sin schema [VERIFICAR] | `response_format: { type: "json_object" }` |
| Nombre del campo | `output_config.format.schema` | `response_format.json_schema.schema` |

### 4.4 Vision

| Aspecto | Anthropic | OpenAI |
|---------|-----------|--------|
| Tipo de bloque | `type: "image"` con `source` | `type: "image_url"` con `image_url` |
| Base64 | `source: { type: "base64", media_type, data }` | `image_url: { url: "data:image/jpeg;base64,..." }` |
| URL directa | `source: { type: "url", url }` | `image_url: { url }` |
| Files API | `source: { type: "file", file_id }` | Referencia por file ID en Assistants |
| Formatos | JPEG, PNG, GIF, WebP | JPEG, PNG, GIF, WebP |
| Max tamano | 5 MB API / 8000x8000 px | 20 MB |
| Max imagenes/request | 600 (API) | Sin limite explicito documentado [VERIFICAR] |

### 4.5 Context Windows y Output

| Aspecto | Anthropic (Opus 4.6) | OpenAI (GPT-4o) |
|---------|----------------------|-----------------|
| Context window | 1M tokens | 128K tokens |
| Max output | 128K tokens | 16K tokens |
| Pricing input | $5/MTok | $2.50/MTok [VERIFICAR - precios OpenAI cambian frecuentemente] |
| Pricing output | $25/MTok | $10/MTok [VERIFICAR] |

### 4.6 Compatibilidad SDK OpenAI

> "OpenAI SDK compatibility" esta disponible: se puede usar el SDK de OpenAI para llamar a Claude cambiando el `base_url`.
> -- Source: https://platform.claude.com/docs/en/api/openai-sdk

**Advertencia**: 
> "The `strict` parameter for function calling is ignored, meaning the tool use JSON is not guaranteed to follow the supplied schema. For guaranteed schema conformance, use the native Claude API with Structured Outputs."
> -- Source implicita: https://platform.claude.com/docs/en/api/openai-sdk

---

## 5. Pricing por Modelo

**Fuente**: https://platform.claude.com/docs/en/docs/about-claude/pricing

### 5.1 Modelos Actuales (Latest)

| Modelo | Input | Output | Context Window | Max Output | Cache Write (5m) | Cache Write (1h) | Cache Hit |
|--------|-------|--------|----------------|------------|-----------------|-----------------|-----------|
| **Claude Opus 4.6** | $5/MTok | $25/MTok | 1M tokens | 128K tokens | $6.25/MTok | $10/MTok | $0.50/MTok |
| **Claude Sonnet 4.6** | $3/MTok | $15/MTok | 1M tokens | 64K tokens | $3.75/MTok | $6/MTok | $0.30/MTok |
| **Claude Haiku 4.5** | $1/MTok | $5/MTok | 200K tokens | 64K tokens | $1.25/MTok | $2/MTok | $0.10/MTok |

> Source: https://platform.claude.com/docs/en/docs/about-claude/pricing

### 5.2 Modelos Legacy

| Modelo | Input | Output | Context Window | Max Output |
|--------|-------|--------|----------------|------------|
| Claude Opus 4.5 | $5/MTok | $25/MTok | 200K tokens | 64K tokens |
| Claude Opus 4.1 | $15/MTok | $75/MTok | 200K tokens | 32K tokens |
| Claude Opus 4 | $15/MTok | $75/MTok | 200K tokens | 32K tokens |
| Claude Sonnet 4.5 | $3/MTok | $15/MTok | 200K tokens | 64K tokens |
| Claude Sonnet 4 | $3/MTok | $15/MTok | 200K tokens | 64K tokens |
| Claude Haiku 3.5 | $0.80/MTok | $4/MTok | 200K tokens | - |
| Claude Haiku 3 | $0.25/MTok | $1.25/MTok | 200K tokens | 4K tokens |

> Source: https://platform.claude.com/docs/en/docs/about-claude/pricing

### 5.3 Model IDs para la API

| Modelo | API ID | API Alias |
|--------|--------|-----------|
| Claude Opus 4.6 | `claude-opus-4-6` | `claude-opus-4-6` |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | `claude-sonnet-4-6` |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | `claude-haiku-4-5` |
| Claude Opus 4.5 | `claude-opus-4-5-20251101` | `claude-opus-4-5` |
| Claude Sonnet 4.5 | `claude-sonnet-4-5-20250929` | `claude-sonnet-4-5` |
| Claude Opus 4.1 | `claude-opus-4-1-20250805` | `claude-opus-4-1` |
| Claude Sonnet 4 | `claude-sonnet-4-20250514` | `claude-sonnet-4-0` |
| Claude Opus 4 | `claude-opus-4-20250514` | `claude-opus-4-0` |

> Source: https://platform.claude.com/docs/en/docs/about-claude/models

### 5.4 Batch API (50% descuento)

| Modelo | Batch Input | Batch Output |
|--------|-------------|--------------|
| Claude Opus 4.6 | $2.50/MTok | $12.50/MTok |
| Claude Sonnet 4.6 | $1.50/MTok | $7.50/MTok |
| Claude Haiku 4.5 | $0.50/MTok | $2.50/MTok |

> Source: https://platform.claude.com/docs/en/docs/about-claude/pricing

### 5.5 Fast Mode (Opus 4.6 solamente)

> "Fast mode (beta: research preview) for Claude Opus 4.6 provides significantly faster output at premium pricing (6x standard rates)."
> -- Source: https://platform.claude.com/docs/en/docs/about-claude/pricing

| Input | Output |
|-------|--------|
| $30/MTok | $150/MTok |

### 5.6 Pricing de Tools Especificos

| Tool | Costo Adicional |
|------|-----------------|
| Web Search | $10 por 1,000 busquedas + tokens estandar |
| Web Fetch | Sin costo adicional (solo tokens estandar) |
| Code Execution | Gratis con web_search/web_fetch; sin ellos: $0.05/hora (1,550 horas gratis/mes) |
| Bash Tool | +245 input tokens por llamada |
| Text Editor | +700 input tokens por llamada |
| Computer Use | +735 input tokens por definicion |

> Source: https://platform.claude.com/docs/en/docs/about-claude/pricing

### 5.7 Prompt Caching — Multiplicadores

> "Cache write tokens are charged when content is first stored. Cache read tokens are charged when a subsequent request retrieves the cached content. A cache hit costs 10% of the standard input price, which means caching pays off after just one cache read for the 5-minute duration (1.25x write), or after two cache reads for the 1-hour duration (2x write)."
> -- Source: https://platform.claude.com/docs/en/docs/about-claude/pricing

| Operacion de Cache | Multiplicador | Duracion |
|--------------------|---------------|----------|
| 5-minute cache write | 1.25x precio base input | Cache valido por 5 minutos |
| 1-hour cache write | 2x precio base input | Cache valido por 1 hora |
| Cache read (hit) | 0.1x precio base input | Misma duracion que el write |

---

## 6. Snippets de Codigo Oficial

### 6.1 Tool Use Completo — TypeScript

Directamente del SDK oficial de Anthropic:

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

async function main() {
  const tools: Anthropic.Tool[] = [
    {
      name: 'get_weather',
      description: 'Get the current weather for a location',
      input_schema: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City and state, e.g. San Francisco, CA' },
          unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
        },
        required: ['location']
      }
    }
  ];

  // First request - Claude decides to use the tool
  const message = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    tools,
    messages: [{ role: 'user', content: 'What is the weather in San Francisco?' }]
  });

  // Check if Claude wants to use a tool
  if (message.stop_reason === 'tool_use') {
    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (toolUse) {
      console.log(`Claude wants to call: ${toolUse.name}`);
      console.log(`With input: ${JSON.stringify(toolUse.input)}`);

      // Execute your tool and get the result
      const weatherResult = 'Sunny, 72°F';

      // Send the tool result back to Claude
      const finalResponse = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        tools,
        messages: [
          { role: 'user', content: 'What is the weather in San Francisco?' },
          { role: 'assistant', content: message.content },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: weatherResult
              }
            ]
          }
        ]
      });

      console.log('Final response:', finalResponse.content);
    }
  }
}

main();
```

> Source: https://context7.com/anthropics/anthropic-sdk-typescript/llms.txt (SDK oficial)

### 6.2 Tool Use con Zod + Tool Runner — TypeScript

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const client = new Anthropic();

async function main() {
  const weatherTool = betaZodTool({
    name: 'get_weather',
    description: 'Get the current weather in a location',
    inputSchema: z.object({
      location: z.string().describe('City and state, e.g. San Francisco, CA'),
      unit: z.enum(['celsius', 'fahrenheit']).default('fahrenheit')
    }),
    run: async ({ location, unit }) => {
      const temp = unit === 'celsius' ? '22°C' : '72°F';
      return `The weather in ${location} is sunny and ${temp}`;
    }
  });

  // toolRunner automatically handles the tool call loop
  const finalMessage = await client.beta.messages.toolRunner({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    tools: [weatherTool],
    messages: [{ role: 'user', content: 'What is the weather in San Francisco and New York?' }],
    max_iterations: 10
  });

  console.log('Final response:', finalMessage.content);
}

main();
```

> Source: https://context7.com/anthropics/anthropic-sdk-typescript/llms.txt (SDK oficial)

### 6.3 Vision con Base64 — TypeScript

```typescript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

async function main() {
  const message = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: imageData // Base64-encoded image data as string
            }
          },
          {
            type: "text",
            text: "Describe this image."
          }
        ]
      }
    ]
  });

  console.log(message);
}

main();
```

> Source: https://platform.claude.com/docs/en/docs/build-with-claude/vision

### 6.4 Vision con URL — Python

```python
import anthropic

client = anthropic.Anthropic()
message = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "url",
                        "url": "https://upload.wikimedia.org/wikipedia/commons/a/a7/Camponotus_flavomarginatus_ant.jpg",
                    },
                },
                {"type": "text", "text": "Describe this image."},
            ],
        }
    ],
)
print(message)
```

> Source: https://platform.claude.com/docs/en/docs/build-with-claude/vision

### 6.5 Vision con Files API — TypeScript

```typescript
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import fs from "fs";

const anthropic = new Anthropic();

async function main() {
  // Upload the image file
  const fileUpload = await anthropic.beta.files.upload({
    file: await toFile(fs.createReadStream("image.jpg"), undefined, { type: "image/jpeg" }),
    betas: ["files-api-2025-04-14"]
  });

  // Use the uploaded file in a message
  const response = await anthropic.beta.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    betas: ["files-api-2025-04-14"],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "file",
              file_id: fileUpload.id
            }
          },
          {
            type: "text",
            text: "Describe this image."
          }
        ]
      }
    ]
  });

  console.log(response);
}

main();
```

> Source: https://platform.claude.com/docs/en/docs/build-with-claude/vision

### 6.6 Structured Outputs con JSON Schema — Python

```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[
        {
            "role": "user",
            "content": "Extract the key information from this email: John Smith (john@example.com) is interested in our Enterprise plan and wants to schedule a demo for next Tuesday at 2pm.",
        }
    ],
    output_config={
        "format": {
            "type": "json_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "email": {"type": "string"},
                    "plan_interest": {"type": "string"},
                    "demo_requested": {"type": "boolean"},
                },
                "required": ["name", "email", "plan_interest", "demo_requested"],
                "additionalProperties": False,
            },
        }
    },
)
print(response.content[0].text)
```

> Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

### 6.7 Structured Outputs con JSON Schema — TypeScript

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const response = await client.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 1024,
  messages: [
    {
      role: "user",
      content:
        "Extract the key information from this email: John Smith (john@example.com) is interested in our Enterprise plan and wants to schedule a demo for next Tuesday at 2pm."
    }
  ],
  output_config: {
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          plan_interest: { type: "string" },
          demo_requested: { type: "boolean" }
        },
        required: ["name", "email", "plan_interest", "demo_requested"],
        additionalProperties: false
      }
    }
  }
});
const textBlock = response.content.find((block) => block.type === "text");
if (textBlock && textBlock.type === "text") {
  console.log(textBlock.text);
}
```

> Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

### 6.8 Strict Tool Use — Python

```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "What's the weather like in San Francisco?"}],
    tools=[
        {
            "name": "get_weather",
            "description": "Get the current weather in a given location",
            "strict": True,
            "input_schema": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The city and state, e.g. San Francisco, CA",
                    },
                    "unit": {
                        "type": "string",
                        "enum": ["celsius", "fahrenheit"],
                        "description": "The unit of temperature, either 'celsius' or 'fahrenheit'",
                    },
                },
                "required": ["location"],
                "additionalProperties": False,
            },
        }
    ],
)
print(response.content)
```

> Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use

### 6.9 Tool Use con input_examples — TypeScript

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 1024,
  tools: [
    {
      name: "get_weather",
      description: "Get the current weather in a given location",
      input_schema: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The city and state, e.g. San Francisco, CA"
          },
          unit: {
            type: "string",
            enum: ["celsius", "fahrenheit"],
            description: "The unit of temperature"
          }
        },
        required: ["location"]
      },
      input_examples: [
        {
          location: "San Francisco, CA",
          unit: "fahrenheit"
        },
        {
          location: "Tokyo, Japan",
          unit: "celsius"
        },
        {
          location: "New York, NY"
          // Demonstrates that 'unit' is optional
        }
      ]
    }
  ],
  messages: [{ role: "user", content: "What's the weather like in San Francisco?" }]
});

console.log(response);
```

> Source: https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/implement-tool-use

### 6.10 Multiples Imagenes con System Prompt — Python

```python
import anthropic

client = anthropic.Anthropic()

message = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    system="Respond only in Spanish.",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Image 1:"},
                {
                    "type": "image",
                    "source": {
                        "type": "url",
                        "url": "https://upload.wikimedia.org/wikipedia/commons/a/a7/Camponotus_flavomarginatus_ant.jpg",
                    },
                },
                {"type": "text", "text": "Image 2:"},
                {
                    "type": "image",
                    "source": {
                        "type": "url",
                        "url": "https://upload.wikimedia.org/wikipedia/commons/b/b5/Iridescent.green.sweat.bee1.jpg",
                    },
                },
                {"type": "text", "text": "How are these images different?"},
            ],
        }
    ],
)
```

> Source: https://platform.claude.com/docs/en/docs/build-with-claude/vision

### 6.11 API Call via cURL — Tool Use completo

```bash
curl https://api.anthropic.com/v1/messages \
  -H "content-type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-opus-4-6",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "What is the weather in San Francisco?"}
    ],
    "tools": [{
      "name": "get_weather",
      "description": "Get the current weather in a given location",
      "strict": true,
      "input_schema": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "The city and state, e.g. San Francisco, CA"
          },
          "unit": {
            "type": "string",
            "enum": ["celsius", "fahrenheit"]
          }
        },
        "required": ["location"],
        "additionalProperties": false
      }
    }]
  }'
```

> Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use

### 6.12 API Call via cURL — Vision Base64

```bash
BASE64_IMAGE_DATA=$(curl -s "https://upload.wikimedia.org/wikipedia/commons/a/a7/Camponotus_flavomarginatus_ant.jpg" | base64 | tr -d '\n')

curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d @- <<EOF
{
  "model": "claude-opus-4-6",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": "$BASE64_IMAGE_DATA"
          }
        },
        {
          "type": "text",
          "text": "Describe this image."
        }
      ]
    }
  ]
}
EOF
```

> Source: https://platform.claude.com/docs/en/docs/build-with-claude/vision

---

## Fuentes Consultadas

Todas las URLs consultadas el 2026-04-05:

1. **Tool Use / Define Tools**: https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/implement-tool-use
2. **Handle Tool Calls**: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls
3. **Strict Tool Use**: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use
4. **Vision**: https://platform.claude.com/docs/en/docs/build-with-claude/vision
5. **Structured Outputs**: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
6. **Pricing**: https://platform.claude.com/docs/en/docs/about-claude/pricing
7. **Models Overview**: https://platform.claude.com/docs/en/docs/about-claude/models
8. **OpenAI SDK Compatibility**: https://platform.claude.com/docs/en/api/openai-sdk
9. **TypeScript SDK (Context7)**: https://context7.com/anthropics/anthropic-sdk-typescript/llms.txt
10. **Anthropic Home**: https://platform.claude.com/docs/en/home

**Nota**: La documentacion de Anthropic migro de `docs.anthropic.com` a `platform.claude.com` (redirect 301). Ambas URLs siguen funcionando al momento de la consulta.
