import type { ActionBlock, Message } from "@/types"

export type StreamInvokeEvent =
  | { type: "status"; message: string }
  | { type: "started"; trace_id: string }
  | { type: "token"; content: string }
  | { type: "error"; message: string }
  | { type: "action_block"; action_block: ActionBlock; trace_id: string | null }
  | { type: "awaiting_approval" }
  | { type: "done"; message: Message; trace_id: string | null }

export type StreamInvokeCallbacks = {
  onStatus?: (message: string) => void
  onToken?: (content: string) => void
  onActionBlock?: (block: ActionBlock, traceId: string | null) => void
  onAwaitingApproval?: () => void
  onDone?: (message: Message) => void
  onError?: (message: string) => void
}

async function consumeSseStream(
  response: Response,
  callbacks: StreamInvokeCallbacks,
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) {
    const err = "Streaming not supported in this browser"
    callbacks.onError?.(err)
    throw new Error(err)
  }

  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const parts = buffer.split("\n\n")
    buffer = parts.pop() ?? ""

    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data:"))
      if (!line) continue
      const raw = line.slice(5).trim()
      if (!raw) continue

      let event: StreamInvokeEvent
      try {
        event = JSON.parse(raw) as StreamInvokeEvent
      } catch {
        continue
      }

      switch (event.type) {
        case "status":
          callbacks.onStatus?.(event.message)
          break
        case "token":
          callbacks.onToken?.(event.content)
          break
        case "action_block":
          callbacks.onActionBlock?.(event.action_block, event.trace_id)
          break
        case "awaiting_approval":
          callbacks.onAwaitingApproval?.()
          return
        case "error":
          callbacks.onError?.(event.message)
          return
        case "done":
          callbacks.onDone?.(event.message)
          return
        default:
          break
      }
    }
  }

  callbacks.onError?.("Agent stream ended unexpectedly.")
  throw new Error("Agent stream ended unexpectedly.")
}

export async function streamInvoke(
  body: {
    user_message: string
    channel_id: string
    agent_id: string
    invoker_member_id?: string | null
    thread_id?: string | null
  },
  callbacks: StreamInvokeCallbacks,
): Promise<void> {
  const response = await fetch("/api/invoke/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    let detail = "Agent could not respond. Try again."
    try {
      const json = (await response.json()) as { error?: string; detail?: string }
      detail = json.error || json.detail || detail
    } catch {
      detail = (await response.text()) || detail
    }
    callbacks.onError?.(detail)
    throw new Error(detail)
  }

  await consumeSseStream(response, callbacks)
}

export async function streamActionBlockDecision(
  actionBlockId: string,
  decision: "approved" | "declined",
  memberId: string,
  callbacks: StreamInvokeCallbacks,
): Promise<void> {
  const response = await fetch(`/api/action-blocks/${actionBlockId}/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, member_id: memberId }),
  })

  if (!response.ok) {
    let detail = "Could not submit decision."
    try {
      const json = (await response.json()) as { error?: string; detail?: string }
      detail = json.error || json.detail || detail
    } catch {
      detail = (await response.text()) || detail
    }
    callbacks.onError?.(detail)
    throw new Error(detail)
  }

  await consumeSseStream(response, callbacks)
}
