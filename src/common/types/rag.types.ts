export type QueryMode = 'qa' | 'assistant';

export interface ChunkMetadata {
  source: string;
  title: string;
  chunkIndex: number;
  documentId: string;
  contentType: string;
  [key: string]: unknown;
}

export interface RetrievedChunk {
  id: string;
  content: string;
  score: number;
  metadata: ChunkMetadata;
}

export interface Citation {
  source: string;
  text: string;
}

export interface OfficialSource {
  source: string;
  text: string;
  url: string;
}

export interface ModuleSpec {
  archivo: string;
  responsabilidad: string;
  inputs?: string | null;
  outputs?: string | null;
  system_prompt_rol?: string | null;
  schema?: string | null;
}

export interface PydanticSchemaSpec {
  model: string;
  fields: Record<string, string>;
  validacion: string;
  integracion_openai?: string | null;
}

export interface LangfuseSpanSpec {
  name: string;
  tipo: string;
  registra: string[];
}

export interface LangfuseObservabilitySpec {
  trace_root: string;
  spans: LangfuseSpanSpec[];
  jerarquia: string;
  integracion: string;
}

export interface TestCase {
  par: number;
  tipo: string;
  archivos: string[];
  cambios_esperados: string[];
}

export interface RagDecisionOutput {
  citations: Citation[];
  official_sources: OfficialSource[];
  decision: string;
  reasoning: string;
  tradeoffs: string[];
  examples: string[];
  /** Campos ADR — presentes cuando la query es de arquitectura */
  stack_decisions: Record<string, string>;
  modules: ModuleSpec[];
  next_steps: string[];
  open_questions: string[];
  /** Campos ADR enriquecidos — presentes solo en queries de diseño de sistema */
  context?: string | null;
  pydantic_schema?: PydanticSchemaSpec | null;
  langfuse_observability?: LangfuseObservabilitySpec | null;
  estructura_proyecto?: { directorios: string[] } | null;
  env_vars?: Record<string, string> | null;
  error_handling?: Record<string, string> | null;
  casos_de_prueba?: TestCase[] | null;
  /** Presente solo cuando el guardrail QA activó el fallback. Las citas son del retrieval pero la decision no pudo verificarse. */
  isFallback?: boolean;
}

export interface IngestionOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  source?: string;
  title?: string;
  contentType?: string;
  domain?: string;
  metadata?: Record<string, unknown>;
  /** Si true, elimina el documento existente y reingestsa desde cero */
  force?: boolean;
}

export interface RetrievalOptions {
  topK?: number;
  scoreThreshold?: number;
  filter?: Record<string, unknown>;
  domain?: string;
  useHybrid?: boolean;
  useMultiQuery?: boolean;
  useReranking?: boolean;
}

export interface GroupedContext {
  topic: string;
  chunks: RetrievedChunk[];
  hasContradictions: boolean;
  contradictionDetails?: string;
}

export interface BuiltContext {
  groups: GroupedContext[];
  totalChunks: number;
  insufficientInformation: boolean;
}

export interface PipelineOptions {
  retrievalOptions?: RetrievalOptions;
  compressContext?: boolean;
  mode?: QueryMode;
}
