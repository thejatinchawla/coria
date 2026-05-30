import type { Message } from "@/types"

export type StreamInvokeEvent =
  | { type: "status"; message: string }
  | { type: "started"; trace_id: string }
  | { type: "token"; content: string }
  | { type: "error"; message: string }
  | { type: "done"; message: Message; trace_id: string | null }

export type StreamInvokeCallbacks = {
  onStatus?: (message: string) => void
  onToken?: (content: string) => void
  onDone?: (message: Message) => void
  onError?: (message: string) => void
}

export async function streamInvoke(
  body: {
    user_message: string
    channel_id: string
    agent_id: string
  },
  callbacks: StreamInvokeCallbacks,
): Promise<void> {
  const response = await fetch("/api/invoke/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    let detail = "Aria could not respond. Try again."
    try {
      const json = (await response.json()) as { error?: string; detail?: string }
      detail = json.error || json.detail || detail
    } catch {
      detail = (await response.text()) || detail
    }
    callbacks.onError?.(detail)
    throw new Error(detail)
  }

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
      const line = part
        .split("\n")
        .find((l) => l.startsWith("data:"))
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
}
