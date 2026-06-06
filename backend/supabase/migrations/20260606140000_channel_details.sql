-- Channel description + admin update policy

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN channels.description IS 'Optional channel topic shown in the header';

DROP POLICY IF EXISTS channels_update_admin ON channels;
CREATE POLICY channels_update_admin ON channels
  FOR UPDATE TO authenticated
  USING (public.user_is_workspace_admin(workspace_id))
  WITH CHECK (public.user_is_workspace_admin(workspace_id));
