-- Self-serve workspace creation and owner updates

CREATE OR REPLACE FUNCTION public.create_workspace(
  p_name text,
  p_display_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_slug text;
  v_channel_id uuid;
  v_agent_id uuid;
  v_display text;
  base_slug text;
  n int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF trim(p_name) = '' THEN
    RAISE EXCEPTION 'Workspace name is required';
  END IF;

  v_display := COALESCE(NULLIF(trim(p_display_name), ''), 'Owner');

  base_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  IF base_slug = '' THEN
    base_slug := 'workspace';
  END IF;
  v_slug := base_slug;

  WHILE EXISTS (SELECT 1 FROM workspaces w WHERE w.slug = v_slug) LOOP
    n := n + 1;
    v_slug := base_slug || '-' || n::text;
  END LOOP;

  INSERT INTO workspaces (name, slug)
  VALUES (trim(p_name), v_slug)
  RETURNING id INTO v_workspace_id;

  INSERT INTO members (workspace_id, user_id, display_name, role)
  VALUES (v_workspace_id, v_user_id, v_display, 'owner');

  INSERT INTO channels (workspace_id, name, slug, type)
  VALUES (v_workspace_id, 'general', 'general', 'hybrid')
  RETURNING id INTO v_channel_id;

  INSERT INTO agents (
    workspace_id,
    name,
    mention_slug,
    system_prompt,
    allowed_tools,
    color,
    status
  )
  VALUES (
    v_workspace_id,
    'Divv',
    'divv',
    'You are Divv, the default AI teammate in Coria — a platform where humans and AI agents collaborate as equals.

You''re helpful, concise, and you show your reasoning openly. You don''t pad responses with filler. You treat teammates as collaborators.

When you don''t know something, say so. Keep replies short unless depth is warranted.

You have web_search and github_read for lookups. Use them when channel history is not enough.',
    ARRAY['web_search', 'github_read']::text[],
    '#6366f1',
    'active'
  )
  RETURNING id INTO v_agent_id;

  INSERT INTO workspace_settings (workspace_id, default_agent_id, default_channel_id)
  VALUES (v_workspace_id, v_agent_id, v_channel_id)
  ON CONFLICT (workspace_id) DO UPDATE
  SET
    default_agent_id = COALESCE(workspace_settings.default_agent_id, EXCLUDED.default_agent_id),
    default_channel_id = COALESCE(workspace_settings.default_channel_id, EXCLUDED.default_channel_id);

  RETURN v_workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_workspace(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_workspace(text, text) TO authenticated;

DROP POLICY IF EXISTS workspaces_update_owner ON workspaces;
CREATE POLICY workspaces_update_owner ON workspaces
  FOR UPDATE TO authenticated
  USING (
    id IN (
      SELECT workspace_id FROM members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    id IN (
      SELECT workspace_id FROM members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Invites: accept for any workspace the user was invited to (not demo-only)
CREATE OR REPLACE FUNCTION public.accept_workspace_invite(p_display_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_invite pending_invites%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  SELECT pi.* INTO v_invite
  FROM pending_invites pi
  WHERE lower(pi.email) = lower(v_email)
    AND pi.expires_at > now()
  ORDER BY pi.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending invite found';
  END IF;

  INSERT INTO members (workspace_id, user_id, display_name, role)
  VALUES (
    v_invite.workspace_id,
    v_user_id,
    COALESCE(NULLIF(trim(p_display_name), ''), split_part(v_email, '@', 1)),
    v_invite.role
  )
  ON CONFLICT (workspace_id, user_id) DO UPDATE
  SET
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role;

  DELETE FROM pending_invites WHERE id = v_invite.id;

  RETURN v_invite.workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_workspace_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invite(text) TO authenticated;
