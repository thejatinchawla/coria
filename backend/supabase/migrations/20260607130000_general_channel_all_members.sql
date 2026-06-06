-- #general always includes every workspace member; other channels stay invite-only.

CREATE OR REPLACE FUNCTION public.add_member_to_general_channels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO channel_members (channel_id, member_id, added_by)
  SELECT c.id, NEW.id, NEW.id
  FROM channels c
  WHERE c.workspace_id = NEW.workspace_id
    AND c.slug = 'general'
  ON CONFLICT (channel_id, member_id) DO NOTHING;

  -- Fallback if general uses a non-standard slug but is still the default channel
  INSERT INTO channel_members (channel_id, member_id, added_by)
  SELECT ws.default_channel_id, NEW.id, NEW.id
  FROM workspace_settings ws
  WHERE ws.workspace_id = NEW.workspace_id
    AND ws.default_channel_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM channels c
      WHERE c.id = ws.default_channel_id AND c.slug = 'general'
    )
  ON CONFLICT (channel_id, member_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS members_add_to_default_channel ON members;
CREATE TRIGGER members_add_to_general_channels
  AFTER INSERT ON members
  FOR EACH ROW
  EXECUTE FUNCTION public.add_member_to_general_channels();

CREATE OR REPLACE FUNCTION public.channel_add_creator_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.slug = 'general' THEN
    INSERT INTO channel_members (channel_id, member_id, added_by)
    SELECT NEW.id, m.id, COALESCE(NEW.created_by_member_id, m.id)
    FROM members m
    WHERE m.workspace_id = NEW.workspace_id
    ON CONFLICT (channel_id, member_id) DO NOTHING;
  ELSIF NEW.created_by_member_id IS NOT NULL THEN
    INSERT INTO channel_members (channel_id, member_id, added_by)
    VALUES (NEW.id, NEW.created_by_member_id, NEW.created_by_member_id)
    ON CONFLICT (channel_id, member_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Ensure every teammate is in #general today
INSERT INTO channel_members (channel_id, member_id, added_by)
SELECT c.id, m.id, m.id
FROM channels c
JOIN members m ON m.workspace_id = c.workspace_id
WHERE c.slug = 'general'
ON CONFLICT (channel_id, member_id) DO NOTHING;
