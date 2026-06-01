"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { SETTINGS_LINKS, type SettingsId } from "@/lib/settings-links"
import { chatUrl } from "@/lib/settings-url"
import type { MemberRole } from "@/types"

function isLinkVisible(id: SettingsId, memberRole: MemberRole): boolean {
  if (id === "workspace") return memberRole === "owner" || memberRole === "admin"
  return true
}

export function SettingsNav({
  channelSlug,
  activeSection,
  memberRole,
}: {
  channelSlug: string
  activeSection: SettingsId
  memberRole: MemberRole
}) {
  const links = SETTINGS_LINKS.filter((link) => isLinkVisible(link.id, memberRole))

  return (
    <nav className="flex flex-wrap gap-1 rounded-lg border p-1">
      {links.map((link) => (
        <Link
          key={link.id}
          href={chatUrl(channelSlug, link.id)}
          scroll={false}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            activeSection === link.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
