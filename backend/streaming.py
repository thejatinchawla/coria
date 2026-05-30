import json
from typing import Any


def sse_event(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, default=str)}\n\n"


def sse_error(message: str) -> str:
    return sse_event({"type": "error", "message": message})
