"""SSE streaming invoke — PRD M3 Approach A."""

import json
import os
import traceback
from collections.abc import AsyncIterator
from typing import Any

from groq import AsyncGroq, BadRequestError

from agent import (
    MAX_AGENT_ITERATIONS,
    RECENT_FALLBACK_LIMIT,
    RECENT_MESSAGE_LIMIT,
    _parse_groq_tool_use_failed,
    _run_groq_tool,
    agent_system_prompt,
    build_system_prompt,
    fetch_recent_messages,
    now_iso,
    run_anthropic_loop,
)
from domain import fetch_agent, fetch_channel, validate_invoke_scope
from memory.embed import embed_message_row
from memory.retrieve import retrieve_channel_memory
from serialization import serialize_messages
from streaming import sse_error, sse_event
from tools import tools_for_agent

from db import get_supabase


async def run_groq_loop_streaming(
    messages: list[dict],
    system_prompt: str,
    tool_defs: list[dict],
) -> AsyncIterator[dict[str, Any]]:
    """Yield status/token events; final event is internal {'type':'_result', ...}."""
    model = os.getenv("LLM_MODEL")
    if not model:
        raise RuntimeError("LLM_MODEL must be set")

    client = AsyncGroq()
    steps: list[dict] = []
    working = [
        {"role": "system", "content": system_prompt}
    ] + serialize_messages(messages)

    for _ in range(MAX_AGENT_ITERATIONS):
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": working,
            "max_tokens": 1024,
            "stream": True,
        }
        if tool_defs:
            kwargs["tools"] = tool_defs
            kwargs["tool_choice"] = "auto"

        content_buf: list[str] = []
        tool_calls_acc: dict[int, dict] = {}
        finish_reason: str | None = None

        try:
            stream = await client.chat.completions.create(**kwargs)
        except BadRequestError as e:
            recovered = _parse_groq_tool_use_failed(e)
            if recovered is None:
                raise
            name, args = recovered
            yield {"type": "status", "message": f"Using {name}…"}
            await _run_groq_tool(
                name, args, f"recovered_{len(steps)}", working, steps
            )
            continue

        async for chunk in stream:
            if not chunk.choices:
                continue
            choice = chunk.choices[0]
            finish_reason = choice.finish_reason or finish_reason
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
                yield {"type": "status", "message": f"Using {name}…"}
                await _run_groq_tool(
                    name,
                    args,
                    tc["id"] or f"stream_{len(steps)}",
                    working,
                    steps,
                )
            continue

        reply = "".join(content_buf)
        for piece in content_buf:
            yield {"type": "token", "content": piece}
        yield {"type": "_result", "reply": reply, "steps": steps}
        return

    yield {
        "type": "_result",
        "reply": "I got stuck in a loop, sorry.",
        "steps": steps,
    }


async def invoke_agent_stream(
    user_message: str,
    channel_id: str,
    agent_id: str,
) -> AsyncIterator[str]:
    trace_id: str | None = None
    supabase = None
    aria_name = "Aria"
    aria_agent_id: str | None = None

    try:
        supabase = get_supabase()
        channel = fetch_channel(supabase, channel_id)
        agent = fetch_agent(supabase, agent_id)
        validate_invoke_scope(agent, channel)
        aria_name = agent.get("name") or "Aria"
        aria_agent_id = agent.get("id")
        tool_defs = tools_for_agent(agent)

        yield sse_event({"type": "status", "message": "Aria is thinking…"})

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

        yield sse_event({"type": "status", "message": "Retrieving channel memory…"})
        memory_chunks = retrieve_channel_memory(
            supabase, channel_id, user_message
        )
        recent_limit = (
            RECENT_MESSAGE_LIMIT if memory_chunks else RECENT_FALLBACK_LIMIT
        )
        recent_messages = fetch_recent_messages(
            supabase, channel_id, limit=recent_limit
        )
        system_prompt = build_system_prompt(
            base_prompt=agent_system_prompt(agent),
            memory_chunks=memory_chunks,
            recent_messages=recent_messages,
        )
        messages = serialize_messages(
            [{"role": "user", "content": user_message}]
        )

        provider = os.getenv("LLM_PROVIDER", "groq")
        reply = ""
        tool_steps: list[dict] = []
        trace_status = "done"

        try:
            if provider == "groq":
                async for event in run_groq_loop_streaming(
                    messages, system_prompt, tool_defs
                ):
                    if event.get("type") == "_result":
                        reply = event.get("reply") or ""
                        tool_steps = event.get("steps") or []
                    else:
                        yield sse_event(event)
            elif provider == "anthropic":
                yield sse_event(
                    {"type": "status", "message": "Generating reply…"}
                )
                reply, tool_steps = await run_anthropic_loop(
                    messages, trace_id, system_prompt
                )
                if reply:
                    yield sse_event({"type": "token", "content": reply})
            else:
                raise RuntimeError(f"Unknown LLM_PROVIDER: {provider}")
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

        msg_result = (
            supabase.table("messages")
            .insert(
                {
                    "channel_id": channel_id,
                    "sender_id": aria_agent_id,
                    "sender_name": aria_name,
                    "sender_type": "agent",
                    "content": reply,
                    "reasoning_trace_id": trace_id,
                }
            )
            .execute()
        )
        message = (msg_result.data or [{}])[0]
        if message.get("id"):
            try:
                embed_message_row(
                    supabase, message, channel["workspace_id"]
                )
            except Exception as e:
                print(f"[memory] agent reply embed failed: {e}", flush=True)

        yield sse_event(
            {
                "type": "done",
                "message": message,
                "trace_id": trace_id,
            }
        )

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
                        "sender_id": aria_agent_id,
                        "sender_name": aria_name,
                        "sender_type": "agent",
                        "content": err_msg,
                        "reasoning_trace_id": trace_id,
                    }
                ).execute()
            except Exception:
                pass
        yield sse_error(str(e) if os.getenv("DEBUG") else err_msg)
