import { NextResponse } from "next/server"
import { backendHeaders, backendUrl } from "@/lib/backend-proxy"
import { requireWorkspaceAdmin } from "@/lib/settings-member"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireWorkspaceAdmin()
  if ("error" in ctx && ctx.error) return ctx.error

  const { id } = await params
  const response = await fetch(
    backendUrl(
      `/members/invites/${id}?workspace_id=${ctx.workspace!.id}&member_id=${ctx.member!.id}`,
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
