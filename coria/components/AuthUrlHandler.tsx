"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { completeAuthFromUrl, urlHasAuthCredentials } from "@/lib/auth-confirm"

/**
 * Handles Supabase auth tokens in the URL hash/query on pages other than
 * /auth/join (that page handles its own invite flow).
 */
export function AuthUrlHandler() {
  const router = useRouter()
  const pathname = usePathname()
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (pathname === "/auth/join" || pathname === "/auth/confirm") return

    const search = window.location.search
    const hash = window.location.hash
    if (!urlHasAuthCredentials(search, hash)) return

    setActive(true)

    void (async () => {
      const supabase = createClient()
      const result = await completeAuthFromUrl(supabase, search, hash)

      if (result.ok) {
        // Always router.replace — replaceState alone updates the URL bar but
        // leaves the wrong page mounted (e.g. login UI at /auth/join).
        router.replace(result.destination)
      } else {
        console.error("[AuthUrlHandler]", result.error)
      }

      setActive(false)
    })()
  }, [pathname, router])

  if (!active) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background text-sm text-muted-foreground">
      Completing sign-in…
    </div>
  )
}
