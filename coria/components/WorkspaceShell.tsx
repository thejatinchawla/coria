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
import { useRouter } from "next/navigation"
import { AppShell } from "@/components/AppShell"
import type { WorkspaceShellContext } from "@/lib/app-context"
import { writeStoredChannelSlug } from "@/lib/channel-slug"
import { chatUrlForChannel } from "@/lib/settings-url"
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
  initialChannelSlug,
  children,
}: {
  initial: WorkspaceShellContext
  initialChannelSlug: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const chatBridgeRef = useRef<ChatBridge | null>(null)
  const [workspace, setWorkspace] = useState(initial.workspace)
  const [workspaces, setWorkspaces] = useState(initial.workspaces)
  const [memberRole, setMemberRole] = useState<MemberRole>(initial.memberRole)
  const [agents, setAgents] = useState<Agent[]>(initial.agents)
  const [workspaceMembers, setWorkspaceMembers] = useState<Member[]>(
    initial.workspaceMembers,
  )
  const [channels, setChannels] = useState(initial.channels)
  const [currentMember, setCurrentMember] = useState(initial.member)
  const [userDisplayName, setUserDisplayName] = useState(initial.userDisplayName)
  const [switchingChannelId, setSwitchingChannelId] = useState<string | null>(
    null,
  )
  const [activeChannelSlug, setActiveChannelSlugState] =
    useState(initialChannelSlug)

  useEffect(() => {
    setActiveChannelSlugState(initialChannelSlug)
  }, [initialChannelSlug])

  const setActiveChannelSlug = useCallback((slug: string) => {
    writeStoredChannelSlug(slug)
    setActiveChannelSlugState(slug)
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
    setWorkspaceMembers(initial.workspaceMembers)
    setChannels(initial.channels)
    setCurrentMember(initial.member)
    setUserDisplayName(initial.userDisplayName)
  }, [
    initial.workspace,
    initial.workspaces,
    initial.memberRole,
    initial.agents,
    initial.workspaceMembers,
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
      router.push(chatUrlForChannel(channel, currentMember.id))
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
      workspaceMembers,
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
      workspaceMembers,
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
        agents={agents}
        workspaceMembers={workspaceMembers}
        currentMemberId={currentMember.id}
        onChannelSelect={handleChannelSelect}
        onChannelCreated={handleChannelCreated}
        onChannelDeleted={handleChannelDeleted}
      >
        {children}
      </AppShell>
    </WorkspaceShellStateContext.Provider>
  )
}
