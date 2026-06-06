-- Agents explicitly added to a teammate DM (no AI by default).

CREATE TABLE IF NOT EXISTS channel_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  added_by uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, agent_id)
);

CREATE INDEX IF NOT EXISTS channel_agents_channel_id_idx ON channel_agents(channel_id);

ALTER TABLE channel_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_agents_select_member ON channel_agents;
CREATE POLICY channel_agents_select_member ON channel_agents
  FOR SELECT TO authenticated
  USING (
    channel_id IN (
      SELECT cm.channel_id
      FROM channel_members cm
      JOIN members m ON m.id = cm.member_id
      WHERE m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS channel_agents_insert_member_dm ON channel_agents;
CREATE POLICY channel_agents_insert_member_dm ON channel_agents
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM channels c
      JOIN channel_members cm ON cm.channel_id = c.id
      JOIN members m ON m.id = cm.member_id
      WHERE c.id = channel_id
        AND c.type = 'direct'
        AND c.direct_peer_member_id IS NOT NULL
        AND m.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM agents a
      JOIN channels c ON c.id = channel_id
      WHERE a.id = agent_id
        AND a.workspace_id = c.workspace_id
        AND a.status = 'active'
    )
  );

DROP POLICY IF EXISTS channel_agents_delete_member_dm ON channel_agents;
CREATE POLICY channel_agents_delete_member_dm ON channel_agents
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM channels c
      JOIN channel_members cm ON cm.channel_id = c.id
      JOIN members m ON m.id = cm.member_id
      WHERE c.id = channel_id
        AND c.type = 'direct'
        AND c.direct_peer_member_id IS NOT NULL
        AND m.user_id = auth.uid()
    )
  );
