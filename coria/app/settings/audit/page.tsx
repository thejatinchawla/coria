import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { createClient } from "@/lib/supabase-server"
import { displayName } from "@/lib/user"
import {
  ensureDemoMember,
  fetchAgents,
  fetchMember,
  fetchWorkspace,
} from "@/lib/workspace"
import { SetupError } from "@/components/SetupError"
import { AuditLogSettings } from "@/components/AuditLogSettings"

export const metadata: Metadata = {
  title: "Audit log",
}

export default async function AuditSettingsPage() {
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

  await ensureDemoMember(supabase, user.id, displayName(user))

  const member = await fetchMember(supabase, workspace.id, user.id)
  if (!member) redirect("/login")

  if (member.role !== "owner" && member.role !== "admin") {
    redirect("/settings/profile")
  }

  const agents = await fetchAgents(supabase, workspace.id)

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <AuditLogSettings workspaceName={workspace.name} agents={agents} />
    </main>
  )
}
