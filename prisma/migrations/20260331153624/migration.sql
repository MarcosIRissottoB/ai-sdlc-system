-- AlterTable
ALTER TABLE "chunks" ADD COLUMN     "chunk_type" TEXT,
ADD COLUMN     "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "level" TEXT,
ADD COLUMN     "summary" TEXT;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "domain" TEXT NOT NULL DEFAULT 'general';

-- AlterTable
ALTER TABLE "query_logs" ADD COLUMN     "query_variants" JSONB,
ADD COLUMN     "rerank_applied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "score_avg" DOUBLE PRECISION,
ADD COLUMN     "score_max" DOUBLE PRECISION,
ADD COLUMN     "score_min" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "conversation_sessions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_messages_session_id_idx" ON "conversation_messages"("session_id");

-- CreateIndex
CREATE INDEX "documents_domain_idx" ON "documents"("domain");

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "conversation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
