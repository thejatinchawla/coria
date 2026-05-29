"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

function formatRelativeTime(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""

  const diffSec = Math.round((nowMs - then) / 1000)
  if (diffSec < 60) return "just now"

  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`

  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

/** Stable UTC clock time — identical on server and client for hydration. */
function formatStableTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toISOString().slice(11, 16)
}

export function MessageTimestamp({
  iso,
  className,
}: {
  iso: string
  className?: string
}) {
  const [text, setText] = useState(() => formatStableTime(iso))

  useEffect(() => {
    const update = () => setText(formatRelativeTime(iso, Date.now()))
    update()
    const interval = setInterval(update, 30_000)
    return () => clearInterval(interval)
  }, [iso])

  return <span className={cn(className)}>{text}</span>
}
