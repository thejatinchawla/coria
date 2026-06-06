"use client"

import { useSyncExternalStore } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { THEME_OPTIONS, type ThemePreference } from "@/lib/theme"
import { cn } from "@/lib/utils"

const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const

const emptySubscribe = () => () => {}

export function ThemeSettings() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)

  const activeTheme = (theme ?? "system") as ThemePreference

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <h2 className="text-sm font-medium">Appearance</h2>
        <p className="text-sm text-muted-foreground">
          Choose how Coria looks on this device.
          {mounted && resolvedTheme
            ? ` Currently ${resolvedTheme === "dark" ? "dark" : "light"}.`
            : null}
        </p>
      </div>

      <div
        className="grid gap-2 sm:grid-cols-3"
        role="radiogroup"
        aria-label="Theme preference"
      >
        {THEME_OPTIONS.map((option) => {
          const Icon = THEME_ICONS[option.value]
          const selected = mounted && activeTheme === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!mounted}
              onClick={() => setTheme(option.value)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-lg border px-3 py-3 text-left text-sm transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                "disabled:cursor-default disabled:opacity-70",
                selected && "border-primary bg-accent text-accent-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="font-medium">{option.label}</span>
              <span className="text-xs text-muted-foreground">
                {option.description}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
