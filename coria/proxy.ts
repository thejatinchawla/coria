import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "Proxy: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing",
    )
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    })

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { pathname } = request.nextUrl

    const tokenHash = request.nextUrl.searchParams.get("token_hash")
    const authCode = request.nextUrl.searchParams.get("code")
    if (
      (tokenHash || authCode) &&
      pathname !== "/auth/confirm" &&
      !pathname.startsWith("/auth/callback") &&
      !pathname.startsWith("/api/integrations/github/callback")
    ) {
      const url = request.nextUrl.clone()
      url.pathname = "/auth/confirm"
      if (!url.searchParams.has("next")) {
        url.searchParams.set("next", "/auth/join")
      }
      return NextResponse.redirect(url)
    }

    const isAuthRoute =
      pathname.startsWith("/login") ||
      pathname.startsWith("/auth") ||
      pathname.startsWith("/onboarding")

    if (!user && !isAuthRoute) {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      return NextResponse.redirect(url)
    }

    if (pathname === "/") {
      const dm = request.nextUrl.searchParams.get("dm")?.trim()
      const agent = request.nextUrl.searchParams.get("agent")?.trim()
      const channel = request.nextUrl.searchParams.get("channel")?.trim()
      const stored = dm
        ? `dm:${dm}`
        : agent
          ? `agent:${agent}`
          : channel
            ? `channel:${channel}`
            : null
      if (stored) {
        supabaseResponse.cookies.set("coria_last_channel", stored, {
          path: "/",
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 365,
        })
      }
    }

    // Do not auto-redirect authenticated users away from /login here.
    // Invite links often land on /login#access_token=…; client AuthUrlHandler
    // must finish setSession and route to /auth/join before any server redirect.

    return supabaseResponse
  } catch (error) {
    console.error("Proxy error:", error)
    return NextResponse.next({ request })
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
