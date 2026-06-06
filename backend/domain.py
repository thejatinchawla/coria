"""V2 workspace entities: load agent/channel and validate invoke scope."""

from fastapi import HTTPException

from workspace_settings import assert_agents_not_globally_paused


def _is_member_direct_dm(channel: dict) -> bool:
    return channel.get("type") == "direct" and bool(
        channel.get("direct_peer_member_id")
    )


def _is_agent_direct_dm(channel: dict) -> bool:
    return channel.get("type") == "direct" and bool(channel.get("direct_agent_id"))


def fetch_channel(supabase, channel_id: str) -> dict:
    result = (
        supabase.table("channels")
        .select(
            "id,workspace_id,slug,type,name,direct_agent_id,direct_peer_member_id"
        )
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
            "allowed_tools,channel_scope,status,avatar_url,color,"
            "use_workspace_memory"
        )
        .eq("id", agent_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Agent not found")
    return rows[0]


def validate_invoke_scope(supabase, agent: dict, channel: dict) -> None:
    assert_agents_not_globally_paused(supabase, channel["workspace_id"])

    if agent["status"] != "active":
        name = agent.get("name") or "Agent"
        raise HTTPException(
            status_code=403,
            detail=f"{name} is paused. Resume the agent in settings to continue.",
        )

    if agent["workspace_id"] != channel["workspace_id"]:
        raise HTTPException(status_code=403, detail="Agent not in channel workspace")

    if _is_agent_direct_dm(channel):
        if agent["id"] != channel.get("direct_agent_id"):
            raise HTTPException(
                status_code=403,
                detail="This direct chat is only with that agent",
            )
        return

    if _is_member_direct_dm(channel):
        result = (
            supabase.table("channel_agents")
            .select("id")
            .eq("channel_id", channel["id"])
            .eq("agent_id", agent["id"])
            .limit(1)
            .execute()
        )
        if not (result.data or []):
            raise HTTPException(
                status_code=403,
                detail="Add this agent to the conversation before mentioning them",
            )
        return

    if channel.get("type") == "human_only":
        raise HTTPException(status_code=403, detail="Agents cannot post in human-only channels")

    scope = agent.get("channel_scope") or []
    # Empty scope = all hybrid channels in workspace; non-empty = explicit allowlist.
    if scope and channel["id"] not in scope:
        raise HTTPException(status_code=403, detail="Agent not scoped to this channel")
