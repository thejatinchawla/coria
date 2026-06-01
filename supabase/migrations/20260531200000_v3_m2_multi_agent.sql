-- Coria V3 Milestone 2: multi-agent (Divv/Aria/Dev), agent admin columns, default agent

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

-- ---------------------------------------------------------------------------
-- Migrate V2 Aria → Divv (same row id, new slug)
-- ---------------------------------------------------------------------------
UPDATE agents
SET
  name = 'Divv',
  mention_slug = 'divv',
  color = '#6366f1',
  use_workspace_memory = false,
  system_prompt = 'You are Divv, the default AI teammate in Coria — a platform where humans and AI agents collaborate as equals.

You''re helpful, concise, and you show your reasoning openly. You don''t pad responses with filler. You treat teammates as collaborators.

When you don''t know something, say so. Keep replies short unless depth is warranted.

You have web_search and github_read for lookups. Use them when channel history is not enough.',
  allowed_tools = ARRAY['web_search', 'github_read']::text[],
  status = 'active'
WHERE id = '00000000-0000-4000-8000-000000000003';

-- Research agent Aria (new row — slug freed by Divv rename)
INSERT INTO agents (
  id,
  workspace_id,
  name,
  mention_slug,
  system_prompt,
  allowed_tools,
  channel_scope,
  status,
  color,
  use_workspace_memory,
  template_id
)
VALUES (
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000001',
  'Aria',
  'aria',
  'You are Aria, a research-focused AI teammate in Coria. You excel at summaries, competitive research, and synthesizing information from channel history and the web.

Be thorough but structured. Cite sources when using web search. Prefer clear bullet points for comparisons.',
  ARRAY['web_search']::text[],
  '{}',
  'active',
  '#8b5cf6',
  true,
  'research'
)
ON CONFLICT (workspace_id, mention_slug) DO UPDATE
  SET
    name = EXCLUDED.name,
    system_prompt = EXCLUDED.system_prompt,
    allowed_tools = EXCLUDED.allowed_tools,
    color = EXCLUDED.color,
    use_workspace_memory = EXCLUDED.use_workspace_memory,
    template_id = EXCLUDED.template_id,
    status = 'active';

-- Dev agent (ensure colors + tools from M1)
INSERT INTO agents (
  id,
  workspace_id,
  name,
  mention_slug,
  system_prompt,
  allowed_tools,
  channel_scope,
  status,
  color,
  template_id
)
VALUES (
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000001',
  'Dev',
  'dev',
  'You are Dev, an engineering AI teammate in Coria. You help with code, GitHub repos, and issues. When asked to comment on a GitHub issue, use github_post_comment with the repo and issue number. Be concise and technical.',
  ARRAY['github_read', 'github_post_comment']::text[],
  '{}',
  'active',
  '#0ea5e9',
  'engineering'
)
ON CONFLICT (workspace_id, mention_slug) DO UPDATE
  SET
    allowed_tools = EXCLUDED.allowed_tools,
    system_prompt = EXCLUDED.system_prompt,
    color = EXCLUDED.color,
    template_id = EXCLUDED.template_id,
    status = 'active';

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
    workspace_id IN (
      SELECT m.workspace_id FROM members m WHERE m.user_id = auth.uid()
    )
  );
