-- Ensure workspace_settings rows can be created for any workspace (RLS-safe via SECURITY DEFINER)

CREATE OR REPLACE FUNCTION public.ensure_workspace_settings(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = p_workspace_id) THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM members m
    WHERE m.workspace_id = p_workspace_id AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a workspace member';
  END IF;

  INSERT INTO workspace_settings (workspace_id)
  VALUES (p_workspace_id)
  ON CONFLICT (workspace_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_workspace_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_workspace_settings(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_workspace_settings(uuid) TO authenticated;

-- Backfill any workspace missing settings (e.g. created before create_workspace RPC)
INSERT INTO workspace_settings (workspace_id)
SELECT w.id
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_settings ws WHERE ws.workspace_id = w.id
)
ON CONFLICT (workspace_id) DO NOTHING;
