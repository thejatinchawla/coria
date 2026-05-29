"""Message (de)serialization helpers.

Today these are no-ops: the only messages we handle are plain JSON dicts. On
Day 7 (the resume flow) the conversation will be persisted to
``reasoning_traces.conversation_state`` and will contain Anthropic content-block
objects (TextBlock, ToolUseBlock, ToolResultBlock, ...) that are not directly
JSON-serializable. Filling in the real conversion then only requires editing
this file — every call site already routes through here.
"""


def serialize_messages(messages: list) -> list:
    """Convert a message list (which may contain Anthropic content blocks) into
    JSON-safe dicts. No-op today."""
    return messages


def deserialize_messages(serialized: list) -> list:
    """Inverse of ``serialize_messages``. No-op today."""
    return serialized
