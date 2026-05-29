"use client"

import { useEffect, useRef } from "react"
import type { Message as MessageType } from "@/types"
import { Message } from "@/components/Message"
import { AriaThinking } from "@/components/AriaThinking"

export function MessageList({
  messages,
  ariaThinking,
}: {
  messages: MessageType[]
  ariaThinking: boolean
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const isFirstRender = useRef(true)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: isFirstRender.current ? "instant" : "smooth",
    })
    isFirstRender.current = false
  }, [messages, ariaThinking])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">No messages yet. Say hi 👋</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6">
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
        {ariaThinking && <AriaThinking />}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
