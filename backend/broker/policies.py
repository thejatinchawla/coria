DEFAULT_RATE_LIMIT_PER_MINUTE = 10


def load_tool_policy(supabase, workspace_id: str, tool_name: str) -> dict | None:
    result = (
        supabase.table("tool_policies")
        .select(
            "tool_name,requires_approval,allowed_roles,rate_limit_per_minute,enabled"
        )
        .eq("workspace_id", workspace_id)
        .eq("tool_name", tool_name)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def default_policy(tool_name: str) -> dict:
    """Fallback when no row exists — deny unknown write tools."""
    read_only = tool_name in {"web_search", "github_read", "workspace_search"}
    return {
        "tool_name": tool_name,
        "requires_approval": not read_only,
        "allowed_roles": ["owner", "member"],
        "rate_limit_per_minute": DEFAULT_RATE_LIMIT_PER_MINUTE,
        "enabled": read_only,
    }
