"use client"

import { useState } from "react"
import {
  Menu,
  MessageSquare,
  Pencil,
  Pin,
  Search,
  ShieldAlert,
  Users,
  X,
} from "lucide-react"
import type { Channel, MessageSearchHit } from "@/types"
import { ChannelSettingsDialog } from "@/components/ChannelSettingsDialog"
import { LinkifiedText } from "@/components/LinkifiedText"
import { cn } from "@/lib/utils"
import { useSidebarMenu } from "@/components/AppShell"

export type ChannelTab = "messages" | "pins" | "members"

function ChannelTabButton({
  active,
  icon: Icon,
  label,
  count,
  onClick,
}: {
  active: boolean
  icon: typeof MessageSquare
  label: string
  count?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
            active
              ? "bg-foreground/10 text-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
      {active && (
        <span
          className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-foreground"
          aria-hidden
        />
      )}
    </button>
  )
}

export function ChannelHeader({
  channel,
  workspaceName,
  canManageChannel = false,
  onChannelUpdated,
  activeTab = "messages",
  pinnedCount = 0,
  memberCount = 0,
  onTabChange,
  pendingApprovalCount = 0,
  searchQuery = "",
  searchResults = [],
  onSearchChange,
  onSearchSelect,
  onMenuOpen,
}: {
  channel: Channel
  workspaceName: string
  canManageChannel?: boolean
  onChannelUpdated?: (channel: Channel) => void
  activeTab?: ChannelTab
  pinnedCount?: number
  memberCount?: number
  onTabChange?: (tab: ChannelTab) => void
  pendingApprovalCount?: number
  searchQuery?: string
  searchResults?: MessageSearchHit[]
  onSearchChange?: (query: string) => void
  onSearchSelect?: (hit: MessageSearchHit) => void
  onMenuOpen?: () => void
}) {
  const { openSidebar } = useSidebarMenu()
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const subtitle =
    channel.description?.trim() ||
    (channel.name === "general"
      ? "Workspace-wide updates and announcements"
      : workspaceName)

  return (
    <header className="relative shrink-0 border-b bg-background">
      <div className="flex min-h-12 items-center justify-between gap-2 px-3 py-2 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            aria-label="Open menu"
            onClick={onMenuOpen ?? openSidebar}
            className="-ml-1 shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted md:hidden"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <h1 className="truncate text-[15px] font-bold">#{channel.name}</h1>
              <span className="hidden truncate text-sm text-muted-foreground sm:inline">
                {subtitle}
              </span>
            </div>
            <span className="truncate text-xs text-muted-foreground sm:hidden">
              {subtitle}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {canManageChannel && onChannelUpdated && (
            <button
              type="button"
              aria-label="Edit channel"
              onClick={() => setSettingsOpen(true)}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted"
            >
              <Pencil className="size-5" />
            </button>
          )}
          {pendingApprovalCount > 0 && (
            <span
              className={cn(
                "mr-0.5 flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 sm:mr-1 sm:px-2.5",
              )}
              title="Pending approvals in this channel"
            >
              <ShieldAlert className="size-3.5 shrink-0" />
              <span className="tabular-nums">{pendingApprovalCount}</span>
            </span>
          )}
          <button
            type="button"
            aria-label="Search messages"
            onClick={() => setSearchOpen((v) => !v)}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted"
          >
            <Search className="size-5" />
          </button>
        </div>
      </div>

      {onTabChange && (
        <nav
          className="flex items-center justify-around gap-0.5 overflow-x-auto border-t border-border/60 px-1 sm:justify-start sm:px-4"
          aria-label="Channel views"
        >
          <ChannelTabButton
            active={activeTab === "messages"}
            icon={MessageSquare}
            label="Messages"
            onClick={() => onTabChange("messages")}
          />
          <ChannelTabButton
            active={activeTab === "pins"}
            icon={Pin}
            label="Pins"
            count={pinnedCount}
            onClick={() => onTabChange("pins")}
          />
          <ChannelTabButton
            active={activeTab === "members"}
            icon={Users}
            label="Members"
            count={memberCount}
            onClick={() => onTabChange("members")}
          />
        </nav>
      )}

      {canManageChannel && onChannelUpdated && (
        <ChannelSettingsDialog
          channel={channel}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onUpdated={onChannelUpdated}
        />
      )}

      {searchOpen && onSearchChange && (
        <div className="absolute inset-x-0 top-full z-20 border-b bg-background p-3 shadow-md">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search messages in this channel…"
              className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring"
              autoFocus
            />
            <button
              type="button"
              aria-label="Close search"
              onClick={() => {
                setSearchOpen(false)
                onSearchChange("")
              }}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>
          {searchResults.length > 0 && onSearchSelect && (
            <ul className="mx-auto mt-2 max-h-48 max-w-3xl overflow-y-auto rounded-md border">
              {searchResults.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSearchSelect(hit)
                      setSearchOpen(false)
                    }}
                    className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="font-medium">{hit.sender_name}</span>
                    <span className="line-clamp-2 text-muted-foreground">
                      <LinkifiedText text={hit.content} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </header>
  )
}
