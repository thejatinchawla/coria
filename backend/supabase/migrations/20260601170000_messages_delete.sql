-- Delete messages: own human messages or workspace owner/admin

CREATE OR REPLACE FUNCTION public.decrement_thread_reply_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.thread_id IS NOT NULL THEN
    UPDATE messages
    SET reply_count = GREATEST(reply_count - 1, 0)
    WHERE id = OLD.thread_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tr_messages_decrement_reply_count ON messages;
CREATE TRIGGER tr_messages_decrement_reply_count
  AFTER DELETE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_thread_reply_count();

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
    public.user_is_workspace_admin(v_workspace_id)
    OR (
      v_message.sender_type = 'human'
      AND v_message.sender_id IS NOT NULL
      AND v_message.sender_id = v_member_id
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM messages WHERE id = p_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_message(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_message(uuid) TO service_role;

DROP POLICY IF EXISTS messages_delete_member ON messages;
CREATE POLICY messages_delete_member ON messages
  FOR DELETE TO authenticated
  USING (
    channel_id IN (
      SELECT c.id
      FROM channels c
      WHERE c.workspace_id IN (SELECT public.user_workspace_ids())
    )
    AND (
      public.user_is_workspace_admin(
        (SELECT c.workspace_id FROM channels c WHERE c.id = messages.channel_id)
      )
      OR (
        sender_type = 'human'
        AND sender_id IN (
          SELECT m.id FROM members m WHERE m.user_id = auth.uid()
        )
      )
    )
  );
