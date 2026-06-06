-- Enable Supabase Realtime for chat tables

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'action_blocks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.action_blocks;
  END IF;
END $$;

-- DELETE filters need full old row (channel_id) in postgres_changes payloads
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.action_blocks REPLICA IDENTITY FULL;
