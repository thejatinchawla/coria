"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import type { Channel, Message, Workspace } from "@/types"
import { ChannelHeader } from "@/components/ChannelHeader"
import { MessageList } from "@/components/MessageList"
import { MessageInput } from "@/components/MessageInput"
import { Sidebar } from "@/components/Sidebar"

export function Chat({
  workspace,
  channel,
  channels,
  agentId,
  initialMessages,
  userEmail,
  userDisplayName,
}: {
  workspace: Workspace
  channel: Channel
  channels: Channel[]
  agentId: string
  initialMessages: Message[]
  userEmail: string
  userDisplayName: string
}) {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [channelList, setChannelList] = useState(channels)
  const [ariaThinking, setAriaThinking] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    setMessages(initialMessages)
  }, [channel.id, initialMessages])

  useEffect(() => {
    setChannelList(channels)
  }, [channels])

  useEffect(() => {
    const supabase = createClient()
    let active = true

    const mergeMessages = (incoming: Message[]) =>
      setMessages((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]))
        for (const m of incoming) {
          if (m.channel_id === channel.id) byId.set(m.id, m)
        }
        return Array.from(byId.values()).sort((a, b) =>
          a.created_at.localeCompare(b.created_at),
        )
      })

    const realtime = supabase
      .channel(`messages-${channel.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channel.id}`,
        },
        (payload) => {
          const next = payload.new as Message
          setMessages((prev) =>
            prev.some((m) => m.id === next.id) ? prev : [...prev, next],
          )
          if (next.sender_type === "agent") {
            setAriaThinking(false)
          }
        },
      )
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED" || !active) return
        const { data } = await supabase
          .from("messages")
          .select("*")
          .eq("channel_id", channel.id)
          .order("created_at", { ascending: true })
        if (active && data) mergeMessages(data as Message[])
      })

    return () => {
      active = false
      supabase.removeChannel(realtime)
    }
  }, [channel.id])

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

  function handleChannelCreated(next: Channel) {
    setChannelList((prev) =>
      prev.some((c) => c.id === next.id) ? prev : [...prev, next],
    )
    router.push(`/?channel=${next.slug}`)
    setSidebarOpen(false)
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar
        workspaceName={workspace.name}
        channels={channelList}
        activeChannelSlug={channel.slug}
        displayName={userDisplayName}
        email={userEmail}
        workspaceId={workspace.id}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onChannelCreated={handleChannelCreated}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <ChannelHeader
          channelName={channel.name}
          workspaceName={workspace.name}
          onMenuOpen={() => setSidebarOpen(true)}
        />
        <MessageList messages={messages} ariaThinking={ariaThinking} />
        <MessageInput
          channelId={channel.id}
          channelSlug={channel.slug}
          agentId={agentId}
          senderName={userDisplayName}
          onAriaThinking={() => setAriaThinking(true)}
        />
      </div>
    </div>
  )
}
