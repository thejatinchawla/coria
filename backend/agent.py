import json
import os
import re
import traceback
from datetime import datetime, timezone

from anthropic import AsyncAnthropic
from groq import AsyncGroq, BadRequestError

from db import get_supabase
from domain import fetch_agent, fetch_channel, validate_invoke_scope
from memory.embed import embed_message_row
from memory.context import build_retrieval_context
from memory.retrieve import retrieve_channel_memory
from prompts import DEFAULT_AGENT_SYSTEM_PROMPT
from serialization import serialize_messages
from tool_runner import ApprovalPaused, run_tool_with_broker
from tools import TOOL_DEFINITIONS, TOOL_REGISTRY, tools_for_agent
from broker import ToolContext

# Hard cap on the agentic loop. With tools running this is the primary guard
# against an infinite call -> tool -> call cycle, which is the #1 cost/abuse risk.
MAX_AGENT_ITERATIONS = 5
RECENT_MESSAGE_LIMIT = 3
RECENT_FALLBACK_LIMIT = 8


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def fetch_recent_messages(
    supabase, channel_id: str, limit: int = RECENT_MESSAGE_LIMIT
) -> list[dict]:
    """Load the last N top-level channel messages (no vectors)."""
    result = (
        supabase.table("messages")
        .select("sender_name,sender_type,content,created_at")
        .eq("channel_id", channel_id)
        .is_("thread_id", "null")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    rows = result.data or []
    rows.reverse()
    return rows


def _format_message_lines(
    rows: list[dict], *, include_timestamps: bool = False
) -> str:
    lines: list[str] = []
    for row in rows:
        name = row.get("sender_name", "?")
        content = row.get("content", "")
        if row.get("thread_id"):
            name = f"{name} (thread reply)"
        if include_timestamps and row.get("created_at"):
            lines.append(f"[{row['created_at']}] {name}: {content}")
        else:
            lines.append(f"{name}: {content}")
    return "\n".join(lines)


def _format_memory_chunks(chunks: list[dict], *, prefix: str = "") -> str:
    lines: list[str] = []
    for chunk in chunks:
        meta = chunk.get("metadata") or {}
        who = meta.get("sender_name") or "?"
        when = meta.get("created_at") or ""
        ch = meta.get("channel_slug") or meta.get("channel_name")
        channel_tag = f"#{ch} · " if ch else ""
        sim = chunk.get("similarity")
        score = f" (relevance {sim:.2f})" if sim is not None else ""
        lines.append(
            f"[{prefix}{channel_tag}{when}] {who}{score}: {chunk.get('content', '')}"
        )
    return "\n".join(lines)


def _format_thread_messages(rows: list[dict]) -> str:
    return "\n".join(
        f"{row.get('sender_name', '?')}: {row.get('content', '')}"
        for row in rows
    )


def build_system_prompt(
    base_prompt: str = DEFAULT_AGENT_SYSTEM_PROMPT,
    thread_messages: list[dict] | None = None,
    memory_chunks: list[dict] | None = None,
    workspace_chunks: list[dict] | None = None,
    recent_messages: list[dict] | None = None,
    digest_mode: bool = False,
) -> str:
    parts = [base_prompt]

    if thread_messages:
        parts.append(
            "Current thread (oldest first):\n"
            + _format_thread_messages(thread_messages)
        )

    if memory_chunks:
        parts.append(
            "Relevant channel history (retrieved from memory):\n"
            + _format_memory_chunks(memory_chunks)
        )

    if workspace_chunks:
        parts.append(
            "Relevant workspace history across channels (cite channel when answering):\n"
            + _format_memory_chunks(workspace_chunks)
        )

    if recent_messages:
        if digest_mode:
            parts.append(
                "Channel activity for your digest (last 24 hours, oldest first):\n"
                + _format_message_lines(recent_messages, include_timestamps=True)
            )
        else:
            parts.append(
                "Very recent channel messages (oldest first):\n"
                + _format_message_lines(recent_messages)
            )

    if digest_mode:
        parts.append(
            "This is a scheduled channel digest. Summarize the channel activity "
            "above as instructed. Do not say you lack access to channel history — "
            "the messages are provided in this prompt. If there was no activity, "
            "say the channel was quiet."
        )
    else:
        parts.append(
            "The latest @mention from a teammate is your immediate task. "
            "Prefer thread context when replying in a thread. "
            "Prefer retrieved history for older context; use very recent messages "
            "for what just happened; use workspace_search or web_search when you "
            "need facts from other channels or the web. Cite channel names (e.g. #product) "
            "when using workspace memory."
        )
    return "\n\n".join(parts)


def _tool_result_content(result) -> str:
    """Serialize a tool result for sending back to the model as a string."""
    try:
        return json.dumps(result, default=str)
    except (TypeError, ValueError):
        return str(result)


def _openai_tools_to_anthropic(tools: list[dict]) -> list[dict]:
    """Convert OpenAI/Groq function defs to Anthropic tool defs, so tools only
    have to be declared once (in ``tools.py``)."""
    converted = []
    for tool in tools:
        fn = tool.get("function", {})
        converted.append(
            {
                "name": fn.get("name", ""),
                "description": fn.get("description", ""),
                "input_schema": fn.get(
                    "parameters", {"type": "object", "properties": {}}
                ),
            }
        )
    return converted


def _extract_anthropic_text(content) -> str:
    """Pull the plain-text reply out of an Anthropic content-block list."""
    return next((b.text for b in content if b.type == "text"), "")


_GROQ_FAILED_TOOL_RE = re.compile(
    r"<function=(\w+)\s*(\{.*?\})\s*</function>",
    re.DOTALL,
)


def _parse_groq_tool_use_failed(error: BadRequestError) -> tuple[str, dict] | None:
    """Groq sometimes rejects a tool call when the model emits XML-style syntax
    instead of structured tool_calls. Parse failed_generation and recover."""
    try:
        body = error.response.json()
    except Exception:
        return None
    err = body.get("error") or {}
    if err.get("code") != "tool_use_failed":
        return None
    failed = err.get("failed_generation") or ""
    match = _GROQ_FAILED_TOOL_RE.search(failed)
    if not match:
        return None
    try:
        return match.group(1), json.loads(match.group(2))
    except json.JSONDecodeError:
        return None


async def _run_groq_tool(
    name: str,
    args: dict,
    tool_call_id: str,
    working: list[dict],
    steps: list[dict],
    *,
    supabase=None,
    ctx: ToolContext | None = None,
    trace_id: str | None = None,
) -> None:
    """Execute one tool call and append assistant + tool messages to the loop."""
    working.append(
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": tool_call_id,
                    "type": "function",
                    "function": {
                        "name": name,
                        "arguments": json.dumps(args),
                    },
                }
            ],
        }
    )
    steps.append(
        {
            "type": "tool_call_proposed",
            "tool": name,
            "input": args,
            "timestamp": now_iso(),
        }
    )

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
    working.append(
        {
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": _tool_result_content(result),
        }
    )


async def run_groq_loop(
    messages: list[dict],
    trace_id: str | None,
    system_prompt: str = DEFAULT_AGENT_SYSTEM_PROMPT,
    tool_defs: list[dict] | None = None,
    *,
    model: str | None = None,
    api_key: str | None = None,
) -> tuple[str, list[dict]]:
    """Agentic loop for the Groq (default, free) provider, using OpenAI-style
    function calling.

    Loops up to ``MAX_AGENT_ITERATIONS``. With an empty ``TOOL_DEFINITIONS`` no
    tools are sent, so the model returns the reply on the first call — identical
    to a single-shot completion. Populate ``tools.py`` (Day 6) and the tool-call
    branch activates with no further changes here.

    Returns ``(reply_text, tool_steps)``; the caller appends the final reply step.
    """
    model = model or os.getenv("LLM_MODEL")
    if not model:
        raise RuntimeError("LLM_MODEL must be set")

    client = AsyncGroq(api_key=api_key) if api_key else AsyncGroq()
    steps: list[dict] = []
    working = [
        {"role": "system", "content": system_prompt}
    ] + serialize_messages(messages)

    active_tools = tool_defs if tool_defs is not None else TOOL_DEFINITIONS
    for _ in range(MAX_AGENT_ITERATIONS):
        kwargs = {"model": model, "messages": working, "max_tokens": 1024}
        if active_tools:
            kwargs["tools"] = active_tools
            kwargs["tool_choice"] = "auto"

        try:
            response = await client.chat.completions.create(**kwargs)
        except BadRequestError as e:
            recovered = _parse_groq_tool_use_failed(e)
            if recovered is None:
                raise
            name, args = recovered
            print(
                f"[groq] recovered malformed tool call: {name}({args})",
                flush=True,
            )
            await _run_groq_tool(
                name,
                args,
                f"recovered_{len(steps)}",
                working,
                steps,
            )
            continue

        usage = response.usage
        print(
            f"[tokens] provider=groq model={model} "
            f"in={usage.prompt_tokens} out={usage.completion_tokens}",
            flush=True,
        )

        message = response.choices[0].message
        tool_calls = message.tool_calls or []

        # No tool calls -> this is the final answer.
        if not tool_calls:
            return message.content or "", steps

        # Record the assistant turn (with its tool calls) for the next round.
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

        for tc in tool_calls:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            await _run_groq_tool(
                tc.function.name, args, tc.id, working, steps
            )
        # Loop back so the model can use the tool results.
    else:
        # Loop exhausted: kept asking for tools and hit the cap. The caller turns
        # this text into the final reply step.
        return "I got stuck in a loop, sorry.", steps


async def run_anthropic_loop(
    messages: list[dict],
    trace_id: str | None,
    system_prompt: str = DEFAULT_AGENT_SYSTEM_PROMPT,
    tool_defs: list[dict] | None = None,
    *,
    model: str | None = None,
    api_key: str | None = None,
) -> tuple[str, list[dict]]:
    """Agentic loop for the optional Anthropic provider (paid). Mirrors
    ``run_groq_loop`` using Anthropic's content-block tool protocol. Tool defs
    are converted from the single OpenAI-format source in ``tools.py``.

    Returns ``(reply_text, tool_steps)``; the caller appends the final reply step.
    """
    model = model or os.getenv("LLM_MODEL")
    if not model:
        raise RuntimeError("LLM_MODEL must be set")

    client = AsyncAnthropic(api_key=api_key) if api_key else AsyncAnthropic()
    steps: list[dict] = []
    working = serialize_messages(messages)
    active_tools = tool_defs if tool_defs is not None else TOOL_DEFINITIONS
    anthropic_tools = _openai_tools_to_anthropic(active_tools)

    for _ in range(MAX_AGENT_ITERATIONS):
        kwargs = {
            "model": model,
            "max_tokens": 1024,
            "system": system_prompt,
            "messages": working,
        }
        if anthropic_tools:
            kwargs["tools"] = anthropic_tools

        response = await client.messages.create(**kwargs)
        print(
            f"[tokens] provider=anthropic model={model} "
            f"in={response.usage.input_tokens} out={response.usage.output_tokens}",
            flush=True,
        )

        # Record the assistant turn so the next iteration has full context.
        working.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                steps.append(
                    {
                        "type": "tool_call_proposed",
                        "tool": block.name,
                        "input": block.input,
                        "timestamp": now_iso(),
                    }
                )
                tool_fn = TOOL_REGISTRY.get(block.name)
                if tool_fn is None:
                    result = {"error": f"unknown tool: {block.name}"}
                else:
                    result = await tool_fn(block.input)
                steps.append(
                    {
                        "type": "tool_result",
                        "tool": block.name,
                        "result": result,
                        "timestamp": now_iso(),
                    }
                )
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": _tool_result_content(result),
                    }
                )
            working.append({"role": "user", "content": tool_results})
            continue

        if response.stop_reason == "end_turn":
            return _extract_anthropic_text(response.content), steps

        # Any other stop_reason (e.g. max_tokens) — return what we have.
        return _extract_anthropic_text(response.content), steps
    else:
        return "I got stuck in a loop, sorry.", steps


def agent_system_prompt(agent: dict) -> str:
    prompt = (agent.get("system_prompt") or "").strip()
    return prompt or DEFAULT_AGENT_SYSTEM_PROMPT


async def invoke_agent(user_message: str, channel_id: str, agent_id: str) -> None:
    """Run the agent for one user message: create a reasoning trace, run the model
    through its provider loop, finalize the trace, then post the reply linked to
    that trace.

    Order matters — the trace is written before the message so that when the
    realtime INSERT for the message reaches the client, the trace already exists
    and "Show reasoning" can fetch it with no race.

    The whole body is guarded: a background task that dies silently would be
    impossible to debug, so any unexpected error is logged with a full traceback
    and still surfaces a fallback message + a failed trace to the user.
    """
    trace_id: str | None = None
    supabase = None
    agent_display_name = "Agent"
    agent_db_id: str | None = None
    try:
        supabase = get_supabase()

        channel = fetch_channel(supabase, channel_id)
        agent = fetch_agent(supabase, agent_id)
        validate_invoke_scope(supabase, agent, channel)
        agent_display_name = agent.get("name") or "Agent"
        agent_db_id = agent.get("id")

        # 1. Create the trace up front. Its own try/except: a DB hiccup here must
        #    not stop us from at least posting a (trace-less) reply.
        try:
            trace_result = (
                supabase.table("reasoning_traces")
                .insert({"status": "running", "steps": []})
                .execute()
            )
            trace_id = trace_result.data[0]["id"]
        except Exception as e:
            print(f"[error] failed to create reasoning trace: {e}", flush=True)

        # 2. RAG retrieve + slim recent fallback, then run the model.
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
        messages = serialize_messages([{"role": "user", "content": user_message}])
        agent_tools = tools_for_agent(agent)
        from llm.config import resolve_llm_config

        llm = resolve_llm_config(supabase, channel["workspace_id"])
        try:
            if llm.provider == "groq":
                reply, tool_steps = await run_groq_loop(
                    messages,
                    trace_id,
                    system_prompt,
                    agent_tools,
                    model=llm.model,
                    api_key=llm.api_key,
                )
            elif llm.provider == "anthropic":
                reply, tool_steps = await run_anthropic_loop(
                    messages,
                    trace_id,
                    system_prompt,
                    agent_tools,
                    model=llm.model,
                    api_key=llm.api_key,
                )
            else:
                raise RuntimeError(f"Unknown LLM provider: {llm.provider}")
            trace_status = "done"
        except Exception as e:
            print(f"[error] LLM call failed: {e}", flush=True)
            traceback.print_exc()
            reply = "Sorry — I hit an error trying to respond. Please try again."
            tool_steps = []
            trace_status = "failed"

        # 3. Finalize the trace: any tool steps, then the final reply step.
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

        # 4. Post the message last, linked to the trace (null if creation failed).
        msg_result = (
            supabase.table("messages")
            .insert(
                {
                    "channel_id": channel_id,
                    "sender_id": agent_db_id,
                    "sender_name": agent_display_name,
                    "sender_type": "agent",
                    "content": reply,
                    "reasoning_trace_id": trace_id,
                }
            )
            .execute()
        )
        if msg_result.data:
            try:
                embed_message_row(
                    supabase,
                    msg_result.data[0],
                    channel["workspace_id"],
                )
            except Exception as e:
                print(f"[memory] agent reply embed failed: {e}", flush=True)

    except Exception:
        # Last-resort guard. Nothing above should escape, but if it does, log the
        # full traceback, mark the trace failed, and still surface something.
        print(
            "[error] invoke_agent crashed:\n" + traceback.format_exc(),
            flush=True,
        )
        if supabase is not None:
            if trace_id is not None:
                try:
                    supabase.table("reasoning_traces").update(
                        {
                            "status": "failed",
                            "steps": [
                                {
                                    "type": "reply",
                                    "content": "Sorry — I hit an error trying to respond.",
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
                        "sender_name": agent_display_name,
                        "sender_type": "agent",
                        "content": "Sorry — I hit an error trying to respond.",
                        "reasoning_trace_id": trace_id,
                    }
                ).execute()
            except Exception:
                print(
                    "[error] failed to post fallback message:\n"
                    + traceback.format_exc(),
                    flush=True,
                )
