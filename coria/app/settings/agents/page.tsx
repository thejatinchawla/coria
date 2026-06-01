import type { Metadata } from "next"
import { redirectToSettingsModal } from "@/lib/settings-redirect"

export const metadata: Metadata = {
  title: "Agent settings",
}

export default function AgentSettingsPage() {
  redirectToSettingsModal("agents")
}
