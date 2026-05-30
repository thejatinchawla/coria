import Link from "next/link"

export function SetupError({
  title,
  message,
}: {
  title: string
  message: string
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md space-y-4 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <p className="text-sm text-muted-foreground">
          From repo root:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            cd backend && supabase db push
          </code>
        </p>
        <Link
          href="/?channel=general"
          className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Retry
        </Link>
      </div>
    </main>
  )
}
