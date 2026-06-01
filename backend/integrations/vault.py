"""Resolve GitHub tokens from Supabase Vault or env fallback."""

import os


def get_github_token(supabase, workspace_id: str | None) -> str | None:
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if workspace_id and supabase is not None:
        try:
            result = supabase.rpc(
                "get_github_pat", {"p_workspace_id": workspace_id}
            ).execute()
            vault_token = result.data
            if isinstance(vault_token, str) and vault_token.strip():
                return vault_token.strip()
        except Exception as e:
            print(f"[integrations] vault PAT read failed: {e}", flush=True)
    return token or None
