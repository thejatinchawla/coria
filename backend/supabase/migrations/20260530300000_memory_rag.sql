-- M2: pgvector + memory_items + similarity search RPC

CREATE EXTENSION IF NOT EXISTS vector;

DO $$ BEGIN
  CREATE TYPE memory_source_type AS ENUM ('message');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS memory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  source_type memory_source_type NOT NULL DEFAULT 'message',
  source_id uuid NOT NULL,
  content text NOT NULL,
  embedding vector(384) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS memory_items_channel_id_idx
  ON memory_items (channel_id);

CREATE INDEX IF NOT EXISTS memory_items_embedding_hnsw_idx
  ON memory_items
  USING hnsw (embedding vector_cosine_ops);

-- Service role (backend) only; no client access to raw embeddings
ALTER TABLE memory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memory_items_service_all ON memory_items;
-- No policies for authenticated: backend uses service_role key

CREATE OR REPLACE FUNCTION public.match_channel_memory(
  p_channel_id uuid,
  p_query_embedding vector(384),
  p_match_count int DEFAULT 8,
  p_min_similarity float DEFAULT 0.7
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mi.id,
    mi.content,
    mi.metadata,
    (1 - (mi.embedding <=> p_query_embedding))::float AS similarity
  FROM memory_items mi
  WHERE mi.channel_id = p_channel_id
    AND (1 - (mi.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY mi.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

REVOKE ALL ON FUNCTION public.match_channel_memory(uuid, vector, int, float) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_channel_memory(uuid, vector, int, float) TO service_role;
