import { NextResponse } from "next/server"
import { requireWorkspaceAdmin } from "@/lib/settings-member"
import { deleteChannel, updateChannel } from "@/lib/workspace"
import type { ChannelType } from "@/types"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireWorkspaceAdmin()
  if ("error" in ctx && ctx.error) return ctx.error

  const { id } = await params
  const channelId = id.trim()
  if (!channelId) {
    return NextResponse.json({ error: "Channel id is required" }, { status: 400 })
  }

  let body: {
    name?: string
    description?: string | null
    type?: ChannelType
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (typeof body.name !== "string") {
    return NextResponse.json({ error: "Channel name is required" }, { status: 400 })
  }

  const result = await updateChannel(
    ctx.supabase,
    ctx.workspace!.id,
    channelId,
    {
      name: body.name,
      description: body.description ?? null,
      type: body.type ?? "hybrid",
    },
  )

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 400 },
    )
  }

  return NextResponse.json({ channel: result.channel })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireWorkspaceAdmin()
  if ("error" in ctx && ctx.error) return ctx.error

  const { id } = await params
  const channelId = id.trim()
  if (!channelId) {
    return NextResponse.json({ error: "Channel id is required" }, { status: 400 })
  }

  const result = await deleteChannel(
    ctx.supabase,
    ctx.workspace!.id,
    channelId,
    ctx.member!.id,
  )

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 400 },
    )
  }

  return NextResponse.json({
    ok: true,
    deleted_id: channelId,
    fallback_channel: result.fallbackChannel,
  })
}
