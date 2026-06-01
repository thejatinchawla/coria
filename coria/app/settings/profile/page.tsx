import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { createClient } from "@/lib/supabase-server"
import { displayName } from "@/lib/user"
import {
  ensureDemoMember,
  fetchMember,
  fetchWorkspace,
} from "@/lib/workspace"
import { SetupError } from "@/components/SetupError"
import { ProfileSettings } from "@/components/ProfileSettings"

export const metadata: Metadata = {
  title: "Profile",
}

export default async function ProfileSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const workspace = await fetchWorkspace(supabase)
  if (!workspace) {
    return (
      <SetupError
        title="Workspace not set up"
        message="Could not load the Coria Demo workspace."
      />
    )
  }

  const memberResult = await ensureDemoMember(
    supabase,
    user.id,
    displayName(user),
  )
  if (!memberResult.ok) {
    return (
      <SetupError
        title="Could not join workspace"
        message={memberResult.error}
      />
    )
  }

  const member = await fetchMember(supabase, workspace.id, user.id)
  if (!member) redirect("/login")

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <ProfileSettings
        workspaceName={workspace.name}
        initialProfile={member}
        userId={user.id}
      />
    </main>
  )
}
