import { NextResponse, type NextRequest } from "next/server"
import { backendHeaders, backendUrl } from "@/lib/backend-proxy"
import {
  createGitHubOAuthState,
  githubOAuthCookieName,
  githubOAuthRedirectUri,
} from "@/lib/github-oauth"
import { fetchMemberId, fetchWorkspace } from "@/lib/workspace"
import { createClient } from "@/lib/supabase-server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const workspace = await fetchWorkspace(supabase)
  if (!workspace) {
    return NextResponse.redirect(
      new URL("/settings/integrations?github=error&reason=workspace", request.url),
    )
  }

  const memberId = await fetchMemberId(supabase, workspace.id, user.id)
  if (!memberId) {
    return NextResponse.redirect(
      new URL("/settings/integrations?github=error&reason=member", request.url),
    )
  }

  const redirectUri = githubOAuthRedirectUri(request)
  const { nonce, cookieValue } = createGitHubOAuthState({
    workspaceId: workspace.id,
    memberId,
  })

  const startResponse = await fetch(backendUrl("/integrations/github/oauth/start"), {
    method: "POST",
    headers: backendHeaders(),
    body: JSON.stringify({
      redirect_uri: redirectUri,
      state: nonce,
    }),
  })

  if (!startResponse.ok) {
    const detail = await startResponse.text()
    console.error("[github-oauth] start failed:", detail)
    return NextResponse.redirect(
      new URL("/settings/integrations?github=error&reason=config", request.url),
    )
  }

  const { authorize_url } = (await startResponse.json()) as {
    authorize_url: string
  }

  const response = NextResponse.redirect(authorize_url)
  response.cookies.set(githubOAuthCookieName(), cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  })
  return response
}
