"""Streaming and batch adapters for the LangGraph agent."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from langchain_core.runnables import RunnableConfig

from broker import ToolContext
from orchestration.graph import agent_graph
from orchestration.nodes import (
    should_route_to_tools,
    stream_model_step,
    stream_tools_step,
)
from orchestration.state import MAX_AGENT_ITERATIONS, AgentGraphState
from serialization import serialize_messages
from tool_runner import ApprovalPaused


def _make_config(
    *,
    system_prompt: str,
    llm,
    tool_defs: list[dict],
    supabase=None,
    ctx: ToolContext | None = None,
    trace_id: str | None = None,
    allow_tools: bool = True,
) -> RunnableConfig:
    return {
        "configurable": {
            "system_prompt": system_prompt,
            "llm": llm,
            "tool_defs": tool_defs,
            "supabase": supabase,
            "ctx": ctx,
            "trace_id": trace_id,
            "allow_tools": allow_tools,
        }
    }


def _initial_state(
    *,
    messages: list[dict],
    system_prompt: str,
    working: list[dict] | None = None,
    steps: list[dict] | None = None,
) -> AgentGraphState:
    if working is not None:
        return {
            "working": list(working),
            "steps": list(steps or []),
            "iteration": 0,
        }
    return {
        "working": [{"role": "system", "content": system_prompt}]
        + serialize_messages(messages),
        "steps": list(steps or []),
        "iteration": 0,
    }


async def run_agent_graph(
    llm,
    messages: list[dict],
    system_prompt: str,
    tool_defs: list[dict],
    *,
    supabase=None,
    ctx: ToolContext | None = None,
    trace_id: str | None = None,
    allow_tools: bool = True,
) -> tuple[str, list[dict]]:
    """Non-streaming invoke — runs the compiled LangGraph."""
    config = _make_config(
        system_prompt=system_prompt,
        llm=llm,
        tool_defs=tool_defs,
        supabase=supabase,
        ctx=ctx,
        trace_id=trace_id,
        allow_tools=allow_tools,
    )
    state = _initial_state(messages=messages, system_prompt=system_prompt)

    try:
        result = await agent_graph.ainvoke(state, config)
    except ApprovalPaused:
        raise

    reply = result.get("reply") or ""
    if not reply and not result.get("done"):
        reply = "I got stuck in a loop, sorry."
    return reply, result.get("steps") or []


async def run_agent_graph_streaming(
    llm,
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
) -> AsyncIterator[dict[str, Any]]:
    """Yield status/token events; final event is {'type':'_result', ...}."""
    config = _make_config(
        system_prompt=system_prompt,
        llm=llm,
        tool_defs=tool_defs,
        supabase=supabase,
        ctx=ctx,
        trace_id=trace_id,
        allow_tools=allow_tools,
    )
    state = _initial_state(
        messages=messages,
        system_prompt=system_prompt,
        working=working,
        steps=steps,
    )

    loop_count = 0
    while loop_count < MAX_AGENT_ITERATIONS:
        try:
            async for event in stream_model_step(state, config):
                yield event
        except ApprovalPaused as paused:
            pending = _pending_tool_from_state(state)
            yield {
                "type": "_approval_paused",
                "paused": paused,
                "working": state["working"],
                "steps": state["steps"],
                "pending_tool": pending,
            }
            return

        if state.get("done"):
            reply = state.get("reply") or ""
            yield {"type": "_result", "reply": reply, "steps": state["steps"]}
            return

        if should_route_to_tools(state, config):
            try:
                async for event in stream_tools_step(state, config):
                    yield event
            except ApprovalPaused as paused:
                pending = _pending_tool_from_state(state)
                yield {
                    "type": "_approval_paused",
                    "paused": paused,
                    "working": state["working"],
                    "steps": state["steps"],
                    "pending_tool": pending,
                }
                return
            loop_count += 1
            continue

        if state.get("working") and state["working"][-1].get("role") == "tool":
            loop_count += 1
            continue

        reply = state.get("reply") or ""
        yield {"type": "_result", "reply": reply, "steps": state["steps"]}
        return

    yield {
        "type": "_result",
        "reply": "I got stuck in a loop, sorry.",
        "steps": state["steps"],
    }


def _pending_tool_from_state(state: AgentGraphState) -> dict:
    """Best-effort pending tool metadata for approval pause."""
    import json

    from orchestration.nodes import _pending_tool_calls

    tool_calls = _pending_tool_calls(state["working"])
    if not tool_calls:
        return {}
    tc = tool_calls[-1]
    fn = tc.get("function") or {}
    try:
        args = json.loads(fn.get("arguments") or "{}")
    except json.JSONDecodeError:
        args = {}
    return {
        "name": fn.get("name") or "",
        "args": args,
        "tool_call_id": tc.get("id") or "",
    }
