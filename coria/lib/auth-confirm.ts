import type { SupabaseClient } from "@supabase/supabase-js"

const OTP_TYPES = new Set([
  "invite",
  "signup",
  "magiclink",
  "recovery",
  "email",
  "email_change",
])

export function inviteJoinPath(next: string | null | undefined) {
  if (next === "/auth/join" || next?.startsWith("/auth/join")) {
    return "/auth/join?from=invite"
  }
  if (next?.startsWith("/")) return next
  return "/auth/join?from=invite"
}

export function urlHasAuthCredentials(search: string, hash: string) {
  const params = new URLSearchParams(search)
  const hashParams = new URLSearchParams(hash.replace(/^#/, ""))
  return (
    params.has("token_hash") ||
    params.has("code") ||
    hashParams.has("access_token")
  )
}

/** Complete Supabase email / invite auth from URL params (client-side). */
export async function completeAuthFromUrl(
  supabase: SupabaseClient,
  search: string,
  hash: string,
): Promise<{ ok: true; destination: string } | { ok: false; error: string }> {
  const params = new URLSearchParams(search)
  const hashParams = new URLSearchParams(hash.replace(/^#/, ""))
  const destination = inviteJoinPath(params.get("next"))

  const tokenHash = params.get("token_hash")
  const type = params.get("type")
  if (tokenHash && type && OTP_TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as
        | "invite"
        | "signup"
        | "magiclink"
        | "recovery"
        | "email"
        | "email_change",
    })
    if (!error) return { ok: true, destination }
    return { ok: false, error: error.message }
  }

  const code = params.get("code")
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return { ok: true, destination }
    return { ok: false, error: error.message }
  }

  const accessToken = hashParams.get("access_token")
  const refreshToken = hashParams.get("refresh_token")
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (!error) return { ok: true, destination }
    return { ok: false, error: error.message }
  }

  return { ok: false, error: "No auth credentials in URL" }
}

export async function waitForAuthUser(
  supabase: SupabaseClient,
  attempts = 10,
  delayMs = 250,
) {
  for (let i = 0; i < attempts; i++) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) return user
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  return null
}
