/** Default avatar for @divv when no custom `avatar_url` is set. */
export const DIVV_DEFAULT_AVATAR_URL = "/agents/divv-avatar.png"

export function resolveAgentAvatarUrl({
  mentionSlug,
  avatarUrl,
  name,
}: {
  mentionSlug?: string | null
  avatarUrl?: string | null
  name?: string | null
}): string | null {
  if (avatarUrl) return avatarUrl
  const slug = mentionSlug?.toLowerCase()
  if (slug === "divv") return DIVV_DEFAULT_AVATAR_URL
  if (name?.toLowerCase() === "divv") return DIVV_DEFAULT_AVATAR_URL
  return null
}
