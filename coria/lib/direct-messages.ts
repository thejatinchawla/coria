import type { SupabaseClient } from "@supabase/supabase-js"
import type { Channel } from "@/types"

export const CHANNEL_SELECT =
  "id,workspace_id,name,slug,type,description,direct_agent_id,direct_peer_member_id,created_at"

export function isPublicChannel(channel: Channel): boolean {
  return channel.type !== "direct"
}

export async function ensureAgentDm(
  supabase: SupabaseClient,
  workspaceId: string,
  agentId: string,
): Promise<{ channel: Channel | null; error: string | null }> {
  const { data, error } = await supabase.rpc("ensure_agent_dm", {
    p_workspace_id: workspaceId,
    p_agent_id: agentId,
  })

  if (error) {
    return { channel: null, error: error.message }
  }

  return { channel: data as Channel, error: null }
}

export async function ensureMemberDm(
  supabase: SupabaseClient,
  workspaceId: string,
  peerMemberId: string,
): Promise<{ channel: Channel | null; error: string | null }> {
  const { data, error } = await supabase.rpc("ensure_member_dm", {
    p_workspace_id: workspaceId,
    p_peer_member_id: peerMemberId,
  })

  if (error) {
    return { channel: null, error: error.message }
  }

  return { channel: data as Channel, error: null }
}

export function directTargetActive(
  channel: Channel | undefined,
  target: { kind: "agent"; id: string } | { kind: "member"; id: string },
): boolean {
  if (!channel || channel.type !== "direct") return false
  if (target.kind === "agent") {
    return channel.direct_agent_id === target.id
  }
  return channel.direct_peer_member_id === target.id
}
