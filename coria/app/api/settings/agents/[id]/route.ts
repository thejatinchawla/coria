import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { backendHeaders, backendUrl } from "@/lib/backend-proxy"
import { fetchMemberId, fetchWorkspace } from "@/lib/workspace"

async function requireWorkspaceMember() {
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

  const memberId = await fetchMemberId(supabase, workspace.id, user.id)
  if (!memberId) {
    return { error: NextResponse.json({ error: "Not a workspace member" }, { status: 403 }) }
  }

  return { workspace }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireWorkspaceMember()
  if ("error" in ctx && ctx.error) return ctx.error

  const { id } = await params
  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const response = await fetch(
    backendUrl(`/agents/${id}?workspace_id=${ctx.workspace!.id}`),
    {
      method: "PATCH",
      headers: backendHeaders(),
      body: JSON.stringify(payload),
    },
  )
  const body = await response.text()
  if (!response.ok) {
    return NextResponse.json({ error: "Backend failed", detail: body }, { status: response.status })
  }
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
