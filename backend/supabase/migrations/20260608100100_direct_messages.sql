-- Direct messages: 1:1 chats with agents or teammates (not listed as #channels).

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS direct_agent_id uuid REFERENCES agents(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS direct_peer_member_id uuid REFERENCES members(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS channels_agent_dm_unique
  ON channels (workspace_id, direct_agent_id, created_by_member_id)
  WHERE type = 'direct' AND direct_agent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS channels_member_dm_unique
  ON channels (workspace_id, created_by_member_id, direct_peer_member_id)
  WHERE type = 'direct' AND direct_peer_member_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_agent_dm(
  p_workspace_id uuid,
  p_agent_id uuid
)
RETURNS channels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id uuid;
  v_channel channels%ROWTYPE;
  v_agent agents%ROWTYPE;
  v_slug text;
BEGIN
  SELECT m.id INTO v_member_id
  FROM members m
  WHERE m.workspace_id = p_workspace_id
    AND m.user_id = auth.uid();

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not a workspace member';
  END IF;

  SELECT c.* INTO v_channel
  FROM channels c
  JOIN channel_members cm ON cm.channel_id = c.id AND cm.member_id = v_member_id
  WHERE c.workspace_id = p_workspace_id
    AND c.type = 'direct'
    AND c.direct_agent_id = p_agent_id
  LIMIT 1;

  IF FOUND THEN
    RETURN v_channel;
  END IF;

  SELECT * INTO v_agent
  FROM agents
  WHERE id = p_agent_id
    AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent not found';
  END IF;

  v_slug := 'dm-' || v_agent.mention_slug || '-' || substr(v_member_id::text, 1, 8);

  INSERT INTO channels (
    workspace_id,
    name,
    slug,
    type,
    direct_agent_id,
    created_by_member_id
  )
  VALUES (
    p_workspace_id,
    v_agent.name,
    v_slug,
    'direct',
    p_agent_id,
    v_member_id
  )
  RETURNING * INTO v_channel;

  RETURN v_channel;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_agent_dm(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_agent_dm(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_member_dm(
  p_workspace_id uuid,
  p_peer_member_id uuid
)
RETURNS channels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id uuid;
  v_channel channels%ROWTYPE;
  v_peer members%ROWTYPE;
  v_slug text;
BEGIN
  IF p_peer_member_id IS NULL THEN
    RAISE EXCEPTION 'Peer member is required';
  END IF;

  SELECT m.id INTO v_member_id
  FROM members m
  WHERE m.workspace_id = p_workspace_id
    AND m.user_id = auth.uid();

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not a workspace member';
  END IF;

  IF p_peer_member_id = v_member_id THEN
    RAISE EXCEPTION 'Cannot DM yourself';
  END IF;

  SELECT c.* INTO v_channel
  FROM channels c
  WHERE c.workspace_id = p_workspace_id
    AND c.type = 'direct'
    AND c.direct_peer_member_id IS NOT NULL
    AND (
      (c.created_by_member_id = v_member_id AND c.direct_peer_member_id = p_peer_member_id)
      OR (c.created_by_member_id = p_peer_member_id AND c.direct_peer_member_id = v_member_id)
    )
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO channel_members (channel_id, member_id, added_by)
    VALUES
      (v_channel.id, v_member_id, v_member_id),
      (v_channel.id, p_peer_member_id, v_member_id)
    ON CONFLICT (channel_id, member_id) DO NOTHING;
    RETURN v_channel;
  END IF;

  SELECT * INTO v_peer
  FROM members
  WHERE id = p_peer_member_id
    AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  v_slug := 'dm-member-' || substr(LEAST(v_member_id, p_peer_member_id)::text, 1, 8)
    || '-' || substr(GREATEST(v_member_id, p_peer_member_id)::text, 1, 8);

  INSERT INTO channels (
    workspace_id,
    name,
    slug,
    type,
    direct_peer_member_id,
    created_by_member_id
  )
  VALUES (
    p_workspace_id,
    COALESCE(NULLIF(trim(v_peer.display_name), ''), 'Teammate'),
    v_slug,
    'direct',
    p_peer_member_id,
    v_member_id
  )
  RETURNING * INTO v_channel;

  INSERT INTO channel_members (channel_id, member_id, added_by)
  VALUES
    (v_channel.id, v_member_id, v_member_id),
    (v_channel.id, p_peer_member_id, v_member_id)
  ON CONFLICT (channel_id, member_id) DO NOTHING;

  RETURN v_channel;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_member_dm(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_member_dm(uuid, uuid) TO authenticated;
