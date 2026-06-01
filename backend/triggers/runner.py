"""Execute cron and keyword agent triggers."""

import re
from datetime import datetime, timezone, timedelta

from croniter import croniter
from fastapi import HTTPException

from domain import fetch_agent, fetch_channel
from triggers.invoke import invoke_agent_for_trigger
from workspace_settings import fetch_workspace_settings

KEYWORD_DEBOUNCE_SECONDS = 30
_MENTION_PREFIX = re.compile(r"^@\w+\s", re.IGNORECASE)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def cron_is_due(
    cron_expr: str, now: datetime, last_run_at: datetime | None
) -> bool:
    base = last_run_at or (now - timedelta(days=2))
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)
    itr = croniter(cron_expr, base)
    next_run = itr.get_next(datetime)
    if next_run.tzinfo is None:
        next_run = next_run.replace(tzinfo=timezone.utc)
    return next_run <= now


def _assert_trigger_runnable(supabase, trigger: dict) -> dict:
    if not trigger.get("enabled"):
        raise HTTPException(status_code=409, detail="Trigger is disabled")

    settings = fetch_workspace_settings(supabase, trigger["workspace_id"])
    if settings.get("agents_globally_paused"):
        raise HTTPException(status_code=403, detail="Agents globally paused")

    agent = fetch_agent(supabase, trigger["agent_id"])
    if agent.get("status") != "active":
        raise HTTPException(status_code=403, detail="Agent is paused")
    if agent.get("triggers_enabled") is False:
        raise HTTPException(status_code=403, detail="Agent triggers disabled")

    channel = fetch_channel(supabase, trigger["channel_id"])
    return agent


async def run_trigger(supabase, trigger_id: str) -> dict:
    result = (
        supabase.table("agent_triggers")
        .select("*")
        .eq("id", trigger_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Trigger not found")
    return await _execute_trigger(supabase, rows[0])


async def run_due_cron_triggers(supabase) -> list[dict]:
    now = _utcnow()
    result = (
        supabase.table("agent_triggers")
        .select("*")
        .eq("type", "cron")
        .eq("enabled", True)
        .execute()
    )
    outcomes: list[dict] = []
    for trigger in result.data or []:
        cron_expr = (trigger.get("config") or {}).get("cron")
        if not cron_expr:
            continue
        last_run = _parse_ts(trigger.get("last_run_at"))
        if not cron_is_due(cron_expr, now, last_run):
            continue
        try:
            outcomes.append(await _execute_trigger(supabase, trigger))
        except HTTPException as e:
            outcomes.append(
                {
                    "trigger_id": trigger["id"],
                    "status": "skipped",
                    "reason": str(e.detail),
                }
            )
        except Exception as e:
            outcomes.append(
                {
                    "trigger_id": trigger["id"],
                    "status": "error",
                    "reason": str(e),
                }
            )
    return outcomes


async def handle_keyword_message(
    supabase,
    *,
    workspace_id: str,
    channel_id: str,
    content: str,
) -> list[dict]:
    text = (content or "").strip()
    if not text or _MENTION_PREFIX.match(text):
        return []

    result = (
        supabase.table("agent_triggers")
        .select("*")
        .eq("workspace_id", workspace_id)
        .eq("channel_id", channel_id)
        .eq("type", "keyword")
        .eq("enabled", True)
        .execute()
    )
    text_lower = text.lower()
    outcomes: list[dict] = []

    for trigger in result.data or []:
        keywords = (trigger.get("config") or {}).get("keywords") or []
        if not any(kw.lower() in text_lower for kw in keywords):
            continue
        if not _debounce_ok(supabase, trigger["id"], channel_id):
            outcomes.append(
                {
                    "trigger_id": trigger["id"],
                    "status": "debounced",
                }
            )
            continue
        try:
            user_message = _keyword_user_message(trigger, text)
            trigger = {**trigger, "_user_message": user_message}
            outcomes.append(await _execute_trigger(supabase, trigger))
        except HTTPException as e:
            outcomes.append(
                {
                    "trigger_id": trigger["id"],
                    "status": "skipped",
                    "reason": str(e.detail),
                }
            )
        except Exception as e:
            outcomes.append(
                {
                    "trigger_id": trigger["id"],
                    "status": "error",
                    "reason": str(e),
                }
            )
    return outcomes


def _keyword_user_message(trigger: dict, content: str) -> str:
    prefix = (trigger.get("config") or {}).get("prompt_prefix") or ""
    if prefix:
        return f"{prefix}\n\n{content}"
    return content


def _debounce_ok(supabase, trigger_id: str, channel_id: str) -> bool:
    now = _utcnow()
    result = (
        supabase.table("trigger_debounce")
        .select("last_fired_at")
        .eq("trigger_id", trigger_id)
        .eq("channel_id", channel_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if rows:
        last = _parse_ts(rows[0].get("last_fired_at"))
        if last and (now - last).total_seconds() < KEYWORD_DEBOUNCE_SECONDS:
            return False

    supabase.table("trigger_debounce").upsert(
        {
            "trigger_id": trigger_id,
            "channel_id": channel_id,
            "last_fired_at": now.isoformat(),
        }
    ).execute()
    return True


async def _execute_trigger(supabase, trigger: dict) -> dict:
    agent = _assert_trigger_runnable(supabase, trigger)
    config = trigger.get("config") or {}

    if trigger["type"] == "cron":
        user_message = config.get("prompt") or "Provide a brief channel digest."
    else:
        user_message = trigger.get("_user_message") or config.get("prompt") or ""

    if not user_message.strip():
        return {"trigger_id": trigger["id"], "status": "skipped", "reason": "empty prompt"}

    print(
        f"[trigger] running {trigger['type']} trigger={trigger['id']} "
        f"agent={agent.get('mention_slug')} channel={trigger['channel_id']}",
        flush=True,
    )

    outcome = await invoke_agent_for_trigger(
        user_message,
        trigger["channel_id"],
        trigger["agent_id"],
        invoker_member_id=None,
        trigger_type=trigger["type"],
    )

    supabase.table("agent_triggers").update(
        {"last_run_at": _utcnow().isoformat()}
    ).eq("id", trigger["id"]).execute()

    return {
        "trigger_id": trigger["id"],
        "type": trigger["type"],
        **outcome,
    }
