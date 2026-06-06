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
import { AgentAiBadge } from "@/components/AgentAiBadge"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import {
  MessageSenderAvatar,
  SenderNameWithProfile,
} from "@/components/MessageSenderAvatar"
import { Button } from "@/components/ui/button"
import { MessageTimestamp } from "@/components/MessageTimestamp"
import { ReasoningTrace } from "@/components/ReasoningTrace"
import { cn } from "@/lib/utils"
import type { Agent, Member, Message as MessageType } from "@/types"

const bubbleMaxWidth =
  "max-w-[min(85%,32rem)] sm:max-w-[70%]"

const bubbleTextClass = "text-left text-sm leading-snug whitespace-pre-wrap break-words"

function bubbleRadius(
  groupedWithPrevious: boolean,
  groupedWithNext: boolean,
  own: boolean,
) {
  if (groupedWithPrevious && groupedWithNext) return "rounded-2xl"
  if (groupedWithPrevious && !groupedWithNext) {
    return own ? "rounded-2xl rounded-br-sm" : "rounded-2xl rounded-bl-sm"
  }
  if (!groupedWithPrevious && groupedWithNext) {
    return own ? "rounded-2xl rounded-tr-sm" : "rounded-2xl rounded-tl-sm"
  }
  return own ? "rounded-2xl rounded-br-sm" : "rounded-2xl rounded-tl-sm"
}

function MessageActionsOverlay({
  children,
  side,
  className,
}: {
  children: ReactNode
  side: "left" | "right"
  className?: string
}) {
  return (
    <div
      className={cn(
        "absolute top-1/2 -translate-y-1/2",
        side === "left" ? "right-full mr-1" : "left-full ml-1",
        className,
      )}
    >
      {children}
    </div>
  )
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
  onPrimary = false,
  className,
}: {
  isPinned: boolean
  pinDisabled?: boolean
  onPinToggle?: (pinned: boolean) => void
  onDelete?: () => void
  onReply?: () => void
  menuAlign?: "start" | "end"
  onPrimary?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const hasActions = onReply || onPinToggle || onDelete

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuStyle(null)
      return
    }

    function updatePosition() {
      const trigger = triggerRef.current
      if (!trigger) return

      const rect = trigger.getBoundingClientRect()
      const gap = 4
      const style: CSSProperties = {
        position: "fixed",
        top: rect.bottom + gap,
        minWidth: "10rem",
        zIndex: 200,
      }

      if (menuAlign === "end") {
        style.left = rect.right
        style.transform = "translateX(-100%)"
      } else {
        style.left = rect.left
      }

      setMenuStyle(style)
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [open, menuAlign])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [open])

  if (!hasActions) return null

  function closeAndRun(action?: () => void) {
    setOpen(false)
    action?.()
  }

  const menu =
    open && menuStyle ? (
      <div
        ref={menuRef}
        role="menu"
        data-message-actions-menu
        style={menuStyle}
        className="rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
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
    ) : null

  return (
    <>
      <div ref={triggerRef} className={cn("relative shrink-0", className)}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Message actions"
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-md transition-opacity focus-visible:opacity-100",
            onPrimary
              ? "text-primary-foreground/80 hover:bg-primary-foreground/15 hover:text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
            "opacity-70 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
            open &&
              (onPrimary
                ? "bg-primary-foreground/15 text-primary-foreground opacity-100"
                : "bg-muted text-foreground opacity-100"),
          )}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>
      {typeof document !== "undefined" && menu
        ? createPortal(menu, document.body)
        : null}
    </>
  )
}

export function Message({
  message,
  agent,
  member,
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
  showTimestamp = true,
  groupedWithPrevious = false,
  groupedWithNext = false,
}: {
  message: MessageType
  agent?: Agent | null
  member?: Member | null
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
  showTimestamp?: boolean
  groupedWithPrevious?: boolean
  groupedWithNext?: boolean
}) {
  const isAgent = message.sender_type === "agent"
  const isOwn = isOwnHumanMessage(message, currentMemberId)
  const [expanded, setExpanded] = useState(false)
  const count = message.reply_count ?? replyCount
  const isPinned = message.is_pinned === true

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

  const hasActions = Boolean(onReply || onPinToggle || onDelete)
  const showMetadataFooter = showTimestamp || isPinned

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
        <div
          className={cn(
            "flex w-full flex-col items-end",
            showMetadataFooter || threadControl ? "gap-1" : "gap-0",
          )}
        >
          <div
            className={cn(
              "relative w-max",
              bubbleMaxWidth,
              compact && "sm:max-w-[85%]",
            )}
          >
            {hasActions && (
              <MessageActionsOverlay side="left">
                <MessageActionsMenu
                  isPinned={isPinned}
                  pinDisabled={pinDisabled}
                  onPinToggle={onPinToggle}
                  onDelete={onDelete}
                  onReply={onReply}
                  menuAlign="start"
                />
              </MessageActionsOverlay>
            )}
            <div
              className={cn(
                "bg-primary px-3 py-2 text-primary-foreground sm:px-4",
                bubbleRadius(groupedWithPrevious, groupedWithNext, true),
              )}
            >
              <p className={bubbleTextClass}>{message.content}</p>
            </div>
          </div>
          {showMetadataFooter && (
            <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5">
              {pinnedBadge}
              {showTimestamp && (
                <MessageTimestamp
                  iso={message.created_at}
                  className="text-xs text-muted-foreground"
                />
              )}
            </div>
          )}
          {threadControl}
        </div>
      </div>
    )
  }

  const avatarSlot = !compact && (
    <div className="size-9 shrink-0 sm:size-10">
      {!groupedWithPrevious && (
        <MessageSenderAvatar
          message={message}
          agent={agent}
          member={member}
        />
      )}
    </div>
  )

  return (
    <div id={`message-${message.id}`} className={wrapperClass}>
      <div className="flex gap-2 sm:gap-3">
        {avatarSlot}
        <div
          className={cn(
            "flex min-w-0 flex-col",
            showMetadataFooter || threadControl ? "gap-1" : "gap-0",
            compact ? "max-w-full" : bubbleMaxWidth,
          )}
        >
          {!groupedWithPrevious && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <SenderNameWithProfile
                message={message}
                agent={agent}
                member={member}
                className="text-xs text-muted-foreground hover:underline"
              />
              {isAgent && <AgentAiBadge />}
              {pinnedBadge}
              {showTimestamp && (
                <MessageTimestamp
                  iso={message.created_at}
                  className="text-xs text-muted-foreground/70"
                />
              )}
            </div>
          )}
          <div className="relative w-max max-w-full">
            {hasActions && !(isAgent && message.reasoning_trace_id) && (
              <MessageActionsOverlay side="right">
                <MessageActionsMenu
                  isPinned={isPinned}
                  pinDisabled={pinDisabled}
                  onPinToggle={onPinToggle}
                  onDelete={onDelete}
                  onReply={onReply}
                  menuAlign="start"
                />
              </MessageActionsOverlay>
            )}
            <div
              className={cn(
                "bg-muted px-3 py-2 sm:px-4",
                isAgent && "ring-1 ring-violet-500/15",
                bubbleRadius(groupedWithPrevious, groupedWithNext, false),
              )}
            >
              {isAgent && groupedWithPrevious && (
                <div className="mb-1">
                  <AgentAiBadge compact />
                </div>
              )}
              <p className={bubbleTextClass}>{message.content}</p>
            </div>
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
          ) : null}
        </div>
      </div>
    </div>
  )
}
