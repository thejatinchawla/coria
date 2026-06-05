"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { fetchThreadReplies, fetchPinnedMessages, searchChannelMessages, setMessagePinned, canDeleteMessage, deleteMessage, MAX_PINNED_MESSAGES } from "@/lib/messages"
import { streamActionBlockDecision } from "@/lib/stream-invoke"
import { chatUrl } from "@/lib/settings-url"
import type { SettingsId } from "@/lib/settings-links"
import type {
  ActionBlock,
  Agent,
  Channel,
  MemberRole,
  Message,
  MessageSearchHit,
  Workspace,
  WorkspaceSettings,
} from "@/types"
import { ActionBlockList } from "@/components/ActionBlock"
import { ChannelHeader } from "@/components/ChannelHeader"
import { MessageList } from "@/components/MessageList"
import { PinsView } from "@/components/PinsView"
import type { ChannelTab } from "@/components/ChannelHeader"
import { MessageInput } from "@/components/MessageInput"
import { SettingsModal } from "@/components/SettingsModal"
import { Sidebar } from "@/components/Sidebar"
import { ThreadView } from "@/components/ThreadView"
import { useIsMobile } from "@/components/ThreadInline"
import { useToast } from "@/components/Toast"
import { useConfirm } from "@/components/ConfirmDialog"

type StreamState = {
  content: string
  status?: string
  agent?: Pick<Agent, "name" | "color" | "avatar_url"> | null
  threadId?: string | null
}

export function Chat({
  workspace,
  workspaces,
  memberRole,
  channel,
  channels,
  agentId,
  agents,
  workspaceSettings,
  memberId,
  workspaceId,
  initialMessages,
  userEmail,
  userDisplayName,
  settingsSection,
}: {
  workspace: Workspace
  workspaces: Workspace[]
  memberRole: MemberRole
  channel: Channel
  channels: Channel[]
  agentId: string
  agents: Agent[]
  workspaceSettings: WorkspaceSettings | null
  memberId: string | null
  workspaceId: string
  initialMessages: Message[]
  userEmail: string
  userDisplayName: string
  settingsSection: SettingsId | null
}) {
  const router = useRouter()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const isMobile = useIsMobile()
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [channelList, setChannelList] = useState(channels)
  const [streamState, setStreamState] = useState<StreamState | null>(null)
  const [pendingBlocks, setPendingBlocks] = useState<ActionBlock[]>([])
  const [decidingBlockId, setDecidingBlockId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null)
  const [mobileThreadRoot, setMobileThreadRoot] = useState<Message | null>(null)
  const [threadReplies, setThreadReplies] = useState<Record<string, Message[]>>(
    {},
  )
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<MessageSearchHit[]>([])
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(
    null,
  )
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([])
  const [channelTab, setChannelTab] = useState<ChannelTab>("messages")

  const agentsById = useMemo(
    () => Object.fromEntries(agents.map((a) => [a.id, a])),
    [agents],
  )
  const agentsGloballyPaused = workspaceSettings?.agents_globally_paused ?? false

  const topLevelMessages = useMemo(
    () => messages.filter((m) => !m.thread_id),
    [messages],
  )

  const loadPendingBlocks = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("action_blocks")
      .select("*")
      .eq("channel_id", channel.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
    setPendingBlocks((data as ActionBlock[] | null) ?? [])
  }, [channel.id])

  const loadThread = useCallback(async (threadId: string) => {
    const supabase = createClient()
    const replies = await fetchThreadReplies(supabase, threadId)
    setThreadReplies((prev) => ({ ...prev, [threadId]: replies }))
    return replies
  }, [])

  const loadPinnedMessages = useCallback(async () => {
    const supabase = createClient()
    const pins = await fetchPinnedMessages(supabase, channel.id)
    setPinnedMessages(pins)
  }, [channel.id])

  const handleMessageSent = useCallback((message: Message) => {
    setMessages((prev) => {
      let next = prev
      if (message.thread_id) {
        next = prev.map((m) =>
          m.id === message.thread_id
            ? { ...m, reply_count: (m.reply_count ?? 0) + 1 }
            : m,
        )
      }
      if (next.some((m) => m.id === message.id)) return next
      if (!message.thread_id) {
        return [...next, message].sort((a, b) =>
          a.created_at.localeCompare(b.created_at),
        )
      }
      return next
    })

    if (message.thread_id) {
      setThreadReplies((prev) => {
        const list = prev[message.thread_id!] ?? []
        if (list.some((m) => m.id === message.id)) return prev
        return {
          ...prev,
          [message.thread_id!]: [...list, message],
        }
      })
    }
  }, [])

  const applyMessageRemoved = useCallback((message: Message) => {
    if (message.thread_id) {
      setThreadReplies((prev) => {
        const list = prev[message.thread_id!]
        if (!list) return prev
        return {
          ...prev,
          [message.thread_id!]: list.filter((m) => m.id !== message.id),
        }
      })
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.thread_id
            ? { ...m, reply_count: Math.max((m.reply_count ?? 0) - 1, 0) }
            : m,
        ),
      )
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== message.id))
      if ((message.reply_count ?? 0) > 0) {
        setThreadReplies((prev) => {
          const next = { ...prev }
          delete next[message.id]
          return next
        })
      }
      setExpandedThreadId((current) =>
        current === message.id ? null : current,
      )
      setMobileThreadRoot((current) =>
        current?.id === message.id ? null : current,
      )
    }
    setPinnedMessages((prev) => prev.filter((m) => m.id !== message.id))
  }, [])

  const messageCanDelete = useCallback(
    (message: Message) => canDeleteMessage(message, memberId, memberRole),
    [memberId, memberRole],
  )

  const scrollToMessage = useCallback((messageId: string) => {
    requestAnimationFrame(() => {
      document.getElementById(`message-${messageId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
    })
  }, [])

  const navigateToMessage = useCallback(
    async (message: Message) => {
      setHighlightMessageId(message.id)

      if (message.thread_id) {
        let root =
          messages.find((m) => m.id === message.thread_id && !m.thread_id) ??
          null
        if (!root) {
          const supabase = createClient()
          const { data } = await supabase
            .from("messages")
            .select("*")
            .eq("id", message.thread_id)
            .maybeSingle()
          root = (data as Message | null) ?? null
        }

        if (root) {
          if (isMobile) {
            setMobileThreadRoot(root)
          } else {
            setExpandedThreadId(message.thread_id)
          }
          await loadThread(message.thread_id)
        }
      }

      setTimeout(() => scrollToMessage(message.id), 200)
      setTimeout(() => setHighlightMessageId(null), 3000)
    },
    [isMobile, loadThread, messages, scrollToMessage],
  )

  const navigateToSearchHit = useCallback(
    async (hit: MessageSearchHit) => {
      await navigateToMessage({
        id: hit.id,
        channel_id: hit.channel_id,
        sender_id: null,
        sender_name: hit.sender_name,
        sender_type: hit.sender_type as Message["sender_type"],
        content: hit.content,
        reasoning_trace_id: null,
        action_block_id: null,
        thread_id: hit.thread_id,
        parent_message_id: null,
        reply_count: 0,
        created_at: hit.created_at,
      })
    },
    [navigateToMessage],
  )

  useEffect(() => {
    setMessages(initialMessages)
    setExpandedThreadId(null)
    setMobileThreadRoot(null)
    setThreadReplies({})
    setSearchQuery("")
    setSearchResults([])
    setHighlightMessageId(null)
    setPinnedMessages([])
    setChannelTab("messages")
  }, [channel.id, initialMessages])

  useEffect(() => {
    setChannelList(channels)
  }, [channels])

  useEffect(() => {
    setStreamState(null)
    void loadPendingBlocks()
    void loadPinnedMessages()
  }, [channel.id, loadPendingBlocks, loadPinnedMessages])

  useEffect(() => {
    if (!highlightMessageId) return
    const timer = setTimeout(() => scrollToMessage(highlightMessageId), 100)
    return () => clearTimeout(timer)
  }, [highlightMessageId, expandedThreadId, threadReplies, mobileThreadRoot, scrollToMessage])

  useEffect(() => {
    if (expandedThreadId) void loadThread(expandedThreadId)
  }, [expandedThreadId, loadThread])

  useEffect(() => {
    if (mobileThreadRoot) void loadThread(mobileThreadRoot.id)
  }, [mobileThreadRoot, loadThread])

  useEffect(() => {
    const supabase = createClient()
    let active = true
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null

    const mergeTopLevel = (incoming: Message[]) =>
      setMessages((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]))
        for (const m of incoming) {
          if (m.channel_id === channel.id) byId.set(m.id, m)
        }
        return Array.from(byId.values()).sort((a, b) =>
          a.created_at.localeCompare(b.created_at),
        )
      })

    const handleInsert = (payload: { new: Record<string, unknown> }) => {
      const next = payload.new as Message

      if (next.thread_id) {
        setThreadReplies((prev) => {
          const list = prev[next.thread_id!] ?? []
          if (list.some((m) => m.id === next.id)) return prev
          return {
            ...prev,
            [next.thread_id!]: [...list, next],
          }
        })
        setMessages((prev) =>
          prev.map((m) =>
            m.id === next.thread_id
              ? { ...m, reply_count: (m.reply_count ?? 0) + 1 }
              : m,
          ),
        )
      } else {
        setMessages((prev) => {
          if (prev.some((m) => m.id === next.id)) return prev
          return [...prev, next].sort((a, b) =>
            a.created_at.localeCompare(b.created_at),
          )
        })
      }

      if (next.sender_type === "agent") {
        setStreamState(null)
      }
    }

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token)
      }
    })

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!active) return

      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token)
      }

      realtimeChannel = supabase
        .channel(`messages-${channel.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `channel_id=eq.${channel.id}`,
          },
          handleInsert,
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "messages",
            filter: `channel_id=eq.${channel.id}`,
          },
          (payload) => {
            const next = payload.new as Message
            if (next.thread_id) {
              setThreadReplies((prev) => {
                const list = prev[next.thread_id!]
                if (!list) return prev
                return {
                  ...prev,
                  [next.thread_id!]: list.map((m) =>
                    m.id === next.id ? { ...m, ...next } : m,
                  ),
                }
              })
            } else {
              setMessages((prev) =>
                prev.map((m) => (m.id === next.id ? { ...m, ...next } : m)),
              )
            }
            if (active) void loadPinnedMessages()
          },
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "messages",
            filter: `channel_id=eq.${channel.id}`,
          },
          (payload) => {
            const removed = payload.old as Message
            if (!removed?.id) return
            applyMessageRemoved(removed)
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "action_blocks",
            filter: `channel_id=eq.${channel.id}`,
          },
          () => {
            if (active) void loadPendingBlocks()
          },
        )
        .subscribe(async (status, err) => {
          if (status === "CHANNEL_ERROR") {
            console.error("[realtime] messages channel error:", err)
          }
          if (status !== "SUBSCRIBED" || !active) return
          const { data } = await supabase
            .from("messages")
            .select("*")
            .eq("channel_id", channel.id)
            .is("thread_id", null)
            .order("created_at", { ascending: true })
          if (active && data) mergeTopLevel(data as Message[])
        })
    })()

    return () => {
      active = false
      authSubscription.unsubscribe()
      if (realtimeChannel) supabase.removeChannel(realtimeChannel)
    }
  }, [channel.id, loadPendingBlocks, loadPinnedMessages, applyMessageRemoved])

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

  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(() => {
      void (async () => {
        const supabase = createClient()
        const hits = await searchChannelMessages(supabase, channel.id, q)
        setSearchResults(hits)
      })()
    }, 250)
    return () => clearTimeout(timer)
  }, [searchQuery, channel.id])

  function handleChannelCreated(next: Channel) {
    setChannelList((prev) =>
      prev.some((c) => c.id === next.id) ? prev : [...prev, next],
    )
    router.push(`/?channel=${next.slug}`)
    setSidebarOpen(false)
  }

  function handleChannelDeleted(channelId: string, _fallback: Channel) {
    setChannelList((prev) => prev.filter((c) => c.id !== channelId))
    setSidebarOpen(false)
  }

  function handleActionBlock(block: ActionBlock) {
    setPendingBlocks((prev) => {
      if (prev.some((b) => b.id === block.id)) return prev
      return [...prev, block]
    })
    setStreamState(null)
  }

  function openThread(message: Message) {
    if (isMobile) {
      setMobileThreadRoot(message)
    } else {
      setExpandedThreadId(message.id)
      void loadThread(message.id)
    }
  }

  function toggleThread(message: Message) {
    if (expandedThreadId === message.id) {
      setExpandedThreadId(null)
    } else {
      setExpandedThreadId(message.id)
      void loadThread(message.id)
    }
  }

  async function handlePinToggle(message: Message, pinned: boolean) {
    const supabase = createClient()
    try {
      const updated = await setMessagePinned(supabase, message.id, pinned)
      const applyUpdate = (m: Message) =>
        m.id === updated.id ? { ...m, is_pinned: updated.is_pinned } : m

      setMessages((prev) => prev.map(applyUpdate))
      if (updated.thread_id) {
        setThreadReplies((prev) => {
          const list = prev[updated.thread_id!]
          if (!list) return prev
          return {
            ...prev,
            [updated.thread_id!]: list.map(applyUpdate),
          }
        })
      }
      if (mobileThreadRoot?.id === updated.id) {
        setMobileThreadRoot((root) =>
          root ? { ...root, is_pinned: updated.is_pinned } : root,
        )
      }
      void loadPinnedMessages()
      toast(
        pinned ? "Message pinned" : "Message unpinned",
        pinned ? "success" : "info",
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not update pin"
      if (msg.includes("pin_limit_exceeded")) {
        toast(
          `You can pin up to ${MAX_PINNED_MESSAGES} messages per channel.`,
          "error",
        )
      } else {
        toast(msg, "error")
      }
    }
  }

  async function handleDeleteMessage(message: Message) {
    const confirmed = await confirm({
      title: "Delete message?",
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    })
    if (!confirmed) return

    const supabase = createClient()
    try {
      await deleteMessage(supabase, message.id)
      applyMessageRemoved(message)
      toast("Message deleted", "success")
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Could not delete message",
        "error",
      )
    }
  }

  const pinLimitReached = pinnedMessages.length >= MAX_PINNED_MESSAGES

  function makeStreamHandlers(threadId?: string | null) {
    return {
      onStreamStart: (agent: Pick<Agent, "name" | "color" | "avatar_url">) =>
        setStreamState({
          content: "",
          status: `${agent.name} is thinking…`,
          agent,
          threadId: threadId ?? null,
        }),
      onStreamStatus: (status: string) =>
        setStreamState((s) =>
          s ? { ...s, status, threadId: threadId ?? s.threadId } : { content: "", status, threadId },
        ),
      onStreamToken: (token: string) =>
        setStreamState((s) =>
          s
            ? { ...s, content: s.content + token, status: undefined }
            : { content: token, threadId },
        ),
      onStreamEnd: () => setStreamState(null),
      onStreamError: () => setStreamState(null),
    }
  }

  const threadProps = {
    channelId: channel.id,
    channelSlug: channel.slug,
    workspaceId,
    defaultAgentId: agentId,
    agents,
    agentsGloballyPaused,
    memberId,
    senderName: userDisplayName,
    onActionBlock: handleActionBlock,
    onMessageSent: handleMessageSent,
    onPinToggle: handlePinToggle,
    onDelete: handleDeleteMessage,
    canDelete: messageCanDelete,
    pinLimitReached,
    onCloseThread: () => setExpandedThreadId(null),
    ...makeStreamHandlers(expandedThreadId),
  }

  async function handleDecide(
    blockId: string,
    decision: "approved" | "declined",
  ) {
    if (!memberId) {
      toast("Could not verify workspace membership.")
      return
    }

    setDecidingBlockId(blockId)
    setStreamState({ content: "", status: "Resuming agent…" })

    try {
      await streamActionBlockDecision(blockId, decision, memberId, {
        onStatus: (status) =>
          setStreamState((s) =>
            s ? { ...s, status } : { content: "", status },
          ),
        onToken: (token) =>
          setStreamState((s) =>
            s
              ? { content: s.content + token, status: undefined }
              : { content: token },
          ),
        onError: (message) => {
          toast(message)
          setStreamState(null)
        },
        onDone: (message) => {
          handleMessageSent(message)
          setStreamState(null)
          setPendingBlocks((prev) => prev.filter((b) => b.id !== blockId))
        },
      })
    } catch {
      setStreamState(null)
    } finally {
      setDecidingBlockId(null)
      void loadPendingBlocks()
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar
        workspaces={workspaces}
        channels={channelList}
        activeChannelSlug={channel.slug}
        displayName={userDisplayName}
        email={userEmail}
        workspaceId={workspace.id}
        memberRole={memberRole}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onChannelCreated={handleChannelCreated}
        onChannelDeleted={handleChannelDeleted}
        settingsSection={settingsSection}
      />
      <div className="relative flex min-w-0 flex-1 flex-col">
        {settingsSection && (
            <SettingsModal
              workspaceName={workspace.name}
              channelSlug={channel.slug}
              section={
                settingsSection === "workspace" &&
                memberRole !== "owner" &&
                memberRole !== "admin"
                  ? "profile"
                  : settingsSection
              }
              memberRole={memberRole}
              agents={agents}
              channels={channelList}
            />
        )}
        <ChannelHeader
          channelName={channel.name}
          channelSlug={channel.slug}
          workspaceName={workspace.name}
          settingsSection={settingsSection}
          activeTab={channelTab}
          pinnedCount={pinnedMessages.length}
          onTabChange={setChannelTab}
          pendingApprovalCount={pendingBlocks.length}
          searchQuery={searchQuery}
          searchResults={searchResults}
          onSearchChange={setSearchQuery}
          onSearchSelect={(hit) => {
            void navigateToSearchHit(hit)
            setSearchQuery("")
            setSearchResults([])
          }}
          onMenuOpen={() => setSidebarOpen(true)}
        />
        {agentsGloballyPaused && (
          <div className="shrink-0 border-b bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
            All agents are paused for this workspace. Resume in{" "}
            <Link
              href={chatUrl(channel.slug, "agents")}
              scroll={false}
              className="underline underline-offset-2"
            >
              settings
            </Link>
            .
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col">
          {channelTab === "messages" ? (
            <>
              <MessageList
              messages={topLevelMessages}
              streamState={streamState}
              streamingAgent={streamState?.agent}
              agentsById={agentsById}
              expandedThreadId={expandedThreadId}
              threadReplies={threadReplies}
              highlightMessageId={highlightMessageId}
              activeStreamThreadId={streamState?.threadId ?? null}
              onOpenThread={openThread}
              onToggleThread={toggleThread}
              onPinToggle={handlePinToggle}
              onDelete={handleDeleteMessage}
              canDelete={messageCanDelete}
              currentMemberId={memberId}
              pinLimitReached={pinLimitReached}
              threadProps={threadProps}
            />
            <ActionBlockList
              blocks={pendingBlocks}
              decidingId={decidingBlockId}
              onDecide={handleDecide}
            />
            <MessageInput
              channelId={channel.id}
              channelSlug={channel.slug}
              workspaceId={workspaceId}
              defaultAgentId={agentId}
              agents={agents}
              agentsGloballyPaused={agentsGloballyPaused}
              memberId={memberId}
              senderName={userDisplayName}
              {...makeStreamHandlers(null)}
              onActionBlock={handleActionBlock}
              onMessageSent={handleMessageSent}
            />
            </>
          ) : (
            <PinsView
              pins={pinnedMessages}
              agentsById={agentsById}
              onSelect={(message) => {
                setChannelTab("messages")
                void navigateToMessage(message)
              }}
              onUnpin={(message) => {
                void handlePinToggle(message, false)
              }}
            />
          )}
        </div>
      </div>

      {mobileThreadRoot && (
        <ThreadView
          rootMessage={mobileThreadRoot}
          replies={threadReplies[mobileThreadRoot.id] ?? []}
          streamState={
            streamState?.threadId === mobileThreadRoot.id ? streamState : null
          }
          streamingAgent={
            streamState?.threadId === mobileThreadRoot.id
              ? streamState.agent
              : null
          }
          agentsById={agentsById}
          channelId={channel.id}
          channelSlug={channel.slug}
          workspaceId={workspaceId}
          defaultAgentId={agentId}
          agents={agents}
          agentsGloballyPaused={agentsGloballyPaused}
          memberId={memberId}
          senderName={userDisplayName}
          onClose={() => setMobileThreadRoot(null)}
          {...makeStreamHandlers(mobileThreadRoot.id)}
          onActionBlock={handleActionBlock}
          onMessageSent={handleMessageSent}
          onPinToggle={handlePinToggle}
          onDelete={handleDeleteMessage}
          canDelete={messageCanDelete}
          pinLimitReached={pinLimitReached}
          highlightMessageId={highlightMessageId}
        />
      )}
    </div>
  )
}
