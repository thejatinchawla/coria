"""Embed channel messages into memory_items (bge-small-en-v1.5, 384d via fastembed)."""

import os
import traceback
from functools import lru_cache
from typing import Any

from db import get_supabase

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


def embed_message_row(
    supabase,
    message: dict[str, Any],
    workspace_id: str,
) -> bool:
    """Upsert one message into memory_items. Returns True if stored."""
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

    metadata = {
        "sender_name": message.get("sender_name"),
        "sender_type": message.get("sender_type"),
        "created_at": message.get("created_at"),
    }

    try:
        supabase.table("memory_items").upsert(
            {
                "workspace_id": workspace_id,
                "channel_id": channel_id,
                "source_type": "message",
                "source_id": message_id,
                "content": content[:MAX_CONTENT_LEN],
                "embedding": embedding,
                "metadata": metadata,
            },
            on_conflict="source_type,source_id",
        ).execute()
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
                "id,channel_id,content,sender_name,sender_type,created_at"
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
        .execute()
    )
    done_ids = {r["source_id"] for r in (mem_result.data or [])}

    offset = 0
    page_size = 50
    while True:
        msg_result = (
            supabase.table("messages")
            .select(
                "id,channel_id,content,sender_name,sender_type,created_at"
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
