"use client"

import { useEffect, useMemo, useState } from "react"
import { X } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { MemberAvatar } from "@/components/MemberAvatar"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { useToast } from "@/components/Toast"
import type { Member } from "@/types"
import { cn } from "@/lib/utils"

function formatRole(role: Member["role"]) {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

export function AddChannelMemberDialog({
  open,
  channelId,
  workspaceId,
  channelMemberIds,
  onClose,
  onAdded,
}: {
  open: boolean
  channelId: string
  workspaceId: string
  channelMemberIds: Set<string>
  onClose: () => void
  onAdded: (members: Member[]) => void
}) {
  const { toast } = useToast()
  const [workspaceMembers, setWorkspaceMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!open) return
    setQuery("")
    setLoading(true)
    void (async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("members")
        .select(
          "id,workspace_id,user_id,display_name,role,avatar_url,bio,created_at",
        )
        .eq("workspace_id", workspaceId)
        .order("display_name", { ascending: true })

      if (error) {
        toast("Could not load teammates.")
        setWorkspaceMembers([])
      } else {
        setWorkspaceMembers((data as Member[]) ?? [])
      }
      setLoading(false)
    })()
  }, [open, workspaceId, toast])

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return workspaceMembers
      .filter((member) => !channelMemberIds.has(member.id))
      .filter((member) =>
        q ? member.display_name.toLowerCase().includes(q) : true,
      )
  }, [workspaceMembers, channelMemberIds, query])

  async function addMember(member: Member) {
    if (addingId) return
    setAddingId(member.id)
    try {
      const res = await fetch(`/api/channels/${channelId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: member.id }),
      })
      const json = (await res.json()) as {
        error?: string
        members?: Member[]
      }
      if (!res.ok) {
        toast(json.error ?? "Could not add teammate.")
        return
      }
      toast(`${member.display_name} added to the channel.`, "success")
      onAdded(json.members ?? [])
    } finally {
      setAddingId(null)
    }
  }

  if (!open) return null

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/40"
        aria-label="Close add member dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-channel-member-title"
        className="fixed top-1/2 left-1/2 z-50 flex max-h-[min(32rem,85vh)] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-background shadow-lg"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 id="add-channel-member-title" className="text-sm font-semibold">
            Add to channel
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="border-b px-4 py-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teammates…"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
            autoFocus
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Loading teammates…
            </p>
          ) : candidates.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {workspaceMembers.length === channelMemberIds.size
                ? "Everyone in the workspace is already here."
                : "No teammates match your search."}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {candidates.map((member) => (
                <li
                  key={member.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-2 py-2",
                    "hover:bg-muted/60",
                  )}
                >
                  <MemberAvatar
                    member={member}
                    displayName={member.display_name}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {member.display_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatRole(member.role)}
                    </p>
                  </div>
                  <LoadingButton
                    type="button"
                    size="sm"
                    variant="outline"
                    loading={addingId === member.id}
                    onClick={() => void addMember(member)}
                  >
                    Add
                  </LoadingButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
