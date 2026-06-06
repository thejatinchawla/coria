"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { SETTINGS_LINKS, type SettingsId } from "@/lib/settings-links"
import { settingsUrl } from "@/lib/settings-url"
import type { MemberRole } from "@/types"

function isLinkVisible(id: SettingsId, memberRole: MemberRole): boolean {
  if (id === "workspace") return memberRole === "owner" || memberRole === "admin"
  return true
}

export function SettingsNav({
  activeSection,
  memberRole,
}: {
  activeSection: SettingsId
  memberRole: MemberRole
}) {
  const pathname = usePathname()
  const links = SETTINGS_LINKS.filter((link) => isLinkVisible(link.id, memberRole))

  return (
    <nav className="flex flex-wrap gap-1 rounded-lg border p-1">
      {links.map((link) => {
        const href = settingsUrl(link.id)
        const active = activeSection === link.id || pathname === href
        return (
          <Link
            key={link.id}
            href={href}
            scroll={false}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
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
