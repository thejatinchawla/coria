-- Let signed-in users read demo workspace/channels before membership row exists.
-- Fixes 404 on /?channel=general when workspace seed id ≠ hardcoded UUID.

DROP POLICY IF EXISTS workspaces_select_demo ON workspaces;
CREATE POLICY workspaces_select_demo ON workspaces
  FOR SELECT TO authenticated
  USING (slug = 'coria-demo');

DROP POLICY IF EXISTS channels_select_demo ON channels;
CREATE POLICY channels_select_demo ON channels
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT id FROM workspaces WHERE slug = 'coria-demo')
  );

DROP POLICY IF EXISTS agents_select_demo ON agents;
CREATE POLICY agents_select_demo ON agents
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT id FROM workspaces WHERE slug = 'coria-demo')
  );

-- Member join: any demo workspace id (not only fixed seed UUID)
DROP POLICY IF EXISTS members_insert_demo ON members;
CREATE POLICY members_insert_demo ON members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND workspace_id IN (SELECT id FROM workspaces WHERE slug = 'coria-demo')
    AND NOT EXISTS (
      SELECT 1 FROM members m
      WHERE m.workspace_id = members.workspace_id
        AND m.user_id = auth.uid()
    )
  );
