"use client"

import { useMemo, useState } from "react"
import { Bot, Trash2, UserPlus, Users } from "lucide-react"
import { AddChannelMemberDialog } from "@/components/AddChannelMemberDialog"
import { Button } from "@/components/ui/button"
import { AgentAiBadge } from "@/components/AgentAiBadge"
import { AgentAvatar } from "@/components/AgentAvatar"
import { MemberAvatar } from "@/components/MemberAvatar"
import { AgentProfileContent, ProfileHoverCard } from "@/components/ProfileHoverCard"
import type { Agent, ChannelType, Member, MemberRole } from "@/types"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/Toast"
import { useConfirm } from "@/components/ConfirmDialog"

const ROLE_ORDER: Record<MemberRole, number> = {
  owner: 0,
  admin: 1,
  member: 2,
}

function sortMembers(members: Member[]): Member[] {
  return [...members].sort((a, b) => {
    const roleDiff = ROLE_ORDER[a.role] - ROLE_ORDER[b.role]
    if (roleDiff !== 0) return roleDiff
    return a.display_name.localeCompare(b.display_name, undefined, {
      sensitivity: "base",
    })
  })
}

function sortAgents(agents: Agent[]): Agent[] {
  return [...agents].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  )
}

function formatRole(role: MemberRole) {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function MemberRow({
  member,
  canRemove,
  removing,
  onRemove,
}: {
  member: Member
  canRemove: boolean
  removing: boolean
  onRemove: () => void
}) {
  return (
    <li
      className={cn(
        "group/member flex items-center gap-3 rounded-lg px-2 py-2.5",
        "hover:bg-muted/60",
      )}
    >
      <MemberAvatar member={member} displayName={member.display_name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{member.display_name}</p>
        <p className="text-xs text-muted-foreground">{formatRole(member.role)}</p>
      </div>
      {canRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          loading={removing}
          aria-label={`Remove ${member.display_name} from channel`}
          onClick={onRemove}
          className="shrink-0 text-muted-foreground opacity-100 hover:text-destructive md:opacity-0 md:group-hover/member:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </li>
  )
}

function AgentRow({ agent }: { agent: Agent }) {
  return (
    <li>
      <ProfileHoverCard
        content={<AgentProfileContent agent={agent} fallbackName={agent.name} />}
      >
        <div
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left",
            "hover:bg-muted/60",
          )}
        >
          <AgentAvatar
            name={agent.name}
            mentionSlug={agent.mention_slug}
            color={agent.color}
            avatarUrl={agent.avatar_url}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{agent.name}</p>
              <AgentAiBadge compact />
            </div>
            <p className="text-xs text-muted-foreground">@{agent.mention_slug}</p>
          </div>
          {agent.status === "paused" && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Paused
            </span>
          )}
        </div>
      </ProfileHoverCard>
    </li>
  )
}

function Section({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="py-4">
      <h2 className="mb-2 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title} · {count}
      </h2>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  )
}

export function ChannelMembersView({
  channelId,
  workspaceId,
  channelSlug,
  members,
  agents,
  channelType,
  memberRole,
  currentMemberId,
  loading = false,
  canAddMembers = true,
  onMembersChange,
}: {
  channelId: string
  workspaceId: string
  channelSlug: string
  members: Member[]
  agents: Agent[]
  channelType: ChannelType
  memberRole: MemberRole
  currentMemberId: string | null
  loading?: boolean
  canAddMembers?: boolean
  onMembersChange?: (members: Member[]) => void
}) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const isGeneral = channelSlug === "general"
  const isAdmin = memberRole === "owner" || memberRole === "admin"
  const showAddMembers = canAddMembers && !isGeneral
  const canRemoveMembers = isAdmin && !isGeneral
  const [addOpen, setAddOpen] = useState(false)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)
  const channelMemberIds = useMemo(
    () => new Set(members.map((member) => member.id)),
    [members],
  )
  const sortedMembers = sortMembers(members)
  const sortedAgents = sortAgents(agents)
  const showAgents = channelType === "hybrid" && sortedAgents.length > 0
  const totalCount = sortedMembers.length + (showAgents ? sortedAgents.length : 0)

  async function removeMember(member: Member) {
    const confirmed = await confirm({
      title: "Remove from channel?",
      description: `${member.display_name} will lose access to this channel. They remain in the workspace.`,
      confirmLabel: "Remove from channel",
      variant: "destructive",
    })
    if (!confirmed) return

    setRemovingMemberId(member.id)
    try {
      const res = await fetch(
        `/api/channels/${channelId}/members/${member.id}`,
        { method: "DELETE" },
      )
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        toast(json.error ?? "Could not remove member from channel.")
        return
      }
      const json = (await res.json()) as { members: Member[] }
      onMembersChange?.(json.members ?? [])
      toast(`${member.display_name} removed from channel.`, "success")
    } finally {
      setRemovingMemberId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center text-sm text-muted-foreground">
        Loading members…
      </div>
    )
  }

  if (totalCount === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted">
          <Users className="size-6 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm font-semibold">No members yet</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          {isGeneral
            ? "Everyone in the workspace is added to #general automatically."
            : "Add teammates from your workspace to collaborate in this channel."}
        </p>
        {showAddMembers && (
          <Button
            type="button"
            className="mt-4"
            variant="outline"
            onClick={() => setAddOpen(true)}
          >
            <UserPlus className="size-4" />
            Add teammate
          </Button>
        )}
        <AddChannelMemberDialog
          open={addOpen}
          channelId={channelId}
          workspaceId={workspaceId}
          channelMemberIds={channelMemberIds}
          onClose={() => setAddOpen(false)}
          onAdded={(next) => {
            onMembersChange?.(next)
            setAddOpen(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-3 sm:px-6">
        <div className="flex flex-col gap-2 border-b py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <p className="text-sm text-muted-foreground">
          {sortedMembers.length} teammate{sortedMembers.length === 1 ? "" : "s"}
          {showAgents
            ? ` · ${sortedAgents.length} agent${sortedAgents.length === 1 ? "" : "s"}`
            : ""}{" "}
            in this channel
          </p>
          {showAddMembers && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAddOpen(true)}
            >
              <UserPlus className="size-4" />
              Add
            </Button>
          )}
        </div>

        {sortedMembers.length > 0 && (
          <Section title="Team" count={sortedMembers.length}>
            {sortedMembers.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                canRemove={
                  canRemoveMembers &&
                  member.id !== currentMemberId
                }
                removing={removingMemberId === member.id}
                onRemove={() => void removeMember(member)}
              />
            ))}
          </Section>
        )}

        {showAgents && (
          <Section title="Agents" count={sortedAgents.length}>
            {sortedAgents.map((agent) => (
              <AgentRow key={agent.id} agent={agent} />
            ))}
          </Section>
        )}

        {channelType === "human_only" && (
          <p className="flex items-center gap-2 px-2 pb-6 text-xs text-muted-foreground">
            <Bot className="size-3.5 shrink-0" />
            Agents cannot post in humans-only channels.
          </p>
        )}
      </div>

      {showAddMembers && (
        <AddChannelMemberDialog
          open={addOpen}
          channelId={channelId}
          workspaceId={workspaceId}
          channelMemberIds={channelMemberIds}
          onClose={() => setAddOpen(false)}
          onAdded={(next) => {
            onMembersChange?.(next)
            setAddOpen(false)
          }}
        />
      )}
    </div>
  )
}
