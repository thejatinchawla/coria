-- Coria V3 Milestone 3: threads, workspace memory tier, channel search

-- ---------------------------------------------------------------------------
-- memory_tier enum + memory_items extensions
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE memory_tier AS ENUM ('channel', 'workspace');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE memory_items
  ADD COLUMN IF NOT EXISTS memory_tier memory_tier NOT NULL DEFAULT 'channel';

ALTER TABLE memory_items
  ADD COLUMN IF NOT EXISTS thread_id uuid;

ALTER TABLE memory_items DROP CONSTRAINT IF EXISTS memory_items_source_type_source_id_key;
ALTER TABLE memory_items DROP CONSTRAINT IF EXISTS memory_items_source_unique;
ALTER TABLE memory_items
  ADD CONSTRAINT memory_items_source_unique
  UNIQUE (source_type, source_id, memory_tier);

CREATE INDEX IF NOT EXISTS memory_items_workspace_tier_idx
  ON memory_items (workspace_id, memory_tier);

CREATE INDEX IF NOT EXISTS memory_items_thread_id_idx
  ON memory_items (thread_id)
  WHERE thread_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- messages: threads
-- ---------------------------------------------------------------------------
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES messages(id) ON DELETE CASCADE;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS parent_message_id uuid REFERENCES messages(id) ON DELETE SET NULL;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_count int NOT NULL DEFAULT 0;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS messages_thread_id_created_at_idx
  ON messages (thread_id, created_at)
  WHERE thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS messages_channel_top_level_idx
  ON messages (channel_id, created_at)
  WHERE thread_id IS NULL;

-- Backfill reply_count for existing rows
UPDATE messages SET reply_count = 0 WHERE reply_count IS NULL;

-- Bump reply_count on thread reply insert
CREATE OR REPLACE FUNCTION public.bump_thread_reply_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.thread_id IS NOT NULL THEN
    UPDATE messages
    SET reply_count = reply_count + 1
    WHERE id = NEW.thread_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_messages_bump_reply_count ON messages;
CREATE TRIGGER tr_messages_bump_reply_count
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_thread_reply_count();

-- ---------------------------------------------------------------------------
-- workspace memory RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_workspace_memory(
  p_workspace_id uuid,
  p_query_embedding vector(384),
  p_match_count int DEFAULT 8,
  p_min_similarity float DEFAULT 0.65
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float,
  channel_id uuid
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
    (1 - (mi.embedding <=> p_query_embedding))::float AS similarity,
    mi.channel_id
  FROM memory_items mi
  WHERE mi.workspace_id = p_workspace_id
    AND mi.memory_tier = 'workspace'
    AND (1 - (mi.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY mi.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

REVOKE ALL ON FUNCTION public.match_workspace_memory(uuid, vector, int, float) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_workspace_memory(uuid, vector, int, float) TO service_role;

-- ---------------------------------------------------------------------------
-- channel text search RPC (P1)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_channel_messages(
  p_channel_id uuid,
  p_query text,
  p_limit int DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  channel_id uuid,
  content text,
  sender_name text,
  sender_type text,
  thread_id uuid,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.channel_id,
    m.content,
    m.sender_name,
    m.sender_type::text,
    m.thread_id,
    m.created_at
  FROM messages m
  WHERE m.channel_id = p_channel_id
    AND length(trim(p_query)) > 0
    AND m.content ILIKE ('%' || replace(replace(trim(p_query), '%', '\%'), '_', '\_') || '%')
  ORDER BY m.created_at DESC
  LIMIT greatest(1, least(p_limit, 100));
$$;

REVOKE ALL ON FUNCTION public.search_channel_messages(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_channel_messages(uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_channel_messages(uuid, text, int) TO service_role;

-- Channel RAG: only channel-tier items
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
    AND mi.memory_tier = 'channel'
    AND (1 - (mi.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY mi.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

REVOKE ALL ON FUNCTION public.match_channel_memory(uuid, vector, int, float) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_channel_memory(uuid, vector, int, float) TO service_role;

-- ---------------------------------------------------------------------------
-- tool policy + Aria workspace_search
-- ---------------------------------------------------------------------------
INSERT INTO tool_policies (workspace_id, tool_name, requires_approval, enabled)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'workspace_search', false, true)
ON CONFLICT (workspace_id, tool_name) DO UPDATE
  SET requires_approval = EXCLUDED.requires_approval,
      enabled = EXCLUDED.enabled;

UPDATE agents
SET allowed_tools = ARRAY['web_search', 'workspace_search']::text[]
WHERE workspace_id = '00000000-0000-4000-8000-000000000001'
  AND mention_slug = 'aria';

-- Demo #product channel for cross-channel memory exit test
INSERT INTO channels (id, workspace_id, name, slug, type)
VALUES (
  '00000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000001',
  'product',
  'product',
  'hybrid'
)
ON CONFLICT (workspace_id, slug) DO NOTHING;
