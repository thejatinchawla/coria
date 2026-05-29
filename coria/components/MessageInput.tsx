"use client"

import { useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const ARIA_MENTION = "@aria"

function isPartialAriaMention(text: string): boolean {
  const match = text.match(/^@(\w*)$/)
  if (!match) return false
  const partial = match[1].toLowerCase()
  if (partial === "aria") return false
  return "aria".startsWith(partial)
}

export function MessageInput({
  senderName,
  onAriaThinking,
}: {
  senderName: string
  onAriaThinking?: () => void
}) {
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [hintIndex, setHintIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const showAriaHint = useMemo(() => isPartialAriaMention(text), [text])

  async function send() {
    const content = text.trim()
    if (!content || sending) return

    setSending(true)
    const supabase = createClient()
    const { error } = await supabase.from("messages").insert({
      sender_name: senderName,
      sender_type: "human",
      content,
    })
    setSending(false)

    if (error) {
      console.error("Failed to send message:", error.message)
      return
    }

    const mentionMatch = content.match(/^@aria\s+([\s\S]+)/i)
    if (mentionMatch) {
      const userMessage = mentionMatch[1]
      fetch("/api/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_message: userMessage }),
      }).catch((err) => console.error("Invoke failed:", err))
      onAriaThinking?.()
    }

    setText("")
    setHintIndex(0)
    if (textareaRef.current) textareaRef.current.style.height = "auto"
    textareaRef.current?.focus()
  }

  function completeAriaMention() {
    setText(`${ARIA_MENTION} `)
    setHintIndex(0)
    textareaRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showAriaHint) {
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault()
        completeAriaMention()
        return
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        setHintIndex(0)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setText("")
        return
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    setHintIndex(0)
    const el = e.target
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
      className="shrink-0 border-t px-6 py-4"
    >
      <div className="relative mx-auto max-w-3xl">
        {showAriaHint && (
          <div
            id="aria-mention-hint"
            role="listbox"
            aria-label="Mention suggestions"
            className="absolute bottom-full left-0 z-10 mb-2 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md"
          >
            <button
              type="button"
              role="option"
              aria-selected={hintIndex === 0}
              onMouseDown={(e) => e.preventDefault()}
              onClick={completeAriaMention}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                hintIndex === 0 && "bg-accent",
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium">
                A
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{ARIA_MENTION}</span>
                <span className="ml-2 text-muted-foreground">
                  AI teammate
                </span>
              </span>
              <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
                Tab
              </kbd>
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Message #general — type @aria to ask the agent"
          disabled={sending}
          aria-autocomplete="list"
          aria-controls={showAriaHint ? "aria-mention-hint" : undefined}
          className="flex w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    </form>
  )
}
