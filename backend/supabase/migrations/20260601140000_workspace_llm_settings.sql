-- Per-workspace LLM provider/model + API key in Vault (fallback to server env when unset)

ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS llm_provider text,
  ADD COLUMN IF NOT EXISTS llm_model text;

ALTER TABLE workspace_settings
  DROP CONSTRAINT IF EXISTS workspace_settings_llm_provider_check;

ALTER TABLE workspace_settings
  ADD CONSTRAINT workspace_settings_llm_provider_check
  CHECK (llm_provider IS NULL OR llm_provider IN ('groq', 'anthropic'));

CREATE OR REPLACE FUNCTION public.set_llm_integration(
  p_workspace_id uuid,
  p_api_key text,
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
  IF length(trim(p_api_key)) = 0 THEN
    RAISE EXCEPTION 'API key cannot be empty';
  END IF;

  v_name := 'coria_llm_key_' || p_workspace_id::text;

  SELECT i.config_encrypted::uuid INTO v_existing
  FROM integrations i
  WHERE i.workspace_id = p_workspace_id AND i.provider = 'llm';

  IF v_existing IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing, p_api_key, v_name, 'LLM API key for Coria workspace');
    v_secret_id := v_existing;
  ELSE
    v_secret_id := vault.create_secret(p_api_key, v_name, 'LLM API key for Coria workspace');
  END IF;

  RETURN QUERY
  INSERT INTO integrations AS ig (
    workspace_id, provider, config_encrypted, status, created_by
  )
  VALUES (p_workspace_id, 'llm', v_secret_id::text, 'active', p_member_id)
  ON CONFLICT ON CONSTRAINT integrations_workspace_id_provider_key DO UPDATE
    SET config_encrypted = EXCLUDED.config_encrypted,
        status = 'active',
        created_by = EXCLUDED.created_by
  RETURNING ig.id, ig.workspace_id, ig.provider, ig.status, ig.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_llm_api_key(p_workspace_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id uuid;
  v_key text;
BEGIN
  SELECT i.config_encrypted::uuid INTO v_secret_id
  FROM integrations i
  WHERE i.workspace_id = p_workspace_id
    AND i.provider = 'llm'
    AND i.status = 'active';

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ds.decrypted_secret INTO v_key
  FROM vault.decrypted_secrets ds
  WHERE ds.id = v_secret_id;

  RETURN v_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.disconnect_llm_integration(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  SELECT i.config_encrypted::uuid INTO v_secret_id
  FROM integrations i
  WHERE i.workspace_id = p_workspace_id AND i.provider = 'llm';

  UPDATE integrations i
  SET status = 'disconnected'
  WHERE i.workspace_id = p_workspace_id AND i.provider = 'llm';

  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets s WHERE s.id = v_secret_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_llm_api_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_llm_api_key(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.set_llm_integration(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_llm_integration(uuid, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.disconnect_llm_integration(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.disconnect_llm_integration(uuid) TO service_role;
