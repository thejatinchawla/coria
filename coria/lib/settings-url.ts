import type { SettingsId } from "@/lib/settings-links"

export function chatUrl(channelSlug: string, settings?: SettingsId): string {
  const params = new URLSearchParams({ channel: channelSlug })
  if (settings) params.set("settings", settings)
  return `/?${params.toString()}`
}

export function settingsRedirectPath(id: SettingsId): string {
  if (id === "workspace") return chatUrl("general", "workspace")
  return chatUrl("general", id)
}
