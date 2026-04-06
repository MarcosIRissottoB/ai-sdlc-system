import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const sampleDocuments = [
  {
    title: 'RAG Systems Overview',
    source: 'seed/rag-overview',
    contentType: 'text/markdown',
    domain: 'rag',
    rawContent: `# RAG Systems Overview

## What is RAG?
Retrieval-Augmented Generation (RAG) combines the power of retrieval-based and generative models.
Instead of relying solely on parametric knowledge (what the LLM learned during training),
RAG retrieves relevant documents at inference time and uses them as context.

## Core Components
A RAG system has three core components:
1. **Indexing pipeline**: Documents are chunked, embedded, and stored in a vector database
2. **Retrieval**: Given a query, find the most relevant chunks via semantic search
3. **Generation**: The LLM generates an answer conditioned on the retrieved context

## Why RAG?
- Reduces hallucinations by grounding responses in real documents
- Allows updating knowledge without retraining the model
- Provides traceable, citable answers

## Chunking Strategies
Chunking is critical for RAG quality. Bad chunking = bad retrieval.
- **Fixed-size chunking**: Simple but breaks semantic units
- **Semantic chunking**: Splits on sentences or paragraphs
- **Hierarchical chunking**: Respects document structure (headings, sections)`,
    chunks: [
      {
        content: 'RAG combines retrieval-based and generative models. It retrieves relevant documents at inference time and uses them as context instead of relying solely on parametric knowledge.',
        chunkIndex: 0,
        tokenCount: 40,
        summary: 'RAG definition and core concept',
        keywords: ['RAG', 'retrieval', 'generative', 'parametric knowledge', 'context'],
        level: 'básico',
        chunkType: 'concepto',
      },
      {
        content: 'A RAG system has three core components: (1) Indexing pipeline — documents are chunked, embedded, and stored in a vector database. (2) Retrieval — given a query, find the most relevant chunks via semantic search. (3) Generation — the LLM generates an answer conditioned on the retrieved context.',
        chunkIndex: 1,
        tokenCount: 55,
        summary: 'Three core components of a RAG system',
        keywords: ['indexing', 'retrieval', 'generation', 'vector database', 'embeddings'],
        level: 'básico',
        chunkType: 'arquitectura',
      },
      {
        content: 'Chunking is critical for RAG quality. Bad chunking equals bad retrieval. Strategies: Fixed-size chunking (simple but breaks semantic units), Semantic chunking (splits on sentences or paragraphs), Hierarchical chunking (respects document structure like headings and sections).',
        chunkIndex: 2,
        tokenCount: 48,
        summary: 'Chunking strategies for RAG systems',
        keywords: ['chunking', 'fixed-size', 'semantic', 'hierarchical', 'retrieval quality'],
        level: 'intermedio',
        chunkType: 'concepto',
      },
    ],
  },
  {
    title: 'Advanced Retrieval Techniques',
    source: 'seed/advanced-retrieval',
    contentType: 'text/markdown',
    domain: 'rag',
    rawContent: `# Advanced Retrieval Techniques

## Hybrid Search
Combining dense (vector) and sparse (BM25) retrieval improves recall significantly.
Dense retrieval captures semantic similarity, while sparse retrieval captures exact keyword matches.
Use Reciprocal Rank Fusion (RRF) to merge ranked lists from both methods.

## Multi-Query Retrieval
Instead of using the raw user query, generate multiple variants:
- Rephrase the question from different angles
- Use synonyms or related concepts
- This improves recall by capturing chunks that might use different terminology

## Re-ranking
After retrieving the top-K candidates, apply a cross-encoder or LLM to re-score them.
Re-ranking improves precision dramatically at the cost of extra latency.
Popular options: Cohere Rerank API, BGE reranker, cross-encoder models.`,
    chunks: [
      {
        content: 'Hybrid Search combines dense (vector) and sparse (BM25) retrieval. Dense retrieval captures semantic similarity, sparse captures exact keyword matches. Use Reciprocal Rank Fusion (RRF) to merge ranked lists.',
        chunkIndex: 0,
        tokenCount: 42,
        summary: 'Hybrid search combining vector and BM25 retrieval',
        keywords: ['hybrid search', 'BM25', 'dense retrieval', 'RRF', 'vector search'],
        level: 'avanzado',
        chunkType: 'concepto',
      },
      {
        content: 'Multi-Query Retrieval: generate multiple query variants before retrieval — rephrase from different angles, use synonyms or related concepts. This improves recall by capturing chunks that use different terminology.',
        chunkIndex: 1,
        tokenCount: 38,
        summary: 'Multi-query retrieval for improved recall',
        keywords: ['multi-query', 'query expansion', 'recall', 'rephrasing', 'retrieval'],
        level: 'avanzado',
        chunkType: 'concepto',
      },
      {
        content: 'Re-ranking: after retrieving top-K candidates, apply a cross-encoder or LLM to re-score them. Improves precision at cost of latency. Options: Cohere Rerank API, BGE reranker, cross-encoder models.',
        chunkIndex: 2,
        tokenCount: 36,
        summary: 'Re-ranking to improve retrieval precision',
        keywords: ['reranking', 'cross-encoder', 'Cohere', 'precision', 'BGE'],
        level: 'avanzado',
        chunkType: 'concepto',
      },
    ],
  },
];

async function main() {
  console.log('🌱 Starting seed...');

  for (const docData of sampleDocuments) {
    const { chunks, ...documentData } = docData;

    const document = await prisma.document.upsert({
      where: { id: `seed-${documentData.source.replace('/', '-')}` },
      update: {},
      create: {
        id: `seed-${documentData.source.replace('/', '-')}`,
        ...documentData,
        metadata: {},
      },
    });

    for (const chunkData of chunks) {
      await prisma.chunk.upsert({
        where: {
          id: `seed-chunk-${document.id}-${chunkData.chunkIndex}`,
        },
        update: {},
        create: {
          id: `seed-chunk-${document.id}-${chunkData.chunkIndex}`,
          documentId: document.id,
          content: chunkData.content,
          chunkIndex: chunkData.chunkIndex,
          tokenCount: chunkData.tokenCount,
          summary: chunkData.summary,
          keywords: chunkData.keywords,
          level: chunkData.level,
          chunkType: chunkData.chunkType,
          metadata: {
            source: documentData.source,
            title: documentData.title,
            domain: documentData.domain,
          },
        },
      });
    }

    console.log(`✅ Seeded: "${documentData.title}" (${chunks.length} chunks)`);
  }

  console.log('🌱 Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
