import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiArchitectService } from '../ai-architect.service';
import { TechLeadService } from '../tech-lead.service';
import { RetrievalService } from '../../retrieval/retrieval.service';
import { ContextBuilderService } from '../../context-builder/context-builder.service';
import { ReasoningService } from '../../reasoning/reasoning.service';
import { PrismaService } from '../../../database/prisma.service';
import { RetrievedChunk, BuiltContext, RagDecisionOutput } from '../../../common/types/rag.types';

describe('AiArchitectService — Citation Verification', () => {
  let service: AiArchitectService;

  const makeChunk = (id: string, content: string, source: string, score: number): RetrievedChunk => ({
    id,
    content,
    score,
    metadata: { source, title: source, chunkIndex: 0, documentId: `doc-${id}`, contentType: 'text/plain' },
  });

  const mockRetrieval = { retrieve: jest.fn() };
  const mockContextBuilder = { build: jest.fn() };
  const mockReasoning = { reason: jest.fn() };
  const mockPrisma = { queryLog: { create: jest.fn() } };
  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('sk-test'),
    get: jest.fn().mockImplementation((_key: string, def?: string) => def),
  };
  const mockTechLead = {
    analyze: jest.fn().mockResolvedValue({ complexity: 'simple', sub_queries: [], reasoning: 'simple' }),
    synthesize: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiArchitectService,
        { provide: TechLeadService, useValue: mockTechLead },
        { provide: RetrievalService, useValue: mockRetrieval },
        { provide: ContextBuilderService, useValue: mockContextBuilder },
        { provide: ReasoningService, useValue: mockReasoning },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AiArchitectService>(AiArchitectService);
  });

  function setupPipeline(
    chunks: RetrievedChunk[],
    output: Omit<RagDecisionOutput, 'stack_decisions' | 'modules' | 'next_steps' | 'open_questions'> & Partial<RagDecisionOutput>,
  ) {
    const fullOutput: RagDecisionOutput = {
      stack_decisions: {},
      modules: [],
      next_steps: [],
      open_questions: [],
      ...output,
    };
    mockRetrieval.retrieve.mockResolvedValue(chunks);
    const context: BuiltContext = {
      groups: [{ topic: 'Test', chunks, hasContradictions: false }],
      totalChunks: chunks.length,
      insufficientInformation: false,
    };
    mockContextBuilder.build.mockResolvedValue(context);
    mockReasoning.reason.mockResolvedValue(fullOutput);
  }

  it('should count verified citations that match retrieved chunks', async () => {
    const chunks = [
      makeChunk('c1', 'RAG systems benefit from smaller focused chunks of 256 to 512 tokens', 'rag.pdf', 0.9),
      makeChunk('c2', 'ChromaDB uses HNSW index for approximate nearest neighbor search', 'chroma.pdf', 0.85),
    ];

    setupPipeline(chunks, {
      citations: [
        { source: 'rag.pdf', text: 'RAG systems benefit from smaller focused chunks of 256 to 512 tokens' },
        { source: 'chroma.pdf', text: 'ChromaDB uses HNSW index for approximate nearest neighbor search' },
      ],
      official_sources: [],
      decision: 'Use 512 tokens',
      reasoning: 'Based on evidence',
      tradeoffs: [],
      examples: [],
    });

    const result = await service.query({ query: 'chunking strategy' });

    expect(result.metadata.verifiedCitations).toBe(2);
    expect(result.metadata.unverifiedCitations).toBe(0);
  });

  it('should detect hallucinated citations not found in chunks', async () => {
    const chunks = [
      makeChunk('c1', 'RAG systems benefit from smaller chunks', 'rag.pdf', 0.9),
    ];

    setupPipeline(chunks, {
      citations: [
        { source: 'rag.pdf', text: 'RAG systems benefit from smaller chunks' },
        { source: 'invented.pdf', text: 'This citation was completely fabricated by the LLM' },
      ],
      official_sources: [],
      decision: 'Some decision',
      reasoning: 'Reasoning',
      tradeoffs: [],
      examples: [],
    });

    const result = await service.query({ query: 'test' });

    expect(result.metadata.verifiedCitations).toBe(1);
    expect(result.metadata.unverifiedCitations).toBe(1);
  });

  it('should mark as insufficient when all citations are hallucinated', async () => {
    const chunks = [
      makeChunk('c1', 'Document about PostgreSQL performance tuning', 'pg.pdf', 0.4),
    ];

    setupPipeline(chunks, {
      citations: [
        { source: 'fake.pdf', text: 'Completely unrelated hallucinated text about quantum computing' },
      ],
      official_sources: [],
      decision: 'Decision',
      reasoning: 'Reasoning',
      tradeoffs: [],
      examples: [],
    });

    const result = await service.query({ query: 'test' });

    expect(result.metadata.verifiedCitations).toBe(0);
    expect(result.metadata.unverifiedCitations).toBe(1);
    // With 0 verified citations, insufficiency should be true
    expect(result.metadata.insufficientInformation).toBe(true);
  });

  it('should use verified citations for grounding score calculation', async () => {
    const chunks = [
      makeChunk('c1', 'Real content about vector databases', 'vec.pdf', 0.9),
      makeChunk('c2', 'Another real chunk about embeddings', 'emb.pdf', 0.85),
    ];

    setupPipeline(chunks, {
      citations: [
        { source: 'vec.pdf', text: 'Real content about vector databases' },
        { source: 'fake.pdf', text: 'Hallucinated citation text' },
        { source: 'fake2.pdf', text: 'Another hallucinated citation' },
      ],
      official_sources: [],
      decision: 'Decision',
      reasoning: 'Reasoning',
      tradeoffs: [],
      examples: [],
    });

    const result = await service.query({ query: 'test' });

    // groundingScore = verified(1) / totalCitations(3+0) = 0.333...
    // Measures: "of what the LLM claimed, how much is backed by sources"
    expect(result.metadata.groundingScore).toBeCloseTo(0.333, 2);
  });

  it('should verify citation with fuzzy match (word overlap >= 60%)', async () => {
    const chunks = [
      makeChunk('c1', 'Retrieval augmented generation improves response quality significantly', 'rag.pdf', 0.9),
    ];

    setupPipeline(chunks, {
      citations: [
        // Slightly different wording but >60% word overlap
        { source: 'rag.pdf', text: 'Retrieval augmented generation improves response quality' },
      ],
      official_sources: [],
      decision: 'Use RAG',
      reasoning: 'Evidence based',
      tradeoffs: [],
      examples: [],
    });

    const result = await service.query({ query: 'test' });
    expect(result.metadata.verifiedCitations).toBe(1);
  });

  it('should mark as insufficient when retrieval score is near zero even with verified citations', async () => {
    const chunks = [
      makeChunk('c1', 'Este módulo trató sobre dejar de tratar al LLM como caja negra', 'm4l4.pdf', 0.0),
      makeChunk('c2', 'Entender por qué un modelo de lenguaje genera texto coherente', 'm4l4.pdf', 0.0),
    ];

    setupPipeline(chunks, {
      citations: [
        { source: 'm4l4.pdf', text: 'Este módulo trató sobre dejar de tratar al LLM como caja negra' },
        { source: 'm4l4.pdf', text: 'Entender por qué un modelo de lenguaje genera texto coherente' },
      ],
      official_sources: [],
      decision: 'Usar transformers',
      reasoning: 'Basado en lecturas',
      tradeoffs: [],
      examples: [],
    });

    const result = await service.query({ query: 'cómo diseñar un pipeline RAG para documentos legales' });

    // Even though citations are verified, retrieval score ~0 means chunks are irrelevant
    expect(result.metadata.verifiedCitations).toBe(2);
    expect(result.metadata.insufficientInformation).toBe(true);
  });
});
