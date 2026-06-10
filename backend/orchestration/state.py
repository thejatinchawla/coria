"""Agent graph state and constants."""

from typing import NotRequired, TypedDict

# Hard cap on the agentic loop — primary guard against infinite tool cycles.
MAX_AGENT_ITERATIONS = 5


class AgentGraphState(TypedDict):
    working: list[dict]
    steps: list[dict]
    iteration: int
    reply: NotRequired[str]
    done: NotRequired[bool]
