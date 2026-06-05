-- Default profile image for @divv (served from the Coria web app at /agents/divv-avatar.png).

UPDATE agents
SET avatar_url = '/agents/divv-avatar.png'
WHERE mention_slug = 'divv'
  AND (avatar_url IS NULL OR avatar_url = '');

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
    avatar_url,
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
    '/agents/divv-avatar.png',
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
