import { NextResponse } from "next/server"
import { requireWorkspaceAdmin } from "@/lib/settings-member"
import { deleteChannel } from "@/lib/workspace"

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
