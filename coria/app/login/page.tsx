import { LoginForm } from "@/components/LoginForm"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sign in",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>
}) {
  const params = await searchParams
  return (
    <LoginForm
      authError={params.error === "auth"}
      authErrorDetail={params.detail}
    />
  )
}
