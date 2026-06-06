"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { usePathname, useRouter } from "next/navigation"
import { AppShell } from "@/components/AppShell"
import type { WorkspaceShellContext } from "@/lib/app-context"
import { chatUrl } from "@/lib/settings-url"
import type { Channel } from "@/types"

const LAST_CHANNEL_KEY = "coria_last_channel"

type ChatBridge = {
  onChannelSelect?: (channel: Channel) => void
  onChannelCreated?: (channel: Channel) => void
  onChannelDeleted?: (channelId: string, fallback: Channel) => void
}

type WorkspaceShellState = WorkspaceShellContext & {
  channels: Channel[]
}

const WorkspaceShellStateContext = createContext<{
  shell: WorkspaceShellState
  activeChannelSlug: string
  setActiveChannelSlug: (slug: string) => void
  switchingChannelId: string | null
  setSwitchingChannelId: React.Dispatch<React.SetStateAction<string | null>>
  registerChatBridge: (bridge: ChatBridge | null) => void
  setChannels: React.Dispatch<React.SetStateAction<Channel[]>>
} | null>(null)

export function useWorkspaceShell() {
  const ctx = useContext(WorkspaceShellStateContext)
  if (!ctx) {
    throw new Error("useWorkspaceShell must be used within WorkspaceShell")
  }
  return ctx
}

export function WorkspaceShell({
  initial,
  children,
}: {
  initial: WorkspaceShellContext
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const chatBridgeRef = useRef<ChatBridge | null>(null)
  const [channels, setChannels] = useState(initial.channels)
  const [switchingChannelId, setSwitchingChannelId] = useState<string | null>(
    null,
  )
  const [lastChannelSlug, setLastChannelSlug] = useState("general")
  const [chatChannelSlug, setChatChannelSlug] = useState("general")

  const isChatRoute = pathname === "/"
  const activeChannelSlug = isChatRoute ? chatChannelSlug : lastChannelSlug

  const setActiveChannelSlug = useCallback((slug: string) => {
    setChatChannelSlug(slug)
    setLastChannelSlug(slug)
    sessionStorage.setItem(LAST_CHANNEL_KEY, slug)
  }, [])

  useEffect(() => {
    setChannels(initial.channels)
  }, [initial.channels])

  useEffect(() => {
    const stored = sessionStorage.getItem(LAST_CHANNEL_KEY)
    if (stored) setLastChannelSlug(stored)
  }, [])

  useEffect(() => {
    if (pathname !== "/") return
    const slug =
      new URLSearchParams(window.location.search).get("channel")?.trim() ||
      "general"
    setChatChannelSlug(slug)
    setLastChannelSlug(slug)
    sessionStorage.setItem(LAST_CHANNEL_KEY, slug)
  }, [pathname])

  const registerChatBridge = useCallback((bridge: ChatBridge | null) => {
    chatBridgeRef.current = bridge
  }, [])

  const handleChannelSelect = useCallback(
    (channel: Channel) => {
      if (chatBridgeRef.current?.onChannelSelect) {
        chatBridgeRef.current.onChannelSelect(channel)
        return
      }
      router.push(chatUrl(channel.slug))
    },
    [router],
  )

  const handleChannelCreated = useCallback((channel: Channel) => {
    setChannels((prev) =>
      prev.some((c) => c.id === channel.id) ? prev : [...prev, channel],
    )
    chatBridgeRef.current?.onChannelCreated?.(channel)
  }, [])

  const handleChannelDeleted = useCallback(
    (channelId: string, fallback: Channel) => {
      setChannels((prev) => prev.filter((c) => c.id !== channelId))
      chatBridgeRef.current?.onChannelDeleted?.(channelId, fallback)
    },
    [],
  )

  const shell = useMemo(
    (): WorkspaceShellState => ({
      ...initial,
      channels,
    }),
    [initial, channels],
  )

  const value = useMemo(
    () => ({
      shell,
      activeChannelSlug,
      setActiveChannelSlug,
      switchingChannelId,
      setSwitchingChannelId,
      registerChatBridge,
      setChannels,
    }),
    [
      shell,
      activeChannelSlug,
      setActiveChannelSlug,
      switchingChannelId,
      registerChatBridge,
    ],
  )

  return (
    <WorkspaceShellStateContext.Provider value={value}>
      <AppShell
        workspaces={initial.workspaces}
        channels={channels}
        activeChannelSlug={activeChannelSlug}
        switchingChannelId={switchingChannelId}
        displayName={initial.userDisplayName}
        email={initial.userEmail}
        workspaceId={initial.workspace.id}
        memberRole={initial.memberRole}
        onChannelSelect={handleChannelSelect}
        onChannelCreated={handleChannelCreated}
        onChannelDeleted={handleChannelDeleted}
      >
        {children}
      </AppShell>
    </WorkspaceShellStateContext.Provider>
  )
}
