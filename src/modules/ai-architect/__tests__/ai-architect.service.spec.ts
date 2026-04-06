import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiArchitectService } from '../ai-architect.service';
import { TechLeadService } from '../tech-lead.service';
import { RetrievalService } from '../../retrieval/retrieval.service';
import { ContextBuilderService } from '../../context-builder/context-builder.service';
import { ReasoningService } from '../../reasoning/reasoning.service';
import { PrismaService } from '../../../database/prisma.service';
import { RetrievedChunk, BuiltContext, RagDecisionOutput } from '../../../common/types/rag.types';

const mockChunks: RetrievedChunk[] = [
  {
    id: 'chunk-1',
    content: 'RAG systems benefit from smaller, focused chunks of 256-512 tokens.',
    score: 0.95,
    metadata: {
      source: 'rag-best-practices.pdf',
      title: 'RAG Best Practices',
      chunkIndex: 0,
      documentId: 'doc-1',
      contentType: 'text/plain',
    },
  },
];

const mockContext: BuiltContext = {
  groups: [
    {
      topic: 'Chunk sizing strategies',
      chunks: mockChunks,
      hasContradictions: false,
    },
  ],
  totalChunks: 1,
  insufficientInformation: false,
};

const mockOutput: RagDecisionOutput = {
  citations: [
    {
      source: 'rag-best-practices.pdf',
      text: 'RAG systems benefit from smaller, focused chunks of 256-512 tokens.',
    },
  ],
  official_sources: [],
  decision: 'Use 512 token chunks with 10% overlap for technical documents.',
  reasoning: 'Based on the retrieved documentation, smaller focused chunks improve precision.',
  tradeoffs: ['Smaller chunks may lose context', 'Larger chunks increase noise'],
  examples: ['Set chunkSize: 512, chunkOverlap: 50 in RecursiveCharacterTextSplitter'],
  stack_decisions: {},
  modules: [],
  next_steps: [],
  open_questions: [],
};

describe('AiArchitectService', () => {
  let service: AiArchitectService;

  const mockRetrievalService = {
    retrieve: jest.fn().mockResolvedValue(mockChunks),
  };

  const mockContextBuilderService = {
    build: jest.fn().mockResolvedValue(mockContext),
  };

  const mockReasoningService = {
    reason: jest.fn().mockResolvedValue(mockOutput),
  };

  const mockPrismaService = {
    queryLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((_key: string, defaultValue?: string) => defaultValue),
  };

  const mockTechLeadService = {
    analyze: jest.fn().mockResolvedValue({ complexity: 'simple', sub_queries: [], reasoning: 'simple query' }),
    synthesize: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiArchitectService,
        { provide: TechLeadService, useValue: mockTechLeadService },
        { provide: RetrievalService, useValue: mockRetrievalService },
        { provide: ContextBuilderService, useValue: mockContextBuilderService },
        { provide: ReasoningService, useValue: mockReasoningService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AiArchitectService>(AiArchitectService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should execute the full RAG pipeline', async () => {
    const result = await service.query({
      query: 'What is the best chunk size for RAG?',
    });

    expect(mockRetrievalService.retrieve).toHaveBeenCalled();
    expect(mockContextBuilderService.build).toHaveBeenCalledWith(
      'What is the best chunk size for RAG?',
      mockChunks,
      false,
    );
    expect(mockReasoningService.reason).toHaveBeenCalledWith(
      'What is the best chunk size for RAG?',
      mockContext,
      'assistant',
      undefined,
    );

    expect(result.decision).toBe(mockOutput.decision);
    expect(result.citations).toHaveLength(1);
    expect(result.metadata.retrievedChunks).toBe(1);
    expect(result.metadata.hasContradictions).toBe(false);
  });

  it('should include latency in metadata', async () => {
    const result = await service.query({ query: 'test query' });
    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
