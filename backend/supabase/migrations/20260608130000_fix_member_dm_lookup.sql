-- Member DMs: one channel per teammate pair (bidirectional lookup + membership repair).

DROP INDEX IF EXISTS channels_member_dm_unique;

CREATE UNIQUE INDEX IF NOT EXISTS channels_member_dm_pair_unique
  ON channels (
    workspace_id,
    LEAST(created_by_member_id, direct_peer_member_id),
    GREATEST(created_by_member_id, direct_peer_member_id)
  )
  WHERE type = 'direct' AND direct_peer_member_id IS NOT NULL;

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

  -- Same conversation whether you or your teammate opened it first.
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

-- Ensure both participants can read/send on existing member DMs.
INSERT INTO channel_members (channel_id, member_id, added_by)
SELECT c.id, c.created_by_member_id, c.created_by_member_id
FROM channels c
WHERE c.type = 'direct'
  AND c.direct_peer_member_id IS NOT NULL
  AND c.created_by_member_id IS NOT NULL
ON CONFLICT (channel_id, member_id) DO NOTHING;

INSERT INTO channel_members (channel_id, member_id, added_by)
SELECT c.id, c.direct_peer_member_id, c.created_by_member_id
FROM channels c
WHERE c.type = 'direct'
  AND c.direct_peer_member_id IS NOT NULL
ON CONFLICT (channel_id, member_id) DO NOTHING;

-- Merge duplicate member DM channels created before bidirectional lookup.
WITH ranked AS (
  SELECT
    c.id,
    FIRST_VALUE(c.id) OVER (
      PARTITION BY
        c.workspace_id,
        LEAST(c.created_by_member_id, c.direct_peer_member_id),
        GREATEST(c.created_by_member_id, c.direct_peer_member_id)
      ORDER BY c.created_at ASC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY
        c.workspace_id,
        LEAST(c.created_by_member_id, c.direct_peer_member_id),
        GREATEST(c.created_by_member_id, c.direct_peer_member_id)
      ORDER BY c.created_at ASC
    ) AS rn
  FROM channels c
  WHERE c.type = 'direct'
    AND c.direct_peer_member_id IS NOT NULL
    AND c.created_by_member_id IS NOT NULL
)
UPDATE messages m
SET channel_id = r.keep_id
FROM ranked r
WHERE m.channel_id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    c.id,
    ROW_NUMBER() OVER (
      PARTITION BY
        c.workspace_id,
        LEAST(c.created_by_member_id, c.direct_peer_member_id),
        GREATEST(c.created_by_member_id, c.direct_peer_member_id)
      ORDER BY c.created_at ASC
    ) AS rn
  FROM channels c
  WHERE c.type = 'direct'
    AND c.direct_peer_member_id IS NOT NULL
    AND c.created_by_member_id IS NOT NULL
)
DELETE FROM channels c
USING ranked r
WHERE c.id = r.id
  AND r.rn > 1;
