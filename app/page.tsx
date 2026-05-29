import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { createClient } from "@/lib/supabase-server"
import { displayName } from "@/lib/user"
import { Chat } from "@/components/Chat"
import type { Message } from "@/types"

export const metadata: Metadata = {
  title: "#general",
}

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: true })

  return (
    <Chat
      initialMessages={(data as Message[] | null) ?? []}
      userEmail={user.email ?? ""}
      userDisplayName={displayName(user)}
    />
  )
}
