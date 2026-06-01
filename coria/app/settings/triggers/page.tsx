import type { Metadata } from "next"
import { redirectToSettingsModal } from "@/lib/settings-redirect"

export const metadata: Metadata = {
  title: "Triggers",
}

export default function TriggersSettingsPage() {
  redirectToSettingsModal("triggers")
}
