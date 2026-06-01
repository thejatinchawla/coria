"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LoadingButton } from "@/components/ui/loading-button"
import { useToast } from "@/components/Toast"

export function CreateWorkspaceForm({
  redirectTo = "/?channel=general",
  onCreated,
}: {
  redirectTo?: string
  onCreated?: (workspaceId: string) => void
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || loading) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      })
      const json = (await res.json()) as {
        workspace?: { id: string }
        error?: string
      }

      if (!res.ok) {
        setError(json.error ?? "Could not create workspace.")
        return
      }

      toast("Workspace created.", "success")
      onCreated?.(json.workspace!.id)
      router.push(redirectTo)
    } catch {
      setError("Could not create workspace.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="workspace-name" className="text-sm font-medium">
          Workspace name
        </label>
        <input
          id="workspace-name"
          type="text"
          required
          maxLength={80}
          placeholder="Acme Team"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          You&apos;ll be the owner. A #general channel and default agent are
          created automatically.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <LoadingButton type="submit" className="w-full" loading={loading}>
        Create workspace
      </LoadingButton>
    </form>
  )
}
