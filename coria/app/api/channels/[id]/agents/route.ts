import { NextResponse } from "next/server"
import { requireChannelMember } from "@/lib/channel-member"
import {
  addChannelAgent,
  fetchChannelAgents,
} from "@/lib/channel-agents-data"
import { isMemberDirectMessage } from "@/lib/direct-messages"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const channelId = id.trim()
  if (!channelId) {
    return NextResponse.json({ error: "Channel id is required" }, { status: 400 })
  }

  const ctx = await requireChannelMember(channelId)
  if ("error" in ctx && ctx.error) return ctx.error

  const agents = await fetchChannelAgents(ctx.supabase!, channelId)
  return NextResponse.json({ agents })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const channelId = id.trim()
  if (!channelId) {
    return NextResponse.json({ error: "Channel id is required" }, { status: 400 })
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
      { error: "Agents can only be added to teammate direct messages." },
      { status: 400 },
    )
  }

  let body: { agent_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const agentId = body.agent_id?.trim()
  if (!agentId) {
    return NextResponse.json({ error: "agent_id is required" }, { status: 400 })
  }

  const { data: targetAgent, error: targetError } = await ctx.supabase!
    .from("agents")
    .select("id,status")
    .eq("id", agentId)
    .eq("workspace_id", ctx.workspace!.id)
    .maybeSingle()

  if (targetError || !targetAgent) {
    return NextResponse.json(
      { error: "That agent is not in this workspace." },
      { status: 404 },
    )
  }

  if (targetAgent.status !== "active") {
    return NextResponse.json(
      { error: "Resume the agent before adding them to a conversation." },
      { status: 400 },
    )
  }

  const result = await addChannelAgent(
    ctx.supabase!,
    channelId,
    agentId,
    ctx.member!.id,
  )

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 400 },
    )
  }

  const agents = await fetchChannelAgents(ctx.supabase!, channelId)
  return NextResponse.json({ agents })
}
