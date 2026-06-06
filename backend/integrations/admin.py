"""Workspace integration admin (GitHub token via Vault)."""

from fastapi import HTTPException

from integrations.github_oauth import exchange_code_for_token, fetch_github_login


def get_github_integration(supabase, workspace_id: str) -> dict | None:
    result = (
        supabase.table("integrations")
        .select("id,workspace_id,provider,status,created_at,provider_metadata")
        .eq("workspace_id", workspace_id)
        .eq("provider", "github")
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def _save_github_token_record(
    supabase,
    workspace_id: str,
    token: str,
    member_id: str,
    *,
    provider_metadata: dict | None = None,
) -> dict:
    token = (token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="GitHub token is required")

    try:
        result = supabase.rpc(
            "set_github_integration",
            {
                "p_workspace_id": workspace_id,
                "p_pat": token,
                "p_member_id": member_id,
            },
        ).execute()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Could not store GitHub token: {e}",
        ) from e

    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Failed to save integration")
    row = rows[0] if isinstance(rows, list) else rows

    if provider_metadata:
        supabase.table("integrations").update(
            {"provider_metadata": provider_metadata},
        ).eq("workspace_id", workspace_id).eq("provider", "github").execute()

    refreshed = get_github_integration(supabase, workspace_id)
    return refreshed or {
        "id": row.get("id"),
        "workspace_id": row.get("workspace_id"),
        "provider": row.get("provider"),
        "status": row.get("status"),
        "created_at": row.get("created_at"),
        "provider_metadata": provider_metadata or {},
    }


def save_github_pat(
    supabase, workspace_id: str, pat: str, member_id: str
) -> dict:
    return _save_github_token_record(
        supabase,
        workspace_id,
        pat,
        member_id,
        provider_metadata={"auth_method": "pat"},
    )


async def complete_github_oauth(
    supabase,
    *,
    workspace_id: str,
    member_id: str,
    code: str,
    redirect_uri: str,
) -> dict:
    code = (code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Authorization code is required")

    token = await exchange_code_for_token(code, redirect_uri)
    login = await fetch_github_login(token)
    return _save_github_token_record(
        supabase,
        workspace_id,
        token,
        member_id,
        provider_metadata={
            "auth_method": "oauth",
            "github_login": login,
        },
    )


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
