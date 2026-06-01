"""Workspace LLM integration admin (API key via Vault)."""

from fastapi import HTTPException


def get_llm_integration(supabase, workspace_id: str) -> dict | None:
    result = (
        supabase.table("integrations")
        .select("id,workspace_id,provider,status,created_at")
        .eq("workspace_id", workspace_id)
        .eq("provider", "llm")
        .limit(1)
        .execute()
    )
    rows = result.data or []
    row = rows[0] if rows else None
    if row and row.get("status") != "active":
        return None
    return row


def save_llm_api_key(
    supabase, workspace_id: str, api_key: str, member_id: str
) -> dict:
    api_key = (api_key or "").strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="API key is required")

    try:
        result = supabase.rpc(
            "set_llm_integration",
            {
                "p_workspace_id": workspace_id,
                "p_api_key": api_key,
                "p_member_id": member_id,
            },
        ).execute()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Could not store LLM API key: {e}",
        ) from e

    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Failed to save LLM integration")
    row = rows[0] if isinstance(rows, list) else rows
    return {
        "id": row.get("id"),
        "workspace_id": row.get("workspace_id"),
        "provider": row.get("provider"),
        "status": row.get("status"),
        "created_at": row.get("created_at"),
    }


def disconnect_llm(supabase, workspace_id: str) -> None:
    try:
        supabase.rpc(
            "disconnect_llm_integration",
            {"p_workspace_id": workspace_id},
        ).execute()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Could not disconnect LLM integration: {e}",
        ) from e
