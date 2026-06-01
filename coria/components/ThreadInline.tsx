"use client"

import { useEffect, useState } from "react"
import type { Agent, Message } from "@/types"
import { Message as MessageBubble } from "@/components/Message"
import { MessageInput } from "@/components/MessageInput"
import { AgentThinking } from "@/components/AgentThinking"
import { StreamingMessage } from "@/components/StreamingMessage"

export function ThreadInline({
  rootMessage,
  replies,
  streamState,
  streamingAgent,
  agentsById,
  channelId,
  channelSlug,
  workspaceId,
  defaultAgentId,
  agents,
  agentsGloballyPaused,
  memberId,
  senderName,
  onStreamStart,
  onStreamStatus,
  onStreamToken,
  onStreamEnd,
  onStreamError,
  onActionBlock,
  onMessageSent,
  onPinToggle,
  pinLimitReached = false,
  onDelete,
  canDelete,
  highlightMessageId,
}: {
  rootMessage: Message
  replies: Message[]
  streamState?: { content: string; status?: string } | null
  streamingAgent?: Pick<Agent, "name" | "color" | "avatar_url"> | null
  agentsById?: Record<string, Agent>
  channelId: string
  channelSlug: string
  workspaceId: string
  defaultAgentId: string
  agents: Agent[]
  agentsGloballyPaused?: boolean
  memberId: string | null
  senderName: string
  highlightMessageId?: string | null
  onStreamStart?: (agent: Pick<Agent, "name" | "color" | "avatar_url">) => void
  onStreamStatus?: (status: string) => void
  onStreamToken?: (token: string) => void
  onStreamEnd?: () => void
  onStreamError?: () => void
  onActionBlock?: (block: import("@/types").ActionBlock) => void
  onMessageSent?: (message: Message) => void
  onPinToggle?: (message: Message, pinned: boolean) => void
  pinLimitReached?: boolean
  onDelete?: (message: Message) => void
  canDelete?: (message: Message) => boolean
}) {
  return (
    <div className="ml-8 border-l-2 border-muted/80 pl-4 sm:ml-10">
      <div className="space-y-3 py-2">
        {replies.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            agent={
              message.sender_id && agentsById
                ? agentsById[message.sender_id]
                : undefined
            }
            compact
            highlight={highlightMessageId === message.id}
            onPinToggle={
              onPinToggle ? (pinned) => onPinToggle(message, pinned) : undefined
            }
            pinDisabled={pinLimitReached && !message.is_pinned}
            onDelete={
              onDelete && (!canDelete || canDelete(message))
                ? () => onDelete(message)
                : undefined
            }
          />
        ))}
        {streamState &&
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
      </div>
      <div className="border-t border-muted/50 py-2">
        <MessageInput
          channelId={channelId}
          channelSlug={channelSlug}
          workspaceId={workspaceId}
          defaultAgentId={defaultAgentId}
          agents={agents}
          agentsGloballyPaused={agentsGloballyPaused}
          memberId={memberId}
          senderName={senderName}
          threadId={rootMessage.id}
          compact
          onStreamStart={onStreamStart}
          onStreamStatus={onStreamStatus}
          onStreamToken={onStreamToken}
          onStreamEnd={onStreamEnd}
          onStreamError={onStreamError}
          onActionBlock={onActionBlock}
          onMessageSent={onMessageSent}
        />
      </div>
    </div>
  )
}

export function useIsMobile(breakpointPx = 768): boolean {
  const [mobile, setMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`)
    const update = () => setMobile(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [breakpointPx])

  return mobile
}
