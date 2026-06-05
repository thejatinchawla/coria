"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import {
  buildAuthCallbackRedirect,
  postAuthPath,
  urlHasAuthCredentials,
  userHasWorkspaceMembership,
} from "@/lib/auth-confirm"
import { LoadingButton } from "@/components/ui/loading-button"
import { Button } from "@/components/ui/button"

export function LoginForm({ authError }: { authError?: boolean }) {
  const router = useRouter()

  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [signInMethod, setSignInMethod] = useState<"password" | "link">("link")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(
    authError
      ? "Could not complete sign-in. Open the invite link from your email again, or sign in below."
      : null,
  )

  useEffect(() => {
    const { pathname, search, hash } = window.location
    if (pathname !== "/login") {
      router.replace(`${pathname}${search}${hash}`)
      return
    }

    if (urlHasAuthCredentials(search, hash)) return

    void (async () => {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.user) return

      const hasMembership = await userHasWorkspaceMembership(
        supabase,
        session.user.id,
      )
      router.replace(postAuthPath(session.user, hasMembership))
    })()
  }, [router])

  async function handleMagicLink() {
    const trimmed = email.trim()
    if (!trimmed) {
      setMessage("Enter your email address.")
      return
    }

    setLoading(true)
    setMessage(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: buildAuthCallbackRedirect(),
      },
    })

    setLoading(false)
    if (error) {
      setMessage(error.message)
      return
    }

    setMessage(`We sent a sign-in link to ${trimmed}. Open it on this device to continue.`)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (mode === "signin" && signInMethod === "link") {
      await handleMagicLink()
      return
    }

    setLoading(true)
    setMessage(null)

    const supabase = createClient()

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: buildAuthCallbackRedirect("/onboarding"),
        },
      })
      setLoading(false)
      if (error) {
        setMessage(error.message)
        return
      }
      setMessage("Check your email to confirm your account, then sign in.")
      setMode("signin")
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setMessage(error.message)
      return
    }
    router.push("/")
  }

  const showPassword = mode === "signup" || signInMethod === "password"

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Coria</h1>
          <p className="text-sm text-muted-foreground">
            Team chat where AI agents act — with your team&apos;s permission.
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>

          {showPassword && (
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
          )}

          {message && (
            <p className="text-sm text-muted-foreground">{message}</p>
          )}

          <LoadingButton type="submit" className="w-full" loading={loading}>
            {mode === "signup"
              ? "Create account"
              : signInMethod === "link"
                ? "Email me a sign-in link"
                : "Sign in"}
          </LoadingButton>

          {mode === "signin" && (
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => {
                setSignInMethod(signInMethod === "link" ? "password" : "link")
                setMessage(null)
                setPassword("")
              }}
            >
              {signInMethod === "link"
                ? "Sign in with password instead"
                : "Email me a sign-in link instead"}
            </Button>
          )}
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {mode === "signin" ? "No account?" : "Already have one?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin")
              setSignInMethod("link")
              setMessage(null)
            }}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  )
}
