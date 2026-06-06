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


KNOWN_WRITE_TOOLS = frozenset({"github_post_comment", "github_create_pr"})


def default_policy(tool_name: str) -> dict:
    """Fallback when no row exists — allow known write tools with approval."""
    read_only = tool_name in {"web_search", "github_read", "workspace_search"}
    enabled = read_only or tool_name in KNOWN_WRITE_TOOLS
    return {
        "tool_name": tool_name,
        "requires_approval": not read_only,
        "allowed_roles": ["owner", "member"],
        "rate_limit_per_minute": DEFAULT_RATE_LIMIT_PER_MINUTE,
        "enabled": enabled,
    }
