"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { Workspace } from "@/types"
import { LoadingButton } from "@/components/ui/loading-button"
import { useToast } from "@/components/Toast"
import { useConfirm } from "@/components/ConfirmDialog"

export function WorkspaceSettings({
  initialWorkspace,
  canEdit,
  canManage,
}: {
  initialWorkspace: Workspace
  canEdit: boolean
  canManage: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [name, setName] = useState(initialWorkspace.name)
  const [saving, setSaving] = useState(false)
  const [confirmName, setConfirmName] = useState("")
  const [deleting, setDeleting] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!canEdit || saving) return

    setSaving(true)
    try {
      const res = await fetch("/api/workspaces/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      })
      const json = (await res.json()) as {
        workspace?: Workspace
        error?: string
      }
      if (!res.ok) {
        toast(json.error ?? "Could not save workspace.")
        return
      }
      setWorkspace(json.workspace!)
      setName(json.workspace!.name)
      toast("Workspace updated.", "success")
    } finally {
      setSaving(false)
    }
  }

  async function deleteWorkspace() {
    if (!canManage || deleting) return
    if (confirmName.trim() !== workspace.name) {
      toast("Type the workspace name exactly to confirm deletion.")
      return
    }
    const confirmed = await confirm({
      title: "Delete workspace?",
      description:
        "This permanently removes all channels, messages, and agents. This cannot be undone.",
      confirmLabel: "Delete workspace",
      variant: "destructive",
    })
    if (!confirmed) return

    setDeleting(true)
    try {
      const res = await fetch("/api/workspaces/current", { method: "DELETE" })
      const json = (await res.json()) as { error?: string; redirect?: string }
      if (!res.ok) {
        toast(json.error ?? "Could not delete workspace.")
        return
      }
      toast("Workspace deleted.", "success")
      router.push(json.redirect ?? "/onboarding")
      router.refresh()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-lg border p-4">
        <div>
          <h2 className="text-sm font-medium">Workspace details</h2>
          <p className="text-xs text-muted-foreground">
            {canEdit
              ? "Update how your workspace appears to members."
              : "Only the workspace owner can rename the workspace."}
          </p>
        </div>

        <form onSubmit={(e) => void save(e)} className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Name</span>
            <input
              required
              maxLength={80}
              disabled={!canEdit || saving}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm disabled:opacity-60"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Slug</span>
            <input
              readOnly
              className="w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
              value={workspace.slug}
            />
          </label>

          {canEdit && (
            <LoadingButton type="submit" loading={saving}>
              Save workspace
            </LoadingButton>
          )}
        </form>
      </section>

      {canManage && (
        <section className="space-y-4 rounded-lg border border-destructive/30 p-4">
          <div>
            <h2 className="text-sm font-medium text-destructive">Delete workspace</h2>
            <p className="text-xs text-muted-foreground">
              Permanently remove this workspace, including all channels, messages,
              agents, and settings. This cannot be undone.
            </p>
          </div>

          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">
              Type <span className="font-medium text-foreground">{workspace.name}</span>{" "}
              to confirm
            </span>
            <input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              disabled={deleting}
              placeholder={workspace.name}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm disabled:opacity-60"
            />
          </label>

          <LoadingButton
            type="button"
            variant="destructive"
            loading={deleting}
            disabled={confirmName.trim() !== workspace.name}
            onClick={() => void deleteWorkspace()}
          >
            Delete workspace
          </LoadingButton>
        </section>
      )}
    </div>
  )
}
