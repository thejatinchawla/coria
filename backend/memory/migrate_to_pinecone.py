"""Backfill Pinecone from existing memory_items catalog rows."""

from __future__ import annotations

import argparse
import traceback

from db import get_supabase
from memory.embed import embed_texts
from memory.pinecone_store import (
    build_pinecone_metadata,
    memory_vector_id,
    upsert_memory_vector,
)


def migrate_rows(*, workspace_id: str | None, dry_run: bool) -> tuple[int, int]:
    supabase = get_supabase()
    query = supabase.table("memory_items").select(
        "id,workspace_id,channel_id,source_type,source_id,content,memory_tier,"
        "metadata,thread_id"
    )
    if workspace_id:
        query = query.eq("workspace_id", workspace_id)

    offset = 0
    page_size = 100
    ok = 0
    failed = 0

    while True:
        result = query.range(offset, offset + page_size - 1).execute()
        rows = result.data or []
        if not rows:
            break

        for row in rows:
            content = (row.get("content") or "").strip()
            source_id = row.get("source_id")
            memory_tier = row.get("memory_tier") or "channel"
            if not content or not source_id:
                failed += 1
                continue

            vector_id = memory_vector_id(source_id, memory_tier)
            metadata = row.get("metadata") or {}

            if dry_run:
                print(f"[dry-run] would upsert {vector_id}", flush=True)
                ok += 1
                continue

            try:
                embedding = embed_texts([content])[0]
                pinecone_meta = build_pinecone_metadata(
                    workspace_id=row["workspace_id"],
                    channel_id=row["channel_id"],
                    memory_tier=memory_tier,
                    source_id=source_id,
                    source_type=row.get("source_type") or "message",
                    content=content,
                    metadata=metadata,
                    thread_id=row.get("thread_id"),
                )
                upsert_memory_vector(vector_id, embedding, pinecone_meta)
                ok += 1
            except Exception as e:
                failed += 1
                print(
                    f"[migrate] failed {vector_id}: {e}",
                    flush=True,
                )
                traceback.print_exc()

        if len(rows) < page_size:
            break
        offset += page_size

    return ok, failed


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Re-embed memory_items content and upsert vectors to Pinecone"
    )
    parser.add_argument("--workspace-id", default=None, help="Limit to one workspace")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print actions without writing to Pinecone",
    )
    args = parser.parse_args()

    ok, failed = migrate_rows(workspace_id=args.workspace_id, dry_run=args.dry_run)
    print(f"[migrate] done ok={ok} failed={failed}", flush=True)


if __name__ == "__main__":
    main()
