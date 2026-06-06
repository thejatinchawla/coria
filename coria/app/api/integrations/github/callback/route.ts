import { NextResponse, type NextRequest } from "next/server"
import { backendHeaders, backendUrl } from "@/lib/backend-proxy"
import {
  githubOAuthCookieName,
  githubOAuthRedirectUri,
  verifyGitHubOAuthCookie,
} from "@/lib/github-oauth"
import { settingsUrl } from "@/lib/settings-url"

function integrationsRedirect(
  request: NextRequest,
  params: Record<string, string>,
) {
  const url = new URL(settingsUrl("integrations"), request.url)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  const response = NextResponse.redirect(url)
  response.cookies.set(githubOAuthCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  })
  return response
}

export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get("error")
  if (error) {
    return integrationsRedirect(request, {
      github: "error",
      reason: error,
    })
  }

  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  const cookieValue = request.cookies.get(githubOAuthCookieName())?.value
  const oauthState = verifyGitHubOAuthCookie(cookieValue, state)

  if (!code || !oauthState) {
    return integrationsRedirect(request, {
      github: "error",
      reason: "state",
    })
  }

  const redirectUri = githubOAuthRedirectUri(request)
  const completeResponse = await fetch(
    backendUrl("/integrations/github/oauth/complete"),
    {
      method: "POST",
      headers: backendHeaders(),
      body: JSON.stringify({
        workspace_id: oauthState.workspaceId,
        member_id: oauthState.memberId,
        code,
        redirect_uri: redirectUri,
      }),
    },
  )

  if (!completeResponse.ok) {
    const detail = await completeResponse.text()
    console.error("[github-oauth] complete failed:", detail)
    return integrationsRedirect(request, {
      github: "error",
      reason: "exchange",
    })
  }

  return integrationsRedirect(request, { github: "connected" })
}
