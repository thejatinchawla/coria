import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { createClient } from "@/lib/supabase-server"
import { displayName } from "@/lib/user"
import { backendHeaders, backendUrl } from "@/lib/backend-proxy"
import {
  ensureDemoMember,
  fetchMember,
  fetchWorkspace,
} from "@/lib/workspace"
import { SetupError } from "@/components/SetupError"
import { MemberSettings } from "@/components/MemberSettings"
import type { Member, PendingInvite } from "@/types"

export const metadata: Metadata = {
  title: "Members",
}

export default async function MembersSettingsPage() {
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

  const response = await fetch(
    backendUrl(
      `/members?workspace_id=${workspace.id}&member_id=${member.id}`,
    ),
    { headers: backendHeaders(), cache: "no-store" },
  )

  let members: Member[] = []
  let invites: PendingInvite[] = []
  if (response.ok) {
    const json = (await response.json()) as {
      members: Member[]
      pending_invites: PendingInvite[]
    }
    members = json.members ?? []
    invites = json.pending_invites ?? []
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <MemberSettings
        workspaceName={workspace.name}
        initialMembers={members}
        initialInvites={invites}
        currentMemberId={member.id}
        currentRole={member.role}
      />
    </main>
  )
}
