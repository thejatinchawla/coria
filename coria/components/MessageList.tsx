"use client"

import { useEffect, useRef } from "react"
import type { Agent, Message as MessageType } from "@/types"
import { Message } from "@/components/Message"
import { AriaThinking } from "@/components/AriaThinking"
import { StreamingMessage } from "@/components/StreamingMessage"
import { ThreadInline } from "@/components/ThreadInline"
import type { ActionBlock } from "@/types"

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
  }
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const isFirstRender = useRef(true)
  const prevLastMessageId = useRef<string | undefined>(
    messages.at(-1)?.id,
  )

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
    <div className="flex-1 overflow-y-auto">
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
            <AriaThinking
              message={
                streamState.status ??
                `${streamingAgent?.name ?? "Agent"} is thinking…`
              }
            />
          ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
