"use client"

import { resolveAgentAvatarUrl } from "@/lib/agents"
import { cn } from "@/lib/utils"

const SIZE = {
  sm: "size-7 text-xs",
  md: "size-8 text-xs sm:size-10 sm:text-sm",
} as const

export function AgentAvatar({
  name,
  mentionSlug,
  color = "#6366f1",
  avatarUrl,
  size = "md",
  className,
}: {
  name: string
  mentionSlug?: string | null
  color?: string
  avatarUrl?: string | null
  size?: keyof typeof SIZE
  className?: string
}) {
  const initial = (name?.charAt(0) || "?").toUpperCase()
  const resolvedUrl = resolveAgentAvatarUrl({ mentionSlug, avatarUrl, name })

  if (resolvedUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolvedUrl}
        alt=""
        className={cn("shrink-0 rounded-full object-cover", SIZE[size], className)}
      />
    )
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-medium text-white",
        SIZE[size],
        className,
      )}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {initial}
    </div>
  )
}
