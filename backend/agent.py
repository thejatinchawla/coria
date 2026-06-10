import traceback
from datetime import datetime, timezone

from db import get_supabase
from domain import fetch_agent, fetch_channel, validate_invoke_scope
from memory.embed import embed_message_row
from memory.retrieve import retrieve_channel_memory
from orchestration.messages import tool_result_content
from orchestration.state import MAX_AGENT_ITERATIONS
from orchestration.stream import run_agent_graph
from prompts import DEFAULT_AGENT_SYSTEM_PROMPT
from serialization import serialize_messages
from tools import tools_for_agent

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


TOOL_CAPABILITY_LINES: dict[str, str] = {
    "web_search": "web_search — search the web for current information",
    "github_read": "github_read — read repo metadata, README excerpts, and issues",
    "github_post_comment": (
        "github_post_comment — post a comment on a GitHub issue (user approval required)"
    ),
    "github_create_pr": (
        "github_create_pr — open a draft pull request (user approval required)"
    ),
    "workspace_search": "workspace_search — search memory across workspace channels",
}


def augment_system_prompt_with_tools(base_prompt: str, allowed_tools: list[str]) -> str:
    """Append enabled tools so the model uses them even if the stored prompt is stale."""
    names = [t for t in (allowed_tools or []) if t in TOOL_CAPABILITY_LINES]
    if not names:
        return base_prompt
    lines = "\n".join(f"- {TOOL_CAPABILITY_LINES[name]}" for name in names)
    return (
        f"{base_prompt.rstrip()}\n\n"
        "Your enabled tools (use them when relevant — do not claim you lack access):\n"
        f"{lines}"
    )


def build_system_prompt(
    base_prompt: str = DEFAULT_AGENT_SYSTEM_PROMPT,
    thread_messages: list[dict] | None = None,
    memory_chunks: list[dict] | None = None,
    workspace_chunks: list[dict] | None = None,
    recent_messages: list[dict] | None = None,
    digest_mode: bool = False,
    allowed_tools: list[str] | None = None,
) -> str:
    parts = [augment_system_prompt_with_tools(base_prompt, allowed_tools or [])]

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
    return tool_result_content(result)


def agent_system_prompt(agent: dict) -> str:
    prompt = (agent.get("system_prompt") or "").strip()
    return prompt or DEFAULT_AGENT_SYSTEM_PROMPT


async def invoke_agent(user_message: str, channel_id: str, agent_id: str) -> None:
    """Run the agent for one user message via LangGraph orchestration."""
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

        try:
            trace_result = (
                supabase.table("reasoning_traces")
                .insert({"status": "running", "steps": []})
                .execute()
            )
            trace_id = trace_result.data[0]["id"]
        except Exception as e:
            print(f"[error] failed to create reasoning trace: {e}", flush=True)

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
            allowed_tools=agent.get("allowed_tools") or [],
        )
        messages = serialize_messages([{"role": "user", "content": user_message}])
        agent_tools = tools_for_agent(agent)
        from llm.config import resolve_llm_config

        llm = resolve_llm_config(supabase, channel["workspace_id"])
        try:
            reply, tool_steps = await run_agent_graph(
                llm,
                messages,
                system_prompt,
                agent_tools,
            )
            trace_status = "done"
        except Exception as e:
            print(f"[error] LLM call failed: {e}", flush=True)
            traceback.print_exc()
            reply = "Sorry — I hit an error trying to respond. Please try again."
            tool_steps = []
            trace_status = "failed"

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
