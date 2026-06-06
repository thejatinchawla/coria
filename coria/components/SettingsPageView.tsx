"use client"

import { useEffect } from "react"
import { Menu } from "lucide-react"
import { useRouter } from "next/navigation"
import { SettingsNav } from "@/components/SettingsNav"
import { SettingsPanel } from "@/components/SettingsPanel"
import { SettingsSectionPicker } from "@/components/SettingsSectionPicker"
import { Button } from "@/components/ui/button"
import { useSidebarMenu } from "@/components/AppShell"
import {
  isSettingsLinkVisible,
  resolveSettingsSection,
  settingsLinkTitle,
  type SettingsId,
} from "@/lib/settings-links"
import { settingsUrl } from "@/lib/settings-url"
import { useWorkspaceShell } from "@/components/WorkspaceShell"

export function SettingsPageView({ section }: { section: SettingsId }) {
  const router = useRouter()
  const { openSidebar } = useSidebarMenu()
  const { shell } = useWorkspaceShell()
  const title = settingsLinkTitle(section)
  const workspaceName = shell.workspace.name
  const memberRole = shell.memberRole

  useEffect(() => {
    if (!isSettingsLinkVisible(section, memberRole)) {
      const fallback = resolveSettingsSection(section, memberRole)
      router.replace(settingsUrl(fallback))
    }
  }, [section, memberRole, router, shell.workspace.id])

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
            <p className="truncate text-sm text-muted-foreground">
              {workspaceName}
            </p>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="shrink-0 border-b px-3 py-3 md:w-44 md:border-b-0 md:border-r md:py-4 lg:w-52">
          <SettingsSectionPicker
            activeSection={section}
            memberRole={memberRole}
            className="mb-1"
          />
          <p className="mb-2 hidden px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:block">
            Settings
          </p>
          <SettingsNav
            activeSection={section}
            memberRole={memberRole}
            className="hidden md:flex"
          />
        </aside>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
          <div className="mx-auto w-full max-w-3xl">
            <SettingsPanel
              section={section}
              workspaceId={shell.workspace.id}
              agents={shell.agents}
              channels={shell.channels}
              memberRole={memberRole}
            />
          </div>
        </div>
      </div>
    </>
  )
}
