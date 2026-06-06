import { WorkspaceShell } from "@/components/WorkspaceShell"
import { loadWorkspaceShellContext } from "@/lib/app-context"

export default async function AppWorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await loadWorkspaceShellContext()

  return <WorkspaceShell initial={ctx}>{children}</WorkspaceShell>
}
