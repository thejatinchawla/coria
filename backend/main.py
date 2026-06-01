import os

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from action_blocks import decide_action_block
from agent import invoke_agent
from agents_admin import (
    create_agent,
    get_agent,
    list_agents,
    patch_workspace_settings,
    update_agent,
)
from audit_admin import export_audit_log, list_audit_log
from db import get_supabase
from integrations.admin import (
    disconnect_github,
    get_github_integration,
    save_github_pat,
)
from members_admin import (
    get_profile,
    invite_member,
    list_members,
    list_pending_invites,
    remove_member,
    require_workspace_admin,
    revoke_pending_invite,
    update_member_role,
    update_profile,
)
from invoke_stream import invoke_agent_stream
from memory.embed import backfill_channel_memory, embed_message_by_id
from triggers.admin import (
    create_trigger,
    delete_trigger,
    list_triggers,
    update_trigger,
)
from triggers.runner import handle_keyword_message, run_due_cron_triggers, run_trigger

load_dotenv()


def validate_env() -> None:
    """Fail fast at startup if required configuration is missing, rather than
    surfacing a confusing error on the first request."""
    provider = os.getenv("LLM_PROVIDER", "")
    required = {
        "SUPABASE_URL": os.getenv("SUPABASE_URL"),
        "SUPABASE_SERVICE_KEY": os.getenv("SUPABASE_SERVICE_KEY"),
        "LLM_PROVIDER": provider,
        "LLM_MODEL": os.getenv("LLM_MODEL"),
    }
    if provider == "anthropic":
        required["ANTHROPIC_API_KEY"] = os.getenv("ANTHROPIC_API_KEY")
    elif provider == "groq":
        required["GROQ_API_KEY"] = os.getenv("GROQ_API_KEY")

    missing = [
        name for name, value in required.items() if not value or not value.strip()
    ]
    if missing:
        raise RuntimeError(
            "Missing required environment variables: " + ", ".join(missing)
        )


def cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "http://localhost:3000")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


validate_env()

app = FastAPI(title="Coria Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

INVOKE_SECRET = os.getenv("INVOKE_SECRET", "").strip()


class InvokeRequest(BaseModel):
    user_message: str
    channel_id: str
    agent_id: str
    invoker_member_id: str | None = None
    thread_id: str | None = None


class DecideRequest(BaseModel):
    decision: str
    member_id: str


class EmbedMessageRequest(BaseModel):
    message_id: str


class BackfillChannelRequest(BaseModel):
    channel_id: str


class AgentCreateRequest(BaseModel):
    workspace_id: str
    name: str
    mention_slug: str
    system_prompt: str
    allowed_tools: list[str] | None = None
    status: str | None = "active"
    color: str | None = None
    use_workspace_memory: bool | None = None
    model: str | None = None


class AgentUpdateRequest(BaseModel):
    name: str | None = None
    mention_slug: str | None = None
    system_prompt: str | None = None
    allowed_tools: list[str] | None = None
    status: str | None = None
    color: str | None = None
    use_workspace_memory: bool | None = None
    model: str | None = None


class WorkspaceSettingsPatchRequest(BaseModel):
    agents_globally_paused: bool | None = None
    monthly_tool_budget: int | None = None
    tool_budget_used: int | None = None
    default_agent_id: str | None = None


class GitHubIntegrationRequest(BaseModel):
    workspace_id: str
    pat: str
    member_id: str


class TriggerCreateRequest(BaseModel):
    workspace_id: str
    agent_id: str
    channel_id: str
    type: str
    config: dict
    enabled: bool | None = True


class TriggerUpdateRequest(BaseModel):
    agent_id: str | None = None
    channel_id: str | None = None
    type: str | None = None
    config: dict | None = None
    enabled: bool | None = None


class TriggerRunRequest(BaseModel):
    trigger_id: str


class KeywordTriggerRequest(BaseModel):
    workspace_id: str
    channel_id: str
    content: str


class MemberInviteRequest(BaseModel):
    workspace_id: str
    email: str
    role: str
    invited_by: str


class MemberRoleUpdateRequest(BaseModel):
    role: str
    actor_member_id: str


class ProfileUpdateRequest(BaseModel):
    workspace_id: str
    user_id: str
    display_name: str | None = None
    avatar_url: str | None = None
    bio: str | None = None


def verify_invoke_secret(x_invoke_secret: str | None) -> None:
    if not INVOKE_SECRET:
        return
    if x_invoke_secret != INVOKE_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
async def health():
    """Liveness plus a trivial DB round-trip, so a misconfigured Supabase env
    surfaces here instead of on the first /invoke."""
    try:
        supabase = get_supabase()
        supabase.table("messages").select("id").limit(1).execute()
        return {"status": "ok", "db": "ok"}
    except Exception as e:
        return {"status": "degraded", "db": "error", "detail": str(e)}


@app.post("/invoke")
async def invoke(
    req: InvokeRequest,
    background_tasks: BackgroundTasks,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    background_tasks.add_task(
        invoke_agent,
        req.user_message,
        req.channel_id,
        req.agent_id,
    )
    return {"status": "accepted"}


@app.post("/invoke/stream")
async def invoke_stream(
    req: InvokeRequest,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    return StreamingResponse(
        invoke_agent_stream(
            req.user_message,
            req.channel_id,
            req.agent_id,
            req.invoker_member_id,
            req.thread_id,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/action-blocks/{action_block_id}/decide")
async def action_block_decide(
    action_block_id: str,
    req: DecideRequest,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    return StreamingResponse(
        decide_action_block(
            action_block_id,
            req.decision,
            req.member_id,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/action-blocks/pending")
async def action_blocks_pending(
    workspace_id: str,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    result = (
        supabase.table("action_blocks")
        .select("*")
        .eq("workspace_id", workspace_id)
        .eq("status", "pending")
        .order("created_at", desc=True)
        .execute()
    )
    return {"items": result.data or []}


@app.get("/agents")
async def agents_list(
    workspace_id: str,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    return {"items": list_agents(supabase, workspace_id)}


@app.post("/agents")
async def agents_create(
    req: AgentCreateRequest,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    agent = create_agent(
        supabase,
        req.workspace_id,
        req.model_dump(exclude={"workspace_id"}),
    )
    return {"agent": agent}


@app.get("/agents/{agent_id}")
async def agents_get(
    agent_id: str,
    workspace_id: str,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    return {"agent": get_agent(supabase, agent_id, workspace_id)}


@app.patch("/agents/{agent_id}")
async def agents_patch(
    agent_id: str,
    req: AgentUpdateRequest,
    workspace_id: str,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    payload = req.model_dump(exclude_none=True)
    agent = update_agent(supabase, agent_id, workspace_id, payload)
    return {"agent": agent}


@app.get("/workspace-settings")
async def workspace_settings_get(
    workspace_id: str,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    from workspace_settings import fetch_workspace_settings

    supabase = get_supabase()
    return {"settings": fetch_workspace_settings(supabase, workspace_id)}


@app.patch("/workspace-settings")
async def workspace_settings_patch(
    req: WorkspaceSettingsPatchRequest,
    workspace_id: str,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    settings = patch_workspace_settings(
        supabase,
        workspace_id,
        req.model_dump(exclude_none=True),
    )
    return {"settings": settings}


@app.get("/integrations/github")
async def github_integration_get(
    workspace_id: str,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    integration = get_github_integration(supabase, workspace_id)
    return {"integration": integration}


@app.post("/integrations/github")
async def github_integration_save(
    req: GitHubIntegrationRequest,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    integration = save_github_pat(
        supabase, req.workspace_id, req.pat, req.member_id
    )
    return {"integration": integration}


@app.delete("/integrations/github")
async def github_integration_delete(
    workspace_id: str,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    disconnect_github(supabase, workspace_id)
    return {"status": "disconnected"}


@app.get("/triggers")
async def triggers_list(
    workspace_id: str,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    return {"items": list_triggers(supabase, workspace_id)}


@app.post("/triggers")
async def triggers_create(
    req: TriggerCreateRequest,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    trigger = create_trigger(
        supabase,
        req.workspace_id,
        req.model_dump(exclude={"workspace_id"}),
    )
    return {"trigger": trigger}


@app.patch("/triggers/{trigger_id}")
async def triggers_patch(
    trigger_id: str,
    req: TriggerUpdateRequest,
    workspace_id: str,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    trigger = update_trigger(
        supabase,
        trigger_id,
        workspace_id,
        req.model_dump(exclude_none=True),
    )
    return {"trigger": trigger}


@app.delete("/triggers/{trigger_id}")
async def triggers_delete(
    trigger_id: str,
    workspace_id: str,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    delete_trigger(supabase, trigger_id, workspace_id)
    return {"status": "deleted"}


@app.post("/triggers/run")
async def triggers_run(
    req: TriggerRunRequest,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    outcome = await run_trigger(supabase, req.trigger_id)
    return outcome


@app.post("/triggers/run-cron")
async def triggers_run_cron(
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    items = await run_due_cron_triggers(supabase)
    return {"items": items}


async def _keyword_trigger_task(
    workspace_id: str, channel_id: str, content: str
) -> None:
    try:
        supabase = get_supabase()
        await handle_keyword_message(
            supabase,
            workspace_id=workspace_id,
            channel_id=channel_id,
            content=content,
        )
    except Exception as e:
        print(f"[trigger] keyword task failed: {e}", flush=True)


@app.post("/triggers/keyword")
async def triggers_keyword(
    req: KeywordTriggerRequest,
    background_tasks: BackgroundTasks,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    background_tasks.add_task(
        _keyword_trigger_task,
        req.workspace_id,
        req.channel_id,
        req.content,
    )
    return {"status": "accepted"}


@app.get("/members/me")
async def members_me(
    workspace_id: str,
    user_id: str,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    profile = get_profile(supabase, workspace_id, user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"profile": profile}


@app.patch("/members/me")
async def members_me_patch(
    req: ProfileUpdateRequest,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    profile = update_profile(
        supabase,
        workspace_id=req.workspace_id,
        user_id=req.user_id,
        payload=req.model_dump(exclude={"workspace_id", "user_id"}, exclude_none=True),
    )
    return {"profile": profile}


@app.get("/members")
async def members_list(
    workspace_id: str,
    member_id: str,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    require_workspace_admin(supabase, workspace_id, member_id)
    members = list_members(supabase, workspace_id)
    invites = list_pending_invites(supabase, workspace_id)
    return {"members": members, "pending_invites": invites}


@app.post("/members/invite")
async def members_invite(
    req: MemberInviteRequest,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    invite = invite_member(
        supabase,
        workspace_id=req.workspace_id,
        email=req.email,
        role=req.role,
        invited_by=req.invited_by,
    )
    return {"invite": invite}


@app.delete("/members/invites/{invite_id}")
async def members_revoke_invite(
    invite_id: str,
    workspace_id: str,
    member_id: str,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    revoke_pending_invite(
        supabase,
        workspace_id=workspace_id,
        invite_id=invite_id,
        actor_member_id=member_id,
    )
    return {"status": "revoked"}


@app.patch("/members/{target_member_id}")
async def members_patch_role(
    target_member_id: str,
    req: MemberRoleUpdateRequest,
    workspace_id: str,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    member = update_member_role(
        supabase,
        workspace_id=workspace_id,
        target_member_id=target_member_id,
        role=req.role,
        actor_member_id=req.actor_member_id,
    )
    return {"member": member}


@app.delete("/members/{target_member_id}")
async def members_remove(
    target_member_id: str,
    workspace_id: str,
    actor_member_id: str,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    remove_member(
        supabase,
        workspace_id=workspace_id,
        target_member_id=target_member_id,
        actor_member_id=actor_member_id,
    )
    return {"status": "removed"}


@app.get("/audit")
async def audit_list(
    workspace_id: str,
    member_id: str,
    agent_id: str | None = None,
    tool_name: str | None = None,
    outcome: str | None = None,
    since: str | None = None,
    until: str | None = None,
    limit: int = 50,
    offset: int = 0,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    require_workspace_admin(supabase, workspace_id, member_id)
    return list_audit_log(
        supabase,
        workspace_id,
        agent_id=agent_id,
        tool_name=tool_name,
        outcome=outcome,
        since=since,
        until=until,
        limit=limit,
        offset=offset,
    )


@app.get("/audit/export")
async def audit_export(
    workspace_id: str,
    member_id: str,
    days: int = 30,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    supabase = get_supabase()
    require_workspace_admin(supabase, workspace_id, member_id)
    items = export_audit_log(supabase, workspace_id, days=days)
    return {"items": items, "days": days}


@app.post("/memory/embed")
async def memory_embed(
    req: EmbedMessageRequest,
    background_tasks: BackgroundTasks,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    background_tasks.add_task(embed_message_by_id, req.message_id)
    return {"status": "accepted"}


@app.post("/memory/backfill")
async def memory_backfill(
    req: BackfillChannelRequest,
    background_tasks: BackgroundTasks,
    x_invoke_secret: str | None = Header(default=None),
):
    verify_invoke_secret(x_invoke_secret)
    background_tasks.add_task(backfill_channel_memory, req.channel_id)
    return {"status": "accepted"}
