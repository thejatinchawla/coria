"""Agent CRUD for workspace admin."""

import re
from datetime import datetime, timezone

from fastapi import HTTPException

from workspace_settings import fetch_workspace_settings

SLUG_RE = re.compile(r"^[a-z][a-z0-9_-]{0,31}$")
VALID_TOOLS = {
    "web_search",
    "github_read",
    "github_post_comment",
    "github_create_pr",
    "workspace_search",
}


def list_agents(supabase, workspace_id: str) -> list[dict]:
    result = (
        supabase.table("agents")
        .select(
            "id,workspace_id,name,mention_slug,model,system_prompt,"
            "allowed_tools,channel_scope,status,avatar_url,color,"
            "use_workspace_memory,template_id,triggers_enabled,created_at"
        )
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data or []


def get_agent(supabase, agent_id: str, workspace_id: str | None = None) -> dict:
    query = (
        supabase.table("agents")
        .select(
            "id,workspace_id,name,mention_slug,model,system_prompt,"
            "allowed_tools,channel_scope,status,avatar_url,color,"
            "use_workspace_memory,template_id,triggers_enabled,created_at"
        )
        .eq("id", agent_id)
    )
    if workspace_id:
        query = query.eq("workspace_id", workspace_id)
    result = query.limit(1).execute()
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Agent not found")
    return rows[0]


def _normalize_slug(slug: str) -> str:
    slug = slug.strip().lower().lstrip("@")
    if not SLUG_RE.match(slug):
        raise HTTPException(
            status_code=400,
            detail="mention_slug must be lowercase letters, numbers, _ or -",
        )
    return slug


def _normalize_tools(tools: list[str] | None) -> list[str]:
    if not tools:
        return ["web_search"]
    cleaned = []
    for t in tools:
        if t not in VALID_TOOLS:
            raise HTTPException(status_code=400, detail=f"Unknown tool: {t}")
        if t not in cleaned:
            cleaned.append(t)
    return cleaned


def create_agent(supabase, workspace_id: str, payload: dict) -> dict:
    name = (payload.get("name") or "").strip()
    slug = _normalize_slug(payload.get("mention_slug") or "")
    prompt = (payload.get("system_prompt") or "").strip()
    if not name or not slug or not prompt:
        raise HTTPException(
            status_code=400,
            detail="name, mention_slug, and system_prompt are required",
        )

    row = {
        "workspace_id": workspace_id,
        "name": name,
        "mention_slug": slug,
        "system_prompt": prompt,
        "allowed_tools": _normalize_tools(payload.get("allowed_tools")),
        "channel_scope": payload.get("channel_scope") or [],
        "status": payload.get("status") or "active",
        "color": payload.get("color") or "#6366f1",
        "use_workspace_memory": bool(payload.get("use_workspace_memory")),
        "template_id": payload.get("template_id"),
        "model": payload.get("model"),
    }
    if payload.get("avatar_url"):
        row["avatar_url"] = payload["avatar_url"]

    result = supabase.table("agents").insert(row).execute()
    return (result.data or [{}])[0]


def update_agent(
    supabase, agent_id: str, workspace_id: str, payload: dict
) -> dict:
    get_agent(supabase, agent_id, workspace_id)
    updates: dict = {}

    if "name" in payload and payload["name"] is not None:
        updates["name"] = str(payload["name"]).strip()
    if "mention_slug" in payload and payload["mention_slug"] is not None:
        updates["mention_slug"] = _normalize_slug(payload["mention_slug"])
    if "system_prompt" in payload and payload["system_prompt"] is not None:
        updates["system_prompt"] = str(payload["system_prompt"]).strip()
    if "allowed_tools" in payload and payload["allowed_tools"] is not None:
        updates["allowed_tools"] = _normalize_tools(payload["allowed_tools"])
    if "channel_scope" in payload and payload["channel_scope"] is not None:
        updates["channel_scope"] = payload["channel_scope"]
    if "status" in payload and payload["status"] is not None:
        if payload["status"] not in {"active", "paused"}:
            raise HTTPException(status_code=400, detail="status must be active or paused")
        updates["status"] = payload["status"]
    if "color" in payload and payload["color"] is not None:
        updates["color"] = payload["color"]
    if "use_workspace_memory" in payload:
        updates["use_workspace_memory"] = bool(payload["use_workspace_memory"])
    if "model" in payload:
        updates["model"] = payload["model"]
    if "avatar_url" in payload:
        updates["avatar_url"] = payload["avatar_url"]

    if not updates:
        return get_agent(supabase, agent_id, workspace_id)

    result = (
        supabase.table("agents")
        .update(updates)
        .eq("id", agent_id)
        .eq("workspace_id", workspace_id)
        .execute()
    )
    return (result.data or [{}])[0]


def patch_workspace_settings(supabase, workspace_id: str, payload: dict) -> dict:
    fetch_workspace_settings(supabase, workspace_id)
    allowed = {
        "agents_globally_paused",
        "monthly_tool_budget",
        "tool_budget_used",
        "approval_ttl_hours",
        "default_agent_id",
        "workspace_memory_enabled",
        "llm_provider",
        "llm_model",
    }
    updates = {k: payload[k] for k in allowed if k in payload}
    if not updates:
        return fetch_workspace_settings(supabase, workspace_id)

    if "llm_provider" in updates:
        provider = updates["llm_provider"]
        if provider is not None and provider not in ("groq", "anthropic"):
            raise HTTPException(
                status_code=400,
                detail="llm_provider must be groq, anthropic, or null",
            )
        if provider == "":
            updates["llm_provider"] = None
    if "llm_model" in updates:
        model = updates.get("llm_model")
        if model is not None and not str(model).strip():
            updates["llm_model"] = None
        elif model is not None:
            updates["llm_model"] = str(model).strip()

    if "monthly_tool_budget" in updates:
        updates["monthly_tool_budget"] = max(0, int(updates["monthly_tool_budget"]))
    if "tool_budget_used" in updates:
        updates["tool_budget_used"] = max(0, int(updates["tool_budget_used"]))

    result = (
        supabase.table("workspace_settings")
        .update(
            {
                **updates,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("workspace_id", workspace_id)
        .execute()
    )
    return (result.data or [{}])[0]
