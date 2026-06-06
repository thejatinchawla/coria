"use client"

import { createContext, useContext, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { Sidebar } from "@/components/Sidebar"
import type { Agent, Channel, Member, MemberRole, Workspace } from "@/types"

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
  agents,
  workspaceMembers,
  currentMemberId,
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
  agents: Agent[]
  workspaceMembers: Member[]
  currentMemberId: string
  switchingChannelId?: string | null
  onChannelSelect?: (channel: Channel) => void
  onChannelCreated?: (channel: Channel) => void
  onChannelDeleted?: (channelId: string, fallbackChannel: Channel) => void
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isChatRoute = pathname === "/"
  const settingsActive = pathname === "/settings" || pathname.startsWith("/settings/")

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
          activeChannelSlug={isChatRoute ? activeChannelSlug : ""}
          switchingChannelId={switchingChannelId}
          displayName={displayName}
          email={email}
          workspaceId={workspaceId}
          memberRole={memberRole}
          agents={agents}
          workspaceMembers={workspaceMembers}
          currentMemberId={currentMemberId}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onChannelSelect={onChannelSelect}
          onChannelCreated={onChannelCreated}
          onChannelDeleted={onChannelDeleted}
          settingsActive={settingsActive}
        />
        <div className="relative flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </SidebarMenuContext.Provider>
  )
}
