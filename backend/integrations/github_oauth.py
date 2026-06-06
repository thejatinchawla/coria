"""GitHub OAuth — exchange authorization codes and resolve account info."""

import os

import httpx
from fastapi import HTTPException

from integrations.github import github_headers


def oauth_client_config() -> tuple[str, str]:
    client_id = os.getenv("GITHUB_CLIENT_ID", "").strip()
    client_secret = os.getenv("GITHUB_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=503,
            detail="GitHub OAuth is not configured on the server",
        )
    return client_id, client_secret


def oauth_authorize_url(*, redirect_uri: str, state: str) -> str:
    client_id, _ = oauth_client_config()
    scope = os.getenv("GITHUB_OAUTH_SCOPES", "read:user repo").strip()
    params = httpx.QueryParams(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": scope,
            "state": state,
        }
    )
    return f"https://github.com/login/oauth/authorize?{params}"


async def exchange_code_for_token(code: str, redirect_uri: str) -> str:
    client_id, client_secret = oauth_client_config()
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            json={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
            },
        )
    if response.status_code != 200:
        raise HTTPException(
            status_code=400,
            detail="GitHub token exchange failed",
        ) from None

    payload = response.json()
    if payload.get("error"):
        description = payload.get("error_description") or payload["error"]
        raise HTTPException(status_code=400, detail=str(description))

    token = (payload.get("access_token") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="GitHub did not return an access token")
    return token


async def fetch_github_login(token: str) -> str:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            "https://api.github.com/user",
            headers=github_headers(token),
        )
    if response.status_code != 200:
        raise HTTPException(
            status_code=400,
            detail="Could not verify GitHub account",
        ) from None
    login = (response.json().get("login") or "").strip()
    if not login:
        raise HTTPException(status_code=400, detail="GitHub account login missing")
    return login
