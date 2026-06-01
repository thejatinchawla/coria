import type { SupabaseClient } from "@supabase/supabase-js"
import type { Agent, Channel, Member, Workspace, WorkspaceSettings } from "@/types"

export const DEMO_WORKSPACE_SLUG = "coria-demo"

/** Fallback if default agent row not readable yet (Divv) */
export const DIVV_AGENT_ID_FALLBACK = "00000000-0000-4000-8000-000000000003"

/** @deprecated use DIVV_AGENT_ID_FALLBACK */
export const ARIA_AGENT_ID_FALLBACK = DIVV_AGENT_ID_FALLBACK

export async function fetchWorkspace(
  supabase: SupabaseClient,
): Promise<Workspace | null> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("id,name,slug,created_at")
    .eq("slug", DEMO_WORKSPACE_SLUG)
    .maybeSingle()

  if (error) {
    console.error("[workspace] fetchWorkspace:", error.message)
    return null
  }

  return (data as Workspace | null) ?? null
}

export async function ensureDemoMember(
  supabase: SupabaseClient,
  userId: string,
  displayName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const workspace = await fetchWorkspace(supabase)
  if (!workspace) {
    return {
      ok: false,
      error:
        "Demo workspace not found. Run backend/supabase migration (supabase db push).",
    }
  }

  try {
    await supabase.rpc("accept_workspace_invite", {
      p_display_name: displayName,
    })
  } catch {
    /* no pending invite — continue */
  }

  const { data: existing, error: selectError } = await supabase
    .from("members")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("user_id", userId)
    .maybeSingle()

  if (selectError) {
    return { ok: false, error: selectError.message }
  }

  if (existing) return { ok: true }

  const { error: insertError } = await supabase.from("members").insert({
    workspace_id: workspace.id,
    user_id: userId,
    display_name: displayName,
    role: "member",
  })

  if (insertError) {
    if (insertError.code === "23505") return { ok: true }
    return { ok: false, error: insertError.message }
  }

  return { ok: true }
}

export async function fetchChannels(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<Channel[]> {
  const { data, error } = await supabase
    .from("channels")
    .select("id,workspace_id,name,slug,type,created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[workspace] fetchChannels:", error.message)
    return []
  }

  return (data as Channel[] | null) ?? []
}

export async function fetchChannelBySlug(
  supabase: SupabaseClient,
  workspaceId: string,
  slug: string,
): Promise<Channel | null> {
  const { data, error } = await supabase
    .from("channels")
    .select("id,workspace_id,name,slug,type,created_at")
    .eq("workspace_id", workspaceId)
    .eq("slug", slug)
    .maybeSingle()

  if (error) {
    console.error("[workspace] fetchChannelBySlug:", error.message)
    return null
  }

  return (data as Channel | null) ?? null
}

export async function fetchMemberId(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    console.error("[workspace] fetchMemberId:", error.message)
    return null
  }

  return data?.id ?? null
}

export async function fetchMember(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<Member | null> {
  const { data, error } = await supabase
    .from("members")
    .select(
      "id,workspace_id,user_id,display_name,role,avatar_url,bio,created_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    console.error("[workspace] fetchMember:", error.message)
    return null
  }

  return (data as Member | null) ?? null
}

export async function fetchAgentBySlug(
  supabase: SupabaseClient,
  workspaceId: string,
  mentionSlug: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("agents")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("mention_slug", mentionSlug.toLowerCase())
    .maybeSingle()

  if (error) {
    console.error("[workspace] fetchAgentBySlug:", error.message)
    return null
  }

  return data?.id ?? null
}

export async function fetchAriaAgentId(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("agents")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("mention_slug", "aria")
    .maybeSingle()

  if (error) {
    console.error("[workspace] fetchAriaAgentId:", error.message)
    return null
  }

  return data?.id ?? null
}

export async function fetchDefaultAgentId(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<string | null> {
  const { data: settings, error: settingsError } = await supabase
    .from("workspace_settings")
    .select("default_agent_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (settingsError) {
    console.error("[workspace] fetchDefaultAgentId settings:", settingsError.message)
  } else if (settings?.default_agent_id) {
    return settings.default_agent_id
  }

  const { data, error } = await supabase
    .from("agents")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("mention_slug", "divv")
    .maybeSingle()

  if (error) {
    console.error("[workspace] fetchDefaultAgentId divv:", error.message)
    return null
  }

  return data?.id ?? null
}

export async function fetchAgents(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<Agent[]> {
  const { data, error } = await supabase
    .from("agents")
    .select(
      "id,workspace_id,name,mention_slug,status,system_prompt,avatar_url,color,allowed_tools,template_id,use_workspace_memory,created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[workspace] fetchAgents:", error.message)
    return []
  }

  return (data as Agent[] | null) ?? []
}

export async function fetchWorkspaceSettings(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<WorkspaceSettings | null> {
  const { data, error } = await supabase
    .from("workspace_settings")
    .select(
      "workspace_id,agents_globally_paused,monthly_tool_budget,tool_budget_used,approval_ttl_hours,default_agent_id,workspace_memory_enabled,updated_at",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (error) {
    console.error("[workspace] fetchWorkspaceSettings:", error.message)
    return null
  }

  return (data as WorkspaceSettings | null) ?? null
}

export async function fetchPendingApprovalCount(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("action_blocks")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")

  if (error) {
    console.error("[workspace] fetchPendingApprovalCount:", error.message)
    return 0
  }

  return count ?? 0
}

export function slugifyChannelName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}
