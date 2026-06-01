from dataclasses import dataclass


@dataclass
class ToolContext:
    workspace_id: str
    channel_id: str
    agent_id: str
    agent_allowed_tools: list[str]
    invoker_member_id: str | None
    thread_id: str | None = None
    action_block_id: str | None = None
    skip_approval: bool = False
