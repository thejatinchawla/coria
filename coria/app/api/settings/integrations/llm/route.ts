import { NextResponse } from "next/server"
import { requireWorkspaceAdmin } from "@/lib/settings-member"
import { backendHeaders, backendUrl } from "@/lib/backend-proxy"

export async function GET() {
  const ctx = await requireWorkspaceAdmin()
  if ("error" in ctx && ctx.error) return ctx.error

  const response = await fetch(
    backendUrl(`/integrations/llm?workspace_id=${ctx.workspace!.id}`),
    { headers: backendHeaders() },
  )
  const body = await response.text()
  if (!response.ok) {
    return NextResponse.json(
      { error: "Backend failed", detail: body },
      { status: response.status },
    )
  }
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

export async function POST(request: Request) {
  const ctx = await requireWorkspaceAdmin()
  if ("error" in ctx && ctx.error) return ctx.error

  let payload: { api_key?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const apiKey = payload.api_key?.trim()
  if (!apiKey) {
    return NextResponse.json({ error: "api_key is required" }, { status: 400 })
  }

  const response = await fetch(backendUrl("/integrations/llm"), {
    method: "POST",
    headers: backendHeaders(),
    body: JSON.stringify({
      workspace_id: ctx.workspace!.id,
      member_id: ctx.member!.id,
      api_key: apiKey,
    }),
  })
  const body = await response.text()
  if (!response.ok) {
    return NextResponse.json(
      { error: "Backend failed", detail: body },
      { status: response.status },
    )
  }
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

export async function DELETE() {
  const ctx = await requireWorkspaceAdmin()
  if ("error" in ctx && ctx.error) return ctx.error

  const response = await fetch(
    backendUrl(`/integrations/llm?workspace_id=${ctx.workspace!.id}`),
    { method: "DELETE", headers: backendHeaders() },
  )
  const body = await response.text()
  if (!response.ok) {
    return NextResponse.json(
      { error: "Backend failed", detail: body },
      { status: response.status },
    )
  }
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
