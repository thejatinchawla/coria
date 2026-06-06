import { Bot } from "lucide-react"
import { cn } from "@/lib/utils"

export function AgentAiBadge({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300",
        "border-violet-500/25 bg-violet-500/10",
        compact
          ? "gap-0.5 px-1 py-px text-[9px]"
          : "gap-0.5 px-1.5 py-0.5 text-[10px]",
        className,
      )}
      title="AI agent"
    >
      <Bot className={compact ? "size-2" : "size-2.5"} aria-hidden />
      AI
    </span>
  )
}
