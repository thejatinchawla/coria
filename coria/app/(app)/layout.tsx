import { cookies } from "next/headers"
import { WorkspaceShell } from "@/components/WorkspaceShell"
import { loadWorkspaceShellContext } from "@/lib/app-context"
import { LAST_CHANNEL_COOKIE } from "@/lib/channel-slug"

export default async function AppWorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await loadWorkspaceShellContext()
  const cookieStore = await cookies()
  const initialChannelSlug =
    cookieStore.get(LAST_CHANNEL_COOKIE)?.value?.trim() || "general"

  return (
    <WorkspaceShell initial={ctx} initialChannelSlug={initialChannelSlug}>
      {children}
    </WorkspaceShell>
  )
}
