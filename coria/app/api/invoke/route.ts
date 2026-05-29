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

  let body: { user_message?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const userMessage = body.user_message?.trim()
  if (!userMessage) {
    return NextResponse.json({ error: "user_message is required" }, { status: 400 })
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
    const response = await fetch(`${backendUrl}/invoke`, {
      method: "POST",
      headers,
      body: JSON.stringify({ user_message: userMessage }),
    })

    if (!response.ok) {
      const detail = await response.text()
      return NextResponse.json(
        { error: "Backend invoke failed", detail },
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
