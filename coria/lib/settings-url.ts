import type { SettingsId } from "@/lib/settings-links"

export function chatUrl(channelSlug: string): string {
  return `/?channel=${encodeURIComponent(channelSlug)}`
}

export function settingsUrl(section: SettingsId): string {
  return `/settings/${section}`
}

/** Update the chat channel in the address bar without a full navigation. */
export function syncChatUrl(channelSlug: string) {
  if (typeof window === "undefined") return
  const next = chatUrl(channelSlug)
  if (`${window.location.pathname}${window.location.search}` !== next) {
    window.history.replaceState(window.history.state, "", next)
  }
}

export function settingsRedirectPath(id: SettingsId): string {
  return settingsUrl(id)
}
