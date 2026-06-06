"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase"
import {
  authRedirectDestination,
  completeAuthFromUrl,
  postAuthPath,
  urlHasAuthCredentials,
  userHasWorkspaceMembership,
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
          window.history.replaceState(null, "", "/auth/confirm")
          router.replace(result.destination)
          return
        }
        const message = result.error.includes("PKCE code verifier")
          ? "Open the sign-in link in the same browser where you requested it. If it still fails, request a new link from the login page."
          : result.error
        setError(message)
        return
      }

      const user = await waitForAuthUser(supabase)
      if (user) {
        const hasMembership = await userHasWorkspaceMembership(supabase, user.id)
        router.replace(
          hasMembership
            ? postAuthPath(user, true)
            : authRedirectDestination(
                searchParams.get("next"),
                searchParams.get("type"),
              ),
        )
        return
      }

      setError("Could not verify your sign-in link. Request a new one from the login page.")
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
      Confirming sign-in…
    </div>
  )
}

export default function AuthConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
          Confirming sign-in…
        </div>
      }
    >
      <AuthConfirmInner />
    </Suspense>
  )
}
