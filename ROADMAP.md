# Coria — Roadmap

Product direction organized by the same five layers as [ARCHITECTURE.md](./ARCHITECTURE.md). Scope and user stories: [PRD-V3.md](./PRD-V3.md).

**Tagline:** *Agents that act — with your team's permission.*

---

## Status legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Shipped in production codebase |
| 🚧 | Partially shipped / needs polish |
| 📋 | Planned (next) |
| 🔮 | Future / V4+ |

---

## As-built baseline (V3)

Milestones M1–M5 are complete. The platform runs on:

| Layer | Shipped capability |
|-------|-------------------|
| **Chat** | Channels, Realtime, threads, pins, search, delete-own-message |
| **Agent** | SSE invoke, `@mention`, multi-agent admin, reasoning traces |
| **Trust** | 5-gate broker, action blocks, audit log, tool policies |
| **Memory** | Channel RAG, workspace RAG (`workspace_search`), embed on send |
| **Admin** | Workspaces, invites, roles, agents, triggers, integrations, profile |

Deploy topology: Vercel (frontend) → Supabase (auth, DB, Realtime, Vault, Storage) + Render (FastAPI backend via `INVOKE_SECRET`).

---

## Recently shipped (post–V3 baseline)

Features landed after the 2026-06-06 architecture snapshot:

| Feature | Layer | Notes |
|---------|-------|-------|
| Teammate direct messages | Chat | `/?dm=<member-id>`; bidirectional pair lookup; no agents by default |
| Add agents to teammate DMs | Chat + Trust | `channel_agents` table; opt-in `@mention` in DM |
| Agent direct messages | Chat | `/?agent=<agent-id>` |
| GitHub OAuth | Admin + Integrations | OAuth flow + Vault; PAT fallback |
| Clickable links in messages | Chat | Auto-linkify URLs in bubbles |
| Settings UX pass | Admin | Vertical nav, mobile section picker, workspace-scoped settings |
| GitHub write tool policies | Trust | Workspace policy sync when enabling write tools on agents |

---

## Roadmap by layer

### 1. Chat layer

*Supabase Realtime; humans write directly to Postgres.*

| Item | Status | Notes |
|------|--------|-------|
| `#general` + hybrid channels | ✅ | Default workspace channel; all members auto-joined |
| Threads (inline + mobile) | ✅ | `thread_id` on messages |
| Pins (max 5 per channel) | ✅ | Pins tab |
| Channel text search | ✅ | Header search overlay |
| Teammate DMs | ✅ | `ensure_member_dm` RPC; clean `?dm=` URLs |
| Agent DMs | ✅ | `ensure_agent_dm` RPC; `?agent=` URLs |
| DM read receipts / typing | 🔮 | Not in scope |
| Rich message formatting (markdown) | 📋 | Plain text today |
| File attachments | 🔮 | V4+ |
| Notification center (missed DMs) | 📋 | Realtime only; no push/email digest |
| Unread badges per channel/DM | 📋 | Sidebar indicators |
| Message reactions | 🔮 | V4+ |
| `@mention` humans in chat | 🔮 | Agent `@mention` only today |

---

### 2. Agent layer

*FastAPI on `@mention`, triggers, or approval resume; SSE streaming.*

| Item | Status | Notes |
|------|--------|-------|
| Streaming invoke (`/api/invoke/stream`) | ✅ | Primary UI path |
| Default agent **@divv** per workspace | ✅ | `web_search` + `github_read` by default |
| Custom agents (admin CRUD) | ✅ | Settings → Agents |
| Per-agent tool allowlist | ✅ | `allowed_tools` in DB |
| Keyword triggers | ✅ | 30s debounce; human messages only |
| Cron triggers | 🚧 | `POST /triggers/run-cron`; external scheduler required |
| Agent-to-agent `@mention` chaining | 📋 | Deferred from M5; depth cap designed (≤2) |
| `use_workspace_memory` UI toggle | 📋 | Column exists; no settings control |
| `channel_scope` channel picker | 📋 | Backend enforces; UI uses default scope |
| Agent templates (Engineering, Research) | 📋 | Manual create only today |
| In-app cron scheduler | 📋 | pg_cron or Vercel cron doc → built-in UI |
| Multi-model routing per agent | 🔮 | Single workspace LLM override today |
| Tool call streaming in reasoning trace | 🚧 | Steps persisted; limited live tool UI |

**Tools (broker-gated)**

| Tool | Status | Approval |
|------|--------|----------|
| `web_search` | ✅ | Auto |
| `github_read` | ✅ | Auto |
| `workspace_search` | ✅ | Auto |
| `github_post_comment` | ✅ | Required |
| `github_create_pr` | ✅ | Required |
| Slack / Jira / Linear | 🔮 | V4 integrations |

---

### 3. Trust layer

*Broker + action blocks before external writes.*

| Item | Status | Notes |
|------|--------|-------|
| Gate 1 — permission (agent + policy) | ✅ | `tool_policies` + `allowed_tools` |
| Gate 2 — monthly tool budget | ✅ | Workspace settings |
| Gate 3 — rate limit | ✅ | Per-tool `rate_limit_per_minute` |
| Gate 4 — human approval | ✅ | `action_blocks` + Approve/Decline UI |
| Gate 5 — audit | ✅ | Hashed inputs in `audit_log` |
| Pending approvals badge | ✅ | Channel header |
| Toast when peer approves your block | 📋 | Realtime updates; no dedicated toast |
| Action block → audit deep link | 📋 | Separate settings views today |
| Per-channel trigger disable | 📋 | Triggers per channel row; no bulk toggle |
| Role-based tool policies (`allowed_roles`) | 🚧 | Column exists; limited UI |
| SOC2-oriented audit export | 🔮 | V4 |
| Policy editor UI (non-default tools) | 📋 | Seed policies + agent sync only |

---

### 4. Memory layer

*Embeddings on send; RAG at invoke time.*

| Item | Status | Notes |
|------|--------|-------|
| Channel memory (pgvector) | ✅ | Embed on send via `/api/memory/embed` |
| Workspace memory tier | ✅ | `workspace_search` when `use_workspace_memory` |
| Thread-aware retrieval | ✅ | Thread messages prioritized in context |
| Cross-channel citation in reply | 📋 | RAG retrieves; UI does not cite source channel |
| Embedding backfill CLI | ✅ | `backend/memory/embed.py` |
| Knowledge graph / adjacency | 🔮 | V4 preview |
| Memory inspector UI | 📋 | No admin view of `memory_items` |
| Per-channel memory clear | 🔮 | V4+ |

---

### 5. Admin layer

*Settings UI + FastAPI admin routes; Supabase Auth for team.*

| Item | Status | Notes |
|------|--------|-------|
| Self-serve onboarding | ✅ | `create_workspace` RPC |
| Email invites + roles | ✅ | Owner / admin / member |
| Profile (avatar, bio, theme) | ✅ | Storage bucket `avatars` |
| Workspace settings (kill switch, budget) | ✅ | Settings → Agents |
| GitHub integration (PAT + OAuth) | ✅ | Vault-backed |
| Per-workspace LLM key | ✅ | Settings → Integrations |
| Channel create / delete / members | ✅ | Admin; `#general` protected |
| Audit log + JSON export | ✅ | 30-day export |
| Triggers admin + Run now | ✅ | Settings → Triggers |
| `default_channel_id` workspace setting | 📋 | Column exists; no UI |
| Member leave workspace | 📋 | P2; not implemented |
| Ownership transfer | 📋 | P2; not implemented |
| SSO (Google Workspace) | 🔮 | V4 preview |
| Usage billing (Stripe) | 🔮 | V4 preview |
| Agent marketplace templates | 🔮 | V4 preview |

---

## Near-term priorities (recommended order)

Work that closes the biggest gaps between architecture intent and daily use:

| Priority | Item | Layer | Rationale |
|----------|------|-------|-----------|
| P0 | In-app / documented cron for triggers | Agent | Cron triggers unusable without external ping |
| P0 | `use_workspace_memory` + `channel_scope` in agent form | Agent + Admin | Power users need UI, not SQL |
| P1 | Agent templates (Research, Engineering) | Agent + Admin | Faster onboarding than blank agent |
| P1 | Unread badges + DM notification | Chat | DMs ship without discoverability |
| P1 | Approval toast + audit deep link | Trust | Completes governance story in demos |
| P2 | Agent-to-agent delegation (depth ≤2) | Agent | Designed in PRD; deferred from M5 |
| P2 | Member leave + ownership transfer | Admin | Team lifecycle |
| P2 | Cross-channel citation in agent replies | Memory | Makes workspace RAG trustworthy |

---

## V4 horizon

From [PRD-V3.md §15](./PRD-V3.md#15-v4-preview-context-only). Not committed dates — directional only.

| Theme | Examples |
|-------|----------|
| **Integrations** | Jira, Linear, Slack (OAuth); MCP tool registry UI |
| **Orchestration** | LangGraph workflows; visual trigger builder |
| **Memory** | Knowledge graph adjacency |
| **Enterprise** | SSO, SOC2 audit export, usage billing |
| **Ecosystem** | Agent marketplace; shared templates |

---

## Technical debt & ops

| Item | Status | Notes |
|------|--------|-------|
| Legacy `POST /invoke` (non-streaming) | 🚧 | UI uses stream; batch path could be removed |
| `ARCHITECTURE.md` channel routing doc | 📋 | Update `?dm=` / `?agent=` URL scheme |
| E2E tests (invoke + approval flow) | 📋 | Manual QA today |
| Staging environment parity | 📋 | Document Render + Vercel preview envs |
| Migration discipline | ✅ | `backend/supabase/migrations/` canonical |

---

## How to use this doc

1. **Pick a layer** — changes should respect the mental model in [ARCHITECTURE.md § Mental model](./ARCHITECTURE.md#mental-model).
2. **Check PRD** — user story IDs and acceptance criteria live in [PRD-V3.md §14](./PRD-V3.md#14-open-questions--known-gaps).
3. **Ship via migrations** — schema changes go through `backend/supabase/migrations/` then `supabase db push`.
4. **Update this file** — when a 📋 item ships, move it to ✅ and add a line under **Recently shipped**.

---

## Milestone history (V3)

| Milestone | Theme | Status |
|-----------|-------|--------|
| M1 | Trust layer (broker, action blocks, audit) | ✅ |
| M2 | Multi-agent & admin | ✅ |
| M3 | Memory & threads | ✅ |
| M4 | Integrations & triggers | ✅ |
| M5 | Team admin & polish | ✅ (A2A deferred) |
| **M6** | Direct messages & teammate chat | ✅ |
| **M7** | GitHub OAuth + DM agent opt-in | ✅ |

*Suggested next milestone label: **M8 — Agent admin completeness** (templates, scope UI, workspace memory toggle, cron UX).*

---

*Last updated: 2026-06-08. Aligned with [ARCHITECTURE.md](./ARCHITECTURE.md).*
