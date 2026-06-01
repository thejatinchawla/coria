"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Download } from "lucide-react"
import type { Agent, AuditLogEntry } from "@/types"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/Toast"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 25

const OUTCOMES = [
  "allowed",
  "executed",
  "pending_approval",
  "approved",
  "declined",
  "blocked_permission",
  "blocked_budget",
  "blocked_rate",
  "failed",
] as const

function outcomeClass(outcome: string) {
  if (outcome.startsWith("blocked")) {
    return "bg-red-500/10 text-red-700 dark:text-red-400"
  }
  if (outcome === "executed" || outcome === "allowed") {
    return "bg-green-500/10 text-green-700 dark:text-green-400"
  }
  if (outcome === "pending_approval" || outcome === "approved") {
    return "bg-amber-500/10 text-amber-700 dark:text-amber-400"
  }
  return "bg-muted text-muted-foreground"
}

export function AuditLogSettings({ agents }: { agents: Agent[] }) {
  const { toast } = useToast()
  const [items, setItems] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [agentId, setAgentId] = useState("")
  const [toolName, setToolName] = useState("")
  const [outcome, setOutcome] = useState("")
  const [since, setSince] = useState("")
  const [applied, setApplied] = useState({
    agentId: "",
    toolName: "",
    outcome: "",
    since: "",
  })

  const agentName = (id: string | null) =>
    agents.find((a) => a.id === id)?.mention_slug ?? (id ? id.slice(0, 8) : "—")

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, total)

  const load = useCallback(
    async (
      nextPage: number,
      filters: {
        agentId: string
        toolName: string
        outcome: string
        since: string
      },
    ) => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set("limit", String(PAGE_SIZE))
        params.set("offset", String(nextPage * PAGE_SIZE))
        if (filters.agentId) params.set("agent_id", filters.agentId)
        if (filters.toolName) params.set("tool_name", filters.toolName)
        if (filters.outcome) params.set("outcome", filters.outcome)
        if (filters.since) {
          params.set("since", new Date(filters.since).toISOString())
        }

        const res = await fetch(`/api/settings/audit?${params.toString()}`)
        if (!res.ok) {
          toast("Could not load audit log.")
          return
        }
        const json = (await res.json()) as {
          items: AuditLogEntry[]
          total: number
        }
        setItems(json.items ?? [])
        setTotal(json.total ?? 0)
        setPage(nextPage)
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    void load(0, applied)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, [])

  function applyFilters() {
    const next = { agentId, toolName, outcome, since }
    setApplied(next)
    void load(0, next)
  }

  function goToPage(nextPage: number) {
    void load(nextPage, applied)
  }

  async function exportJson() {
    const res = await fetch("/api/settings/audit/export?days=30")
    if (!res.ok) {
      toast("Export failed.")
      return
    }
    const json = await res.json()
    const blob = new Blob([JSON.stringify(json.items ?? [], null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `coria-audit-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-medium">Filters</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => void exportJson()}>
            <Download className="mr-1 size-3.5" />
            Export JSON (30d)
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Agent</span>
            <select
              className="w-full rounded-md border border-input bg-transparent px-2 py-2 text-sm"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              <option value="">All</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  @{a.mention_slug}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Tool</span>
            <input
              placeholder="github_read"
              className="w-full rounded-md border border-input bg-transparent px-2 py-2 text-sm"
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Outcome</span>
            <select
              className="w-full rounded-md border border-input bg-transparent px-2 py-2 text-sm"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
            >
              <option value="">All</option>
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Since</span>
            <input
              type="date"
              className="w-full rounded-md border border-input bg-transparent px-2 py-2 text-sm"
              value={since}
              onChange={(e) => setSince(e.target.value)}
            />
          </label>
        </div>
        <Button type="button" size="sm" disabled={loading} onClick={applyFilters}>
          {loading ? "Loading…" : "Apply filters"}
        </Button>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {loading
              ? "Loading…"
              : total === 0
                ? "No entries"
                : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
          </p>
          {total > 0 && (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                disabled={loading || page === 0}
                aria-label="Previous page"
                onClick={() => goToPage(page - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-[5rem] text-center text-xs text-muted-foreground">
                Page {page + 1} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                disabled={loading || rangeEnd >= total}
                aria-label="Next page"
                onClick={() => goToPage(page + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </div>
        <ul className="space-y-2">
          {!loading && items.length === 0 && (
            <li className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No audit entries match your filters.
            </li>
          )}
          {items.map((entry) => (
            <li key={entry.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs",
                    outcomeClass(entry.outcome),
                  )}
                >
                  {entry.outcome}
                </span>
                <span className="font-mono text-xs">{entry.tool_name}</span>
                <span className="text-xs text-muted-foreground">
                  @{agentName(entry.agent_id)}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
              </div>
              {entry.gate_failed && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Gate: {entry.gate_failed}
                </p>
              )}
              {entry.action_block_id && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Action block: {entry.action_block_id.slice(0, 8)}…
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
