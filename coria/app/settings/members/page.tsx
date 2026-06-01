import type { Metadata } from "next"
import { redirectToSettingsModal } from "@/lib/settings-redirect"

export const metadata: Metadata = {
  title: "Members",
}

export default function MembersSettingsPage() {
  redirectToSettingsModal("members")
}
