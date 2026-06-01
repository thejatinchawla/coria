import type { SupabaseClient } from "@supabase/supabase-js"
import type { MemberRole, Message, MessageSearchHit } from "@/types"

export const MAX_PINNED_MESSAGES = 5

export async function fetchThreadReplies(
  supabase: SupabaseClient,
  threadId: string,
): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[messages] fetchThreadReplies:", error.message)
    return []
  }

  return (data as Message[] | null) ?? []
}

export async function searchChannelMessages(
  supabase: SupabaseClient,
  channelId: string,
  query: string,
  limit = 30,
): Promise<MessageSearchHit[]> {
  const q = query.trim()
  if (!q) return []

  const { data, error } = await supabase.rpc("search_channel_messages", {
    p_channel_id: channelId,
    p_query: q,
    p_limit: limit,
  })

  if (error) {
    console.error("[messages] searchChannelMessages:", error.message)
    return []
  }

  return (data as MessageSearchHit[] | null) ?? []
}

export function isTopLevelMessage(message: Message): boolean {
  return !message.thread_id
}

export async function fetchPinnedMessages(
  supabase: SupabaseClient,
  channelId: string,
): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("channel_id", channelId)
    .eq("is_pinned", true)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[messages] fetchPinnedMessages:", error.message)
    return []
  }

  return (data as Message[] | null) ?? []
}

export async function setMessagePinned(
  supabase: SupabaseClient,
  messageId: string,
  pinned: boolean,
): Promise<Message> {
  const { data, error } = await supabase.rpc("set_message_pinned", {
    p_message_id: messageId,
    p_pinned: pinned,
  })

  if (error) {
    throw new Error(error.message)
  }

  return data as Message
}

export function canDeleteMessage(
  message: Message,
  memberId: string | null,
  memberRole: MemberRole,
): boolean {
  if (memberRole === "owner" || memberRole === "admin") return true
  return (
    message.sender_type === "human" &&
    memberId !== null &&
    message.sender_id === memberId
  )
}

export async function deleteMessage(
  supabase: SupabaseClient,
  messageId: string,
): Promise<void> {
  const { error } = await supabase.rpc("delete_message", {
    p_message_id: messageId,
  })

  if (error) {
    throw new Error(error.message)
  }
}
