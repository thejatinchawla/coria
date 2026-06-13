"""Pinecone vector store for channel/workspace memory (384d cosine)."""

from __future__ import annotations

import os
import traceback
from functools import lru_cache
from typing import Any, Callable

PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "coria-memory")


def memory_vector_id(source_id: str, memory_tier: str) -> str:
    return f"{source_id}_{memory_tier}"


def build_pinecone_metadata(
    *,
    workspace_id: str,
    channel_id: str,
    memory_tier: str,
    source_id: str,
    source_type: str,
    content: str,
    metadata: dict[str, Any],
    thread_id: str | None,
) -> dict[str, str | float | bool | list[str]]:
    """Flatten metadata for Pinecone (no null values)."""
    out: dict[str, str | float | bool | list[str]] = {
        "workspace_id": workspace_id,
        "channel_id": channel_id,
        "memory_tier": memory_tier,
        "source_id": source_id,
        "source_type": source_type,
        "content": content,
        "sender_name": str(metadata.get("sender_name") or ""),
        "sender_type": str(metadata.get("sender_type") or ""),
        "created_at": str(metadata.get("created_at") or ""),
        "channel_slug": str(metadata.get("channel_slug") or ""),
        "channel_name": str(metadata.get("channel_name") or ""),
        "thread_id": str(thread_id or metadata.get("thread_id") or ""),
    }
    return out


def metadata_to_chunk(vector_id: str, meta: dict[str, Any], similarity: float) -> dict[str, Any]:
    """Map Pinecone match metadata back to RAG chunk shape."""
    chunk_meta = {
        "sender_name": meta.get("sender_name"),
        "sender_type": meta.get("sender_type"),
        "created_at": meta.get("created_at"),
        "channel_id": meta.get("channel_id"),
        "channel_slug": meta.get("channel_slug"),
        "channel_name": meta.get("channel_name"),
        "thread_id": meta.get("thread_id") or None,
    }
    if chunk_meta.get("thread_id") == "":
        chunk_meta["thread_id"] = None

    chunk: dict[str, Any] = {
        "id": vector_id,
        "content": meta.get("content") or "",
        "metadata": chunk_meta,
        "similarity": similarity,
    }
    channel_id = meta.get("channel_id")
    if channel_id:
        chunk["channel_id"] = channel_id
    return chunk


@lru_cache(maxsize=1)
def _pinecone_client():
    api_key = os.getenv("PINECONE_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("PINECONE_API_KEY must be set")
    from pinecone import Pinecone

    return Pinecone(api_key=api_key)


def get_index():
    return _pinecone_client().Index(PINECONE_INDEX_NAME)


def upsert_memory_vector(
    vector_id: str,
    values: list[float],
    metadata: dict[str, Any],
) -> None:
    index = get_index()
    index.upsert(vectors=[{"id": vector_id, "values": values, "metadata": metadata}])


def delete_vectors(vector_ids: list[str]) -> None:
    if not vector_ids:
        return
    index = get_index()
    index.delete(ids=vector_ids)


def delete_by_filter(filter_dict: dict[str, Any]) -> None:
    index = get_index()
    index.delete(filter=filter_dict)


def query_memory(
    *,
    vector: list[float],
    filter_dict: dict[str, Any],
    top_k: int,
    min_score: float,
) -> list[dict[str, Any]]:
    index = get_index()
    response = index.query(
        vector=vector,
        filter=filter_dict,
        top_k=top_k,
        include_metadata=True,
    )
    chunks: list[dict[str, Any]] = []
    for match in response.matches or []:
        score = float(match.score or 0)
        if score < min_score:
            continue
        meta = dict(match.metadata or {})
        chunks.append(metadata_to_chunk(match.id, meta, score))
    return chunks


def channel_memory_filter(channel_id: str) -> dict[str, Any]:
    return {
        "channel_id": {"$eq": channel_id},
        "memory_tier": {"$eq": "channel"},
    }


def workspace_memory_filter(workspace_id: str) -> dict[str, Any]:
    return {
        "workspace_id": {"$eq": workspace_id},
        "memory_tier": {"$eq": "workspace"},
    }


def upsert_with_rollback_on_failure(
    vector_id: str,
    values: list[float],
    pinecone_metadata: dict[str, Any],
    upsert_postgres: Callable[[], None],
) -> None:
    """Pinecone first, then Postgres; delete vector if catalog write fails."""
    upsert_memory_vector(vector_id, values, pinecone_metadata)
    try:
        upsert_postgres()
    except Exception:
        try:
            delete_vectors([vector_id])
        except Exception as rollback_err:
            print(
                f"[pinecone] rollback failed for {vector_id}: {rollback_err}",
                flush=True,
            )
            traceback.print_exc()
        raise
