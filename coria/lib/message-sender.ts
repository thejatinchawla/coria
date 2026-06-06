import type { Agent, Member, Message } from "@/types"

export function messageAgent(
  message: Message,
  agentsById?: Record<string, Agent>,
): Agent | undefined {
  if (message.sender_type !== "agent" || !message.sender_id || !agentsById) {
    return undefined
  }
  return agentsById[message.sender_id]
}

export function messageMember(
  message: Message,
  membersById?: Record<string, Member>,
): Member | undefined {
  if (message.sender_type !== "human" || !message.sender_id || !membersById) {
    return undefined
  }
  return membersById[message.sender_id]
}
