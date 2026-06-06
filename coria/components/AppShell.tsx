"use client"

import { createContext, useContext, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { Sidebar } from "@/components/Sidebar"
import { isSettingsId } from "@/lib/settings-links"
import type { Channel, MemberRole, Workspace } from "@/types"

const SidebarMenuContext = createContext<{
  openSidebar: () => void
  closeSidebar: () => void
} | null>(null)

export function useSidebarMenu() {
  const ctx = useContext(SidebarMenuContext)
  return ctx ?? { openSidebar: () => {}, closeSidebar: () => {} }
}

export function AppShell({
  workspaces,
  channels,
  activeChannelSlug,
  workspaceId,
  displayName,
  email,
  memberRole,
  switchingChannelId = null,
  onChannelSelect,
  onChannelCreated,
  onChannelDeleted,
  children,
}: {
  workspaces: Workspace[]
  channels: Channel[]
  activeChannelSlug: string
  workspaceId: string
  displayName: string
  email: string
  memberRole: MemberRole
  switchingChannelId?: string | null
  onChannelSelect?: (channel: Channel) => void
  onChannelCreated?: (channel: Channel) => void
  onChannelDeleted?: (channelId: string, fallbackChannel: Channel) => void
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const settingsSection = useMemo(() => {
    const match = pathname.match(/^\/settings\/([^/]+)/)
    const id = match?.[1]
    return isSettingsId(id) ? id : null
  }, [pathname])

  const menu = useMemo(
    () => ({
      openSidebar: () => setSidebarOpen(true),
      closeSidebar: () => setSidebarOpen(false),
    }),
    [],
  )

  return (
    <SidebarMenuContext.Provider value={menu}>
      <div className="flex h-dvh overflow-hidden bg-background text-foreground">
        <Sidebar
          workspaces={workspaces}
          channels={channels}
          activeChannelSlug={activeChannelSlug}
          switchingChannelId={switchingChannelId}
          displayName={displayName}
          email={email}
          workspaceId={workspaceId}
          memberRole={memberRole}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onChannelSelect={onChannelSelect}
          onChannelCreated={onChannelCreated}
          onChannelDeleted={onChannelDeleted}
          settingsSection={settingsSection}
        />
        <div className="relative flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </SidebarMenuContext.Provider>
  )
}
