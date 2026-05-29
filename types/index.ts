/* eslint-disable @typescript-eslint/no-explicit-any */

export type SenderType = "human" | "agent"

export type Message = {
  id: string
  sender_name: string
  sender_type: SenderType
  content: string
  reasoning_trace_id: string | null
  action_block_id: string | null
  created_at: string
}

// Discriminated union of reasoning-trace steps. Only `reply` is produced today;
// the rest are placeholders for Day 6 (tools) and Day 7 (approvals). Adding a
// new step type is mechanical: extend this union and add a case to StepRenderer.
export type TraceStep =
  | { type: "reply"; content: string; timestamp: string }
  | { type: "tool_call_proposed"; tool: string; input: any; timestamp: string }
  | {
      type: "approval_requested"
      action_block_id: string
      tool?: string
      input?: any
      timestamp: string
    }
  | {
      type: "approval_decision"
      decision: "approved" | "declined"
      timestamp: string
    }
  | { type: "tool_result"; tool: string; result: any; timestamp: string }

export type ReasoningTrace = {
  id: string
  steps: TraceStep[]
  status: "planning" | "running" | "awaiting_approval" | "done" | "failed"
  conversation_state?: any
  created_at: string
}
