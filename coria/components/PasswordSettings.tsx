"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/Toast"
import { createClient } from "@/lib/supabase"

export function PasswordSettings() {
  const { toast } = useToast()
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [changingPassword, setChangingPassword] = useState(false)

  async function changePassword() {
    if (newPassword.length < 6) {
      toast("Password must be at least 6 characters.")
      return
    }
    if (newPassword !== confirmPassword) {
      toast("Passwords do not match.")
      return
    }

    setChangingPassword(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        toast(error.message)
        return
      }
      setNewPassword("")
      setConfirmPassword("")
      toast("Password updated.", "success")
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div>
        <p className="text-sm text-muted-foreground">
          Set a new password for email sign-in. Magic link sign-in still works.
        </p>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">New password</span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={6}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Confirm new password</span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={6}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </label>

      <Button
        type="button"
        loading={changingPassword}
        disabled={!newPassword && !confirmPassword}
        onClick={() => void changePassword()}
      >
        Update password
      </Button>
    </section>
  )
}
