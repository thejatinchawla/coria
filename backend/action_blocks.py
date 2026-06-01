"""Action block decision + invoke resume."""

from datetime import datetime, timezone

from fastapi import HTTPException

from agent import now_iso, _tool_result_content
from broker import ToolContext
from broker.audit import write_audit_log
from db import get_supabase
from domain import fetch_agent
from invoke_stream import finalize_agent_message, run_llm_loop_streaming
from llm.config import resolve_llm_config
from serialization import deserialize_messages
from streaming import sse_error, sse_event
from tool_runner import ApprovalPaused, run_tool_with_broker
from tools import tools_for_agent


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def fetch_action_block(supabase, action_block_id: str) -> dict:
    result = (
        supabase.table("action_blocks")
        .select("*")
        .eq("id", action_block_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Action block not found")
    return rows[0]


def verify_member(supabase, workspace_id: str, member_id: str) -> None:
    result = (
        supabase.table("members")
        .select("id")
        .eq("id", member_id)
        .eq("workspace_id", workspace_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=403, detail="Not a workspace member")


def _fallback_reply_from_steps(steps: list[dict]) -> str | None:
    """Build a user-facing reply from the last tool result."""
    for step in reversed(steps):
        if step.get("type") != "tool_result":
            continue
        result = step.get("result") or {}
        if not isinstance(result, dict):
            continue
        tool = step.get("tool") or "action"
        if result.get("error"):
            return f"Could not complete {tool}: {result['error']}"

        url = result.get("html_url")
        if tool == "github_create_pr":
            if url:
                label = "Draft PR" if result.get("draft") else "PR"
                num = result.get("number")
                prefix = f"{label} #{num}" if num else label
                return f"Done — {prefix} created: {url}"
            if result.get("number"):
                return f"Done — PR #{result['number']} created."
        if url:
            if tool == "github_post_comment":
                return f"Done — comment posted: {url}"
            return f"Done: {url}"
        if tool == "github_post_comment":
            return "Done — GitHub comment posted successfully."
    return None


def _ensure_reply(reply: str, steps: list[dict]) -> str:
    text = (reply or "").strip()
    if text:
        return text
    fallback = _fallback_reply_from_steps(steps)
    if fallback:
        return fallback
    return "Action completed, but I could not generate a summary. Check the tool result in reasoning trace."


async def decide_action_block(
    action_block_id: str,
    decision: str,
    member_id: str,
):
    if decision not in {"approved", "declined"}:
        raise HTTPException(status_code=400, detail="decision must be approved or declined")

    supabase = get_supabase()
    block = fetch_action_block(supabase, action_block_id)
    verify_member(supabase, block["workspace_id"], member_id)

    if block["status"] != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"Action block already {block['status']}",
        )

    expires_at = block.get("expires_at")
    if expires_at:
        exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if exp < datetime.now(timezone.utc):
            supabase.table("action_blocks").update({"status": "expired"}).eq(
                "id", action_block_id
            ).execute()
            raise HTTPException(status_code=410, detail="Action block expired")

    new_status = "approved" if decision == "approved" else "declined"
    supabase.table("action_blocks").update(
        {
            "status": new_status,
            "decided_by": member_id,
            "decided_at": _utcnow_iso(),
        }
    ).eq("id", action_block_id).execute()

    write_audit_log(
        supabase,
        workspace_id=block["workspace_id"],
        agent_id=block["agent_id"],
        member_id=member_id,
        action_block_id=action_block_id,
        tool_name=block["tool_name"],
        tool_input=block.get("tool_input") or {},
        outcome=decision,
        metadata={"channel_id": block["channel_id"]},
    )

    trace_id = block.get("trace_id")
    if not trace_id:
        raise HTTPException(status_code=500, detail="Action block missing trace")

    trace_result = (
        supabase.table("reasoning_traces")
        .select("id,status,steps,conversation_state")
        .eq("id", trace_id)
        .limit(1)
        .execute()
    )
    trace_rows = trace_result.data or []
    if not trace_rows:
        raise HTTPException(status_code=404, detail="Reasoning trace not found")

    trace = trace_rows[0]
    state = trace.get("conversation_state") or {}
    steps = list(trace.get("steps") or [])

    steps.append(
        {
            "type": "approval_decision",
            "decision": decision,
            "timestamp": now_iso(),
        }
    )

    if decision == "declined":
        pending = state.get("pending_tool") or {}
        tool_name = pending.get("name") or block["tool_name"]
        tool_call_id = pending.get("tool_call_id") or f"declined_{action_block_id}"
        working = deserialize_messages(state.get("working") or [])

        working.append(
            {
                "role": "tool",
                "tool_call_id": tool_call_id,
                "content": _tool_result_content(
                    {"error": "User declined this action."}
                ),
            }
        )
        steps.append(
            {
                "type": "tool_result",
                "tool": tool_name,
                "result": {"error": "User declined this action."},
                "timestamp": now_iso(),
            }
        )
        state["working"] = working
        state["steps"] = steps

        supabase.table("reasoning_traces").update(
            {
                "status": "running",
                "steps": steps,
                "conversation_state": state,
            }
        ).eq("id", trace_id).execute()

        async for event in _continue_from_state(supabase, state, trace_id, block):
            yield event
        return

    # approved — execute tool then continue loop
    pending = state.get("pending_tool") or {}
    tool_name = pending.get("name") or block["tool_name"]
    tool_input = pending.get("args") or block.get("tool_input") or {}
    tool_call_id = pending.get("tool_call_id") or f"approved_{action_block_id}"

    ctx = ToolContext(
        workspace_id=block["workspace_id"],
        channel_id=block["channel_id"],
        agent_id=block["agent_id"],
        agent_allowed_tools=state.get("agent_allowed_tools") or [],
        invoker_member_id=member_id,
        thread_id=state.get("thread_id") or block.get("thread_id"),
        action_block_id=action_block_id,
        skip_approval=True,
    )

    try:
        result = await run_tool_with_broker(
            supabase,
            name=tool_name,
            args=tool_input,
            tool_call_id=tool_call_id,
            ctx=ctx,
            trace_id=trace_id,
        )
    except ApprovalPaused:
        yield sse_error("Unexpected re-approval during resume")
        return

    steps.append(
        {
            "type": "tool_result",
            "tool": tool_name,
            "result": result,
            "timestamp": now_iso(),
        }
    )

    working = deserialize_messages(state.get("working") or [])
    working.append(
        {
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": _tool_result_content(result),
        }
    )

    supabase.table("action_blocks").update({"status": "executed"}).eq(
        "id", action_block_id
    ).execute()

    state["working"] = working
    state["steps"] = steps
    supabase.table("reasoning_traces").update(
        {
            "status": "running",
            "steps": steps,
            "conversation_state": state,
        }
    ).eq("id", trace_id).execute()

    async for event in _continue_from_state(supabase, state, trace_id, block):
        yield event


async def _continue_from_state(
    supabase, state: dict, trace_id: str, block: dict
):
    working = deserialize_messages(state.get("working") or [])
    steps = list(state.get("steps") or [])
    system_prompt = state.get("system_prompt") or ""
    agent_id = state.get("agent_id") or block["agent_id"]
    channel_id = state.get("channel_id") or block["channel_id"]
    agent_name = state.get("agent_name") or "Agent"
    workspace_id = state.get("workspace_id") or block["workspace_id"]
    thread_id = state.get("thread_id") or block.get("thread_id")

    agent = fetch_agent(supabase, agent_id)
    tool_defs = tools_for_agent(agent)
    ctx = ToolContext(
        workspace_id=workspace_id,
        channel_id=channel_id,
        agent_id=agent_id,
        agent_allowed_tools=agent.get("allowed_tools") or [],
        invoker_member_id=state.get("invoker_member_id"),
        thread_id=thread_id,
    )

    reply = ""
    trace_status = "done"

    llm = resolve_llm_config(supabase, workspace_id)

    try:
        async for event in run_llm_loop_streaming(
            llm,
            [],
            system_prompt,
            tool_defs,
            working=working,
            steps=steps,
            supabase=supabase,
            ctx=ctx,
            trace_id=trace_id,
            allow_tools=False,
        ):
            if event.get("type") == "_result":
                reply = event.get("reply") or ""
                steps = event.get("steps") or steps
            elif event.get("type") == "_approval_paused":
                paused = event["paused"]
                block = paused.action_block
                steps = event.get("steps") or steps
                steps.append(
                    {
                        "type": "approval_requested",
                        "action_block_id": block["id"],
                        "tool": paused.tool_name,
                        "input": paused.tool_input,
                        "timestamp": now_iso(),
                    }
                )
                state["working"] = event.get("working") or working
                state["steps"] = steps
                state["pending_tool"] = event.get("pending_tool")
                supabase.table("reasoning_traces").update(
                    {
                        "status": "awaiting_approval",
                        "steps": steps,
                        "conversation_state": state,
                    }
                ).eq("id", trace_id).execute()
                yield sse_event(
                    {
                        "type": "action_block",
                        "action_block": block,
                        "trace_id": trace_id,
                    }
                )
                yield sse_event({"type": "awaiting_approval"})
                return
            else:
                yield sse_event(event)
    except Exception as e:
        print(f"[error] resume loop failed: {e}", flush=True)
        import traceback

        traceback.print_exc()
        fallback = _fallback_reply_from_steps(steps)
        reply = fallback or (
            "Sorry — I hit an error trying to respond. Please try again."
        )
        trace_status = "done" if fallback else "failed"
        if not fallback:
            yield sse_event({"type": "error", "message": reply})

    reply = _ensure_reply(reply, steps)

    steps = steps + [
        {"type": "reply", "content": reply, "timestamp": now_iso()}
    ]
    supabase.table("reasoning_traces").update(
        {"status": trace_status, "steps": steps, "conversation_state": None}
    ).eq("id", trace_id).execute()

    message = await finalize_agent_message(
        supabase,
        channel_id=channel_id,
        agent_id=agent_id,
        agent_name=agent_name,
        reply=reply,
        trace_id=trace_id,
        workspace_id=workspace_id,
        thread_id=thread_id,
    )

    yield sse_event(
        {
            "type": "done",
            "message": message,
            "trace_id": trace_id,
        }
    )
