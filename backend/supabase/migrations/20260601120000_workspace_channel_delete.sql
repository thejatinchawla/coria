-- Allow workspace owners/admins to delete workspaces and channels

CREATE OR REPLACE FUNCTION public.user_is_workspace_admin(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM members
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_is_workspace_admin(uuid) TO authenticated;

DROP POLICY IF EXISTS workspaces_delete_admin ON workspaces;
CREATE POLICY workspaces_delete_admin ON workspaces
  FOR DELETE TO authenticated
  USING (public.user_is_workspace_admin(id));

DROP POLICY IF EXISTS channels_delete_admin ON channels;
CREATE POLICY channels_delete_admin ON channels
  FOR DELETE TO authenticated
  USING (public.user_is_workspace_admin(workspace_id));
