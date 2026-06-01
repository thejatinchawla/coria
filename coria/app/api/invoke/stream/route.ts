import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: {
    user_message?: string
    channel_id?: string
    agent_id?: string
    invoker_member_id?: string | null
    thread_id?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const userMessage = body.user_message?.trim()
  const channelId = body.channel_id?.trim()
  const agentId = body.agent_id?.trim()

  if (!userMessage) {
    return NextResponse.json({ error: "user_message is required" }, { status: 400 })
  }
  if (!channelId) {
    return NextResponse.json({ error: "channel_id is required" }, { status: 400 })
  }
  if (!agentId) {
    return NextResponse.json({ error: "agent_id is required" }, { status: 400 })
  }

  const backendUrl = process.env.BACKEND_URL || "http://localhost:8000"
  const invokeSecret = process.env.INVOKE_SECRET

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (invokeSecret) {
    headers["X-Invoke-Secret"] = invokeSecret
  }

  try {
    const response = await fetch(`${backendUrl}/invoke/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        user_message: userMessage,
        channel_id: channelId,
        agent_id: agentId,
        invoker_member_id: body.invoker_member_id ?? null,
        thread_id: body.thread_id ?? null,
      }),
    })

    if (!response.ok) {
      const detail = await response.text()
      return NextResponse.json(
        { error: "Backend stream failed", detail },
        { status: response.status },
      )
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    })
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
