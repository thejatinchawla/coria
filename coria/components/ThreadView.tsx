"use client"

import { ArrowLeft } from "lucide-react"
import type { ActionBlock, Agent, Member, Message } from "@/types"
import { MessageList } from "@/components/MessageList"
import { MessageInput } from "@/components/MessageInput"
import { Button } from "@/components/ui/button"

export function ThreadView({
  rootMessage,
  replies,
  streamState,
  streamingAgent,
  agentsById,
  membersById,
  channelId,
  channelSlug,
  workspaceId,
  defaultAgentId,
  agents,
  invokableAgents,
  skipKeywordTriggers,
  directAgentId,
  agentsGloballyPaused,
  memberId,
  senderName,
  onClose,
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
  streamState?: {
    content: string
    status?: string
    agent?: Pick<Agent, "name" | "color" | "avatar_url"> | null
  } | null
  streamingAgent?: Pick<Agent, "name" | "color" | "avatar_url"> | null
  agentsById?: Record<string, Agent>
  membersById?: Record<string, Member>
  channelId: string
  channelSlug: string
  workspaceId: string
  defaultAgentId: string
  agents: Agent[]
  invokableAgents?: Agent[]
  skipKeywordTriggers?: boolean
  directAgentId?: string | null
  agentsGloballyPaused?: boolean
  memberId: string | null
  senderName: string
  onClose: () => void
  onStreamStart?: (agent: Pick<Agent, "name" | "color" | "avatar_url">) => void
  onStreamStatus?: (status: string) => void
  onStreamToken?: (token: string) => void
  onStreamEnd?: () => void
  onStreamError?: () => void
  onActionBlock?: (block: ActionBlock) => void
  onMessageSent?: (message: Message) => void
  onPinToggle?: (message: Message, pinned: boolean) => void
  pinLimitReached?: boolean
  onDelete?: (message: Message) => void
  canDelete?: (message: Message) => boolean
  highlightMessageId?: string | null
}) {
  const threadMessages = [rootMessage, ...replies]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background md:hidden">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close thread"
          onClick={onClose}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <span className="text-sm font-medium">Thread</span>
      </header>
      <MessageList
        messages={threadMessages}
        streamState={streamState}
        streamingAgent={streamingAgent}
        agentsById={agentsById}
        membersById={membersById}
        highlightMessageId={highlightMessageId}
        onPinToggle={onPinToggle}
        pinLimitReached={pinLimitReached}
          onDelete={onDelete}
          canDelete={canDelete}
          currentMemberId={memberId}
        />
      <MessageInput
        channelId={channelId}
        channelSlug={channelSlug}
        workspaceId={workspaceId}
        defaultAgentId={defaultAgentId}
        agents={agents}
        invokableAgents={invokableAgents}
        skipKeywordTriggers={skipKeywordTriggers}
        directAgentId={directAgentId}
        agentsGloballyPaused={agentsGloballyPaused}
        memberId={memberId}
        senderName={senderName}
        threadId={rootMessage.id}
        onStreamStart={onStreamStart}
        onStreamStatus={onStreamStatus}
        onStreamToken={onStreamToken}
        onStreamEnd={onStreamEnd}
        onStreamError={onStreamError}
        onActionBlock={onActionBlock}
        onMessageSent={onMessageSent}
      />
    </div>
  )
}
