# OpenAI Structured Outputs — Referencia Tecnica

**Fuente oficial**: https://developers.openai.com/api/docs/guides/structured-outputs
**Fuente complementaria (Azure OpenAI, misma especificacion)**: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs
**Blog de lanzamiento**: https://openai.com/index/introducing-structured-outputs-in-the-api/
**Cookbook oficial**: https://developers.openai.com/cookbook/examples/structured_outputs_intro
**SDK Python (helpers)**: https://github.com/openai/openai-python/blob/main/helpers.md
**SDK Node.js (helpers)**: https://github.com/openai/openai-node/blob/master/helpers.md
**Fecha de consulta**: 2026-04-05

---

## 1. Que son Structured Outputs y como funcionan

Structured Outputs es una funcionalidad de la API de OpenAI que **garantiza** que la respuesta del modelo se adhiera estrictamente a un JSON Schema proporcionado por el desarrollador.

> "Structured Outputs is a feature that ensures the model will always generate responses that adhere to your supplied JSON Schema, so you don't need to worry about the model omitting a required key, or hallucinating an invalid enum value."
> — Fuente: https://developers.openai.com/api/docs/guides/structured-outputs

### Beneficios clave

1. **Type-safety confiable**: no se necesita validacion ni reintentos por respuestas mal formateadas.
2. **Rechazos explicitos**: los rechazos del modelo por razones de seguridad son programaticamente detectables a traves del campo `refusal`.
3. **Prompting simplificado**: no se necesitan prompts agresivos para forzar un formato consistente.

> "Reliable type-safety: No validation or retry needed for incorrectly formatted responses. Explicit refusals: Safety-based model refusals are now programmatically detectable. Simpler prompting: No need for strongly worded prompts for consistent formatting."
> — Fuente: https://developers.openai.com/api/docs/guides/structured-outputs

### Como funciona internamente

Structured Outputs utiliza **constrained decoding** basado en **context-free grammar (CFG)**. A diferencia de enfoques basados en FSM (Finite State Machines) que pueden fallar con JSON profundamente anidado, la implementacion de OpenAI con CFG puede expresar tipos recursivos correctamente.

> "FSM-based approaches may struggle to match parentheses in deeply nested JSON, while context-free grammar (CFG) approaches supported by OpenAI API with Structured Outputs can express recursive types."
> — Fuente: https://openai.com/index/introducing-structured-outputs-in-the-api/

### Rendimiento

> "On complex JSON schema following evals, gpt-4o-2024-08-06 with Structured Outputs achieves perfect 100% reliability in matching output schemas."
> — Fuente: https://openai.com/index/introducing-structured-outputs-in-the-api/

### APIs compatibles

Structured Outputs funciona en:
- **Chat Completions API**
- **Responses API**
- **Assistants API**
- **Fine-tuning API**
- **Batch API**

> — Fuente: https://developers.openai.com/api/docs/guides/structured-outputs

### Modelos soportados

Segun la documentacion de Azure OpenAI (que refleja los mismos modelos de OpenAI):

| Modelo | Version |
|--------|---------|
| `gpt-4o-mini` | `2024-07-18` |
| `gpt-4o` | `2024-08-06`, `2024-11-20` |
| `gpt-4.1` | `2025-04-14` |
| `gpt-4.1-mini` | `2025-04-14` |
| `gpt-4.1-nano` | `2025-04-14` |
| `o1` | `2024-12-17` |
| `o3-mini` | `2025-01-31` |
| `o3` | `2025-04-16` |
| `o3-pro` | `2025-06-10` |
| `o4-mini` | `2025-04-16` |
| `codex-mini` | `2025-05-16` |
| `gpt-5` | `2025-08-07` |
| `gpt-5-mini` | `2025-08-07` |
| `gpt-5-nano` | `2025-08-07` |
| `gpt-5-codex` | `2025-09-11` |
| `gpt-5-pro` | `2025-10-06` |
| `gpt-5.1` | `2025-11-13` |
| `gpt-5.1-codex` | `2025-11-13` |
| `gpt-5.1-codex-mini` | `2025-11-13` |
| `gpt-5.1-chat` | `2025-11-13` |

> — Fuente: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs

**Nota**: modelos antiguos como `gpt-4-turbo` y anteriores NO soportan Structured Outputs; pueden usar JSON mode en su lugar.

> "Older models like gpt-4-turbo and earlier may use JSON mode instead."
> — Fuente: https://developers.openai.com/api/docs/guides/structured-outputs

---

## 2. response_format con json_schema — formato exacto del API call

### Chat Completions API

```json
{
  "model": "gpt-4o-2024-08-06",
  "messages": [
    {"role": "system", "content": "You are a helpful math tutor."},
    {"role": "user", "content": "solve 8x + 31 = 2"}
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "math_reasoning",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "steps": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "explanation": { "type": "string" },
                "output": { "type": "string" }
              },
              "required": ["explanation", "output"],
              "additionalProperties": false
            }
          },
          "final_answer": { "type": "string" }
        },
        "required": ["steps", "final_answer"],
        "additionalProperties": false
      }
    }
  }
}
```

> — Fuente: https://developers.openai.com/api/docs/guides/structured-outputs

### Responses API (formato alternativo)

```json
{
  "model": "gpt-4o-2024-08-06",
  "input": [
    {"role": "user", "content": "solve 8x + 31 = 2"}
  ],
  "text": {
    "format": {
      "type": "json_schema",
      "name": "math_reasoning",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "steps": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "explanation": { "type": "string" },
                "output": { "type": "string" }
              },
              "required": ["explanation", "output"],
              "additionalProperties": false
            }
          },
          "final_answer": { "type": "string" }
        },
        "required": ["steps", "final_answer"],
        "additionalProperties": false
      }
    }
  }
}
```

> — Fuente: https://developers.openai.com/api/docs/guides/structured-outputs

### Ejemplo REST con cURL

```bash
curl -X POST https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-2024-08-06",
    "messages": [
      {"role": "system", "content": "Extract the event information."},
      {"role": "user", "content": "Alice and Bob are going to a science fair on Friday."}
    ],
    "response_format": {
      "type": "json_schema",
      "json_schema": {
        "name": "CalendarEventResponse",
        "strict": true,
        "schema": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "date": { "type": "string" },
            "participants": {
              "type": "array",
              "items": { "type": "string" }
            }
          },
          "required": ["name", "date", "participants"],
          "additionalProperties": false
        }
      }
    }
  }'
```

> — Fuente: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs (adaptado de Azure a OpenAI directo)

### Respuesta tipica

```json
{
  "id": "chatcmpl-A1EUP2fAmL4SeB1lVMinwM7I2vcqG",
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "logprobs": null,
      "message": {
        "content": "{\"name\":\"Science Fair\",\"date\":\"Friday\",\"participants\":[\"Alice\",\"Bob\"]}",
        "refusal": null,
        "role": "assistant",
        "parsed": {
          "name": "Science Fair",
          "date": "Friday",
          "participants": ["Alice", "Bob"]
        }
      }
    }
  ],
  "created": 1724857389,
  "model": "gpt-4o-2024-08-06",
  "object": "chat.completion",
  "usage": {
    "completion_tokens": 27,
    "prompt_tokens": 32,
    "total_tokens": 59
  }
}
```

> — Fuente: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs

---

## 3. Diferencia entre JSON mode y Structured Outputs

| Caracteristica | Structured Outputs | JSON Mode |
|---|---|---|
| Produce JSON valido | Si | Si |
| Adherencia al schema | **Si (garantizada)** | **No** |
| Modelos compatibles | `gpt-4o-mini`, `gpt-4o-2024-08-06`+ | `gpt-3.5-turbo`, `gpt-4-*`, `gpt-4o-*` |
| Activacion (Chat Completions) | `response_format: {type: "json_schema", json_schema: {...}}` | `response_format: {type: "json_object"}` |
| Activacion (Responses API) | `text: {format: {type: "json_schema", ...}}` | `text: {format: {type: "json_object"}}` |
| Constrained decoding | Si (CFG-based) | No |
| Campo `refusal` | Si | No |
| Schema requerido | Si | No |

> "While JSON mode improves model reliability for generating valid JSON outputs, it does not guarantee that the model's response will conform to a particular schema. In contrast, Structured Outputs is a new feature designed to ensure model-generated outputs will exactly match JSON Schemas provided by developers."
> — Fuente: https://openai.com/index/introducing-structured-outputs-in-the-api/

**Diferencia critica**: JSON mode solo garantiza que la salida es JSON valido. Structured Outputs garantiza que el JSON cumple EXACTAMENTE con el schema proporcionado — campos requeridos, tipos correctos, valores de enum validos, etc.

> — Fuente: https://developers.openai.com/api/docs/guides/structured-outputs

---

## 4. Schemas soportados y limitaciones

### 4.1 Tipos soportados

| Tipo | Soportado |
|------|-----------|
| `String` | Si |
| `Number` | Si |
| `Boolean` | Si |
| `Integer` | Si |
| `Object` | Si |
| `Array` | Si |
| `Enum` | Si |
| `anyOf` | Si (con restriccion: el objeto raiz NO puede ser `anyOf`) |
| `null` | Si (via union de tipos, e.g., `"type": ["string", "null"]`) |

> "Supported types: String, Number, Boolean, Integer, Object, Array, Enum, anyOf. Note: Root objects cannot be the anyOf type."
> — Fuente: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs

### 4.2 Funcionalidades soportadas

| Funcionalidad | Soportada | Notas |
|---|---|---|
| `$ref` | Si | Para definiciones y recursion |
| `$defs` | Si | Definiciones reutilizables dentro del schema |
| Schemas recursivos | Si | Via `$ref: "#"` (raiz) o `$ref: "#/$defs/nombre"` |
| `anyOf` | Si | Excepto en el nivel raiz |
| `enum` | Si | Hasta 1,000 valores (post julio 2025) |
| `const` | Si | [VERIFICAR - mencionado en limites pero no en tipos soportados explicitamente] |
| `description` | Si | En propiedades |
| `required` | Si | **Obligatorio**: TODAS las propiedades deben estar en `required` |
| `additionalProperties` | Si | **Obligatorio**: debe ser `false` en TODOS los objetos |

> "Definitions are supported [...] Recursive schemas are supported"
> — Fuente: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs

### 4.3 Keywords NO soportados (por tipo)

| Tipo | Keywords NO soportados |
|------|----------------------|
| **String** | `minLength`, `maxLength`, `pattern`, `format` |
| **Number** | `minimum`, `maximum`, `multipleOf` |
| **Objects** | `patternProperties`, `unevaluatedProperties`, `propertyNames`, `minProperties`, `maxProperties` |
| **Arrays** | `unevaluatedItems`, `contains`, `minContains`, `maxContains`, `minItems`, `maxItems`, `uniqueItems` |

> "Unsupported type-specific keywords: String: minLength, maxLength, pattern, format. Number: minimum, maximum, multipleOf. Objects: patternProperties, unevaluatedProperties, propertyNames, minProperties, maxProperties. Arrays: unevaluatedItems, contains, minContains, maxContains, minItems, maxItems, uniqueItems."
> — Fuente: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs

**Nota importante**: `allOf`, `oneOf`, `if`/`then`/`else`, `not`, `dependentRequired`, `dependentSchemas` NO estan listados como soportados. Solo `anyOf` esta explicitamente soportado como mecanismo de union/variante. [VERIFICAR - la documentacion oficial no menciona estos keywords explicitamente como no soportados, pero tampoco los lista como soportados]

### 4.4 Limites numericos

| Limite | Valor original | Valor actualizado (julio 2025) | Fuente |
|--------|----------------|-------------------------------|--------|
| Propiedades de objeto (total) | 100 | **5,000** | https://community.openai.com/t/structured-outputs-limits-are-raised-to-support-larger-schemas/1313593 |
| Profundidad de anidamiento | 5 niveles | 5 niveles (sin cambio) | https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs |
| Valores de enum (total en schema) | 500 | **1,000** | https://community.openai.com/t/structured-outputs-limits-are-raised-to-support-larger-schemas/1313593 |
| Caracteres en string (nombres/valores) | 15,000 | **120,000** | https://community.openai.com/t/structured-outputs-limits-are-raised-to-support-larger-schemas/1313593 |
| Caracteres en enum strings (>250 valores) | 7,500 | **15,000** | https://community.openai.com/t/structured-outputs-limits-are-raised-to-support-larger-schemas/1313593 |
| Max output tokens | 4,096 (depende del modelo) | Varía por modelo | https://community.openai.com/t/structured-outputs-deep-dive/930169 |

> "A schema may have up to 100 object properties total, with up to five levels of nesting."
> — Fuente: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs

> "Object properties: from 100 to 5,000. Characters in string: from 15,000 to 120,000. Enum values: from 500 to 1,000. Total characters in enum strings (>250 values): from 7,500 to 15,000."
> — Fuente: https://community.openai.com/t/structured-outputs-limits-are-raised-to-support-larger-schemas/1313593 (julio 2025)

### 4.5 Reglas obligatorias del schema (strict mode)

1. **`additionalProperties: false`** debe estar en CADA objeto del schema.
2. **Todas las propiedades** deben listarse en `required`.
3. Para campos opcionales, se usa union con `null`: `"type": ["string", "null"]`.
4. El tipo raiz del schema **debe ser `object`** (no puede ser `anyOf` en el nivel raiz).
5. El key ordering de la salida sigue el orden del schema proporcionado.

> "All fields must be required. All fields or function parameters must be included as required."
> — Fuente: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs

> "additionalProperties: false must always be set in objects. This property controls if an object can have other key value pairs that weren't defined in the JSON Schema. In order to use structured outputs, you must set this value to false."
> — Fuente: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs

> "Key ordering: Structured outputs are ordered the same as the provided schema. To change the output order, modify the order of the schema that you send as part of your inference request."
> — Fuente: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs

### 4.6 Ejemplo de campo opcional (union con null)

```json
{
  "name": "get_weather",
  "description": "Fetches the weather in the given location",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "The location to get the weather for"
      },
      "unit": {
        "type": ["string", "null"],
        "description": "The unit to return the temperature in",
        "enum": ["F", "C"]
      }
    },
    "additionalProperties": false,
    "required": ["location", "unit"]
  }
}
```

> — Fuente: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs

### 4.7 Schemas recursivos

Soportados via `$ref`. Dos modalidades:

**Recursion por raiz** (`$ref: "#"`):

```json
{
  "name": "ui",
  "description": "Dynamically generated UI",
  "strict": true,
  "schema": {
    "type": "object",
    "properties": {
      "type": {
        "type": "string",
        "description": "The type of the UI component",
        "enum": ["div", "button", "header", "section", "field", "form"]
      },
      "label": {
        "type": "string",
        "description": "The label of the UI component"
      },
      "children": {
        "type": "array",
        "description": "Nested UI components",
        "items": {
          "$ref": "#"
        }
      },
      "attributes": {
        "type": "array",
        "description": "Arbitrary attributes for the UI component",
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "value": { "type": "string" }
          },
          "additionalProperties": false,
          "required": ["name", "value"]
        }
      }
    },
    "required": ["type", "label", "children", "attributes"],
    "additionalProperties": false
  }
}
```

**Recursion explicita** (`$ref: "#/$defs/nombre"`):

```json
{
  "type": "object",
  "properties": {
    "linked_list": {
      "$ref": "#/$defs/linked_list_node"
    }
  },
  "$defs": {
    "linked_list_node": {
      "type": "object",
      "properties": {
        "value": { "type": "number" },
        "next": {
          "anyOf": [
            { "$ref": "#/$defs/linked_list_node" },
            { "type": "null" }
          ]
        }
      },
      "additionalProperties": false,
      "required": ["next", "value"]
    }
  },
  "additionalProperties": false,
  "required": ["linked_list"]
}
```

> — Fuente: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs

### 4.8 Definiciones reutilizables (`$defs`)

```json
{
  "type": "object",
  "properties": {
    "steps": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/step"
      }
    },
    "final_answer": {
      "type": "string"
    }
  },
  "$defs": {
    "step": {
      "type": "object",
      "properties": {
        "explanation": { "type": "string" },
        "output": { "type": "string" }
      },
      "required": ["explanation", "output"],
      "additionalProperties": false
    }
  },
  "required": ["steps", "final_answer"],
  "additionalProperties": false
}
```

> — Fuente: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs

### 4.9 Restriccion con function calling

> "Structured outputs are not supported with parallel function calls. When using structured outputs set parallel_tool_calls to false."
> — Fuente: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs

---

## 5. Integracion con Pydantic (Python SDK — metodo `parse`)

El SDK de Python provee `client.chat.completions.parse()` que:

1. Convierte automaticamente un modelo Pydantic a JSON Schema.
2. Envia el schema como `response_format` en la request.
3. Parsea la respuesta de vuelta al modelo Pydantic.
4. Retorna un objeto `ParsedChatCompletion` con el campo `.parsed`.

> "The SDK provides a client.chat.completions.parse() method which is a wrapper over the client.chat.completions.create() that provides richer integrations with Python specific types and returns a ParsedChatCompletion object, which is a subclass of the standard ChatCompletion class."
> — Fuente: https://github.com/openai/openai-python/blob/main/helpers.md

### Ejemplo completo con Pydantic

```python
from typing import List
from pydantic import BaseModel
from openai import OpenAI

class Step(BaseModel):
    explanation: str
    output: str

class MathResponse(BaseModel):
    steps: List[Step]
    final_answer: str

client = OpenAI()

completion = client.chat.completions.parse(
    model="gpt-4o-2024-08-06",
    messages=[
        {"role": "system", "content": "You are a helpful math tutor."},
        {"role": "user", "content": "solve 8x + 31 = 2"},
    ],
    response_format=MathResponse,
)

message = completion.choices[0].message
if message.parsed:
    for step in message.parsed.steps:
        print(f"Step: {step.explanation} -> {step.output}")
    print(f"Final Answer: {message.parsed.final_answer}")
else:
    print(f"Refusal: {message.refusal}")
```

> — Fuente: https://github.com/openai/openai-python/blob/main/helpers.md

### Manejo de rechazos (refusals)

Cuando el modelo rechaza una peticion por razones de seguridad, el campo `message.parsed` sera `None` y el campo `message.refusal` contendra el motivo del rechazo:

```python
message = completion.choices[0].message
if message.parsed:
    # Usar la respuesta estructurada
    print(message.parsed.final_answer)
else:
    # El modelo rechazó la petición
    print(f"Refusal: {message.refusal}")
```

> — Fuente: https://github.com/openai/openai-python/blob/main/helpers.md

### Function calling con Pydantic

```python
from enum import Enum
from typing import List, Union
from pydantic import BaseModel
import openai

class Table(str, Enum):
    orders = "orders"
    customers = "customers"
    products = "products"

class Operator(str, Enum):
    eq = "="
    gt = ">"
    lt = "<"
    le = "<="
    ge = ">="
    ne = "!="

class OrderBy(str, Enum):
    asc = "asc"
    desc = "desc"

class DynamicValue(BaseModel):
    column_name: str

class Condition(BaseModel):
    column: str
    operator: Operator
    value: Union[str, int, DynamicValue]

class Query(BaseModel):
    table_name: Table
    columns: List[str]
    conditions: List[Condition]
    order_by: OrderBy

client = openai.OpenAI()
completion = client.chat.completions.parse(
    model="gpt-4o-2024-08-06",
    messages=[
        {
            "role": "system",
            "content": "You are a helpful assistant. You help users query for the data they are looking for by calling the query function.",
        },
        {
            "role": "user",
            "content": "look up all my orders in may of last year that were fulfilled but not delivered on time",
        },
    ],
    tools=[
        openai.pydantic_function_tool(Query),
    ],
)

tool_call = (completion.choices[0].message.tool_calls or [])[0]
print(tool_call.function)
assert isinstance(tool_call.function.parsed_arguments, Query)
print(tool_call.function.parsed_arguments.table_name)
```

> — Fuente: https://github.com/openai/openai-python/blob/main/helpers.md

### Gotcha importante con Pydantic

Pydantic genera schemas JSON ricos con constraints como `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, etc. OpenAI NO soporta estos keywords. Es necesario configurar Pydantic para generar schemas compatibles, o el SDK lo maneja automaticamente al usar `parse()`.

> "OpenAI's Structured Outputs only support a tiny subset of JSON Schema. What Pydantic generates includes constraints like minimum/maximum, but OpenAI expects no constraints allowed."
> — Fuente: https://medium.com/@aviadr1/how-to-fix-openai-structured-outputs-breaking-your-pydantic-models-bdcd896d43bd

---

## 6. Integracion con Zod (Node.js/TypeScript SDK)

El SDK de Node.js provee `zodResponseFormat()` y `client.chat.completions.parse()` para TypeScript:

```typescript
import { zodResponseFormat } from 'openai/helpers/zod';
import OpenAI from 'openai';
import { z } from 'zod';

const Step = z.object({
  explanation: z.string(),
  output: z.string(),
});

const MathResponse = z.object({
  steps: z.array(Step),
  final_answer: z.string(),
});

const client = new OpenAI();

const completion = await client.chat.completions.parse({
  model: 'gpt-4o-2024-08-06',
  messages: [
    { role: 'system', content: 'You are a helpful math tutor.' },
    { role: 'user', content: 'solve 8x + 31 = 2' },
  ],
  response_format: zodResponseFormat(MathResponse, 'math_response'),
});

const message = completion.choices[0]?.message;
if (message?.parsed) {
  console.log(message.parsed.steps);
  console.log(`answer: ${message.parsed.final_answer}`);
}
```

> — Fuente: https://github.com/openai/openai-node/blob/master/helpers.md

---

## 7. Snippets de codigo oficial — Resumen rapido

### Python: response_format directo (sin Pydantic)

```python
from openai import OpenAI

client = OpenAI()

response = client.chat.completions.create(
    model="gpt-4o-2024-08-06",
    messages=[
        {"role": "system", "content": "You are a helpful math tutor."},
        {"role": "user", "content": "solve 8x + 31 = 2"}
    ],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "math_reasoning",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "steps": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "explanation": {"type": "string"},
                                "output": {"type": "string"}
                            },
                            "required": ["explanation", "output"],
                            "additionalProperties": False
                        }
                    },
                    "final_answer": {"type": "string"}
                },
                "required": ["steps", "final_answer"],
                "additionalProperties": False
            }
        }
    }
)
```

> — Fuente: https://developers.openai.com/cookbook/examples/structured_outputs_intro

### Python: con Pydantic (recomendado)

```python
from pydantic import BaseModel
from openai import OpenAI

class CalendarEvent(BaseModel):
    name: str
    date: str
    participants: list[str]

client = OpenAI()

completion = client.chat.completions.parse(
    model="gpt-4o-2024-08-06",
    messages=[
        {"role": "system", "content": "Extract the event information."},
        {"role": "user", "content": "Alice and Bob are going to a science fair on Friday."},
    ],
    response_format=CalendarEvent,
)

event = completion.choices[0].message.parsed
print(event)
```

> — Fuente: https://developers.openai.com/api/docs/guides/structured-outputs

### TypeScript: con Zod

```typescript
import { zodResponseFormat } from 'openai/helpers/zod';
import OpenAI from 'openai';
import { z } from 'zod';

const CalendarEvent = z.object({
  name: z.string(),
  date: z.string(),
  participants: z.array(z.string()),
});

const client = new OpenAI();

const completion = await client.chat.completions.parse({
  model: 'gpt-4o-2024-08-06',
  messages: [
    { role: 'system', content: 'Extract the event information.' },
    { role: 'user', content: 'Alice and Bob are going to a science fair on Friday.' },
  ],
  response_format: zodResponseFormat(CalendarEvent, 'event'),
});

const event = completion.choices[0].message.parsed;
```

> — Fuente: https://developers.openai.com/api/docs/guides/structured-outputs

### Function calling con strict mode

```python
import openai
from pydantic import BaseModel

class GetDeliveryDate(BaseModel):
    order_id: str

client = openai.OpenAI()
tools = [openai.pydantic_function_tool(GetDeliveryDate)]

response = client.chat.completions.create(
    model="gpt-4o-2024-08-06",
    messages=[
        {"role": "system", "content": "You are a helpful customer support assistant. Use the supplied tools to assist the user."},
        {"role": "user", "content": "Hi, can you tell me the delivery date for my order #12345?"}
    ],
    tools=tools
)

print(response.choices[0].message.tool_calls[0].function)
```

> — Fuente: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs

---

## 8. Cuando usar Structured Outputs vs Function Calling

| Caso de uso | Mecanismo recomendado |
|---|---|
| Respuesta estructurada al usuario | `response_format` con `json_schema` |
| Conectar el modelo a herramientas/funciones | Function calling con `strict: true` |
| Extraer datos de documentos | `response_format` con `json_schema` |
| Poblar base de datos desde texto | `response_format` con `json_schema` |
| Generar UI dinamica | `response_format` con `json_schema` (recursivo) |

> "Use function calling when connecting models to tools, functions, or data systems. Use structured response_format when structuring model output for user responses."
> — Fuente: https://developers.openai.com/api/docs/guides/structured-outputs

---

## 9. Checklist de implementacion

- [ ] Modelo compatible (gpt-4o-2024-08-06 o posterior)
- [ ] `strict: true` en el json_schema
- [ ] `additionalProperties: false` en CADA objeto del schema
- [ ] TODAS las propiedades en `required`
- [ ] Campos opcionales con `"type": ["tipo", "null"]`
- [ ] Sin keywords de validacion (min/max/pattern/format)
- [ ] Maximo 5 niveles de profundidad
- [ ] Maximo 5,000 propiedades totales (post julio 2025)
- [ ] Maximo 1,000 valores de enum totales (post julio 2025)
- [ ] `parallel_tool_calls: false` si se usa con function calling
- [ ] Manejo de `refusal` en el codigo cliente
