-- Per-channel membership: creator-only on new channels; members can invite others.

-- ---------------------------------------------------------------------------
-- channel_members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  added_by uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, member_id)
);

CREATE INDEX IF NOT EXISTS channel_members_channel_id_idx
  ON channel_members (channel_id);

CREATE INDEX IF NOT EXISTS channel_members_member_id_idx
  ON channel_members (member_id);

ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS created_by_member_id uuid REFERENCES members(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_channel_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cm.channel_id
  FROM channel_members cm
  JOIN members m ON m.id = cm.member_id
  WHERE m.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.user_channel_ids() TO authenticated;

CREATE OR REPLACE FUNCTION public.user_is_channel_member(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM channel_members cm
    JOIN members m ON m.id = cm.member_id
    WHERE cm.channel_id = p_channel_id
      AND m.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_is_channel_member(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: existing channels keep all current workspace members
-- ---------------------------------------------------------------------------
INSERT INTO channel_members (channel_id, member_id, added_by)
SELECT c.id, m.id, m.id
FROM channels c
JOIN members m ON m.workspace_id = c.workspace_id
ON CONFLICT (channel_id, member_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- New workspace members join #general (default channel) only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_member_to_default_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO channel_members (channel_id, member_id, added_by)
  SELECT ws.default_channel_id, NEW.id, NEW.id
  FROM workspace_settings ws
  WHERE ws.workspace_id = NEW.workspace_id
    AND ws.default_channel_id IS NOT NULL
  ON CONFLICT (channel_id, member_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS members_add_to_default_channel ON members;
CREATE TRIGGER members_add_to_default_channel
  AFTER INSERT ON members
  FOR EACH ROW
  EXECUTE FUNCTION public.add_member_to_default_channel();

-- Channel creator becomes the first member
CREATE OR REPLACE FUNCTION public.channel_add_creator_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by_member_id IS NOT NULL THEN
    INSERT INTO channel_members (channel_id, member_id, added_by)
    VALUES (NEW.id, NEW.created_by_member_id, NEW.created_by_member_id)
    ON CONFLICT (channel_id, member_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS channels_add_creator_member ON channels;
CREATE TRIGGER channels_add_creator_member
  AFTER INSERT ON channels
  FOR EACH ROW
  EXECUTE FUNCTION public.channel_add_creator_on_insert();

-- ---------------------------------------------------------------------------
-- create_workspace: owner is member of #general
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_workspace(
  p_name text,
  p_display_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_member_id uuid;
  v_slug text;
  v_channel_id uuid;
  v_agent_id uuid;
  v_display text;
  base_slug text;
  n int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF trim(p_name) = '' THEN
    RAISE EXCEPTION 'Workspace name is required';
  END IF;

  v_display := COALESCE(NULLIF(trim(p_display_name), ''), 'Owner');

  base_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  IF base_slug = '' THEN
    base_slug := 'workspace';
  END IF;
  v_slug := base_slug;

  WHILE EXISTS (SELECT 1 FROM workspaces w WHERE w.slug = v_slug) LOOP
    n := n + 1;
    v_slug := base_slug || '-' || n::text;
  END LOOP;

  INSERT INTO workspaces (name, slug)
  VALUES (trim(p_name), v_slug)
  RETURNING id INTO v_workspace_id;

  INSERT INTO members (workspace_id, user_id, display_name, role)
  VALUES (v_workspace_id, v_user_id, v_display, 'owner')
  RETURNING id INTO v_member_id;

  INSERT INTO channels (workspace_id, name, slug, type, created_by_member_id)
  VALUES (v_workspace_id, 'general', 'general', 'hybrid', v_member_id)
  RETURNING id INTO v_channel_id;

  INSERT INTO channel_members (channel_id, member_id, added_by)
  VALUES (v_channel_id, v_member_id, v_member_id)
  ON CONFLICT (channel_id, member_id) DO NOTHING;

  INSERT INTO agents (
    workspace_id,
    name,
    mention_slug,
    system_prompt,
    allowed_tools,
    color,
    avatar_url,
    status
  )
  VALUES (
    v_workspace_id,
    'Divv',
    'divv',
    'You are Divv, the default AI teammate in Coria — a platform where humans and AI agents collaborate as equals.

You''re helpful, concise, and you show your reasoning openly. You don''t pad responses with filler. You treat teammates as collaborators.

When you don''t know something, say so. Keep replies short unless depth is warranted.

You have web_search and github_read for lookups. Use them when channel history is not enough.',
    ARRAY['web_search', 'github_read']::text[],
    '#6366f1',
    '/agents/divv-avatar.png',
    'active'
  )
  RETURNING id INTO v_agent_id;

  INSERT INTO workspace_settings (workspace_id, default_agent_id, default_channel_id)
  VALUES (v_workspace_id, v_agent_id, v_channel_id)
  ON CONFLICT (workspace_id) DO UPDATE
  SET
    default_agent_id = COALESCE(workspace_settings.default_agent_id, EXCLUDED.default_agent_id),
    default_channel_id = COALESCE(workspace_settings.default_channel_id, EXCLUDED.default_channel_id);

  RETURN v_workspace_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS: channels visible only to channel members (demo policy kept for bootstrap)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS channels_select_member ON channels;
CREATE POLICY channels_select_member ON channels
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.user_channel_ids()));

DROP POLICY IF EXISTS channels_insert_member ON channels;
CREATE POLICY channels_insert_member ON channels
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT public.user_workspace_ids())
    AND created_by_member_id IS NOT NULL
    AND created_by_member_id IN (
      SELECT m.id
      FROM members m
      WHERE m.user_id = auth.uid()
        AND m.workspace_id = channels.workspace_id
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: channel_members
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS channel_members_select ON channel_members;
CREATE POLICY channel_members_select ON channel_members
  FOR SELECT TO authenticated
  USING (channel_id IN (SELECT public.user_channel_ids()));

DROP POLICY IF EXISTS channel_members_insert ON channel_members;
CREATE POLICY channel_members_insert ON channel_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_is_channel_member(channel_id)
    AND EXISTS (
      SELECT 1
      FROM members target
      JOIN channels c ON c.id = channel_members.channel_id
      WHERE target.id = channel_members.member_id
        AND target.workspace_id = c.workspace_id
    )
    AND added_by IN (
      SELECT m.id FROM members m WHERE m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: messages scoped to channel membership
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS messages_select_member ON messages;
CREATE POLICY messages_select_member ON messages
  FOR SELECT TO authenticated
  USING (channel_id IN (SELECT public.user_channel_ids()));

DROP POLICY IF EXISTS messages_insert_member ON messages;
CREATE POLICY messages_insert_member ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    channel_id IN (SELECT public.user_channel_ids())
    AND sender_type = 'human'
  );

DROP POLICY IF EXISTS messages_delete_member ON messages;
CREATE POLICY messages_delete_member ON messages
  FOR DELETE TO authenticated
  USING (
    channel_id IN (SELECT public.user_channel_ids())
    AND sender_type = 'human'
    AND sender_id IN (
      SELECT m.id FROM members m WHERE m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- action_blocks: channel members only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS action_blocks_select_member ON action_blocks;
CREATE POLICY action_blocks_select_member ON action_blocks
  FOR SELECT TO authenticated
  USING (channel_id IN (SELECT public.user_channel_ids()));

-- ---------------------------------------------------------------------------
-- delete_message RPC: require channel membership
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message messages%ROWTYPE;
  v_member_id uuid;
BEGIN
  SELECT * INTO v_message FROM messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.user_is_channel_member(v_message.channel_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT m.id INTO v_member_id
  FROM members m
  WHERE m.user_id = auth.uid()
    AND m.workspace_id = (
      SELECT c.workspace_id FROM channels c WHERE c.id = v_message.channel_id
    );

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (
    v_message.sender_type = 'human'
    AND v_message.sender_id IS NOT NULL
    AND v_message.sender_id = v_member_id
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM messages WHERE id = p_message_id;
END;
$$;
