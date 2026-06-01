"use client"

import { useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"
import { SettingsNav } from "@/components/SettingsNav"
import { SettingsPanel } from "@/components/SettingsPanel"
import { Button } from "@/components/ui/button"
import type { Agent, Channel, MemberRole } from "@/types"
import {
  settingsLinkTitle,
  type SettingsId,
} from "@/lib/settings-links"
import { chatUrl } from "@/lib/settings-url"

export function SettingsModal({
  workspaceName,
  channelSlug,
  section,
  memberRole,
  agents,
  channels,
}: {
  workspaceName: string
  channelSlug: string
  section: SettingsId
  memberRole: MemberRole
  agents: Agent[]
  channels: Channel[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const title = settingsLinkTitle(section)

  function close() {
    startTransition(() => {
      router.push(chatUrl(channelSlug))
    })
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelSlug])

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col bg-background shadow-[inset_1px_0_0_var(--border)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-4">
        <div className="min-w-0">
          <h2 id="settings-modal-title" className="text-lg font-semibold">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">{workspaceName}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Close settings"
          disabled={isPending}
          onClick={close}
        >
          <X className="size-5" />
        </Button>
      </div>

      <div className="shrink-0 border-b px-4 py-3">
        <SettingsNav
          channelSlug={channelSlug}
          activeSection={section}
          memberRole={memberRole}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl">
          <SettingsPanel
            section={section}
            agents={agents}
            channels={channels}
            memberRole={memberRole}
          />
        </div>
      </div>
    </div>
  )
}
