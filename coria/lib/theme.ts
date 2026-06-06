export const THEME_STORAGE_KEY = "coria-theme"

export type ThemePreference = "light" | "dark" | "system"

export const THEME_OPTIONS: {
  value: ThemePreference
  label: string
  description: string
}[] = [
  { value: "light", label: "Light", description: "Always use light mode" },
  { value: "dark", label: "Dark", description: "Always use dark mode" },
  { value: "system", label: "System", description: "Match your device setting" },
]

export function isThemePreference(value: string): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system"
}
