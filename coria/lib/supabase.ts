import { createBrowserClient } from "@supabase/ssr"
import { parse, serialize } from "cookie"

function browserCookies() {
  return {
    getAll() {
      const parsed = parse(document.cookie)
      return Object.keys(parsed).map((name) => ({
        name,
        value: parsed[name] ?? "",
      }))
    },
    setAll(
      cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[],
    ) {
      cookiesToSet.forEach(({ name, value, options }) => {
        document.cookie = serialize(name, value, {
          path: "/",
          sameSite: "lax",
          ...(options as Parameters<typeof serialize>[2]),
        })
      })
    },
  }
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: typeof window !== "undefined" ? browserCookies() : undefined,
    },
  )
}
