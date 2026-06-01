"use client"

import { useState } from "react"
import Link from "next/link"
import { LogOut, Plus, Settings, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { slugifyChannelName } from "@/lib/workspace"
import type { Channel } from "@/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function Sidebar({
  workspaceName,
  channels,
  activeChannelSlug,
  workspaceId,
  displayName,
  email,
  open,
  onClose,
  onChannelCreated,
}: {
  workspaceName: string
  channels: Channel[]
  activeChannelSlug: string
  workspaceId: string
  displayName: string
  email: string
  open: boolean
  onClose: () => void
  onChannelCreated?: (channel: Channel) => void
}) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)

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
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] flex-col border-r bg-sidebar text-sidebar-foreground transition-transform duration-200 ease-out md:static md:z-auto md:w-60 md:shrink-0 md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
          <span className="truncate text-sm font-semibold">{workspaceName}</span>
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
              <Link
                key={ch.id}
                href={href}
                onClick={onClose}
                className={cn(
                  "rounded-md px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-sidebar-accent",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground",
                )}
              >
                # {ch.name}
              </Link>
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
                <Button type="submit" size="sm" disabled={creating || !newName.trim()}>
                  Create
                </Button>
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

        <div className="space-y-0.5 border-t border-sidebar-border p-2">
          <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Settings
          </p>
          <Link
            href="/settings/profile"
            onClick={onClose}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Settings className="size-3.5" />
            Profile
          </Link>
          <Link
            href="/settings/agents"
            onClick={onClose}
            className="block rounded-md py-2 pl-9 pr-3 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            Agents
          </Link>
          <Link
            href="/settings/members"
            onClick={onClose}
            className="block rounded-md py-2 pl-9 pr-3 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            Members
          </Link>
          <Link
            href="/settings/integrations"
            onClick={onClose}
            className="block rounded-md py-2 pl-9 pr-3 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            Integrations
          </Link>
          <Link
            href="/settings/triggers"
            onClick={onClose}
            className="block rounded-md py-2 pl-9 pr-3 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            Triggers
          </Link>
          <Link
            href="/settings/audit"
            onClick={onClose}
            className="block rounded-md py-2 pl-9 pr-3 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            Audit log
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
      </aside>
    </>
  )
}
