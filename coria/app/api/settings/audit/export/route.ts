import { NextResponse } from "next/server"
import { backendHeaders, backendUrl } from "@/lib/backend-proxy"
import { requireWorkspaceAdmin } from "@/lib/settings-member"

export async function GET(request: Request) {
  const ctx = await requireWorkspaceAdmin()
  if ("error" in ctx && ctx.error) return ctx.error

  const { searchParams } = new URL(request.url)
  const days = searchParams.get("days") ?? "30"

  const response = await fetch(
    backendUrl(
      `/audit/export?workspace_id=${ctx.workspace!.id}&member_id=${ctx.member!.id}&days=${days}`,
    ),
    { headers: backendHeaders() },
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
