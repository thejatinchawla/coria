"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { completeAuthFromUrl, urlHasAuthCredentials } from "@/lib/auth-confirm"

/**
 * Supabase email invites often redirect with tokens in the URL hash
 * (e.g. /login#access_token=…&type=invite). Hashes never reach the server.
 */
export function AuthUrlHandler() {
  const router = useRouter()
  const [active, setActive] = useState(false)

  useEffect(() => {
    const search = window.location.search
    const hash = window.location.hash
    if (!urlHasAuthCredentials(search, hash)) return

    setActive(true)

    void (async () => {
      const supabase = createClient()
      const result = await completeAuthFromUrl(supabase, search, hash)

      if (result.ok) {
        window.history.replaceState(null, "", result.destination)
        router.replace(result.destination)
        return
      }

      console.error("[AuthUrlHandler]", result.error)
      setActive(false)
    })()
  }, [router])

  if (!active) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background text-sm text-muted-foreground">
      Completing sign-in…
    </div>
  )
}
