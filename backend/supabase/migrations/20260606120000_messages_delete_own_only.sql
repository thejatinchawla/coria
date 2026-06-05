-- Only allow deleting your own human messages (not other members or agents)

CREATE OR REPLACE FUNCTION public.delete_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message messages%ROWTYPE;
  v_workspace_id uuid;
  v_member_id uuid;
BEGIN
  SELECT * INTO v_message FROM messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT c.workspace_id INTO v_workspace_id
  FROM channels c
  WHERE c.id = v_message.channel_id;

  SELECT m.id INTO v_member_id
  FROM members m
  WHERE m.workspace_id = v_workspace_id
    AND m.user_id = auth.uid();

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

DROP POLICY IF EXISTS messages_delete_member ON messages;
CREATE POLICY messages_delete_member ON messages
  FOR DELETE TO authenticated
  USING (
    channel_id IN (
      SELECT c.id
      FROM channels c
      WHERE c.workspace_id IN (SELECT public.user_workspace_ids())
    )
    AND sender_type = 'human'
    AND sender_id IN (
      SELECT m.id FROM members m WHERE m.user_id = auth.uid()
    )
  );
