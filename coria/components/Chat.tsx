"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import type { Channel, Message, Workspace } from "@/types"
import { ChannelHeader } from "@/components/ChannelHeader"
import { MessageList } from "@/components/MessageList"
import { MessageInput } from "@/components/MessageInput"
import { Sidebar } from "@/components/Sidebar"

type StreamState = {
  content: string
  status?: string
}

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
  const [streamState, setStreamState] = useState<StreamState | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    setMessages(initialMessages)
  }, [channel.id, initialMessages])

  useEffect(() => {
    setChannelList(channels)
  }, [channels])

  useEffect(() => {
    setStreamState(null)
  }, [channel.id])

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
            setStreamState(null)
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
    if (!streamState) return
    const timeout = setTimeout(() => setStreamState(null), 120000)
    return () => clearTimeout(timeout)
  }, [streamState])

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
        <MessageList
          messages={messages}
          streamState={streamState}
          ariaName="Aria"
        />
        <MessageInput
          channelId={channel.id}
          channelSlug={channel.slug}
          agentId={agentId}
          senderName={userDisplayName}
          onStreamStart={() =>
            setStreamState({ content: "", status: "Aria is thinking…" })
          }
          onStreamStatus={(status) =>
            setStreamState((s) =>
              s ? { ...s, status } : { content: "", status },
            )
          }
          onStreamToken={(token) =>
            setStreamState((s) =>
              s
                ? { content: s.content + token, status: undefined }
                : { content: token },
            )
          }
          onStreamEnd={() => setStreamState(null)}
          onStreamError={() => setStreamState(null)}
        />
      </div>
    </div>
  )
}
