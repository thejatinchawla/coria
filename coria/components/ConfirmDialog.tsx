"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "destructive"
}

type ConfirmRequest = ConfirmOptions & {
  resolve: (confirmed: boolean) => void
}

const ConfirmContext = createContext<{
  confirm: (options: ConfirmOptions) => Promise<boolean>
} | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setRequest({ ...options, resolve })
    })
  }, [])

  const close = useCallback((confirmed: boolean) => {
    setRequest((current) => {
      current?.resolve(confirmed)
      return null
    })
  }, [])

  useEffect(() => {
    if (!request) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close(false)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [request, close])

  useEffect(() => {
    if (!request) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [request])

  const variant = request?.variant ?? "default"
  const confirmLabel =
    request?.confirmLabel ?? (variant === "destructive" ? "Delete" : "Confirm")
  const cancelLabel = request?.cancelLabel ?? "Cancel"

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {request && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-black/50"
            onClick={() => close(false)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby={
              request.description ? "confirm-dialog-description" : undefined
            }
            className="relative z-10 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg"
          >
            <h2
              id="confirm-dialog-title"
              className={cn(
                "text-base font-semibold",
                variant === "destructive" && "text-destructive",
              )}
            >
              {request.title}
            </h2>
            {request.description && (
              <p
                id="confirm-dialog-description"
                className="mt-2 text-sm text-muted-foreground"
              >
                {request.description}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => close(false)}
              >
                {cancelLabel}
              </Button>
              <Button
                type="button"
                variant={variant === "destructive" ? "destructive" : "default"}
                autoFocus
                onClick={() => close(true)}
              >
                {confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider")
  }
  return ctx
}
