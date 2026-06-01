-- Coria V3 Milestone 1: trust layer (action blocks, audit log, tool broker policies)

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE action_block_status AS ENUM (
    'pending', 'approved', 'declined', 'expired', 'executed', 'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE audit_outcome AS ENUM (
    'allowed', 'blocked_permission', 'blocked_budget', 'blocked_rate',
    'pending_approval', 'approved', 'declined', 'executed', 'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- reasoning_traces: persist loop state for approval resume
-- ---------------------------------------------------------------------------
ALTER TABLE reasoning_traces
  ADD COLUMN IF NOT EXISTS conversation_state jsonb;

-- ---------------------------------------------------------------------------
-- workspace_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  agents_globally_paused boolean NOT NULL DEFAULT false,
  monthly_tool_budget int NOT NULL DEFAULT 500,
  tool_budget_used int NOT NULL DEFAULT 0,
  approval_ttl_hours int NOT NULL DEFAULT 24,
  default_channel_id uuid REFERENCES channels(id) ON DELETE SET NULL,
  workspace_memory_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- tool_policies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tool_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  requires_approval boolean NOT NULL DEFAULT false,
  allowed_roles member_role[] NOT NULL DEFAULT ARRAY['owner', 'member']::member_role[],
  rate_limit_per_minute int,
  enabled boolean NOT NULL DEFAULT true,
  UNIQUE (workspace_id, tool_name)
);

-- ---------------------------------------------------------------------------
-- action_blocks (drop legacy MVP stub if present, then create V3 schema)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'action_blocks'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'action_blocks'
      AND column_name = 'workspace_id'
  ) THEN
    UPDATE messages SET action_block_id = NULL WHERE action_block_id IS NOT NULL;
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_action_block_id_fkey;
    DROP TABLE action_blocks CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS action_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  thread_id uuid,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  trace_id uuid REFERENCES reasoning_traces(id) ON DELETE SET NULL,
  tool_name text NOT NULL,
  tool_input jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text NOT NULL,
  status action_block_status NOT NULL DEFAULT 'pending',
  requested_by uuid REFERENCES members(id) ON DELETE SET NULL,
  decided_by uuid REFERENCES members(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

-- Add any columns missing from a partial prior run
ALTER TABLE action_blocks ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE action_blocks ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES channels(id) ON DELETE CASCADE;
ALTER TABLE action_blocks ADD COLUMN IF NOT EXISTS thread_id uuid;
ALTER TABLE action_blocks ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agents(id) ON DELETE CASCADE;
ALTER TABLE action_blocks ADD COLUMN IF NOT EXISTS trace_id uuid REFERENCES reasoning_traces(id) ON DELETE SET NULL;
ALTER TABLE action_blocks ADD COLUMN IF NOT EXISTS tool_name text;
ALTER TABLE action_blocks ADD COLUMN IF NOT EXISTS tool_input jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE action_blocks ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE action_blocks ADD COLUMN IF NOT EXISTS status action_block_status NOT NULL DEFAULT 'pending';
ALTER TABLE action_blocks ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE action_blocks ADD COLUMN IF NOT EXISTS decided_by uuid REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE action_blocks ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours');
ALTER TABLE action_blocks ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE action_blocks ADD COLUMN IF NOT EXISTS decided_at timestamptz;

CREATE INDEX IF NOT EXISTS action_blocks_workspace_status_idx
  ON action_blocks (workspace_id, status);

CREATE INDEX IF NOT EXISTS action_blocks_channel_pending_idx
  ON action_blocks (channel_id)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- audit_log (drop legacy stub if present, then create V3 schema)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_log'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_log'
      AND column_name = 'workspace_id'
  ) THEN
    DROP TABLE audit_log CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  action_block_id uuid REFERENCES action_blocks(id) ON DELETE SET NULL,
  tool_name text NOT NULL,
  tool_input_hash text NOT NULL,
  outcome audit_outcome NOT NULL,
  gate_failed text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_workspace_created_idx
  ON audit_log (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_agent_created_idx
  ON audit_log (agent_id, created_at DESC)
  WHERE agent_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_settings_select_member ON workspace_settings;
CREATE POLICY workspace_settings_select_member ON workspace_settings
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT m.workspace_id FROM members m WHERE m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tool_policies_select_member ON tool_policies;
CREATE POLICY tool_policies_select_member ON tool_policies
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT m.workspace_id FROM members m WHERE m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS action_blocks_select_member ON action_blocks;
CREATE POLICY action_blocks_select_member ON action_blocks
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT m.workspace_id FROM members m WHERE m.user_id = auth.uid()
    )
  );

-- Writes via service role (backend) only for action_blocks / audit_log

-- ---------------------------------------------------------------------------
-- Seed demo workspace settings + tool policies
-- ---------------------------------------------------------------------------
INSERT INTO workspace_settings (workspace_id)
VALUES ('00000000-0000-4000-8000-000000000001')
ON CONFLICT (workspace_id) DO NOTHING;

INSERT INTO tool_policies (workspace_id, tool_name, requires_approval, enabled)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'web_search', false, true),
  ('00000000-0000-4000-8000-000000000001', 'github_read', false, true),
  ('00000000-0000-4000-8000-000000000001', 'github_post_comment', true, true)
ON CONFLICT (workspace_id, tool_name) DO UPDATE
  SET requires_approval = EXCLUDED.requires_approval,
      enabled = EXCLUDED.enabled;

-- Dev agent for M1 exit: @dev posts GitHub comments (with approval)
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
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000001',
  'Dev',
  'dev',
  'You are Dev, an engineering AI teammate in Coria. You help with code, GitHub repos, and issues. When asked to comment on a GitHub issue, use github_post_comment with the repo and issue number. Be concise and technical.',
  ARRAY['github_read', 'github_post_comment']::text[],
  '{}',
  'active'
)
ON CONFLICT (workspace_id, mention_slug) DO UPDATE
  SET allowed_tools = EXCLUDED.allowed_tools,
      system_prompt = EXCLUDED.system_prompt,
      status = 'active';
