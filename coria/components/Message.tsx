"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MessageTimestamp } from "@/components/MessageTimestamp"
import { ReasoningTrace } from "@/components/ReasoningTrace"
import type { Message as MessageType } from "@/types"

export function Message({ message }: { message: MessageType }) {
  const isAgent = message.sender_type === "agent"
  const [expanded, setExpanded] = useState(false)

  if (!isAgent) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[70%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-primary-foreground">
          <p className="text-sm whitespace-pre-wrap break-words">
            {message.content}
          </p>
        </div>
        <MessageTimestamp
          iso={message.created_at}
          className="text-xs text-muted-foreground"
        />
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-medium">
        {message.sender_name?.charAt(0).toUpperCase() ?? "?"}
      </div>
      <div className="flex max-w-[70%] flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-muted-foreground">
            {message.sender_name}
          </span>
          <MessageTimestamp
            iso={message.created_at}
            className="text-xs text-muted-foreground/70"
          />
        </div>
        <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-2">
          <p className="text-sm whitespace-pre-wrap break-words">
            {message.content}
          </p>
        </div>

        {/* Only agent messages with a trace get the disclosure. */}
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
  )
}
