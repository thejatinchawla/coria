import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { requireWorkspaceAdmin } from "@/lib/settings-member"
import {
  deleteWorkspace,
  fetchChannels,
  fetchMember,
  fetchUserWorkspaces,
  fetchWorkspace,
  updateWorkspaceName,
} from "@/lib/workspace"
import {
  getActiveWorkspaceIdFromCookie,
  WORKSPACE_COOKIE,
  workspaceCookieOptions,
} from "@/lib/workspace-cookie"

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const workspace = await fetchWorkspace(
    supabase,
    user.id,
    await getActiveWorkspaceIdFromCookie(),
  )
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
  }

  const member = await fetchMember(supabase, workspace.id, user.id)
  if (!member) {
    return NextResponse.json({ error: "Not a workspace member" }, { status: 403 })
  }

  if (member.role !== "owner") {
    return NextResponse.json(
      { error: "Only the workspace owner can update workspace details." },
      { status: 403 },
    )
  }

  let body: { name?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const result = await updateWorkspaceName(
    supabase,
    workspace.id,
    body.name ?? "",
  )

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ workspace: result.workspace })
}

export async function DELETE() {
  const ctx = await requireWorkspaceAdmin()
  if ("error" in ctx && ctx.error) return ctx.error

  const { supabase, workspace, userId } = ctx
  const deletedWorkspaceId = workspace!.id

  const workspaces = await fetchUserWorkspaces(supabase, userId!)
  const remaining = workspaces.filter((w) => w.id !== deletedWorkspaceId)

  const result = await deleteWorkspace(supabase, deletedWorkspaceId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  if (remaining.length === 0) {
    const response = NextResponse.json({
      ok: true,
      redirect: "/onboarding",
    })
    response.cookies.set(WORKSPACE_COOKIE, "", { ...workspaceCookieOptions(0), maxAge: 0 })
    return response
  }

  const nextWorkspace = remaining[0]!
  const channels = await fetchChannels(supabase, nextWorkspace.id)
  const fallbackChannel =
    channels.find((c) => c.slug === "general") ?? channels[0] ?? null

  const response = NextResponse.json({
    ok: true,
    redirect: fallbackChannel
      ? `/?channel=${fallbackChannel.slug}`
      : "/onboarding",
    next_workspace_id: nextWorkspace.id,
    fallback_channel_slug: fallbackChannel?.slug ?? null,
  })
  response.cookies.set(
    WORKSPACE_COOKIE,
    nextWorkspace.id,
    workspaceCookieOptions(),
  )
  return response
}
