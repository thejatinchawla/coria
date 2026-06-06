import type { SupabaseClient } from "@supabase/supabase-js"
import type { Channel, Member } from "@/types"

export async function fetchChannelsForMember(
  supabase: SupabaseClient,
  workspaceId: string,
  memberId: string,
): Promise<Channel[]> {
  const { data, error } = await supabase
    .from("channels")
    .select(
      "id,workspace_id,name,slug,type,description,direct_agent_id,direct_peer_member_id,created_at, channel_members!inner(member_id)",
    )
    .eq("workspace_id", workspaceId)
    .eq("channel_members.member_id", memberId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[channel-members] fetchChannelsForMember:", error.message)
    return []
  }

  return (data ?? []).map((row) => {
    const { channel_members: _ignored, ...channel } = row as Channel & {
      channel_members: unknown
    }
    void _ignored
    return channel
  })
}

const MEMBER_COLUMNS =
  "id,workspace_id,user_id,display_name,role,avatar_url,bio,created_at"

export async function fetchWorkspaceMembers(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<Member[]> {
  const { data, error } = await supabase
    .from("members")
    .select(MEMBER_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[channel-members] fetchWorkspaceMembers:", error.message)
    return []
  }

  return (data as Member[] | null) ?? []
}

export async function fetchChannelMembers(
  supabase: SupabaseClient,
  channelId: string,
): Promise<Member[]> {
  const { data: channel, error: channelError } = await supabase
    .from("channels")
    .select("slug,workspace_id")
    .eq("id", channelId)
    .maybeSingle()

  if (channelError || !channel) {
    console.error(
      "[channel-members] fetchChannelMembers channel:",
      channelError?.message ?? "not found",
    )
    return []
  }

  // #general always shows every workspace teammate (synced in DB via triggers).
  if (channel.slug === "general") {
    return fetchWorkspaceMembers(supabase, channel.workspace_id)
  }

  const { data, error } = await supabase
    .from("channel_members")
    .select(
      `member:members!channel_members_member_id_fkey(${MEMBER_COLUMNS})`,
    )
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[channel-members] fetchChannelMembers:", error.message)
    return []
  }

  return (data ?? [])
    .map((row) => {
      const member = row.member
      if (!member || Array.isArray(member)) return null
      return member as Member
    })
    .filter((member): member is Member => member !== null)
}

export async function addChannelMember(
  supabase: SupabaseClient,
  channelId: string,
  memberId: string,
  addedByMemberId: string,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const { error } = await supabase.from("channel_members").insert({
    channel_id: channelId,
    member_id: memberId,
    added_by: addedByMemberId,
  })

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "That person is already in this channel.",
        status: 409,
      }
    }
    return { ok: false, error: error.message, status: 400 }
  }

  return { ok: true }
}

export async function removeChannelMember(
  supabase: SupabaseClient,
  channelId: string,
  memberId: string,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const { error } = await supabase.rpc("remove_channel_member", {
    p_channel_id: channelId,
    p_member_id: memberId,
  })

  if (error) {
    const message = error.message
    const status =
      message.includes("Admin access required") ||
      message.includes("Not authenticated")
        ? 403
        : message.includes("not found") ||
            message.includes("not in this channel")
          ? 404
          : 400
    return { ok: false, error: message, status }
  }

  return { ok: true }
}
