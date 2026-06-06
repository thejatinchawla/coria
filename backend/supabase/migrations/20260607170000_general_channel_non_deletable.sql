-- #general is the default workspace channel and cannot be deleted.

DROP POLICY IF EXISTS channels_delete_admin ON channels;
CREATE POLICY channels_delete_admin ON channels
  FOR DELETE TO authenticated
  USING (
    public.user_is_workspace_admin(workspace_id)
    AND slug <> 'general'
  );
