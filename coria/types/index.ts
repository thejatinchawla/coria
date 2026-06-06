/* eslint-disable @typescript-eslint/no-explicit-any */

export type SenderType = "human" | "agent"

export type MemberRole = "owner" | "admin" | "member"
export type ChannelType = "hybrid" | "human_only"
export type AgentStatus = "active" | "paused"

export type Workspace = {
  id: string
  name: string
  slug: string
  created_at: string
}

export type Channel = {
  id: string
  workspace_id: string
  name: string
  slug: string
  type: ChannelType
  description?: string | null
  created_at: string
}

export type Agent = {
  id: string
  workspace_id: string
  name: string
  mention_slug: string
  status: AgentStatus
  system_prompt?: string
  allowed_tools?: string[]
  avatar_url?: string | null
  color?: string
  use_workspace_memory?: boolean
  template_id?: string | null
  model?: string | null
  created_at?: string
}

export type WorkspaceSettings = {
  workspace_id: string
  agents_globally_paused: boolean
  monthly_tool_budget: number
  tool_budget_used: number
  approval_ttl_hours?: number
  default_agent_id: string | null
  workspace_memory_enabled?: boolean
  llm_provider?: "groq" | "anthropic" | null
  llm_model?: string | null
  updated_at?: string
}

export type LlmIntegrationStatus = {
  integration: Integration | null
  llm_provider: "groq" | "anthropic" | null
  llm_model: string | null
  using_platform_default: boolean
  key_configured: boolean
}

export type Member = {
  id: string
  workspace_id: string
  user_id: string
  display_name: string
  role: MemberRole
  avatar_url?: string | null
  bio?: string | null
  email?: string | null
  created_at: string
}

export type PendingInvite = {
  id: string
  workspace_id: string
  email: string
  role: MemberRole
  invited_by: string | null
  expires_at: string
  created_at: string
}

export type AuditLogEntry = {
  id: string
  workspace_id: string
  agent_id: string | null
  member_id: string | null
  action_block_id: string | null
  tool_name: string
  tool_input_hash: string
  outcome: string
  gate_failed: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export type ActionBlockStatus =
  | "pending"
  | "approved"
  | "declined"
  | "expired"
  | "executed"
  | "failed"

export type ActionBlock = {
  id: string
  workspace_id: string
  channel_id: string
  agent_id: string
  trace_id: string | null
  tool_name: string
  tool_input: Record<string, unknown>
  summary: string
  status: ActionBlockStatus
  requested_by: string | null
  decided_by: string | null
  expires_at: string
  created_at: string
  decided_at: string | null
}

export type Message = {
  id: string
  channel_id: string
  sender_id: string | null
  sender_name: string
  sender_type: SenderType
  content: string
  reasoning_trace_id: string | null
  action_block_id: string | null
  thread_id: string | null
  parent_message_id: string | null
  reply_count: number
  is_pinned?: boolean
  created_at: string
}

export type MessageSearchHit = {
  id: string
  channel_id: string
  content: string
  sender_name: string
  sender_type: string
  thread_id: string | null
  created_at: string
}

export type IntegrationStatus = "active" | "error" | "disconnected"

export type IntegrationProviderMetadata = {
  auth_method?: "oauth" | "pat"
  github_login?: string
}

export type Integration = {
  id: string
  workspace_id: string
  provider: string
  status: IntegrationStatus
  created_at: string
  provider_metadata?: IntegrationProviderMetadata | null
}

export type AgentTriggerType = "cron" | "keyword"

export type AgentTrigger = {
  id: string
  workspace_id: string
  agent_id: string
  channel_id: string
  type: AgentTriggerType
  config: Record<string, unknown>
  enabled: boolean
  last_run_at: string | null
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
