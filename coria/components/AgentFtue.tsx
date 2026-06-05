"use client"

import { useCallback, useEffect, useState } from "react"
import { AtSign, Bot, ShieldCheck } from "lucide-react"
import type { Agent } from "@/types"
import { AgentAiBadge } from "@/components/AgentAiBadge"
import { Button } from "@/components/ui/button"
import {
  hasSeenAgentFtue,
  markAgentFtueSeen,
} from "@/lib/agent-ftue"

function buildExamplePrompt(agents: Agent[]): string {
  const agent =
    agents.find((a) => a.status === "active") ??
    agents.find((a) => a.mention_slug === "divv") ??
    agents[0]
  const slug = agent?.mention_slug ?? "divv"
  return `@${slug} What can you help our team with?`
}

export function AgentFtue({
  agents,
  memberId,
  workspaceId,
  onTryExample,
}: {
  agents: Agent[]
  memberId: string | null
  workspaceId: string
  onTryExample: (text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const activeAgents = agents.filter((a) => a.status === "active")
  const examplePrompt = buildExamplePrompt(agents)

  useEffect(() => {
    if (!memberId || activeAgents.length === 0) return
    if (hasSeenAgentFtue(workspaceId, memberId)) return
    setOpen(true)
  }, [memberId, workspaceId, activeAgents.length])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  const dismiss = useCallback(() => {
    if (memberId) markAgentFtueSeen(workspaceId, memberId)
    setOpen(false)
  }, [memberId, workspaceId])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, dismiss])

  function tryExample() {
    onTryExample(examplePrompt)
    dismiss()
  }

  if (!open) return null

  const agentNames = activeAgents
    .slice(0, 3)
    .map((a) => `@${a.mention_slug}`)
    .join(", ")

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Dismiss introduction"
        className="absolute inset-0 bg-black/50"
        onClick={dismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-ftue-title"
        className="relative z-10 w-full max-w-lg rounded-xl border bg-background p-6 shadow-lg"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-700 dark:text-violet-300">
            <Bot className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 space-y-1">
            <h2 id="agent-ftue-title" className="text-lg font-semibold tracking-tight">
              Chat with AI agents
            </h2>
            <p className="text-sm text-muted-foreground">
              Coria agents are AI teammates in your channels. Mention one to ask
              questions, draft content, or research a topic.
            </p>
          </div>
        </div>

        <ol className="mt-5 space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <AtSign className="size-3.5" aria-hidden />
            </span>
            <span>
              Type <strong>@{activeAgents[0]?.mention_slug ?? "divv"}</strong>{" "}
              followed by your question
              {activeAgents.length > 1 && (
                <span className="text-muted-foreground">
                  {" "}
                  — try {agentNames}
                </span>
              )}
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Bot className="size-3.5" aria-hidden />
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              Replies show an <AgentAiBadge compact /> badge so you know it is AI
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden />
            </span>
            <span>
              Risky actions (like posting to GitHub) wait for your Approve or
              Decline in chat
            </span>
          </li>
        </ol>

        <div className="mt-5 rounded-lg border bg-muted/40 px-3 py-2.5">
          <p className="text-xs font-medium text-muted-foreground">Example</p>
          <p className="mt-1 font-mono text-sm">{examplePrompt}</p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={dismiss}>
            Got it
          </Button>
          <Button type="button" onClick={tryExample}>
            Try example
          </Button>
        </div>
      </div>
    </div>
  )
}
