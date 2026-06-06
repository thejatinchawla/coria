import { NextResponse } from "next/server"
import { requireWorkspaceAdmin } from "@/lib/settings-member"
import {
  fetchChannelMembers,
  removeChannelMember,
} from "@/lib/channel-members-data"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id, memberId: targetMemberId } = await params
  const channelId = id.trim()
  const memberId = targetMemberId.trim()

  if (!channelId || !memberId) {
    return NextResponse.json({ error: "Channel and member id are required" }, { status: 400 })
  }

  const ctx = await requireWorkspaceAdmin()
  if ("error" in ctx && ctx.error) return ctx.error

  const { data: channel, error: channelError } = await ctx.supabase!
    .from("channels")
    .select("id")
    .eq("id", channelId)
    .eq("workspace_id", ctx.workspace!.id)
    .maybeSingle()

  if (channelError || !channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 })
  }

  const result = await removeChannelMember(ctx.supabase!, channelId, memberId)
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 400 },
    )
  }

  const members = await fetchChannelMembers(ctx.supabase!, channelId)
  return NextResponse.json({ members })
}
