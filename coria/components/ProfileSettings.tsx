"use client"

import { useCallback, useRef, useState } from "react"
import { Loader2, X } from "lucide-react"
import type { Member } from "@/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/Toast"
import { createClient } from "@/lib/supabase"
import { useWorkspaceShell } from "@/components/WorkspaceShell"

type ProfilePayload = {
  display_name: string
  bio: string | null
  avatar_url: string | null
}

const AVATAR_ACCEPT = "image/jpeg,image/png,.jpg,.jpeg,.png"
const AVATAR_MIME_TYPES = new Set(["image/jpeg", "image/png"])

function avatarExtension(mimeType: string): string | null {
  if (mimeType === "image/jpeg") return "jpg"
  if (mimeType === "image/png") return "png"
  return null
}

export function ProfileSettings({
  initialProfile,
  userId,
}: {
  initialProfile: Member
  userId: string
}) {
  const { toast } = useToast()
  const { updateCurrentMemberProfile } = useWorkspaceShell()
  const fileRef = useRef<HTMLInputElement>(null)
  const [profile, setProfile] = useState(initialProfile)
  const [displayName, setDisplayName] = useState(initialProfile.display_name)
  const [bio, setBio] = useState(initialProfile.bio ?? "")
  const [avatarUrl, setAvatarUrl] = useState(initialProfile.avatar_url ?? "")
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [removingAvatar, setRemovingAvatar] = useState(false)

  const buildPayload = useCallback(
    (overrides?: Partial<ProfilePayload>): ProfilePayload => ({
      display_name: displayName.trim(),
      bio: bio.trim() || null,
      avatar_url: avatarUrl.trim() || null,
      ...overrides,
    }),
    [avatarUrl, bio, displayName],
  )

  const persistProfile = useCallback(
    async (overrides?: Partial<ProfilePayload>) => {
      const payload = buildPayload(overrides)
      if (!payload.display_name) {
        toast("Display name cannot be empty.")
        return null
      }

      setSaving(true)
      try {
        const res = await fetch("/api/settings/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          toast("Could not save profile.")
          return null
        }
        const json = (await res.json()) as { profile: Member }
        const saved = {
          ...json.profile,
          ...(overrides?.avatar_url !== undefined
            ? { avatar_url: overrides.avatar_url }
            : {}),
        }
        setProfile(saved)
        setDisplayName(saved.display_name)
        setBio(saved.bio ?? "")
        setAvatarUrl(saved.avatar_url ?? "")
        updateCurrentMemberProfile(saved)
        return saved
      } finally {
        setSaving(false)
      }
    },
    [buildPayload, toast, updateCurrentMemberProfile],
  )

  const save = useCallback(async () => {
    const saved = await persistProfile()
    if (saved) toast("Profile saved.", "success")
  }, [persistProfile, toast])

  async function uploadAvatar(file: File) {
    if (!AVATAR_MIME_TYPES.has(file.type)) {
      toast("Only JPEG and PNG images are allowed.")
      if (fileRef.current) fileRef.current.value = ""
      return
    }

    const ext = avatarExtension(file.type)
    if (!ext) {
      toast("Only JPEG and PNG images are allowed.")
      if (fileRef.current) fileRef.current.value = ""
      return
    }

    setUploading(true)
    try {
      const supabase = createClient()
      const path = `${userId}/avatar.${ext}`
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type })
      if (error) {
        toast(`Upload failed: ${error.message}`)
        return
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path)
      const url = data.publicUrl
      setAvatarUrl(url)
      const saved = await persistProfile({ avatar_url: url })
      if (saved) toast("Profile photo updated.", "success")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function removeAvatar() {
    setRemovingAvatar(true)
    setAvatarUrl("")
    try {
      const saved = await persistProfile({ avatar_url: null })
      if (!saved) {
        setAvatarUrl(profile.avatar_url ?? "")
        return
      }

      const supabase = createClient()
      const { data: files } = await supabase.storage
        .from("avatars")
        .list(userId)
      if (files?.length) {
        await supabase.storage
          .from("avatars")
          .remove(files.map((file) => `${userId}/${file.name}`))
      }
      toast("Profile photo removed.", "success")
    } finally {
      setRemovingAvatar(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center gap-4">
          <div className="relative size-16 shrink-0">
            <div className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-muted text-lg font-medium">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                displayName.slice(0, 1).toUpperCase()
              )}
            </div>
            {avatarUrl ? (
              <button
                type="button"
                aria-label="Remove photo"
                disabled={removingAvatar}
                onClick={() => void removeAvatar()}
                className={cn(
                  "absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors",
                  "hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:pointer-events-none disabled:opacity-50",
                )}
              >
                {removingAvatar ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <X className="size-3" strokeWidth={2.5} />
                )}
              </button>
            ) : null}
          </div>
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept={AVATAR_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void uploadAvatar(file)
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={uploading}
              onClick={() => fileRef.current?.click()}
            >
              Upload photo
            </Button>
            <p className="text-xs text-muted-foreground">
              JPEG or PNG only. Role: {profile.role}
            </p>
          </div>
        </div>

        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">Display name</span>
          <input
            required
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">Bio</span>
          <textarea
            rows={3}
            maxLength={160}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Short bio (160 chars)"
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">Avatar URL (optional)</span>
          <input
            type="url"
            placeholder="https://…"
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
          />
        </label>

        {profile.email && (
          <p className="text-xs text-muted-foreground">Email: {profile.email}</p>
        )}

        <Button type="button" loading={saving} onClick={() => void save()}>
          Save profile
        </Button>
      </section>
    </div>
  )
}
