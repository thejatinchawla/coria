import { Menu } from "lucide-react"

export function ChannelHeader({
  channelName,
  workspaceName,
  onMenuOpen,
}: {
  channelName: string
  workspaceName: string
  onMenuOpen: () => void
}) {
  return (
    <header className="flex h-14 shrink-0 items-center border-b px-3 sm:px-6">
      <button
        type="button"
        aria-label="Open menu"
        onClick={onMenuOpen}
        className="-ml-1 rounded-md p-2 text-muted-foreground hover:bg-muted md:hidden"
      >
        <Menu className="size-5" />
      </button>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-sm font-semibold text-muted-foreground">
          #{channelName}
        </span>
        <span className="hidden text-xs text-muted-foreground/70 sm:inline">
          {workspaceName}
        </span>
      </div>
    </header>
  )
}
