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
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let active = true

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
          setMessages((prev) =>
            prev.some((m) => m.id === next.id) ? prev : [...prev, next],
          )
          if (next.sender_type === "agent" && next.sender_name === "Aria") {
            setAriaThinking(false)
          }
        },
      )
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED" || !active) return
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

  useEffect(() => {
    if (!ariaThinking) return
    const timeout = setTimeout(() => setAriaThinking(false), 30000)
    return () => clearTimeout(timeout)
  }, [ariaThinking])

  useEffect(() => {
    if (!sidebarOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [sidebarOpen])

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar
        displayName={userDisplayName}
        email={userEmail}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <ChannelHeader onMenuOpen={() => setSidebarOpen(true)} />
        <MessageList messages={messages} ariaThinking={ariaThinking} />
        <MessageInput
          senderName={userDisplayName}
          onAriaThinking={() => setAriaThinking(true)}
        />
      </div>
    </div>
  )
}
