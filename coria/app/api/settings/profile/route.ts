import { NextResponse } from "next/server"
import { backendHeaders, backendUrl } from "@/lib/backend-proxy"
import { requireWorkspaceMember } from "@/lib/settings-member"

export async function GET() {
  const ctx = await requireWorkspaceMember()
  if ("error" in ctx && ctx.error) return ctx.error

  const response = await fetch(
    backendUrl(
      `/members/me?workspace_id=${ctx.workspace!.id}&user_id=${ctx.userId}`,
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

export async function PATCH(request: Request) {
  const ctx = await requireWorkspaceMember()
  if ("error" in ctx && ctx.error) return ctx.error

  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const response = await fetch(backendUrl("/members/me"), {
    method: "PATCH",
    headers: backendHeaders(),
    body: JSON.stringify({
      ...payload,
      workspace_id: ctx.workspace!.id,
      user_id: ctx.userId,
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
