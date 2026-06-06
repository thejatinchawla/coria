-- Repair: ensure every workspace member is in #general (idempotent).

INSERT INTO channel_members (channel_id, member_id, added_by)
SELECT c.id, m.id, m.id
FROM channels c
JOIN members m ON m.workspace_id = c.workspace_id
WHERE c.slug = 'general'
ON CONFLICT (channel_id, member_id) DO NOTHING;
