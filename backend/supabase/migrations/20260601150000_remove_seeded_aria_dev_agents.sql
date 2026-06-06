-- Clean up legacy demo agent rows from older migration history (obsolete slugs).
-- Fresh installs seed Divv only; this is a no-op when those rows never existed.

DELETE FROM agent_triggers
WHERE agent_id IN (
  SELECT id FROM agents WHERE mention_slug IN ('aria', 'dev')
);

DELETE FROM agents
WHERE mention_slug IN ('aria', 'dev');

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
