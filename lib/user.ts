import type { User } from "@supabase/supabase-js"

export function displayName(user: User): string {
  const meta = user.user_metadata ?? {}
  const fromMeta =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name)
  if (fromMeta) return fromMeta
  if (user.email) return user.email.split("@")[0] ?? "User"
  return "User"
}
