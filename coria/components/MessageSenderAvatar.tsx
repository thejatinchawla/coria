"use client"

import { AgentAvatar } from "@/components/AgentAvatar"
import { MemberAvatar } from "@/components/MemberAvatar"
import {
  AgentProfileContent,
  MemberProfileContent,
  ProfileHoverCard,
} from "@/components/ProfileHoverCard"
import type { Agent, Member, Message as MessageType } from "@/types"

export function MessageSenderAvatar({
  message,
  agent,
  member,
  size = "md",
}: {
  message: MessageType
  agent?: Agent | null
  member?: Member | null
  size?: "sm" | "md"
}) {
  if (message.sender_type === "agent") {
    const resolvedAgent = agent ?? null
    const avatar = (
      <AgentAvatar
        name={resolvedAgent?.name ?? message.sender_name}
        mentionSlug={resolvedAgent?.mention_slug}
        color={resolvedAgent?.color}
        avatarUrl={resolvedAgent?.avatar_url}
        size={size}
      />
    )

    if (!resolvedAgent) return avatar

    return (
      <ProfileHoverCard
        content={
          <AgentProfileContent
            agent={resolvedAgent}
            fallbackName={message.sender_name}
          />
        }
      >
        <button
          type="button"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`View ${resolvedAgent.name} profile`}
        >
          {avatar}
        </button>
      </ProfileHoverCard>
    )
  }

  return (
    <MemberAvatar
      member={member}
      displayName={message.sender_name}
      size={size}
    />
  )
}

export function SenderNameWithProfile({
  message,
  agent,
  member,
  className,
}: {
  message: MessageType
  agent?: Agent | null
  member?: Member | null
  className?: string
}) {
  const label = message.sender_name

  if (message.sender_type === "agent" && agent) {
    return (
      <ProfileHoverCard
        content={
          <AgentProfileContent agent={agent} fallbackName={message.sender_name} />
        }
      >
        <button
          type="button"
          className={className}
          aria-label={`View ${agent.name} profile`}
        >
          {label}
        </button>
      </ProfileHoverCard>
    )
  }

  if (message.sender_type === "human" && member) {
    return (
      <ProfileHoverCard content={<MemberProfileContent member={member} />}>
        <button
          type="button"
          className={className}
          aria-label={`View ${member.display_name}'s profile`}
        >
          {label}
        </button>
      </ProfileHoverCard>
    )
  }

  return <span className={className}>{label}</span>
}
