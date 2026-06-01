import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { createClient } from "@/lib/supabase-server"
import { displayName } from "@/lib/user"
import { ensureDemoMember, fetchWorkspace } from "@/lib/workspace"
import { SetupError } from "@/components/SetupError"
import { IntegrationSettings } from "@/components/IntegrationSettings"
import type { Integration } from "@/types"

export const metadata: Metadata = {
  title: "Integrations",
}

export default async function IntegrationsSettingsPage() {
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

  const { data: integrationRow } = await supabase
    .from("integrations")
    .select("id,workspace_id,provider,status,created_at")
    .eq("workspace_id", workspace.id)
    .eq("provider", "github")
    .maybeSingle()

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <IntegrationSettings
        workspaceName={workspace.name}
        initialIntegration={(integrationRow as Integration | null) ?? null}
      />
    </main>
  )
}
