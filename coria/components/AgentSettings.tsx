"use client"

import { useCallback, useState } from "react"
import { Pause, Play, Plus } from "lucide-react"
import type { Agent, WorkspaceSettings } from "@/types"
import { AgentAvatar } from "@/components/AgentAvatar"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/Toast"
import { cn } from "@/lib/utils"

const TOOL_OPTIONS = [
  { id: "web_search", label: "Web search" },
  { id: "github_read", label: "GitHub read" },
  { id: "github_post_comment", label: "GitHub comment" },
  { id: "github_create_pr", label: "GitHub create PR" },
  { id: "workspace_search", label: "Workspace search" },
] as const

type AgentForm = {
  name: string
  mention_slug: string
  system_prompt: string
  allowed_tools: string[]
  color: string
}

const EMPTY_FORM: AgentForm = {
  name: "",
  mention_slug: "",
  system_prompt: "",
  allowed_tools: ["web_search"],
  color: "#6366f1",
}

export function AgentSettings({
  initialAgents,
  initialSettings,
}: {
  initialAgents: Agent[]
  initialSettings: WorkspaceSettings | null
}) {
  const { toast } = useToast()
  const [agents, setAgents] = useState<Agent[]>(initialAgents)
  const [settings, setSettings] = useState<WorkspaceSettings | null>(
    initialSettings,
  )
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<AgentForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [agentsRes, settingsRes] = await Promise.all([
        fetch("/api/settings/agents"),
        fetch("/api/settings/workspace"),
      ])
      if (!agentsRes.ok || !settingsRes.ok) {
        toast("Could not load settings.")
        return
      }
      const agentsJson = (await agentsRes.json()) as { items: Agent[] }
      const settingsJson = (await settingsRes.json()) as { settings: WorkspaceSettings }
      setAgents(agentsJson.items ?? [])
      setSettings(settingsJson.settings)
    } finally {
      setLoading(false)
    }
  }, [toast])

  async function patchAgent(id: string, payload: Record<string, unknown>) {
    setSaving(true)
    try {
      const res = await fetch(`/api/settings/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast(typeof err.detail === "string" ? err.detail : "Could not update agent.")
        return
      }
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function patchSettings(payload: Record<string, unknown>) {
    setSaving(true)
    try {
      const res = await fetch("/api/settings/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        toast("Could not update workspace settings.")
        return
      }
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function createAgent(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch("/api/settings/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast(typeof err.detail === "string" ? err.detail : "Could not create agent.")
        return
      }
      setForm(EMPTY_FORM)
      setShowCreate(false)
      await load()
      toast("Agent created.", "success")
    } finally {
      setSaving(false)
    }
  }

  function startEdit(agent: Agent) {
    setEditingId(agent.id)
    setForm({
      name: agent.name,
      mention_slug: agent.mention_slug,
      system_prompt: agent.system_prompt ?? "",
      allowed_tools: agent.allowed_tools ?? ["web_search"],
      color: agent.color ?? "#6366f1",
    })
    setShowCreate(false)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId) return
    await patchAgent(editingId, form)
    setEditingId(null)
    setForm(EMPTY_FORM)
    toast("Agent updated.", "success")
  }

  if (loading && agents.length === 0 && !settings) {
    return (
      <p className="text-sm text-muted-foreground">Loading agents…</p>
    )
  }

  return (
    <div className="space-y-8">
      {settings && (
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="text-sm font-medium">Workspace controls</h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Kill switch</p>
              <p className="text-xs text-muted-foreground">
                Pause all agents workspace-wide
              </p>
            </div>
            <Button
              variant={settings.agents_globally_paused ? "destructive" : "outline"}
              size="sm"
              disabled={saving}
              onClick={() =>
                void patchSettings({
                  agents_globally_paused: !settings.agents_globally_paused,
                })
              }
            >
              {settings.agents_globally_paused ? "Resume all agents" : "Pause all agents"}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Monthly tool budget</span>
              <input
                type="number"
                min={0}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={settings.monthly_tool_budget}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          monthly_tool_budget: parseInt(e.target.value, 10) || 0,
                        }
                      : s,
                  )
                }
                onBlur={() =>
                  void patchSettings({
                    monthly_tool_budget: settings.monthly_tool_budget,
                  })
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Tool calls used</span>
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  {settings.tool_budget_used} / {settings.monthly_tool_budget}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => void patchSettings({ tool_budget_used: 0 })}
                >
                  Reset
                </Button>
              </div>
            </label>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Agents</h2>
          {!showCreate && !editingId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowCreate(true)
                setEditingId(null)
                setForm(EMPTY_FORM)
              }}
            >
              <Plus className="mr-1 size-3.5" />
              New agent
            </Button>
          )}
        </div>

        <ul className="space-y-2">
          {agents.map((agent) => (
            <li
              key={agent.id}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <AgentAvatar
                name={agent.name}
                color={agent.color}
                avatarUrl={agent.avatar_url}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {agent.name}{" "}
                  <span className="font-normal text-muted-foreground">
                    @{agent.mention_slug}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {agent.status === "paused" ? "Paused" : "Active"}
                  {agent.template_id ? ` · ${agent.template_id}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={saving}
                  aria-label={agent.status === "paused" ? "Resume agent" : "Pause agent"}
                  onClick={() =>
                    void patchAgent(agent.id, {
                      status: agent.status === "paused" ? "active" : "paused",
                    })
                  }
                >
                  {agent.status === "paused" ? (
                    <Play className="size-4" />
                  ) : (
                    <Pause className="size-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => startEdit(agent)}
                >
                  Edit
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {(showCreate || editingId) && (
        <form
          onSubmit={(e) => void (editingId ? saveEdit(e) : createAgent(e))}
          className="space-y-4 rounded-lg border p-4"
        >
          <h2 className="text-sm font-medium">
            {editingId ? "Edit agent" : "Create agent"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Name</span>
              <input
                required
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Mention slug</span>
              <input
                required
                pattern="[a-z][a-z0-9_-]{0,31}"
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={form.mention_slug}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    mention_slug: e.target.value.toLowerCase(),
                  }))
                }
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">System prompt</span>
            <textarea
              required
              rows={4}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={form.system_prompt}
              onChange={(e) =>
                setForm((f) => ({ ...f, system_prompt: e.target.value }))
              }
            />
          </label>
          <div className="space-y-2">
            <span className="text-sm text-muted-foreground">Allowed tools</span>
            <div className="flex flex-wrap gap-2">
              {TOOL_OPTIONS.map((tool) => {
                const checked = form.allowed_tools.includes(tool.id)
                return (
                  <label
                    key={tool.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
                      checked && "border-primary bg-primary/5",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setForm((f) => ({
                          ...f,
                          allowed_tools: checked
                            ? f.allowed_tools.filter((t) => t !== tool.id)
                            : [...f.allowed_tools, tool.id],
                        }))
                      }
                    />
                    {tool.label}
                  </label>
                )
              })}
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Color</span>
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {editingId ? "Save changes" : "Create agent"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowCreate(false)
                setEditingId(null)
                setForm(EMPTY_FORM)
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
