# Supabase setup

## Migrations

Link the Supabase CLI to your project (once), then apply all migrations:

```bash
cd backend
supabase db push
```

Alternative: run each file in `migrations/` once via the Supabase SQL editor.

## Backend

After migrations, start the API (creates `.venv`, installs deps):

```bash
cd backend
./run.sh
```

Copy `backend/.env.example` → `backend/.env` and fill in:

- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- `GROQ_API_KEY` or `ANTHROPIC_API_KEY`, `TAVILY_API_KEY`
- `INVOKE_SECRET` (must match the Next.js app)
- `APP_URL` (e.g. `http://localhost:3000`)
- `GITHUB_TOKEN` (optional locally; required for GitHub write tools)

## Auth redirect URLs

Dashboard → **Authentication → URL Configuration**:

- **Site URL:** `http://localhost:3000` (or production URL)
- **Redirect URLs:** add `/auth/callback`, `/auth/confirm`, and `/auth/join` for each origin (local + deployed)

## Email templates (required for magic links)

Magic links must use `token_hash` in the URL (not the default `ConfirmationURL` PKCE flow).

Dashboard → **Authentication → Email Templates** — paste from `templates/`:

| Template        | File                      |
|-----------------|---------------------------|
| Magic Link      | `templates/magic-link.html` |
| Invite user     | `templates/invite.html`     |
| Confirm signup  | `templates/confirm-signup.html` |

Each link uses `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=…` so sign-in works in any browser (no PKCE cookie required).

## Optional

**Backfill message embeddings** (one channel):

```bash
curl -X POST http://localhost:8000/memory/backfill \
  -H "Content-Type: application/json" \
  -H "X-Invoke-Secret: $INVOKE_SECRET" \
  -d '{"channel_id":"<channel-uuid>"}'
```

**Cron triggers (production):** enable `pg_cron` + `pg_net`, then schedule a minute POST to `/triggers/run-cron` with `X-Invoke-Secret`. Local test:

```bash
curl -X POST http://localhost:8000/triggers/run-cron \
  -H "Content-Type: application/json" \
  -H "X-Invoke-Secret: $INVOKE_SECRET"
```
