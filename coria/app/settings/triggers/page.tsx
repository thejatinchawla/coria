import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { createClient } from "@/lib/supabase-server"
import { displayName } from "@/lib/user"
import {
  ensureDemoMember,
  fetchAgents,
  fetchChannels,
  fetchWorkspace,
} from "@/lib/workspace"
import { SetupError } from "@/components/SetupError"
import { TriggerSettings } from "@/components/TriggerSettings"
import type { AgentTrigger } from "@/types"

export const metadata: Metadata = {
  title: "Triggers",
}

export default async function TriggersSettingsPage() {
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

  const [agents, channels, triggersResult] = await Promise.all([
    fetchAgents(supabase, workspace.id),
    fetchChannels(supabase, workspace.id),
    supabase
      .from("agent_triggers")
      .select(
        "id,workspace_id,agent_id,channel_id,type,config,enabled,last_run_at,created_at",
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: true }),
  ])

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <TriggerSettings
        workspaceName={workspace.name}
        initialTriggers={(triggersResult.data ?? []) as AgentTrigger[]}
        agents={agents}
        channels={channels}
      />
    </main>
  )
}
