import { NextResponse } from "next/server"
import { requireChannelMember } from "@/lib/channel-member"
import {
  addChannelMember,
  fetchChannelMembers,
} from "@/lib/channel-members-data"
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

  const members = await fetchChannelMembers(ctx.supabase!, channelId)
  return NextResponse.json({ members })
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

  let body: { member_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const memberId = body.member_id?.trim()
  if (!memberId) {
    return NextResponse.json({ error: "member_id is required" }, { status: 400 })
  }

  const { data: targetMember, error: targetError } = await ctx.supabase!
    .from("members")
    .select("id")
    .eq("id", memberId)
    .eq("workspace_id", ctx.workspace!.id)
    .maybeSingle()

  if (targetError || !targetMember) {
    return NextResponse.json(
      { error: "That teammate is not in this workspace." },
      { status: 404 },
    )
  }

  const result = await addChannelMember(
    ctx.supabase!,
    channelId,
    memberId,
    ctx.member!.id,
  )

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 400 },
    )
  }

  const members = await fetchChannelMembers(ctx.supabase!, channelId)
  return NextResponse.json({ members })
}
