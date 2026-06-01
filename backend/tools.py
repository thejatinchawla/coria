"""Tool registry — Tavily web search + GitHub read/post."""

from integrations.github import (
    github_create_pr,
    github_post_comment,
    github_read,
)

TOOL_DEFINITIONS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Search the web for current information. Use when the user asks "
                "about recent events, live data, or anything not in channel history."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Concise search query",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "github_read",
            "description": (
                "Read public GitHub repo info: README summary and recent open issues. "
                "Use for questions about a specific repository."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "repo": {
                        "type": "string",
                        "description": "Repository as owner/name, e.g. vercel/next.js",
                    },
                    "issue_number": {
                        "type": "integer",
                        "description": "Optional issue number for detail",
                    },
                },
                "required": ["repo"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "workspace_search",
            "description": (
                "Search workspace memory across all channels for past decisions, "
                "discussions, and context. Use when the user asks about something "
                "that may have happened in another channel. Results include channel names."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "What to search for in workspace history",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "github_post_comment",
            "description": (
                "Post a comment on a GitHub issue. Requires human approval before "
                "the comment is published. Use when the user asks you to comment on "
                "or reply to a specific issue."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "repo": {
                        "type": "string",
                        "description": "Repository as owner/name",
                    },
                    "issue_number": {
                        "type": "integer",
                        "description": "Issue number to comment on",
                    },
                    "body": {
                        "type": "string",
                        "description": "Comment text (markdown supported)",
                    },
                },
                "required": ["repo", "issue_number", "body"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "github_create_pr",
            "description": (
                "Open a draft pull request on GitHub. Requires human approval. "
                "Use when asked to create a PR from a branch."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "repo": {
                        "type": "string",
                        "description": "Repository as owner/name",
                    },
                    "title": {
                        "type": "string",
                        "description": "PR title",
                    },
                    "head": {
                        "type": "string",
                        "description": "Head branch (source)",
                    },
                    "base": {
                        "type": "string",
                        "description": "Base branch (target), default main",
                    },
                    "body": {
                        "type": "string",
                        "description": "PR description (markdown)",
                    },
                    "draft": {
                        "type": "boolean",
                        "description": "Create as draft PR (default true)",
                    },
                },
                "required": ["repo", "title", "head"],
            },
        },
    },
]


async def web_search(args: dict) -> dict:
    import os

    import httpx

    query = (args.get("query") or "").strip()
    if not query:
        return {"error": "query is required"}

    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        return {"error": "TAVILY_API_KEY not configured on backend"}

    max_results = min(int(args.get("max_results", 5)), 10)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "max_results": max_results,
                "search_depth": "basic",
                "include_answer": True,
            },
        )
        response.raise_for_status()
        data = response.json()

    return {
        "answer": data.get("answer"),
        "results": [
            {
                "title": item.get("title"),
                "url": item.get("url"),
                "content": item.get("content"),
            }
            for item in data.get("results", [])
        ],
    }


async def workspace_search(
    args: dict,
    *,
    supabase=None,
    ctx=None,
) -> dict:
    from memory.retrieve import retrieve_workspace_memory

    query = (args.get("query") or "").strip()
    if not query:
        return {"error": "query is required"}
    if supabase is None or ctx is None:
        return {"error": "workspace_search context unavailable"}

    chunks = retrieve_workspace_memory(supabase, ctx.workspace_id, query)
    results = []
    for chunk in chunks:
        meta = chunk.get("metadata") or {}
        results.append(
            {
                "content": chunk.get("content"),
                "channel": meta.get("channel_slug") or meta.get("channel_name"),
                "sender": meta.get("sender_name"),
                "created_at": meta.get("created_at"),
                "similarity": chunk.get("similarity"),
            }
        )
    return {"results": results, "count": len(results)}


TOOL_REGISTRY: dict[str, callable] = {
    "web_search": web_search,
    "github_read": github_read,
    "github_post_comment": github_post_comment,
    "github_create_pr": github_create_pr,
    "workspace_search": workspace_search,
}


def tools_for_agent(agent: dict) -> list[dict]:
    allowed = set(agent.get("allowed_tools") or [])
    if not allowed:
        return TOOL_DEFINITIONS
    return [
        t
        for t in TOOL_DEFINITIONS
        if t.get("function", {}).get("name") in allowed
    ]
