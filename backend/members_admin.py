"""Workspace member admin: list, invite, roles, profile."""

import os
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

ADMIN_ROLES = {"owner", "admin"}
INVITE_TTL_DAYS = 7


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def get_member(supabase, member_id: str, workspace_id: str | None = None) -> dict:
    query = supabase.table("members").select("*").eq("id", member_id)
    if workspace_id:
        query = query.eq("workspace_id", workspace_id)
    result = query.limit(1).execute()
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Member not found")
    return rows[0]


def require_workspace_admin(supabase, workspace_id: str, member_id: str) -> dict:
    member = get_member(supabase, member_id, workspace_id)
    if member.get("role") not in ADMIN_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Only workspace owners or admins can manage members",
        )
    return member


def _user_email(supabase, user_id: str) -> str | None:
    try:
        response = supabase.auth.admin.get_user_by_id(user_id)
        user = getattr(response, "user", None) or response
        return getattr(user, "email", None) or (user.get("email") if isinstance(user, dict) else None)
    except Exception:
        return None


def _auth_user_field(user, field: str):
    if isinstance(user, dict):
        return user.get(field)
    return getattr(user, field, None)


def _auth_user_id(user) -> str | None:
    return _auth_user_field(user, "id")


def _find_auth_user_by_email(supabase, email: str):
    target = email.strip().lower()
    page = 1
    while True:
        users = supabase.auth.admin.list_users(page=page, per_page=200)
        if not users:
            return None
        for user in users:
            user_email = _auth_user_field(user, "email")
            if user_email and user_email.strip().lower() == target:
                return user
        if len(users) < 200:
            return None
        page += 1


def _is_workspace_member(supabase, workspace_id: str, user_id: str) -> bool:
    result = (
        supabase.table("members")
        .select("id")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return bool(result.data)


def _remove_orphan_invite_auth_user(
    supabase,
    *,
    email: str,
    workspace_id: str,
    reject_if_member: bool = False,
) -> bool:
    """Delete a Supabase Auth user left over from a prior invite (not in workspace)."""
    user = _find_auth_user_by_email(supabase, email)
    if not user:
        return False

    user_id = _auth_user_id(user)
    if not user_id:
        return False

    if _is_workspace_member(supabase, workspace_id, user_id):
        if reject_if_member:
            raise HTTPException(
                status_code=409,
                detail="This user is already a workspace member",
            )
        return False

    invited_at = _auth_user_field(user, "invited_at")
    email_confirmed_at = _auth_user_field(user, "email_confirmed_at")
    if email_confirmed_at and not invited_at:
        if reject_if_member:
            raise HTTPException(
                status_code=409,
                detail=(
                    "An account with this email already exists. "
                    "Ask them to sign in instead of sending a new invite."
                ),
            )
        return False

    try:
        supabase.auth.admin.delete_user(user_id)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Could not reset invite user: {e}",
        ) from e
    return True


def _send_invite_email(
    supabase,
    *,
    email: str,
    redirect_to: str,
    workspace_id: str,
) -> None:
    try:
        supabase.auth.admin.invite_user_by_email(
            email,
            options={"redirect_to": redirect_to},
        )
    except Exception as e:
        msg = str(e).lower()
        if "already been registered" not in msg and "already registered" not in msg:
            raise HTTPException(
                status_code=500,
                detail=f"Could not send invite email: {e}",
            ) from e

        _remove_orphan_invite_auth_user(
            supabase,
            email=email,
            workspace_id=workspace_id,
            reject_if_member=True,
        )
        try:
            supabase.auth.admin.invite_user_by_email(
                email,
                options={"redirect_to": redirect_to},
            )
        except Exception as retry_error:
            raise HTTPException(
                status_code=500,
                detail=f"Could not send invite email: {retry_error}",
            ) from retry_error


def list_members(supabase, workspace_id: str) -> list[dict]:
    result = (
        supabase.table("members")
        .select("id,workspace_id,user_id,display_name,role,avatar_url,bio,created_at")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=False)
        .execute()
    )
    items: list[dict] = []
    for row in result.data or []:
        email = _user_email(supabase, row["user_id"])
        items.append({**row, "email": email})
    return items


def list_pending_invites(supabase, workspace_id: str) -> list[dict]:
    now = _utcnow().isoformat()
    result = (
        supabase.table("pending_invites")
        .select("id,workspace_id,email,role,invited_by,expires_at,created_at")
        .eq("workspace_id", workspace_id)
        .gt("expires_at", now)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def invite_member(
    supabase,
    *,
    workspace_id: str,
    email: str,
    role: str,
    invited_by: str,
) -> dict:
    require_workspace_admin(supabase, workspace_id, invited_by)

    email = email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email is required")

    if role not in {"owner", "admin", "member"}:
        raise HTTPException(status_code=400, detail="Invalid role")

    actor = get_member(supabase, invited_by, workspace_id)
    if role == "owner" and actor.get("role") != "owner":
        raise HTTPException(
            status_code=403, detail="Only owners can invite with owner role"
        )

    expires_at = (_utcnow() + timedelta(days=INVITE_TTL_DAYS)).isoformat()
    app_url = os.getenv("APP_URL", "http://localhost:3000").rstrip("/")
    redirect_to = f"{app_url}/auth/confirm?next=/auth/join"

    _send_invite_email(
        supabase,
        email=email,
        redirect_to=redirect_to,
        workspace_id=workspace_id,
    )

    row = {
        "workspace_id": workspace_id,
        "email": email,
        "role": role,
        "invited_by": invited_by,
        "expires_at": expires_at,
    }
    result = (
        supabase.table("pending_invites")
        .upsert(row, on_conflict="workspace_id,email")
        .execute()
    )
    invite = (result.data or [{}])[0]
    return invite


def revoke_pending_invite(
    supabase,
    *,
    workspace_id: str,
    invite_id: str,
    actor_member_id: str,
) -> None:
    require_workspace_admin(supabase, workspace_id, actor_member_id)

    result = (
        supabase.table("pending_invites")
        .select("id,email")
        .eq("id", invite_id)
        .eq("workspace_id", workspace_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Invite not found")

    invite_email = rows[0].get("email")

    supabase.table("pending_invites").delete().eq("id", invite_id).eq(
        "workspace_id", workspace_id
    ).execute()

    if invite_email:
        _remove_orphan_invite_auth_user(
            supabase,
            email=invite_email,
            workspace_id=workspace_id,
        )


def update_member_role(
    supabase,
    *,
    workspace_id: str,
    target_member_id: str,
    role: str,
    actor_member_id: str,
) -> dict:
    require_workspace_admin(supabase, workspace_id, actor_member_id)

    if role not in {"owner", "admin", "member"}:
        raise HTTPException(status_code=400, detail="Invalid role")

    actor = get_member(supabase, actor_member_id, workspace_id)
    target = get_member(supabase, target_member_id, workspace_id)

    if role == "owner" and actor.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can assign owner role")

    if target.get("role") == "owner" and actor.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can change owner role")

    if target_member_id == actor_member_id:
        raise HTTPException(status_code=400, detail="Use another admin to change your role")

    result = (
        supabase.table("members")
        .update({"role": role})
        .eq("id", target_member_id)
        .eq("workspace_id", workspace_id)
        .execute()
    )
    return (result.data or [{}])[0]


def remove_member(
    supabase,
    *,
    workspace_id: str,
    target_member_id: str,
    actor_member_id: str,
) -> None:
    require_workspace_admin(supabase, workspace_id, actor_member_id)
    target = get_member(supabase, target_member_id, workspace_id)

    if target.get("role") == "owner":
        owners = (
            supabase.table("members")
            .select("id", count="exact")
            .eq("workspace_id", workspace_id)
            .eq("role", "owner")
            .execute()
        )
        if (owners.count or 0) <= 1:
            raise HTTPException(
                status_code=409, detail="Cannot remove the only workspace owner"
            )

    if target_member_id == actor_member_id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")

    supabase.table("members").delete().eq("id", target_member_id).eq(
        "workspace_id", workspace_id
    ).execute()


def get_profile(supabase, workspace_id: str, user_id: str) -> dict | None:
    result = (
        supabase.table("members")
        .select("id,workspace_id,user_id,display_name,role,avatar_url,bio,created_at")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        return None
    row = rows[0]
    row["email"] = _user_email(supabase, user_id)
    return row


def update_profile(
    supabase,
    *,
    workspace_id: str,
    user_id: str,
    payload: dict,
) -> dict:
    result = (
        supabase.table("members")
        .select("id")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Member not found")

    allowed = {"display_name", "avatar_url", "bio"}
    updates = {k: payload[k] for k in allowed if k in payload}

    if "display_name" in updates:
        name = (updates["display_name"] or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Display name cannot be empty")
        updates["display_name"] = name

    if "bio" in updates and updates["bio"] is not None:
        bio = str(updates["bio"]).strip()
        if len(bio) > 160:
            raise HTTPException(status_code=400, detail="Bio must be 160 characters or less")
        updates["bio"] = bio or None

    if "avatar_url" in updates and updates["avatar_url"]:
        url = str(updates["avatar_url"]).strip()
        if url and not url.startswith(("http://", "https://")):
            raise HTTPException(status_code=400, detail="Avatar URL must be http(s)")
        updates["avatar_url"] = url or None

    if not updates:
        return get_profile(supabase, workspace_id, user_id) or {}

    updated = (
        supabase.table("members")
        .update(updates)
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
    )
    row = (updated.data or [{}])[0]
    row["email"] = _user_email(supabase, user_id)
    return row
