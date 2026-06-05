"use client"

import { useEffect, useState } from "react"
import { formatRelativeTime } from "@/lib/message-time"
import { cn } from "@/lib/utils"

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
