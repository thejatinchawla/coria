"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  SETTINGS_LINKS,
  isSettingsLinkVisible,
  type SettingsId,
} from "@/lib/settings-links"
import { settingsUrl } from "@/lib/settings-url"
import type { MemberRole } from "@/types"

export function SettingsNav({
  activeSection,
  memberRole,
  className,
}: {
  activeSection: SettingsId
  memberRole: MemberRole
  className?: string
}) {
  const pathname = usePathname()
  const links = SETTINGS_LINKS.filter((link) =>
    isSettingsLinkVisible(link.id, memberRole),
  )

  return (
    <nav className={cn("flex flex-col gap-0.5", className)}>
      {links.map((link) => {
        const href = settingsUrl(link.id)
        const active = activeSection === link.id || pathname === href
        return (
          <Link
            key={link.id}
            href={href}
            scroll={false}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
