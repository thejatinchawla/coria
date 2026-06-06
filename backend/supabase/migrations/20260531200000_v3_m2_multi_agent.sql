-- Coria V3 Milestone 2: multi-agent admin columns, default agent

-- ---------------------------------------------------------------------------
-- agents: extend for admin UI
-- ---------------------------------------------------------------------------
ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#6366f1';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS use_workspace_memory boolean NOT NULL DEFAULT false;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS template_id text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS triggers_enabled boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- workspace_settings: default agent
-- ---------------------------------------------------------------------------
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS default_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL;

-- Demo workspace: ensure Divv has admin UI columns
UPDATE agents
SET
  color = COALESCE(NULLIF(color, ''), '#6366f1'),
  use_workspace_memory = COALESCE(use_workspace_memory, false),
  status = 'active'
WHERE id = '00000000-0000-4000-8000-000000000003';

-- Default workspace agent = Divv
UPDATE workspace_settings
SET default_agent_id = '00000000-0000-4000-8000-000000000003'
WHERE workspace_id = '00000000-0000-4000-8000-000000000001'
  AND default_agent_id IS NULL;

-- RLS: members can read all agents in their workspace (not only demo slug)
DROP POLICY IF EXISTS agents_select_member ON agents;
CREATE POLICY agents_select_member ON agents
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT public.user_workspace_ids())
  );
