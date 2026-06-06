-- Optional metadata for integrations (e.g. GitHub OAuth login).
ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
