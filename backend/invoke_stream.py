"""SSE streaming invoke with broker + approval pause/resume."""

import json
import os
import traceback
from collections.abc import AsyncIterator
from typing import Any

from fastapi import HTTPException
from groq import AsyncGroq, BadRequestError

from agent import (
    MAX_AGENT_ITERATIONS,
    _parse_groq_tool_use_failed,
    _run_groq_tool,
    agent_system_prompt,
    build_system_prompt,
    now_iso,
    run_anthropic_loop,
)
from broker import ToolContext
from domain import fetch_agent, fetch_channel, validate_invoke_scope
from llm.config import resolve_llm_config
from memory.context import build_cron_digest_context, build_retrieval_context
from memory.embed import embed_message_row
from serialization import serialize_messages
from streaming import sse_error, sse_event
from tool_runner import ApprovalPaused
from tools import tools_for_agent

from db import get_supabase


def _last_role(messages: list[dict]) -> str | None:
    for msg in reversed(messages):
        role = msg.get("role")
        if role:
            return role
    return None


async def finalize_agent_message(
    supabase,
    *,
    channel_id: str,
    agent_id: str | None,
    agent_name: str,
    reply: str,
    trace_id: str | None,
    workspace_id: str,
    thread_id: str | None = None,
) -> dict:
    row: dict = {
        "channel_id": channel_id,
        "sender_id": agent_id,
        "sender_name": agent_name,
        "sender_type": "agent",
        "content": reply,
        "reasoning_trace_id": trace_id,
    }
    if thread_id:
        row["thread_id"] = thread_id
        row["parent_message_id"] = thread_id
    msg_result = (
        supabase.table("messages")
        .insert(row)
        .execute()
    )
    message = (msg_result.data or [{}])[0]
    if message.get("id"):
        try:
            embed_message_row(supabase, message, workspace_id)
        except Exception as e:
            print(f"[memory] agent reply embed failed: {e}", flush=True)
    return message


async def run_groq_loop_streaming(
    messages: list[dict],
    system_prompt: str,
    tool_defs: list[dict],
    *,
    working: list[dict] | None = None,
    steps: list[dict] | None = None,
    supabase=None,
    ctx: ToolContext | None = None,
    trace_id: str | None = None,
    allow_tools: bool = True,
    model: str | None = None,
    api_key: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Yield status/token events; final event is internal {'type':'_result', ...}."""
    model = model or os.getenv("LLM_MODEL")
    if not model:
        raise RuntimeError("LLM_MODEL must be set")

    client = AsyncGroq(api_key=api_key) if api_key else AsyncGroq()
    loop_steps: list[dict] = list(steps or [])
    loop_working = (
        list(working)
        if working is not None
        else [{"role": "system", "content": system_prompt}]
        + serialize_messages(messages)
    )
    active_tools = tool_defs if allow_tools and tool_defs else []

    for _ in range(MAX_AGENT_ITERATIONS):
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": loop_working,
            "max_tokens": 1024,
            "stream": True,
        }
        if active_tools:
            kwargs["tools"] = active_tools
            kwargs["tool_choice"] = "auto"

        content_buf: list[str] = []
        tool_calls_acc: dict[int, dict] = {}

        try:
            stream = await client.chat.completions.create(**kwargs)
        except BadRequestError as e:
            recovered = _parse_groq_tool_use_failed(e)
            if recovered is None:
                # After a tool result is in context, retry once without tools.
                if active_tools and _last_role(loop_working) == "tool":
                    active_tools = []
                    continue
                raise
            name, args = recovered
            yield {"type": "status", "message": f"Using {name}…"}
            try:
                await _run_groq_tool(
                    name,
                    args,
                    f"recovered_{len(loop_steps)}",
                    loop_working,
                    loop_steps,
                    supabase=supabase,
                    ctx=ctx,
                    trace_id=trace_id,
                )
            except ApprovalPaused as paused:
                yield {
                    "type": "_approval_paused",
                    "paused": paused,
                    "working": loop_working,
                    "steps": loop_steps,
                }
                return
            continue

        async for chunk in stream:
            if not chunk.choices:
                continue
            choice = chunk.choices[0]
            delta = choice.delta
            if delta.content:
                content_buf.append(delta.content)

            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index or 0
                    if idx not in tool_calls_acc:
                        tool_calls_acc[idx] = {
                            "id": "",
                            "name": "",
                            "arguments": "",
                        }
                    if tc.id:
                        tool_calls_acc[idx]["id"] = tc.id
                    if tc.function:
                        if tc.function.name:
                            tool_calls_acc[idx]["name"] = tc.function.name
                        if tc.function.arguments:
                            tool_calls_acc[idx]["arguments"] += tc.function.arguments

        if tool_calls_acc:
            for _idx in sorted(tool_calls_acc.keys()):
                tc = tool_calls_acc[_idx]
                name = tc["name"]
                try:
                    args = json.loads(tc["arguments"] or "{}")
                except json.JSONDecodeError:
                    args = {}
                tool_call_id = tc["id"] or f"stream_{len(loop_steps)}"
                yield {"type": "status", "message": f"Using {name}…"}
                try:
                    await _run_groq_tool(
                        name,
                        args,
                        tool_call_id,
                        loop_working,
                        loop_steps,
                        supabase=supabase,
                        ctx=ctx,
                        trace_id=trace_id,
                    )
                except ApprovalPaused as paused:
                    yield {
                        "type": "_approval_paused",
                        "paused": paused,
                        "working": loop_working,
                        "steps": loop_steps,
                        "pending_tool": {
                            "name": name,
                            "args": args,
                            "tool_call_id": tool_call_id,
                        },
                    }
                    return
            continue

        reply = "".join(content_buf)
        for piece in content_buf:
            yield {"type": "token", "content": piece}
        yield {"type": "_result", "reply": reply, "steps": loop_steps}
        return

    yield {
        "type": "_result",
        "reply": "I got stuck in a loop, sorry.",
        "steps": loop_steps,
    }


async def run_llm_loop_streaming(
    llm,
    messages: list[dict],
    system_prompt: str,
    tool_defs: list[dict],
    **kwargs,
) -> AsyncIterator[dict[str, Any]]:
    """Dispatch streaming invoke to Groq or Anthropic using resolved workspace config."""
    if llm.provider == "groq":
        async for event in run_groq_loop_streaming(
            messages,
            system_prompt,
            tool_defs,
            model=llm.model,
            api_key=llm.api_key,
            **kwargs,
        ):
            yield event
        return

    if llm.provider == "anthropic":
        yield {"type": "status", "message": "Generating reply…"}
        reply, tool_steps = await run_anthropic_loop(
            messages,
            kwargs.get("trace_id"),
            system_prompt,
            tool_defs,
            model=llm.model,
            api_key=llm.api_key,
        )
        if reply:
            yield {"type": "token", "content": reply}
        yield {"type": "_result", "reply": reply, "steps": tool_steps}
        return

    raise RuntimeError(f"Unknown LLM provider: {llm.provider}")


async def _persist_approval_pause(
    supabase,
    *,
    paused: ApprovalPaused,
    working: list[dict],
    steps: list[dict],
    pending_tool: dict,
    trace_id: str | None,
    state: dict,
) -> dict:
    action_block = paused.action_block
    block_id = action_block["id"]

    steps.append(
        {
            "type": "approval_requested",
            "action_block_id": block_id,
            "tool": paused.tool_name,
            "input": paused.tool_input,
            "timestamp": now_iso(),
        }
    )

    conversation_state = {
        **state,
        "working": working,
        "steps": steps,
        "pending_tool": pending_tool,
    }

    if trace_id:
        supabase.table("reasoning_traces").update(
            {
                "status": "awaiting_approval",
                "steps": steps,
                "conversation_state": conversation_state,
            }
        ).eq("id", trace_id).execute()

    return action_block


async def invoke_agent_stream(
    user_message: str,
    channel_id: str,
    agent_id: str,
    invoker_member_id: str | None = None,
    thread_id: str | None = None,
    *,
    trigger_type: str | None = None,
) -> AsyncIterator[str]:
    trace_id: str | None = None
    supabase = None
    agent_name = "Agent"
    agent_db_id: str | None = None

    try:
        supabase = get_supabase()
        channel = fetch_channel(supabase, channel_id)
        agent = fetch_agent(supabase, agent_id)
        validate_invoke_scope(supabase, agent, channel)
        agent_name = agent.get("name") or "Agent"
        agent_db_id = agent.get("id")
        tool_defs = tools_for_agent(agent)

        ctx = ToolContext(
            workspace_id=channel["workspace_id"],
            channel_id=channel_id,
            agent_id=agent_id,
            agent_allowed_tools=agent.get("allowed_tools") or [],
            invoker_member_id=invoker_member_id,
            thread_id=thread_id,
        )

        base_state = {
            "provider": None,
            "llm_model": None,
            "system_prompt": "",
            "channel_id": channel_id,
            "agent_id": agent_id,
            "agent_name": agent_name,
            "workspace_id": channel["workspace_id"],
            "invoker_member_id": invoker_member_id,
            "user_message": user_message,
            "thread_id": thread_id,
            "agent_allowed_tools": agent.get("allowed_tools") or [],
        }

        yield sse_event({"type": "status", "message": f"{agent_name} is thinking…"})

        try:
            trace_result = (
                supabase.table("reasoning_traces")
                .insert({"status": "running", "steps": []})
                .execute()
            )
            trace_id = trace_result.data[0]["id"]
            yield sse_event({"type": "started", "trace_id": trace_id})
        except Exception as e:
            print(f"[error] failed to create reasoning trace: {e}", flush=True)

        yield sse_event({"type": "status", "message": "Retrieving memory…"})
        if trigger_type == "cron":
            retrieval = build_cron_digest_context(
                supabase,
                channel_id=channel_id,
                user_message=user_message,
            )
        else:
            retrieval = build_retrieval_context(
                supabase,
                channel_id=channel_id,
                workspace_id=channel["workspace_id"],
                user_message=user_message,
                thread_id=thread_id,
                use_workspace_memory=bool(agent.get("use_workspace_memory")),
            )
        system_prompt = build_system_prompt(
            base_prompt=agent_system_prompt(agent),
            thread_messages=retrieval["thread_messages"],
            memory_chunks=retrieval["channel_chunks"],
            workspace_chunks=retrieval["workspace_chunks"],
            recent_messages=retrieval["recent_messages"],
            digest_mode=bool(retrieval.get("digest_mode")),
        )
        base_state["system_prompt"] = system_prompt

        llm = resolve_llm_config(supabase, channel["workspace_id"])
        base_state["provider"] = llm.provider
        base_state["llm_model"] = llm.model

        messages = serialize_messages(
            [{"role": "user", "content": user_message}]
        )

        reply = ""
        tool_steps: list[dict] = []
        trace_status = "done"

        try:
            async for event in run_llm_loop_streaming(
                llm,
                messages,
                system_prompt,
                tool_defs,
                supabase=supabase,
                ctx=ctx,
                trace_id=trace_id,
            ):
                if event.get("type") == "_approval_paused":
                    paused = event["paused"]
                    action_block = await _persist_approval_pause(
                        supabase,
                        paused=paused,
                        working=event["working"],
                        steps=event["steps"],
                        pending_tool=event["pending_tool"],
                        trace_id=trace_id,
                        state=base_state,
                    )
                    yield sse_event(
                        {
                            "type": "action_block",
                            "action_block": action_block,
                            "trace_id": trace_id,
                        }
                    )
                    yield sse_event({"type": "awaiting_approval"})
                    return
                if event.get("type") == "_result":
                    reply = event.get("reply") or ""
                    tool_steps = event.get("steps") or []
                else:
                    yield sse_event(event)
        except Exception as e:
            print(f"[error] LLM stream failed: {e}", flush=True)
            traceback.print_exc()
            reply = "Sorry — I hit an error trying to respond. Please try again."
            tool_steps = []
            trace_status = "failed"
            yield sse_event({"type": "error", "message": reply})

        steps = tool_steps + [
            {"type": "reply", "content": reply, "timestamp": now_iso()}
        ]
        if trace_id is not None:
            try:
                supabase.table("reasoning_traces").update(
                    {"status": trace_status, "steps": steps}
                ).eq("id", trace_id).execute()
            except Exception as e:
                print(f"[error] failed to update reasoning trace: {e}", flush=True)

        message = await finalize_agent_message(
            supabase,
            channel_id=channel_id,
            agent_id=agent_db_id,
            agent_name=agent_name,
            reply=reply,
            trace_id=trace_id,
            workspace_id=channel["workspace_id"],
            thread_id=thread_id,
        )

        yield sse_event(
            {
                "type": "done",
                "message": message,
                "trace_id": trace_id,
            }
        )

    except HTTPException as e:
        yield sse_error(str(e.detail))
        return
    except Exception as e:
        print(
            "[error] invoke_agent_stream crashed:\n" + traceback.format_exc(),
            flush=True,
        )
        err_msg = "Sorry — I hit an error trying to respond."
        if supabase is not None:
            if trace_id is not None:
                try:
                    supabase.table("reasoning_traces").update(
                        {
                            "status": "failed",
                            "steps": [
                                {
                                    "type": "reply",
                                    "content": err_msg,
                                    "timestamp": now_iso(),
                                }
                            ],
                        }
                    ).eq("id", trace_id).execute()
                except Exception:
                    pass
            try:
                supabase.table("messages").insert(
                    {
                        "channel_id": channel_id,
                        "sender_id": agent_db_id,
                        "sender_name": agent_name,
                        "sender_type": "agent",
                        "content": err_msg,
                        "reasoning_trace_id": trace_id,
                    }
                ).execute()
            except Exception:
                pass
        yield sse_error(str(e) if os.getenv("DEBUG") else err_msg)
