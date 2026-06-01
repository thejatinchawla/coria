"""GitHub API helpers — read repos/issues, post comments, create PRs."""

import base64
import os

import httpx

from integrations.vault import get_github_token


def parse_repo(repo: str) -> tuple[str, str] | None:
    repo = repo.strip().strip("/")
    if repo.startswith("https://github.com/"):
        repo = repo.removeprefix("https://github.com/")
    parts = [p for p in repo.split("/") if p]
    if len(parts) < 2:
        return None
    return parts[0], parts[1]


def github_headers(token: str | None = None) -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "coria-agent",
    }
    if not token:
        token = os.getenv("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _resolve_token(supabase, ctx) -> str | None:
    workspace_id = getattr(ctx, "workspace_id", None) if ctx else None
    return get_github_token(supabase, workspace_id)


async def github_read(args: dict, *, supabase=None, ctx=None) -> dict:
    repo_raw = (args.get("repo") or "").strip()
    parsed = parse_repo(repo_raw)
    if not parsed:
        return {"error": "repo must be owner/name (e.g. vercel/next.js)"}

    owner, name = parsed
    headers = github_headers(_resolve_token(supabase, ctx))
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


async def github_post_comment(args: dict, *, supabase=None, ctx=None) -> dict:
    repo_raw = (args.get("repo") or "").strip()
    body = (args.get("body") or "").strip()
    issue_number = args.get("issue_number")

    if not body:
        return {"error": "body is required"}
    if issue_number is None:
        return {"error": "issue_number is required"}

    parsed = parse_repo(repo_raw)
    if not parsed:
        return {"error": "repo must be owner/name (e.g. vercel/next.js)"}

    token = _resolve_token(supabase, ctx)
    if not token:
        return {
            "error": "GitHub token not configured (add PAT in settings or GITHUB_TOKEN env)"
        }

    owner, name = parsed
    headers = github_headers(token)
    url = (
        f"https://api.github.com/repos/{owner}/{name}/issues/"
        f"{int(issue_number)}/comments"
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            url, headers=headers, json={"body": body}
        )
        if response.status_code == 404:
            return {"error": f"issue not found: {owner}/{name}#{issue_number}"}
        if response.status_code == 403:
            return {"error": "GitHub API forbidden — check token permissions"}
        response.raise_for_status()
        data = response.json()

    return {
        "comment_id": data.get("id"),
        "html_url": data.get("html_url"),
        "body": data.get("body"),
    }


async def github_create_pr(args: dict, *, supabase=None, ctx=None) -> dict:
    repo_raw = (args.get("repo") or "").strip()
    title = (args.get("title") or "").strip()
    head = (args.get("head") or "").strip()
    base = (args.get("base") or "main").strip()
    body = (args.get("body") or "").strip()
    draft = bool(args.get("draft", True))

    if not title or not head:
        return {"error": "title and head branch are required"}

    parsed = parse_repo(repo_raw)
    if not parsed:
        return {"error": "repo must be owner/name (e.g. vercel/next.js)"}

    token = _resolve_token(supabase, ctx)
    if not token:
        return {
            "error": "GitHub token not configured (add PAT in settings or GITHUB_TOKEN env)"
        }

    owner, name = parsed
    headers = github_headers(token)
    url = f"https://api.github.com/repos/{owner}/{name}/pulls"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            url,
            headers=headers,
            json={
                "title": title,
                "head": head,
                "base": base,
                "body": body,
                "draft": draft,
            },
        )
        if response.status_code == 422:
            detail = response.json()
            errors = detail.get("errors") or []
            if errors:
                parts = [
                    e.get("message") or str(e)
                    for e in errors
                    if isinstance(e, dict)
                ]
                msg = "; ".join(p for p in parts if p)
            else:
                msg = detail.get("message", "GitHub rejected PR creation")
            return {"error": msg or "GitHub rejected PR creation"}
        if response.status_code == 404:
            return {"error": f"repository not found: {owner}/{name}"}
        if response.status_code == 403:
            return {"error": "GitHub API forbidden — check token permissions"}
        response.raise_for_status()
        data = response.json()

    return {
        "number": data.get("number"),
        "html_url": data.get("html_url"),
        "title": data.get("title"),
        "state": data.get("state"),
        "draft": data.get("draft"),
    }
