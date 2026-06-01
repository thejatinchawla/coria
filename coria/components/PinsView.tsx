"use client"

import { Pin, PinOff } from "lucide-react"
import { AgentAvatar } from "@/components/AgentAvatar"
import { MessageTimestamp } from "@/components/MessageTimestamp"
import type { Agent, Message } from "@/types"
import { cn } from "@/lib/utils"

export function PinsView({
  pins,
  agentsById,
  onSelect,
  onUnpin,
}: {
  pins: Message[]
  agentsById?: Record<string, Agent>
  onSelect: (message: Message) => void
  onUnpin: (message: Message) => void
}) {
  if (pins.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted">
          <Pin className="size-6 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm font-semibold">Nothing pinned yet</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Pin messages from the Messages tab to keep important updates easy to
          find.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-3 sm:px-6">
        <ul className="divide-y divide-border">
          {pins.map((message) => {
            const agent =
              message.sender_id && agentsById
                ? agentsById[message.sender_id]
                : undefined
            const isAgent = message.sender_type === "agent"

            return (
              <li key={message.id} className="group">
                <article className="flex gap-3 py-4 sm:gap-4">
                  {isAgent ? (
                    <AgentAvatar
                      name={agent?.name ?? message.sender_name}
                      color={agent?.color}
                      avatarUrl={agent?.avatar_url}
                      size="sm"
                    />
                  ) : (
                    <div
                      className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary sm:size-10"
                      aria-hidden
                    >
                      {message.sender_name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-bold">
                        {message.sender_name}
                      </span>
                      <MessageTimestamp
                        iso={message.created_at}
                        className="text-xs text-muted-foreground"
                      />
                      {message.thread_id && (
                        <span className="text-xs text-muted-foreground">
                          · thread reply
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelect(message)}
                      className="mt-1 w-full text-left text-sm leading-relaxed whitespace-pre-wrap break-words hover:underline"
                    >
                      {message.content}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onUnpin(message)}
                    title="Unpin message"
                    aria-label="Unpin message"
                    className={cn(
                      "flex h-8 shrink-0 items-center gap-1 rounded px-2 text-xs text-muted-foreground",
                      "opacity-0 transition-opacity hover:bg-muted hover:text-foreground",
                      "group-hover:opacity-100 focus:opacity-100 sm:opacity-100",
                    )}
                  >
                    <PinOff className="size-3.5" />
                    <span className="hidden sm:inline">Unpin</span>
                  </button>
                </article>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
