import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"

const AUTH_OTP_TYPES = new Set([
  "invite",
  "signup",
  "magiclink",
  "recovery",
  "email",
  "email_change",
])

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  const next = searchParams.get("next") ?? "/auth/join"
  const fromInvite = type === "invite"

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const dest = fromInvite
        ? `/auth/join?from=invite`
        : next.startsWith("/")
          ? next
          : "/auth/join"
      return NextResponse.redirect(`${origin}${dest}`)
    }
  }

  if (tokenHash && type && AUTH_OTP_TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as
        | "invite"
        | "signup"
        | "magiclink"
        | "recovery"
        | "email",
    })
    if (!error) {
      const dest =
        type === "invite" ? `/auth/join?from=invite` : "/auth/join"
      return NextResponse.redirect(`${origin}${dest}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
