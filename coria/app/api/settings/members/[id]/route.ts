import { NextResponse } from "next/server"
import { backendHeaders, backendUrl } from "@/lib/backend-proxy"
import { requireWorkspaceAdmin } from "@/lib/settings-member"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireWorkspaceAdmin()
  if ("error" in ctx && ctx.error) return ctx.error

  const { id } = await params
  let payload: { role?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const response = await fetch(
    backendUrl(`/members/${id}?workspace_id=${ctx.workspace!.id}`),
    {
      method: "PATCH",
      headers: backendHeaders(),
      body: JSON.stringify({
        role: payload.role,
        actor_member_id: ctx.member!.id,
      }),
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireWorkspaceAdmin()
  if ("error" in ctx && ctx.error) return ctx.error

  const { id } = await params
  const response = await fetch(
    backendUrl(
      `/members/${id}?workspace_id=${ctx.workspace!.id}&actor_member_id=${ctx.member!.id}`,
    ),
    { method: "DELETE", headers: backendHeaders() },
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
