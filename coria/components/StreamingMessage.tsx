"use client"

import { AgentAvatar } from "@/components/AgentAvatar"

export function StreamingMessage({
  senderName,
  content,
  color,
  avatarUrl,
}: {
  senderName: string
  content: string
  color?: string
  avatarUrl?: string | null
}) {
  return (
    <div className="flex gap-2 sm:gap-3">
      <AgentAvatar name={senderName} color={color} avatarUrl={avatarUrl} />
      <div className={cn("flex flex-col gap-1", incomingBubbleMaxWidth)}>
        <span className="text-xs text-muted-foreground">{senderName}</span>
        <div className="w-fit rounded-2xl rounded-tl-sm bg-muted px-3 py-2 sm:px-4">
          <p className="text-sm whitespace-pre-wrap break-words">
            {content}
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground/60 align-middle" />
          </p>
        </div>
      </div>
    </div>
  )
}
