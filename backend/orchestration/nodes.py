"""LangGraph agent nodes — model call and tool execution."""

from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any

from groq import APIError, AsyncGroq, BadRequestError
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig
from langchain_groq import ChatGroq

from broker import ToolContext
from orchestration.groq_recovery import (
    parse_groq_malformed_tool_from_text,
    parse_groq_tool_use_failed,
    strip_groq_malformed_tool_syntax,
)
from orchestration.messages import (
    append_assistant_tool_call,
    append_tool_result,
    last_assistant_tool_calls,
    openai_tools_to_langchain,
    tool_result_content,
    working_to_lc_messages,
)
from orchestration.state import AgentGraphState, MAX_AGENT_ITERATIONS
from tool_runner import ApprovalPaused, run_tool_with_broker
from tools import TOOL_REGISTRY


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cfg(config: RunnableConfig | None) -> dict[str, Any]:
    return (config or {}).get("configurable") or {}


def _active_tools(cfg: dict[str, Any]) -> list[dict]:
    if not cfg.get("allow_tools", True):
        return []
    return cfg.get("tool_defs") or []


def _build_chat_model(cfg: dict[str, Any]):
    llm = cfg["llm"]
    if llm.provider == "groq":
        kwargs: dict[str, Any] = {"model": llm.model, "max_tokens": 1024}
        if llm.api_key:
            kwargs["api_key"] = llm.api_key
        return ChatGroq(**kwargs)
    if llm.provider == "anthropic":
        kwargs = {"model": llm.model, "max_tokens": 1024}
        if llm.api_key:
            kwargs["api_key"] = llm.api_key
        return ChatAnthropic(**kwargs)
    raise RuntimeError(f"Unknown LLM provider: {llm.provider}")


def _lc_messages_for_model(working: list[dict], system_prompt: str) -> list:
    """LangChain chat models expect system prompt separate from working history."""
    msgs = working_to_lc_messages(working)
    if msgs and msgs[0].type == "system":
        return msgs[1:]
    return msgs


async def _run_single_tool(
    *,
    name: str,
    args: dict,
    tool_call_id: str,
    working: list[dict],
    steps: list[dict],
    cfg: dict[str, Any],
) -> None:
    append_assistant_tool_call(
        working, name=name, args=args, tool_call_id=tool_call_id
    )
    steps.append(
        {
            "type": "tool_call_proposed",
            "tool": name,
            "input": args,
            "timestamp": now_iso(),
        }
    )

    supabase = cfg.get("supabase")
    ctx: ToolContext | None = cfg.get("ctx")
    trace_id = cfg.get("trace_id")

    try:
        if supabase is not None and ctx is not None:
            result = await run_tool_with_broker(
                supabase,
                name=name,
                args=args,
                tool_call_id=tool_call_id,
                ctx=ctx,
                trace_id=trace_id,
            )
        else:
            tool_fn = TOOL_REGISTRY.get(name)
            if tool_fn is None:
                result = {"error": f"unknown tool: {name}"}
            else:
                result = await tool_fn(args)
    except ApprovalPaused:
        raise

    steps.append(
        {
            "type": "tool_result",
            "tool": name,
            "result": result,
            "timestamp": now_iso(),
        }
    )
    append_tool_result(
        working,
        tool_call_id=tool_call_id,
        content=tool_result_content(result),
    )


async def execute_tools(
    state: AgentGraphState, config: RunnableConfig | None = None
) -> dict:
    cfg = _cfg(config)
    working = list(state["working"])
    steps = list(state["steps"])
    tool_calls = _pending_tool_calls(working)

    for tc in tool_calls:
        fn = tc.get("function") or {}
        name = fn.get("name") or ""
        try:
            args = json.loads(fn.get("arguments") or "{}")
        except json.JSONDecodeError:
            args = {}
        tool_call_id = tc.get("id") or f"tool_{len(steps)}"
        await _run_single_tool(
            name=name,
            args=args,
            tool_call_id=tool_call_id,
            working=working,
            steps=steps,
            cfg=cfg,
        )

    return {
        "working": working,
        "steps": steps,
    }


def _pending_tool_calls(working: list[dict]) -> list[dict]:
    """Tool calls from the last assistant turn that lack a tool result."""
    executed_ids = {
        m.get("tool_call_id")
        for m in working
        if m.get("role") == "tool" and m.get("tool_call_id")
    }
    return [
        tc
        for tc in last_assistant_tool_calls(working)
        if tc.get("id") not in executed_ids
    ]


async def call_model(
    state: AgentGraphState, config: RunnableConfig | None = None
) -> dict:
    """Non-streaming model call (used by graph.ainvoke)."""
    if state.get("iteration", 0) >= MAX_AGENT_ITERATIONS:
        return {
            "done": True,
            "reply": "I got stuck in a loop, sorry.",
        }

    cfg = _cfg(config)
    working = list(state["working"])
    steps = list(state["steps"])
    system_prompt = cfg.get("system_prompt") or ""
    tool_defs = _active_tools(cfg)
    llm = cfg["llm"]
    next_iteration = state.get("iteration", 0) + 1

    if llm.provider == "groq":
        reply, working, steps = await _call_groq_batch(
            working, steps, system_prompt, tool_defs, llm.model, llm.api_key, cfg
        )
    else:
        reply, working, steps = await _call_langchain_batch(
            working, steps, system_prompt, tool_defs, cfg
        )

    base = {
        "working": working,
        "steps": steps,
        "iteration": next_iteration,
    }

    if _pending_tool_calls(working):
        return base

    # Inline/recovered tools append a tool result — need another model turn.
    if working and working[-1].get("role") == "tool":
        return base

    return {
        **base,
        "reply": reply,
        "done": True,
    }


async def _call_langchain_batch(
    working: list[dict],
    steps: list[dict],
    system_prompt: str,
    tool_defs: list[dict],
    cfg: dict[str, Any],
) -> tuple[str, list[dict], list[dict]]:
    model = _build_chat_model(cfg)
    lc_tools = openai_tools_to_langchain(tool_defs) if tool_defs else []
    if lc_tools:
        model = model.bind_tools(lc_tools)

    messages = working_to_lc_messages(working)
    response: AIMessage = await model.ainvoke(messages)

    llm = cfg["llm"]
    print(
        f"[tokens] provider={llm.provider} model={llm.model} "
        f"response={'tool_calls' if response.tool_calls else 'text'}",
        flush=True,
    )

    if response.tool_calls:
        working.append(
            {
                "role": "assistant",
                "content": response.content or None,
                "tool_calls": [
                    {
                        "id": tc.get("id") or "",
                        "type": "function",
                        "function": {
                            "name": tc.get("name") or "",
                            "arguments": json.dumps(tc.get("args") or {}),
                        },
                    }
                    for tc in response.tool_calls
                ],
            }
        )
        return "", working, steps

    reply = strip_groq_malformed_tool_syntax(str(response.content or ""))
    if tool_defs:
        inline = parse_groq_malformed_tool_from_text(reply)
        if inline:
            name, args = inline
            await _run_single_tool(
                name=name,
                args=args,
                tool_call_id=f"inline_{len(steps)}",
                working=working,
                steps=steps,
                cfg=cfg,
            )
            return "", working, steps

    return reply, working, steps


async def _call_groq_batch(
    working: list[dict],
    steps: list[dict],
    system_prompt: str,
    tool_defs: list[dict],
    model: str,
    api_key: str | None,
    cfg: dict[str, Any],
) -> tuple[str, list[dict], list[dict]]:
    model = model or os.getenv("LLM_MODEL")
    if not model:
        raise RuntimeError("LLM_MODEL must be set")

    client = AsyncGroq(api_key=api_key) if api_key else AsyncGroq()
    active_tools = list(tool_defs)

    kwargs: dict[str, Any] = {"model": model, "messages": working, "max_tokens": 1024}
    if active_tools:
        kwargs["tools"] = active_tools
        kwargs["tool_choice"] = "auto"

    try:
        response = await client.chat.completions.create(**kwargs)
    except BadRequestError as e:
        recovered = parse_groq_tool_use_failed(e)
        if recovered is None:
            if active_tools:
                print(f"[groq] tool call failed, retry without tools: {e}", flush=True)
                active_tools = []
                kwargs.pop("tools", None)
                kwargs.pop("tool_choice", None)
                response = await client.chat.completions.create(**kwargs)
            else:
                raise
        else:
            name, args = recovered
            await _run_single_tool(
                name=name,
                args=args,
                tool_call_id=f"recovered_{len(steps)}",
                working=working,
                steps=steps,
                cfg=cfg,
            )
            return "", working, steps

    usage = response.usage
    print(
        f"[tokens] provider=groq model={model} "
        f"in={usage.prompt_tokens} out={usage.completion_tokens}",
        flush=True,
    )

    message = response.choices[0].message
    tool_calls = message.tool_calls or []

    if not tool_calls:
        content = message.content or ""
        if active_tools:
            inline = parse_groq_malformed_tool_from_text(content)
            if inline:
                name, args = inline
                await _run_single_tool(
                    name=name,
                    args=args,
                    tool_call_id=f"inline_{len(steps)}",
                    working=working,
                    steps=steps,
                    cfg=cfg,
                )
                return "", working, steps
        return strip_groq_malformed_tool_syntax(content), working, steps

    working.append(
        {
            "role": "assistant",
            "content": message.content,
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in tool_calls
            ],
        }
    )
    return "", working, steps


async def stream_model_step(
    state: AgentGraphState, config: RunnableConfig | None = None
) -> AsyncIterator[dict[str, Any]]:
    """Streaming model step — yields status/token events, mutates state in place."""
    cfg = _cfg(config)
    working = state["working"]
    steps = state["steps"]
    system_prompt = cfg.get("system_prompt") or ""
    tool_defs = _active_tools(cfg)
    llm = cfg["llm"]

    if llm.provider != "groq":
        yield {"type": "status", "message": "Generating reply…"}
        update = await call_model(state, config)
        state.update(update)
        reply = update.get("reply") or ""
        if reply:
            yield {"type": "token", "content": reply}
        return

    model = llm.model or os.getenv("LLM_MODEL")
    if not model:
        raise RuntimeError("LLM_MODEL must be set")

    client = AsyncGroq(api_key=llm.api_key) if llm.api_key else AsyncGroq()
    active_tools = list(tool_defs)

    kwargs: dict[str, Any] = {
        "model": model,
        "messages": working,
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
        recovered = parse_groq_tool_use_failed(e)
        if recovered is None:
            if active_tools:
                print(f"[groq] tool call failed, retry without tools: {e}", flush=True)
                active_tools = []
                async for ev in stream_model_step(state, config):
                    yield ev
                return
            raise
        name, args = recovered
        yield {"type": "status", "message": f"Using {name}…"}
        await _run_single_tool(
            name=name,
            args=args,
            tool_call_id=f"recovered_{len(steps)}",
            working=working,
            steps=steps,
            cfg=cfg,
        )
        state["iteration"] = state.get("iteration", 0) + 1
        return

    try:
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta.content:
                content_buf.append(delta.content)
            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index or 0
                    if idx not in tool_calls_acc:
                        tool_calls_acc[idx] = {"id": "", "name": "", "arguments": ""}
                    if tc.id:
                        tool_calls_acc[idx]["id"] = tc.id
                    if tc.function:
                        if tc.function.name:
                            tool_calls_acc[idx]["name"] = tc.function.name
                        if tc.function.arguments:
                            tool_calls_acc[idx]["arguments"] += tc.function.arguments
    except APIError as e:
        recovered = parse_groq_tool_use_failed(e)
        if recovered is None:
            if active_tools:
                print(f"[groq] stream tool call failed, retry without tools: {e}", flush=True)
                cfg["allow_tools"] = False
                async for ev in stream_model_step(state, config):
                    yield ev
                return
            raise
        name, args = recovered
        yield {"type": "status", "message": f"Using {name}…"}
        await _run_single_tool(
            name=name,
            args=args,
            tool_call_id=f"recovered_{len(steps)}",
            working=working,
            steps=steps,
            cfg=cfg,
        )
        state["iteration"] = state.get("iteration", 0) + 1
        return

    combined = "".join(content_buf)

    if not tool_calls_acc and active_tools:
        inline = parse_groq_malformed_tool_from_text(combined)
        if inline:
            name, args = inline
            yield {"type": "status", "message": f"Using {name}…"}
            await _run_single_tool(
                name=name,
                args=args,
                tool_call_id=f"inline_{len(steps)}",
                working=working,
                steps=steps,
                cfg=cfg,
            )
            state["iteration"] = state.get("iteration", 0) + 1
            return

    if tool_calls_acc:
        working.append(
            {
                "role": "assistant",
                "content": combined or None,
                "tool_calls": [
                    {
                        "id": tc["id"] or f"stream_{i}",
                        "type": "function",
                        "function": {
                            "name": tc["name"],
                            "arguments": tc["arguments"],
                        },
                    }
                    for i, tc in sorted(tool_calls_acc.items())
                ],
            }
        )
        state["iteration"] = state.get("iteration", 0) + 1
        return

    reply = strip_groq_malformed_tool_syntax(combined)
    state["reply"] = reply
    state["done"] = True
    state["iteration"] = state.get("iteration", 0) + 1
    if reply:
        yield {"type": "token", "content": reply}


async def stream_tools_step(
    state: AgentGraphState, config: RunnableConfig | None = None
) -> AsyncIterator[dict[str, Any]]:
    """Execute pending tool calls from the last assistant message."""
    cfg = _cfg(config)
    working = state["working"]
    steps = state["steps"]
    tool_calls = _pending_tool_calls(working)

    for tc in tool_calls:
        fn = tc.get("function") or {}
        name = fn.get("name") or ""
        try:
            args = json.loads(fn.get("arguments") or "{}")
        except json.JSONDecodeError:
            args = {}
        tool_call_id = tc.get("id") or f"stream_{len(steps)}"
        yield {"type": "status", "message": f"Using {name}…"}
        await _run_single_tool(
            name=name,
            args=args,
            tool_call_id=tool_call_id,
            working=working,
            steps=steps,
            cfg=cfg,
        )


def should_route_to_tools(state: AgentGraphState, config: RunnableConfig | None = None) -> bool:
    if state.get("done"):
        return False
    cfg = _cfg(config)
    if not cfg.get("allow_tools", True):
        return False
    if state.get("iteration", 0) >= MAX_AGENT_ITERATIONS:
        return False
    return bool(_pending_tool_calls(state["working"]))


def route_after_model(state: AgentGraphState, config: RunnableConfig | None = None) -> str:
    if state.get("done"):
        return "__end__"
    if state.get("iteration", 0) >= MAX_AGENT_ITERATIONS:
        return "__end__"
    if should_route_to_tools(state, config):
        return "tools"
    if state.get("working") and state["working"][-1].get("role") == "tool":
        return "model"
    return "__end__"
