"""Audit log queries for workspace admin."""

from datetime import datetime, timedelta, timezone


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def list_audit_log(
    supabase,
    workspace_id: str,
    *,
    agent_id: str | None = None,
    tool_name: str | None = None,
    outcome: str | None = None,
    since: str | None = None,
    until: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    limit = min(max(limit, 1), 200)
    offset = max(offset, 0)

    query = (
        supabase.table("audit_log")
        .select(
            "id,workspace_id,agent_id,member_id,action_block_id,tool_name,"
            "tool_input_hash,outcome,gate_failed,metadata,created_at",
            count="exact",
        )
        .eq("workspace_id", workspace_id)
    )

    if agent_id:
        query = query.eq("agent_id", agent_id)
    if tool_name:
        query = query.eq("tool_name", tool_name)
    if outcome:
        query = query.eq("outcome", outcome)

    since_dt = _parse_ts(since)
    until_dt = _parse_ts(until)
    if since_dt:
        query = query.gte("created_at", since_dt.isoformat())
    if until_dt:
        query = query.lte("created_at", until_dt.isoformat())

    result = (
        query.order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    return {
        "items": result.data or [],
        "total": result.count or 0,
        "limit": limit,
        "offset": offset,
    }


def export_audit_log(
    supabase,
    workspace_id: str,
    *,
    days: int = 30,
) -> list[dict]:
    days = min(max(days, 1), 90)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    result = (
        supabase.table("audit_log")
        .select(
            "id,workspace_id,agent_id,member_id,action_block_id,tool_name,"
            "tool_input_hash,outcome,gate_failed,metadata,created_at"
        )
        .eq("workspace_id", workspace_id)
        .gte("created_at", since)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data or []
