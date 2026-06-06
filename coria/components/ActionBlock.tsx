"use client"

import { Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ActionBlock } from "@/types"

export function ActionBlockCard({
  block,
  deciding,
  onDecide,
}: {
  block: ActionBlock
  deciding?: boolean
  onDecide: (decision: "approved" | "declined") => void
}) {
  const isPending = block.status === "pending"

  return (
    <div
      className={cn(
        "mx-auto max-w-3xl rounded-lg border border-amber-500/40 bg-amber-500/5 p-4",
        !isPending && "opacity-70",
      )}
    >
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
        Action requires approval
      </div>
      <p className="mb-1 text-sm font-medium">{block.summary}</p>
      <p className="mb-3 break-all font-mono text-xs text-muted-foreground">
        {block.tool_name}
      </p>

      {isPending ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            loading={deciding}
            onClick={() => onDecide("approved")}
            className="gap-1.5"
          >
            <Check className="size-3.5" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            loading={deciding}
            onClick={() => onDecide("declined")}
            className="gap-1.5"
          >
            <X className="size-3.5" />
            Decline
          </Button>
        </div>
      ) : (
        <p className="text-xs capitalize text-muted-foreground">
          Status: {block.status.replace(/_/g, " ")}
        </p>
      )}
    </div>
  )
}

export function ActionBlockList({
  blocks,
  decidingId,
  onDecide,
}: {
  blocks: ActionBlock[]
  decidingId?: string | null
  onDecide: (blockId: string, decision: "approved" | "declined") => void
}) {
  if (blocks.length === 0) return null

  return (
    <div className="flex flex-col gap-3 border-t bg-muted/30 px-3 py-3 sm:px-6">
      {blocks.map((block) => (
        <ActionBlockCard
          key={block.id}
          block={block}
          deciding={decidingId === block.id}
          onDecide={(d) => onDecide(block.id, d)}
        />
      ))}
    </div>
  )
}
