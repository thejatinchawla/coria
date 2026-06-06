import { createHmac, randomBytes, timingSafeEqual } from "crypto"
import type { NextRequest } from "next/server"

export type GitHubOAuthState = {
  nonce: string
  workspaceId: string
  memberId: string
  exp: number
}

const COOKIE_NAME = "coria_github_oauth"
const STATE_TTL_MS = 10 * 60 * 1000

function stateSecret(): string {
  return (
    process.env.GITHUB_OAUTH_STATE_SECRET?.trim() ||
    process.env.INVOKE_SECRET?.trim() ||
    "coria-github-oauth-dev"
  )
}

function sign(data: string): string {
  return createHmac("sha256", stateSecret()).update(data).digest("base64url")
}

export function createGitHubOAuthState(input: {
  workspaceId: string
  memberId: string
}): { nonce: string; cookieValue: string } {
  const nonce = randomBytes(16).toString("hex")
  const payload: GitHubOAuthState = {
    nonce,
    workspaceId: input.workspaceId,
    memberId: input.memberId,
    exp: Date.now() + STATE_TTL_MS,
  }
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return { nonce, cookieValue: `${data}.${sign(data)}` }
}

export function verifyGitHubOAuthCookie(
  cookieValue: string | undefined,
  nonce: string | null,
): GitHubOAuthState | null {
  if (!cookieValue || !nonce) return null
  const [data, signature] = cookieValue.split(".")
  if (!data || !signature) return null

  const expected = sign(data)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8"),
    ) as GitHubOAuthState
    if (payload.nonce !== nonce) return null
    if (!payload.workspaceId || !payload.memberId) return null
    if (payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function githubOAuthCookieName(): string {
  return COOKIE_NAME
}

export function appOrigin(request: NextRequest): string {
  const configured = process.env.APP_URL?.trim()
  if (configured) return configured.replace(/\/$/, "")

  const forwardedHost = request.headers.get("x-forwarded-host")
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https"
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`
  }

  return request.nextUrl.origin
}

export function githubOAuthRedirectUri(request: NextRequest): string {
  return `${appOrigin(request)}/api/integrations/github/callback`
}
