import { cache } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase-server"
import { displayName } from "@/lib/user"
import {
  fetchAgents,
  fetchChannels,
  fetchMember,
  fetchUserWorkspaces,
  fetchWorkspace,
} from "@/lib/workspace"
import { getActiveWorkspaceIdFromCookie } from "@/lib/workspace-cookie"
import type { Agent, Channel, Member, MemberRole, Workspace } from "@/types"

export type WorkspaceShellContext = {
  workspace: Workspace
  workspaces: Workspace[]
  member: Member
  memberRole: MemberRole
  memberId: string | null
  channels: Channel[]
  agents: Agent[]
  userEmail: string
  userDisplayName: string
}

export const loadWorkspaceShellContext = cache(
  async (): Promise<WorkspaceShellContext> => {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) redirect("/login")

    const userDisplayName = displayName(user)
    const workspaces = await fetchUserWorkspaces(supabase, user.id)
    const activeWorkspaceId = await getActiveWorkspaceIdFromCookie()

    if (workspaces.length === 0) {
      if (user.invited_at) {
        redirect("/auth/join?from=invite")
      }
      redirect("/onboarding")
    }

    const workspace = await fetchWorkspace(supabase, user.id, activeWorkspaceId)
    if (!workspace) {
      redirect("/onboarding")
    }

    const member = await fetchMember(supabase, workspace.id, user.id)
    if (!member) {
      redirect("/onboarding")
    }

    const memberId = member.id

    const [channels, agents] = await Promise.all([
      fetchChannels(supabase, workspace.id, memberId),
      fetchAgents(supabase, workspace.id),
    ])

    return {
      workspace,
      workspaces,
      member,
      memberRole: member.role,
      memberId,
      channels,
      agents,
      userEmail: user.email ?? "",
      userDisplayName,
    }
  },
)
