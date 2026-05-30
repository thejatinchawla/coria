"""V2 workspace entities: load agent/channel and validate invoke scope."""

from fastapi import HTTPException


def fetch_channel(supabase, channel_id: str) -> dict:
    result = (
        supabase.table("channels")
        .select("id,workspace_id,slug,type,name")
        .eq("id", channel_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Channel not found")
    return rows[0]


def fetch_agent(supabase, agent_id: str) -> dict:
    result = (
        supabase.table("agents")
        .select(
            "id,workspace_id,name,mention_slug,model,system_prompt,"
            "allowed_tools,channel_scope,status"
        )
        .eq("id", agent_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Agent not found")
    return rows[0]


def validate_invoke_scope(agent: dict, channel: dict) -> None:
    if agent["status"] != "active":
        raise HTTPException(status_code=403, detail="Agent is not active")

    if agent["workspace_id"] != channel["workspace_id"]:
        raise HTTPException(status_code=403, detail="Agent not in channel workspace")

    if channel.get("type") == "human_only":
        raise HTTPException(status_code=403, detail="Agents cannot post in human-only channels")

    scope = agent.get("channel_scope") or []
    # Empty scope = all hybrid channels in workspace; non-empty = explicit allowlist.
    if scope and channel["id"] not in scope:
        raise HTTPException(status_code=403, detail="Agent not scoped to this channel")
