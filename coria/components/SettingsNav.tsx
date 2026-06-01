"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/agents", label: "Agents" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/triggers", label: "Triggers" },
  { href: "/settings/audit", label: "Audit" },
] as const

export function SettingsNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap gap-1 rounded-lg border p-1">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            pathname === link.href
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
