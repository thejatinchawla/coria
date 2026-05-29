import json
import os
import traceback
from datetime import datetime, timezone

from anthropic import AsyncAnthropic
from groq import AsyncGroq

from db import get_supabase
from prompts import ARIA_SYSTEM_PROMPT
from serialization import serialize_messages
from tools import TOOL_DEFINITIONS, TOOL_REGISTRY

# Hard cap on the agentic loop. With tools running this is the primary guard
# against an infinite call -> tool -> call cycle, which is the #1 cost/abuse risk.
MAX_AGENT_ITERATIONS = 5
RECENT_MESSAGE_LIMIT = 10


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def fetch_recent_messages(supabase, limit: int = RECENT_MESSAGE_LIMIT) -> list[dict]:
    """Load the last N channel messages for prompt context (no vectors)."""
    result = (
        supabase.table("messages")
        .select("sender_name,sender_type,content,created_at")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    rows = result.data or []
    rows.reverse()
    return rows


def build_system_prompt(recent_messages: list[dict]) -> str:
    if not recent_messages:
        return ARIA_SYSTEM_PROMPT

    lines = [
        f"{row.get('sender_name', '?')}: {row.get('content', '')}"
        for row in recent_messages
    ]
    history = "\n".join(lines)
    return (
        f"{ARIA_SYSTEM_PROMPT}\n\n"
        f"Recent channel messages (oldest first):\n{history}\n\n"
        "The latest @mention from a teammate is your immediate task. "
        "Use channel history for context; use web_search when you need current facts."
    )


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


async def run_groq_loop(
    messages: list[dict],
    trace_id: str | None,
    system_prompt: str = ARIA_SYSTEM_PROMPT,
) -> tuple[str, list[dict]]:
    """Agentic loop for the Groq (default, free) provider, using OpenAI-style
    function calling.

    Loops up to ``MAX_AGENT_ITERATIONS``. With an empty ``TOOL_DEFINITIONS`` no
    tools are sent, so the model returns the reply on the first call — identical
    to a single-shot completion. Populate ``tools.py`` (Day 6) and the tool-call
    branch activates with no further changes here.

    Returns ``(reply_text, tool_steps)``; the caller appends the final reply step.
    """
    model = os.getenv("LLM_MODEL")
    if not model:
        raise RuntimeError("LLM_MODEL must be set")

    client = AsyncGroq()
    steps: list[dict] = []
    working = [
        {"role": "system", "content": system_prompt}
    ] + serialize_messages(messages)

    for _ in range(MAX_AGENT_ITERATIONS):
        kwargs = {"model": model, "messages": working, "max_tokens": 1024}
        if TOOL_DEFINITIONS:
            kwargs["tools"] = TOOL_DEFINITIONS
            kwargs["tool_choice"] = "auto"

        response = await client.chat.completions.create(**kwargs)
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
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}

            steps.append(
                {
                    "type": "tool_call_proposed",
                    "tool": name,
                    "input": args,
                    "timestamp": now_iso(),
                }
            )

            tool_fn = TOOL_REGISTRY.get(name)
            if tool_fn is None:
                result = {"error": f"unknown tool: {name}"}
            else:
                result = await tool_fn(args)

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
                    "tool_call_id": tc.id,
                    "content": _tool_result_content(result),
                }
            )
        # Loop back so the model can use the tool results.
    else:
        # Loop exhausted: kept asking for tools and hit the cap. The caller turns
        # this text into the final reply step.
        return "I got stuck in a loop, sorry.", steps


async def run_anthropic_loop(
    messages: list[dict],
    trace_id: str | None,
    system_prompt: str = ARIA_SYSTEM_PROMPT,
) -> tuple[str, list[dict]]:
    """Agentic loop for the optional Anthropic provider (paid). Mirrors
    ``run_groq_loop`` using Anthropic's content-block tool protocol. Tool defs
    are converted from the single OpenAI-format source in ``tools.py``.

    Returns ``(reply_text, tool_steps)``; the caller appends the final reply step.
    """
    model = os.getenv("LLM_MODEL")
    if not model:
        raise RuntimeError("LLM_MODEL must be set")

    client = AsyncAnthropic()
    steps: list[dict] = []
    working = serialize_messages(messages)
    anthropic_tools = _openai_tools_to_anthropic(TOOL_DEFINITIONS)

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


async def invoke_agent(user_message: str) -> None:
    """Run Aria for one user message: create a reasoning trace, run the model
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
    try:
        supabase = get_supabase()

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

        # 2. Build prompt context from recent channel history, then run the model.
        recent_messages = fetch_recent_messages(supabase)
        system_prompt = build_system_prompt(recent_messages)
        messages = serialize_messages([{"role": "user", "content": user_message}])
        provider = os.getenv("LLM_PROVIDER", "groq")
        try:
            if provider == "groq":
                reply, tool_steps = await run_groq_loop(
                    messages, trace_id, system_prompt
                )
            elif provider == "anthropic":
                reply, tool_steps = await run_anthropic_loop(
                    messages, trace_id, system_prompt
                )
            else:
                raise RuntimeError(f"Unknown LLM_PROVIDER: {provider}")
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
        supabase.table("messages").insert(
            {
                "sender_name": "Aria",
                "sender_type": "agent",
                "content": reply,
                "reasoning_trace_id": trace_id,
            }
        ).execute()

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
                        "sender_name": "Aria",
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
