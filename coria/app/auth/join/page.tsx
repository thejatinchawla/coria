import type { Metadata } from "next"
import { Suspense } from "react"
import { JoinWorkspace } from "@/components/JoinWorkspace"

export const metadata: Metadata = {
  title: "Join workspace",
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <JoinWorkspace />
    </Suspense>
  )
}
