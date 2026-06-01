"""Run agent invoke for triggers (non-SSE)."""

import json

from invoke_stream import invoke_agent_stream


async def invoke_agent_for_trigger(
    user_message: str,
    channel_id: str,
    agent_id: str,
    *,
    invoker_member_id: str | None = None,
    thread_id: str | None = None,
    trigger_type: str | None = None,
) -> dict:
    """Consume invoke stream; return done/approval/error payload."""
    result: dict = {"status": "unknown"}

    async for chunk in invoke_agent_stream(
        user_message,
        channel_id,
        agent_id,
        invoker_member_id,
        thread_id,
        trigger_type=trigger_type,
    ):
        if not chunk.startswith("data: "):
            continue
        try:
            payload = json.loads(chunk[6:].strip())
        except json.JSONDecodeError:
            continue

        event_type = payload.get("type")
        if event_type == "done":
            result = {"status": "done", "message": payload.get("message")}
        elif event_type == "awaiting_approval":
            result = {
                "status": "awaiting_approval",
                "action_block": payload.get("action_block"),
            }
        elif event_type == "error":
            result = {"status": "error", "error": payload.get("message")}

    return result
