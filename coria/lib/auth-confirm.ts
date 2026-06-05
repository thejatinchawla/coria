import type { SupabaseClient, User } from "@supabase/supabase-js"

const OTP_TYPES = new Set([
  "invite",
  "signup",
  "magiclink",
  "recovery",
  "email",
  "email_change",
])

export const DEFAULT_POST_LOGIN_PATH = "/?channel=general"

export function inviteJoinPath(next: string | null | undefined) {
  if (next === "/auth/join" || next?.startsWith("/auth/join")) {
    return "/auth/join?from=invite"
  }
  if (next?.startsWith("/")) return next
  return "/auth/join?from=invite"
}

/** Post-auth redirect for /auth/callback and client URL handlers. */
export function authRedirectDestination(
  next: string | null | undefined,
  type?: string | null,
) {
  if (type === "invite") return "/auth/join?from=invite"
  if (type === "signup") return "/onboarding"
  if (next === "/auth/join" || next?.startsWith("/auth/join")) {
    return "/auth/join?from=invite"
  }
  if (next?.startsWith("/")) return next
  if (type === "magiclink" || type === "email") return DEFAULT_POST_LOGIN_PATH
  return DEFAULT_POST_LOGIN_PATH
}

export function buildAuthCallbackRedirect(
  next = DEFAULT_POST_LOGIN_PATH,
  origin?: string,
) {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "")
  const path = `/auth/callback?next=${encodeURIComponent(next)}`
  return base ? `${base}${path}` : path
}

function resolveDestination(search: string, hash: string) {
  const params = new URLSearchParams(search)
  const hashParams = new URLSearchParams(hash.replace(/^#/, ""))
  const type = params.get("type") ?? hashParams.get("type")
  return authRedirectDestination(params.get("next"), type)
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
  const destination = resolveDestination(search, hash)

  const tokenHash = params.get("token_hash")
  const type = params.get("type") ?? hashParams.get("type")
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

export async function userHasWorkspaceMembership(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("[auth] membership check:", error.message)
    return false
  }

  return !!data
}

/** Where to send a signed-in user. invited_at alone is not enough — it never clears. */
export function postAuthPath(user: User, hasMembership: boolean): string {
  if (hasMembership) return "/?channel=general"
  if (user.invited_at) return "/auth/join?from=invite"
  return "/onboarding"
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

let inviteSessionWork: Promise<User | null> | null = null

/** Idempotent invite session setup (safe under React Strict Mode double-mount). */
export function ensureInviteSession(
  supabase: SupabaseClient,
): Promise<User | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null)
  }

  inviteSessionWork ??= (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session?.user) return session.user

    const search = window.location.search
    const hash = window.location.hash

    if (urlHasAuthCredentials(search, hash)) {
      const result = await completeAuthFromUrl(supabase, search, hash)
      if (result.ok) {
        window.history.replaceState(null, "", "/auth/join?from=invite")
      } else {
        console.error("[ensureInviteSession]", result.error)
      }
    }

    return waitForAuthUser(supabase, 25, 400)
  })()

  return inviteSessionWork
}
