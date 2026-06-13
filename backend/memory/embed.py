"""Embed channel messages into Pinecone + memory_items catalog (384d fastembed)."""

import os
import traceback
from functools import lru_cache
from typing import Any

from db import get_supabase
from memory.pinecone_store import (
    build_pinecone_metadata,
    memory_vector_id,
    upsert_with_rollback_on_failure,
)
from workspace_settings import fetch_workspace_settings

EMBEDDING_DIM = 384
MIN_CONTENT_LEN = int(os.getenv("MEMORY_MIN_CONTENT_LEN", "12"))
MAX_CONTENT_LEN = int(os.getenv("MEMORY_MAX_CONTENT_LEN", "8000"))


@lru_cache(maxsize=1)
def _embedding_model():
    model_name = os.getenv("EMBED_MODEL", "BAAI/bge-small-en-v1.5")
    from fastembed import TextEmbedding

    return TextEmbedding(model_name=model_name)


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    vectors = list(_embedding_model().embed(texts))
    out: list[list[float]] = []
    for vec in vectors:
        row = vec.tolist() if hasattr(vec, "tolist") else list(vec)
        if len(row) != EMBEDDING_DIM:
            raise ValueError(
                f"Expected embedding dim {EMBEDDING_DIM}, got {len(row)}"
            )
        out.append(row)
    return out


def _should_embed(content: str) -> bool:
    text = content.strip()
    return len(text) >= MIN_CONTENT_LEN


def _channel_meta(supabase, channel_id: str) -> dict[str, str]:
    result = (
        supabase.table("channels")
        .select("slug,name")
        .eq("id", channel_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        return {"channel_slug": "unknown", "channel_name": "unknown"}
    row = rows[0]
    return {
        "channel_slug": row.get("slug") or "unknown",
        "channel_name": row.get("name") or "unknown",
    }


def _upsert_memory_item(
    supabase,
    *,
    workspace_id: str,
    channel_id: str,
    message_id: str,
    content: str,
    embedding: list[float],
    metadata: dict[str, Any],
    memory_tier: str,
    thread_id: str | None,
) -> None:
    vector_id = memory_vector_id(message_id, memory_tier)
    pinecone_meta = build_pinecone_metadata(
        workspace_id=workspace_id,
        channel_id=channel_id,
        memory_tier=memory_tier,
        source_id=message_id,
        source_type="message",
        content=content,
        metadata=metadata,
        thread_id=thread_id,
    )

    def _write_catalog() -> None:
        supabase.table("memory_items").upsert(
            {
                "workspace_id": workspace_id,
                "channel_id": channel_id,
                "source_type": "message",
                "source_id": message_id,
                "content": content,
                "metadata": metadata,
                "memory_tier": memory_tier,
                "thread_id": thread_id,
            },
            on_conflict="source_type,source_id,memory_tier",
        ).execute()

    upsert_with_rollback_on_failure(
        vector_id,
        embedding,
        pinecone_meta,
        _write_catalog,
    )


def embed_message_row(
    supabase,
    message: dict[str, Any],
    workspace_id: str,
) -> bool:
    """Upsert channel + optional workspace tier memory. Returns True if stored."""
    content = (message.get("content") or "").strip()
    if not _should_embed(content):
        return False

    message_id = message.get("id")
    channel_id = message.get("channel_id")
    if not message_id or not channel_id:
        return False

    try:
        embedding = embed_texts([content[:MAX_CONTENT_LEN]])[0]
    except Exception as e:
        print(f"[memory] embed failed for message {message_id}: {e}", flush=True)
        traceback.print_exc()
        return False

    channel_info = _channel_meta(supabase, channel_id)
    thread_id = message.get("thread_id")
    metadata = {
        "sender_name": message.get("sender_name"),
        "sender_type": message.get("sender_type"),
        "created_at": message.get("created_at"),
        "channel_id": channel_id,
        "channel_slug": channel_info["channel_slug"],
        "channel_name": channel_info["channel_name"],
        "thread_id": thread_id,
    }

    clipped = content[:MAX_CONTENT_LEN]
    try:
        _upsert_memory_item(
            supabase,
            workspace_id=workspace_id,
            channel_id=channel_id,
            message_id=message_id,
            content=clipped,
            embedding=embedding,
            metadata=metadata,
            memory_tier="channel",
            thread_id=thread_id,
        )

        settings = fetch_workspace_settings(supabase, workspace_id)
        if settings.get("workspace_memory_enabled", True):
            _upsert_memory_item(
                supabase,
                workspace_id=workspace_id,
                channel_id=channel_id,
                message_id=message_id,
                content=clipped,
                embedding=embedding,
                metadata=metadata,
                memory_tier="workspace",
                thread_id=thread_id,
            )

        print(f"[memory] embedded message {message_id}", flush=True)
        return True
    except Exception as e:
        print(f"[memory] store failed for message {message_id}: {e}", flush=True)
        traceback.print_exc()
        return False


def embed_message_by_id(message_id: str) -> None:
    supabase = get_supabase()
    try:
        msg_result = (
            supabase.table("messages")
            .select(
                "id,channel_id,content,sender_name,sender_type,created_at,thread_id"
            )
            .eq("id", message_id)
            .limit(1)
            .execute()
        )
        rows = msg_result.data or []
        if not rows:
            print(f"[memory] message not found: {message_id}", flush=True)
            return
        message = rows[0]

        ch_result = (
            supabase.table("channels")
            .select("workspace_id")
            .eq("id", message["channel_id"])
            .limit(1)
            .execute()
        )
        ch_rows = ch_result.data or []
        if not ch_rows:
            print(
                f"[memory] channel not found for message {message_id}",
                flush=True,
            )
            return

        embed_message_row(supabase, message, ch_rows[0]["workspace_id"])
    except Exception:
        print(
            f"[memory] embed_message_by_id crashed for {message_id}:\n"
            + traceback.format_exc(),
            flush=True,
        )


def backfill_channel_memory(channel_id: str) -> int:
    """Embed messages in channel that lack a memory_items row. Returns count embedded."""
    supabase = get_supabase()
    embedded = 0

    ch_result = (
        supabase.table("channels")
        .select("workspace_id")
        .eq("id", channel_id)
        .limit(1)
        .execute()
    )
    ch_rows = ch_result.data or []
    if not ch_rows:
        return 0
    workspace_id = ch_rows[0]["workspace_id"]

    mem_result = (
        supabase.table("memory_items")
        .select("source_id")
        .eq("channel_id", channel_id)
        .eq("source_type", "message")
        .eq("memory_tier", "channel")
        .execute()
    )
    done_ids = {r["source_id"] for r in (mem_result.data or [])}

    offset = 0
    page_size = 50
    while True:
        msg_result = (
            supabase.table("messages")
            .select(
                "id,channel_id,content,sender_name,sender_type,created_at,thread_id"
            )
            .eq("channel_id", channel_id)
            .order("created_at", desc=False)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = msg_result.data or []
        if not batch:
            break
        for message in batch:
            if message["id"] in done_ids:
                continue
            if embed_message_row(supabase, message, workspace_id):
                embedded += 1
                done_ids.add(message["id"])
        if len(batch) < page_size:
            break
        offset += page_size

    print(f"[memory] backfill channel {channel_id}: {embedded} new items", flush=True)
    return embedded
