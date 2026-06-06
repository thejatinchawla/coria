import type { SupabaseClient } from "@supabase/supabase-js"
import type { Channel } from "@/types"
import type { ChatLocation } from "@/lib/chat-location"
import {
  isAgentDirectMessage,
  isMemberDirectMessage,
  memberDmPeerId,
} from "@/lib/direct-messages"

export async function resolveChatChannel(
  supabase: SupabaseClient,
  workspaceId: string,
  location: ChatLocation,
  currentMemberId: string | null,
): Promise<Channel | null> {
  if (location.kind === "member_dm") {
    const { data, error } = await supabase.rpc("ensure_member_dm", {
      p_workspace_id: workspaceId,
      p_peer_member_id: location.peerMemberId,
    })
    if (error || !data) return null
    return data as Channel
  }

  if (location.kind === "agent_dm") {
    const { data, error } = await supabase.rpc("ensure_agent_dm", {
      p_workspace_id: workspaceId,
      p_agent_id: location.agentId,
    })
    if (error || !data) return null
    return data as Channel
  }

  const { data, error } = await supabase
    .from("channels")
    .select(
      "id,workspace_id,name,slug,type,description,direct_agent_id,direct_peer_member_id,created_by_member_id,created_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("slug", location.slug)
    .maybeSingle()

  if (error || !data) return null
  return data as Channel
}

/** Redirect legacy `?channel=dm-…` URLs to `?dm=` / `?agent=`. */
export function legacyDmRedirectPath(
  channel: Channel,
  currentMemberId: string | null,
): string | null {
  if (isMemberDirectMessage(channel) && currentMemberId) {
    const peerId = memberDmPeerId(channel, currentMemberId)
    if (peerId) return `/?dm=${encodeURIComponent(peerId)}`
  }
  if (isAgentDirectMessage(channel) && channel.direct_agent_id) {
    return `/?agent=${encodeURIComponent(channel.direct_agent_id)}`
  }
  return null
}
