-- Fix ambiguous workspace_id in set_github_integration (RETURNS TABLE cols shadow table cols)

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
  ON CONFLICT ON CONSTRAINT integrations_workspace_id_provider_key DO UPDATE
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
  SELECT i.config_encrypted::uuid INTO v_secret_id
  FROM integrations i
  WHERE i.workspace_id = p_workspace_id
    AND i.provider = 'github'
    AND i.status = 'active';

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ds.decrypted_secret INTO v_pat
  FROM vault.decrypted_secrets ds
  WHERE ds.id = v_secret_id;

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
  SELECT i.config_encrypted::uuid INTO v_secret_id
  FROM integrations i
  WHERE i.workspace_id = p_workspace_id AND i.provider = 'github';

  UPDATE integrations i
  SET status = 'disconnected'
  WHERE i.workspace_id = p_workspace_id AND i.provider = 'github';

  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets s WHERE s.id = v_secret_id;
  END IF;
END;
$$;
