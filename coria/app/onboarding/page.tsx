import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase-server"
import { fetchUserWorkspaces } from "@/lib/workspace"
import { CreateWorkspaceForm } from "@/components/CreateWorkspaceForm"

export const metadata: Metadata = {
  title: "Create workspace",
}

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const workspaces = await fetchUserWorkspaces(supabase, user.id)
  if (workspaces.length > 0) {
    redirect("/?channel=general")
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create your workspace
          </h1>
          <p className="text-sm text-muted-foreground">
            Set up a workspace to start chatting with your team and AI agents.
          </p>
        </div>
        <CreateWorkspaceForm />
      </div>
    </main>
  )
}
