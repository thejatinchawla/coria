import type { Metadata } from "next"
import { redirectToSettingsModal } from "@/lib/settings-redirect"

export const metadata: Metadata = {
  title: "Integrations",
}

export default function IntegrationsSettingsPage() {
  redirectToSettingsModal("integrations")
}
