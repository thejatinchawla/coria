import type { SettingsId } from "@/lib/settings-links"
import {
  buildChatUrl,
  chatLocationFromChannel,
  syncChatLocation,
  type ChatLocation,
} from "@/lib/chat-location"
import type { Channel } from "@/types"

export function chatUrl(channelSlug: string): string {
  return buildChatUrl({ kind: "channel", slug: channelSlug })
}

export function chatUrlForChannel(
  channel: Channel,
  currentMemberId: string | null,
): string {
  return buildChatUrl(chatLocationFromChannel(channel, currentMemberId))
}

export function settingsUrl(section: SettingsId): string {
  return `/settings/${section}`
}

/** Update the address bar for the active chat (channel, teammate DM, or agent DM). */
export function syncChatUrl(
  channel: Channel,
  currentMemberId: string | null,
) {
  syncChatLocation(chatLocationFromChannel(channel, currentMemberId))
}

export { buildChatUrl, syncChatLocation, type ChatLocation }

export function settingsRedirectPath(id: SettingsId): string {
  return settingsUrl(id)
}
