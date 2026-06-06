import { cookies } from "next/headers"
import { WorkspaceShell } from "@/components/WorkspaceShell"
import { loadWorkspaceShellContext } from "@/lib/app-context"
import { LAST_CHANNEL_COOKIE } from "@/lib/channel-slug"
import { parseChatLocationStorageKey } from "@/lib/chat-location"

export default async function AppWorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await loadWorkspaceShellContext()
  const cookieStore = await cookies()
  const stored = parseChatLocationStorageKey(
    cookieStore.get(LAST_CHANNEL_COOKIE)?.value,
  )
  const initialChannelSlug =
    stored?.kind === "channel" ? stored.slug : "general"

  return (
    <WorkspaceShell initial={ctx} initialChannelSlug={initialChannelSlug}>
      {children}
    </WorkspaceShell>
  )
}
