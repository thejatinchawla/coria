"""Agent trigger CRUD."""

from fastapi import HTTPException

VALID_TYPES = {"cron", "keyword"}


def list_triggers(supabase, workspace_id: str) -> list[dict]:
    result = (
        supabase.table("agent_triggers")
        .select(
            "id,workspace_id,agent_id,channel_id,type,config,enabled,last_run_at,created_at"
        )
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data or []


def get_trigger(supabase, trigger_id: str, workspace_id: str | None = None) -> dict:
    query = (
        supabase.table("agent_triggers")
        .select(
            "id,workspace_id,agent_id,channel_id,type,config,enabled,last_run_at,created_at"
        )
        .eq("id", trigger_id)
    )
    if workspace_id:
        query = query.eq("workspace_id", workspace_id)
    result = query.limit(1).execute()
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Trigger not found")
    return rows[0]


def create_trigger(supabase, workspace_id: str, payload: dict) -> dict:
    trigger_type = payload.get("type")
    if trigger_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail="type must be cron or keyword")

    agent_id = payload.get("agent_id")
    channel_id = payload.get("channel_id")
    config = payload.get("config") or {}
    if not agent_id or not channel_id:
        raise HTTPException(
            status_code=400, detail="agent_id and channel_id are required"
        )

    if trigger_type == "cron" and not config.get("cron"):
        raise HTTPException(status_code=400, detail="config.cron is required")
    if trigger_type == "keyword" and not config.get("keywords"):
        raise HTTPException(status_code=400, detail="config.keywords is required")

    row = {
        "workspace_id": workspace_id,
        "agent_id": agent_id,
        "channel_id": channel_id,
        "type": trigger_type,
        "config": config,
        "enabled": payload.get("enabled", True),
    }
    result = supabase.table("agent_triggers").insert(row).execute()
    return (result.data or [{}])[0]


def update_trigger(
    supabase, trigger_id: str, workspace_id: str, payload: dict
) -> dict:
    get_trigger(supabase, trigger_id, workspace_id)
    allowed = {"agent_id", "channel_id", "config", "enabled", "type"}
    updates = {k: payload[k] for k in allowed if k in payload}
    if not updates:
        return get_trigger(supabase, trigger_id, workspace_id)

    if "type" in updates and updates["type"] not in VALID_TYPES:
        raise HTTPException(status_code=400, detail="type must be cron or keyword")

    result = (
        supabase.table("agent_triggers")
        .update(updates)
        .eq("id", trigger_id)
        .eq("workspace_id", workspace_id)
        .execute()
    )
    return (result.data or [{}])[0]


def delete_trigger(supabase, trigger_id: str, workspace_id: str) -> None:
    get_trigger(supabase, trigger_id, workspace_id)
    supabase.table("agent_triggers").delete().eq("id", trigger_id).eq(
        "workspace_id", workspace_id
    ).execute()
