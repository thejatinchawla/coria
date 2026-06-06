import {
  type ChatLocation,
  chatLocationStorageKey,
  parseChatLocation,
  parseChatLocationStorageKey,
} from "@/lib/chat-location"

export const LAST_CHANNEL_KEY = "coria_last_channel"
export const LAST_CHANNEL_COOKIE = LAST_CHANNEL_KEY

export function readStoredChatLocation(): ChatLocation {
  if (typeof window === "undefined") {
    return { kind: "channel", slug: "general" }
  }
  const fromSession = parseChatLocationStorageKey(
    sessionStorage.getItem(LAST_CHANNEL_KEY),
  )
  if (fromSession) return fromSession
  const fromUrl = parseChatLocation(
    Object.fromEntries(new URLSearchParams(window.location.search)),
  )
  return fromUrl ?? { kind: "channel", slug: "general" }
}

/** @deprecated Use readStoredChatLocation */
export function readStoredChannelSlug(): string {
  const location = readStoredChatLocation()
  return location.kind === "channel" ? location.slug : "general"
}

export function writeStoredChatLocation(location: ChatLocation) {
  if (typeof window === "undefined") return
  const key = chatLocationStorageKey(location)
  sessionStorage.setItem(LAST_CHANNEL_KEY, key)
  document.cookie = `${LAST_CHANNEL_COOKIE}=${encodeURIComponent(key)};path=/;max-age=31536000;samesite=lax`
}

export function writeStoredChannelSlug(slug: string) {
  writeStoredChatLocation({ kind: "channel", slug })
}
