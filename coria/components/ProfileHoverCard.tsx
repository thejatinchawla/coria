"use client"

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { AgentAiBadge } from "@/components/AgentAiBadge"
import { AgentAvatar } from "@/components/AgentAvatar"
import { MemberAvatarImage } from "@/components/MemberAvatar"
import { useCoarsePointer } from "@/lib/use-mobile"
import type { Agent, Member, MemberRole } from "@/types"

function formatRole(role: MemberRole) {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

export function MemberProfileContent({ member }: { member: Member }) {
  return (
    <div className="flex gap-3">
      <MemberAvatarImage
        name={member.display_name}
        avatarUrl={member.avatar_url}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{member.display_name}</p>
        <p className="text-xs text-muted-foreground">{formatRole(member.role)}</p>
        {member.bio?.trim() ? (
          <p className="mt-2 text-sm leading-snug text-muted-foreground">
            {member.bio.trim()}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function AgentProfileContent({
  agent,
  fallbackName,
}: {
  agent: Agent
  fallbackName: string
}) {
  const name = agent.name || fallbackName
  return (
    <div className="flex gap-3">
      <AgentAvatar
        name={name}
        mentionSlug={agent.mention_slug}
        color={agent.color}
        avatarUrl={agent.avatar_url}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <AgentAiBadge />
        </div>
        <p className="text-xs text-muted-foreground">@{agent.mention_slug}</p>
        <p className="mt-1 text-xs capitalize text-muted-foreground">
          {agent.status === "paused" ? "Paused" : "Active"}
        </p>
      </div>
    </div>
  )
}

export function ProfileHoverCard({
  children,
  content,
  disabled = false,
}: {
  children: ReactNode
  content: ReactNode
  disabled?: boolean
}) {
  const coarsePointer = useCoarsePointer()
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<CSSProperties | null>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearShowTimer = () => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
  }

  const show = () => {
    if (disabled) return
    clearShowTimer()
    showTimerRef.current = setTimeout(() => setOpen(true), 200)
  }

  const hide = () => {
    clearShowTimer()
    setOpen(false)
  }

  const toggle = () => {
    if (disabled) return
    clearShowTimer()
    setOpen((value) => !value)
  }

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setStyle(null)
      return
    }

    const rect = triggerRef.current.getBoundingClientRect()
    const cardWidth = Math.min(256, window.innerWidth - 16)
    const left = Math.min(
      Math.max(8, rect.left),
      window.innerWidth - cardWidth - 8,
    )
    const top = Math.min(rect.bottom + 8, window.innerHeight - 8)

    setStyle({
      position: "fixed",
      top,
      left,
      width: cardWidth,
      zIndex: 60,
    })
  }, [open])

  useEffect(() => {
    if (!open || !coarsePointer) return
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (cardRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [open, coarsePointer])

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex"
        onMouseEnter={coarsePointer ? undefined : show}
        onMouseLeave={coarsePointer ? undefined : hide}
        onFocus={coarsePointer ? undefined : show}
        onBlur={coarsePointer ? undefined : hide}
        onClick={coarsePointer ? toggle : undefined}
      >
        {children}
      </span>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={cardRef}
            style={style ?? undefined}
            className="rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
            role="tooltip"
            onMouseEnter={coarsePointer ? undefined : show}
            onMouseLeave={coarsePointer ? undefined : hide}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  )
}
