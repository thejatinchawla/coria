"use client"

import { AgentAvatar } from "@/components/AgentAvatar"
import { AgentAiBadge } from "@/components/AgentAiBadge"
import { LinkifiedText } from "@/components/LinkifiedText"

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
      <div className="flex w-fit max-w-[min(85%,32rem)] flex-col gap-1 sm:max-w-[70%]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs text-muted-foreground">{senderName}</span>
          <AgentAiBadge />
        </div>
        <div className="w-fit rounded-2xl rounded-tl-sm bg-muted px-3 py-2 ring-1 ring-violet-500/15 sm:px-4">
          <p className="text-sm whitespace-pre-wrap break-words">
            <LinkifiedText text={content} />
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground/60 align-middle" />
          </p>
        </div>
      </div>
    </div>
  )
}
