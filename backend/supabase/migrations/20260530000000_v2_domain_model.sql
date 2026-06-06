-- Coria V2 Milestone 1: workspaces, members, channels, agents, messages.channel_id

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE member_role AS ENUM ('owner', 'member');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE channel_type AS ENUM ('hybrid', 'human_only');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_status AS ENUM ('active', 'paused');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  role member_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  type channel_type NOT NULL DEFAULT 'hybrid',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);

CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  mention_slug text NOT NULL,
  model text,
  system_prompt text NOT NULL,
  allowed_tools text[] NOT NULL DEFAULT ARRAY['web_search']::text[],
  channel_scope uuid[] NOT NULL DEFAULT '{}',
  status agent_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, mention_slug)
);

-- ---------------------------------------------------------------------------
-- messages: channel scoping
-- ---------------------------------------------------------------------------
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES channels(id) ON DELETE CASCADE;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sender_id uuid;

-- ---------------------------------------------------------------------------
-- Seed demo workspace (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO workspaces (id, name, slug)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Coria Demo',
  'coria-demo'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO channels (id, workspace_id, name, slug, type)
VALUES (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  'general',
  'general',
  'hybrid'
)
ON CONFLICT (workspace_id, slug) DO NOTHING;

INSERT INTO agents (
  id,
  workspace_id,
  name,
  mention_slug,
  system_prompt,
  allowed_tools,
  channel_scope,
  status
)
VALUES (
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000001',
  'Divv',
  'divv',
  'You are Divv, the default AI teammate in Coria — a platform where humans and AI agents collaborate as equals.

You''re helpful, concise, and you show your reasoning openly. You don''t pad responses with filler. You treat teammates as collaborators.

When you don''t know something, say so. Keep replies short unless depth is warranted.

You have web_search and github_read for lookups. Use them when channel history is not enough.',
  ARRAY['web_search', 'github_read']::text[],
  '{}'::uuid[],
  'active'
)
ON CONFLICT (workspace_id, mention_slug) DO NOTHING;

-- Backfill legacy messages into #general
UPDATE messages
SET channel_id = '00000000-0000-4000-8000-000000000002'
WHERE channel_id IS NULL;

ALTER TABLE messages
  ALTER COLUMN channel_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS messages_channel_id_created_at_idx
  ON messages (channel_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Helper: workspace ids the current user belongs to
CREATE OR REPLACE FUNCTION public.user_workspace_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id FROM members WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.user_workspace_ids() TO authenticated;

-- workspaces
DROP POLICY IF EXISTS workspaces_select_member ON workspaces;
CREATE POLICY workspaces_select_member ON workspaces
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.user_workspace_ids()));

-- members
DROP POLICY IF EXISTS members_select_workspace ON members;
CREATE POLICY members_select_workspace ON members
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.user_workspace_ids()));

DROP POLICY IF EXISTS members_insert_demo ON members;
CREATE POLICY members_insert_demo ON members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND workspace_id = '00000000-0000-4000-8000-000000000001'
    AND NOT EXISTS (
      SELECT 1 FROM members m
      WHERE m.workspace_id = members.workspace_id
        AND m.user_id = auth.uid()
    )
  );

-- channels
DROP POLICY IF EXISTS channels_select_member ON channels;
CREATE POLICY channels_select_member ON channels
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.user_workspace_ids()));

DROP POLICY IF EXISTS channels_insert_member ON channels;
CREATE POLICY channels_insert_member ON channels
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.user_workspace_ids()));

-- agents (read-only for members)
DROP POLICY IF EXISTS agents_select_member ON agents;
CREATE POLICY agents_select_member ON agents
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.user_workspace_ids()));

-- messages: replace open policies with channel-scoped membership
DROP POLICY IF EXISTS messages_select_authenticated ON messages;
DROP POLICY IF EXISTS messages_insert_authenticated ON messages;
DROP POLICY IF EXISTS "Allow authenticated read" ON messages;
DROP POLICY IF EXISTS "Allow authenticated insert" ON messages;
DROP POLICY IF EXISTS messages_select_member ON messages;
DROP POLICY IF EXISTS messages_insert_member ON messages;

CREATE POLICY messages_select_member ON messages
  FOR SELECT TO authenticated
  USING (
    channel_id IN (
      SELECT c.id FROM channels c
      WHERE c.workspace_id IN (SELECT public.user_workspace_ids())
    )
  );

CREATE POLICY messages_insert_member ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    channel_id IN (
      SELECT c.id FROM channels c
      WHERE c.workspace_id IN (SELECT public.user_workspace_ids())
    )
    AND sender_type = 'human'
  );
