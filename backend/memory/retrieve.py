"""RAG retrieval: Pinecone similarity + recency rerank + token budget."""

import os
import traceback
from datetime import datetime, timezone
from typing import Any

from memory.embed import embed_texts
from memory.pinecone_store import (
    channel_memory_filter,
    query_memory,
    workspace_memory_filter,
)

RAG_TOP_K = int(os.getenv("RAG_TOP_K", "8"))
RAG_WORKSPACE_TOP_K = int(os.getenv("RAG_WORKSPACE_TOP_K", "6"))
RAG_MAX_CONTEXT_TOKENS = int(os.getenv("RAG_MAX_CONTEXT_TOKENS", "4000"))
RAG_MIN_SIMILARITY = float(os.getenv("RAG_MIN_SIMILARITY", "0.7"))
RAG_WORKSPACE_MIN_SIMILARITY = float(
    os.getenv("RAG_WORKSPACE_MIN_SIMILARITY", "0.65")
)


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def trim_to_token_budget(
    chunks: list[dict[str, Any]],
    max_tokens: int = RAG_MAX_CONTEXT_TOKENS,
) -> list[dict[str, Any]]:
    total = 0
    kept: list[dict[str, Any]] = []
    for chunk in chunks:
        content = chunk.get("content") or ""
        cost = estimate_tokens(content)
        if total + cost > max_tokens:
            break
        total += cost
        kept.append(chunk)
    return kept


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def rerank_with_recency(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    scored: list[tuple[float, dict[str, Any]]] = []
    for chunk in chunks:
        sim = float(chunk.get("similarity") or 0)
        created = _parse_ts((chunk.get("metadata") or {}).get("created_at"))
        recency = 0.5
        if created:
            age_hours = max(0.0, (now - created).total_seconds() / 3600)
            recency = max(0.0, 1.0 - age_hours / (24 * 30))
        score = sim * 0.85 + recency * 0.15
        scored.append((score, chunk))
    scored.sort(key=lambda x: -x[0])
    return [c for _, c in scored]


def retrieve_channel_memory(
    supabase,
    channel_id: str,
    query: str,
    *,
    top_k: int = RAG_TOP_K,
    min_similarity: float = RAG_MIN_SIMILARITY,
    max_tokens: int = RAG_MAX_CONTEXT_TOKENS,
) -> list[dict[str, Any]]:
    """Return ranked memory chunks for prompt injection."""
    del supabase  # catalog in Postgres; vectors in Pinecone
    text = query.strip()
    if not text:
        return []

    try:
        query_embedding = embed_texts([text])[0]
    except Exception as e:
        print(f"[memory] query embed failed: {e}", flush=True)
        traceback.print_exc()
        return []

    try:
        chunks = query_memory(
            vector=query_embedding,
            filter_dict=channel_memory_filter(channel_id),
            top_k=top_k,
            min_score=min_similarity,
        )
    except Exception as e:
        print(f"[memory] pinecone retrieve failed: {e}", flush=True)
        traceback.print_exc()
        return []

    if not chunks:
        print(
            f"[memory] retrieve channel={channel_id} hits=0 "
            f"(min_sim={min_similarity})",
            flush=True,
        )
        return []

    ranked = rerank_with_recency(chunks)
    trimmed = trim_to_token_budget(ranked, max_tokens)
    print(
        f"[memory] retrieve channel={channel_id} "
        f"hits={len(chunks)} used={len(trimmed)}",
        flush=True,
    )
    return trimmed


def retrieve_workspace_memory(
    supabase,
    workspace_id: str,
    query: str,
    *,
    top_k: int = RAG_WORKSPACE_TOP_K,
    min_similarity: float = RAG_WORKSPACE_MIN_SIMILARITY,
    max_tokens: int = RAG_MAX_CONTEXT_TOKENS,
) -> list[dict[str, Any]]:
    """Cross-channel workspace memory (memory_tier = workspace)."""
    del supabase
    text = query.strip()
    if not text:
        return []

    try:
        query_embedding = embed_texts([text])[0]
    except Exception as e:
        print(f"[memory] workspace query embed failed: {e}", flush=True)
        traceback.print_exc()
        return []

    try:
        chunks = query_memory(
            vector=query_embedding,
            filter_dict=workspace_memory_filter(workspace_id),
            top_k=top_k,
            min_score=min_similarity,
        )
    except Exception as e:
        print(f"[memory] pinecone workspace retrieve failed: {e}", flush=True)
        traceback.print_exc()
        return []

    if not chunks:
        print(
            f"[memory] workspace retrieve workspace={workspace_id} hits=0 "
            f"(min_sim={min_similarity})",
            flush=True,
        )
        return []

    ranked = rerank_with_recency(chunks)
    trimmed = trim_to_token_budget(ranked, max_tokens)
    print(
        f"[memory] workspace retrieve workspace={workspace_id} "
        f"hits={len(chunks)} used={len(trimmed)}",
        flush=True,
    )
    return trimmed
