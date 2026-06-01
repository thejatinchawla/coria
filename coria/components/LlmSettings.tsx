"use client"

import { useCallback, useState } from "react"
import { Bot } from "lucide-react"
import type { LlmIntegrationStatus } from "@/types"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { useToast } from "@/components/Toast"

const PROVIDER_MODELS = {
  groq: [
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (default)" },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
  ],
  anthropic: [
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (default)" },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  ],
} as const

type LlmMode = "platform" | "custom"

export function LlmSettings({
  initialStatus,
}: {
  initialStatus: LlmIntegrationStatus
}) {
  const { toast } = useToast()
  const [status, setStatus] = useState(initialStatus)
  const [mode, setMode] = useState<LlmMode>(
    initialStatus.using_platform_default ? "platform" : "custom",
  )
  const [provider, setProvider] = useState<"groq" | "anthropic">(
    initialStatus.llm_provider ?? "groq",
  )
  const [model, setModel] = useState(
    initialStatus.llm_model ??
      PROVIDER_MODELS[initialStatus.llm_provider ?? "groq"][0].id,
  )
  const [apiKey, setApiKey] = useState("")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/settings/integrations/llm")
      if (!res.ok) {
        toast("Could not load LLM settings.")
        return
      }
      const json = (await res.json()) as LlmIntegrationStatus
      setStatus(json)
      if (json.using_platform_default) {
        setMode("platform")
      } else {
        setMode("custom")
        setProvider(json.llm_provider ?? "groq")
        setModel(
          json.llm_model ?? PROVIDER_MODELS[json.llm_provider ?? "groq"][0].id,
        )
      }
    } finally {
      setLoading(false)
    }
  }, [toast])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return

    setSaving(true)
    try {
      if (mode === "platform") {
        const settingsRes = await fetch("/api/settings/workspace", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ llm_provider: null, llm_model: null }),
        })
        if (!settingsRes.ok) {
          toast("Could not reset LLM settings.")
          return
        }
        if (status.key_configured) {
          const delRes = await fetch("/api/settings/integrations/llm", {
            method: "DELETE",
          })
          if (!delRes.ok) {
            toast("Could not remove custom API key.")
            return
          }
        }
        toast("Using platform LLM (server default).", "success")
        await load()
        return
      }

      const settingsRes = await fetch("/api/settings/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llm_provider: provider, llm_model: model.trim() }),
      })
      if (!settingsRes.ok) {
        const err = (await settingsRes.json().catch(() => ({}))) as {
          error?: string
          detail?: string
        }
        toast(err.detail ?? err.error ?? "Could not save LLM settings.")
        return
      }

      if (apiKey.trim()) {
        const keyRes = await fetch("/api/settings/integrations/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: apiKey.trim() }),
        })
        if (!keyRes.ok) {
          const err = (await keyRes.json().catch(() => ({}))) as {
            error?: string
            detail?: string
          }
          toast(err.detail ?? err.error ?? "Could not save API key.")
          return
        }
        setApiKey("")
      } else if (!status.key_configured) {
        toast(
          "Provider saved. Add an API key below — agents will fall back to the server key until then.",
          "info",
        )
      }

      toast("LLM settings saved.", "success")
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function removeCustomKey() {
    setSaving(true)
    try {
      const res = await fetch("/api/settings/integrations/llm", {
        method: "DELETE",
      })
      if (!res.ok) {
        toast("Could not remove API key.")
        return
      }
      toast("Custom API key removed.", "success")
      await load()
    } finally {
      setSaving(false)
    }
  }

  const modelOptions = PROVIDER_MODELS[provider]

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-muted p-2">
          <Bot className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">LLM provider</h2>
          <p className="text-xs text-muted-foreground">
            Choose Groq, Anthropic, or keep the platform default from server
            env (<code className="text-xs">LLM_PROVIDER</code> /{" "}
            <code className="text-xs">LLM_MODEL</code>). API keys are stored in
            Supabase Vault — never shown after save.
          </p>
          {loading ? (
            <p className="mt-2 text-xs text-muted-foreground">Loading…</p>
          ) : status.using_platform_default ? (
            <p className="mt-2 text-xs text-green-600 dark:text-green-400">
              Using platform default
            </p>
          ) : (
            <p className="mt-2 text-xs text-green-600 dark:text-green-400">
              Custom {status.llm_provider} · {status.llm_model}
              {status.key_configured ? " · key configured" : " · no vault key"}
            </p>
          )}
        </div>
      </div>

      <form onSubmit={(e) => void save(e)} className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "platform", label: "Platform default" },
              { id: "custom", label: "Custom provider" },
            ] as const
          ).map((opt) => (
            <label
              key={opt.id}
              className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="llm-mode"
                checked={mode === opt.id}
                onChange={() => setMode(opt.id)}
              />
              {opt.label}
            </label>
          ))}
        </div>

        {mode === "custom" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Provider</span>
                <select
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={provider}
                  onChange={(e) => {
                    const next = e.target.value as "groq" | "anthropic"
                    setProvider(next)
                    setModel(PROVIDER_MODELS[next][0].id)
                  }}
                >
                  <option value="groq">Groq</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Model</span>
                <select
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {modelOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">
                API key{" "}
                {status.key_configured && (
                  <span className="text-foreground/70">(leave blank to keep current)</span>
                )}
              </span>
              <input
                type="password"
                autoComplete="off"
                placeholder={provider === "groq" ? "gsk_…" : "sk-ant-…"}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </label>

            {status.key_configured && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => void removeCustomKey()}
              >
                Remove stored API key
              </Button>
            )}
          </>
        )}

        <LoadingButton type="submit" loading={saving}>
          Save LLM settings
        </LoadingButton>
      </form>
    </section>
  )
}
