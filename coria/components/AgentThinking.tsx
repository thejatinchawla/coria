import { AgentAvatar } from "@/components/AgentAvatar"
import { AgentAiBadge } from "@/components/AgentAiBadge"

export function AgentThinking({
  message = "Agent is thinking…",
  agentName = "Agent",
  color,
  avatarUrl,
}: {
  message?: string
  agentName?: string
  color?: string | null
  avatarUrl?: string | null
}) {
  return (
    <div className="flex gap-2 sm:gap-3">
      <AgentAvatar
        name={agentName}
        color={color ?? undefined}
        avatarUrl={avatarUrl}
        size="sm"
      />
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
        <AgentAiBadge />
        <span className="text-xs text-muted-foreground">{message}</span>
      </div>
    </div>
  )
}
