-- Pinecone migration: drop pgvector embeddings; keep memory_items catalog

DROP FUNCTION IF EXISTS public.match_channel_memory(uuid, vector, int, float);
DROP FUNCTION IF EXISTS public.match_workspace_memory(uuid, vector, int, float);

DROP INDEX IF EXISTS memory_items_embedding_hnsw_idx;
ALTER TABLE memory_items DROP COLUMN IF EXISTS embedding;

-- pgvector extension unused after this migration
DROP EXTENSION IF EXISTS vector;
