import type { MemberRole } from "@/types"

export const SETTINGS_LINKS = [
  { id: "workspace", label: "Workspace", title: "Workspace" },
  { id: "profile", label: "Profile", title: "Profile" },
  { id: "appearance", label: "Appearance", title: "Appearance" },
  { id: "password", label: "Password", title: "Password" },
  { id: "agents", label: "Agents", title: "Agent settings" },
  { id: "members", label: "Members", title: "Members" },
  { id: "integrations", label: "Integrations", title: "Integrations" },
  { id: "triggers", label: "Triggers", title: "Triggers" },
  { id: "audit", label: "Audit log", title: "Audit log" },
] as const

export type SettingsId = (typeof SETTINGS_LINKS)[number]["id"]

const ADMIN_ONLY_SETTINGS = new Set<SettingsId>([
  "workspace",
  "members",
  "audit",
])

/** Personal account settings — same across workspaces (theme, auth, profile UI). */
const USER_SCOPED_SETTINGS = new Set<SettingsId>([
  "profile",
  "appearance",
  "password",
])

export function isUserScopedSettingsSection(id: SettingsId): boolean {
  return USER_SCOPED_SETTINGS.has(id)
}

export function isWorkspaceScopedSettingsSection(id: SettingsId): boolean {
  return !USER_SCOPED_SETTINGS.has(id)
}

export function isWorkspaceAdmin(role: MemberRole): boolean {
  return role === "owner" || role === "admin"
}

export function isSettingsLinkVisible(id: SettingsId, role: MemberRole): boolean {
  if (ADMIN_ONLY_SETTINGS.has(id)) return isWorkspaceAdmin(role)
  return true
}

export function resolveSettingsSection(
  section: SettingsId,
  role: MemberRole,
): SettingsId {
  if (!isSettingsLinkVisible(section, role)) return "profile"
  return section
}

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
