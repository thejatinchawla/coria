import { NextRequest } from "next/server"
import { handleAuthConfirm } from "@/lib/auth-route"

export async function GET(request: NextRequest) {
  return handleAuthConfirm(request)
}
