import { NextResponse } from "next/server"
import { requireWorkspaceAdmin, requireWorkspaceMember } from "@/lib/settings-member"
import { backendHeaders, backendUrl } from "@/lib/backend-proxy"

export async function GET() {
  const ctx = await requireWorkspaceMember()
  if ("error" in ctx && ctx.error) return ctx.error

  const response = await fetch(
    backendUrl(`/workspace-settings?workspace_id=${ctx.workspace!.id}`),
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
  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const touchesLlm = "llm_provider" in payload || "llm_model" in payload
  const ctx = touchesLlm
    ? await requireWorkspaceAdmin()
    : await requireWorkspaceMember()
  if ("error" in ctx && ctx.error) return ctx.error

  const response = await fetch(
    backendUrl(`/workspace-settings?workspace_id=${ctx.workspace!.id}`),
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
