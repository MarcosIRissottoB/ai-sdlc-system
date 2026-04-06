# LangChain Python -- Referencia Tecnica

**Fuente oficial**: https://docs.langchain.com/oss/python/langchain/overview  
**API Reference**: https://reference.langchain.com/python/langchain/  
**Fecha de consulta**: 2026-04-05

---

## Tabla de Contenidos

1. [Agents -- Creacion de agentes con tools](#1-agents)
2. [Multi-agent patterns -- Supervisor, Handoff, Swarm](#2-multi-agent-patterns)
3. [Chains -- LCEL (LangChain Expression Language)](#3-chains--lcel)
4. [Retrievers -- Integracion con vector stores](#4-retrievers)
5. [Callbacks y Tracing -- LangSmith y Langfuse](#5-callbacks-y-tracing)
6. [Snippets de codigo oficial](#6-snippets-de-codigo-oficial)

---

## 1. Agents

### 1.1 Conceptos fundamentales

Los agentes combinan modelos de lenguaje con herramientas (tools) para crear sistemas que razonan sobre tareas, deciden que herramientas usar, y trabajan iterativamente hacia una solucion.

> "Agents combine language models with tools to create systems that can reason about tasks, decide which tools to use, and iteratively work towards solutions."
> -- Fuente: https://docs.langchain.com/oss/python/langchain/agents

El flujo de un agente sigue un loop: recibe input -> el LLM determina una accion -> las tools ejecutan esa accion -> las observaciones regresan al LLM -> se repite hasta alcanzar un output final.

> "LangChain agents are built on top of LangGraph in order to provide durable execution, streaming, human-in-the-loop, persistence, and more."
> -- Fuente: https://docs.langchain.com/oss/python/langchain/agents

### 1.2 `create_agent` (API moderna)

La API moderna de LangChain usa `create_agent` como funcion principal para crear agentes.

**Fuente**: https://docs.langchain.com/oss/python/langchain/agents

```python
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

model = ChatOpenAI(
    model="gpt-4o",
    temperature=0.1,
    max_tokens=1000,
    timeout=30
)

agent = create_agent(model, tools=tools)
```

**Parametros clave de `create_agent`**:

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `model` | `BaseChatModel` o `str` | Motor de razonamiento (instancia o string como `"openai:gpt-4o"`) |
| `tools` | `list[BaseTool]` | Lista de herramientas que el agente puede ejecutar |
| `system_prompt` | `str` | Instrucciones que moldean el comportamiento del agente |
| `response_format` | `ToolStrategy` o `ProviderStrategy` | Estrategia de output estructurado |
| `state_schema` | `TypedDict` | Schema custom que extiende `AgentState` |
| `middleware` | `list` | Hooks para customizar la ejecucion |
| `name` | `str` | Identificador para sistemas multi-agente (usar snake_case) |
| `context_schema` | `TypedDict` | Estructura de contexto runtime para middleware |

**Fuente**: https://docs.langchain.com/oss/python/langchain/agents

### 1.3 Definicion de Tools con el decorador `@tool`

**Fuente**: https://docs.langchain.com/oss/python/langchain/agents

```python
from langchain.tools import tool
from langchain.agents import create_agent

@tool
def search(query: str) -> str:
    """Search for information."""
    return f"Results for: {query}"

@tool
def get_weather(location: str) -> str:
    """Get weather information for a location."""
    return f"Weather in {location}: Sunny, 72F"

agent = create_agent(model, tools=[search, get_weather])
```

### 1.4 Invocacion y streaming de agentes

**Fuente**: https://docs.langchain.com/oss/python/langchain/agents

```python
# Invocacion simple
result = agent.invoke(
    {"messages": [{"role": "user", "content": "What's the weather in San Francisco?"}]}
)

# Streaming de resultados
from langchain.messages import AIMessage, HumanMessage

for chunk in agent.stream({
    "messages": [{"role": "user", "content": "Search for AI news and summarize"}]
}, stream_mode="values"):
    latest_message = chunk["messages"][-1]
    if latest_message.content:
        if isinstance(latest_message, HumanMessage):
            print(f"User: {latest_message.content}")
        elif isinstance(latest_message, AIMessage):
            print(f"Agent: {latest_message.content}")
    elif latest_message.tool_calls:
        print(f"Calling tools: {[tc['name'] for tc in latest_message.tool_calls]}")
```

### 1.5 `create_tool_calling_agent` + `AgentExecutor` (API clasica)

Esta es la API clasica (pre-LangGraph). Sigue siendo funcional pero la documentacion la considera `langchain_classic`.

**Fuente**: https://reference.langchain.com/python/langchain-classic/agents/tool_calling_agent/base/create_tool_calling_agent

**Firma de la funcion**:

```python
create_tool_calling_agent(
    llm: BaseLanguageModel,
    tools: Sequence[BaseTool],
    prompt: ChatPromptTemplate,
    *,
    message_formatter: MessageFormatter = format_to_tool_messages,
) -> Runnable
```

**Parametros**:
- `llm`: Modelo de lenguaje que sirve como motor de razonamiento del agente
- `tools`: Coleccion de herramientas accesibles para el agente
- `prompt`: `ChatPromptTemplate` con requisitos estructurales especificos
- `message_formatter` (opcional): Funcion que convierte acciones del agente a mensajes

**REQUISITO CRITICO del prompt**: El template DEBE incluir un placeholder `agent_scratchpad` como `MessagesPlaceholder`. Este recibe las acciones intermedias del agente y outputs de tools durante la ejecucion.

> "The prompt template must include an `agent_scratchpad` placeholder as a `MessagesPlaceholder`. This receives intermediate agent actions and tool outputs during execution."
> -- Fuente: https://reference.langchain.com/python/langchain-classic/agents/tool_calling_agent/base/create_tool_calling_agent

**Ejemplo completo**:

```python
from langchain_classic.agents import (
    AgentExecutor,
    create_tool_calling_agent,
    tool,
)
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

prompt = ChatPromptTemplate.from_messages(
    [
        ("system", "You are a helpful assistant"),
        ("placeholder", "{chat_history}"),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}"),
    ]
)
model = ChatAnthropic(model="claude-opus-4-1-20250805")

@tool
def magic_function(input: int) -> int:
    """Applies a magic function to an input."""
    return input + 2

tools = [magic_function]

agent = create_tool_calling_agent(model, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

agent_executor.invoke({"input": "what is the value of magic_function(3)?"})

# Con historial de chat
from langchain_core.messages import AIMessage, HumanMessage

agent_executor.invoke(
    {
        "input": "what's my name?",
        "chat_history": [
            HumanMessage(content="hi! my name is bob"),
            AIMessage(content="Hello Bob! How can I assist you today?"),
        ],
    }
)
```

> "Tool outputs must be JSON-serializable; custom objects require proper `__str__` or `to_dict` methods to avoid `invalid_tool_calls` errors."
> -- Fuente: https://reference.langchain.com/python/langchain-classic/agents/tool_calling_agent/base/create_tool_calling_agent

### 1.6 Output estructurado con agentes

**Fuente**: https://docs.langchain.com/oss/python/langchain/agents

```python
from pydantic import BaseModel
from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

class ContactInfo(BaseModel):
    name: str
    email: str
    phone: str

agent = create_agent(
    model="gpt-4o",
    tools=[search_tool],
    response_format=ToolStrategy(ContactInfo)
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "Extract contact info from: John Doe, john@example.com, (555) 123-4567"}]
})
```

### 1.7 Custom State Schema

**Fuente**: https://docs.langchain.com/oss/python/langchain/agents

```python
from langchain.agents import AgentState, create_agent

class CustomState(AgentState):
    user_preferences: dict

agent = create_agent(
    model,
    tools=[tool1, tool2],
    state_schema=CustomState
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "I prefer technical explanations"}],
    "user_preferences": {"style": "technical", "verbosity": "detailed"},
})
```

### 1.8 Middleware para seleccion dinamica de modelo

**Fuente**: https://docs.langchain.com/oss/python/langchain/agents

```python
from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse

basic_model = ChatOpenAI(model="gpt-4o-mini")
advanced_model = ChatOpenAI(model="gpt-4o")

@wrap_model_call
def dynamic_model_selection(request: ModelRequest, handler) -> ModelResponse:
    """Choose model based on conversation complexity."""
    message_count = len(request.state["messages"])
    if message_count > 10:
        model = advanced_model
    else:
        model = basic_model
    return handler(request.override(model=model))

agent = create_agent(
    model=basic_model,
    tools=tools,
    middleware=[dynamic_model_selection]
)
```

### 1.9 Manejo de errores en tools

**Fuente**: https://docs.langchain.com/oss/python/langchain/agents

```python
from langchain.agents import create_agent
from langchain.agents.middleware import wrap_tool_call
from langchain.messages import ToolMessage

@wrap_tool_call
def handle_tool_errors(request, handler):
    """Handle tool execution errors with custom messages."""
    try:
        return handler(request)
    except Exception as e:
        return ToolMessage(
            content=f"Tool error: Please check your input and try again. ({str(e)})",
            tool_call_id=request.tool_call["id"]
        )

agent = create_agent(
    model="gpt-4o",
    tools=[search, get_weather],
    middleware=[handle_tool_errors]
)
```

---

## 2. Multi-agent Patterns

### 2.1 Vision general de patrones

LangChain/LangGraph ofrece multiples patrones de arquitectura multi-agente. Cada uno toma un enfoque distinto para la coordinacion de tareas, gestion de estado y desbloqueo secuencial.

> "Four architectural patterns form the foundation of most multi-agent applications: subagents, skills, handoffs, and routers."
> -- Fuente: https://docs.langchain.com/oss/python/langchain/multi-agent

**Comparacion de rendimiento**:

| Patron | Llamadas (1 tarea) | Repeticiones | Multi-dominio |
|--------|---------------------|--------------|---------------|
| Subagents | 4 | Normal | Excelente (paralelo) |
| Handoffs | 3 | Ahorra 40-50% | Regular (14K+ tokens) |
| Skills | 3 | Ahorra con estado | Bueno |
| Router | 3 | Normal | Excelente (paralelo) |

**Fuente**: https://docs.langchain.com/oss/python/langchain/multi-agent

### 2.2 Patron Supervisor con `langgraph-supervisor`

El patron supervisor establece un agente central que coordina agentes especializados.

> "A central supervisor agent coordinates specialized worker agents [...] controls all communication flow and task delegation."
> -- Fuente: https://github.com/langchain-ai/langgraph-supervisor-py/blob/main/README.md

**Instalacion**:

```bash
pip install langgraph-supervisor langchain-openai
```

**Requisito**: Python >= 3.10

**Ejemplo completo**:

**Fuente**: https://github.com/langchain-ai/langgraph-supervisor-py/blob/main/README.md

```python
from langchain_openai import ChatOpenAI
from langgraph_supervisor import create_supervisor
from langgraph.prebuilt import create_react_agent

model = ChatOpenAI(model="gpt-4o")

# Definir tools
def add(a: float, b: float) -> float:
    """Add two numbers."""
    return a + b

def multiply(a: float, b: float) -> float:
    """Multiply two numbers."""
    return a * b

def web_search(query: str) -> str:
    """Search the web for information."""
    return (
        "Here are the headcounts for each of the FAANG companies in 2024:\n"
        "1. **Facebook (Meta)**: 67,317 employees.\n"
        "2. **Apple**: 164,000 employees.\n"
        "3. **Amazon**: 1,551,000 employees.\n"
        "4. **Netflix**: 14,000 employees.\n"
        "5. **Google (Alphabet)**: 181,269 employees."
    )

# Crear agentes especializados
math_agent = create_react_agent(
    model=model,
    tools=[add, multiply],
    name="math_expert",
    prompt="You are a math expert. Always use one tool at a time."
)

research_agent = create_react_agent(
    model=model,
    tools=[web_search],
    name="research_expert",
    prompt="You are a world class researcher with access to web search."
)

# Crear workflow del supervisor
workflow = create_supervisor(
    [research_agent, math_agent],
    model=model,
    prompt=(
        "You are a team supervisor managing a research expert and a math expert. "
        "For current events, use research_agent. "
        "For math problems, use math_agent."
    )
)

# Compilar y ejecutar
app = workflow.compile()
result = app.invoke({
    "messages": [
        {
            "role": "user",
            "content": "what's the combined headcount of the FAANG companies in 2024?"
        }
    ]
})
```

### 2.3 Jerarquias multi-nivel

**Fuente**: https://github.com/langchain-ai/langgraph-supervisor-py/blob/main/README.md

```python
research_team = create_supervisor(
    [research_agent, math_agent],
    model=model,
    supervisor_name="research_supervisor"
).compile(name="research_team")

writing_team = create_supervisor(
    [writing_agent, publishing_agent],
    model=model,
    supervisor_name="writing_supervisor"
).compile(name="writing_team")

top_level_supervisor = create_supervisor(
    [research_team, writing_team],
    model=model,
    supervisor_name="top_level_supervisor"
).compile(name="top_level_supervisor")
```

### 2.4 Handoff tools customizados

**Fuente**: https://github.com/langchain-ai/langgraph-supervisor-py/blob/main/README.md

```python
from langgraph_supervisor import create_handoff_tool

workflow = create_supervisor(
    [research_agent, math_agent],
    tools=[
        create_handoff_tool(
            agent_name="math_expert",
            name="assign_to_math_expert",
            description="Assign task to math expert"
        ),
        create_handoff_tool(
            agent_name="research_expert",
            name="assign_to_research_expert",
            description="Assign task to research expert"
        )
    ],
    model=model,
)
```

### 2.5 Memoria en el supervisor

**Fuente**: https://github.com/langchain-ai/langgraph-supervisor-py/blob/main/README.md

```python
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.store.memory import InMemoryStore

checkpointer = InMemorySaver()
store = InMemoryStore()

workflow = create_supervisor(
    [research_agent, math_agent],
    model=model,
    prompt="You are a team supervisor managing a research expert and a math expert.",
)

# Compilar con checkpointer/store
app = workflow.compile(
    checkpointer=checkpointer,
    store=store
)
```

### 2.6 Patron Handoff (transferencia entre agentes)

Los handoffs permiten a los agentes transferir control entre diferentes configuraciones o agentes distintos actualizando variables de estado.

> "Behavior changes dynamically based on state. The core mechanism: tools update a state variable (e.g., `current_step` or `active_agent`) that persists across turns."
> -- Fuente: https://docs.langchain.com/oss/python/langchain/multi-agent/handoffs

**Recomendacion oficial**: Usar un solo agente con middleware para la mayoria de los casos de handoff. Solo usar multiples subgrafos de agentes cuando se necesiten implementaciones custom por agente.

> "Use single agent with middleware for most handoffs use cases -- it's simpler. Only use multiple agent subgraphs when you need bespoke agent implementations."
> -- Fuente: https://docs.langchain.com/oss/python/langchain/multi-agent/handoffs

#### Enfoque 1: Agente unico con middleware

**Fuente**: https://docs.langchain.com/oss/python/langchain/multi-agent/handoffs

```python
from langchain.agents import AgentState, create_agent
from langchain.tools import tool, ToolRuntime
from langchain.messages import ToolMessage
from langgraph.types import Command
from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse
from typing import Callable

class SupportState(AgentState):
    current_step: str = "triage"
    warranty_status: str | None = None

@tool
def record_warranty_status(
    status: str,
    runtime: ToolRuntime[None, SupportState]
) -> Command:
    """Record warranty status and transition to next step."""
    return Command(
        update={
            "messages": [
                ToolMessage(
                    content=f"Warranty status recorded: {status}",
                    tool_call_id=runtime.tool_call_id
                )
            ],
            "warranty_status": status,
            "current_step": "specialist"
        }
    )

@wrap_model_call
def apply_step_config(
    request: ModelRequest,
    handler: Callable[[ModelRequest], ModelResponse]
) -> ModelResponse:
    """Configure agent behavior based on current_step."""
    step = request.state.get("current_step", "triage")
    configs = {
        "triage": {
            "prompt": "Collect warranty information...",
            "tools": [record_warranty_status]
        },
        "specialist": {
            "prompt": "Provide solutions based on warranty: {warranty_status}",
            "tools": [provide_solution, escalate]
        }
    }
    config = configs[step]
    request = request.override(
        system_prompt=config["prompt"].format(**request.state),
        tools=config["tools"]
    )
    return handler(request)

agent = create_agent(
    model,
    tools=[record_warranty_status, provide_solution, escalate],
    state_schema=SupportState,
    middleware=[apply_step_config],
    checkpointer=InMemorySaver()
)
```

#### Enfoque 2: Multiples subgrafos de agentes

**Fuente**: https://docs.langchain.com/oss/python/langchain/multi-agent/handoffs

```python
from typing import Literal
from langchain.agents import AgentState, create_agent
from langchain.messages import AIMessage, ToolMessage
from langchain.tools import tool, ToolRuntime
from langgraph.graph import StateGraph, START, END
from langgraph.types import Command
from typing_extensions import NotRequired

class MultiAgentState(AgentState):
    active_agent: NotRequired[str]

@tool
def transfer_to_sales(runtime: ToolRuntime) -> Command:
    """Transfer to the sales agent."""
    last_ai_message = next(
        msg for msg in reversed(runtime.state["messages"])
        if isinstance(msg, AIMessage)
    )
    transfer_message = ToolMessage(
        content="Transferred to sales agent from support agent",
        tool_call_id=runtime.tool_call_id,
    )
    return Command(
        goto="sales_agent",
        update={
            "active_agent": "sales_agent",
            "messages": [last_ai_message, transfer_message],
        },
        graph=Command.PARENT,
    )

@tool
def transfer_to_support(runtime: ToolRuntime) -> Command:
    """Transfer to the support agent."""
    last_ai_message = next(
        msg for msg in reversed(runtime.state["messages"])
        if isinstance(msg, AIMessage)
    )
    transfer_message = ToolMessage(
        content="Transferred to support agent from sales agent",
        tool_call_id=runtime.tool_call_id,
    )
    return Command(
        goto="support_agent",
        update={
            "active_agent": "support_agent",
            "messages": [last_ai_message, transfer_message],
        },
        graph=Command.PARENT,
    )

sales_agent = create_agent(
    model="anthropic:claude-sonnet-4-20250514",
    tools=[transfer_to_support],
    system_prompt="You are a sales agent. Help with sales inquiries.",
)

support_agent = create_agent(
    model="anthropic:claude-sonnet-4-20250514",
    tools=[transfer_to_sales],
    system_prompt="You are a support agent. Help with technical issues.",
)

def route_after_agent(
    state: MultiAgentState,
) -> Literal["sales_agent", "support_agent", "__end__"]:
    messages = state.get("messages", [])
    if messages:
        last_msg = messages[-1]
        if isinstance(last_msg, AIMessage) and not last_msg.tool_calls:
            return "__end__"
    active = state.get("active_agent", "sales_agent")
    return active if active else "sales_agent"

builder = StateGraph(MultiAgentState)
builder.add_node("sales_agent", lambda state: sales_agent.invoke(state))
builder.add_node("support_agent", lambda state: support_agent.invoke(state))

builder.add_conditional_edges(
    START,
    lambda state: state.get("active_agent") or "sales_agent",
    ["sales_agent", "support_agent"]
)
builder.add_conditional_edges(
    "sales_agent", route_after_agent, ["sales_agent", "support_agent", END]
)
builder.add_conditional_edges(
    "support_agent", route_after_agent, ["sales_agent", "support_agent", END]
)

graph = builder.compile()
result = graph.invoke({
    "messages": [{"role": "user", "content": "I'm having trouble with my account login."}]
})
```

> "You must explicitly decide what messages pass between agents. [...] Handoff tools should pass only the triggering AI message and a ToolMessage response, not the entire subagent history."
> -- Fuente: https://docs.langchain.com/oss/python/langchain/multi-agent/handoffs

### 2.7 Patron Swarm con `langgraph-swarm`

Un swarm es un tipo de arquitectura multi-agente donde los agentes dinamicamente transfieren control entre si basandose en sus especializaciones.

**Fuente**: https://github.com/langchain-ai/langgraph-swarm-py

**Instalacion**:

```bash
pip install langgraph-swarm
```

```python
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.prebuilt import create_react_agent
from langgraph_swarm import create_handoff_tool, create_swarm

model = ChatOpenAI(model="gpt-4o")

def add(a: int, b: int) -> int:
    """Add two numbers"""
    return a + b

alice = create_react_agent(
    model,
    [add, create_handoff_tool(agent_name="Bob")],
    prompt="You are Alice, an addition expert.",
    name="Alice",
)

bob = create_react_agent(
    model,
    [create_handoff_tool(
        agent_name="Alice",
        description="Transfer to Alice, she can help with math"
    )],
    prompt="You are Bob, you speak like a pirate.",
    name="Bob",
)

checkpointer = InMemorySaver()
workflow = create_swarm([alice, bob], default_active_agent="Alice")
app = workflow.compile(checkpointer=checkpointer)
```

> "Make sure to always compile the swarm with a checkpointer if you plan to use it in multi-turn conversations."
> -- Fuente: https://github.com/langchain-ai/langgraph-swarm-py

### 2.8 Patron Supervisor con tool-calling (sin libreria externa)

Este patron usa `create_agent` directamente, wrapping sub-agentes como tools del supervisor.

**Fuente**: https://docs.langchain.com/oss/python/langchain/supervisor

```python
from langchain.tools import tool
from langchain.agents import create_agent
from langchain.chat_models import init_chat_model

model = init_chat_model("gpt-4o")

# Sub-agente de calendario
calendar_agent = create_agent(
    model,
    tools=[create_calendar_event, get_available_time_slots],
    system_prompt="You are a calendar scheduling assistant.",
)

# Sub-agente de email
email_agent = create_agent(
    model,
    tools=[send_email],
    system_prompt="You are an email assistant.",
)

# Wrapping sub-agentes como tools
@tool
def schedule_event(request: str) -> str:
    """Schedule calendar events using natural language."""
    result = calendar_agent.invoke({
        "messages": [{"role": "user", "content": request}]
    })
    return result["messages"][-1].text

@tool
def manage_email(request: str) -> str:
    """Send emails using natural language."""
    result = email_agent.invoke({
        "messages": [{"role": "user", "content": request}]
    })
    return result["messages"][-1].text

# Supervisor
supervisor_agent = create_agent(
    model,
    tools=[schedule_event, manage_email],
    system_prompt=(
        "You are a helpful personal assistant. "
        "You can schedule calendar events and send emails. "
        "Break down user requests into appropriate tool calls."
    ),
)

# Ejecucion con streaming
for step in supervisor_agent.stream(
    {"messages": [{"role": "user", "content": "Schedule a meeting and send a reminder email"}]}
):
    for update in step.values():
        for message in update.get("messages", []):
            message.pretty_print()
```

> "The supervisor pattern excels when handling multiple distinct domains, each domain has multiple tools or complex logic, you want centralized workflow control."
> -- Fuente: https://docs.langchain.com/oss/python/langchain/supervisor

### 2.9 Human-in-the-Loop en multi-agente

**Fuente**: https://docs.langchain.com/oss/python/langchain/supervisor

```python
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langgraph.checkpoint.memory import InMemorySaver

calendar_agent = create_agent(
    model,
    tools=[create_calendar_event, get_available_time_slots],
    system_prompt=CALENDAR_AGENT_PROMPT,
    middleware=[
        HumanInTheLoopMiddleware(
            interrupt_on={"create_calendar_event": True},
            description_prefix="Calendar event pending approval",
        ),
    ],
)

supervisor_agent = create_agent(
    model,
    tools=[schedule_event, manage_email],
    system_prompt=SUPERVISOR_PROMPT,
    checkpointer=InMemorySaver(),
)
```

---

## 3. Chains -- LCEL

### 3.1 Que es LCEL (LangChain Expression Language)

LCEL es una forma declarativa de componer Runnables en cadenas (chains). Cualquier chain construida con LCEL automaticamente tiene soporte para sync, async, batch y streaming.

> "Composition is powered by LangChain Expression Language (LCEL), which defines a unified Runnable interface that many modules implement, making it possible to seamlessly chain components."
> -- Fuente: https://docs.langchain.com/oss/python/langchain/overview

**Primitivas principales de composicion**:
- `RunnableSequence` -- el operador de composicion mas importante; se usa en virtualmente todas las chains
- `RunnableParallel` -- ejecuta multiples runnables en paralelo

> "RunnableSequence is the most important composition operator in LangChain as it is used in virtually every chain. A RunnableSequence can be instantiated directly or more commonly by using the | operator."
> -- Fuente: https://python.langchain.com/api_reference/core/runnables/langchain_core.runnables.base.RunnableSequence.html

### 3.2 El operador pipe (`|`)

El operador `|` es la forma mas comun de crear un `RunnableSequence`. Encadena la salida de un componente como entrada del siguiente.

**Fuente**: https://docs.langchain.com/oss/python/integrations/chat/seekrflow

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableSequence

prompt = ChatPromptTemplate.from_template("Translate to French: {text}")

chain: RunnableSequence = prompt | llm
result = chain.invoke({"text": "Good morning"})
print(result)
```

### 3.3 Chain con prompt + modelo + output parser

**Fuente**: https://docs.langchain.com/oss/python/integrations/chat/runpod

```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

prompt = ChatPromptTemplate.from_messages(
    [
        ("system", "You are a helpful assistant."),
        ("human", "{input}"),
    ]
)

parser = StrOutputParser()

chain = prompt | chat | parser

# Invocacion sincrona
try:
    chain_response = chain.invoke(
        {"input": "Explain the concept of serverless computing in simple terms."}
    )
    print("--- Chain Response ---")
    print(chain_response)
except Exception as e:
    print(f"Error running chain: {e}")

# Invocacion asincrona
try:
    async_chain_response = await chain.ainvoke(
        {"input": "What are the benefits of using RunPod for AI/ML workloads?"}
    )
    print("--- Async Chain Response ---")
    print(async_chain_response)
except Exception as e:
    print(f"Error running async chain: {e}")
```

### 3.4 RunnablePassthrough para pasar datos sin modificar

`RunnablePassthrough` pasa el input directamente al siguiente paso sin modificarlo. Es esencial en chains RAG para pasar la query del usuario mientras se buscan documentos en paralelo.

**Fuente**: https://docs.langchain.com/oss/python/integrations/retrievers/tavily

```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_openai import ChatOpenAI

prompt = ChatPromptTemplate.from_template(
    """Answer the question based only on the context provided.

Context: {context}

Question: {question}"""
)

llm = ChatOpenAI(model="gpt-4o-mini")

def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | prompt
    | llm
    | StrOutputParser()
)
```

### 3.5 RunnableParallel para ejecucion en paralelo

Cuando se usa un diccionario como paso en una chain LCEL, LangChain crea implicitamente un `RunnableParallel`. Cada clave del diccionario ejecuta su runnable en paralelo.

**Fuente**: https://docs.langchain.com/oss/python/integrations/retrievers/fleet_context

```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_openai import ChatOpenAI

prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are a great software engineer. Given a question about "
            "LangChain and parts of the documentation, answer the question.\n\n"
            "LangChain Documentation\n------------------\n\n{context}",
        ),
        ("human", "{question}"),
    ]
)

model = ChatOpenAI(model="gpt-4o")

# Diccionario = RunnableParallel implicito
chain = (
    {
        "question": RunnablePassthrough(),
        "context": parent_retriever
        | (lambda docs: "\n\n".join(d.page_content for d in docs)),
    }
    | prompt
    | model
    | StrOutputParser()
)
```

### 3.6 Propiedades automaticas de RunnableSequence

> "Any RunnableSequence automatically supports sync, async, batch. The default implementations of batch and abatch utilize threadpools and asyncio gather and will be faster than naive invocation of invoke or ainvoke for IO bound Runnables."
> -- Fuente: https://python.langchain.com/api_reference/core/runnables/langchain_core.runnables.base.RunnableSequence.html

> "A RunnableSequence preserves the streaming properties of its components, so if all components of the sequence implement a transform method [...] then the sequence will be able to stream input to output!"
> -- Fuente: https://python.langchain.com/api_reference/core/runnables/langchain_core.runnables.base.RunnableSequence.html

**Metodos disponibles automaticamente**:

| Metodo | Descripcion |
|--------|-------------|
| `invoke(input)` | Ejecucion sincrona |
| `ainvoke(input)` | Ejecucion asincrona |
| `batch(inputs)` | Ejecucion en lote (usa threadpool) |
| `abatch(inputs)` | Ejecucion en lote asincrona (usa asyncio.gather) |
| `stream(input)` | Streaming de output |
| `astream(input)` | Streaming asincrono |

### 3.7 Chain simple para evaluacion

**Fuente**: https://docs.langchain.com/langsmith/langchain-runnable

```python
from langchain.chat_models import init_chat_model
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

instructions = (
    "Please review the user query below and determine if it contains any form "
    "of toxic behavior, such as insults, threats, or highly negative comments. "
    "Respond with 'Toxic' if it does, and 'Not toxic' if it doesn't."
)

prompt = ChatPromptTemplate(
    [("system", instructions), ("user", "{text}")],
)

model = init_chat_model("gpt-4o")
chain = prompt | model | StrOutputParser()
```

---

## 4. Retrievers

### 4.1 Concepto

Un retriever es una interfaz que devuelve documentos dada una consulta no estructurada. Los retrievers funcionan como un componente en el pipeline de recuperacion, entre los vector stores y la generacion con LLM.

> "A retriever is an interface that returns documents given an unstructured query."
> -- Fuente: https://docs.langchain.com/oss/python/langchain/retrieval

### 4.2 Vector Store como Retriever: `as_retriever()`

El metodo `as_retriever()` convierte cualquier vector store compatible en un retriever que se integra directamente con chains LCEL.

#### Similarity Search (busqueda por similitud)

**Fuente**: https://docs.langchain.com/oss/python/integrations/vectorstores/documentdb

```python
qa_retriever = vectorstore.as_retriever(
    search_type="similarity",
    search_kwargs={"k": 25},
)
```

#### Invocacion del retriever

**Fuente**: https://docs.langchain.com/oss/python/integrations/vectorstores/vdms

```python
retriever = vector_store.as_retriever(
    search_type="similarity",
    search_kwargs={"k": 3},
)
results = retriever.invoke("Stealing from the bank is a crime")
for doc in results:
    print(f"* {doc.page_content} [{doc.metadata}]")
```

#### MMR (Maximum Marginal Relevance)

MMR balancea relevancia con diversidad en los resultados.

**Fuente**: https://docs.langchain.com/oss/python/integrations/vectorstores/faiss

```python
retriever = vector_store.as_retriever(
    search_type="mmr",
    search_kwargs={"k": 1}
)
retriever.invoke("Stealing from the bank is a crime", filter={"source": "news"})
```

#### MMR con fetch_k

**Fuente**: https://docs.langchain.com/oss/python/integrations/vectorstores/lambdadb

```python
retriever = vector_store.as_retriever(
    search_type="mmr",
    search_kwargs={"k": 2, "fetch_k": 10}
)
retriever.invoke("What is LambdaDB?")
```

### 4.3 Tipos de busqueda soportados

| Tipo | Descripcion |
|------|-------------|
| `"similarity"` | Busqueda por similitud coseno (default) |
| `"mmr"` | Maximum Marginal Relevance -- balancea relevancia y diversidad |
| `"similarity_score_threshold"` | Filtra por umbral de score minimo |

**Fuente**: https://docs.langchain.com/oss/python/integrations/vectorstores/lambdadb

### 4.4 Retriever en una chain RAG completa

**Fuente**: https://docs.langchain.com/oss/python/integrations/retrievers/tavily

```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_openai import ChatOpenAI

prompt = ChatPromptTemplate.from_template(
    """Answer the question based only on the context provided.

Context: {context}

Question: {question}"""
)

llm = ChatOpenAI(model="gpt-4o-mini")

def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | prompt
    | llm
    | StrOutputParser()
)
```

### 4.5 Retriever como tool de agente (Agentic RAG)

En el patron Agentic RAG, los retrievers funcionan como tools que los agentes pueden invocar.

> "In Agentic RAG, retrievers function as tools that agents can access."
> -- Fuente: https://docs.langchain.com/oss/python/langchain/retrieval

[VERIFICAR] La documentacion oficial no proporciona un ejemplo de codigo completo para este patron en la pagina de retrievers. Se recomienda consultar los tutoriales de Agentic RAG en: https://docs.langchain.com/oss/python/learn

---

## 5. Callbacks y Tracing

### 5.1 LangSmith -- Tracing nativo

LangSmith es la plataforma de observabilidad oficial de LangChain. NO requiere codigo adicional para trazar -- solo se configuran variables de entorno.

> "No extra code is needed to log a trace to LangSmith. Just run your LangChain code as you normally would."
> -- Fuente: https://docs.langchain.com/langsmith/trace-with-langchain

**Configuracion de entorno**:

```bash
export LANGSMITH_TRACING=true
export LANGSMITH_API_KEY=<your-api-key>
export OPENAI_API_KEY=<your-openai-api-key>

# Opcional
export LANGSMITH_PROJECT=my-project          # Nombre custom del proyecto
export LANGCHAIN_CALLBACKS_BACKGROUND=true   # Tracing en background (default)
export LANGCHAIN_CALLBACKS_BACKGROUND=false  # Tracing sincrono (serverless)
```

> "In LangChain Python, LangSmith's tracing is done in a background thread to avoid obstructing your production application."
> -- Fuente: https://docs.langchain.com/langsmith/trace-with-langchain

**Ejemplo basico**:

**Fuente**: https://docs.langchain.com/langsmith/trace-with-langchain

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant. Please respond based on context."),
    ("user", "Question: {question}\nContext: {context}")
])

model = ChatOpenAI(model="gpt-4o-mini")
output_parser = StrOutputParser()
chain = prompt | model | output_parser

result = chain.invoke({
    "question": "Can you summarize this morning's meetings?",
    "context": "During this morning's meeting, we solved all world conflict."
})
```

### 5.2 Tracing selectivo con context manager

**Fuente**: https://docs.langchain.com/langsmith/trace-with-langchain

```python
import langsmith as ls

# Trazar una invocacion especifica
with ls.tracing_context(enabled=True):
    chain.invoke({"question": "Am I using a callback?", "context": "..."})

# Deshabilitar explicitamente (incluso si LANGSMITH_TRACING=true)
with ls.tracing_context(enabled=False):
    chain.invoke({"question": "Am I being traced?", "context": "..."})

# Proyecto custom
with ls.tracing_context(project_name="My Project", enabled=True):
    chain.invoke({"question": "...", "context": "..."})
```

### 5.3 Metadata y tags

**Fuente**: https://docs.langchain.com/langsmith/trace-with-langchain

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful AI."),
    ("user", "{input}")
])

# Tags y metadata a nivel de modelo
chat_model = ChatOpenAI().with_config({
    "tags": ["model-tag"],
    "metadata": {"model-key": "model-value"}
})

output_parser = StrOutputParser()

# Tags y metadata a nivel de chain
chain = (prompt | chat_model | output_parser).with_config({
    "tags": ["config-tag"],
    "metadata": {"config-key": "config-value"}
})

# Tags y metadata a nivel de invocacion
chain.invoke(
    {"input": "What is the meaning of life?"},
    {"tags": ["invoke-tag"], "metadata": {"invoke-key": "invoke-value"}}
)
```

### 5.4 Custom run names y run IDs

**Fuente**: https://docs.langchain.com/langsmith/trace-with-langchain

```python
import uuid

# Run name custom
configured_chain = chain.with_config({"run_name": "MyCustomChain"})
configured_chain.invoke({"input": "What is the meaning of life?"})

# O en la invocacion
chain.invoke(
    {"input": "What is the meaning of life?"},
    {"run_name": "MyCustomChain"}
)

# Run ID custom
my_uuid = uuid.uuid4()
chain.invoke(
    {"input": "What is the meaning of life?"},
    {"run_id": my_uuid}
)
```

### 5.5 `wait_for_all_tracers()`

Esencial para aplicaciones de corta duracion donde el proceso puede terminar antes de que se envien todos los traces.

**Fuente**: https://docs.langchain.com/langsmith/trace-with-langchain

```python
from langchain_openai import ChatOpenAI
from langchain_core.tracers.langchain import wait_for_all_tracers

llm = ChatOpenAI()

try:
    llm.invoke("Hello, World!")
finally:
    wait_for_all_tracers()
```

### 5.6 Interoperabilidad: LangChain + `@traceable` de LangSmith

**Fuente**: https://docs.langchain.com/langsmith/trace-with-langchain

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langsmith import traceable

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant."),
    ("user", "Question: {question}\nContext: {context}")
])

model = ChatOpenAI(model="gpt-4o-mini")
output_parser = StrOutputParser()
chain = prompt | model | output_parser

@traceable(
    tags=["openai", "chat"],
    metadata={"foo": "bar"}
)
def invoke_runnable(question, context):
    result = chain.invoke({"question": question, "context": context})
    return "The response is: " + result

invoke_runnable(
    "Can you summarize this morning's meetings?",
    "During this morning's meeting, we solved all world conflict."
)
```

### 5.7 Tracing distribuido

**Fuente**: https://docs.langchain.com/langsmith/trace-with-langchain

```python
import langsmith
from langchain_core.runnables import chain
from langsmith.run_helpers import get_current_run_tree

@chain
def child_chain(inputs):
    return inputs["test"] + 1

def child_wrapper(x, headers):
    with langsmith.tracing_context(parent=headers):
        child_chain.invoke({"test": x})

@chain
def parent_chain(inputs):
    rt = get_current_run_tree()
    headers = rt.to_headers()
    # Enviar headers a otro servicio via HTTP
    # child_wrapper se ejecutaria en el otro servicio
    return inputs

parent_chain.invoke({"test": 1})
```

### 5.8 Configuracion programatica (sin env vars)

**Fuente**: https://docs.langchain.com/langsmith/trace-with-langchain

```python
import langsmith as ls

client = ls.Client(
    api_key="YOUR_API_KEY",
    api_url="https://api.smith.langchain.com",
)

with ls.tracing_context(client=client, project_name="test-no-env", enabled=True):
    chain.invoke({
        "question": "Am I using a callback?",
        "context": "I'm using a callback"
    })
```

### 5.9 Langfuse -- Alternativa open-source

Langfuse es una plataforma open-source de observabilidad que se integra con LangChain via CallbackHandler.

> "Langfuse's LangChain integration uses a callback handler to record and send traces to Langfuse."
> -- Fuente: https://langfuse.com/docs/langchain/python

**Instalacion y configuracion**:

```bash
pip install langfuse
```

```env
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com  # EU region
# LANGFUSE_BASE_URL=https://us.cloud.langfuse.com  # US region
```

**Setup del CallbackHandler**:

**Fuente**: https://langfuse.com/docs/langchain/python

```python
from langfuse import get_client
from langfuse.langchain import CallbackHandler

langfuse = get_client()
langfuse_handler = CallbackHandler()
```

**Tracing de una chain**:

**Fuente**: https://langfuse.com/docs/langchain/python

```python
from langfuse.langchain import CallbackHandler
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

langfuse_handler = CallbackHandler()

llm = ChatOpenAI(model_name="gpt-4o")
prompt = ChatPromptTemplate.from_template("Tell me a joke about {topic}")
chain = prompt | llm

response = chain.invoke(
    {"topic": "cats"},
    config={"callbacks": [langfuse_handler]}
)
```

**Tracing de un agente**:

**Fuente**: https://langfuse.com/docs/langchain/python

```python
from langchain.agents import create_agent
from langfuse.langchain import CallbackHandler

def add_numbers(a: int, b: int) -> int:
    """Add two numbers together and return the result."""
    return a + b

langfuse_handler = CallbackHandler()

agent = create_agent(
    model="openai:gpt-4o-mini",
    tools=[add_numbers],
    system_prompt="You are a helpful math tutor."
)

agent.invoke(
    {"messages": [{"role": "user", "content": "what is 42 + 58?"}]},
    config={"callbacks": [langfuse_handler]}
)
```

**Atributos dinamicos de trace**:

**Fuente**: https://langfuse.com/docs/langchain/python

```python
response = chain.invoke(
    {"topic": "cats"},
    config={
        "callbacks": [langfuse_handler],
        "metadata": {
            "langfuse_user_id": "user-123",
            "langfuse_session_id": "session-456",
            "langfuse_tags": ["tag1", "tag2"]
        }
    }
)
```

**Patron decorador con Langfuse SDK**:

**Fuente**: https://langfuse.com/docs/langchain/python

```python
from langfuse import observe, get_client, propagate_attributes
from langfuse.langchain import CallbackHandler
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

@observe()
def process_user_query(user_input: str):
    langfuse = get_client()

    with propagate_attributes(
        trace_name="user-query",
        session_id="session-1234",
        user_id="user-5678"
    ):
        langfuse_handler = CallbackHandler()

        llm = ChatOpenAI(model_name="gpt-4o")
        prompt = ChatPromptTemplate.from_template("Respond to: {input}")
        chain = prompt | llm

        result = chain.invoke(
            {"input": user_input},
            config={"callbacks": [langfuse_handler]}
        )

    return result.content
```

**Scoring de traces**:

**Fuente**: https://langfuse.com/docs/langchain/python

```python
from langfuse import get_client

langfuse = get_client()

langfuse.create_score(
    trace_id=trace_id,
    name="user-feedback",
    value=1,
    data_type="NUMERIC",
    comment="Factually accurate response"
)
```

**Flush para aplicaciones de corta duracion**:

**Fuente**: https://langfuse.com/docs/langchain/python

```python
from langfuse import get_client

# Flush de todos los eventos pendientes
get_client().flush()

# O shutdown completo
get_client().shutdown()
```

---

## 6. Snippets de Codigo Oficial

### 6.1 Agente completo con tools y streaming

**Fuente**: https://docs.langchain.com/oss/python/langchain/agents

```python
from langchain.tools import tool
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

@tool
def search(query: str) -> str:
    """Search for information."""
    return f"Results for: {query}"

@tool
def get_weather(location: str) -> str:
    """Get weather information for a location."""
    return f"Weather in {location}: Sunny, 72F"

model = ChatOpenAI(model="gpt-4o", temperature=0.1)

agent = create_agent(
    model,
    tools=[search, get_weather],
    system_prompt="You are a helpful assistant. Be concise and accurate."
)

# Streaming
for chunk in agent.stream({
    "messages": [{"role": "user", "content": "What's the weather in Madrid?"}]
}, stream_mode="values"):
    latest = chunk["messages"][-1]
    if latest.content:
        print(latest.content)
```

### 6.2 Chain RAG con retriever

**Fuente**: https://docs.langchain.com/oss/python/integrations/retrievers/tavily

```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_openai import ChatOpenAI

prompt = ChatPromptTemplate.from_template(
    """Answer the question based only on the context provided.

Context: {context}

Question: {question}"""
)

llm = ChatOpenAI(model="gpt-4o-mini")

def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | prompt
    | llm
    | StrOutputParser()
)

result = chain.invoke("What is LangChain?")
```

### 6.3 Supervisor multi-agente completo

**Fuente**: https://github.com/langchain-ai/langgraph-supervisor-py/blob/main/README.md

```python
from langchain_openai import ChatOpenAI
from langgraph_supervisor import create_supervisor
from langgraph.prebuilt import create_react_agent

model = ChatOpenAI(model="gpt-4o")

def add(a: float, b: float) -> float:
    """Add two numbers."""
    return a + b

def multiply(a: float, b: float) -> float:
    """Multiply two numbers."""
    return a * b

def web_search(query: str) -> str:
    """Search the web for information."""
    return "FAANG headcounts in 2024: Meta 67K, Apple 164K, Amazon 1.5M..."

math_agent = create_react_agent(
    model=model,
    tools=[add, multiply],
    name="math_expert",
    prompt="You are a math expert. Always use one tool at a time."
)

research_agent = create_react_agent(
    model=model,
    tools=[web_search],
    name="research_expert",
    prompt="You are a world class researcher with access to web search."
)

workflow = create_supervisor(
    [research_agent, math_agent],
    model=model,
    prompt=(
        "You are a team supervisor managing a research expert and a math expert. "
        "For current events, use research_agent. "
        "For math problems, use math_agent."
    )
)

app = workflow.compile()
result = app.invoke({
    "messages": [{"role": "user", "content": "What's the combined FAANG headcount?"}]
})
```

### 6.4 Swarm con handoff entre agentes

**Fuente**: https://github.com/langchain-ai/langgraph-swarm-py

```python
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.prebuilt import create_react_agent
from langgraph_swarm import create_handoff_tool, create_swarm

model = ChatOpenAI(model="gpt-4o")

def add(a: int, b: int) -> int:
    """Add two numbers"""
    return a + b

alice = create_react_agent(
    model,
    [add, create_handoff_tool(agent_name="Bob")],
    prompt="You are Alice, an addition expert.",
    name="Alice",
)

bob = create_react_agent(
    model,
    [create_handoff_tool(agent_name="Alice", description="Transfer to Alice for math")],
    prompt="You are Bob, you speak like a pirate.",
    name="Bob",
)

checkpointer = InMemorySaver()
workflow = create_swarm([alice, bob], default_active_agent="Alice")
app = workflow.compile(checkpointer=checkpointer)

result = app.invoke({
    "messages": [{"role": "user", "content": "Hi Bob! Can you add 2 and 3?"}]
})
```

### 6.5 LangSmith tracing con @traceable

**Fuente**: https://docs.langchain.com/langsmith/trace-with-langchain

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langsmith import traceable

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant."),
    ("user", "Question: {question}\nContext: {context}")
])

model = ChatOpenAI(model="gpt-4o-mini")
output_parser = StrOutputParser()
chain = prompt | model | output_parser

@traceable(tags=["openai", "chat"], metadata={"foo": "bar"})
def invoke_runnable(question, context):
    result = chain.invoke({"question": question, "context": context})
    return "The response is: " + result

invoke_runnable(
    "Can you summarize this morning's meetings?",
    "During this morning's meeting, we solved all world conflict."
)
```

### 6.6 Langfuse con chain y atributos dinamicos

**Fuente**: https://langfuse.com/docs/langchain/python

```python
from langfuse import observe, get_client, propagate_attributes
from langfuse.langchain import CallbackHandler
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

@observe()
def process_user_query(user_input: str):
    langfuse = get_client()

    with propagate_attributes(
        trace_name="user-query",
        session_id="session-1234",
        user_id="user-5678"
    ):
        langfuse_handler = CallbackHandler()
        llm = ChatOpenAI(model_name="gpt-4o")
        prompt = ChatPromptTemplate.from_template("Respond to: {input}")
        chain = prompt | llm

        result = chain.invoke(
            {"input": user_input},
            config={"callbacks": [langfuse_handler]}
        )

    return result.content

process_user_query("Explain RAG in simple terms")
```

### 6.7 create_tool_calling_agent clasico con historial de chat

**Fuente**: https://reference.langchain.com/python/langchain-classic/agents/tool_calling_agent/base/create_tool_calling_agent

```python
from langchain_classic.agents import AgentExecutor, create_tool_calling_agent, tool
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import AIMessage, HumanMessage

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant"),
    ("placeholder", "{chat_history}"),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

model = ChatAnthropic(model="claude-opus-4-1-20250805")

@tool
def magic_function(input: int) -> int:
    """Applies a magic function to an input."""
    return input + 2

tools = [magic_function]
agent = create_tool_calling_agent(model, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# Con historial de chat
agent_executor.invoke({
    "input": "what's my name?",
    "chat_history": [
        HumanMessage(content="hi! my name is bob"),
        AIMessage(content="Hello Bob! How can I assist you today?"),
    ],
})
```

---

## Fuentes consultadas

| Recurso | URL |
|---------|-----|
| LangChain Docs -- Agents | https://docs.langchain.com/oss/python/langchain/agents |
| LangChain Docs -- Multi-agent | https://docs.langchain.com/oss/python/langchain/multi-agent |
| LangChain Docs -- Handoffs | https://docs.langchain.com/oss/python/langchain/multi-agent/handoffs |
| LangChain Docs -- Supervisor | https://docs.langchain.com/oss/python/langchain/supervisor |
| LangChain Docs -- Retrieval | https://docs.langchain.com/oss/python/langchain/retrieval |
| LangChain Docs -- Overview | https://docs.langchain.com/oss/python/langchain/overview |
| LangChain API Reference | https://reference.langchain.com/python/langchain/ |
| LangChain Classic -- create_tool_calling_agent | https://reference.langchain.com/python/langchain-classic/agents/tool_calling_agent/base/create_tool_calling_agent |
| RunnableSequence API | https://python.langchain.com/api_reference/core/runnables/langchain_core.runnables.base.RunnableSequence.html |
| langgraph-supervisor GitHub | https://github.com/langchain-ai/langgraph-supervisor-py |
| langgraph-swarm GitHub | https://github.com/langchain-ai/langgraph-swarm-py |
| LangSmith Tracing | https://docs.langchain.com/langsmith/trace-with-langchain |
| Langfuse LangChain Integration | https://langfuse.com/docs/langchain/python |
| Context7 -- LangChain Docs | Multiples snippets via `/websites/langchain` |
