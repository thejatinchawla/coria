"use client"

import { LogOut, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function Sidebar({
  displayName,
  email,
  open,
  onClose,
}: {
  displayName: string
  email: string
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] flex-col border-r bg-sidebar text-sidebar-foreground transition-transform duration-200 ease-out md:static md:z-auto md:w-60 md:shrink-0 md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
          <span className="text-sm font-semibold">Coria</span>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent md:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 p-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md bg-sidebar-accent px-3 py-2 text-left text-sm font-medium text-sidebar-accent-foreground"
          >
            # general
          </button>
        </nav>

        <div className="space-y-2 border-t border-sidebar-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
    </>
  )
}
