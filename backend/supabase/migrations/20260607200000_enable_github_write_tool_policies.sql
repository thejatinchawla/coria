-- Enable GitHub write tools for all workspaces (approval still required at runtime).
-- Previously only the seed workspace had rows; other workspaces silently blocked PR/comment tools.

INSERT INTO tool_policies (workspace_id, tool_name, requires_approval, enabled)
SELECT w.id, t.tool_name, true, true
FROM workspaces w
CROSS JOIN (
  VALUES ('github_post_comment'), ('github_create_pr')
) AS t(tool_name)
ON CONFLICT (workspace_id, tool_name) DO UPDATE
  SET requires_approval = EXCLUDED.requires_approval,
      enabled = EXCLUDED.enabled;
