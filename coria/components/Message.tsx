"use client"

import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  MoreHorizontal,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { AgentAvatar } from "@/components/AgentAvatar"
import { Button } from "@/components/ui/button"
import { MessageTimestamp } from "@/components/MessageTimestamp"
import { ReasoningTrace } from "@/components/ReasoningTrace"
import { cn } from "@/lib/utils"
import type { Agent, Message as MessageType } from "@/types"

const incomingBubbleMaxWidth =
  "w-fit max-w-[min(85%,32rem)] sm:max-w-[70%]"

function humanInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
}

function isOwnHumanMessage(
  message: MessageType,
  currentMemberId: string | null | undefined,
) {
  return (
    message.sender_type === "human" &&
    currentMemberId != null &&
    message.sender_id === currentMemberId
  )
}

function MessageActionsMenu({
  isPinned,
  pinDisabled,
  onPinToggle,
  onDelete,
  onReply,
  menuAlign = "start",
}: {
  isPinned: boolean
  pinDisabled?: boolean
  onPinToggle?: (pinned: boolean) => void
  onDelete?: () => void
  onReply?: () => void
  menuAlign?: "start" | "end"
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const hasActions = onReply || onPinToggle || onDelete

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [open])

  if (!hasActions) return null

  function closeAndRun(action?: () => void) {
    setOpen(false)
    action?.()
  }

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Message actions"
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground",
          "opacity-50 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
          open && "opacity-100 bg-muted text-foreground",
        )}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute top-full z-50 mt-1 min-w-[10rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
            menuAlign === "end" ? "right-0" : "left-0",
          )}
        >
          {onReply && (
            <button
              type="button"
              role="menuitem"
              onClick={() => closeAndRun(onReply)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <MessageSquare className="size-4 shrink-0" />
              Reply
            </button>
          )}
          {onPinToggle && (
            <button
              type="button"
              role="menuitem"
              disabled={pinDisabled && !isPinned}
              onClick={() => closeAndRun(() => onPinToggle(!isPinned))}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                pinDisabled && !isPinned && "cursor-not-allowed opacity-50",
              )}
            >
              {isPinned ? (
                <>
                  <PinOff className="size-4 shrink-0" />
                  Unpin
                </>
              ) : (
                <>
                  <Pin className="size-4 shrink-0" />
                  Pin
                </>
              )}
            </button>
          )}
          {onDelete && (
            <>
              {(onReply || onPinToggle) && <div className="my-1 border-t" />}
              <button
                type="button"
                role="menuitem"
                onClick={() => closeAndRun(onDelete)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-4 shrink-0" />
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

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
  onDelete,
  highlight = false,
  currentMemberId = null,
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
  onDelete?: () => void
  highlight?: boolean
  currentMemberId?: string | null
}) {
  const isAgent = message.sender_type === "agent"
  const isOwn = isOwnHumanMessage(message, currentMemberId)
  const [expanded, setExpanded] = useState(false)
  const count = message.reply_count ?? replyCount
  const isPinned = message.is_pinned === true

  const actionsMenu = (
    <MessageActionsMenu
      isPinned={isPinned}
      pinDisabled={pinDisabled}
      onPinToggle={onPinToggle}
      onDelete={onDelete}
      onReply={onReply}
    />
  )

  const threadControl =
    count > 0 && onToggleThread ? (
      <button
        type="button"
        onClick={onToggleThread}
        className="text-xs font-medium text-primary hover:underline"
      >
        {count} {count === 1 ? "reply" : "replies"}
        {threadExpanded ? " · hide" : ""}
      </button>
    ) : null

  const pinnedBadge = isPinned ? (
    <span
      className="inline-flex items-center gap-1 text-xs text-amber-800 dark:text-amber-300"
      title="Pinned message"
    >
      <Pin className="size-3" />
    </span>
  ) : null

  const wrapperClass = cn(
    "group scroll-mt-4",
    highlight &&
      "rounded-md ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
  )

  if (isOwn) {
    return (
      <div id={`message-${message.id}`} className={wrapperClass}>
        <div className="flex flex-col items-end gap-1">
          <div
            className={cn(
              "w-fit max-w-[min(85%,32rem)] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground sm:max-w-[70%]",
              compact ? "sm:max-w-[85%]" : "sm:px-4",
            )}
          >
            <p className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5">
            {actionsMenu}
            {pinnedBadge}
            <MessageTimestamp
              iso={message.created_at}
              className="text-xs text-muted-foreground"
            />
          </div>
          {threadControl}
        </div>
      </div>
    )
  }

  return (
    <div id={`message-${message.id}`} className={wrapperClass}>
      <div className="flex gap-2 sm:gap-3">
        {!compact &&
          (isAgent ? (
            <AgentAvatar
              name={agent?.name ?? message.sender_name}
              color={agent?.color}
              avatarUrl={agent?.avatar_url}
            />
          ) : (
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary sm:size-10"
              aria-hidden
            >
              {humanInitials(message.sender_name)}
            </div>
          ))}
        <div
          className={cn(
            "flex flex-col gap-1",
            compact ? "w-fit max-w-full" : incomingBubbleMaxWidth,
          )}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-xs text-muted-foreground">
              {message.sender_name}
            </span>
            {pinnedBadge}
            <MessageTimestamp
              iso={message.created_at}
              className="text-xs text-muted-foreground/70"
            />
          </div>
          <div className="w-fit rounded-2xl rounded-tl-sm bg-muted px-3 py-2 sm:px-4">
            <p className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </p>
          </div>
          {threadControl}

          {isAgent && message.reasoning_trace_id ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1">
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
                <MessageActionsMenu
                  isPinned={isPinned}
                  pinDisabled={pinDisabled}
                  onPinToggle={onPinToggle}
                  onDelete={onDelete}
                  onReply={onReply}
                  menuAlign="end"
                />
              </div>
              {expanded && (
                <ReasoningTrace traceId={message.reasoning_trace_id} />
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">{actionsMenu}</div>
          )}
        </div>
      </div>
    </div>
  )
}
