import { NextResponse } from "next/server"
import { requireChannelMember } from "@/lib/channel-member"
import {
  fetchChannelAgents,
  removeChannelAgent,
} from "@/lib/channel-agents-data"
import { isMemberDirectMessage } from "@/lib/direct-messages"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; agentId: string }> },
) {
  const { id, agentId: rawAgentId } = await params
  const channelId = id.trim()
  const agentId = rawAgentId.trim()
  if (!channelId || !agentId) {
    return NextResponse.json({ error: "Channel and agent id are required" }, { status: 400 })
  }

  const ctx = await requireChannelMember(channelId)
  if ("error" in ctx && ctx.error) return ctx.error

  const { data: channel, error: channelError } = await ctx.supabase!
    .from("channels")
    .select("id,type,direct_peer_member_id")
    .eq("id", channelId)
    .maybeSingle()

  if (channelError || !channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 })
  }

  if (!isMemberDirectMessage(channel)) {
    return NextResponse.json(
      { error: "Agents can only be removed from teammate direct messages." },
      { status: 400 },
    )
  }

  const result = await removeChannelAgent(ctx.supabase!, channelId, agentId)
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 400 },
    )
  }

  const agents = await fetchChannelAgents(ctx.supabase!, channelId)
  return NextResponse.json({ agents })
}
