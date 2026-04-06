# Pydantic v2 -- Referencia Tecnica

**Fuente oficial**: https://docs.pydantic.dev/latest/
**Fecha de consulta**: 2026-04-05

---

## Tabla de metodos clave

| Metodo | Tipo | Descripcion | Fuente |
|--------|------|-------------|--------|
| `model_validate()` | classmethod | Valida un dict/objeto Python contra el modelo | [Models](https://docs.pydantic.dev/latest/concepts/models/) |
| `model_validate_json()` | classmethod | Valida un string/bytes JSON contra el modelo | [Models](https://docs.pydantic.dev/latest/concepts/models/) |
| `model_validate_strings()` | classmethod | Valida un dict de strings (formularios, query params) | [Models](https://docs.pydantic.dev/latest/concepts/models/) |
| `model_dump()` | instance | Serializa el modelo a dict Python | [Serialization](https://docs.pydantic.dev/latest/concepts/serialization/) |
| `model_dump_json()` | instance | Serializa el modelo a string JSON | [Serialization](https://docs.pydantic.dev/latest/concepts/serialization/) |
| `model_json_schema()` | classmethod | Genera JSON Schema del modelo | [API BaseModel](https://docs.pydantic.dev/latest/api/base_model/) |
| `@field_validator` | decorator | Validacion a nivel de campo | [Validators](https://docs.pydantic.dev/latest/concepts/validators/) |
| `@model_validator` | decorator | Validacion a nivel de modelo completo | [Validators](https://docs.pydantic.dev/latest/concepts/validators/) |
| `@field_serializer` | decorator | Serializacion custom a nivel de campo | [Serialization](https://docs.pydantic.dev/latest/concepts/serialization/) |
| `@model_serializer` | decorator | Serializacion custom a nivel de modelo | [Serialization](https://docs.pydantic.dev/latest/concepts/serialization/) |

---

## 1. model_validate() vs model_validate_json()

**Fuente**: https://docs.pydantic.dev/latest/concepts/models/

### Diferencias fundamentales

| Aspecto | `model_validate()` | `model_validate_json()` |
|---------|--------------------|-------------------------|
| Entrada | `dict`, objeto Python, instancia de modelo | `str`, `bytes`, `bytearray` (JSON) |
| Parsing | No hace parsing de JSON | Parsea JSON internamente (mas rapido) |
| Rendimiento | Estandar | Mas rapido para payloads JSON |
| Uso tipico | Datos ya parseados (dicts) | Datos crudos de HTTP, archivos, etc. |

### Firmas oficiales

**Fuente**: https://docs.pydantic.dev/latest/api/base_model/

```python
@classmethod
def model_validate(
    cls,
    obj: Any,
    *,
    strict: bool | None = None,
    extra: ExtraValues | None = None,
    from_attributes: bool | None = None,
    context: Any | None = None,
    by_alias: bool | None = None,
    by_name: bool | None = None,
) -> Self
```

```python
@classmethod
def model_validate_json(
    cls,
    json_data: str | bytes | bytearray,
    *,
    strict: bool | None = None,
    extra: ExtraValues | None = None,
    context: Any | None = None,
    by_alias: bool | None = None,
    by_name: bool | None = None,
) -> Self
```

> "Validates the given object against the Pydantic model." -- Fuente: https://docs.pydantic.dev/latest/api/base_model/

> "Validates the given JSON data against the Pydantic model." -- Fuente: https://docs.pydantic.dev/latest/api/base_model/

### Ejemplo oficial

**Fuente**: https://docs.pydantic.dev/latest/concepts/models/

```python
from datetime import datetime
from pydantic import BaseModel, ValidationError


class User(BaseModel):
    id: int
    name: str = 'John Doe'
    signup_ts: datetime | None = None


# model_validate: acepta dict Python
m = User.model_validate({'id': 123, 'name': 'James'})
print(m)
# id=123 name='James' signup_ts=None

# model_validate_json: acepta string JSON
try:
    m = User.model_validate_json('{"id": 123, "name": 123}')
except ValidationError as e:
    print(e)
    """
    1 validation error for User
    name
      Input should be a valid string [type=string_type, input_value=123, input_type=int]
    """

# model_validate_strings: acepta dict de strings
m = User.model_validate_strings({'id': '123', 'name': 'James'})
print(m)
# id=123 name='James' signup_ts=None

m = User.model_validate_strings(
    {'id': '123', 'name': 'James', 'signup_ts': '2024-04-01T12:00:00'}
)
print(m)
# id=123 name='James' signup_ts=datetime.datetime(2024, 4, 1, 12, 0)

try:
    m = User.model_validate_strings(
        {'id': '123', 'name': 'James', 'signup_ts': '2024-04-01'}, strict=True
    )
except ValidationError as e:
    print(e)
    """
    1 validation error for User
    signup_ts
      Input should be a valid datetime, invalid datetime separator, expected `T`, `t`, `_` or space [type=datetime_parsing, input_value='2024-04-01', input_type=str]
    """
```

### Cuando usar cada uno

- **`model_validate()`**: Cuando los datos ya estan como dict Python (por ejemplo, tras `json.loads()`, datos de un ORM, parametros de una funcion).
- **`model_validate_json()`**: Cuando recibes JSON crudo como string o bytes. Es MAS RAPIDO que hacer `json.loads()` + `model_validate()` porque Pydantic usa `pydantic-core` (Rust) para parsear el JSON directamente.
- **`model_validate_strings()`**: Cuando los datos vienen como strings (formularios HTML, query parameters de URL).

---

## 2. Validators: field_validator y model_validator

**Fuente**: https://docs.pydantic.dev/latest/concepts/validators/

### 2.1 field_validator

El decorator `@field_validator` aplica validacion a nivel de campo individual. Soporta 4 modos:

| Modo | Cuando ejecuta | Tipo de entrada |
|------|----------------|-----------------|
| `after` (default) | Despues de la validacion interna de Pydantic | Tipo ya validado |
| `before` | Antes de la validacion interna | `Any` (dato crudo) |
| `wrap` | Envuelve la validacion interna (antes y despues) | `Any` + handler |
| `plain` | Reemplaza completamente la validacion interna | `Any` |

#### Ejemplo: After validator (patron decorator)

**Fuente**: https://docs.pydantic.dev/latest/concepts/validators/

```python
from pydantic import BaseModel, field_validator

class Model(BaseModel):
    number: int

    @field_validator('number', mode='after')
    @classmethod
    def is_even(cls, value: int) -> int:
        if value % 2 == 1:
            raise ValueError(f'{value} is not an even number')
        return value
```

#### Ejemplo: After validator (patron Annotated)

**Fuente**: https://docs.pydantic.dev/latest/concepts/validators/

```python
from typing import Annotated
from pydantic import AfterValidator, BaseModel, ValidationError

def is_even(value: int) -> int:
    if value % 2 == 1:
        raise ValueError(f'{value} is not an even number')
    return value

class Model(BaseModel):
    number: Annotated[int, AfterValidator(is_even)]
```

#### Ejemplo: Before validator

**Fuente**: https://docs.pydantic.dev/latest/concepts/validators/

```python
from typing import Annotated, Any
from pydantic import BaseModel, BeforeValidator

def ensure_list(value: Any) -> Any:
    if not isinstance(value, list):
        return [value]
    return value

class Model(BaseModel):
    numbers: Annotated[list[int], BeforeValidator(ensure_list)]
```

#### Ejemplo: Wrap validator

**Fuente**: https://docs.pydantic.dev/latest/concepts/validators/

```python
from typing import Any, Annotated
from pydantic import BaseModel, Field, WrapValidator, ValidationError, ValidatorFunctionWrapHandler

def truncate(value: Any, handler: ValidatorFunctionWrapHandler) -> str:
    try:
        return handler(value)
    except ValidationError as err:
        if err.errors()[0]['type'] == 'string_too_long':
            return handler(value[:5])
        raise

class Model(BaseModel):
    my_string: Annotated[str, Field(max_length=5), WrapValidator(truncate)]
```

#### Acceso a ValidationInfo y contexto

**Fuente**: https://docs.pydantic.dev/latest/concepts/validators/

Los validators pueden acceder a campos ya validados via `ValidationInfo.data` y a contexto externo via `ValidationInfo.context`:

> "As validation is performed in the order fields are defined, you have to make sure you are not accessing a field that hasn't been validated yet." -- Fuente: https://docs.pydantic.dev/latest/concepts/validators/

```python
from pydantic import BaseModel, ValidationInfo, field_validator

class UserModel(BaseModel):
    password: str
    password_repeat: str
    username: str

    @field_validator('password_repeat', mode='after')
    @classmethod
    def check_passwords_match(cls, value: str, info: ValidationInfo) -> str:
        if value != info.data['password']:
            raise ValueError('Passwords do not match')
        return value
```

#### Uso de contexto externo

**Fuente**: https://docs.pydantic.dev/latest/concepts/validators/

```python
from pydantic import BaseModel, ValidationInfo, field_validator

class Model(BaseModel):
    text: str

    @field_validator('text', mode='after')
    @classmethod
    def remove_stopwords(cls, v: str, info: ValidationInfo) -> str:
        if isinstance(info.context, dict):
            stopwords = info.context.get('stopwords', set())
            v = ' '.join(w for w in v.split() if w.lower() not in stopwords)
        return v

data = {'text': 'This is an example document'}
Model.model_validate(data, context={'stopwords': ['this', 'is', 'an']})
```

#### Orden de ejecucion de validators

**Fuente**: https://docs.pydantic.dev/latest/concepts/validators/

> "before and wrap validators are run from right to left, and after validators are then run from left to right." -- Fuente: https://docs.pydantic.dev/latest/concepts/validators/

```python
from pydantic import AfterValidator, BaseModel, BeforeValidator, WrapValidator
from typing import Annotated

class Model(BaseModel):
    name: Annotated[
        str,
        AfterValidator(runs_3rd),
        AfterValidator(runs_4th),
        BeforeValidator(runs_2nd),
        WrapValidator(runs_1st),
    ]
```

### 2.2 model_validator

El decorator `@model_validator` aplica validacion al modelo COMPLETO. Util para validaciones cruzadas entre campos.

#### Ejemplo: model_validator mode='after'

**Fuente**: https://docs.pydantic.dev/latest/concepts/validators/

> "the validated instance should be returned." -- Fuente: https://docs.pydantic.dev/latest/concepts/validators/

```python
from typing_extensions import Self
from pydantic import BaseModel, model_validator

class UserModel(BaseModel):
    username: str
    password: str
    password_repeat: str

    @model_validator(mode='after')
    def check_passwords_match(self) -> Self:
        if self.password != self.password_repeat:
            raise ValueError('Passwords do not match')
        return self
```

#### Ejemplo: model_validator mode='before'

**Fuente**: https://docs.pydantic.dev/latest/concepts/validators/

```python
from typing import Any
from pydantic import BaseModel, model_validator

class UserModel(BaseModel):
    username: str

    @model_validator(mode='before')
    @classmethod
    def check_card_number_not_present(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if 'card_number' in data:
                raise ValueError("'card_number' should not be included")
        return data
```

#### Ejemplo: model_validator mode='wrap'

**Fuente**: https://docs.pydantic.dev/latest/concepts/validators/

```python
import logging
from typing import Any
from typing_extensions import Self
from pydantic import BaseModel, ModelWrapValidatorHandler, ValidationError, model_validator

class UserModel(BaseModel):
    username: str

    @model_validator(mode='wrap')
    @classmethod
    def log_failed_validation(cls, data: Any, handler: ModelWrapValidatorHandler[Self]) -> Self:
        try:
            return handler(data)
        except ValidationError:
            logging.error('Model %s failed to validate with data %s', cls, data)
            raise
```

### 2.3 Errores en validators

**Fuente**: https://docs.pydantic.dev/latest/concepts/validators/

Tres tipos de excepciones funcionan dentro de validators:

1. **`ValueError`** -- la mas comun
2. **`AssertionError`** -- funciona pero se omite con `python -O`
3. **`PydanticCustomError`** -- maximo control sobre tipo, mensaje y contexto

```python
from pydantic_core import PydanticCustomError
from pydantic import BaseModel, field_validator

class Model(BaseModel):
    x: int

    @field_validator('x', mode='after')
    @classmethod
    def validate_x(cls, v: int) -> int:
        if v % 42 == 0:
            raise PydanticCustomError(
                'the_answer_error',
                '{number} is the answer!',
                {'number': v},
            )
        return v
```

---

## 3. Tipos opcionales y valores por defecto

**Fuente**: https://docs.pydantic.dev/latest/concepts/models/

### Sintaxis para campos opcionales

Pydantic v2 soporta ambas sintaxis para tipos opcionales:

```python
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

# Sintaxis moderna (Python 3.10+)
class User(BaseModel):
    id: int
    name: str = 'John Doe'           # Valor por defecto
    signup_ts: datetime | None = None  # Opcional con default None

# Sintaxis clasica (compatible con Python 3.9)
class UserCompat(BaseModel):
    id: int
    name: str = 'John Doe'
    signup_ts: Optional[datetime] = None
```

### Reglas importantes

| Declaracion | Requerido | Acepta None | Default |
|-------------|-----------|-------------|---------|
| `name: str` | Si | No | -- |
| `name: str = 'valor'` | No | No | `'valor'` |
| `name: str \| None` | Si | Si | -- |
| `name: str \| None = None` | No | Si | `None` |
| `name: str \| None = 'valor'` | No | Si | `'valor'` |

**IMPORTANTE**: `str | None` sin `= None` es un campo REQUERIDO que acepta None como valor. Para que sea opcional (no requerido), DEBES agregar `= None`.

### Ejemplo completo

**Fuente**: https://docs.pydantic.dev/latest/concepts/models/

```python
from datetime import datetime
from pydantic import BaseModel, ValidationError


class User(BaseModel):
    id: int
    name: str = 'John Doe'
    signup_ts: datetime | None = None


# Campo con default: no es necesario proporcionarlo
m = User.model_validate({'id': 123})
print(m)
# id=123 name='John Doe' signup_ts=None

# Campo requerido faltante: error
try:
    User.model_validate({'name': 'James'})
except ValidationError as e:
    print(e)
    # 1 validation error for User
    # id
    #   Field required [type=missing, ...]
```

---

## 4. Discriminated unions

**Fuente**: https://docs.pydantic.dev/latest/concepts/unions/

Las discriminated unions (unions etiquetadas) permiten validar tipos `Union` de forma eficiente, eligiendo contra que miembro del union validar basandose en un campo discriminador.

> "Discriminated unions can be used to more efficiently validate Union types, by choosing which member of the union to validate against." -- Fuente: https://docs.pydantic.dev/latest/concepts/unions/

### 4.1 String discriminator con Literal

**Fuente**: https://docs.pydantic.dev/latest/concepts/unions/

Cada modelo define un campo comun con un valor `Literal`. El `Field(discriminator=...)` indica que campo usar para decidir.

```python
from typing import Literal, Union
from pydantic import BaseModel, Field, ValidationError


class Cat(BaseModel):
    pet_type: Literal['cat']
    meows: int


class Dog(BaseModel):
    pet_type: Literal['dog']
    barks: float


class Lizard(BaseModel):
    pet_type: Literal['reptile', 'lizard']
    scales: bool


class Model(BaseModel):
    pet: Union[Cat, Dog, Lizard] = Field(discriminator='pet_type')
    n: int


print(Model(pet={'pet_type': 'dog', 'barks': 3.14}, n=1))
# pet=Dog(pet_type='dog', barks=3.14) n=1
try:
    Model(pet={'pet_type': 'dog'}, n=1)
except ValidationError as e:
    print(e)
    """
    1 validation error for Model
    pet.dog.barks
      Field required [type=missing, input_value={'pet_type': 'dog'}, input_type=dict]
    """
```

Tambien se puede usar la sintaxis moderna `|`:

```python
class Model(BaseModel):
    pet: Cat | Dog | Lizard = Field(discriminator='pet_type')
    n: int
```

### 4.2 Callable discriminator

**Fuente**: https://docs.pydantic.dev/latest/concepts/unions/

Cuando los modelos del union no comparten un campo comun, se usa un `Discriminator` callable con `Tag` para etiquetar cada variante:

> "When designing callable discriminators, account for both `dict` and model type inputs." -- Fuente: https://docs.pydantic.dev/latest/concepts/unions/

```python
from typing import Annotated, Any
from pydantic import BaseModel, Discriminator, Tag, ValidationError


def model_x_discriminator(v: Any) -> str:
    if isinstance(v, int):
        return 'int'
    if isinstance(v, (dict, BaseModel)):
        return 'model'
    else:
        # return None if the discriminator value isn't found
        return None


class SpecialValue(BaseModel):
    value: int


class DiscriminatedModel(BaseModel):
    value: Annotated[
        (
            Annotated[int, Tag('int')] |
            Annotated['SpecialValue', Tag('model')]
        ),
        Discriminator(model_x_discriminator),
    ]


model_data = {'value': {'value': 1}}
m = DiscriminatedModel.model_validate(model_data)
print(m)
#> value=SpecialValue(value=1)

int_data = {'value': 123}
m = DiscriminatedModel.model_validate(int_data)
print(m)
#> value=123

try:
    DiscriminatedModel.model_validate({'value': 'not an int or a model'})
except ValidationError as e:
    print(e)
    """
    1 validation error for DiscriminatedModel
    value
      Unable to extract tag using discriminator model_x_discriminator() [type=union_tag_not_found, input_value='not an int or a model', input_type=str]
    """
```

### 4.3 Discriminated unions anidadas

**Fuente**: https://docs.pydantic.dev/latest/concepts/unions/

Se pueden combinar multiples discriminadores usando tipos `Annotated` anidados:

```python
from typing import Annotated, Literal, Union
from pydantic import BaseModel, Field

class BlackCat(BaseModel):
    pet_type: Literal['cat']
    color: Literal['black']
    black_name: str

class WhiteCat(BaseModel):
    pet_type: Literal['cat']
    color: Literal['white']
    white_name: str

Cat = Annotated[Union[BlackCat, WhiteCat], Field(discriminator='color')]

class Dog(BaseModel):
    pet_type: Literal['dog']
    name: str

Pet = Annotated[Union[Cat, Dog], Field(discriminator='pet_type')]

class Model(BaseModel):
    pet: Pet
```

### 4.4 Errores custom en discriminated unions

**Fuente**: https://docs.pydantic.dev/latest/concepts/unions/

```python
from typing import Annotated, Union
from pydantic import BaseModel, Discriminator, Tag, ValidationError


def model_x_discriminator(v):
    if isinstance(v, str):
        return 'str'
    if isinstance(v, (dict, BaseModel)):
        return 'model'


class DiscriminatedModel(BaseModel):
    x: Annotated[
        Union[
            Annotated[str, Tag('str')],
            Annotated['DiscriminatedModel', Tag('model')],
        ],
        Discriminator(
            model_x_discriminator,
            custom_error_type='invalid_union_member',
            custom_error_message='Invalid union member',
            custom_error_context={'discriminator': 'str_or_model'},
        ),
    ]


try:
    DiscriminatedModel.model_validate({'x': {'x': {'x': 1}}})
except ValidationError as e:
    print(e)
    """
    1 validation error for DiscriminatedModel
    x.model.x.model.x
      Invalid union member [type=invalid_union_member, input_value=1, input_type=int]
    """


# Los datos validos se manejan correctamente:
data = {'x': {'x': {'x': 'a'}}}
m = DiscriminatedModel.model_validate(data)
print(m.model_dump())
#> {'x': {'x': {'x': 'a'}}}
```

### 4.5 Errores de discriminador invalido

**Fuente**: https://docs.pydantic.dev/latest/errors/validation_errors/

Cuando el valor del discriminador no coincide con ninguna variante, Pydantic lanza `union_tag_invalid`:

```python
from typing import Literal, Union
from pydantic import BaseModel, Field, ValidationError


class BlackCat(BaseModel):
    pet_type: Literal['blackcat']


class WhiteCat(BaseModel):
    pet_type: Literal['whitecat']


class Model(BaseModel):
    cat: Union[BlackCat, WhiteCat] = Field(discriminator='pet_type')


try:
    Model(cat={'pet_type': 'dog'})
except ValidationError as exc:
    print(repr(exc.errors()[0]['type']))
    #> 'union_tag_invalid'
```

---

## 5. Serializacion: model_dump() y model_dump_json()

**Fuente**: https://docs.pydantic.dev/latest/concepts/serialization/

### 5.1 model_dump()

> "Generate a dictionary representation of the model, optionally specifying which fields to include or exclude." -- Fuente: https://docs.pydantic.dev/latest/api/base_model/

**Firma completa**:

```python
def model_dump(
    self,
    *,
    mode: Literal['json', 'python'] | str = 'python',
    include: IncEx | None = None,
    exclude: IncEx | None = None,
    context: Any | None = None,
    by_alias: bool | None = None,
    exclude_unset: bool = False,
    exclude_defaults: bool = False,
    exclude_none: bool = False,
    exclude_computed_fields: bool = False,
    round_trip: bool = False,
    warnings: bool | Literal['none', 'warn', 'error'] = True,
    fallback: Callable[[Any], Any] | None = None,
    serialize_as_any: bool = False,
) -> dict[str, Any]
```

#### Diferencia entre mode='python' y mode='json'

**Fuente**: https://docs.pydantic.dev/latest/concepts/serialization/

```python
# mode='python' (default): preserva tipos Python nativos
m.model_dump()
# {'banana': 3.14, 'foo': 'hello', 'bar': {'whatever': (1, 2)}}

# mode='json': convierte a tipos JSON-compatibles
m.model_dump(mode='json')
# {'banana': 3.14, 'foo': 'hello', 'bar': {'whatever': [1, 2]}}
# Nota: tuple se convierte a list
```

#### Parametros clave

**Fuente**: https://docs.pydantic.dev/latest/api/base_model/

| Parametro | Descripcion |
|-----------|-------------|
| `mode` | `'python'` (default) preserva tipos nativos; `'json'` convierte a JSON-compatibles |
| `include` | Set o dict de campos a incluir |
| `exclude` | Set o dict de campos a excluir |
| `by_alias` | Usa alias de serializacion en lugar del nombre del campo |
| `exclude_unset` | Excluye campos no explicitamente seteados |
| `exclude_defaults` | Excluye campos con su valor por defecto |
| `exclude_none` | Excluye campos con valor `None` |
| `context` | Contexto adicional para el serializer |
| `round_trip` | Si True, valores dumped son validos como input |

#### Ejemplo: include y exclude

**Fuente**: https://docs.pydantic.dev/latest/concepts/serialization/

```python
from pydantic import BaseModel, Field, SecretStr

class User(BaseModel):
    id: int
    username: str
    password: SecretStr

class Transaction(BaseModel):
    id: str
    private_id: str = Field(exclude=True)
    user: User
    value: int

t = Transaction(
    id='1234567890',
    private_id='123',
    user=User(id=42, username='JohnDoe', password='hashedpassword'),
    value=9876543210,
)

# Excluir campos de nivel superior con set
print(t.model_dump(exclude={'user', 'value'}))

# Exclusion anidada con dict
print(t.model_dump(exclude={'user': {'username', 'password'}, 'value': True}))

# Include especifico
print(t.model_dump(include={'id': True, 'user': {'id'}}))
```

### 5.2 model_dump_json()

> "Generates a JSON representation of the model" -- Fuente: https://docs.pydantic.dev/latest/api/base_model/

**Firma completa**:

```python
def model_dump_json(
    self,
    *,
    indent: int | None = None,
    ensure_ascii: bool = False,
    include: IncEx | None = None,
    exclude: IncEx | None = None,
    context: Any | None = None,
    by_alias: bool | None = None,
    exclude_unset: bool = False,
    exclude_defaults: bool = False,
    exclude_none: bool = False,
    exclude_computed_fields: bool = False,
    round_trip: bool = False,
    warnings: bool | Literal['none', 'warn', 'error'] = True,
    fallback: Callable[[Any], Any] | None = None,
    serialize_as_any: bool = False,
) -> str
```

La diferencia con `model_dump()` es que:
- Devuelve `str` (JSON) en vez de `dict`
- Tiene parametros adicionales: `indent` (indentacion) y `ensure_ascii`
- Usa `pydantic-core` (Rust) para serializar, por lo que es MAS RAPIDO que `json.dumps(model.model_dump(mode='json'))`

### 5.3 Custom serializers

**Fuente**: https://docs.pydantic.dev/latest/concepts/serialization/

#### field_serializer

```python
from pydantic import BaseModel, field_serializer
from typing import Any

class Model(BaseModel):
    number: int

    @field_serializer('number', mode='plain')
    def ser_number(self, value: Any) -> Any:
        return value * 2
```

#### model_serializer

Permite personalizar la serializacion completa del modelo en modo `plain` o `wrap`.

---

## 6. Integracion con OpenAI Structured Outputs

**Fuente**: https://developers.openai.com/api/docs/guides/structured-outputs

OpenAI Structured Outputs garantiza que el modelo siempre genere respuestas que se adhieran al JSON Schema proporcionado. El SDK de Python permite usar modelos Pydantic directamente como schema.

> "Structured Outputs is a feature that ensures the model will always generate responses that adhere to your supplied JSON Schema." -- Fuente: https://developers.openai.com/api/docs/guides/structured-outputs

### 6.1 Definicion del modelo Pydantic

**Fuente**: https://developers.openai.com/api/docs/guides/structured-outputs

```python
from pydantic import BaseModel
from typing import Optional

class Vendor(BaseModel):
    name: str
    address: str | None = None

class LineItem(BaseModel):
    description: str
    quantity: int
    unit_price: float
    total: float

class Receipt(BaseModel):
    vendor: Vendor
    date: Optional[str] = None
    line_items: list[LineItem] = []
    subtotal: Optional[float] = None
    tax: Optional[float] = None
    total: float
```

### 6.2 Chat Completions API (con parse)

**Fuente**: https://developers.openai.com/api/docs/guides/structured-outputs

```python
from openai import OpenAI
from pydantic import BaseModel

client = OpenAI()

class CalendarEvent(BaseModel):
    name: str
    date: str
    participants: list[str]

completion = client.chat.completions.parse(
    model="gpt-4o-2024-08-06",
    messages=[
        {"role": "system", "content": "Extract the event information."},
        {"role": "user", "content": "Alice and Bob are going to a science fair on Friday."},
    ],
    response_format=CalendarEvent,
)

event = completion.choices[0].message.parsed
```

### 6.3 Responses API (nueva)

**Fuente**: https://developers.openai.com/api/docs/guides/structured-outputs

```python
response = client.responses.parse(
    model="gpt-4o-2024-08-06",
    input=[
        {"role": "system", "content": "Extract the event information."},
        {"role": "user", "content": "Alice and Bob are going to a science fair on Friday."},
    ],
    text_format=CalendarEvent,
)

event = response.output_parsed
```

### 6.4 Diferencias clave entre APIs

| Aspecto | Chat Completions API | Responses API |
|---------|---------------------|---------------|
| Metodo | `client.chat.completions.parse()` | `client.responses.parse()` |
| Parametro de schema | `response_format=Model` | `text_format=Model` |
| Acceso al resultado | `completion.choices[0].message.parsed` | `response.output_parsed` |
| Modelos compatibles | gpt-4o-2024-08-06+, gpt-4o-mini | gpt-4o-2024-08-06+, gpt-4o-mini |

### 6.5 Como funciona internamente

> "Under the hood, the SDK takes care of supplying the JSON schema corresponding to your data structure, and then parsing the response as an object." -- Fuente: https://developers.openai.com/api/docs/guides/structured-outputs

El SDK automaticamente:
1. Convierte el `BaseModel` de Pydantic a JSON Schema (via `model_json_schema()`)
2. Envia el schema como `response_format` en la API call
3. Parsea la respuesta JSON del LLM
4. Instancia y valida el modelo Pydantic
5. Devuelve la instancia validada

### 6.6 Beneficios

> "reliable type-safety", "no need to validate or retry incorrectly formatted responses", "simpler prompting" -- Fuente: https://developers.openai.com/api/docs/guides/structured-outputs

### 6.7 Restricciones conocidas [VERIFICAR]

Las restricciones exactas del subset de JSON Schema soportado por OpenAI Structured Outputs no fueron accesibles directamente en la documentacion al momento de la consulta (pagina principal retorno 403). Basado en informacion secundaria:

- Soporta tipos basicos: `str`, `int`, `float`, `bool`, `list`, `Optional`
- Soporta modelos anidados (nested `BaseModel`)
- Soporta `Literal` y `Enum`
- [VERIFICAR] Restricciones sobre tipos recursivos, `Union` arbitrarios, y validadores custom en el schema

---

## 7. Manejo de errores de validacion (ValidationError)

**Fuente**: https://docs.pydantic.dev/latest/errors/errors/

### 7.1 Naturaleza del ValidationError

> "Pydantic raises a `ValidationError` whenever it encounters an issue with the data it's validating. A single `ValidationError` will be raised regardless of the number of errors found, and this exception will contain comprehensive information about all detected errors." -- Fuente: https://docs.pydantic.dev/latest/concepts/models/

`ValidationError` es una excepcion de `pydantic-core` que encapsula TODOS los errores de validacion encontrados en una sola excepcion.

### 7.2 Metodos principales

**Fuente**: https://docs.pydantic.dev/latest/api/pydantic_core/

| Metodo | Retorna | Descripcion |
|--------|---------|-------------|
| `errors()` | `list[ErrorDetails]` | Lista de dicts con detalle de cada error |
| `error_count()` | `int` | Cantidad total de errores |
| `json()` | `str` | Representacion JSON de los errores |

#### Firma de errors()

```python
errors(
    *,
    include_url: bool = True,
    include_context: bool = True,
    include_input: bool = True
) -> list[ErrorDetails]
```

#### Firma de json()

```python
json(
    *,
    indent: int | None = None,
    include_url: bool = True,
    include_context: bool = True,
    include_input: bool = True
) -> str
```

### 7.3 Estructura de ErrorDetails

**Fuente**: https://docs.pydantic.dev/latest/errors/errors/

Cada error en la lista devuelta por `errors()` contiene:

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `type` | `str` | Identificador legible por maquina del tipo de error (ej: `'string_type'`, `'missing'`, `'int_parsing'`) |
| `loc` | `tuple` | Ubicacion/ruta al campo con error (ej: `('name',)`, `('pet', 'dog', 'barks')`) |
| `msg` | `str` | Mensaje legible por humanos |
| `input` | `Any` | El valor de entrada que fallo la validacion |
| `ctx` | `dict` (opcional) | Valores adicionales de contexto necesarios para renderizar el mensaje |
| `url` | `str` | URL a la documentacion del tipo de error |

### 7.4 Ejemplo completo de manejo de errores

**Fuente**: https://docs.pydantic.dev/latest/concepts/models/

```python
from datetime import datetime
from pydantic import BaseModel, ValidationError


class User(BaseModel):
    id: int
    name: str = 'John Doe'
    signup_ts: datetime | None = None


try:
    User.model_validate({'id': 'not-an-int', 'name': 123})
except ValidationError as e:
    # Cantidad de errores
    print(f"Errores encontrados: {e.error_count()}")

    # Lista detallada
    for error in e.errors():
        print(f"  Campo: {error['loc']}")
        print(f"  Tipo:  {error['type']}")
        print(f"  Msg:   {error['msg']}")
        print(f"  Input: {error['input']}")
        print()

    # Representacion JSON
    print(e.json(indent=2))
```

### 7.5 Ejemplo con model_validate_json

**Fuente**: https://docs.pydantic.dev/latest/concepts/models/

```python
from pydantic import BaseModel, ValidationError

class User(BaseModel):
    id: int
    name: str = 'John Doe'

try:
    m = User.model_validate_json('{"id": 123, "name": 123}')
except ValidationError as e:
    print(e)
    """
    1 validation error for User
    name
      Input should be a valid string [type=string_type, input_value=123, input_type=int]
    """
```

### 7.6 Errores custom con PydanticCustomError

**Fuente**: https://docs.pydantic.dev/latest/concepts/validators/

Para maximo control sobre el tipo, mensaje y contexto del error:

```python
from pydantic_core import PydanticCustomError
from pydantic import BaseModel, field_validator

class Model(BaseModel):
    x: int

    @field_validator('x', mode='after')
    @classmethod
    def validate_x(cls, v: int) -> int:
        if v % 42 == 0:
            raise PydanticCustomError(
                'the_answer_error',          # type
                '{number} is the answer!',    # message template
                {'number': v},                # context
            )
        return v
```

### 7.7 Tipos de error comunes

**Fuente**: https://docs.pydantic.dev/latest/errors/validation_errors/

| Tipo de error | Descripcion |
|---------------|-------------|
| `missing` | Campo requerido no proporcionado |
| `string_type` | Se esperaba string, se recibio otro tipo |
| `int_parsing` | No se pudo parsear como entero |
| `datetime_parsing` | Formato de datetime invalido |
| `union_tag_not_found` | Discriminador no encontro variante (callable discriminator) |
| `union_tag_invalid` | Valor del discriminador no coincide con ninguna variante |
| `string_too_long` | String excede max_length |
| `value_error` | Lanzado por `ValueError` en validators |

La documentacion oficial lista mas de 100 tipos de error en: https://docs.pydantic.dev/latest/errors/validation_errors/

---

## Referencias completas

| Seccion | URL oficial |
|---------|-------------|
| Documentacion principal | https://docs.pydantic.dev/latest/ |
| Models (validate/dump) | https://docs.pydantic.dev/latest/concepts/models/ |
| Validators | https://docs.pydantic.dev/latest/concepts/validators/ |
| Serialization | https://docs.pydantic.dev/latest/concepts/serialization/ |
| Unions (discriminated) | https://docs.pydantic.dev/latest/concepts/unions/ |
| API BaseModel | https://docs.pydantic.dev/latest/api/base_model/ |
| ValidationError API | https://docs.pydantic.dev/latest/api/pydantic_core/ |
| Validation Errors catalog | https://docs.pydantic.dev/latest/errors/validation_errors/ |
| Error handling | https://docs.pydantic.dev/latest/errors/errors/ |
| OpenAI Structured Outputs | https://developers.openai.com/api/docs/guides/structured-outputs |
| JSON Schema | https://docs.pydantic.dev/latest/concepts/json_schema/ |
