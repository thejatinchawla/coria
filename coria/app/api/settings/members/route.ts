import { NextResponse } from "next/server"
import { backendHeaders, backendUrl } from "@/lib/backend-proxy"
import { requireWorkspaceAdmin } from "@/lib/settings-member"

export async function GET() {
  const ctx = await requireWorkspaceAdmin()
  if ("error" in ctx && ctx.error) return ctx.error

  const response = await fetch(
    backendUrl(
      `/members?workspace_id=${ctx.workspace!.id}&member_id=${ctx.member!.id}`,
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

export async function POST(request: Request) {
  const ctx = await requireWorkspaceAdmin()
  if ("error" in ctx && ctx.error) return ctx.error

  let payload: { email?: string; role?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const response = await fetch(backendUrl("/members/invite"), {
    method: "POST",
    headers: backendHeaders(),
    body: JSON.stringify({
      workspace_id: ctx.workspace!.id,
      email: payload.email,
      role: payload.role ?? "member",
      invited_by: ctx.member!.id,
    }),
  })
  const body = await response.text()
  if (!response.ok) {
    return NextResponse.json({ error: "Backend failed", detail: body }, { status: response.status })
  }
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
