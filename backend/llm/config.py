"""Resolve LLM provider, model, and API key for a workspace."""

from __future__ import annotations

import os
from dataclasses import dataclass

from workspace_settings import fetch_workspace_settings

DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"
DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5"


@dataclass(frozen=True)
class LlmConfig:
    provider: str
    model: str
    api_key: str | None
    source: str  # "workspace" | "env"


def get_llm_api_key_from_vault(supabase, workspace_id: str) -> str | None:
    if supabase is None:
        return None
    try:
        result = supabase.rpc("get_llm_api_key", {"p_workspace_id": workspace_id}).execute()
        key = result.data
        if isinstance(key, str) and key.strip():
            return key.strip()
    except Exception as e:
        print(f"[llm] vault key read failed: {e}", flush=True)
    return None


def _env_api_key(provider: str) -> str | None:
    if provider == "anthropic":
        key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        return key or None
    key = os.getenv("GROQ_API_KEY", "").strip()
    return key or None


def _default_model(provider: str) -> str:
    if provider == "anthropic":
        return DEFAULT_ANTHROPIC_MODEL
    return DEFAULT_GROQ_MODEL


def resolve_llm_config(supabase, workspace_id: str | None) -> LlmConfig:
    provider = os.getenv("LLM_PROVIDER", "groq").strip().lower() or "groq"
    model = (os.getenv("LLM_MODEL") or "").strip()
    api_key = _env_api_key(provider)
    source = "env"

    if workspace_id and supabase is not None:
        settings = fetch_workspace_settings(supabase, workspace_id)
        custom_provider = settings.get("llm_provider")
        custom_model = settings.get("llm_model")
        if custom_provider:
            provider = custom_provider
            source = "workspace"
            vault_key = get_llm_api_key_from_vault(supabase, workspace_id)
            if vault_key:
                api_key = vault_key
            else:
                api_key = _env_api_key(provider)
        if custom_model:
            model = custom_model

    if not model:
        model = _default_model(provider)

    if provider not in ("groq", "anthropic"):
        raise RuntimeError(f"Unknown LLM provider: {provider}")

    return LlmConfig(
        provider=provider,
        model=model,
        api_key=api_key,
        source=source,
    )
