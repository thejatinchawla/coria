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
import {
  readStoredChannelSlug,
  readUrlChannelSlug,
  writeStoredChannelSlug,
} from "@/lib/channel-slug"
import { chatUrl } from "@/lib/settings-url"
import type { Agent, Channel, Member, MemberRole } from "@/types"

type ChatBridge = {
  onChannelSelect?: (channel: Channel) => void
  onChannelCreated?: (channel: Channel) => void
  onChannelDeleted?: (channelId: string, fallback: Channel) => void
  onProfileUpdated?: (member: Member) => void
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
  updateCurrentMemberProfile: (profile: Member) => void
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
  const [workspace, setWorkspace] = useState(initial.workspace)
  const [workspaces, setWorkspaces] = useState(initial.workspaces)
  const [memberRole, setMemberRole] = useState<MemberRole>(initial.memberRole)
  const [agents, setAgents] = useState<Agent[]>(initial.agents)
  const [channels, setChannels] = useState(initial.channels)
  const [currentMember, setCurrentMember] = useState(initial.member)
  const [userDisplayName, setUserDisplayName] = useState(initial.userDisplayName)
  const [switchingChannelId, setSwitchingChannelId] = useState<string | null>(
    null,
  )
  const [lastChannelSlug, setLastChannelSlug] = useState(readStoredChannelSlug)
  const [channelRevision, setChannelRevision] = useState(0)

  const isChatRoute = pathname === "/"
  const activeChannelSlug = useMemo(() => {
    if (!isChatRoute) return lastChannelSlug
    void channelRevision
    return readUrlChannelSlug()
  }, [channelRevision, isChatRoute, lastChannelSlug])

  const setActiveChannelSlug = useCallback((slug: string) => {
    writeStoredChannelSlug(slug)
    setLastChannelSlug(slug)
    setChannelRevision((value) => value + 1)
  }, [])

  const registerChatBridge = useCallback((bridge: ChatBridge | null) => {
    chatBridgeRef.current = bridge
  }, [])

  const updateCurrentMemberProfile = useCallback((profile: Member) => {
    setCurrentMember(profile)
    setUserDisplayName(profile.display_name?.trim() || initial.userDisplayName)
    chatBridgeRef.current?.onProfileUpdated?.(profile)
  }, [initial.userDisplayName])

  useEffect(() => {
    setWorkspace(initial.workspace)
    setWorkspaces(initial.workspaces)
    setMemberRole(initial.memberRole)
    setAgents(initial.agents)
    setChannels(initial.channels)
    setCurrentMember(initial.member)
    setUserDisplayName(initial.userDisplayName)
  }, [
    initial.workspace,
    initial.workspaces,
    initial.memberRole,
    initial.agents,
    initial.channels,
    initial.member,
    initial.userDisplayName,
  ])

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
      workspace,
      workspaces,
      memberRole,
      agents,
      member: currentMember,
      userDisplayName,
      channels,
    }),
    [
      initial,
      workspace,
      workspaces,
      memberRole,
      agents,
      currentMember,
      userDisplayName,
      channels,
    ],
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
      updateCurrentMemberProfile,
    }),
    [
      shell,
      activeChannelSlug,
      setActiveChannelSlug,
      switchingChannelId,
      registerChatBridge,
      updateCurrentMemberProfile,
    ],
  )

  return (
    <WorkspaceShellStateContext.Provider value={value}>
      <AppShell
        workspaces={workspaces}
        channels={channels}
        activeChannelSlug={activeChannelSlug}
        switchingChannelId={switchingChannelId}
        displayName={userDisplayName}
        email={initial.userEmail}
        workspaceId={workspace.id}
        memberRole={memberRole}
        onChannelSelect={handleChannelSelect}
        onChannelCreated={handleChannelCreated}
        onChannelDeleted={handleChannelDeleted}
      >
        {children}
      </AppShell>
    </WorkspaceShellStateContext.Provider>
  )
}
