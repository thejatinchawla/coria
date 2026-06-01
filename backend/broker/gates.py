from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from broker.audit import count_recent_tool_calls, write_audit_log
from broker.context import ToolContext
from broker.policies import DEFAULT_RATE_LIMIT_PER_MINUTE, default_policy, load_tool_policy
from workspace_settings import check_tool_budget


@dataclass
class GateResult:
    proceed: bool
    needs_approval: bool = False
    blocked: bool = False
    error: str | None = None
    outcome: str = "allowed"
    gate_failed: str | None = None


def _summarize_tool_call(tool_name: str, tool_input: dict) -> str:
    if tool_name == "github_post_comment":
        repo = tool_input.get("repo", "?")
        issue = tool_input.get("issue_number", "?")
        return f"Post comment on {repo}#{issue}"
    if tool_name == "github_create_pr":
        repo = tool_input.get("repo", "?")
        title = tool_input.get("title", "?")
        return f"Create draft PR on {repo}: {title}"
    return f"Run {tool_name}"


def evaluate_tool_call(
    supabase,
    tool_name: str,
    tool_input: dict,
    ctx: ToolContext,
) -> GateResult:
    """Gates 1 (permission), 3 (rate), 4 (approval). Gate 5 (audit) on every path."""
    policy = load_tool_policy(supabase, ctx.workspace_id, tool_name)
    if policy is None:
        policy = default_policy(tool_name)

    if not policy.get("enabled", True):
        write_audit_log(
            supabase,
            workspace_id=ctx.workspace_id,
            agent_id=ctx.agent_id,
            member_id=ctx.invoker_member_id,
            action_block_id=None,
            tool_name=tool_name,
            tool_input=tool_input,
            outcome="blocked_permission",
            gate_failed="permission",
            metadata={"channel_id": ctx.channel_id},
        )
        return GateResult(
            proceed=False,
            blocked=True,
            error=f"Tool {tool_name} is disabled for this workspace.",
            outcome="blocked_permission",
            gate_failed="permission",
        )

    allowed_tools = set(ctx.agent_allowed_tools or [])
    if allowed_tools and tool_name not in allowed_tools:
        write_audit_log(
            supabase,
            workspace_id=ctx.workspace_id,
            agent_id=ctx.agent_id,
            member_id=ctx.invoker_member_id,
            action_block_id=None,
            tool_name=tool_name,
            tool_input=tool_input,
            outcome="blocked_permission",
            gate_failed="permission",
            metadata={"channel_id": ctx.channel_id},
        )
        return GateResult(
            proceed=False,
            blocked=True,
            error=f"Agent is not allowed to use {tool_name}.",
            outcome="blocked_permission",
            gate_failed="permission",
        )

    budget_error = check_tool_budget(supabase, ctx.workspace_id)
    if budget_error:
        write_audit_log(
            supabase,
            workspace_id=ctx.workspace_id,
            agent_id=ctx.agent_id,
            member_id=ctx.invoker_member_id,
            action_block_id=None,
            tool_name=tool_name,
            tool_input=tool_input,
            outcome="blocked_budget",
            gate_failed="budget",
            metadata={"channel_id": ctx.channel_id},
        )
        return GateResult(
            proceed=False,
            blocked=True,
            error=budget_error,
            outcome="blocked_budget",
            gate_failed="budget",
        )

    rate_limit = policy.get("rate_limit_per_minute") or DEFAULT_RATE_LIMIT_PER_MINUTE
    recent = count_recent_tool_calls(supabase, ctx.agent_id)
    if recent >= rate_limit:
        write_audit_log(
            supabase,
            workspace_id=ctx.workspace_id,
            agent_id=ctx.agent_id,
            member_id=ctx.invoker_member_id,
            action_block_id=None,
            tool_name=tool_name,
            tool_input=tool_input,
            outcome="blocked_rate",
            gate_failed="rate",
            metadata={"channel_id": ctx.channel_id, "recent_count": recent},
        )
        return GateResult(
            proceed=False,
            blocked=True,
            error="Rate limit exceeded for agent tool calls. Try again shortly.",
            outcome="blocked_rate",
            gate_failed="rate",
        )

    requires_approval = bool(policy.get("requires_approval"))
    if requires_approval and not ctx.skip_approval:
        write_audit_log(
            supabase,
            workspace_id=ctx.workspace_id,
            agent_id=ctx.agent_id,
            member_id=ctx.invoker_member_id,
            action_block_id=None,
            tool_name=tool_name,
            tool_input=tool_input,
            outcome="pending_approval",
            gate_failed="approval",
            metadata={"channel_id": ctx.channel_id},
        )
        return GateResult(
            proceed=False,
            needs_approval=True,
            outcome="pending_approval",
            gate_failed="approval",
        )

    write_audit_log(
        supabase,
        workspace_id=ctx.workspace_id,
        agent_id=ctx.agent_id,
        member_id=ctx.invoker_member_id,
        action_block_id=ctx.action_block_id,
        tool_name=tool_name,
        tool_input=tool_input,
        outcome="allowed",
        metadata={"channel_id": ctx.channel_id},
    )
    return GateResult(proceed=True, outcome="allowed")


def create_action_block(
    supabase,
    *,
    workspace_id: str,
    channel_id: str,
    agent_id: str,
    trace_id: str | None,
    tool_name: str,
    tool_input: dict,
    requested_by: str | None,
    thread_id: str | None = None,
    ttl_hours: int = 24,
) -> dict:
    expires_at = (
        datetime.now(timezone.utc) + timedelta(hours=ttl_hours)
    ).isoformat()
    row = {
        "workspace_id": workspace_id,
        "channel_id": channel_id,
        "agent_id": agent_id,
        "trace_id": trace_id,
        "tool_name": tool_name,
        "tool_input": tool_input,
        "summary": _summarize_tool_call(tool_name, tool_input),
        "status": "pending",
        "requested_by": requested_by,
        "expires_at": expires_at,
    }
    if thread_id:
        row["thread_id"] = thread_id
    result = (
        supabase.table("action_blocks")
        .insert(row)
        .execute()
    )
    return result.data[0]
