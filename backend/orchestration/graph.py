"""LangGraph StateGraph definition for agent orchestration."""

from langgraph.graph import END, StateGraph

from orchestration.nodes import call_model, execute_tools, route_after_model
from orchestration.state import AgentGraphState, MAX_AGENT_ITERATIONS


def build_agent_graph():
    builder = StateGraph(AgentGraphState)
    builder.add_node("model", call_model)
    builder.add_node("tools", execute_tools)
    builder.set_entry_point("model")
    builder.add_conditional_edges(
        "model",
        route_after_model,
        {"tools": "tools", "model": "model", "__end__": END},
    )
    builder.add_edge("tools", "model")
    return builder.compile()


agent_graph = build_agent_graph()

__all__ = ["agent_graph", "build_agent_graph", "MAX_AGENT_ITERATIONS"]
