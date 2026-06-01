"""Unified memory retrieval for invoke: thread, channel RAG, workspace RAG."""

from datetime import datetime, timedelta, timezone

from memory.retrieve import (
    retrieve_channel_memory,
    retrieve_workspace_memory,
)
from workspace_settings import fetch_workspace_settings

CRON_DIGEST_HOURS = 24
CRON_DIGEST_MESSAGE_LIMIT = 150


def fetch_thread_messages(supabase, thread_id: str) -> list[dict]:
    """Root message + thread replies in chronological order."""
    root_result = (
        supabase.table("messages")
        .select("id,sender_name,sender_type,content,created_at,thread_id")
        .eq("id", thread_id)
        .limit(1)
        .execute()
    )
    root_rows = root_result.data or []

    replies_result = (
        supabase.table("messages")
        .select("id,sender_name,sender_type,content,created_at,thread_id")
        .eq("thread_id", thread_id)
        .order("created_at", desc=False)
        .execute()
    )
    replies = replies_result.data or []
    if not root_rows:
        return replies
    return root_rows + replies


def fetch_recent_channel_messages(
    supabase,
    channel_id: str,
    *,
    limit: int = 3,
    top_level_only: bool = True,
) -> list[dict]:
    query = (
        supabase.table("messages")
        .select("sender_name,sender_type,content,created_at")
        .eq("channel_id", channel_id)
    )
    if top_level_only:
        query = query.is_("thread_id", "null")
    result = query.order("created_at", desc=True).limit(limit).execute()
    rows = result.data or []
    rows.reverse()
    return rows


def fetch_channel_messages_since(
    supabase,
    channel_id: str,
    *,
    since: datetime,
    limit: int = CRON_DIGEST_MESSAGE_LIMIT,
) -> list[dict]:
    """All channel messages since a timestamp (includes thread replies)."""
    result = (
        supabase.table("messages")
        .select("sender_name,sender_type,content,created_at,thread_id")
        .eq("channel_id", channel_id)
        .gte("created_at", since.isoformat())
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    return result.data or []


def build_cron_digest_context(
    supabase,
    *,
    channel_id: str,
    user_message: str,
    hours: int = CRON_DIGEST_HOURS,
) -> dict:
    """Load recent channel activity for scheduled digest triggers."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    digest_messages = fetch_channel_messages_since(
        supabase, channel_id, since=since
    )
    channel_chunks = retrieve_channel_memory(supabase, channel_id, user_message)
    return {
        "thread_messages": [],
        "channel_chunks": channel_chunks,
        "workspace_chunks": [],
        "recent_messages": digest_messages,
        "digest_mode": True,
    }


def build_retrieval_context(
    supabase,
    *,
    channel_id: str,
    workspace_id: str,
    user_message: str,
    thread_id: str | None,
    use_workspace_memory: bool,
) -> dict:
    """Memory retrieval order: thread → channel RAG → workspace RAG."""
    settings = fetch_workspace_settings(supabase, workspace_id)
    workspace_enabled = bool(settings.get("workspace_memory_enabled", True))

    thread_messages: list[dict] = []
    if thread_id:
        thread_messages = fetch_thread_messages(supabase, thread_id)

    channel_chunks = retrieve_channel_memory(supabase, channel_id, user_message)

    workspace_chunks: list[dict] = []
    if use_workspace_memory and workspace_enabled:
        workspace_chunks = retrieve_workspace_memory(
            supabase, workspace_id, user_message
        )

    recent_limit = 3 if (channel_chunks or thread_messages) else 8
    recent_messages: list[dict] = []
    if not thread_id:
        recent_messages = fetch_recent_channel_messages(
            supabase,
            channel_id,
            limit=recent_limit,
            top_level_only=True,
        )

    return {
        "thread_messages": thread_messages,
        "channel_chunks": channel_chunks,
        "workspace_chunks": workspace_chunks,
        "recent_messages": recent_messages,
    }
