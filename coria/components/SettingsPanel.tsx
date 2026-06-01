"use client"

import { useEffect, useState } from "react"
import type {
  Agent,
  AgentTrigger,
  Channel,
  Integration,
  LlmIntegrationStatus,
  Member,
  MemberRole,
  PendingInvite,
  WorkspaceSettings,
} from "@/types"
import type { SettingsId } from "@/lib/settings-links"
import { ProfileSettings } from "@/components/ProfileSettings"
import { AgentSettings } from "@/components/AgentSettings"
import { MemberSettings } from "@/components/MemberSettings"
import { IntegrationSettings } from "@/components/IntegrationSettings"
import { LlmSettings } from "@/components/LlmSettings"
import { TriggerSettings } from "@/components/TriggerSettings"
import { AuditLogSettings } from "@/components/AuditLogSettings"
import { WorkspaceSettings as WorkspaceDetailsSettings } from "@/components/WorkspaceSettings"
import { SettingsPanelSkeleton, Skeleton } from "@/components/ui/skeleton"
import type { Workspace } from "@/types"

function LoadingPanel() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-40" />
      <SettingsPanelSkeleton />
    </div>
  )
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {message}
    </p>
  )
}

function ProfileSettingsLoader() {
  const [profile, setProfile] = useState<Member | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings/profile")
      if (!res.ok) {
        setError("Could not load profile.")
        return
      }
      const json = (await res.json()) as { profile: Member }
      setProfile(json.profile)
    })()
  }, [])

  if (error) return <ErrorPanel message={error} />
  if (!profile) return <LoadingPanel />
  return <ProfileSettings initialProfile={profile} userId={profile.user_id} />
}

function AgentSettingsLoader() {
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [settings, setSettings] = useState<WorkspaceSettings | null | undefined>(
    undefined,
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const [agentsRes, settingsRes] = await Promise.all([
        fetch("/api/settings/agents"),
        fetch("/api/settings/workspace"),
      ])
      if (!agentsRes.ok || !settingsRes.ok) {
        setError("Could not load agent settings.")
        return
      }
      const agentsJson = (await agentsRes.json()) as { items: Agent[] }
      const settingsJson = (await settingsRes.json()) as {
        settings: WorkspaceSettings
      }
      setAgents(agentsJson.items ?? [])
      setSettings(settingsJson.settings ?? null)
    })()
  }, [])

  if (error) return <ErrorPanel message={error} />
  if (agents === null || settings === undefined) {
    return <LoadingPanel />
  }
  return (
    <AgentSettings initialAgents={agents} initialSettings={settings} />
  )
}

function MemberSettingsLoader() {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [invites, setInvites] = useState<PendingInvite[] | null>(null)
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null)
  const [currentRole, setCurrentRole] = useState<MemberRole | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const [membersRes, profileRes] = await Promise.all([
        fetch("/api/settings/members"),
        fetch("/api/settings/profile"),
      ])

      if (profileRes.ok) {
        const profileJson = (await profileRes.json()) as { profile: Member }
        setCurrentMemberId(profileJson.profile.id)
        setCurrentRole(profileJson.profile.role)
      }

      if (membersRes.status === 403) {
        setError("Admin access is required to manage members.")
        return
      }
      if (!membersRes.ok) {
        setError("Could not load members.")
        return
      }

      const json = (await membersRes.json()) as {
        members: Member[]
        pending_invites: PendingInvite[]
      }
      setMembers(json.members ?? [])
      setInvites(json.pending_invites ?? [])
    })()
  }, [])

  if (error) return <ErrorPanel message={error} />
  if (
    members === null ||
    invites === null ||
    currentMemberId === null ||
    currentRole === null
  ) {
    return <LoadingPanel />
  }

  return (
    <MemberSettings
      initialMembers={members}
      initialInvites={invites}
      currentMemberId={currentMemberId}
      currentRole={currentRole}
    />
  )
}

function IntegrationSettingsLoader({ canManageLlm }: { canManageLlm: boolean }) {
  const [integration, setIntegration] = useState<Integration | null | undefined>(
    undefined,
  )
  const [llmStatus, setLlmStatus] = useState<LlmIntegrationStatus | null | undefined>(
    canManageLlm ? undefined : null,
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const requests: Promise<Response>[] = [
        fetch("/api/settings/integrations/github"),
      ]
      if (canManageLlm) {
        requests.push(fetch("/api/settings/integrations/llm"))
      }

      const [githubRes, llmRes] = await Promise.all(requests)

      if (!githubRes.ok) {
        setError("Could not load integrations.")
        return
      }
      const githubJson = (await githubRes.json()) as {
        integration: Integration | null
      }
      setIntegration(githubJson.integration)

      if (canManageLlm && llmRes) {
        if (llmRes.status === 403) {
          setLlmStatus(null)
          return
        }
        if (!llmRes.ok) {
          setError("Could not load LLM settings.")
          return
        }
        setLlmStatus((await llmRes.json()) as LlmIntegrationStatus)
      }
    })()
  }, [canManageLlm])

  if (error) return <ErrorPanel message={error} />
  if (integration === undefined || (canManageLlm && llmStatus === undefined)) {
    return <LoadingPanel />
  }

  return (
    <div className="space-y-8">
      {canManageLlm && llmStatus && <LlmSettings initialStatus={llmStatus} />}
      <IntegrationSettings initialIntegration={integration} />
    </div>
  )
}

function TriggerSettingsLoader({
  agents,
  channels,
}: {
  agents: Agent[]
  channels: Channel[]
}) {
  const [triggers, setTriggers] = useState<AgentTrigger[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings/triggers")
      if (!res.ok) {
        setError("Could not load triggers.")
        return
      }
      const json = (await res.json()) as { items: AgentTrigger[] }
      setTriggers(json.items ?? [])
    })()
  }, [])

  if (error) return <ErrorPanel message={error} />
  if (triggers === null) return <LoadingPanel />
  return (
    <TriggerSettings
      initialTriggers={triggers}
      agents={agents}
      channels={channels}
    />
  )
}

function AuditSettingsLoader({
  agents,
}: {
  agents: Agent[]
}) {
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings/profile")
      if (!res.ok) {
        setAllowed(false)
        return
      }
      const json = (await res.json()) as { profile: Member }
      setAllowed(
        json.profile.role === "owner" || json.profile.role === "admin",
      )
    })()
  }, [])

  if (allowed === null) return <LoadingPanel />
  if (!allowed) {
    return <ErrorPanel message="Admin access is required to view the audit log." />
  }
  return <AuditLogSettings agents={agents} />
}

function WorkspaceSettingsLoader() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [role, setRole] = useState<MemberRole | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const [workspaceRes, profileRes] = await Promise.all([
        fetch("/api/workspaces"),
        fetch("/api/settings/profile"),
      ])
      if (!workspaceRes.ok || !profileRes.ok) {
        setError("Could not load workspace.")
        return
      }
      const workspaceJson = (await workspaceRes.json()) as {
        workspaces: Workspace[]
        active_workspace_id: string | null
      }
      const profileJson = (await profileRes.json()) as { profile: Member }
      const active =
        workspaceJson.workspaces.find(
          (w) => w.id === workspaceJson.active_workspace_id,
        ) ?? workspaceJson.workspaces[0] ??
        null
      setWorkspace(active)
      setRole(profileJson.profile.role)
    })()
  }, [])

  if (error) return <ErrorPanel message={error} />
  if (!workspace || !role) return <LoadingPanel />

  return (
    <WorkspaceDetailsSettings
      initialWorkspace={workspace}
      canEdit={role === "owner"}
      canManage={role === "owner" || role === "admin"}
    />
  )
}

export function SettingsPanel({
  section,
  agents,
  channels,
  memberRole,
}: {
  section: SettingsId
  agents: Agent[]
  channels: Channel[]
  memberRole: MemberRole
}) {
  const canManageLlm = memberRole === "owner" || memberRole === "admin"

  switch (section) {
    case "workspace":
      return <WorkspaceSettingsLoader />
    case "profile":
      return <ProfileSettingsLoader />
    case "agents":
      return <AgentSettingsLoader />
    case "members":
      return <MemberSettingsLoader />
    case "integrations":
      return <IntegrationSettingsLoader canManageLlm={canManageLlm} />
    case "triggers":
      return <TriggerSettingsLoader agents={agents} channels={channels} />
    case "audit":
      return <AuditSettingsLoader agents={agents} />
  }
}
