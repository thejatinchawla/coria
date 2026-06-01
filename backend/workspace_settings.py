"""Workspace settings: kill switch, tool budget."""

from fastapi import HTTPException


def fetch_workspace_settings(supabase, workspace_id: str) -> dict:
    result = (
        supabase.table("workspace_settings")
        .select(
            "workspace_id,agents_globally_paused,monthly_tool_budget,"
            "tool_budget_used,approval_ttl_hours,default_agent_id,"
            "workspace_memory_enabled,updated_at"
        )
        .eq("workspace_id", workspace_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if rows:
        return rows[0]

    inserted = (
        supabase.table("workspace_settings")
        .insert({"workspace_id": workspace_id})
        .execute()
    )
    return (inserted.data or [{}])[0]


def assert_agents_not_globally_paused(supabase, workspace_id: str) -> None:
    settings = fetch_workspace_settings(supabase, workspace_id)
    if settings.get("agents_globally_paused"):
        raise HTTPException(
            status_code=403,
            detail="All agents are paused for this workspace.",
        )


def check_tool_budget(supabase, workspace_id: str) -> str | None:
    settings = fetch_workspace_settings(supabase, workspace_id)
    used = int(settings.get("tool_budget_used") or 0)
    limit = int(settings.get("monthly_tool_budget") or 500)
    if used >= limit:
        return (
            f"Monthly tool budget exhausted ({used}/{limit}). "
            "Ask an admin to raise the limit in settings."
        )
    return None


def increment_tool_budget_used(supabase, workspace_id: str) -> None:
    settings = fetch_workspace_settings(supabase, workspace_id)
    used = int(settings.get("tool_budget_used") or 0)
    from datetime import datetime, timezone

    supabase.table("workspace_settings").update(
        {
            "tool_budget_used": used + 1,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("workspace_id", workspace_id).execute()
