import { createServerClient } from "@supabase/ssr"
import { NextRequest, NextResponse } from "next/server"
import {
  authRedirectDestination,
  postAuthPath,
  userHasWorkspaceMembership,
} from "@/lib/auth-confirm"

const OTP_TYPES = new Set([
  "invite",
  "signup",
  "magiclink",
  "recovery",
  "email",
  "email_change",
])

export function authRedirectOrigin(request: NextRequest, fallback: string) {
  const forwardedHost = request.headers.get("x-forwarded-host")
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https"
  if (forwardedHost && process.env.NODE_ENV === "production") {
    return `${forwardedProto}://${forwardedHost}`
  }
  return fallback
}

function loginErrorRedirect(baseOrigin: string, message: string) {
  const url = new URL("/login", baseOrigin)
  url.searchParams.set("error", "auth")
  url.searchParams.set("detail", message)
  return NextResponse.redirect(url)
}

function redirectWithCookies(
  baseOrigin: string,
  path: string,
  source: NextResponse,
) {
  const response = NextResponse.redirect(`${baseOrigin}${path}`)
  for (const cookie of source.cookies.getAll()) {
    response.cookies.set(cookie)
  }
  return response
}

export async function handleAuthConfirm(
  request: NextRequest,
): Promise<NextResponse> {
  const { origin } = new URL(request.url)
  const baseOrigin = authRedirectOrigin(request, origin)
  const code = request.nextUrl.searchParams.get("code")
  const tokenHash = request.nextUrl.searchParams.get("token_hash")
  const type = request.nextUrl.searchParams.get("type")
  const next = request.nextUrl.searchParams.get("next")

  const provisionalDestination = authRedirectDestination(next, type)
  let response = NextResponse.redirect(`${baseOrigin}${provisionalDestination}`)

  const supabase = createServerClient(
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

    if (error) {
      console.error("[auth] verifyOtp:", error.message)
      return loginErrorRedirect(baseOrigin, error.message)
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const destination = user
      ? postAuthPath(
          user,
          await userHasWorkspaceMembership(supabase, user.id),
        )
      : provisionalDestination

    if (destination !== provisionalDestination) {
      response = redirectWithCookies(baseOrigin, destination, response)
    }
    return response
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error("[auth] exchangeCodeForSession:", error.message)
      return loginErrorRedirect(baseOrigin, error.message)
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const destination = user
      ? postAuthPath(
          user,
          await userHasWorkspaceMembership(supabase, user.id),
        )
      : provisionalDestination

    if (destination !== provisionalDestination) {
      response = redirectWithCookies(baseOrigin, destination, response)
    }
    return response
  }

  return loginErrorRedirect(baseOrigin, "Missing auth credentials in link.")
}
