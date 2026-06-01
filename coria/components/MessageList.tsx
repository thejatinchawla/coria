"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import type { Agent, Message as MessageType } from "@/types"
import { Message } from "@/components/Message"
import { AgentThinking } from "@/components/AgentThinking"
import { StreamingMessage } from "@/components/StreamingMessage"
import { ThreadInline } from "@/components/ThreadInline"
import { Button } from "@/components/ui/button"
import type { ActionBlock } from "@/types"

const SCROLL_THRESHOLD_PX = 80

export function MessageList({
  messages,
  streamState,
  streamingAgent,
  agentsById,
  expandedThreadId,
  threadReplies,
  highlightMessageId,
  onOpenThread,
  onToggleThread,
  onPinToggle,
  pinLimitReached = false,
  onDelete,
  canDelete,
  currentMemberId = null,
  activeStreamThreadId,
  threadProps,
}: {
  messages: MessageType[]
  streamState?: { content: string; status?: string } | null
  streamingAgent?: Pick<Agent, "name" | "color" | "avatar_url"> | null
  agentsById?: Record<string, Agent>
  expandedThreadId?: string | null
  threadReplies?: Record<string, MessageType[]>
  highlightMessageId?: string | null
  onOpenThread?: (message: MessageType) => void
  onToggleThread?: (message: MessageType) => void
  onPinToggle?: (message: MessageType, pinned: boolean) => void
  pinLimitReached?: boolean
  onDelete?: (message: MessageType) => void
  canDelete?: (message: MessageType) => boolean
  currentMemberId?: string | null
  activeStreamThreadId?: string | null
  threadProps?: {
    channelId: string
    channelSlug: string
    workspaceId: string
    defaultAgentId: string
    agents: Agent[]
    agentsGloballyPaused?: boolean
    memberId: string | null
    senderName: string
    onStreamStart?: (agent: Pick<Agent, "name" | "color" | "avatar_url">) => void
    onStreamStatus?: (status: string) => void
    onStreamToken?: (token: string) => void
    onStreamEnd?: () => void
    onStreamError?: () => void
    onActionBlock?: (block: ActionBlock) => void
    onMessageSent?: (message: MessageType) => void
    onPinToggle?: (message: MessageType, pinned: boolean) => void
    pinLimitReached?: boolean
    onDelete?: (message: MessageType) => void
    canDelete?: (message: MessageType) => boolean
  }
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isFirstRender = useRef(true)
  const prevLastMessageId = useRef<string | undefined>(
    messages.at(-1)?.id,
  )
  const [atBottom, setAtBottom] = useState(true)

  const checkAtBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    setAtBottom(distance <= SCROLL_THRESHOLD_PX)
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior })
    setAtBottom(true)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener("scroll", checkAtBottom, { passive: true })
    checkAtBottom()
    return () => el.removeEventListener("scroll", checkAtBottom)
  }, [checkAtBottom, messages.length])

  useEffect(() => {
    const lastId = messages.at(-1)?.id
    const newChannelMessage = lastId !== prevLastMessageId.current
    prevLastMessageId.current = lastId

    const channelStreaming =
      !activeStreamThreadId &&
      streamState &&
      (streamState.content.length > 0 || streamState.status)

    if (isFirstRender.current || newChannelMessage || channelStreaming) {
      bottomRef.current?.scrollIntoView({
        behavior: isFirstRender.current ? "instant" : "smooth",
      })
      setAtBottom(true)
    }
    isFirstRender.current = false
  }, [messages, streamState, activeStreamThreadId])

  if (messages.length === 0 && !streamState) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">No messages yet. Say hi 👋</p>
      </div>
    )
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} className="h-full overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6">
        {messages.map((message) => (
          <div key={message.id} className="flex flex-col gap-0">
            <Message
              message={message}
              agent={
                message.sender_id && agentsById
                  ? agentsById[message.sender_id]
                  : undefined
              }
              replyCount={message.reply_count ?? 0}
              threadExpanded={expandedThreadId === message.id}
              highlight={highlightMessageId === message.id}
              onReply={onOpenThread ? () => onOpenThread(message) : undefined}
              onToggleThread={
                (message.reply_count ?? 0) > 0 && onToggleThread
                  ? () => onToggleThread(message)
                  : undefined
              }
              onPinToggle={
                onPinToggle
                  ? (pinned) => onPinToggle(message, pinned)
                  : undefined
              }
              pinDisabled={
                pinLimitReached && !message.is_pinned && onPinToggle !== undefined
              }
              onDelete={
                onDelete && (!canDelete || canDelete(message))
                  ? () => onDelete(message)
                  : undefined
              }
              currentMemberId={currentMemberId ?? threadProps?.memberId ?? null}
            />
            {expandedThreadId === message.id &&
              threadProps &&
              threadReplies && (
                <div className="hidden md:block">
                  <ThreadInline
                    rootMessage={message}
                    replies={threadReplies[message.id] ?? []}
                    highlightMessageId={highlightMessageId}
                    streamState={
                      activeStreamThreadId === message.id ? streamState : null
                    }
                    streamingAgent={
                      activeStreamThreadId === message.id
                        ? streamingAgent
                        : null
                    }
                    agentsById={agentsById}
                    {...threadProps}
                  />
                </div>
              )}
          </div>
        ))}
        {streamState &&
          !activeStreamThreadId &&
          (streamState.content ? (
            <StreamingMessage
              senderName={streamingAgent?.name ?? "Agent"}
              content={streamState.content}
              color={streamingAgent?.color}
              avatarUrl={streamingAgent?.avatar_url}
            />
          ) : (
            <AgentThinking
              message={
                streamState.status ??
                `${streamingAgent?.name ?? "Agent"} is thinking…`
              }
              agentName={streamingAgent?.name ?? "Agent"}
              color={streamingAgent?.color}
              avatarUrl={streamingAgent?.avatar_url}
            />
          ))}
        <div ref={bottomRef} />
        </div>
      </div>
      {!atBottom && (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          aria-label="Scroll to latest messages"
          onClick={() => scrollToBottom()}
          className="absolute bottom-4 right-4 z-10 size-10 rounded-full shadow-md"
        >
          <ChevronDown className="size-5" />
        </Button>
      )}
    </div>
  )
}
