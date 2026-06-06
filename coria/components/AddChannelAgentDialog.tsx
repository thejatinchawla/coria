"use client"

import { useEffect, useMemo, useState } from "react"
import { X } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { AgentAvatar } from "@/components/AgentAvatar"
import { AgentAiBadge } from "@/components/AgentAiBadge"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { useToast } from "@/components/Toast"
import type { Agent } from "@/types"
import { cn } from "@/lib/utils"

export function AddChannelAgentDialog({
  open,
  channelId,
  workspaceId,
  channelAgentIds,
  onClose,
  onAdded,
}: {
  open: boolean
  channelId: string
  workspaceId: string
  channelAgentIds: Set<string>
  onClose: () => void
  onAdded: (agents: Agent[]) => void
}) {
  const { toast } = useToast()
  const [workspaceAgents, setWorkspaceAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!open) return
    setQuery("")
    setLoading(true)
    void (async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("agents")
        .select(
          "id,workspace_id,name,mention_slug,status,avatar_url,color,allowed_tools,template_id,created_at",
        )
        .eq("workspace_id", workspaceId)
        .eq("status", "active")
        .order("name", { ascending: true })

      if (error) {
        toast("Could not load agents.")
        setWorkspaceAgents([])
      } else {
        setWorkspaceAgents((data as Agent[]) ?? [])
      }
      setLoading(false)
    })()
  }, [open, workspaceId, toast])

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return workspaceAgents
      .filter((agent) => !channelAgentIds.has(agent.id))
      .filter((agent) =>
        q
          ? agent.name.toLowerCase().includes(q) ||
            agent.mention_slug.toLowerCase().includes(q)
          : true,
      )
  }, [workspaceAgents, channelAgentIds, query])

  async function addAgent(agent: Agent) {
    if (addingId) return
    setAddingId(agent.id)
    try {
      const res = await fetch(`/api/channels/${channelId}/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agent.id }),
      })
      const json = (await res.json()) as {
        error?: string
        agents?: Agent[]
      }
      if (!res.ok) {
        toast(json.error ?? "Could not add agent.")
        return
      }
      onAdded(json.agents ?? [])
      toast(`${agent.name} added to the conversation.`, "success")
    } finally {
      setAddingId(null)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        className={cn(
          "flex max-h-[min(80vh,32rem)] w-full max-w-md flex-col rounded-xl border bg-background shadow-lg",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-agent-title"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 id="add-agent-title" className="text-sm font-medium">
            Add an agent
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="border-b px-4 py-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents…"
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Loading agents…
            </p>
          ) : candidates.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {workspaceAgents.length === 0
                ? "No active agents in this workspace."
                : "Everyone available is already in this chat."}
            </p>
          ) : (
            <ul className="space-y-1">
              {candidates.map((agent) => (
                <li key={agent.id}>
                  <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
                    <AgentAvatar
                      name={agent.name}
                      mentionSlug={agent.mention_slug}
                      color={agent.color}
                      avatarUrl={agent.avatar_url}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {agent.name}
                        </p>
                        <AgentAiBadge compact />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        @{agent.mention_slug}
                      </p>
                    </div>
                    <LoadingButton
                      type="button"
                      size="sm"
                      variant="outline"
                      loading={addingId === agent.id}
                      onClick={() => void addAgent(agent)}
                    >
                      Add
                    </LoadingButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
