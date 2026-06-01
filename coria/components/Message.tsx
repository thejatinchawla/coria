"use client"

import { ChevronDown, ChevronRight, MessageSquare, Pin, PinOff } from "lucide-react"
import { useState } from "react"
import { AgentAvatar } from "@/components/AgentAvatar"
import { Button } from "@/components/ui/button"
import { MessageTimestamp } from "@/components/MessageTimestamp"
import { ReasoningTrace } from "@/components/ReasoningTrace"
import type { Agent, Message as MessageType } from "@/types"

export function Message({
  message,
  agent,
  compact = false,
  replyCount = 0,
  threadExpanded = false,
  onReply,
  onToggleThread,
  onPinToggle,
  pinDisabled = false,
  highlight = false,
}: {
  message: MessageType
  agent?: Agent | null
  compact?: boolean
  replyCount?: number
  threadExpanded?: boolean
  onReply?: () => void
  onToggleThread?: () => void
  onPinToggle?: (pinned: boolean) => void
  pinDisabled?: boolean
  highlight?: boolean
}) {
  const isAgent = message.sender_type === "agent"
  const [expanded, setExpanded] = useState(false)
  const count = message.reply_count ?? replyCount
  const isPinned = message.is_pinned === true

  const pinControl = onPinToggle ? (
    <button
      type="button"
      onClick={() => onPinToggle(!isPinned)}
      disabled={pinDisabled && !isPinned}
      title={
        pinDisabled && !isPinned
          ? "Pin limit reached (5 per channel)"
          : isPinned
            ? "Unpin message"
            : "Pin message"
      }
      aria-label={isPinned ? "Unpin message" : "Pin message"}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors ${
        isPinned
          ? "bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 dark:text-amber-300"
          : pinDisabled
            ? "cursor-not-allowed text-muted-foreground/40"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {isPinned ? (
        <>
          <PinOff className="size-3.5 shrink-0" />
          <span>Unpin</span>
        </>
      ) : (
        <>
          <Pin className="size-3.5 shrink-0" />
          <span>Pin</span>
        </>
      )}
    </button>
  ) : isPinned ? (
    <span
      className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-800 dark:text-amber-300"
      title="Pinned message"
    >
      <Pin className="size-3.5" />
      <span>Pinned</span>
    </span>
  ) : null

  const threadControls =
    onReply || onToggleThread ? (
      <div className="flex items-center gap-2">
        {count > 0 && onToggleThread && (
          <button
            type="button"
            onClick={onToggleThread}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <MessageSquare className="size-3.5" />
            {count} {count === 1 ? "reply" : "replies"}
            {threadExpanded ? " · hide" : ""}
          </button>
        )}
        {onReply && (
          <button
            type="button"
            onClick={onReply}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Reply
          </button>
        )}
      </div>
    ) : null

  const wrapperClass = `scroll-mt-4 ${highlight ? "rounded-md ring-2 ring-primary/40 ring-offset-2 ring-offset-background" : ""}`

  if (!isAgent) {
    return (
      <div id={`message-${message.id}`} className={wrapperClass}>
        <div className="flex flex-col items-end gap-1">
          <div
            className={`max-w-[min(85%,32rem)] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground sm:max-w-[70%] ${compact ? "sm:max-w-[85%]" : "sm:px-4"}`}
          >
            <p className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {pinControl}
            <MessageTimestamp
              iso={message.created_at}
              className="text-xs text-muted-foreground"
            />
            {threadControls}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div id={`message-${message.id}`} className={wrapperClass}>
      <div className="flex gap-2 sm:gap-3">
        {!compact && (
          <AgentAvatar
            name={agent?.name ?? message.sender_name}
            color={agent?.color}
            avatarUrl={agent?.avatar_url}
          />
        )}
        <div
          className={`flex min-w-0 flex-1 flex-col gap-1 ${compact ? "max-w-full" : "max-w-[min(85%,32rem)] sm:max-w-[70%]"}`}
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-xs text-muted-foreground">
              {message.sender_name}
            </span>
            <MessageTimestamp
              iso={message.created_at}
              className="text-xs text-muted-foreground/70"
            />
          </div>
          <div className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2 sm:px-4">
            <p className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </p>
          </div>
          {(threadControls || pinControl) && (
            <div className="flex flex-wrap items-center gap-2">
              {threadControls}
              {pinControl}
            </div>
          )}

          {message.reasoning_trace_id && (
            <div className="flex flex-col gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="-ml-2 w-fit text-xs text-muted-foreground"
              >
                {expanded ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
                {expanded ? "Hide reasoning" : "Show reasoning"}
              </Button>
              {expanded && (
                <ReasoningTrace traceId={message.reasoning_trace_id} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
