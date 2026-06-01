"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase"
import {
  completeAuthFromUrl,
  inviteJoinPath,
  urlHasAuthCredentials,
  waitForAuthUser,
} from "@/lib/auth-confirm"
import { Button } from "@/components/ui/button"

function AuthConfirmInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const supabase = createClient()
      const search = window.location.search
      const hash = window.location.hash

      if (urlHasAuthCredentials(search, hash)) {
        const result = await completeAuthFromUrl(supabase, search, hash)
        if (result.ok) {
          window.history.replaceState(null, "", result.destination)
          router.replace(result.destination)
          return
        }
        setError(result.error)
        return
      }

      const user = await waitForAuthUser(supabase)
      if (user) {
        router.replace(inviteJoinPath(searchParams.get("next")))
        return
      }

      setError("Could not verify your invite link. Ask your admin to resend it.")
    })()
  }, [router, searchParams])

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={() => router.push("/login?error=auth")}>
          Back to sign in
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
      Confirming invite…
    </div>
  )
}

export default function AuthConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
          Confirming invite…
        </div>
      }
    >
      <AuthConfirmInner />
    </Suspense>
  )
}
