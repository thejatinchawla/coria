"""Workspace settings: kill switch, tool budget."""

from fastapi import HTTPException

DEFAULT_WORKSPACE_SETTINGS: dict = {
    "agents_globally_paused": False,
    "monthly_tool_budget": 500,
    "tool_budget_used": 0,
    "approval_ttl_hours": 24,
    "default_agent_id": None,
    "workspace_memory_enabled": True,
    "llm_provider": None,
    "llm_model": None,
}

_SETTINGS_SELECT = (
    "workspace_id,agents_globally_paused,monthly_tool_budget,"
    "tool_budget_used,approval_ttl_hours,default_agent_id,"
    "workspace_memory_enabled,llm_provider,llm_model,updated_at"
)


def _select_settings(supabase, workspace_id: str) -> dict | None:
    result = (
        supabase.table("workspace_settings")
        .select(_SETTINGS_SELECT)
        .eq("workspace_id", workspace_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def _ensure_settings_row(supabase, workspace_id: str) -> None:
    try:
        supabase.rpc(
            "ensure_workspace_settings",
            {"p_workspace_id": workspace_id},
        ).execute()
    except Exception as e:
        print(f"[workspace_settings] ensure_workspace_settings failed: {e}", flush=True)


def fetch_workspace_settings(supabase, workspace_id: str) -> dict:
    row = _select_settings(supabase, workspace_id)
    if row:
        return row

    _ensure_settings_row(supabase, workspace_id)
    row = _select_settings(supabase, workspace_id)
    if row:
        return row

    return {"workspace_id": workspace_id, **DEFAULT_WORKSPACE_SETTINGS}


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

    _ensure_settings_row(supabase, workspace_id)
    supabase.table("workspace_settings").update(
        {
            "tool_budget_used": used + 1,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("workspace_id", workspace_id).execute()
