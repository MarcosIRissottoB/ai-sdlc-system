proyecto m3
Entregables del proyecto y requisitos de entrega
Enviar mediante un enlace público al repositorio en Git. Asegurarse de que el repositorio sea autocontenido y que se pueda ejecutar sin depender de elementos externos no documentados.

📂Estructura de repositorio esperada:
Entregable Archivo/Fromato Contenido mínimo
Main notebook multi_agent_system.ipynb or multiple files: src/multi_agent_system.py, src/agents/orchestrator.py, src/agents/hr_agent.py, src/agents/tech_agent.py, src/agents/finance_agent.py Toda la implementación en un notebook organizado por secciones: (1) Setup e imports, (2) carga de documentos y vector stores, (3) definición de agentes, (4) orquestador y enrutamiento, (5) pruebas y ejemplos, (6) integración con Langfuse. Debe haber encabezados claros en Markdown separando cada sección.
Colecciones de documentos data/hr_docs/ , data/tech_docs/, data/finance_docs/ Mínimo 50 chunks por dominio. Documentos en formato .txt, .pdf, .md o .csv. Cada carpeta representa la base de conocimiento de un agente especializado.
Test queries test_queries.json O definidas en el notebook Mínimo 10 consultas de prueba con la categoría de intención esperada. Puede ser un archivo JSON o un diccionario en una celda del notebook. Debe cubrir todos los tipos de agente y casos borde.
README README.md El README debe incluir: descripción del proyecto, instrucciones de instalación (instalar requirements, configurar API keys), cómo ejecutar el notebook (orden de ejecución de celdas), ejemplos de uso (qué celdas correr), notas de configuración y limitaciones conocidas.
Dependencias requirements.txt Dependencias: langchain, langchain-openai, langfuse, openai, una librería de vector store, tiktoken, python-dotenv, jupyter, ipykernel (mínimo 9 paquetes).
Environment template .env.example Plantilla de entorno que muestre: OPENAI_API_KEY=your-key-here, LANGFUSE_PUBLIC_KEY=pk-lf-xxx, LANGFUSE_SECRET_KEY=sk-lf-xxx, LANGFUSE_HOST=https://cloud.langfuse.com
Agente evaluador (BONUS) En una sección del notebook O evaluator.py Implementación del Evaluator usando la Score API de Langfuse. Puede estar en una sección dedicada del notebook con explicación en Markdown o en un archivo .py separado importado desde el notebook.

Contexto y Objetivos
Eres un/a AI engineer en una empresa SaaS mediana que gestiona consultas de clientes a través de múltiples áreas (HR, IT Support, Finance, Legal). El equipo de soporte está desbordado porque muchos tickets se enrutan mal: preguntas de HR terminan en IT, consultas financieras llegan al equipo legal, etc. La dirección te pidió construir un sistema de routing inteligente que clasifique automáticamente las preguntas entrantes por departamento y las dirija a AI agents especializados, capaces de dar respuestas precisas y con contexto usando la documentación interna de la empresa.

El sistema debe manejar consultas reales de clientes, mantener observability completa para depurar preguntas mal enrutadas y evaluar automáticamente la calidad de las respuestas para detectar errores antes de que lleguen a los clientes.

🎯Objetivos (qué vas a entregar y por qué importa):
Construir un sistema de multi-agent orchestration con un orchestrator que clasifique la intención del usuario y, de forma condicional, enrute las consultas a RAG agents especializados. Esto resuelve el problema real de manejar consultas diversas con conocimiento específico por dominio.
Implementar todo el workflow usando LangChain para aprovechar componentes production-grade (chains, retrievers, agents) en lugar de código custom frágil. Esto asegura mantenibilidad y sigue estándares de la industria.
Instrumentar workflow tracing completo con Langfuse para que el equipo pueda depurar misclassifications, retrievals fallidos y respuestas incorrectas inspeccionando todo el execution path. Esto habilita production monitoring y incident response.
Crear RAG agents especializados (mínimo 3) con colecciones de documentos por dominio que “groundeen” las respuestas en la documentación de la empresa. Esto reduce hallucinations y asegura que las respuestas reflejen políticas reales.
Documentar decisiones técnicas explicando por qué elegiste componentes específicos de LangChain, estrategias de routing y configuraciones de RAG. Esto demuestra criterio de ingeniería más allá de simplemente “hacer que funcione”.
(Bonus) Desplegar un evaluator agent automatizado dentro de Langfuse que puntúe cada respuesta en dimensiones de calidad (relevance, completeness, accuracy). Esto detecta respuestas de baja calidad antes de que las vea el cliente y genera métricas continuas de calidad.
¿Por qué esto es importante? Los sistemas multi-agent con buena orchestration, uso de frameworks y observability son la base de las aplicaciones LLM en producción. Este proyecto simula requisitos empresariales reales: manejar consultas diversas, usar herramientas existentes correctamente (LangChain), depurar workflows complejos (Langfuse) y mantener estándares de calidad (evaluation). Estas habilidades se transfieren directamente a la construcción de productos de IA de cara al cliente.
Consigna

📢Consigna
Desarrolla un sistema multiagente en el que un Agente Orquestador clasifique la intención de la consulta del usuario (por ejemplo, RR. HH. o Tecnología). Esta clasificación activa un enrutamiento condicional que delega la tarea de recuperación al Agente RAG especializado correcto, para generar una respuesta contextualmente fundamentada. Todo el flujo dinámico debe implementarse con LangChain y quedar trazado completamente con Langfuse.

Bonus: Implementa un Agente Evaluador dentro de Langfuse para asignar automáticamente a cada respuesta RAG un puntaje de calidad de 1 a 10, basado en la consulta original y la respuesta final.
