import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { createClient } from "@/lib/supabase-server"
import { displayName } from "@/lib/user"
import {
  ensureDemoMember,
  fetchAgents,
  fetchWorkspace,
  fetchWorkspaceSettings,
} from "@/lib/workspace"
import { SetupError } from "@/components/SetupError"
import { AgentSettings } from "@/components/AgentSettings"

export const metadata: Metadata = {
  title: "Agent settings",
}

export default async function AgentSettingsPage() {
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

  const [agents, settings] = await Promise.all([
    fetchAgents(supabase, workspace.id),
    fetchWorkspaceSettings(supabase, workspace.id),
  ])

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <AgentSettings
        workspaceName={workspace.name}
        initialAgents={agents}
        initialSettings={settings}
      />
    </main>
  )
}
