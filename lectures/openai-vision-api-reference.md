# OpenAI Vision API — Referencia Tecnica

**Fuente oficial**: https://developers.openai.com/api/docs/guides/images-vision
**Documentacion de pricing**: https://developers.openai.com/api/docs/pricing
**Documentacion de PDF**: https://developers.openai.com/api/docs/guides/pdf-files
**Fecha de consulta**: 2026-04-05

---

## 1. Como enviar imagenes (base64 vs URL)

La API de OpenAI soporta **tres metodos** para enviar imagenes como input. El formato exacto varia segun se use la **Responses API** (nueva) o la **Chat Completions API** (clasica).

> "You can provide images as input to generation requests either by providing a fully qualified URL to an image file, or providing an image as a Base64-encoded data URL."
> — Fuente: https://developers.openai.com/api/docs/guides/images-vision

### 1.1 Responses API (recomendada)

**Via URL:**
```json
{
  "type": "input_image",
  "image_url": "https://example.com/image.jpg",
  "detail": "high"
}
```

**Via Base64:**
```json
{
  "type": "input_image",
  "image_url": "data:image/jpeg;base64,{base64_string}",
  "detail": "high"
}
```

**Via File ID (subida previa):**
```json
{
  "type": "input_image",
  "file_id": "{file_id}"
}
```

### 1.2 Chat Completions API (clasica)

```json
{
  "type": "image_url",
  "image_url": {
    "url": "https://example.com/image.jpg",
    "detail": "high"
  }
}
```

Para base64 en Chat Completions:
```json
{
  "type": "image_url",
  "image_url": {
    "url": "data:image/jpeg;base64,{base64_string}",
    "detail": "high"
  }
}
```

### 1.3 Formatos de imagen soportados

> Formatos soportados: **PNG, JPEG, WEBP, non-animated GIF**
> — Fuente: https://developers.openai.com/api/docs/guides/images-vision

---

## 2. Modelos que soportan vision

Segun la documentacion oficial, los siguientes modelos soportan input de imagenes (vision):

> "Vision is the ability for a model to 'see' and understand images."
> — Fuente: https://developers.openai.com/api/docs/guides/images-vision

| Familia | Modelos con vision |
|---------|-------------------|
| GPT-4o | `gpt-4o`, `gpt-4o-mini` |
| GPT-4.1 | `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano` |
| GPT-5 | `gpt-5`, `gpt-5-mini`, `gpt-5-nano` |
| GPT-5.4 | `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano` |
| Serie O (reasoning) | `o1`, `o1-pro`, `o3`, `o3-pro`, `o4-mini` |
| Otros | `computer-use-preview`, `gpt-image-1` |

Fuente: https://developers.openai.com/api/docs/guides/images-vision

---

## 3. Limites: tokens por imagen, resolucion maxima, imagenes por request

### 3.1 Tabla de limites generales

| Limite | Valor | Fuente |
|--------|-------|--------|
| Imagenes por request | Hasta **1,500** individuales | https://developers.openai.com/api/docs/guides/images-vision |
| Payload total maximo | **512 MB** por request | https://developers.openai.com/api/docs/guides/images-vision |
| Dimension maxima (high) | **2,048px** en el lado mas largo | https://developers.openai.com/api/docs/guides/vision |
| Dimension maxima (original) | **6,000px** (solo gpt-5.4+) | https://developers.openai.com/api/docs/guides/vision |
| Resolucion low detail | **512px x 512px** fija | https://developers.openai.com/api/docs/guides/images-vision |

### 3.2 Parametro `detail`

El parametro `detail` controla la fidelidad de procesamiento de la imagen:

> "The `detail` parameter accepts `low`, `high`, `original`, or `auto`. If omitted, `auto` is used."
> — Fuente: https://developers.openai.com/api/docs/guides/images-vision

| Valor | Comportamiento |
|-------|---------------|
| `low` | Imagen se procesa a 512x512px. Rapido y barato. |
| `high` | Imagen se escala y divide en tiles de 512x512px. Mayor precision. |
| `original` | Hasta 10,000 patches o 6,000px max. Solo `gpt-5.4` y posteriores. |
| `auto` | El modelo elige automaticamente el nivel de detalle. |

### 3.3 Calculo de tokens por imagen (modelos tile-based: GPT-4o, GPT-4.1, serie O)

> Para `"detail": "low"`, se usa un numero fijo base de tokens. Para `"detail": "high"`, la imagen se escala, se divide en cuadrados de 512px (tiles), y se aplica un costo por tile mas tokens base.
> — Fuente: https://developers.openai.com/api/docs/guides/vision

**Algoritmo para `detail: "high"`:**
1. Mantener aspect ratio original
2. Escalar para que quepa en un cuadrado de **2048px x 2048px**
3. Escalar para que el lado mas corto sea **768px** (la mayoria de modelos)
4. Contar tiles de **512px x 512px**
5. Total tokens = **Base Tokens + (Numero de Tiles x Tile Tokens)**

**Tabla de costos por modelo:**

| Modelo | Base tokens | Tile tokens | Fuente |
|--------|-------------|-------------|--------|
| `gpt-4o`, `gpt-4.1`, `gpt-4.5` | 85 | 170 | https://developers.openai.com/api/docs/guides/vision |
| `gpt-4o-mini` | 2,833 | 5,667 | https://developers.openai.com/api/docs/guides/vision |
| `gpt-5`, `gpt-5-chat-latest` | 70 | 140 | https://developers.openai.com/api/docs/guides/vision |
| `o1`, `o1-pro`, `o3` | 75 | 150 | https://developers.openai.com/api/docs/guides/vision |
| `computer-use-preview` | 65 | 129 | https://developers.openai.com/api/docs/guides/vision |

> **Nota sobre gpt-4o-mini**: Los valores de base tokens (2,833) y tile tokens (5,667) son significativamente mayores porque el tokenizer de gpt-4o-mini mapea de forma distinta los tokens de imagen. El COSTO REAL en dolares es menor porque el precio por token de gpt-4o-mini es mucho mas bajo.

### 3.4 Ejemplo de calculo

Para una imagen de **1024x768** con `detail: "high"` en `gpt-4o`:
1. Ya cabe en 2048x2048 (no se escala)
2. Lado corto = 768px (ya esta en 768, no se escala)
3. Imagen resultante: 1024x768
4. Tiles: ceil(1024/512) x ceil(768/512) = 2 x 2 = **4 tiles**
5. Total = 85 + (4 x 170) = **765 tokens**

Para `detail: "low"` en `gpt-4o`:
- Total = **85 tokens** (solo base tokens)

---

## 4. Pricing por imagen (low detail vs high detail)

Las imagenes se facturan como tokens de input. El costo depende de: (a) el numero de tokens que consume la imagen segun el calculo de la seccion anterior, y (b) el precio por token del modelo.

> "Image inputs are metered and charged in tokens, just as text inputs are."
> — Fuente: https://developers.openai.com/api/docs/guides/images-vision

### 4.1 Precios por millon de tokens (input)

| Modelo | Input ($/1M tokens) | Cached Input ($/1M tokens) | Output ($/1M tokens) | Fuente |
|--------|---------------------|---------------------------|---------------------|--------|
| `gpt-4o` | $2.50 | $1.25 | $10.00 | https://developers.openai.com/api/docs/pricing |
| `gpt-4o-mini` | $0.15 | $0.075 | $0.60 | https://developers.openai.com/api/docs/pricing |
| `gpt-4.1` | $2.00 | $0.50 | $8.00 | https://developers.openai.com/api/docs/pricing |
| `gpt-4.1-mini` | $0.40 | $0.10 | $1.60 | https://developers.openai.com/api/docs/pricing |
| `gpt-4.1-nano` | $0.10 | $0.025 | $0.40 | https://developers.openai.com/api/docs/pricing |
| `o1` | $15.00 | $7.50 | $60.00 | https://developers.openai.com/api/docs/pricing |
| `o3` | $2.00 | $0.50 | $8.00 | https://developers.openai.com/api/docs/pricing |
| `o4-mini` | $1.10 | $0.275 | $4.40 | https://developers.openai.com/api/docs/pricing |

### 4.2 Costo estimado por imagen (ejemplos practicos)

Usando una imagen tipica de **1024x768** con `gpt-4o`:

| Detail | Tokens consumidos | Costo estimado |
|--------|-------------------|----------------|
| `low` | 85 tokens | ~$0.000213 |
| `high` (4 tiles) | 765 tokens | ~$0.001913 |

Usando la misma imagen con `gpt-4.1`:

| Detail | Tokens consumidos | Costo estimado |
|--------|-------------------|----------------|
| `low` | 85 tokens | ~$0.000170 |
| `high` (4 tiles) | 765 tokens | ~$0.001530 |

Usando la misma imagen con `gpt-4o-mini`:

| Detail | Tokens consumidos | Costo estimado |
|--------|-------------------|----------------|
| `low` | 2,833 tokens | ~$0.000425 |
| `high` (4 tiles) | 25,501 tokens | ~$0.003825 |

> **Nota**: Aunque gpt-4o-mini usa mas tokens por imagen, su precio por token ($0.15/1M) es mucho menor que gpt-4o ($2.50/1M), por lo que el costo real es comparable o inferior.

---

## 5. Manejo de PDFs

### Se puede enviar PDF directamente -- NO es necesario convertir a imagen

> "Direct PDF file input is now supported in the API. No need for pre-processing or storing PDF files — you can send files directly to the Responses and Chat Completions APIs."
> — Fuente: https://developers.openai.com/api/docs/guides/pdf-files

> "The API extracts both text and images from PDFs, and models with vision capabilities can generate text with that context. More specifically, the API puts into the model's context both the extracted text and an image of each page."
> — Fuente: https://developers.openai.com/api/docs/guides/pdf-files

### 5.1 Limites de PDF

| Limite | Valor | Fuente |
|--------|-------|--------|
| Tamano maximo por archivo | **50 MB** | https://developers.openai.com/api/docs/guides/pdf-files |
| Tamano combinado por request | **50 MB** | https://developers.openai.com/api/docs/guides/pdf-files |
| Paginas maximas | No se especifica limite explicito [VERIFICAR] | https://developers.openai.com/api/docs/guides/pdf-files |

### 5.2 Modelos que soportan PDF con vision

> "PDF parsing that includes text and page images requires models with vision capabilities, such as `gpt-4o` and later models."
> — Fuente: https://developers.openai.com/api/docs/guides/pdf-files

Para modelos SIN vision: solo se extrae texto (no imagenes de las paginas).

### 5.3 Tres metodos para enviar PDFs

**Metodo 1: Base64 (Responses API)**
```json
{
  "type": "input_file",
  "filename": "document.pdf",
  "file_data": "data:application/pdf;base64,{encoded_bytes}"
}
```

**Metodo 2: File ID (subida previa)**
```json
{
  "type": "input_file",
  "file_id": "file-6F2ksmvXxt4VdoqmHRw6kL"
}
```

**Metodo 3: URL externa (solo Responses API)**
```json
{
  "type": "input_file",
  "file_url": "https://www.example.com/document.pdf"
}
```

> **Nota importante**: La Chat Completions API NO soporta `file_url`; para URLs usar la Responses API.
> — Fuente: https://developers.openai.com/api/docs/guides/pdf-files

### 5.4 Impacto en tokens

> "PDF parsing includes both extracted text and page images in context, which can increase token usage."
> — Fuente: https://developers.openai.com/api/docs/guides/pdf-files

Cada pagina del PDF genera tokens por: (a) el texto extraido, y (b) una imagen de la pagina completa. El costo de la imagen por pagina sigue el calculo de tokens de la seccion 3.

---

## 6. Snippets de codigo oficiales

### 6.1 Enviar imagen por URL (Responses API - Node.js/TypeScript)

Fuente: https://developers.openai.com/api/docs/guides/images-vision

```typescript
import OpenAI from "openai";
const client = new OpenAI();

const response = await client.responses.create({
  model: "gpt-4.1-mini",
  input: [{
    role: "user",
    content: [
      { type: "input_text", text: "What's in this image?" },
      {
        type: "input_image",
        image_url: "https://api.nga.gov/iiif/a2e6da57-3cd1-4235-b20e-95dcaefed6c8/full/!800,800/0/default.jpg",
      },
    ],
  }],
});

console.log(response.output_text);
```

### 6.2 Enviar imagen en Base64 (Responses API - JSON)

Fuente: https://developers.openai.com/api/docs/guides/images-vision

```json
{
  "model": "gpt-4.1",
  "input": [
    {
      "role": "user",
      "content": [
        { "type": "input_text", "text": "What's in this image?" },
        {
          "type": "input_image",
          "image_url": "data:image/jpeg;base64,{base64_image_string}"
        }
      ]
    }
  ]
}
```

### 6.3 Enviar imagen con Chat Completions (Python)

Fuente: https://developers.openai.com/api/docs/guides/images-vision

```python
response = client.chat.completions.create(
    model="gpt-4.1-mini",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "What's in this image?"},
            {
                "type": "image_url",
                "image_url": {"url": "https://example.com/image.jpg"},
            },
        ],
    }],
)
```

### 6.4 Enviar PDF en Base64 (Chat Completions - Node.js)

Fuente: https://developers.openai.com/api/docs/guides/pdf-files

```javascript
import fs from "fs";
import OpenAI from "openai";
const client = new OpenAI();

const data = fs.readFileSync("draconomicon.pdf");
const base64String = data.toString("base64");

const completion = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
        {
            role: "user",
            content: [
                {
                    type: "file",
                    file: {
                        filename: "draconomicon.pdf",
                        file_data: `data:application/pdf;base64,${base64String}`
                    }
                },
                {
                    type: "text",
                    text: "What is the first dragon in the book?",
                },
            ],
        },
    ],
});

console.log(completion.choices[0].message.content);
```

### 6.5 Enviar PDF en Base64 (Responses API - Node.js)

Fuente: https://developers.openai.com/api/docs/guides/pdf-files

```javascript
import fs from "fs";
import OpenAI from "openai";
const client = new OpenAI();

const data = fs.readFileSync("draconomicon.pdf");
const base64String = data.toString("base64");

const response = await client.responses.create({
    model: "gpt-4o",
    input: [
        {
            role: "user",
            content: [
                {
                    type: "input_file",
                    filename: "draconomicon.pdf",
                    file_data: `data:application/pdf;base64,${base64String}`,
                },
                {
                    type: "input_text",
                    text: "What is the first dragon in the book?",
                },
            ],
        },
    ],
});

console.log(response.output_text);
```

### 6.6 Subir PDF y referenciar por File ID (Chat Completions - cURL)

Fuente: https://developers.openai.com/api/docs/guides/pdf-files

```bash
# Paso 1: Subir el archivo
curl https://api.openai.com/v1/files \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -F purpose="user_data" \
    -F file="@draconomicon.pdf"

# Paso 2: Usar el file_id en la request
curl "https://api.openai.com/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -d '{
        "model": "gpt-4o",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "file",
                        "file": {
                            "file_id": "file-6F2ksmvXxt4VdoqmHRw6kL"
                        }
                    },
                    {
                        "type": "text",
                        "text": "What is the first dragon in the book?"
                    }
                ]
            }
        ]
    }'
```

---

## Resumen de restricciones y consideraciones

| Aspecto | Detalle | Fuente |
|---------|---------|--------|
| Formatos imagen | PNG, JPEG, WEBP, GIF (no animado) | https://developers.openai.com/api/docs/guides/images-vision |
| Max imagenes/request | 1,500 | https://developers.openai.com/api/docs/guides/images-vision |
| Max payload | 512 MB | https://developers.openai.com/api/docs/guides/images-vision |
| Max dimension (high) | 2,048px | https://developers.openai.com/api/docs/guides/vision |
| Max dimension (original) | 6,000px (solo gpt-5.4+) | https://developers.openai.com/api/docs/guides/vision |
| Detail por defecto | `auto` | https://developers.openai.com/api/docs/guides/images-vision |
| PDF max por archivo | 50 MB | https://developers.openai.com/api/docs/guides/pdf-files |
| PDF max combinado | 50 MB | https://developers.openai.com/api/docs/guides/pdf-files |
| PDF max paginas | No especificado [VERIFICAR] | https://developers.openai.com/api/docs/guides/pdf-files |
| PDF URL externa | Solo Responses API | https://developers.openai.com/api/docs/guides/pdf-files |
| Contenido prohibido | Watermarks, logos, NSFW | https://developers.openai.com/api/docs/guides/images-vision |

---

## Diferencias clave: Responses API vs Chat Completions API

| Aspecto | Responses API | Chat Completions API |
|---------|---------------|---------------------|
| Tipo de imagen | `input_image` | `image_url` |
| Campo URL | `image_url` (string directo) | `image_url.url` (objeto anidado) |
| File ID imagen | `file_id` | No soportado directamente |
| Tipo de archivo | `input_file` | `file` |
| URL externa para files | Soportado (`file_url`) | NO soportado |
| Tipo de texto | `input_text` | `text` |

Fuente: https://developers.openai.com/api/docs/guides/images-vision, https://developers.openai.com/api/docs/guides/pdf-files

---

*Documento generado para ingestion RAG. Todas las citas son textuales de la documentacion oficial de OpenAI. Items marcados con [VERIFICAR] requieren confirmacion adicional.*
