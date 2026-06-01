export const SETTINGS_LINKS = [
  { id: "workspace", label: "Workspace", title: "Workspace" },
  { id: "profile", label: "Profile", title: "Profile" },
  { id: "agents", label: "Agents", title: "Agent settings" },
  { id: "members", label: "Members", title: "Members" },
  { id: "integrations", label: "Integrations", title: "Integrations" },
  { id: "triggers", label: "Triggers", title: "Triggers" },
  { id: "audit", label: "Audit log", title: "Audit log" },
] as const

export type SettingsId = (typeof SETTINGS_LINKS)[number]["id"]

export function isSettingsId(value: string | null | undefined): value is SettingsId {
  return SETTINGS_LINKS.some((link) => link.id === value)
}

export function settingsLinkTitle(id: SettingsId): string {
  return SETTINGS_LINKS.find((link) => link.id === id)?.title ?? "Settings"
}

export function settingsPathToId(pathname: string): SettingsId | null {
  const match = pathname.match(/^\/settings\/([^/]+)/)
  if (!match) return null
  return isSettingsId(match[1]) ? match[1] : null
}
