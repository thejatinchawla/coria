"use client"

import { LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"

export function Sidebar({
  displayName,
  email,
}: {
  displayName: string
  email: string
}) {
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <span className="text-sm font-semibold">Coria</span>
      </div>

      <nav className="flex-1 p-2">
        <div className="rounded-md bg-sidebar-accent px-3 py-2 text-sm font-medium text-sidebar-accent-foreground">
          # general
        </div>
      </nav>

      <div className="space-y-2 border-t border-sidebar-border p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void signOut()}
          className="w-full justify-start gap-2 text-muted-foreground"
        >
          <LogOut className="size-3.5" />
          Sign out
        </Button>
      </div>
    </aside>
  )
}
