import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { createClient } from "@/lib/supabase-server"
import { displayName } from "@/lib/user"
import {
  DIVV_AGENT_ID_FALLBACK,
  fetchAgents,
  fetchChannelBySlug,
  fetchChannels,
  fetchDefaultAgentId,
  fetchMember,
  fetchMemberId,
  fetchUserWorkspaces,
  fetchWorkspace,
  fetchWorkspaceSettings,
} from "@/lib/workspace"
import { getActiveWorkspaceIdFromCookie } from "@/lib/workspace-cookie"
import { Chat } from "@/components/Chat"
import { SetupError } from "@/components/SetupError"
import { isSettingsId } from "@/lib/settings-links"
import type { Message } from "@/types"

type PageProps = {
  searchParams: Promise<{ channel?: string; settings?: string }>
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const { channel = "general" } = await searchParams
  return { title: `#${channel}` }
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams
  const channelSlug = params.channel?.trim() || "general"
  const settingsSection = isSettingsId(params.settings) ? params.settings : null

  if (!params.channel) {
    const url = new URLSearchParams({ channel: channelSlug })
    if (settingsSection) url.set("settings", settingsSection)
    redirect(`/?${url.toString()}`)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const userDisplayName = displayName(user)
  const workspaces = await fetchUserWorkspaces(supabase, user.id)
  const activeWorkspaceId = await getActiveWorkspaceIdFromCookie()

  if (workspaces.length === 0) {
    if (user.invited_at) {
      redirect("/auth/join?from=invite")
    }
    redirect("/onboarding")
  }

  const workspace = await fetchWorkspace(supabase, user.id, activeWorkspaceId)
  if (!workspace) {
    redirect("/onboarding")
  }

  const member = await fetchMember(supabase, workspace.id, user.id)
  if (!member) {
    return (
      <SetupError
        title="Could not access workspace"
        message="You are not a member of this workspace."
      />
    )
  }

  const channel = await fetchChannelBySlug(
    supabase,
    workspace.id,
    channelSlug,
  )
  if (!channel) {
    if (channelSlug !== "general") {
      const url = new URLSearchParams({ channel: "general" })
      if (settingsSection) url.set("settings", settingsSection)
      redirect(`/?${url.toString()}`)
    }
    return (
      <SetupError
        title="Channel not found"
        message='The #general channel is missing for this workspace.'
      />
    )
  }

  const [channels, agentId, memberId, agents, workspaceSettings] =
    await Promise.all([
      fetchChannels(supabase, workspace.id),
      fetchDefaultAgentId(supabase, workspace.id),
      fetchMemberId(supabase, workspace.id, user.id),
      fetchAgents(supabase, workspace.id),
      fetchWorkspaceSettings(supabase, workspace.id),
    ])

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("channel_id", channel.id)
    .is("thread_id", null)
    .order("created_at", { ascending: true })

  return (
    <Chat
      workspace={workspace}
      workspaces={workspaces}
      memberRole={member.role}
      channel={channel}
      channels={channels}
      agentId={agentId ?? DIVV_AGENT_ID_FALLBACK}
      agents={agents}
      workspaceSettings={workspaceSettings}
      memberId={memberId}
      workspaceId={workspace.id}
      initialMessages={(messages ?? []) as Message[]}
      userEmail={user.email ?? ""}
      userDisplayName={userDisplayName}
      settingsSection={settingsSection}
    />
  )
}
