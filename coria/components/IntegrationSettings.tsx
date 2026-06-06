"use client"

import { useCallback, useState } from "react"
import { Pencil, Unplug } from "lucide-react"
import { SiGithub } from "react-icons/si"
import type { Integration } from "@/types"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/Toast"

export function IntegrationSettings({
  initialIntegration,
}: {
  initialIntegration: Integration | null
}) {
  const { toast } = useToast()
  const [integration, setIntegration] = useState<Integration | null>(
    initialIntegration,
  )
  const [pat, setPat] = useState("")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)

  const connected =
    integration != null && integration.status === "active"

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/settings/integrations/github")
      if (!res.ok) {
        toast("Could not load integration.")
        return
      }
      const json = (await res.json()) as { integration: Integration | null }
      setIntegration(json.integration)
    } finally {
      setLoading(false)
    }
  }, [toast])

  async function savePat(e: React.FormEvent) {
    e.preventDefault()
    if (!pat.trim()) {
      toast("Enter a GitHub personal access token.")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/settings/integrations/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pat: pat.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast(typeof err.detail === "string" ? err.detail : "Could not save PAT.")
        return
      }
      setPat("")
      setEditing(false)
      await load()
      toast("GitHub connected.", "success")
    } finally {
      setSaving(false)
    }
  }

  async function disconnect() {
    setSaving(true)
    try {
      const res = await fetch("/api/settings/integrations/github", {
        method: "DELETE",
      })
      if (!res.ok) {
        toast("Could not disconnect GitHub.")
        return
      }
      setIntegration(null)
      setEditing(false)
      toast("GitHub disconnected.", "success")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4 rounded-lg border p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-muted p-2">
            <SiGithub className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium">GitHub</h2>
            <p className="text-xs text-muted-foreground">
              Store a PAT in Supabase Vault for GitHub write tools (
              <code className="text-xs">github_post_comment</code>,{" "}
              <code className="text-xs">github_create_pr</code>).
              Requires <code className="text-xs">repo</code> scope.
            </p>
            {connected && (
              <p className="mt-2 text-xs text-green-600 dark:text-green-400">
                Connected · status {integration.status}
              </p>
            )}
            {!connected && integration?.status === "disconnected" && (
              <p className="mt-2 text-xs text-muted-foreground">
                Previously disconnected — add a new PAT to reconnect.
              </p>
            )}
          </div>
          {connected && !editing && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              loading={saving}
              aria-label="Edit GitHub integration"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-4" />
            </Button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : connected && !editing ? null : (
          <>
            <form onSubmit={(e) => void savePat(e)} className="space-y-3">
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">
                  {connected ? "Replace token" : "Personal access token"}
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="ghp_…"
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={pat}
                  onChange={(e) => setPat(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={saving}>
                  {connected ? "Update token" : "Connect GitHub"}
                </Button>
                {connected && editing && (
                  <Button
                    type="button"
                    variant="ghost"
                    loading={saving}
                    onClick={() => {
                      setEditing(false)
                      setPat("")
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>

            {connected && editing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={saving}
                onClick={() => void disconnect()}
              >
                <Unplug className="mr-1 size-3.5" />
                Disconnect
              </Button>
            )}
          </>
        )}
      </section>
  )
}
