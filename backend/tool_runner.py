"""Broker-aware tool execution for agent loops."""

from broker import ToolContext, evaluate_tool_call
from broker.audit import write_audit_log
from broker.gates import create_action_block
from workspace_settings import increment_tool_budget_used
from tools import TOOL_REGISTRY


class ApprovalPaused(Exception):
    """Raised when gate 4 requires human approval before tool runs."""

    def __init__(
        self,
        action_block: dict,
        tool_name: str,
        tool_input: dict,
        tool_call_id: str,
    ):
        self.action_block = action_block
        self.tool_name = tool_name
        self.tool_input = tool_input
        self.tool_call_id = tool_call_id
        super().__init__(f"Approval required for {tool_name}")


async def run_tool_with_broker(
    supabase,
    *,
    name: str,
    args: dict,
    tool_call_id: str,
    ctx: ToolContext,
    trace_id: str | None,
) -> dict:
    gate = evaluate_tool_call(supabase, name, args, ctx)

    if gate.blocked:
        return {"error": gate.error or "Tool call blocked"}

    if gate.needs_approval:
        block = create_action_block(
            supabase,
            workspace_id=ctx.workspace_id,
            channel_id=ctx.channel_id,
            agent_id=ctx.agent_id,
            trace_id=trace_id,
            tool_name=name,
            tool_input=args,
            requested_by=ctx.invoker_member_id,
            thread_id=ctx.thread_id,
        )
        raise ApprovalPaused(
            action_block=block,
            tool_name=name,
            tool_input=args,
            tool_call_id=tool_call_id,
        )

    tool_fn = TOOL_REGISTRY.get(name)
    if tool_fn is None:
        result = {"error": f"unknown tool: {name}"}
        outcome = "failed"
    else:
        try:
            if name in {
                "workspace_search",
                "github_read",
                "github_post_comment",
                "github_create_pr",
            }:
                result = await tool_fn(args, supabase=supabase, ctx=ctx)
            else:
                result = await tool_fn(args)
            outcome = "failed" if isinstance(result, dict) and result.get("error") else "executed"
        except Exception as e:
            result = {"error": str(e)}
            outcome = "failed"

    write_audit_log(
        supabase,
        workspace_id=ctx.workspace_id,
        agent_id=ctx.agent_id,
        member_id=ctx.invoker_member_id,
        action_block_id=ctx.action_block_id,
        tool_name=name,
        tool_input=args,
        outcome=outcome,
        metadata={"channel_id": ctx.channel_id},
    )
    if outcome == "executed":
        increment_tool_budget_used(supabase, ctx.workspace_id)
    return result
