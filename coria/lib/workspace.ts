import type { SupabaseClient } from "@supabase/supabase-js"
import type { Channel, Workspace } from "@/types"

export const DEMO_WORKSPACE_SLUG = "coria-demo"

/** Fallback if agents row not readable yet */
export const ARIA_AGENT_ID_FALLBACK = "00000000-0000-4000-8000-000000000003"

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

export function slugifyChannelName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}
