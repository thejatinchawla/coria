"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase"
import {
  completeAuthFromUrl,
  urlHasAuthCredentials,
  waitForAuthUser,
} from "@/lib/auth-confirm"
import { displayName } from "@/lib/user"
import { LoadingButton } from "@/components/ui/loading-button"
import { Button } from "@/components/ui/button"

export function JoinWorkspace() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromInvite = searchParams.get("from") === "invite"

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    function showInvitePassword(user: User) {
      if (cancelled) return
      setEmail(user.email ?? null)
      if (!fromInvite) {
        router.replace("/onboarding")
        return
      }
      setNeedsPassword(true)
      setLoading(false)
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && fromInvite) {
        showInvitePassword(session.user)
      }
    })

    void (async () => {
      const search = window.location.search
      const hash = window.location.hash

      if (urlHasAuthCredentials(search, hash)) {
        const result = await completeAuthFromUrl(supabase, search, hash)
        if (cancelled) return

        if (result.ok) {
          window.history.replaceState(null, "", "/auth/join?from=invite")
        } else {
          console.error("[join] completeAuthFromUrl:", result.error)
        }
      }

      const user = await waitForAuthUser(supabase, 15, 300)
      if (cancelled) return

      if (user) {
        showInvitePassword(user)
        return
      }

      router.replace("/login?error=auth")
    })()

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [fromInvite, router])

  async function finishJoin(
    supabase: ReturnType<typeof createClient>,
    user: User,
  ) {
    const name = displayName(user)

    const { data: workspaceId, error: inviteError } = await supabase.rpc(
      "accept_workspace_invite",
      { p_display_name: name },
    )
    if (inviteError) {
      console.error("[join] accept_workspace_invite:", inviteError.message)
    }

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()

    if (memberError) {
      setError(memberError.message)
      setLoading(false)
      return
    }

    if (!member) {
      setError(
        "No workspace membership found. Ask your admin to resend the invite.",
      )
      setLoading(false)
      return
    }

    const activeId = (workspaceId as string | null) ?? member.workspace_id
    await fetch("/api/workspaces/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: activeId }),
    })

    router.replace("/?channel=general")
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { error: pwError } = await supabase.auth.updateUser({ password })
    if (pwError) {
      setError(pwError.message)
      setSaving(false)
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.replace("/login?error=auth")
      return
    }

    await finishJoin(supabase, user)
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        Completing sign-in…
      </div>
    )
  }

  if (needsPassword) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              Welcome to Coria
            </h1>
            <p className="text-sm text-muted-foreground">
              {email
                ? `You were invited as ${email}. Set a password to finish.`
                : "Set a password to finish joining the workspace."}
            </p>
          </div>

          <form onSubmit={(e) => void handleSetPassword(e)} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="confirm-password" className="text-sm font-medium">
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <LoadingButton type="submit" className="w-full" loading={saving}>
              Join workspace
            </LoadingButton>
          </form>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={() => router.push("/login")}>
          Back to sign in
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
      Joining workspace…
    </div>
  )
}
