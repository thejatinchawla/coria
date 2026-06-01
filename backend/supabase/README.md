# Supabase migrations (Coria V2)

## Apply locally

```bash
cd backend
# Supabase CLI linked to your project
supabase db push
```

Or paste `backend/supabase/migrations/20260530000000_v2_domain_model.sql` into the Supabase SQL editor and run once.

## After migrate

- All users auto-join **Coria Demo** on first visit (`ensureDemoMember` in the app).
- Default channel: `/?channel=general`
- Legacy messages backfill to `#general`.

## M2 — RAG memory

After `20260530300000_memory_rag.sql`:

```bash
cd backend
./run.sh
```

(`run.sh` creates `.venv` and runs `.venv/bin/pip install` — do not use bare `pip` on macOS.)

Backfill existing messages for a channel (once):

```bash
curl -X POST http://localhost:8000/memory/backfill \
  -H "Content-Type: application/json" \
  -H "X-Invoke-Secret: $INVOKE_SECRET" \
  -d '{"channel_id":"<channel-uuid>"}'
```

New human messages auto-embed via `/api/memory/embed`. Agent replies embed in `invoke_agent`.

## M3 — Streaming + polish

- `@aria` uses SSE: `POST /api/invoke/stream` → backend `/invoke/stream`
- Error toasts on send/invoke failures
- `github_read` tool (public repos; optional `GITHUB_TOKEN` in backend `.env`)

```bash
cd backend && supabase db push   # adds github_read to Aria allowed_tools
```

## V3 M1 — Trust layer (action blocks + tool broker)

After `20260531000000_v3_m1_trust_layer.sql`:

- Tables: `action_blocks`, `audit_log`, `tool_policies`, `workspace_settings`
- `@dev` agent seeded with `github_post_comment` (approval required)
- Tool broker gates: permission, rate, approval, audit

**Requires `GITHUB_TOKEN`** in backend `.env` with `repo` scope to post issue comments.

Test flow:

```
@dev comment on owner/repo issue 1: "Looks good from Coria"
```

→ approval card appears → Approve → comment posted on GitHub.

Decide endpoint: `POST /api/action-blocks/{id}/decide` (SSE resume stream).

## V3 M2 — Multi-agent & admin

After `20260531200000_v3_m2_multi_agent.sql`:

- **Divv** (`@divv`) — default workspace agent (V2 Aria row migrated)
- **Aria** (`@aria`) — research agent with workspace memory
- **Dev** (`@dev`) — engineering agent (unchanged from M1)
- Agent CRUD: `GET/POST /agents`, `PATCH /agents/{id}`
- Workspace settings: `GET/PATCH /workspace-settings` (kill switch, tool budget)
- Settings UI: `/settings/agents`
- Budget gate (gate 2) enforced in tool broker

Test flow:

1. Open `/settings/agents` → create a custom agent → pause it → `@mention` should fail with clear message
2. Toggle kill switch → chat shows banner; agent invokes blocked
3. `@divv`, `@aria`, `@dev` autocomplete from DB

## V3 M3 — Memory & threads

After `20260531300000_v3_m3_memory_threads.sql`:

- **Threads** — reply on any message; inline expand (desktop), full-screen (mobile)
- **Thread invoke** — pass `thread_id` to `/invoke/stream`; agent gets thread transcript first
- **Workspace memory** — dual-tier embed (`channel` + `workspace`); Aria has `use_workspace_memory`
- **`workspace_search` tool** — cross-channel RAG for agents with the tool
- **Channel search** — header search bar uses `search_channel_messages` RPC
- **Pin messages** — hover a message → Pin; up to 5 per channel; pinned bar at top of channel
- Demo **#product** channel seeded for cross-channel memory tests

Test flow:

1. Post a decision in `#product`: "We ship v2 in May"
2. Wait for embed (or backfill channel)
3. In `#general`, reply in thread: `@aria what did we decide about the v2 ship date in #product?`
4. Aria should cite `#product` from workspace memory

```bash
cd backend && supabase db push
# Backfill #product if needed:
curl -X POST http://localhost:8000/memory/backfill \
  -H "Content-Type: application/json" \
  -H "X-Invoke-Secret: $INVOKE_SECRET" \
  -d '{"channel_id":"00000000-0000-4000-8000-000000000006"}'
```

## V3 M4 — Integrations & triggers

After `20260531400000_v3_m4_integrations_triggers.sql`:

- **GitHub PAT** stored in Supabase Vault (`integrations` table + RPC helpers)
- Settings UI: `/settings/integrations` — connect/disconnect GitHub PAT
- **`github_create_pr`** tool on @dev (approval required)
- **`agent_triggers`** — cron + keyword types with 30s keyword debounce
- Settings UI: `/settings/triggers` — CRUD + manual Run
- Keyword hook: human channel messages call `/api/triggers/keyword` → backend invoke

**Seeded triggers (demo workspace):**

| Trigger | Type | Agent | Channel | Config |
|---------|------|-------|---------|--------|
| `…007` | cron | @divv | #general | `0 9 * * *` daily digest |
| `…008` | keyword | @dev | #general | `bug:` |

Test flow:

1. `/settings/integrations` → paste GitHub PAT (`repo` scope) → Connect
2. In `#general`, post `bug: login button broken` (no @mention) → @dev replies via keyword trigger
3. `/settings/triggers` → Run on cron digest trigger → @divv posts summary in #general
4. `@dev create a draft PR on owner/repo from fix-branch` → approval card → Approve

**Cron scheduling (production):** enable `pg_cron` + `pg_net` on Supabase, then schedule an HTTP POST to the backend every minute:

```sql
-- Example: call backend run-cron (set URL + secret for your deploy)
SELECT cron.schedule(
  'coria-run-cron-triggers',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_BACKEND/triggers/run-cron',
    headers := '{"Content-Type": "application/json", "X-Invoke-Secret": "YOUR_SECRET"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

Local manual cron test:

```bash
curl -X POST http://localhost:8000/triggers/run-cron \
  -H "Content-Type: application/json" \
  -H "X-Invoke-Secret: $INVOKE_SECRET"
```

Fallback: `GITHUB_TOKEN` in backend `.env` if Vault RPC is unavailable locally.

```bash
cd backend && supabase db push
cd backend && .venv/bin/pip install croniter==2.0.5
```

## V3 M5 — Team admin & polish

After `20260531600000_v3_m5_team_admin.sql`:

- **`admin` role** on `member_role` enum; first demo member promoted to `owner`
- **Member profiles** — `avatar_url`, `bio` on `members`; Supabase Storage `avatars` bucket
- **`pending_invites`** + `accept_workspace_invite()` RPC on sign-in
- **Settings UI:**
  - `/settings/profile` — display name, bio, avatar upload/URL (all roles)
  - `/settings/members` — invite by email, role management (owner/admin)
  - `/settings/audit` — filterable audit log + JSON export (owner/admin)

**Invite flow:** Owner/admin sends invite → Supabase Auth email → invitee clicks link → `/auth/callback` → `/auth/join` (set password) → `accept_workspace_invite` → `#general`.

**Supabase Auth URLs** (Dashboard → Authentication → URL Configuration):

- Site URL: `http://localhost:3000` (or production URL)
- Redirect URLs: `http://localhost:3000/auth/callback`, `http://localhost:3000/auth/join`

Set `APP_URL=http://localhost:3000` in backend `.env` for invite redirect URLs.

```bash
cd backend && supabase db push
```

Test flow:

1. `/settings/profile` → update display name and avatar
2. `/settings/members` → invite teammate (requires owner/admin; first member is owner after migration)
3. `/settings/audit` → filter tool attempts, export JSON

**P2 (not yet):** A2A @mention chaining, mobile polish pass

