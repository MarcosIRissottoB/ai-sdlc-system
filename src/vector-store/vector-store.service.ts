import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChromaClient, Collection } from 'chromadb';
import { VectorStoreError } from '../common/exceptions/rag.exceptions';
import { RetrievedChunk, ChunkMetadata } from '../common/types/rag.types';

@Injectable()
export class VectorStoreService implements OnModuleInit {
  private readonly logger = new Logger(VectorStoreService.name);
  private client: ChromaClient;
  private readonly defaultCollectionName: string;
  private readonly collections: Map<string, Collection> = new Map();

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('CHROMA_HOST', 'http://localhost:8000');
    this.client = new ChromaClient({ path: host });
    this.defaultCollectionName = this.configService.get<string>(
      'CHROMA_COLLECTION_NAME',
      'ai_engineer_knowledge',
    );
  }

  async onModuleInit(): Promise<void> {
    await this.getOrCreateCollection(this.defaultCollectionName);
  }

  /**
   * Obtiene o crea una collection por nombre.
   * Cachea instancias para no recrearlas en cada request.
   */
  async getOrCreateCollection(name: string): Promise<Collection> {
    if (this.collections.has(name)) {
      return this.collections.get(name)!;
    }

    try {
      const collection = await this.client.getOrCreateCollection({
        name,
        metadata: { 'hnsw:space': 'cosine' },
        embeddingFunction: null,
      });
      this.collections.set(name, collection);
      this.logger.log(`ChromaDB collection "${name}" ready`);
      return collection;
    } catch (error) {
      const message = `Failed to initialize ChromaDB collection "${name}": ${String(error)}`;
      this.logger.error(message);
      throw new VectorStoreError(message);
    }
  }

  private resolveCollectionName(domain?: string): string {
    if (!domain || domain === 'general') return this.defaultCollectionName;
    return `${this.defaultCollectionName}_${domain}`;
  }

  async addDocuments(
    params: {
      ids: string[];
      embeddings: number[][];
      documents: string[];
      metadatas: Record<string, string | number | boolean>[];
    },
    domain?: string,
  ): Promise<void> {
    const collectionName = this.resolveCollectionName(domain);
    const col = await this.getOrCreateCollection(collectionName);
    await col.add({
      ids: params.ids,
      embeddings: params.embeddings,
      documents: params.documents,
      metadatas: params.metadatas,
    });
    this.logger.log(
      `Added ${params.ids.length} chunks to collection "${collectionName}"`,
    );
  }

  async query(
    params: {
      queryEmbedding: number[];
      topK: number;
      filter?: Record<string, unknown>;
    },
    domain?: string,
  ): Promise<RetrievedChunk[]> {
    // Si se especifica domain, buscar solo en esa colección
    if (domain) {
      return this.queryCollection(params, this.resolveCollectionName(domain));
    }

    // Sin domain: buscar en TODAS las colecciones y fusionar resultados
    await this.discoverCollections();
    const allCollectionNames = Array.from(this.collections.keys());

    if (allCollectionNames.length === 0) return [];

    // Query en paralelo a todas las colecciones
    const allResults = await Promise.all(
      allCollectionNames.map((name) => this.queryCollection(params, name)),
    );

    // Fusionar, ordenar por score, devolver top-K global
    return allResults
      .flat()
      .sort((a, b) => b.score - a.score)
      .slice(0, params.topK);
  }

  private async queryCollection(
    params: {
      queryEmbedding: number[];
      topK: number;
      filter?: Record<string, unknown>;
    },
    collectionName: string,
  ): Promise<RetrievedChunk[]> {
    const col = await this.getOrCreateCollection(collectionName);

    const results = await col.query({
      queryEmbeddings: [params.queryEmbedding],
      nResults: params.topK,
      where: params.filter as Record<string, string | number | boolean> | undefined,
    });

    if (!results.ids[0]) return [];

    return results.ids[0].map((id, index) => ({
      id,
      content: results.documents[0]?.[index] ?? '',
      score: results.distances ? 1 - (results.distances[0]?.[index] ?? 0) : 0,
      metadata: (results.metadatas[0]?.[index] ?? {}) as ChunkMetadata,
    }));
  }

  /**
   * Descubre colecciones existentes en ChromaDB que no estén cacheadas.
   * Usa getCollection (no getOrCreate) para respetar la config original de cada colección.
   */
  private async discoverCollections(): Promise<void> {
    try {
      const existing = await this.client.listCollections();
      for (const col of existing) {
        const name = typeof col === 'string' ? col : col.name;
        if (!this.collections.has(name)) {
          try {
            const collection = await this.client.getCollection({ name, embeddingFunction: undefined });
            this.collections.set(name, collection);
            this.logger.log(`Discovered ChromaDB collection "${name}"`);
          } catch {
            this.logger.warn(`Failed to get collection "${name}", skipping`);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to discover collections: ${String(error)}`);
    }
  }

  async deleteByDocumentId(documentId: string, domain?: string): Promise<void> {
    const collectionName = this.resolveCollectionName(domain);
    const col = await this.getOrCreateCollection(collectionName);
    await col.delete({ where: { documentId } });
    this.logger.log(`Deleted vectors for document ${documentId} in "${collectionName}"`);
  }

  async getCollectionCount(domain?: string): Promise<number> {
    const collectionName = this.resolveCollectionName(domain);
    const col = await this.getOrCreateCollection(collectionName);
    return col.count();
  }

  async getAllIds(domain?: string): Promise<string[]> {
    const collectionName = this.resolveCollectionName(domain);
    const col = await this.getOrCreateCollection(collectionName);
    const result = await col.get({ include: [] });
    return result.ids;
  }

  async listCollections(): Promise<string[]> {
    return Array.from(this.collections.keys());
  }
}
