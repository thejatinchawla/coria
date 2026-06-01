import { cookies } from "next/headers"

export const WORKSPACE_COOKIE = "coria_workspace_id"

export async function getActiveWorkspaceIdFromCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(WORKSPACE_COOKIE)?.value ?? null
}

export function workspaceCookieOptions(maxAge = 60 * 60 * 24 * 365) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  }
}
