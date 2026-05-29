export function AriaThinking() {
  return (
    <div className="flex gap-2 sm:gap-3">
      {/* Mirrors Aria's message avatar so it reads as an incoming message. */}
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium sm:size-10 sm:text-sm">
        A
      </div>
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
        <span className="text-xs text-muted-foreground">Aria is thinking…</span>
      </div>
    </div>
  )
}
