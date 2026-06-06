"use client"

import { nameInitial } from "@/lib/name-initial"
import { cn } from "@/lib/utils"
import type { Member } from "@/types"
import {
  MemberProfileContent,
  ProfileHoverCard,
} from "@/components/ProfileHoverCard"

const SIZE = {
  sm: "size-7 text-xs",
  md: "size-9 text-xs sm:size-10 sm:text-sm",
} as const

export function MemberAvatarImage({
  name,
  avatarUrl,
  size = "md",
  className,
}: {
  name: string
  avatarUrl?: string | null
  size?: keyof typeof SIZE
  className?: string
}) {
  const initial = nameInitial(name)

  if (avatarUrl?.trim()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={cn("shrink-0 rounded-full object-cover", SIZE[size], className)}
      />
    )
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary",
        SIZE[size],
        className,
      )}
      aria-hidden
    >
      {initial}
    </div>
  )
}

export function MemberAvatar({
  member,
  displayName,
  size = "md",
  className,
  interactive = true,
}: {
  member?: Member | null
  displayName: string
  size?: keyof typeof SIZE
  className?: string
  /** When false, render avatar only (e.g. inside another button). */
  interactive?: boolean
}) {
  const name = member?.display_name ?? displayName
  const avatar = (
    <MemberAvatarImage
      name={name}
      avatarUrl={member?.avatar_url}
      size={size}
      className={className}
    />
  )

  if (!member || !interactive) return avatar

  return (
    <ProfileHoverCard content={<MemberProfileContent member={member} />}>
      <button
        type="button"
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`View ${member.display_name}'s profile`}
      >
        {avatar}
      </button>
    </ProfileHoverCard>
  )
}
