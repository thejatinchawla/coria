"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import type { Channel, ChannelType } from "@/types"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/Toast"
import { useWorkspaceShell } from "@/components/WorkspaceShell"
import { slugifyChannelName } from "@/lib/workspace"
import { cn } from "@/lib/utils"

const CHANNEL_TYPES: { value: ChannelType; label: string; hint: string }[] = [
  {
    value: "hybrid",
    label: "Hybrid",
    hint: "Humans and agents can participate",
  },
  {
    value: "human_only",
    label: "Humans only",
    hint: "Agents cannot post in this channel",
  },
]

export function ChannelSettingsDialog({
  channel,
  open,
  onClose,
  onUpdated,
}: {
  channel: Channel
  open: boolean
  onClose: () => void
  onUpdated: (channel: Channel) => void
}) {
  const { toast } = useToast()
  const { setChannels } = useWorkspaceShell()
  const [name, setName] = useState(channel.name)
  const [description, setDescription] = useState(channel.description ?? "")
  const [type, setType] = useState<ChannelType>(channel.type)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(channel.name)
    setDescription(channel.description ?? "")
    setType(channel.type)
  }, [channel, open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const slugPreview = slugifyChannelName(name) || channel.slug

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/channels/${channel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          type,
        }),
      })
      const json = (await res.json()) as { channel?: Channel; error?: string }
      if (!res.ok) {
        toast(json.error ?? "Could not save channel.")
        return
      }
      const updated = json.channel!
      setChannels((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      )
      onUpdated(updated)
      toast("Channel updated.", "success")
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close channel settings"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="channel-settings-title"
        className="relative z-10 w-full max-w-md rounded-lg border bg-background p-4 shadow-lg"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="channel-settings-title" className="text-lg font-semibold">
              Channel settings
            </h2>
            <p className="text-sm text-muted-foreground">
              Update how this channel appears to your team.
            </p>
          </div>
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

        <div className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring"
              placeholder="e.g. product"
            />
            <span className="text-xs text-muted-foreground">
              URL slug: #{slugPreview}
              {slugPreview !== channel.slug ? " (will update on save)" : ""}
            </span>
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Description</span>
            <textarea
              rows={3}
              maxLength={280}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring"
              placeholder="What is this channel for?"
            />
            <span className="text-xs text-muted-foreground">
              {description.length}/280
            </span>
          </label>

          <fieldset className="space-y-2">
            <legend className="text-sm text-muted-foreground">Channel type</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {CHANNEL_TYPES.map((option) => {
                const selected = type === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setType(option.value)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      selected && "border-primary bg-accent text-accent-foreground",
                    )}
                  >
                    <span className="block font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {option.hint}
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            loading={saving}
            disabled={!name.trim()}
            onClick={() => void save()}
          >
            Save changes
          </Button>
        </div>
      </div>
    </div>
  )
}
