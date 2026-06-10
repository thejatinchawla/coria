"""OpenAI-style working message list helpers."""

import json
from typing import Any

from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)


def tool_result_content(result: Any) -> str:
    try:
        return json.dumps(result, default=str)
    except (TypeError, ValueError):
        return str(result)


def working_to_lc_messages(working: list[dict]) -> list[BaseMessage]:
    """Convert persisted OpenAI-style dicts to LangChain messages."""
    out: list[BaseMessage] = []
    for msg in working:
        role = msg.get("role")
        if role == "system":
            out.append(SystemMessage(content=msg.get("content") or ""))
        elif role == "user":
            out.append(HumanMessage(content=msg.get("content") or ""))
        elif role == "assistant":
            tool_calls = msg.get("tool_calls")
            if tool_calls:
                lc_tool_calls = []
                for tc in tool_calls:
                    fn = tc.get("function") or {}
                    lc_tool_calls.append(
                        {
                            "id": tc.get("id") or "",
                            "name": fn.get("name") or "",
                            "args": json.loads(fn.get("arguments") or "{}"),
                        }
                    )
                out.append(
                    AIMessage(
                        content=msg.get("content") or "",
                        tool_calls=lc_tool_calls,
                    )
                )
            else:
                out.append(AIMessage(content=msg.get("content") or ""))
        elif role == "tool":
            out.append(
                ToolMessage(
                    content=msg.get("content") or "",
                    tool_call_id=msg.get("tool_call_id") or "",
                )
            )
    return out


def lc_message_to_working_dict(msg: BaseMessage) -> dict | list[dict]:
    """Convert a single LangChain message to OpenAI-style dict(s)."""
    if isinstance(msg, SystemMessage):
        return {"role": "system", "content": msg.content}
    if isinstance(msg, HumanMessage):
        content = msg.content
        if isinstance(content, list):
            text = " ".join(
                block.get("text", "") if isinstance(block, dict) else str(block)
                for block in content
            )
        else:
            text = str(content)
        return {"role": "user", "content": text}
    if isinstance(msg, AIMessage):
        if msg.tool_calls:
            return {
                "role": "assistant",
                "content": msg.content or None,
                "tool_calls": [
                    {
                        "id": tc.get("id") or "",
                        "type": "function",
                        "function": {
                            "name": tc.get("name") or "",
                            "arguments": json.dumps(tc.get("args") or {}),
                        },
                    }
                    for tc in msg.tool_calls
                ],
            }
        return {"role": "assistant", "content": msg.content or ""}
    if isinstance(msg, ToolMessage):
        return {
            "role": "tool",
            "tool_call_id": msg.tool_call_id,
            "content": msg.content,
        }
    return {"role": "user", "content": str(msg.content)}


def append_assistant_tool_call(
    working: list[dict],
    *,
    name: str,
    args: dict,
    tool_call_id: str,
    content: str | None = None,
) -> None:
    working.append(
        {
            "role": "assistant",
            "content": content,
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


def append_tool_result(
    working: list[dict], *, tool_call_id: str, content: str
) -> None:
    working.append(
        {
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": content,
        }
    )


def last_assistant_tool_calls(working: list[dict]) -> list[dict]:
    """Return tool_calls from the last assistant message, if any."""
    for msg in reversed(working):
        if msg.get("role") == "assistant" and msg.get("tool_calls"):
            return msg["tool_calls"]
    return []


def openai_tools_to_langchain(tool_defs: list[dict]) -> list[dict]:
    """Convert OpenAI function defs to LangChain bind_tools format."""
    return [
        {
            "type": "function",
            "function": tool["function"],
        }
        for tool in tool_defs
        if tool.get("type") == "function" and tool.get("function")
    ]
