-- Coria V3 Milestone 5: team admin — admin role, member profiles, invites, audit read

-- ---------------------------------------------------------------------------
-- member_role: add admin
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'admin';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- members: profile fields
-- ---------------------------------------------------------------------------
ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS bio text;

-- Promote first demo member to owner if none exists
UPDATE members m
SET role = 'owner'
WHERE m.workspace_id = '00000000-0000-4000-8000-000000000001'
  AND m.id = (
    SELECT id FROM members
    WHERE workspace_id = '00000000-0000-4000-8000-000000000001'
    ORDER BY created_at ASC
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM members
    WHERE workspace_id = '00000000-0000-4000-8000-000000000001'
      AND role = 'owner'
  );

-- ---------------------------------------------------------------------------
-- pending_invites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pending_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role member_role NOT NULL DEFAULT 'member',
  invited_by uuid REFERENCES members(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);

CREATE INDEX IF NOT EXISTS pending_invites_workspace_idx
  ON pending_invites (workspace_id, expires_at DESC);

-- ---------------------------------------------------------------------------
-- accept invite on sign-in (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_workspace_invite(p_display_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_invite pending_invites%ROWTYPE;
  v_member_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT u.email INTO v_email
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF v_email IS NULL OR length(trim(v_email)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_invite
  FROM pending_invites pi
  WHERE pi.workspace_id IN (SELECT id FROM workspaces WHERE slug = 'coria-demo')
    AND lower(pi.email) = lower(v_email)
    AND pi.expires_at > now()
  ORDER BY pi.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO members (workspace_id, user_id, display_name, role)
  VALUES (
    v_invite.workspace_id,
    v_user_id,
    coalesce(nullif(trim(p_display_name), ''), split_part(v_email, '@', 1)),
    v_invite.role
  )
  ON CONFLICT (workspace_id, user_id) DO UPDATE
    SET role = EXCLUDED.role
  RETURNING id INTO v_member_id;

  DELETE FROM pending_invites WHERE id = v_invite.id;

  RETURN v_invite.workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_workspace_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invite(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: members profile update + workspace read
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS members_select_workspace ON members;
CREATE POLICY members_select_workspace ON members
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT public.user_workspace_ids())
  );

DROP POLICY IF EXISTS members_update_own ON members;
CREATE POLICY members_update_own ON members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: pending_invites (workspace members can read; writes via service role)
-- ---------------------------------------------------------------------------
ALTER TABLE pending_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pending_invites_select_member ON pending_invites;
CREATE POLICY pending_invites_select_member ON pending_invites
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT public.user_workspace_ids())
  );

-- ---------------------------------------------------------------------------
-- RLS: audit_log read for workspace members
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS audit_log_select_member ON audit_log;
CREATE POLICY audit_log_select_member ON audit_log
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT public.user_workspace_ids())
  );

-- ---------------------------------------------------------------------------
-- Supabase Storage: avatars bucket
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
CREATE POLICY avatars_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
CREATE POLICY avatars_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
CREATE POLICY avatars_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;
CREATE POLICY avatars_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
