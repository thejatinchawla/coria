-- Channel creation via SECURITY DEFINER RPC (avoids channels INSERT RLS + members subquery issues).

CREATE OR REPLACE FUNCTION public.user_member_id_for_workspace(p_workspace_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT m.id
  FROM members m
  WHERE m.workspace_id = p_workspace_id
    AND m.user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.user_member_id_for_workspace(uuid) TO authenticated;

DROP POLICY IF EXISTS channels_insert_member ON channels;
CREATE POLICY channels_insert_member ON channels
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT public.user_workspace_ids())
    AND created_by_member_id IS NOT NULL
    AND created_by_member_id = public.user_member_id_for_workspace(workspace_id)
  );

CREATE OR REPLACE FUNCTION public.create_channel(
  p_workspace_id uuid,
  p_name text,
  p_slug text,
  p_type channel_type DEFAULT 'hybrid'
)
RETURNS channels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_member_id uuid;
  v_channel channels%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_member_id := public.user_member_id_for_workspace(p_workspace_id);
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not a workspace member' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF trim(p_name) = '' OR trim(p_slug) = '' THEN
    RAISE EXCEPTION 'Channel name is required';
  END IF;

  INSERT INTO channels (workspace_id, name, slug, type, created_by_member_id)
  VALUES (p_workspace_id, trim(p_name), trim(p_slug), p_type, v_member_id)
  RETURNING * INTO v_channel;

  RETURN v_channel;
END;
$$;

REVOKE ALL ON FUNCTION public.create_channel(uuid, text, text, channel_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_channel(uuid, text, text, channel_type) TO authenticated;
