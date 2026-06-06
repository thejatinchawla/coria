import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { createClient } from "@/lib/supabase-server"
import {
  DIVV_AGENT_ID_FALLBACK,
  fetchChannelBySlug,
  fetchDefaultAgentId,
  fetchMemberId,
  fetchWorkspaceSettings,
} from "@/lib/workspace"
import { loadWorkspaceShellContext } from "@/lib/app-context"
import { Chat } from "@/components/Chat"
import { SetupError } from "@/components/SetupError"
import { isSettingsId } from "@/lib/settings-links"
import { settingsUrl } from "@/lib/settings-url"
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

  if (params.settings && isSettingsId(params.settings)) {
    redirect(settingsUrl(params.settings))
  }

  if (!params.channel) {
    redirect(`/?channel=${channelSlug}`)
  }

  const shell = await loadWorkspaceShellContext()
  const supabase = await createClient()

  const channel = await fetchChannelBySlug(
    supabase,
    shell.workspace.id,
    channelSlug,
  )
  if (!channel) {
    if (channelSlug !== "general") {
      redirect("/?channel=general")
    }
    return (
      <SetupError
        title="Channel not found"
        message='The #general channel is missing for this workspace.'
      />
    )
  }

  const [agentId, memberId, workspaceSettings] = await Promise.all([
    fetchDefaultAgentId(supabase, shell.workspace.id),
    fetchMemberId(supabase, shell.workspace.id, shell.member.user_id),
    fetchWorkspaceSettings(supabase, shell.workspace.id),
  ])

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("channel_id", channel.id)
    .is("thread_id", null)
    .order("created_at", { ascending: true })

  return (
    <Chat
      key={channel.id}
      workspace={shell.workspace}
      memberRole={shell.memberRole}
      channel={channel}
      agentId={agentId ?? DIVV_AGENT_ID_FALLBACK}
      agents={shell.agents}
      workspaceSettings={workspaceSettings}
      memberId={memberId}
      workspaceId={shell.workspace.id}
      initialMessages={(messages ?? []) as Message[]}
    />
  )
}
