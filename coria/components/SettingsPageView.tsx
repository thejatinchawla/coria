"use client"

import Link from "next/link"
import { Menu } from "lucide-react"
import { SettingsNav } from "@/components/SettingsNav"
import { SettingsPanel } from "@/components/SettingsPanel"
import { Button } from "@/components/ui/button"
import { useSidebarMenu } from "@/components/AppShell"
import { settingsLinkTitle, type SettingsId } from "@/lib/settings-links"
import { chatUrl } from "@/lib/settings-url"
import { useWorkspaceShell } from "@/components/WorkspaceShell"
import type { Agent, MemberRole } from "@/types"

export function SettingsPageView({
  section,
  workspaceName,
  memberRole,
  agents,
}: {
  section: SettingsId
  workspaceName: string
  memberRole: MemberRole
  agents: Agent[]
}) {
  const { openSidebar } = useSidebarMenu()
  const { shell, activeChannelSlug } = useWorkspaceShell()
  const title = settingsLinkTitle(section)

  return (
    <>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 md:hidden"
            aria-label="Open menu"
            onClick={openSidebar}
          >
            <Menu className="size-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">{workspaceName}</p>
          </div>
        </div>
      </header>

      <div className="shrink-0 border-b px-4 py-3">
        <SettingsNav activeSection={section} memberRole={memberRole} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl">
          <SettingsPanel
            section={section}
            agents={agents}
            channels={shell.channels}
            memberRole={memberRole}
          />
        </div>
      </div>
    </>
  )
}
