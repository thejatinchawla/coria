-- Remove seeded Aria/Dev agents; @divv is the only default. Admins create more in Settings → Agents.

-- Drop triggers tied to removed agents
DELETE FROM agent_triggers
WHERE agent_id IN (
  SELECT id FROM agents WHERE mention_slug IN ('aria', 'dev')
);

-- Remove seeded multi-agent rows (demo + any workspace using these slugs)
DELETE FROM agents
WHERE mention_slug IN ('aria', 'dev');

-- Ensure default_agent_id points at a remaining agent per workspace
UPDATE workspace_settings ws
SET default_agent_id = sub.agent_id
FROM (
  SELECT DISTINCT ON (a.workspace_id)
    a.workspace_id,
    a.id AS agent_id
  FROM agents a
  ORDER BY a.workspace_id, a.created_at ASC
) sub
WHERE ws.workspace_id = sub.workspace_id
  AND (
    ws.default_agent_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM agents a2 WHERE a2.id = ws.default_agent_id
    )
  );
