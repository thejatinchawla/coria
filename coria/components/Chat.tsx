"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase"
import type { Message } from "@/types"
import { ChannelHeader } from "@/components/ChannelHeader"
import { MessageList } from "@/components/MessageList"
import { MessageInput } from "@/components/MessageInput"
import { Sidebar } from "@/components/Sidebar"

export function Chat({
  initialMessages,
  userEmail,
  userDisplayName,
}: {
  initialMessages: Message[]
  userEmail: string
  userDisplayName: string
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [ariaThinking, setAriaThinking] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let active = true

    // Merge incoming rows by id (dedupe) and keep chronological order.
    const mergeMessages = (incoming: Message[]) =>
      setMessages((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]))
        for (const m of incoming) byId.set(m.id, m)
        return Array.from(byId.values()).sort((a, b) =>
          a.created_at.localeCompare(b.created_at),
        )
      })

    const channel = supabase
      .channel("messages-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const next = payload.new as Message
          // Dedupe: realtime can redeliver the same row on reconnect.
          setMessages((prev) =>
            prev.some((m) => m.id === next.id) ? prev : [...prev, next],
          )
          // Aria's reply landed — stop showing the thinking indicator.
          if (next.sender_type === "agent" && next.sender_name === "Aria") {
            setAriaThinking(false)
          }
        },
      )
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED" || !active) return
        // Subscribe FIRST, then fetch initial messages, then reconcile — so a
        // row inserted between the SSR snapshot and the subscription isn't
        // lost. mergeMessages dedupes any overlap with realtime events. (Also
        // re-runs on reconnect, recovering anything missed while offline.)
        const { data } = await supabase
          .from("messages")
          .select("*")
          .order("created_at", { ascending: true })
        if (active && data) mergeMessages(data as Message[])
      })

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [])

  // Safety net: if Aria never replies (e.g. backend down), hide the
  // indicator after 30s so it doesn't spin forever. A delivered Aria
  // message hides it sooner via the realtime handler above.
  useEffect(() => {
    if (!ariaThinking) return
    const timeout = setTimeout(() => setAriaThinking(false), 30000)
    return () => clearTimeout(timeout)
  }, [ariaThinking])

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar displayName={userDisplayName} email={userEmail} />
      <div className="flex min-w-0 flex-1 flex-col">
        <ChannelHeader />
        <MessageList messages={messages} ariaThinking={ariaThinking} />
        <MessageInput
          senderName={userDisplayName}
          onAriaThinking={() => setAriaThinking(true)}
        />
      </div>
    </div>
  )
}
