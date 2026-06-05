import { createServerClient } from "@supabase/ssr"
import { NextRequest, NextResponse } from "next/server"
import { authRedirectDestination } from "@/lib/auth-confirm"

const AUTH_OTP_TYPES = new Set([
  "invite",
  "signup",
  "magiclink",
  "recovery",
  "email",
  "email_change",
])

function redirectOrigin(request: NextRequest, fallback: string) {
  const forwardedHost = request.headers.get("x-forwarded-host")
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https"
  if (forwardedHost && process.env.NODE_ENV === "production") {
    return `${forwardedProto}://${forwardedHost}`
  }
  return fallback
}

function createSupabaseForResponse(
  request: NextRequest,
  response: NextResponse,
) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    },
  )
}

function clientConfirmFallback(
  baseOrigin: string,
  request: NextRequest,
): NextResponse {
  const confirm = new URL(`${baseOrigin}/auth/confirm`)
  for (const key of ["next", "code", "token_hash", "type"]) {
    const value = request.nextUrl.searchParams.get(key)
    if (value) confirm.searchParams.set(key, value)
  }
  return NextResponse.redirect(confirm.toString())
}

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url)
  const baseOrigin = redirectOrigin(request, origin)
  const code = request.nextUrl.searchParams.get("code")
  const tokenHash = request.nextUrl.searchParams.get("token_hash")
  const type = request.nextUrl.searchParams.get("type")
  const next = request.nextUrl.searchParams.get("next")
  const destination = authRedirectDestination(next, type)

  if (code) {
    const response = NextResponse.redirect(`${baseOrigin}${destination}`)
    const supabase = createSupabaseForResponse(request, response)
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return response
    }

    console.error("[auth/callback] exchangeCodeForSession:", error.message)
    return clientConfirmFallback(baseOrigin, request)
  }

  if (tokenHash && type && AUTH_OTP_TYPES.has(type)) {
    const response = NextResponse.redirect(`${baseOrigin}${destination}`)
    const supabase = createSupabaseForResponse(request, response)
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

    if (!error) {
      return response
    }

    console.error("[auth/callback] verifyOtp:", error.message)
    return clientConfirmFallback(baseOrigin, request)
  }

  return clientConfirmFallback(baseOrigin, request)
}
