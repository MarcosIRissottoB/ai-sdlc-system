import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ReasoningService } from '../reasoning.service';
import { BuiltContext, RagDecisionOutput } from '../../../common/types/rag.types';
import { ReasoningError } from '../../../common/exceptions/rag.exceptions';

// Mock ChatOpenAI
const mockInvoke = jest.fn();
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: mockInvoke,
  })),
}));

const validLlmResponse = JSON.stringify({
  citations: [{ source: 'doc.pdf', text: 'RAG uses retrieval to augment generation' }],
  official_sources: [],
  decision: 'Use RAG for knowledge-intensive tasks',
  reasoning: 'RAG retrieval augment generation provides grounded answers',
  tradeoffs: ['Latency vs accuracy'],
  examples: ['Example 1'],
});

const mockContext: BuiltContext = {
  groups: [
    {
      topic: 'RAG basics',
      chunks: [
        {
          id: 'c1',
          content: 'RAG uses retrieval to augment generation',
          score: 0.9,
          metadata: { source: 'doc.pdf', title: 'RAG Guide', chunkIndex: 0, documentId: 'd1', contentType: 'text/plain' },
        },
      ],
      hasContradictions: false,
    },
  ],
  totalChunks: 1,
  insufficientInformation: false,
};

describe('ReasoningService', () => {
  let service: ReasoningService;

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('sk-test'),
    get: jest.fn().mockImplementation((_key: string, defaultValue?: string) => defaultValue),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReasoningService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ReasoningService>(ReasoningService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return parsed output from LLM response', async () => {
    mockInvoke.mockResolvedValue({ content: validLlmResponse });

    const result = await service.reason('What is RAG?', mockContext);

    expect(result.decision).toBe('Use RAG for knowledge-intensive tasks');
    expect(result.citations).toHaveLength(1);
    expect(result.tradeoffs).toHaveLength(1);
  });

  it('should throw ReasoningError when LLM returns invalid JSON', async () => {
    mockInvoke.mockResolvedValue({ content: 'This is not JSON at all' });

    await expect(service.reason('test', mockContext)).rejects.toThrow(ReasoningError);
  });

  it('should throw ReasoningError when LLM invoke fails', async () => {
    mockInvoke.mockRejectedValue(new Error('API timeout'));

    await expect(service.reason('test', mockContext)).rejects.toThrow(ReasoningError);
  });

  it('should deduplicate nearly identical citations', async () => {
    const responseWithDupes = JSON.stringify({
      citations: [
        { source: 'doc.pdf', text: 'RAG uses retrieval to augment generation capabilities' },
        { source: 'doc.pdf', text: 'RAG uses retrieval to augment generation capabilities.' },
      ],
      official_sources: [],
      decision: 'Use RAG retrieval augment generation capabilities',
      reasoning: 'Reasoning text',
      tradeoffs: [],
      examples: [],
    });
    mockInvoke.mockResolvedValue({ content: responseWithDupes });

    const result = await service.reason('test', mockContext);
    expect(result.citations).toHaveLength(1);
  });

  it('should apply QA grounding fallback when citations have no overlap with decision', async () => {
    const ungroundedResponse = JSON.stringify({
      citations: [{ source: 'doc.pdf', text: 'completely unrelated citation text about cooking recipes' }],
      official_sources: [],
      decision: 'Use vector databases for semantic search in production systems',
      reasoning: 'Based on analysis',
      tradeoffs: [],
      examples: [],
    });
    mockInvoke.mockResolvedValue({ content: ungroundedResponse });

    const result = await service.reason('test', mockContext, 'qa');
    expect(result.isFallback).toBe(true);
    expect(result.decision).toContain('No se encontró información suficiente');
  });

  it('should apply QA grounding fallback when no citations exist', async () => {
    const noCitationsResponse = JSON.stringify({
      citations: [],
      official_sources: [],
      decision: 'Some decision',
      reasoning: 'Reasoning',
      tradeoffs: [],
      examples: [],
    });
    mockInvoke.mockResolvedValue({ content: noCitationsResponse });

    const result = await service.reason('test', mockContext, 'qa');
    expect(result.isFallback).toBe(true);
  });

  it('should NOT apply QA fallback in assistant mode', async () => {
    const noCitationsResponse = JSON.stringify({
      citations: [],
      official_sources: [],
      decision: 'Some decision',
      reasoning: 'Reasoning',
      tradeoffs: [],
      examples: [],
    });
    mockInvoke.mockResolvedValue({ content: noCitationsResponse });

    const result = await service.reason('test', mockContext, 'assistant');
    expect(result.isFallback).toBeUndefined();
    expect(result.decision).toBe('Some decision');
  });

  it('should handle LLM response wrapped in markdown fences', async () => {
    mockInvoke.mockResolvedValue({ content: '```json\n' + validLlmResponse + '\n```' });

    const result = await service.reason('test', mockContext);
    expect(result.decision).toBe('Use RAG for knowledge-intensive tasks');
  });

  it('should handle empty context groups', async () => {
    const emptyContext: BuiltContext = {
      groups: [],
      totalChunks: 0,
      insufficientInformation: true,
    };
    mockInvoke.mockResolvedValue({ content: validLlmResponse });

    const result = await service.reason('test', emptyContext);
    expect(result).toBeDefined();
  });
});
