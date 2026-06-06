import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchChannelsForMember } from "@/lib/channel-members-data"
import type { Agent, Channel, Member, Workspace, WorkspaceSettings } from "@/types"

export const DEMO_WORKSPACE_SLUG = "coria-demo"

/** Fallback if default agent row not readable yet */
export const DIVV_AGENT_ID_FALLBACK = "00000000-0000-4000-8000-000000000003"

export function slugifyWorkspaceName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

export async function fetchUserWorkspaces(
  supabase: SupabaseClient,
  userId: string,
): Promise<Workspace[]> {
  const { data: memberships, error: memberError } = await supabase
    .from("members")
    .select("workspace_id")
    .eq("user_id", userId)

  if (memberError) {
    console.error("[workspace] fetchUserWorkspaces members:", memberError.message)
    return []
  }

  const workspaceIds = (memberships ?? []).map((m) => m.workspace_id)
  if (workspaceIds.length === 0) return []

  const { data, error } = await supabase
    .from("workspaces")
    .select("id,name,slug,created_at")
    .in("id", workspaceIds)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[workspace] fetchUserWorkspaces:", error.message)
    return []
  }

  return (data as Workspace[] | null) ?? []
}

export async function fetchWorkspace(
  supabase: SupabaseClient,
  userId?: string,
  activeWorkspaceId?: string | null,
): Promise<Workspace | null> {
  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null
    userId = user.id
  }

  const workspaces = await fetchUserWorkspaces(supabase, userId)
  if (workspaces.length === 0) return null

  if (activeWorkspaceId) {
    const active = workspaces.find((w) => w.id === activeWorkspaceId)
    if (active) return active
  }

  return workspaces[0] ?? null
}

export async function createWorkspace(
  supabase: SupabaseClient,
  name: string,
  displayName: string,
): Promise<{ ok: true; workspaceId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("create_workspace", {
    p_name: name.trim(),
    p_display_name: displayName.trim(),
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true, workspaceId: data as string }
}

/** @deprecated Prefer createWorkspace for new users; kept for demo bootstrap */
export async function ensureDemoMember(
  supabase: SupabaseClient,
  userId: string,
  displayName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existingMembership } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle()

  if (existingMembership) return { ok: true }

  const { data: demo } = await supabase
    .from("workspaces")
    .select("id")
    .eq("slug", DEMO_WORKSPACE_SLUG)
    .maybeSingle()

  if (!demo) {
    return {
      ok: false,
      error:
        "No workspace found. Create a workspace to get started.",
    }
  }

  try {
    await supabase.rpc("accept_workspace_invite", {
      p_display_name: displayName,
    })
  } catch {
    /* no pending invite */
  }

  const { data: existing, error: selectError } = await supabase
    .from("members")
    .select("id")
    .eq("workspace_id", demo.id)
    .eq("user_id", userId)
    .maybeSingle()

  if (selectError) {
    return { ok: false, error: selectError.message }
  }

  if (existing) return { ok: true }

  const { error: insertError } = await supabase.from("members").insert({
    workspace_id: demo.id,
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
  memberId?: string | null,
): Promise<Channel[]> {
  if (memberId) {
    return fetchChannelsForMember(supabase, workspaceId, memberId)
  }

  const { data, error } = await supabase
    .from("channels")
    .select("id,workspace_id,name,slug,type,description,created_at")
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
    .select("id,workspace_id,name,slug,type,description,created_at")
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
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("[workspace] fetchDefaultAgentId:", error.message)
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
      "workspace_id,agents_globally_paused,monthly_tool_budget,tool_budget_used,approval_ttl_hours,default_agent_id,workspace_memory_enabled,llm_provider,llm_model,updated_at",
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

export async function updateWorkspaceName(
  supabase: SupabaseClient,
  workspaceId: string,
  name: string,
): Promise<{ ok: true; workspace: Workspace } | { ok: false; error: string }> {
  const trimmed = name.trim()
  if (!trimmed) {
    return { ok: false, error: "Workspace name is required." }
  }

  const { data, error } = await supabase
    .from("workspaces")
    .update({ name: trimmed })
    .eq("id", workspaceId)
    .select("id,name,slug,created_at")
    .single()

  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true, workspace: data as Workspace }
}

export async function deleteWorkspace(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("workspaces").delete().eq("id", workspaceId)

  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true }
}

export async function updateChannel(
  supabase: SupabaseClient,
  workspaceId: string,
  channelId: string,
  input: {
    name: string
    description?: string | null
    type: Channel["type"]
  },
): Promise<
  | { ok: true; channel: Channel }
  | { ok: false; error: string; status?: number }
> {
  const name = input.name.trim()
  if (!name) {
    return { ok: false, error: "Channel name is required.", status: 400 }
  }

  const slug = slugifyChannelName(name)
  if (!slug) {
    return {
      ok: false,
      error: "Use letters or numbers in the channel name.",
      status: 400,
    }
  }

  const description = input.description?.trim() || null
  if (description && description.length > 280) {
    return {
      ok: false,
      error: "Description must be 280 characters or fewer.",
      status: 400,
    }
  }

  if (input.type !== "hybrid" && input.type !== "human_only") {
    return { ok: false, error: "Invalid channel type.", status: 400 }
  }

  const { data, error } = await supabase
    .from("channels")
    .update({
      name,
      slug,
      description,
      type: input.type,
    })
    .eq("id", channelId)
    .eq("workspace_id", workspaceId)
    .select("id,workspace_id,name,slug,type,description,created_at")
    .single()

  if (error) {
    const status = error.code === "23505" ? 409 : 400
    const message =
      error.code === "23505"
        ? "A channel with that name already exists."
        : error.message
    return { ok: false, error: message, status }
  }

  return { ok: true, channel: data as Channel }
}

export async function deleteChannel(
  supabase: SupabaseClient,
  workspaceId: string,
  channelId: string,
  memberId?: string | null,
): Promise<
  | { ok: true; fallbackChannel: Channel }
  | { ok: false; error: string; status?: number }
> {
  const channels = await fetchChannels(supabase, workspaceId, memberId)
  if (channels.length <= 1) {
    return {
      ok: false,
      error: "Cannot delete the last channel in a workspace.",
      status: 400,
    }
  }

  const target = channels.find((c) => c.id === channelId)
  if (!target) {
    return { ok: false, error: "Channel not found.", status: 404 }
  }

  if (target.slug === "general") {
    return {
      ok: false,
      error: "Cannot delete #general — it is the default workspace channel.",
      status: 400,
    }
  }

  const { error } = await supabase
    .from("channels")
    .delete()
    .eq("id", channelId)
    .eq("workspace_id", workspaceId)

  if (error) {
    return { ok: false, error: error.message }
  }

  const remaining = channels.filter((c) => c.id !== channelId)
  const fallback =
    remaining.find((c) => c.slug === "general") ?? remaining[0]!

  return { ok: true, fallbackChannel: fallback }
}
