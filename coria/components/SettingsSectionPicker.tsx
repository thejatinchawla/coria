"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  SETTINGS_LINKS,
  isSettingsLinkVisible,
  type SettingsId,
} from "@/lib/settings-links"
import { settingsUrl } from "@/lib/settings-url"
import { cn } from "@/lib/utils"
import type { MemberRole } from "@/types"

export function SettingsSectionPicker({
  activeSection,
  memberRole,
  className,
}: {
  activeSection: SettingsId
  memberRole: MemberRole
  className?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const links = SETTINGS_LINKS.filter((link) =>
    isSettingsLinkVisible(link.id, memberRole),
  )
  const active =
    links.find((link) => link.id === activeSection) ?? links[0]

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  function selectSection(id: SettingsId) {
    setOpen(false)
    if (id === activeSection) return
    router.push(settingsUrl(id), { scroll: false })
  }

  return (
    <div ref={rootRef} className={cn("relative md:hidden", className)}>
      <p className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">
        Section
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "h-10 w-full justify-between gap-2 px-3 font-normal",
          open && "border-ring",
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Choose settings section"
      >
        <span className="min-w-0 truncate text-left text-sm font-medium">
          {active?.label ?? "Settings"}
        </span>
        <ChevronsUpDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </Button>

      {open && (
        <div
          role="listbox"
          aria-label="Settings sections"
          className="absolute top-full z-50 mt-1.5 max-h-[min(20rem,50dvh)] w-full overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <ul className="space-y-0.5">
            {links.map((link) => {
              const selected = link.id === activeSection
              return (
                <li key={link.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => selectSection(link.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-muted",
                    )}
                  >
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        selected ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {link.label}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
