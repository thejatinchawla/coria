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
import {
  buildChatUrl,
  parseChatLocation,
  parseChatLocationStorageKey,
} from "@/lib/chat-location"
import {
  legacyDmRedirectPath,
  resolveChatChannel,
} from "@/lib/resolve-chat-channel"
import { cookies } from "next/headers"
import { LAST_CHANNEL_COOKIE } from "@/lib/channel-slug"
import type { Message } from "@/types"

type PageProps = {
  searchParams: Promise<{
    channel?: string
    dm?: string
    agent?: string
    settings?: string
  }>
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams
  const location = parseChatLocation(params)
  if (location?.kind === "member_dm") {
    return { title: "Direct message" }
  }
  if (location?.kind === "agent_dm") {
    return { title: "Agent chat" }
  }
  const slug = location?.kind === "channel" ? location.slug : "general"
  return { title: slug.startsWith("dm-") ? "Direct message" : `#${slug}` }
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams

  if (params.settings && isSettingsId(params.settings)) {
    redirect(settingsUrl(params.settings))
  }

  const shell = await loadWorkspaceShellContext()
  const supabase = await createClient()
  const memberId = await fetchMemberId(
    supabase,
    shell.workspace.id,
    shell.member.user_id,
  )

  let location = parseChatLocation(params)

  if (!location) {
    const cookieStore = await cookies()
    const stored = parseChatLocationStorageKey(
      cookieStore.get(LAST_CHANNEL_COOKIE)?.value,
    )
    location = stored ?? { kind: "channel", slug: "general" }
    redirect(buildChatUrl(location))
  }

  if (location.kind === "channel" && location.slug.startsWith("dm-")) {
    const legacy = await fetchChannelBySlug(
      supabase,
      shell.workspace.id,
      location.slug,
    )
    if (legacy) {
      const nextPath = legacyDmRedirectPath(legacy, memberId)
      if (nextPath) redirect(nextPath)
    }
  }

  const channel = await resolveChatChannel(
    supabase,
    shell.workspace.id,
    location,
    memberId,
  )

  if (!channel) {
    if (location.kind === "channel" && location.slug !== "general") {
      redirect(buildChatUrl({ kind: "channel", slug: "general" }))
    }
    return (
      <SetupError
        title="Conversation not found"
        message="That direct message could not be opened."
      />
    )
  }

  const canonicalPath = legacyDmRedirectPath(channel, memberId)
  if (canonicalPath && canonicalPath !== buildChatUrl(location)) {
    redirect(canonicalPath)
  }

  const [agentId, workspaceSettings] = await Promise.all([
    fetchDefaultAgentId(supabase, shell.workspace.id),
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
