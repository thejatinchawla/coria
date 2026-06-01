import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

function SettingsPanelSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

function ChatSkeleton() {
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <div className="hidden w-60 shrink-0 border-r bg-sidebar p-4 md:block">
        <Skeleton className="mb-4 h-8 w-3/4" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-4/5" />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Skeleton className="h-14 w-full rounded-none" />
        <div className="flex-1 space-y-4 p-4">
          <Skeleton className="h-16 w-2/3" />
          <Skeleton className="h-16 w-1/2" />
          <Skeleton className="h-16 w-3/5" />
        </div>
        <Skeleton className="h-16 w-full rounded-none" />
      </div>
    </div>
  )
}

export { Skeleton, SettingsPanelSkeleton, ChatSkeleton }
