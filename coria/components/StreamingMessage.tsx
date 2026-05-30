"use client"

export function StreamingMessage({
  senderName,
  content,
}: {
  senderName: string
  content: string
}) {
  return (
    <div className="flex gap-2 sm:gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium sm:size-10 sm:text-sm">
        {senderName.charAt(0).toUpperCase()}
      </div>
      <div className="flex min-w-0 max-w-[min(85%,32rem)] flex-1 flex-col gap-1 sm:max-w-[70%]">
        <span className="text-xs text-muted-foreground">{senderName}</span>
        <div className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2 sm:px-4">
          <p className="text-sm whitespace-pre-wrap break-words">
            {content}
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground/60 align-middle" />
          </p>
        </div>
      </div>
    </div>
  )
}
