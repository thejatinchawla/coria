import type { Metadata } from "next"
import { redirectToSettingsModal } from "@/lib/settings-redirect"

export const metadata: Metadata = {
  title: "Profile",
}

export default function ProfileSettingsPage() {
  redirectToSettingsModal("profile")
}
