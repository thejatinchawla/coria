export function formatRelativeTime(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""

  const diffSec = Math.round((nowMs - then) / 1000)
  if (diffSec < 60) return "just now"

  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`

  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

type MessageGroupFields = {
  created_at: string
  sender_id: string | null
  sender_type: string
}

/** Same sender posting within the same relative-time bucket. */
export function isSameMessageGroup(
  a: MessageGroupFields,
  b: MessageGroupFields,
  nowMs = Date.now(),
): boolean {
  if (a.sender_type !== b.sender_type) return false
  if (a.sender_id !== b.sender_id) return false
  return (
    formatRelativeTime(a.created_at, nowMs) ===
    formatRelativeTime(b.created_at, nowMs)
  )
}

/** Show timestamp only on the last message in a run with the same relative label. */
export function shouldShowMessageTimestamp(
  messages: { created_at: string }[],
  index: number,
  nowMs = Date.now(),
): boolean {
  const current = formatRelativeTime(messages[index]!.created_at, nowMs)
  const next = messages[index + 1]
  if (!next) return true
  return formatRelativeTime(next.created_at, nowMs) !== current
}
