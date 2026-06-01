-- Pin messages: RPC with 5-per-channel limit

CREATE INDEX IF NOT EXISTS messages_channel_pinned_idx
  ON messages (channel_id, created_at)
  WHERE is_pinned = true;

CREATE OR REPLACE FUNCTION public.set_message_pinned(
  p_message_id uuid,
  p_pinned boolean
)
RETURNS messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message messages%ROWTYPE;
  v_pin_count int;
  v_max_pins constant int := 5;
BEGIN
  SELECT * INTO v_message FROM messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM channels c
    JOIN members m ON m.workspace_id = c.workspace_id
    WHERE c.id = v_message.channel_id
      AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_pinned THEN
    IF v_message.is_pinned THEN
      RETURN v_message;
    END IF;

    SELECT count(*)::int INTO v_pin_count
    FROM messages
    WHERE channel_id = v_message.channel_id
      AND is_pinned = true;

    IF v_pin_count >= v_max_pins THEN
      RAISE EXCEPTION 'pin_limit_exceeded: maximum % pinned messages per channel', v_max_pins
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE messages
  SET is_pinned = p_pinned
  WHERE id = p_message_id
  RETURNING * INTO v_message;

  RETURN v_message;
END;
$$;

REVOKE ALL ON FUNCTION public.set_message_pinned(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_message_pinned(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_message_pinned(uuid, boolean) TO service_role;
