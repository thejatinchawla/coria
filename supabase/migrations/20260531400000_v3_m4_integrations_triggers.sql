-- Coria V3 Milestone 4: integrations (GitHub PAT via Vault), agent triggers, github_create_pr

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE integration_status AS ENUM ('active', 'error', 'disconnected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_trigger_type AS ENUM ('cron', 'keyword');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- integrations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  config_encrypted text NOT NULL,
  status integration_status NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider)
);

CREATE INDEX IF NOT EXISTS integrations_workspace_id_idx ON integrations (workspace_id);

-- ---------------------------------------------------------------------------
-- agent_triggers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  type agent_trigger_type NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_triggers_workspace_idx ON agent_triggers (workspace_id);
CREATE INDEX IF NOT EXISTS agent_triggers_channel_idx ON agent_triggers (channel_id);
CREATE INDEX IF NOT EXISTS agent_triggers_type_enabled_idx
  ON agent_triggers (type, enabled)
  WHERE enabled = true;

-- ---------------------------------------------------------------------------
-- keyword debounce (30s per trigger + channel)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trigger_debounce (
  trigger_id uuid NOT NULL REFERENCES agent_triggers(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  last_fired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trigger_id, channel_id)
);

-- ---------------------------------------------------------------------------
-- Vault helpers for GitHub PAT (service role only for read)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE OR REPLACE FUNCTION public.set_github_integration(
  p_workspace_id uuid,
  p_pat text,
  p_member_id uuid
)
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  provider text,
  status integration_status,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id uuid;
  v_name text;
  v_existing uuid;
BEGIN
  IF length(trim(p_pat)) = 0 THEN
    RAISE EXCEPTION 'PAT cannot be empty';
  END IF;

  v_name := 'coria_github_pat_' || p_workspace_id::text;

  SELECT i.config_encrypted::uuid INTO v_existing
  FROM integrations i
  WHERE i.workspace_id = p_workspace_id AND i.provider = 'github';

  IF v_existing IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing, p_pat, v_name, 'GitHub PAT for Coria workspace');
    v_secret_id := v_existing;
  ELSE
    v_secret_id := vault.create_secret(p_pat, v_name, 'GitHub PAT for Coria workspace');
  END IF;

  RETURN QUERY
  INSERT INTO integrations AS ig (
    workspace_id, provider, config_encrypted, status, created_by
  )
  VALUES (p_workspace_id, 'github', v_secret_id::text, 'active', p_member_id)
  ON CONFLICT (workspace_id, provider) DO UPDATE
    SET config_encrypted = EXCLUDED.config_encrypted,
        status = 'active',
        created_by = EXCLUDED.created_by
  RETURNING ig.id, ig.workspace_id, ig.provider, ig.status, ig.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_github_pat(p_workspace_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id uuid;
  v_pat text;
BEGIN
  SELECT config_encrypted::uuid INTO v_secret_id
  FROM integrations
  WHERE workspace_id = p_workspace_id
    AND provider = 'github'
    AND status = 'active';

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_pat
  FROM vault.decrypted_secrets
  WHERE id = v_secret_id;

  RETURN v_pat;
END;
$$;

CREATE OR REPLACE FUNCTION public.disconnect_github_integration(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  SELECT config_encrypted::uuid INTO v_secret_id
  FROM integrations
  WHERE workspace_id = p_workspace_id AND provider = 'github';

  UPDATE integrations
  SET status = 'disconnected'
  WHERE workspace_id = p_workspace_id AND provider = 'github';

  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_github_integration(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_github_integration(uuid, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_github_pat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_github_pat(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.disconnect_github_integration(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.disconnect_github_integration(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trigger_debounce ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integrations_select_member ON integrations;
CREATE POLICY integrations_select_member ON integrations
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT public.user_workspace_ids())
  );

DROP POLICY IF EXISTS agent_triggers_select_member ON agent_triggers;
CREATE POLICY agent_triggers_select_member ON agent_triggers
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT public.user_workspace_ids())
  );

DROP POLICY IF EXISTS agent_triggers_write_member ON agent_triggers;
CREATE POLICY agent_triggers_write_member ON agent_triggers
  FOR ALL TO authenticated
  USING (
    workspace_id IN (SELECT public.user_workspace_ids())
  )
  WITH CHECK (
    workspace_id IN (SELECT public.user_workspace_ids())
  );

-- trigger_debounce: backend service role only (no client policies)

-- ---------------------------------------------------------------------------
-- tool policy + Dev agent github_create_pr
-- ---------------------------------------------------------------------------
INSERT INTO tool_policies (workspace_id, tool_name, requires_approval, enabled)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'github_create_pr', true, true)
ON CONFLICT (workspace_id, tool_name) DO UPDATE
  SET requires_approval = EXCLUDED.requires_approval,
      enabled = EXCLUDED.enabled;

UPDATE agents
SET allowed_tools = ARRAY['github_read', 'github_post_comment', 'github_create_pr']::text[]
WHERE workspace_id = '00000000-0000-4000-8000-000000000001'
  AND mention_slug = 'dev';

-- ---------------------------------------------------------------------------
-- Seed demo triggers (M4 exit criteria)
-- ---------------------------------------------------------------------------
INSERT INTO agent_triggers (
  id,
  workspace_id,
  agent_id,
  channel_id,
  type,
  config,
  enabled
)
VALUES (
  '00000000-0000-4000-8000-000000000007',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000002',
  'cron',
  '{"cron": "0 9 * * *", "prompt": "Summarize yesterday''s channel activity in #general. Highlight key decisions and open questions. Keep it under 200 words."}'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE
  SET config = EXCLUDED.config,
      enabled = EXCLUDED.enabled;

INSERT INTO agent_triggers (
  id,
  workspace_id,
  agent_id,
  channel_id,
  type,
  config,
  enabled
)
VALUES (
  '00000000-0000-4000-8000-000000000008',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000002',
  'keyword',
  '{"keywords": ["bug:"], "prompt_prefix": "A teammate reported a bug in the channel. Triage and suggest next steps:"}'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE
  SET config = EXCLUDED.config,
      enabled = EXCLUDED.enabled;
