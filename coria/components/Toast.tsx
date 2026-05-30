"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

type ToastItem = {
  id: number
  message: string
  variant: "error" | "info"
}

const ToastContext = createContext<{
  toast: (message: string, variant?: "error" | "info") => void
} | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const toast = useCallback(
    (message: string, variant: "error" | "info" = "error") => {
      const id = Date.now()
      setItems((prev) => [...prev, { id, message, variant }])
    },
    [],
  )

  useEffect(() => {
    if (items.length === 0) return
    const timers = items.map((item) =>
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== item.id))
      }, 6000),
    )
    return () => timers.forEach(clearTimeout)
  }, [items])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex max-w-sm flex-col gap-2 px-3 sm:bottom-6 sm:right-6"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg",
              item.variant === "error"
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border bg-card text-card-foreground",
            )}
          >
            <p className="flex-1">{item.message}</p>
            <button
              type="button"
              aria-label="Dismiss"
              className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
              onClick={() =>
                setItems((prev) => prev.filter((t) => t.id !== item.id))
              }
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider")
  }
  return ctx
}
