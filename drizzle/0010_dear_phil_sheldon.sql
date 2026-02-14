-- M8: Full-text search + optional semantic search
-- Drops placeholder text embedding columns and replaces with proper types.
-- Adds pgvector extension, tsvector search columns, GIN/HNSW indexes, and triggers.

-- Remove placeholder text embedding columns (no data exists yet)
ALTER TABLE "topics" DROP COLUMN IF EXISTS "embedding";--> statement-breakpoint
ALTER TABLE "replies" DROP COLUMN IF EXISTS "embedding";--> statement-breakpoint

-- Install pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint

-- Add tsvector columns for full-text search
ALTER TABLE "topics" ADD COLUMN "search_vector" tsvector;--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN "search_vector" tsvector;--> statement-breakpoint

-- Add vector columns for semantic search (nullable -- only populated when EMBEDDING_URL configured)
ALTER TABLE "topics" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN "embedding" vector(768);--> statement-breakpoint

-- GIN indexes for full-text search performance
CREATE INDEX "topics_search_vector_idx" ON "topics" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "replies_search_vector_idx" ON "replies" USING gin ("search_vector");--> statement-breakpoint

-- HNSW indexes for vector similarity search performance
CREATE INDEX "topics_embedding_idx" ON "topics" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "replies_embedding_idx" ON "replies" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint

-- Trigger function: auto-update topics search_vector on insert/update
-- Title weighted A (highest), content weighted B
CREATE OR REPLACE FUNCTION update_topic_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER topic_search_vector_update
  BEFORE INSERT OR UPDATE OF title, content ON topics
  FOR EACH ROW
  EXECUTE FUNCTION update_topic_search_vector();--> statement-breakpoint

-- Trigger function: auto-update replies search_vector on insert/update
CREATE OR REPLACE FUNCTION update_reply_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER reply_search_vector_update
  BEFORE INSERT OR UPDATE OF content ON replies
  FOR EACH ROW
  EXECUTE FUNCTION update_reply_search_vector();
