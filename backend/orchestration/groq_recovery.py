"""Groq malformed tool-call recovery helpers."""

import json
import re

from groq import APIError, BadRequestError

_GROQ_FAILED_TOOL_RE = re.compile(
    r"<function=(\w+)\s*(\{.*?\})\s*(?:</function>|/>)",
    re.DOTALL,
)

_GROQ_MALFORMED_TOOL_PATTERNS = (
    _GROQ_FAILED_TOOL_RE,
    re.compile(r"<function\((\w+)\>(.*?)</function>", re.DOTALL),
    re.compile(r"<function\((\w+)\>(.*?)(?=\n|\Z)", re.DOTALL),
)

_GROQ_MALFORMED_TOOL_STRIP_RE = re.compile(
    r"<function[=(]\w+\>.*?(?:</function>|/>)",
    re.DOTALL,
)


def parse_groq_tool_args(raw: str) -> dict | None:
    cleaned = raw.strip().rstrip(">")
    if not cleaned:
        return {}
    if cleaned.startswith("{"):
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            return None
    try:
        return json.loads("{" + cleaned + "}")
    except json.JSONDecodeError:
        return None


def parse_groq_malformed_tool_from_text(text: str) -> tuple[str, dict] | None:
    """Parse Groq XML-style tool syntax leaked into plain assistant text."""
    for pattern in _GROQ_MALFORMED_TOOL_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        args = parse_groq_tool_args(match.group(2))
        if args is None:
            continue
        return match.group(1), args
    return None


def strip_groq_malformed_tool_syntax(text: str) -> str:
    cleaned = _GROQ_MALFORMED_TOOL_STRIP_RE.sub("", text)
    cleaned = _GROQ_FAILED_TOOL_RE.sub("", cleaned)
    return cleaned.strip()


def groq_error_details(error: BadRequestError | APIError) -> dict | None:
    """Extract the nested error object from Groq HTTP or SSE failures."""
    if isinstance(error, BadRequestError):
        try:
            payload = error.response.json()
        except Exception:
            return None
        err = payload.get("error")
        return err if isinstance(err, dict) else None
    if isinstance(error, APIError):
        body = error.body
        if isinstance(body, dict):
            if body.get("code"):
                return body
            nested = body.get("error")
            return nested if isinstance(nested, dict) else None
    return None


def parse_groq_tool_use_failed(
    error: BadRequestError | APIError,
) -> tuple[str, dict] | None:
    """Groq sometimes rejects a tool call when the model emits XML-style syntax."""
    err = groq_error_details(error)
    if not err or err.get("code") != "tool_use_failed":
        return None
    failed = err.get("failed_generation") or ""
    parsed = parse_groq_malformed_tool_from_text(failed)
    if parsed:
        return parsed
    match = _GROQ_FAILED_TOOL_RE.search(failed)
    if not match:
        return None
    try:
        return match.group(1), json.loads(match.group(2))
    except json.JSONDecodeError:
        return None
