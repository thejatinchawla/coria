import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { createClient } from "@/lib/supabase-server"
import { displayName } from "@/lib/user"
import {
  DIVV_AGENT_ID_FALLBACK,
  ensureDemoMember,
  fetchAgents,
  fetchChannelBySlug,
  fetchChannels,
  fetchDefaultAgentId,
  fetchMemberId,
  fetchWorkspace,
  fetchWorkspaceSettings,
} from "@/lib/workspace"
import { Chat } from "@/components/Chat"
import { SetupError } from "@/components/SetupError"
import type { Message } from "@/types"

type PageProps = {
  searchParams: Promise<{ channel?: string }>
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

  if (!params.channel) {
    redirect(`/?channel=${channelSlug}`)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const userDisplayName = displayName(user)

  const workspace = await fetchWorkspace(supabase)
  if (!workspace) {
    return (
      <SetupError
        title="Workspace not set up"
        message="Could not load the Coria Demo workspace. Apply the V2 Supabase migration to your project."
      />
    )
  }

  const memberResult = await ensureDemoMember(
    supabase,
    user.id,
    userDisplayName,
  )
  if (!memberResult.ok) {
    return (
      <SetupError
        title="Could not join workspace"
        message={memberResult.error}
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
      redirect("/?channel=general")
    }
    return (
      <SetupError
        title="Channel not found"
        message='The #general channel is missing. Re-run the V2 migration seed.'
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
    />
  )
}
