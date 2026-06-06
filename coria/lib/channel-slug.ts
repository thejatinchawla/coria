export const LAST_CHANNEL_KEY = "coria_last_channel"
export const LAST_CHANNEL_COOKIE = LAST_CHANNEL_KEY

export function readStoredChannelSlug(): string {
  if (typeof window === "undefined") return "general"
  return sessionStorage.getItem(LAST_CHANNEL_KEY)?.trim() || "general"
}

export function readUrlChannelSlug(): string {
  if (typeof window === "undefined") return "general"
  return (
    new URLSearchParams(window.location.search).get("channel")?.trim() ||
    "general"
  )
}

export function writeStoredChannelSlug(slug: string) {
  if (typeof window === "undefined") return
  sessionStorage.setItem(LAST_CHANNEL_KEY, slug)
  document.cookie = `${LAST_CHANNEL_COOKIE}=${encodeURIComponent(slug)};path=/;max-age=31536000;samesite=lax`
}
