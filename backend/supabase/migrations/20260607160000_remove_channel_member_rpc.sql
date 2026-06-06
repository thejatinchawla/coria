-- Remove a teammate from a channel (workspace owner/admin only; not #general).

CREATE OR REPLACE FUNCTION public.remove_channel_member(
  p_channel_id uuid,
  p_member_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_workspace_id uuid;
  v_slug text;
  v_actor_member_id uuid;
  v_deleted int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT c.workspace_id, c.slug
  INTO v_workspace_id, v_slug
  FROM channels c
  WHERE c.id = p_channel_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_slug = 'general' THEN
    RAISE EXCEPTION 'Cannot remove members from #general';
  END IF;

  IF NOT public.user_is_workspace_admin(v_workspace_id) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_actor_member_id := public.user_member_id_for_workspace(v_workspace_id);
  IF v_actor_member_id IS NULL THEN
    RAISE EXCEPTION 'Not a workspace member' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_member_id = v_actor_member_id THEN
    RAISE EXCEPTION 'Cannot remove yourself from this channel';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM members m
    WHERE m.id = p_member_id
      AND m.workspace_id = v_workspace_id
  ) THEN
    RAISE EXCEPTION 'Member not found in workspace' USING ERRCODE = 'no_data_found';
  END IF;

  DELETE FROM channel_members
  WHERE channel_id = p_channel_id
    AND member_id = p_member_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'That person is not in this channel' USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_channel_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_channel_member(uuid, uuid) TO authenticated;
