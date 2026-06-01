import type { Metadata } from "next"
import { redirectToSettingsModal } from "@/lib/settings-redirect"

export const metadata: Metadata = {
  title: "Workspace",
}

export default function WorkspaceSettingsPage() {
  redirectToSettingsModal("workspace")
}
