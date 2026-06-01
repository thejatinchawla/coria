"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { LogOut, Plus, Settings, Trash2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { slugifyChannelName } from "@/lib/workspace"
import { chatUrl } from "@/lib/settings-url"
import type { Channel, MemberRole, Workspace } from "@/types"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/Toast"
import { useConfirm } from "@/components/ConfirmDialog"

const SIDEBAR_WIDTH_KEY = "coria_sidebar_width"
const DEFAULT_SIDEBAR_WIDTH = 240
const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 420

function clampSidebarWidth(width: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width))
}

export function Sidebar({
  workspaces,
  channels,
  activeChannelSlug,
  workspaceId,
  displayName,
  email,
  memberRole,
  open,
  onClose,
  onChannelCreated,
  onChannelDeleted,
  settingsSection = null,
}: {
  workspaces: Workspace[]
  channels: Channel[]
  activeChannelSlug: string
  workspaceId: string
  displayName: string
  email: string
  memberRole: MemberRole
  open: boolean
  onClose: () => void
  onChannelCreated?: (channel: Channel) => void
  onChannelDeleted?: (channelId: string, fallbackChannel: Channel) => void
  settingsSection?: string | null
}) {
  const router = useRouter()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)
  const [width, setWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [resizing, setResizing] = useState(false)
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null)
  const widthRef = useRef(DEFAULT_SIDEBAR_WIDTH)
  const canManageChannels = memberRole === "owner" || memberRole === "admin"

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY)
    if (!stored) return
    const parsed = Number.parseInt(stored, 10)
    if (Number.isNaN(parsed)) return
    const next = clampSidebarWidth(parsed)
    widthRef.current = next
    setWidth(next)
  }, [])

  const onResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = widthRef.current

    setResizing(true)
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    function onMove(ev: PointerEvent) {
      const next = clampSidebarWidth(startWidth + (ev.clientX - startX))
      widthRef.current = next
      setWidth(next)
    }

    function onUp() {
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      setResizing(false)
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(widthRef.current))
    }

    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  }, [])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  async function createChannel(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name || creating) return

    const slug = slugifyChannelName(name)
    if (!slug) {
      setCreateError("Use letters or numbers in the channel name.")
      return
    }

    setCreating(true)
    setCreateError(null)
    const supabase = createClient()
    const { data, error } = await supabase
      .from("channels")
      .insert({
        workspace_id: workspaceId,
        name,
        slug,
        type: "hybrid",
      })
      .select("id,workspace_id,name,slug,type,created_at")
      .single()

    setCreating(false)

    if (error) {
      setCreateError(error.message)
      return
    }

    setNewName("")
    setShowCreate(false)
    onChannelCreated?.(data as Channel)
    onClose()
  }

  async function deleteChannel(channel: Channel) {
    if (!canManageChannels || deletingChannelId) return
    if (channels.length <= 1) {
      toast("Cannot delete the last channel in a workspace.")
      return
    }
    const confirmed = await confirm({
      title: `Delete #${channel.name}?`,
      description:
        "All messages in this channel will be permanently removed.",
      confirmLabel: "Delete channel",
      variant: "destructive",
    })
    if (!confirmed) return

    setDeletingChannelId(channel.id)
    try {
      const res = await fetch(`/api/channels/${channel.id}`, { method: "DELETE" })
      const json = (await res.json()) as {
        error?: string
        fallback_channel?: Channel
      }
      if (!res.ok) {
        toast(json.error ?? "Could not delete channel.")
        return
      }
      toast(`#${channel.name} deleted.`, "success")
      onChannelDeleted?.(channel.id, json.fallback_channel!)
      if (activeChannelSlug === channel.slug) {
        router.push(`/?channel=${json.fallback_channel!.slug}`)
      }
    } finally {
      setDeletingChannelId(null)
    }
  }

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        style={{ ["--sidebar-width" as string]: `${width}px` }}
        className={cn(
          "group/sidebar fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] flex-col border-r bg-sidebar text-sidebar-foreground md:relative md:z-auto md:w-[var(--sidebar-width)] md:shrink-0 md:translate-x-0",
          resizing ? "transition-none" : "transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-sidebar-border px-3">
          <WorkspaceSwitcher
            workspaces={workspaces}
            activeWorkspaceId={workspaceId}
            activeChannelSlug={activeChannelSlug}
          />
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent md:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {channels.map((ch) => {
            const href = `/?channel=${ch.slug}`
            const active = activeChannelSlug === ch.slug
            return (
              <div
                key={ch.id}
                className={cn(
                  "group/channel flex items-center gap-0.5 rounded-md",
                  active && "bg-sidebar-accent",
                )}
              >
                <Link
                  href={href}
                  onClick={onClose}
                  className={cn(
                    "min-w-0 flex-1 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-sidebar-accent",
                    active
                      ? "text-sidebar-accent-foreground"
                      : "text-sidebar-foreground",
                  )}
                >
                  # {ch.name}
                </Link>
                {canManageChannels && channels.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Delete #${ch.name}`}
                    disabled={deletingChannelId === ch.id}
                    onClick={() => void deleteChannel(ch)}
                    className="mr-1 rounded-md p-1.5 text-muted-foreground opacity-100 transition-opacity hover:bg-sidebar-accent hover:text-destructive md:opacity-0 md:group-hover/channel:opacity-100 disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            )
          })}

          {showCreate ? (
            <form onSubmit={(e) => void createChannel(e)} className="mt-1 space-y-2 px-1">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Channel name"
                disabled={creating}
                className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:border-ring"
                autoFocus
              />
              {createError && (
                <p className="text-xs text-destructive">{createError}</p>
              )}
              <div className="flex gap-2">
                <LoadingButton type="submit" size="sm" loading={creating} disabled={!newName.trim()}>
                  Create
                </LoadingButton>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowCreate(false)
                    setCreateError(null)
                    setNewName("")
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Plus className="size-3.5" />
              New channel
            </button>
          )}
        </nav>

        <div className="border-t border-sidebar-border p-2">
          <Link
            href={chatUrl(activeChannelSlug, "profile")}
            scroll={false}
            onClick={onClose}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              settingsSection
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground",
            )}
          >
            <Settings className="size-3.5" />
            Settings
          </Link>
        </div>

        <div className="space-y-2 border-t border-sidebar-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void signOut()}
            className="w-full justify-start gap-2 text-muted-foreground"
          >
            <LogOut className="size-3.5" />
            Sign out
          </Button>
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={onResizeStart}
          className="absolute -right-1 top-0 z-10 hidden h-full w-2 cursor-col-resize touch-none md:block"
        >
          <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover/sidebar:bg-sidebar-border hover:bg-border" />
        </div>
      </aside>
    </>
  )
}
