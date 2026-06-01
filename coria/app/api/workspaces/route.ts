import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import {
  createWorkspace,
  fetchUserWorkspaces,
  fetchWorkspace,
} from "@/lib/workspace"
import { displayName } from "@/lib/user"
import {
  WORKSPACE_COOKIE,
  workspaceCookieOptions,
} from "@/lib/workspace-cookie"
import { getActiveWorkspaceIdFromCookie } from "@/lib/workspace-cookie"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const workspaces = await fetchUserWorkspaces(supabase, user.id)
  const activeWorkspaceId = await getActiveWorkspaceIdFromCookie()

  return NextResponse.json({
    workspaces,
    active_workspace_id: activeWorkspaceId ?? workspaces[0]?.id ?? null,
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { name?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  const result = await createWorkspace(
    supabase,
    name,
    displayName(user),
  )
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("id,name,slug,created_at")
    .eq("id", result.workspaceId)
    .single()

  if (error || !workspace) {
    return NextResponse.json(
      { error: "Workspace created but could not be loaded." },
      { status: 500 },
    )
  }

  const response = NextResponse.json({ workspace })
  response.cookies.set(
    WORKSPACE_COOKIE,
    workspace.id,
    workspaceCookieOptions(),
  )
  return response
}
