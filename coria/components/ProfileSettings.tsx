"use client"

import { useCallback, useRef, useState } from "react"
import type { Member } from "@/types"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/Toast"
import { createClient } from "@/lib/supabase"

export function ProfileSettings({
  initialProfile,
  userId,
}: {
  initialProfile: Member
  userId: string
}) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [profile, setProfile] = useState(initialProfile)
  const [displayName, setDisplayName] = useState(initialProfile.display_name)
  const [bio, setBio] = useState(initialProfile.bio ?? "")
  const [avatarUrl, setAvatarUrl] = useState(initialProfile.avatar_url ?? "")
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const save = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim(),
          bio: bio.trim() || null,
          avatar_url: avatarUrl.trim() || null,
        }),
      })
      if (!res.ok) {
        toast("Could not save profile.")
        return
      }
      const json = (await res.json()) as { profile: Member }
      setProfile(json.profile)
      toast("Profile saved.", "success")
    } finally {
      setSaving(false)
    }
  }, [avatarUrl, bio, displayName, toast])

  async function uploadAvatar(file: File) {
    setUploading(true)
    try {
      const supabase = createClient()
      const ext = file.name.split(".").pop() ?? "jpg"
      const path = `${userId}/avatar.${ext}`
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type })
      if (error) {
        toast(`Upload failed: ${error.message}`)
        return
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path)
      setAvatarUrl(data.publicUrl)
      toast("Avatar uploaded — save to apply.", "success")
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center gap-4">
          <div className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-muted text-lg font-medium">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              displayName.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
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
              Upload avatar
            </Button>
            <p className="text-xs text-muted-foreground">
              Or paste an image URL below. Role: {profile.role}
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
  )
}
