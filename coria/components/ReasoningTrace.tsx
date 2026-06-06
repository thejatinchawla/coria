"use client"

import { useEffect, useState } from "react"
import {
  CircleDot,
  CircleHelp,
  Gavel,
  MessageSquare,
  Terminal,
  Wrench,
} from "lucide-react"
import { LinkifiedText } from "@/components/LinkifiedText"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import type {
  ReasoningTrace as ReasoningTraceType,
  TraceStep,
} from "@/types"

// Cache fetched traces across collapse/expand. The disclosure unmounts this
// component when collapsed, so without a cache that outlives the component a
// re-expand would re-fetch. Module scope is fine: a full page refresh clears it
// (so refresh re-fetches), and traces are immutable today.
const traceCache = new Map<string, ReasoningTraceType | null>()

export function ReasoningTrace({ traceId }: { traceId: string }) {
  const [trace, setTrace] = useState<ReasoningTraceType | null>(
    traceCache.get(traceId) ?? null,
  )
  const [loading, setLoading] = useState(!traceCache.has(traceId))

  useEffect(() => {
    if (traceCache.has(traceId)) return // already fetched once this session

    let active = true
    const supabase = createClient()

    void (async () => {
      try {
        const { data } = await supabase
          .from("reasoning_traces")
          .select("*")
          .eq("id", traceId)
          .maybeSingle()
        if (!active) return
        const result = (data as ReasoningTraceType | null) ?? null
        traceCache.set(traceId, result)
        setTrace(result)
        setLoading(false)
      } catch {
        if (!active) return
        traceCache.set(traceId, null)
        setTrace(null)
        setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [traceId])

  if (loading) return <TraceSkeleton />
  if (!trace) return <TraceUnavailable />
  return <TracePanel trace={trace} />
}

const PANEL_CLASS =
  "rounded-md border border-border/60 border-l-[3px] border-l-primary/40 bg-muted/40 p-3"

function TracePanel({ trace }: { trace: ReasoningTraceType }) {
  return (
    <div className={PANEL_CLASS}>
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
          Reasoning
        </span>
        <StatusPill status={trace.status} />
      </div>

      {trace.steps.length === 0 ? (
        <div className="text-xs italic text-muted-foreground">
          No steps recorded
        </div>
      ) : (
        <div className="flex flex-col">
          {trace.steps.map((step, i) => (
            <StepRow
              key={i}
              step={step}
              isLast={i === trace.steps.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: ReasoningTraceType["status"] }) {
  const styles: Record<ReasoningTraceType["status"], string> = {
    done: "bg-green-500/15 text-green-700 dark:text-green-400",
    failed: "bg-red-500/15 text-red-700 dark:text-red-400",
    running: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    awaiting_approval: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    planning: "bg-muted text-muted-foreground",
  }
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        styles[status],
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  )
}

// One row of the timeline: an icon in a left column (with a faint connector
// line to the next step), and the step content on the right.
function StepRow({ step, isLast }: { step: TraceStep; isLast: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border">
          <StepIcon type={step.type} />
        </div>
        {!isLast && <div className="mt-1 w-px flex-1 bg-border" />}
      </div>
      <div className={cn("min-w-0 flex-1", !isLast && "pb-4")}>
        <StepRenderer step={step} />
      </div>
    </div>
  )
}

function StepIcon({ type }: { type: TraceStep["type"] }) {
  const className = "size-3.5"
  switch (type) {
    case "reply":
      return <MessageSquare className={className} />
    case "tool_call_proposed":
      return <Wrench className={className} />
    case "tool_result":
      return <Terminal className={className} />
    case "approval_requested":
      return <CircleHelp className={className} />
    case "approval_decision":
      return <Gavel className={className} />
    default:
      return <CircleDot className={className} />
  }
}

// Delegates to a per-type renderer. Adding a new step type is mechanical: add a
// case here (the `never` default makes a missing case a compile error).
function StepRenderer({ step }: { step: TraceStep }) {
  switch (step.type) {
    case "reply":
      return <ReplyStep step={step} />
    case "tool_call_proposed":
      return <ToolCallStep step={step} />
    case "tool_result":
      return <ToolResultStep step={step} />
    case "approval_requested":
      return <ApprovalRequestedStep step={step} />
    case "approval_decision":
      return <ApprovalDecisionStep step={step} />
    default: {
      const _exhaustive: never = step
      void _exhaustive
      return null
    }
  }
}

// --- Step renderers -------------------------------------------------------

function ReplyStep({ step }: { step: Extract<TraceStep, { type: "reply" }> }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Replied
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
          {formatStepTime(step.timestamp)}
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap break-words text-foreground">
        <LinkifiedText text={step.content} />
      </p>
    </div>
  )
}

// The four below are placeholders for Days 6 (tools) and 7 (approvals). They
// are typed against their step variant so fleshing them out is additive.
function ToolCallStep({
  step,
}: {
  step: Extract<TraceStep, { type: "tool_call_proposed" }>
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Tool call · <span className="font-mono">{step.tool}</span>
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
          {formatStepTime(step.timestamp)}
        </span>
      </div>
      <pre className="max-h-40 overflow-auto rounded border border-border/50 bg-background/60 p-2 font-mono text-[11px] leading-relaxed text-foreground/90">
        {formatJson(step.input)}
      </pre>
    </div>
  )
}

function ToolResultStep({
  step,
}: {
  step: Extract<TraceStep, { type: "tool_result" }>
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Tool result · <span className="font-mono">{step.tool}</span>
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
          {formatStepTime(step.timestamp)}
        </span>
      </div>
      <pre className="max-h-48 overflow-auto rounded border border-border/50 bg-background/60 p-2 font-mono text-[11px] leading-relaxed text-foreground/90">
        {formatJson(step.result)}
      </pre>
    </div>
  )
}

function ApprovalRequestedStep({
  step,
}: {
  step: Extract<TraceStep, { type: "approval_requested" }>
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
          Approval requested
          {step.tool ? (
            <>
              {" "}
              · <span className="font-mono">{step.tool}</span>
            </>
          ) : null}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
          {formatStepTime(step.timestamp)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Action block {step.action_block_id.slice(0, 8)}…
      </p>
    </div>
  )
}

function ApprovalDecisionStep({
  step,
}: {
  step: Extract<TraceStep, { type: "approval_decision" }>
}) {
  const approved = step.decision === "approved"
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span
        className={cn(
          "text-xs font-medium capitalize",
          approved
            ? "text-green-700 dark:text-green-400"
            : "text-red-700 dark:text-red-400",
        )}
      >
        {step.decision}
      </span>
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
        {formatStepTime(step.timestamp)}
      </span>
    </div>
  )
}

// --- States & helpers -----------------------------------------------------

function TraceSkeleton() {
  return (
    <div className={PANEL_CLASS}>
      <div className="mb-2.5 flex items-center justify-between">
        <div className="h-2.5 w-16 animate-pulse rounded bg-muted-foreground/20" />
        <div className="h-3.5 w-12 animate-pulse rounded-full bg-muted-foreground/20" />
      </div>
      <div className="flex gap-3">
        <div className="size-6 shrink-0 animate-pulse rounded-full bg-muted-foreground/20" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <div className="h-3 w-14 animate-pulse rounded bg-muted-foreground/20" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted-foreground/20" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted-foreground/20" />
        </div>
      </div>
    </div>
  )
}

function TraceUnavailable() {
  return (
    <div
      className={cn(
        PANEL_CLASS,
        "text-xs italic text-muted-foreground",
      )}
    >
      Trace unavailable
    </div>
  )
}

function formatStepTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

function formatJson(value: unknown): string {
  if (value === undefined) return ""
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
