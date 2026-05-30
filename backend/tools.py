"""Tool registry — Tavily web search + GitHub read (public API)."""

import base64
import os

import httpx

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
]


async def web_search(args: dict) -> dict:
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


def _parse_repo(repo: str) -> tuple[str, str] | None:
    repo = repo.strip().strip("/")
    if repo.startswith("https://github.com/"):
        repo = repo.removeprefix("https://github.com/")
    parts = [p for p in repo.split("/") if p]
    if len(parts) < 2:
        return None
    return parts[0], parts[1]


async def github_read(args: dict) -> dict:
    repo_raw = (args.get("repo") or "").strip()
    parsed = _parse_repo(repo_raw)
    if not parsed:
        return {"error": "repo must be owner/name (e.g. vercel/next.js)"}

    owner, name = parsed
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "coria-agent",
    }
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"

    base = f"https://api.github.com/repos/{owner}/{name}"
    issue_number = args.get("issue_number")

    async with httpx.AsyncClient(timeout=30.0) as client:
        repo_resp = await client.get(base, headers=headers)
        if repo_resp.status_code == 404:
            return {"error": f"repository not found: {owner}/{name}"}
        repo_resp.raise_for_status()
        repo_data = repo_resp.json()

        readme_text = None
        readme_resp = await client.get(f"{base}/readme", headers=headers)
        if readme_resp.status_code == 200:
            readme_json = readme_resp.json()
            encoded = readme_json.get("content") or ""
            readme_text = base64.b64decode(encoded).decode(
                "utf-8", errors="replace"
            )[:4000]

        issue_detail = None
        if issue_number is not None:
            issue_resp = await client.get(
                f"{base}/issues/{int(issue_number)}", headers=headers
            )
            if issue_resp.status_code == 200:
                issue_detail = issue_resp.json()

        issues_resp = await client.get(
            f"{base}/issues",
            headers=headers,
            params={"state": "open", "per_page": 5},
        )
        open_issues = []
        if issues_resp.status_code == 200:
            for item in issues_resp.json():
                if "pull_request" in item:
                    continue
                open_issues.append(
                    {
                        "number": item.get("number"),
                        "title": item.get("title"),
                        "state": item.get("state"),
                    }
                )

    return {
        "repo": {
            "full_name": repo_data.get("full_name"),
            "description": repo_data.get("description"),
            "stars": repo_data.get("stargazers_count"),
            "default_branch": repo_data.get("default_branch"),
            "url": repo_data.get("html_url"),
        },
        "readme_excerpt": readme_text,
        "open_issues": open_issues,
        "issue": issue_detail,
    }


TOOL_REGISTRY: dict[str, callable] = {
    "web_search": web_search,
    "github_read": github_read,
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
