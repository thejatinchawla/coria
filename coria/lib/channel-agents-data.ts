import type { SupabaseClient } from "@supabase/supabase-js"
import type { Agent } from "@/types"

const AGENT_COLUMNS =
  "id,workspace_id,name,mention_slug,status,system_prompt,avatar_url,color,allowed_tools,template_id,use_workspace_memory,created_at"

export async function fetchChannelAgents(
  supabase: SupabaseClient,
  channelId: string,
): Promise<Agent[]> {
  const { data, error } = await supabase
    .from("channel_agents")
    .select(`agent:agents!channel_agents_agent_id_fkey(${AGENT_COLUMNS})`)
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[channel-agents] fetchChannelAgents:", error.message)
    return []
  }

  return (data ?? [])
    .map((row) => {
      const agent = row.agent
      if (!agent || Array.isArray(agent)) return null
      return agent as Agent
    })
    .filter((agent): agent is Agent => agent !== null)
}

export async function addChannelAgent(
  supabase: SupabaseClient,
  channelId: string,
  agentId: string,
  addedByMemberId: string,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const { error } = await supabase.from("channel_agents").insert({
    channel_id: channelId,
    agent_id: agentId,
    added_by: addedByMemberId,
  })

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "That agent is already in this conversation.",
        status: 409,
      }
    }
    return { ok: false, error: error.message, status: 400 }
  }

  return { ok: true }
}

export async function removeChannelAgent(
  supabase: SupabaseClient,
  channelId: string,
  agentId: string,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const { error } = await supabase
    .from("channel_agents")
    .delete()
    .eq("channel_id", channelId)
    .eq("agent_id", agentId)

  if (error) {
    return { ok: false, error: error.message, status: 400 }
  }

  return { ok: true }
}
