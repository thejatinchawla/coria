import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { fetchMember, fetchWorkspace } from "@/lib/workspace"

export async function requireWorkspaceMember() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const workspace = await fetchWorkspace(supabase)
  if (!workspace) {
    return {
      error: NextResponse.json({ error: "Workspace not found" }, { status: 404 }),
    }
  }

  const member = await fetchMember(supabase, workspace.id, user.id)
  if (!member) {
    return { error: NextResponse.json({ error: "Not a workspace member" }, { status: 403 }) }
  }

  return { workspace, member, userId: user.id }
}

export async function requireWorkspaceAdmin() {
  const ctx = await requireWorkspaceMember()
  if ("error" in ctx && ctx.error) return ctx

  if (ctx.member!.role !== "owner" && ctx.member!.role !== "admin") {
    return {
      error: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    }
  }

  return ctx
}
