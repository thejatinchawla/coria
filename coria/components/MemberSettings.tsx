"use client"

import { useCallback, useState } from "react"
import { Trash2, UserPlus } from "lucide-react"
import type { Member, MemberRole, PendingInvite } from "@/types"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/Toast"
import { useConfirm } from "@/components/ConfirmDialog"

export function MemberSettings({
  initialMembers,
  initialInvites,
  currentMemberId,
  currentRole,
}: {
  initialMembers: Member[]
  initialInvites: PendingInvite[]
  currentMemberId: string
  currentRole: MemberRole
}) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [members, setMembers] = useState(initialMembers)
  const [invites, setInvites] = useState(initialInvites)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<MemberRole>("member")
  const [saving, setSaving] = useState(false)

  const isOwner = currentRole === "owner"

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/members")
    if (!res.ok) {
      toast("Could not load members.")
      return
    }
    const json = (await res.json()) as {
      members: Member[]
      pending_invites: PendingInvite[]
    }
    setMembers(json.members ?? [])
    setInvites(json.pending_invites ?? [])
  }, [toast])

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/settings/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast(typeof err.detail === "string" ? err.detail : "Invite failed.")
        return
      }
      setEmail("")
      await load()
      toast("Invite sent.", "success")
    } finally {
      setSaving(false)
    }
  }

  async function changeRole(memberId: string, nextRole: MemberRole) {
    setSaving(true)
    try {
      const res = await fetch(`/api/settings/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      })
      if (!res.ok) {
        toast("Could not update role.")
        return
      }
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function removeMember(memberId: string) {
    const confirmed = await confirm({
      title: "Remove member?",
      description: "They will lose access to this workspace immediately.",
      confirmLabel: "Remove member",
      variant: "destructive",
    })
    if (!confirmed) return
    setSaving(true)
    try {
      const res = await fetch(`/api/settings/members/${memberId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        toast("Could not remove member.")
        return
      }
      await load()
      toast("Member removed.", "success")
    } finally {
      setSaving(false)
    }
  }

  async function revokeInvite(inviteId: string) {
    const confirmed = await confirm({
      title: "Revoke invite?",
      description: "The email link will no longer grant workspace access.",
      confirmLabel: "Revoke invite",
      variant: "destructive",
    })
    if (!confirmed) return
    setSaving(true)
    try {
      const res = await fetch(`/api/settings/members/invites/${inviteId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        toast("Could not revoke invite.")
        return
      }
      await load()
      toast("Invite revoked.", "success")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={(e) => void sendInvite(e)} className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Invite by email</h2>
        <p className="text-xs text-muted-foreground">
          Sends a Supabase Auth invite link (7-day expiry).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="email"
            required
            placeholder="teammate@company.com"
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole)}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            {isOwner && <option value="owner">Owner</option>}
          </select>
        </div>
        <Button type="submit" size="sm" loading={saving}>
          <UserPlus className="mr-1 size-3.5" />
          Send invite
        </Button>
      </form>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Team ({members.length})</h2>
        <p className="text-xs text-muted-foreground">
          Owners and admins can change roles or remove members from the workspace.
        </p>
        <ul className="space-y-2">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {m.display_name}
                  {m.id === currentMemberId && (
                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.email ?? m.user_id}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {m.id !== currentMemberId ? (
                  <>
                    <select
                      className="rounded-md border border-input bg-transparent px-2 py-1 text-xs"
                      value={m.role}
                      disabled={saving || (m.role === "owner" && !isOwner)}
                      onChange={(e) =>
                        void changeRole(m.id, e.target.value as MemberRole)
                      }
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      {isOwner && <option value="owner">Owner</option>}
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      loading={saving}
                      aria-label="Remove member"
                      onClick={() => void removeMember(m.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                ) : (
                  <span className="rounded px-2 py-1 text-xs capitalize text-muted-foreground">
                    {m.role}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {invites.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Pending invites</h2>
          <ul className="space-y-2">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span className="min-w-0 text-muted-foreground">
                  {inv.email} · {inv.role} · expires{" "}
                  {new Date(inv.expires_at).toLocaleDateString()}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-destructive hover:text-destructive"
                  loading={saving}
                  onClick={() => void revokeInvite(inv.id)}
                >
                  <Trash2 className="mr-1 size-3.5" />
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
