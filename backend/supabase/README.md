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
