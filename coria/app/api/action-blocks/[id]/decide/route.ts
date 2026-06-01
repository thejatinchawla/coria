import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: actionBlockId } = await context.params

  let body: { decision?: string; member_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const decision = body.decision?.trim()
  const memberId = body.member_id?.trim()

  if (!decision || !["approved", "declined"].includes(decision)) {
    return NextResponse.json(
      { error: "decision must be approved or declined" },
      { status: 400 },
    )
  }
  if (!memberId) {
    return NextResponse.json({ error: "member_id is required" }, { status: 400 })
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
    const response = await fetch(
      `${backendUrl}/action-blocks/${actionBlockId}/decide`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ decision, member_id: memberId }),
      },
    )

    if (!response.ok) {
      const detail = await response.text()
      return NextResponse.json(
        { error: "Backend decide failed", detail },
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
