import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SettingsPageView } from "@/components/SettingsPageView"
import { loadWorkspaceShellContext } from "@/lib/app-context"
import {
  isSettingsId,
  resolveSettingsSection,
  settingsLinkTitle,
} from "@/lib/settings-links"

type PageProps = {
  params: Promise<{ section: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { section } = await params
  if (!isSettingsId(section)) {
    return { title: "Settings" }
  }
  return { title: settingsLinkTitle(section) }
}

export default async function SettingsSectionPage({ params }: PageProps) {
  const { section: rawSection } = await params
  if (!isSettingsId(rawSection)) {
    redirect("/settings/profile")
  }

  const ctx = await loadWorkspaceShellContext()
  const section = resolveSettingsSection(rawSection, ctx.memberRole)

  if (section !== rawSection) {
    redirect(`/settings/${section}`)
  }

  return <SettingsPageView section={section} />
}
