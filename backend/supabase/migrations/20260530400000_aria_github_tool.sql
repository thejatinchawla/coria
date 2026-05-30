-- M3: allow Aria to use github_read (public API, optional GITHUB_TOKEN on backend)
UPDATE agents
SET allowed_tools = (
  SELECT array_agg(DISTINCT t)
  FROM unnest(coalesce(allowed_tools, '{}'::text[]) || '{github_read}'::text[]) AS t
)
WHERE mention_slug = 'aria';
