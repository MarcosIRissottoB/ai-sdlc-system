import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { DynamicTool } from '@langchain/core/tools';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'; // NEW
import { createReactAgent } from '@langchain/langgraph/prebuilt'; // NEW
import { PrismaService } from '../../database/prisma.service';
import { RetrievalService } from '../retrieval/retrieval.service';
import { ContextBuilderService } from '../context-builder/context-builder.service';
import { VectorStoreService } from '../../vector-store/vector-store.service';
import { logPipelineStep, logPipelineError } from '../../common/utils/logger.util';
import { ChatResponseDto } from './dto/chat.dto';

const AGENT_SYSTEM_PROMPT = `You are an expert AI Engineer Senior specialized in LLMs, RAG systems, embeddings, and multi-agent architectures.

Your capabilities:
- Answer technical questions about AI, machine learning, and software architecture
- Design and critique system architectures
- Suggest practical implementations and best practices
- Identify trade-offs between different technical approaches
- Propose AI-powered product ideas

Guidelines:
- Always use the search_knowledge_base tool FIRST before answering, to find relevant information
- When proposing architectures, be specific about technology choices
- Cite your sources when information comes from the knowledge base
- If the knowledge base lacks information, reason as an expert but be transparent about it
- Respond in the same language as the user's message`;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly llm: ChatOpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly retrieval: RetrievalService,
    private readonly contextBuilder: ContextBuilderService,
    private readonly vectorStore: VectorStoreService,
  ) {
    this.llm = new ChatOpenAI({
      openAIApiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
      modelName: this.configService.get<string>('OPENAI_CHAT_MODEL', 'gpt-4o'),
      temperature: 0.2,
      timeout: Number(this.configService.get('LLM_TIMEOUT', '30000')),
    });
  }

  async chat(
    message: string,
    sessionId?: string,
    domain?: string,
  ): Promise<ChatResponseDto> {
    const startTime = Date.now();
    logPipelineStep(this.logger, 'AGENT:START', { message, sessionId, domain });

    // Obtener o crear sesión
    const session = await this.getOrCreateSession(sessionId);

    // Cargar historial de conversación
    const history = await this.loadHistory(session.id);

    // Construir tools del agente
    const toolsUsed: string[] = [];
    const tools = this.buildTools(domain, toolsUsed);

    try {
      const agentApp = createReactAgent({ // NEW
        llm: this.llm,
        tools,
        messageModifier: new SystemMessage(AGENT_SYSTEM_PROMPT),
      });

      const result = await agentApp.invoke( // NEW
        { messages: [...history, new HumanMessage(message)] },
        { recursionLimit: 10 },
      );

      const lastMessage = result.messages[result.messages.length - 1]; // NEW
      const answer = typeof lastMessage?.content === 'string' // NEW
        ? lastMessage.content
        : String(lastMessage?.content ?? '');

      // Persistir mensajes en la sesión
      await this.saveMessages(session.id, message, answer);

      logPipelineStep(this.logger, 'AGENT:COMPLETE', {
        latencyMs: Date.now() - startTime,
        toolsUsed,
      });

      return {
        answer,
        sessionId: session.id,
        toolsUsed,
        sources: [],
      };
    } catch (error) {
      logPipelineError(this.logger, 'AGENT', error);
      throw error;
    }
  }

  /**
   * Construye las tools disponibles para el agente.
   * Cada tool es injectable y accede a los servicios del sistema.
   */
  private buildTools(domain: string | undefined, toolsUsed: string[]): DynamicTool[] {
    return [
      new DynamicTool({
        name: 'search_knowledge_base',
        description:
          'Search the knowledge base for relevant technical information. ' +
          'Input: a search query string. ' +
          'Use this tool FIRST to find context before answering any technical question.',
        func: async (query: string): Promise<string> => {
          toolsUsed.push('search_knowledge_base');
          try {
            const chunks = await this.retrieval.retrieve(query, {
              topK: 5,
              domain,
              useHybrid: true,
              useMultiQuery: false,
              useReranking: true,
            });

            if (chunks.length === 0) {
              return 'No relevant information found in the knowledge base for this query.';
            }

            return chunks
              .map(
                (c) =>
                  `[Source: ${c.metadata.source ?? 'unknown'}]\n${c.content}`,
              )
              .join('\n\n---\n\n');
          } catch {
            return 'Knowledge base search failed.';
          }
        },
      }),

      new DynamicTool({
        name: 'search_by_topic',
        description:
          'Search the knowledge base focusing on a specific topic or concept. ' +
          'Input: JSON string with format {"query": "...", "domain": "..."}. ' +
          'Use when you need targeted information about a specific technical area.',
        func: async (input: string): Promise<string> => {
          toolsUsed.push('search_by_topic');
          try {
            let query = input;
            let targetDomain = domain;

            try {
              const parsed = JSON.parse(input) as { query?: string; domain?: string };
              if (parsed.query) query = parsed.query;
              if (parsed.domain && /^[a-z0-9_-]+$/i.test(parsed.domain)) {
                targetDomain = parsed.domain;
              }
            } catch {
              // use input as-is
            }

            const chunks = await this.retrieval.retrieve(query, {
              topK: 8,
              domain: targetDomain,
              useHybrid: true,
              useMultiQuery: true,
              useReranking: true,
            });

            if (chunks.length === 0) {
              return 'No information found on this topic.';
            }

            const context = await this.contextBuilder.build(query, chunks, true);
            return context.groups
              .map(
                (g) =>
                  `## ${g.topic}\n` +
                  g.chunks.map((c) => c.content).join('\n'),
              )
              .join('\n\n');
          } catch {
            return 'Topic search failed.';
          }
        },
      }),

      new DynamicTool({
        name: 'get_knowledge_base_stats',
        description:
          'Get statistics about what is indexed in the knowledge base. ' +
          'Input: optional domain name, or empty string for default. ' +
          'Use to understand what knowledge is available before answering.',
        func: async (input: string): Promise<string> => {
          toolsUsed.push('get_knowledge_base_stats');
          try {
            const targetDomain = input.trim() || domain;
            const count = await this.vectorStore.getCollectionCount(targetDomain);
            const collections = this.vectorStore.listCollections();
            return JSON.stringify({ totalChunks: count, collections: await collections });
          } catch {
            return 'Could not retrieve stats.';
          }
        },
      }),

      new DynamicTool({
        name: 'compare_approaches',
        description:
          'Compare two technical approaches by searching for information about both in the knowledge base. ' +
          'Input: JSON string with format {"approach_a": "...", "approach_b": "...", "context": "..."}. ' +
          'Returns relevant information about both approaches for comparison.',
        func: async (input: string): Promise<string> => {
          toolsUsed.push('compare_approaches');
          try {
            const parsed = JSON.parse(input) as {
              approach_a?: string;
              approach_b?: string;
              context?: string;
            };

            if (!parsed.approach_a || !parsed.approach_b) {
              return 'Please provide both approach_a and approach_b.';
            }

            const [chunksA, chunksB] = await Promise.all([
              this.retrieval.retrieve(
                `${parsed.approach_a} ${parsed.context ?? ''}`,
                { topK: 4, domain, useHybrid: true, useMultiQuery: false, useReranking: false },
              ),
              this.retrieval.retrieve(
                `${parsed.approach_b} ${parsed.context ?? ''}`,
                { topK: 4, domain, useHybrid: true, useMultiQuery: false, useReranking: false },
              ),
            ]);

            const formatChunks = (chunks: typeof chunksA, label: string): string => {
              if (chunks.length === 0) return `${label}: No information found.`;
              return `${label}:\n${chunks.map((c) => c.content.substring(0, 400)).join('\n')}`;
            };

            return [
              formatChunks(chunksA, `## ${parsed.approach_a}`),
              formatChunks(chunksB, `## ${parsed.approach_b}`),
            ].join('\n\n---\n\n');
          } catch {
            return 'Could not compare approaches.';
          }
        },
      }),
    ];
  }

  private async getOrCreateSession(sessionId?: string) {
    if (sessionId) {
      const existing = await this.prisma.conversationSession.findUnique({
        where: { id: sessionId },
      });
      if (existing) return existing;
    }

    return this.prisma.conversationSession.create({ data: {} });
  }

  private async loadHistory(sessionId: string) {
    const messages = await this.prisma.conversationMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: Number(this.configService.get('AGENT_HISTORY_LIMIT', '20')),
    });

    return messages.reverse().map((m) =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
    );
  }

  private async saveMessages(
    sessionId: string,
    userMessage: string,
    assistantMessage: string,
  ): Promise<void> {
    await this.prisma.conversationMessage.createMany({
      data: [
        { sessionId, role: 'user', content: userMessage },
        { sessionId, role: 'assistant', content: assistantMessage },
      ],
    });
  }
}
