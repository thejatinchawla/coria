"use client"

import { useCallback, useState } from "react"
import { Play, Plus, Trash2 } from "lucide-react"
import type { Agent, AgentTrigger, Channel } from "@/types"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/Toast"
import { useConfirm } from "@/components/ConfirmDialog"
import { cn } from "@/lib/utils"

type TriggerForm = {
  agent_id: string
  channel_id: string
  type: "cron" | "keyword"
  enabled: boolean
  cron: string
  prompt: string
  keywords: string
  prompt_prefix: string
}

function emptyForm(agents: Agent[], channels: Channel[]): TriggerForm {
  return {
    agent_id: agents[0]?.id ?? "",
    channel_id: channels[0]?.id ?? "",
    type: "keyword",
    enabled: true,
    cron: "0 9 * * *",
    prompt: "",
    keywords: "bug:",
    prompt_prefix: "",
  }
}

function configFromForm(form: TriggerForm): Record<string, unknown> {
  if (form.type === "cron") {
    return { cron: form.cron.trim(), prompt: form.prompt.trim() }
  }
  const keywords = form.keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
  const config: Record<string, unknown> = { keywords }
  if (form.prompt_prefix.trim()) {
    config.prompt_prefix = form.prompt_prefix.trim()
  }
  return config
}

const CRON_PRESETS = [
  { label: "Daily 9:00 UTC", expr: "0 9 * * *" },
  { label: "Weekdays 9:00 UTC", expr: "0 9 * * 1-5" },
  { label: "Every 6 hours", expr: "0 */6 * * *" },
] as const

function formFromTrigger(trigger: AgentTrigger): TriggerForm {
  const config = trigger.config ?? {}
  return {
    agent_id: trigger.agent_id,
    channel_id: trigger.channel_id,
    type: trigger.type,
    enabled: trigger.enabled,
    cron: (config.cron as string) ?? "0 9 * * *",
    prompt: (config.prompt as string) ?? "",
    keywords: Array.isArray(config.keywords)
      ? (config.keywords as string[]).join(", ")
      : "",
    prompt_prefix: (config.prompt_prefix as string) ?? "",
  }
}

export function TriggerSettings({
  initialTriggers,
  agents,
  channels,
}: {
  initialTriggers: AgentTrigger[]
  agents: Agent[]
  channels: Channel[]
}) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [triggers, setTriggers] = useState<AgentTrigger[]>(initialTriggers)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<TriggerForm>(() =>
    emptyForm(agents, channels),
  )

  const agentName = (id: string) =>
    agents.find((a) => a.id === id)?.mention_slug ?? id.slice(0, 8)
  const channelName = (id: string) =>
    channels.find((c) => c.id === id)?.slug ?? id.slice(0, 8)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/settings/triggers")
      if (!res.ok) {
        toast("Could not load triggers.")
        return
      }
      const json = (await res.json()) as { items: AgentTrigger[] }
      setTriggers(json.items ?? [])
    } finally {
      setLoading(false)
    }
  }, [toast])

  async function createTrigger(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch("/api/settings/triggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: form.agent_id,
          channel_id: form.channel_id,
          type: form.type,
          enabled: form.enabled,
          config: configFromForm(form),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast(typeof err.detail === "string" ? err.detail : "Could not create trigger.")
        return
      }
      setShowCreate(false)
      setForm(emptyForm(agents, channels))
      await load()
      toast("Trigger created.", "success")
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/settings/triggers/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: form.agent_id,
          channel_id: form.channel_id,
          type: form.type,
          enabled: form.enabled,
          config: configFromForm(form),
        }),
      })
      if (!res.ok) {
        toast("Could not update trigger.")
        return
      }
      setEditingId(null)
      setForm(emptyForm(agents, channels))
      await load()
      toast("Trigger updated.", "success")
    } finally {
      setSaving(false)
    }
  }

  async function toggleEnabled(trigger: AgentTrigger) {
    setSaving(true)
    try {
      const res = await fetch(`/api/settings/triggers/${trigger.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !trigger.enabled }),
      })
      if (!res.ok) {
        toast("Could not update trigger.")
        return
      }
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function deleteTrigger(id: string) {
    const confirmed = await confirm({
      title: "Delete trigger?",
      description: "This scheduled or keyword trigger will stop running.",
      confirmLabel: "Delete trigger",
      variant: "destructive",
    })
    if (!confirmed) return
    setSaving(true)
    try {
      const res = await fetch(`/api/settings/triggers/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        toast("Could not delete trigger.")
        return
      }
      await load()
      toast("Trigger deleted.", "success")
    } finally {
      setSaving(false)
    }
  }

  async function runNow(id: string) {
    setRunningId(id)
    try {
      const res = await fetch("/api/settings/triggers/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger_id: id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast(typeof err.detail === "string" ? err.detail : "Trigger run failed.")
        return
      }
      toast("Trigger invoked — check the channel for the agent reply.", "success")
      await load()
    } finally {
      setRunningId(null)
    }
  }

  function startEdit(trigger: AgentTrigger) {
    setEditingId(trigger.id)
    setShowCreate(false)
    setForm(formFromTrigger(trigger))
  }

  const formVisible = showCreate || editingId

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">Agent triggers</h2>
            <p className="text-xs text-muted-foreground">
              Cron schedules and keyword matchers invoke agents automatically.
            </p>
          </div>
          {!formVisible && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowCreate(true)
                setEditingId(null)
                setForm(emptyForm(agents, channels))
              }}
            >
              <Plus className="mr-1 size-3.5" />
              New trigger
            </Button>
          )}
        </div>

        {loading && triggers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="space-y-2">
            {triggers.map((trigger) => (
              <li
                key={trigger.id}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    <span
                      className={cn(
                        "mr-2 inline-block rounded px-1.5 py-0.5 text-xs uppercase",
                        trigger.type === "cron"
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {trigger.type}
                    </span>
                    @{agentName(trigger.agent_id)} in #{channelName(trigger.channel_id)}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {trigger.type === "cron"
                      ? (trigger.config?.cron as string)
                      : (trigger.config?.keywords as string[])?.join(", ")}
                    {trigger.last_run_at
                      ? ` · last run ${new Date(trigger.last_run_at).toLocaleString()}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1 self-stretch sm:self-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={runningId === trigger.id}
                    disabled={saving}
                    onClick={() => void runNow(trigger.id)}
                  >
                    <Play className="mr-1 size-3.5" />
                    Run
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={saving}
                    onClick={() => void toggleEnabled(trigger)}
                  >
                    {trigger.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={saving}
                    onClick={() => startEdit(trigger)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive"
                    loading={saving}
                    aria-label="Delete trigger"
                    onClick={() => void deleteTrigger(trigger.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
            {triggers.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No triggers yet. Create one to schedule digests or react to keywords.
              </p>
            )}
          </ul>
        )}
      </section>

      {formVisible && (
        <form
          onSubmit={(e) => void (editingId ? saveEdit(e) : createTrigger(e))}
          className="space-y-4 rounded-lg border p-4"
        >
          <h2 className="text-sm font-medium">
            {editingId ? "Edit trigger" : "Create trigger"}
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Agent</span>
              <select
                required
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={form.agent_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, agent_id: e.target.value }))
                }
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    @{a.mention_slug} — {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Channel</span>
              <select
                required
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={form.channel_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, channel_id: e.target.value }))
                }
              >
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.slug}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["keyword", "cron"] as const).map((t) => (
              <label
                key={t}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm capitalize",
                  form.type === t && "border-primary bg-primary/5",
                )}
              >
                <input
                  type="radio"
                  name="trigger-type"
                  checked={form.type === t}
                  onChange={() => setForm((f) => ({ ...f, type: t }))}
                />
                {t}
              </label>
            ))}
            <label className="ml-auto flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, enabled: e.target.checked }))
                }
              />
              Enabled
            </label>
          </div>

          {form.type === "cron" ? (
            <>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Cron expression (UTC)</span>
                <input
                  required
                  placeholder="0 9 * * *"
                  aria-describedby="cron-help"
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono"
                  value={form.cron}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cron: e.target.value }))
                  }
                />
              </label>
              <div id="cron-help" className="space-y-2 text-xs text-muted-foreground">
                <p>
                  Five fields, space-separated, all times in UTC:{" "}
                  <span className="font-mono text-foreground/80">
                    minute hour day-of-month month day-of-week
                  </span>
                  . Use <span className="font-mono">*</span> for &ldquo;every&rdquo;.
                  Day-of-week is 0–6 (Sunday = 0).
                </p>
                <p>
                  Example:{" "}
                  <span className="font-mono text-foreground/80">0 9 * * *</span>{" "}
                  runs every day at 9:00 AM UTC.
                </p>
                <div className="flex flex-wrap gap-2">
                  {CRON_PRESETS.map((preset) => (
                    <Button
                      key={preset.expr}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() =>
                        setForm((f) => ({ ...f, cron: preset.expr }))
                      }
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Prompt</span>
                <textarea
                  rows={3}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={form.prompt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, prompt: e.target.value }))
                  }
                  placeholder="Summarize yesterday's channel activity…"
                />
              </label>
            </>
          ) : (
            <>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">
                  Keywords (comma-separated, case-insensitive)
                </span>
                <input
                  required
                  placeholder="bug:, incident:"
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={form.keywords}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, keywords: e.target.value }))
                  }
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">
                  Prompt prefix (optional)
                </span>
                <textarea
                  rows={2}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={form.prompt_prefix}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, prompt_prefix: e.target.value }))
                  }
                />
              </label>
            </>
          )}

          <div className="flex gap-2">
            <Button type="submit" loading={saving}>
              {editingId ? "Save changes" : "Create trigger"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowCreate(false)
                setEditingId(null)
                setForm(emptyForm(agents, channels))
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      <p className="text-xs text-muted-foreground">
        Schedule cron runs via pg_cron calling{" "}
        <code className="text-xs">POST /triggers/run-cron</code> on the backend,
        or use Run to test manually.
      </p>
    </div>
  )
}
