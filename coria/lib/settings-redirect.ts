import { redirect } from "next/navigation"
import type { SettingsId } from "@/lib/settings-links"
import { settingsRedirectPath } from "@/lib/settings-url"

export function redirectToSettings(section: SettingsId): never {
  redirect(settingsRedirectPath(section))
}
