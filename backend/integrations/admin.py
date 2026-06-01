"""Workspace integration admin (GitHub PAT via Vault)."""

from fastapi import HTTPException


def get_github_integration(supabase, workspace_id: str) -> dict | None:
    result = (
        supabase.table("integrations")
        .select("id,workspace_id,provider,status,created_at")
        .eq("workspace_id", workspace_id)
        .eq("provider", "github")
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def save_github_pat(
    supabase, workspace_id: str, pat: str, member_id: str
) -> dict:
    pat = (pat or "").strip()
    if not pat:
        raise HTTPException(status_code=400, detail="GitHub PAT is required")

    try:
        result = supabase.rpc(
            "set_github_integration",
            {
                "p_workspace_id": workspace_id,
                "p_pat": pat,
                "p_member_id": member_id,
            },
        ).execute()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Could not store GitHub PAT: {e}",
        ) from e

    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Failed to save integration")
    row = rows[0] if isinstance(rows, list) else rows
    return {
        "id": row.get("id"),
        "workspace_id": row.get("workspace_id"),
        "provider": row.get("provider"),
        "status": row.get("status"),
        "created_at": row.get("created_at"),
    }


def disconnect_github(supabase, workspace_id: str) -> None:
    try:
        supabase.rpc(
            "disconnect_github_integration",
            {"p_workspace_id": workspace_id},
        ).execute()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Could not disconnect GitHub: {e}",
        ) from e
