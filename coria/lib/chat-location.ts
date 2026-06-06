import type { Channel } from "@/types"
import {
  isAgentDirectMessage,
  isMemberDirectMessage,
  memberDmPeerId,
} from "@/lib/direct-messages"

export type ChatLocation =
  | { kind: "channel"; slug: string }
  | { kind: "member_dm"; peerMemberId: string }
  | { kind: "agent_dm"; agentId: string }

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim())
}

export function chatLocationFromChannel(
  channel: Channel,
  currentMemberId: string | null,
): ChatLocation {
  if (isAgentDirectMessage(channel) && channel.direct_agent_id) {
    return { kind: "agent_dm", agentId: channel.direct_agent_id }
  }
  if (isMemberDirectMessage(channel) && currentMemberId) {
    const peerId = memberDmPeerId(channel, currentMemberId)
    if (peerId) {
      return { kind: "member_dm", peerMemberId: peerId }
    }
  }
  return { kind: "channel", slug: channel.slug }
}

export function buildChatUrl(location: ChatLocation): string {
  switch (location.kind) {
    case "member_dm":
      return `/?dm=${encodeURIComponent(location.peerMemberId)}`
    case "agent_dm":
      return `/?agent=${encodeURIComponent(location.agentId)}`
    case "channel":
      return `/?channel=${encodeURIComponent(location.slug)}`
  }
}

export function parseChatLocation(
  params: Record<string, string | undefined>,
): ChatLocation | null {
  const dm = params.dm?.trim()
  if (dm && isUuid(dm)) {
    return { kind: "member_dm", peerMemberId: dm }
  }

  const agent = params.agent?.trim()
  if (agent && isUuid(agent)) {
    return { kind: "agent_dm", agentId: agent }
  }

  const channel = params.channel?.trim()
  if (channel) {
    return { kind: "channel", slug: channel }
  }

  return null
}

export function chatLocationStorageKey(location: ChatLocation): string {
  switch (location.kind) {
    case "member_dm":
      return `dm:${location.peerMemberId}`
    case "agent_dm":
      return `agent:${location.agentId}`
    case "channel":
      return `channel:${location.slug}`
  }
}

export function parseChatLocationStorageKey(
  value: string | null | undefined,
): ChatLocation | null {
  const raw = value?.trim()
  if (!raw) return null
  if (raw.startsWith("dm:")) {
    const peerMemberId = raw.slice(3)
    return isUuid(peerMemberId) ? { kind: "member_dm", peerMemberId } : null
  }
  if (raw.startsWith("agent:")) {
    const agentId = raw.slice(6)
    return isUuid(agentId) ? { kind: "agent_dm", agentId } : null
  }
  if (raw.startsWith("channel:")) {
    return { kind: "channel", slug: raw.slice(8) }
  }
  // Legacy: bare slug from older cookies/session storage
  return { kind: "channel", slug: raw }
}

export function syncChatLocation(
  location: ChatLocation,
  options?: { replace?: boolean },
) {
  if (typeof window === "undefined") return
  const next = buildChatUrl(location)
  const current = `${window.location.pathname}${window.location.search}`
  if (current === next) return
  if (options?.replace === false) {
    window.history.pushState(window.history.state, "", next)
  } else {
    window.history.replaceState(window.history.state, "", next)
  }
}
