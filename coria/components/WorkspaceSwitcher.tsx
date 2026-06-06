"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import type { Workspace } from "@/types"
import { CreateWorkspaceForm } from "@/components/CreateWorkspaceForm"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  activeChannelSlug,
}: {
  workspaces: Workspace[]
  activeWorkspaceId: string
  activeChannelSlug: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const menuRef = useRef<HTMLDivElement>(null)

  const active =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0]

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setCreating(false)
      }
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [])

  async function switchWorkspace(workspaceId: string) {
    if (workspaceId === activeWorkspaceId || switchingId) return
    setSwitchingId(workspaceId)
    setOpen(false)

    try {
      const res = await fetch("/api/workspaces/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId }),
      })
      if (!res.ok) return
      startTransition(() => {
        router.push(`/?channel=${activeChannelSlug}`)
      })
    } finally {
      setSwitchingId(null)
    }
  }

  return (
    <div ref={menuRef} className="relative min-w-0 flex-1">
      <Button
        type="button"
        variant="ghost"
        loading={isPending || Boolean(switchingId)}
        onClick={() => {
          setOpen((v) => !v)
          setCreating(false)
        }}
        className={cn(
          "h-9 w-full min-w-0 justify-between gap-3 rounded-md px-2.5 font-semibold",
          "hover:bg-sidebar-accent/60",
          open && "bg-sidebar-accent/60",
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">
          {active?.name ?? "Workspace"}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </Button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {!creating ? (
            <>
              <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Workspaces
              </p>
              <ul role="listbox" className="max-h-56 overflow-y-auto">
                {workspaces.map((workspace) => {
                  const selected = workspace.id === activeWorkspaceId
                  const switching = switchingId === workspace.id
                  return (
                    <li key={workspace.id}>
                      <Button
                        type="button"
                        variant="ghost"
                        role="option"
                        aria-selected={selected}
                        loading={switching}
                        disabled={Boolean(switchingId) && !switching}
                        onClick={() => void switchWorkspace(workspace.id)}
                        className={cn(
                          "h-auto w-full justify-start gap-2 rounded-sm px-2 py-2 text-sm font-normal hover:bg-accent",
                          selected && "bg-accent/70",
                        )}
                      >
                        <Check
                          className={cn(
                            "size-4 shrink-0",
                            selected ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate text-left">
                          {workspace.name}
                        </span>
                      </Button>
                    </li>
                  )
                })}
              </ul>
              <div className="my-1 border-t" />
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent"
              >
                <Plus className="size-4" />
                Create workspace
              </button>
            </>
          ) : (
            <div className="p-3">
              <p className="mb-3 text-sm font-medium">New workspace</p>
              <CreateWorkspaceForm
                redirectTo={`/?channel=${activeChannelSlug}`}
                onCreated={() => {
                  setOpen(false)
                  setCreating(false)
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 w-full"
                onClick={() => setCreating(false)}
              >
                Back
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
