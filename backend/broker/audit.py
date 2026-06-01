import hashlib
import json
from typing import Any


def hash_tool_input(tool_input: dict) -> str:
    payload = json.dumps(tool_input, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


def write_audit_log(
    supabase,
    *,
    workspace_id: str,
    agent_id: str | None,
    member_id: str | None,
    action_block_id: str | None,
    tool_name: str,
    tool_input: dict,
    outcome: str,
    gate_failed: str | None = None,
    metadata: dict | None = None,
) -> None:
    supabase.table("audit_log").insert(
        {
            "workspace_id": workspace_id,
            "agent_id": agent_id,
            "member_id": member_id,
            "action_block_id": action_block_id,
            "tool_name": tool_name,
            "tool_input_hash": hash_tool_input(tool_input),
            "outcome": outcome,
            "gate_failed": gate_failed,
            "metadata": metadata or {},
        }
    ).execute()


def count_recent_tool_calls(
    supabase, agent_id: str, window_seconds: int = 60
) -> int:
    from datetime import datetime, timedelta, timezone

    since = (datetime.now(timezone.utc) - timedelta(seconds=window_seconds)).isoformat()
    result = (
        supabase.table("audit_log")
        .select("id", count="exact")
        .eq("agent_id", agent_id)
        .gte("created_at", since)
        .in_(
            "outcome",
            ["allowed", "executed", "pending_approval", "approved"],
        )
        .execute()
    )
    return result.count or 0
