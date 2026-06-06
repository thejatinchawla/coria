"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronDown, Pencil, Unplug } from "lucide-react"
import { SiGithub } from "react-icons/si"
import type { Integration } from "@/types"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/Toast"
import { cn } from "@/lib/utils"

export function IntegrationSettings({
  initialIntegration,
}: {
  initialIntegration: Integration | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [integration, setIntegration] = useState<Integration | null>(
    initialIntegration,
  )
  const [pat, setPat] = useState("")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showPatForm, setShowPatForm] = useState(false)

  const connected =
    integration != null && integration.status === "active"
  const githubLogin = integration?.provider_metadata?.github_login
  const authMethod = integration?.provider_metadata?.auth_method

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

  useEffect(() => {
    const status = searchParams.get("github")
    if (!status) return

    if (status === "connected") {
      void load()
      toast("GitHub connected.", "success")
    } else if (status === "error") {
      const reason = searchParams.get("reason")
      const message =
        reason === "config"
          ? "GitHub OAuth is not configured. Ask your admin or use a PAT."
          : reason === "state"
            ? "GitHub sign-in expired. Try again."
            : "Could not connect GitHub."
      toast(message)
    }

    router.replace("/settings/integrations", { scroll: false })
  }, [searchParams, load, router, toast])

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
      setShowPatForm(false)
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
      setShowPatForm(false)
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
          <p className="text-xs break-words text-muted-foreground">
            Connect GitHub so agents can use{" "}
            <code className="text-xs break-all">github_read</code>,{" "}
            <code className="text-xs break-all">github_post_comment</code>, and{" "}
            <code className="text-xs break-all">github_create_pr</code>.
          </p>
          {connected && (
            <p className="mt-2 text-xs text-green-600 dark:text-green-400">
              Connected
              {githubLogin ? ` as @${githubLogin}` : ""}
              {authMethod === "oauth" ? " · OAuth" : authMethod === "pat" ? " · PAT" : ""}
            </p>
          )}
          {!connected && integration?.status === "disconnected" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Previously disconnected — connect again below.
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
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              className="gap-2"
              onClick={() => {
                window.location.href = "/api/integrations/github/oauth"
              }}
            >
              <SiGithub className="size-4" />
              {connected ? "Reconnect with GitHub" : "Connect with GitHub"}
            </Button>
            {connected && editing && (
              <Button
                type="button"
                variant="ghost"
                loading={saving}
                onClick={() => {
                  setEditing(false)
                  setShowPatForm(false)
                  setPat("")
                }}
              >
                Cancel
              </Button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowPatForm((value) => !value)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                showPatForm && "rotate-180",
              )}
            />
            Use a personal access token instead
          </button>

          {showPatForm && (
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
              <p className="text-xs text-muted-foreground">
                Requires <code className="break-all">repo</code> scope for private
                repositories.
              </p>
              <Button type="submit" variant="outline" loading={saving}>
                {connected ? "Update token" : "Connect with PAT"}
              </Button>
            </form>
          )}

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
        </div>
      )}
    </section>
  )
}
