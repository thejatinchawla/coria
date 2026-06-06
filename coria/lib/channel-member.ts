import { NextResponse } from "next/server"
import { requireWorkspaceMember } from "@/lib/settings-member"

export async function requireChannelMember(channelId: string) {
  const ctx = await requireWorkspaceMember()
  if ("error" in ctx && ctx.error) return ctx

  const { data, error } = await ctx.supabase!
    .from("channel_members")
    .select("id")
    .eq("channel_id", channelId)
    .eq("member_id", ctx.member!.id)
    .maybeSingle()

  if (error || !data) {
    return {
      error: NextResponse.json(
        { error: "You are not a member of this channel." },
        { status: 403 },
      ),
    }
  }

  return ctx
}
