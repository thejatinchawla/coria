import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { backendHeaders, backendUrl } from "@/lib/backend-proxy"
import { fetchWorkspace } from "@/lib/workspace"

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const workspace = await fetchWorkspace(supabase)
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
  }

  let body: { channel_id?: string; content?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const channelId = body.channel_id?.trim()
  const content = body.content?.trim()
  if (!channelId || !content) {
    return NextResponse.json(
      { error: "channel_id and content are required" },
      { status: 400 },
    )
  }

  try {
    const response = await fetch(backendUrl("/triggers/keyword"), {
      method: "POST",
      headers: backendHeaders(),
      body: JSON.stringify({
        workspace_id: workspace.id,
        channel_id: channelId,
        content,
      }),
    })

    if (!response.ok) {
      const detail = await response.text()
      return NextResponse.json(
        { error: "Backend keyword trigger failed", detail },
        { status: response.status },
      )
    }

    return NextResponse.json({ status: "accepted" })
  } catch (error) {
    return NextResponse.json(
      {
        error: "Backend unreachable",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 },
    )
  }
}
