"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Send } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { streamInvoke } from "@/lib/stream-invoke"
import { fetchAgentBySlug } from "@/lib/workspace"
import { useToast } from "@/components/Toast"
import { AgentAvatar } from "@/components/AgentAvatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/lib/use-mobile"
import type { ActionBlock, Agent, Message } from "@/types"

function agentDescription(agent: Agent): string {
  if (agent.template_id === "engineering") return "Engineering agent"
  if (agent.template_id === "research") return "Research agent"
  return "AI teammate"
}

function messagePlaceholder(
  channelSlug: string,
  agents: Agent[],
  compact: boolean,
  directAgent: Agent | null,
): string {
  if (directAgent) return `Message ${directAgent.name}…`
  if (compact) return `Message #${channelSlug}`
  const active = agents.filter((a) => a.status === "active")
  if (active.length === 0) {
    return `Message #${channelSlug}`
  }
  const mentions = active
    .slice(0, 4)
    .map((a) => `@${a.mention_slug}`)
    .join(", ")
  return `Message #${channelSlug} — ${mentions}…`
}

function matchingAgents(text: string, agents: Agent[]) {
  const match = text.match(/^@(\w*)$/)
  if (!match) return []
  const partial = match[1].toLowerCase()
  return agents.filter(
    (a) => a.status === "active" && a.mention_slug.startsWith(partial),
  )
}

export function MessageInput({
  channelId,
  channelSlug,
  workspaceId,
  defaultAgentId,
  agents,
  agentsGloballyPaused = false,
  memberId,
  senderName,
  threadId = null,
  compact = false,
  directAgentId = null,
  onStreamStart,
  onStreamStatus,
  onStreamToken,
  onStreamEnd,
  onStreamError,
  onActionBlock,
  onMessageSent,
  prefill,
  onPrefillApplied,
}: {
  channelId: string
  channelSlug: string
  workspaceId: string
  defaultAgentId: string
  agents: Agent[]
  agentsGloballyPaused?: boolean
  memberId: string | null
  senderName: string
  threadId?: string | null
  compact?: boolean
  /** When set, every message auto-invokes this agent (direct agent chat). */
  directAgentId?: string | null
  onStreamStart?: (agent: Pick<Agent, "name" | "color" | "avatar_url">) => void
  onStreamStatus?: (status: string) => void
  onStreamToken?: (token: string) => void
  onStreamEnd?: () => void
  onStreamError?: () => void
  onActionBlock?: (block: ActionBlock) => void
  onMessageSent?: (message: Message) => void
  prefill?: string | null
  onPrefillApplied?: () => void
}) {
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [hintIndex, setHintIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const refocusAfterSendRef = useRef(false)

  const directAgent = useMemo(
    () =>
      directAgentId
        ? (agents.find((a) => a.id === directAgentId) ?? null)
        : null,
    [agents, directAgentId],
  )
  const hintAgents = useMemo(() => matchingAgents(text, agents), [text, agents])
  const placeholder = useMemo(
    () => messagePlaceholder(channelSlug, agents, isMobile, directAgent),
    [channelSlug, agents, isMobile, directAgent],
  )
  const showAgentHint = hintAgents.length > 0
  const canSend = text.trim().length > 0 && !sending && !agentsGloballyPaused

  useEffect(() => {
    if (!prefill) return
    setText(prefill)
    onPrefillApplied?.()
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      textarea.style.height = "auto"
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
    })
  }, [prefill, onPrefillApplied])

  useEffect(() => {
    if (sending || !refocusAfterSendRef.current) return
    refocusAfterSendRef.current = false
    const textarea = textareaRef.current
    if (!textarea) return
    requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true })
      formRef.current?.scrollIntoView({ block: "end", behavior: "instant" })
    })
  }, [sending])

  function keepComposerVisible() {
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ block: "end", behavior: "instant" })
    })
  }

  async function send() {
    const content = text.trim()
    if (!content || sending) return

    setSending(true)
    const supabase = createClient()
    const insertRow: Record<string, unknown> = {
      channel_id: channelId,
      sender_name: senderName,
      sender_type: "human",
      content,
    }
    if (memberId) {
      insertRow.sender_id = memberId
    }
    if (threadId) {
      insertRow.thread_id = threadId
      insertRow.parent_message_id = threadId
    }
    const { data: inserted, error } = await supabase
      .from("messages")
      .insert(insertRow)
      .select("*")
      .single()

    if (error) {
      setSending(false)
      toast(`Could not send message: ${error.message}`)
      return
    }

    if (inserted) {
      onMessageSent?.(inserted as Message)
    }

    setText("")
    setHintIndex(0)
    if (textareaRef.current) textareaRef.current.style.height = "auto"
    refocusAfterSendRef.current = true

    if (inserted?.id) {
      fetch("/api/memory/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: inserted.id }),
      }).catch(() => {
        /* non-blocking */
      })
    }

    // Keyword triggers (skip @mention invokes — backend debounces per trigger)
    if (!threadId) {
      fetch("/api/triggers/keyword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: channelId,
          content,
        }),
      }).catch(() => {
        /* non-blocking */
      })
    }

    const mentionMatch = directAgentId
      ? null
      : content.match(/^@(\w+)\s+([\s\S]+)/i)
    if (directAgentId || mentionMatch) {
      const slug = mentionMatch?.[1]?.toLowerCase()
      const userMessage = mentionMatch?.[2]?.trim() ?? content
      const resolvedAgentId =
        directAgentId ??
        (await fetchAgentBySlug(supabase, workspaceId, slug!)) ??
        defaultAgentId
      const resolvedAgent =
        agents.find((a) => a.id === resolvedAgentId) ??
        (slug ? agents.find((a) => a.mention_slug === slug) : null) ??
        directAgent ??
        null

      onStreamStart?.({
        name: resolvedAgent?.name ?? slug ?? "Agent",
        color: resolvedAgent?.color,
        avatar_url: resolvedAgent?.avatar_url,
      })
      try {
        await streamInvoke(
          {
            user_message: userMessage,
            channel_id: channelId,
            agent_id: resolvedAgentId,
            invoker_member_id: memberId,
            thread_id: threadId,
          },
          {
            onStatus: onStreamStatus,
            onToken: onStreamToken,
            onActionBlock: (block) => onActionBlock?.(block),
            onAwaitingApproval: onStreamEnd,
            onDone: (message) => onMessageSent?.(message),
            onError: (message) => {
              toast(message)
              onStreamError?.()
            },
          },
        )
      } catch {
        onStreamError?.()
      } finally {
        onStreamEnd?.()
        setSending(false)
      }
      return
    }

    setSending(false)
  }

  function completeMention(slug: string) {
    setText(`@${slug} `)
    setHintIndex(0)
    textareaRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showAgentHint) {
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault()
        const agent = hintAgents[hintIndex] ?? hintAgents[0]
        if (agent) completeMention(agent.mention_slug)
        return
      }
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setHintIndex((i) => Math.min(i + 1, hintAgents.length - 1))
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setHintIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setText("")
        return
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    setHintIndex(0)
    const el = e.target
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
      className={
        compact
          ? "shrink-0 bg-background"
          : "shrink-0 border-t bg-background px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4"
      }
    >
      <div className={compact ? "" : "relative mx-auto max-w-3xl"}>
        {showAgentHint && (
          <div
            id="agent-mention-hint"
            role="listbox"
            aria-label="Mention suggestions"
            className="absolute bottom-full left-0 z-10 mb-2 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md"
          >
            {hintAgents.map((agent, i) => (
              <button
                key={agent.id}
                type="button"
                role="option"
                aria-selected={hintIndex === i}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => completeMention(agent.mention_slug)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                  hintIndex === i && "bg-accent",
                )}
              >
                <AgentAvatar
                  name={agent.name}
                  mentionSlug={agent.mention_slug}
                  color={agent.color}
                  avatarUrl={agent.avatar_url}
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">@{agent.mention_slug}</span>
                  <span className="ml-2 text-muted-foreground">
                    {agentDescription(agent)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={keepComposerVisible}
            rows={1}
            enterKeyHint="send"
            placeholder={
              agentsGloballyPaused
                ? "All agents are paused"
                : threadId
                  ? "Reply in thread…"
                  : placeholder
            }
            disabled={agentsGloballyPaused}
            aria-busy={sending}
            aria-autocomplete="list"
            aria-controls={showAgentHint ? "agent-mention-hint" : undefined}
            className="flex min-h-9 flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-8 sm:py-1.5 sm:text-sm"
          />
          <Button
            type="submit"
            size="icon"
            loading={sending}
            disabled={!canSend}
            aria-label="Send message"
            className="size-9 shrink-0"
            onPointerDown={(e) => e.preventDefault()}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </form>
  )
}
