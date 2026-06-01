import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { fetchMember } from "@/lib/workspace"
import {
  WORKSPACE_COOKIE,
  workspaceCookieOptions,
} from "@/lib/workspace-cookie"

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { workspace_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const workspaceId = body.workspace_id?.trim()
  if (!workspaceId) {
    return NextResponse.json({ error: "workspace_id is required" }, { status: 400 })
  }

  const member = await fetchMember(supabase, workspaceId, user.id)
  if (!member) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 })
  }

  const response = NextResponse.json({ ok: true, workspace_id: workspaceId })
  response.cookies.set(
    WORKSPACE_COOKIE,
    workspaceId,
    workspaceCookieOptions(),
  )
  return response
}
