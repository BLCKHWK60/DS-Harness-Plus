"""Context Saver retrieval for Code tasks.

``python -m dsh_intel_mcp.context`` is a stdio MCP server. It uses only the standard
library and opens ``<DSH_INTEL_HOME>/context-saver/store.sqlite`` read-only, directly.
Its one tool,
``context_retrieve``, returns the original text behind a Context Saver marker,
or a slice of it, wrapped as untrusted reference data.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any, Final

TOOL_NAME: Final = "context_retrieve"
KEY_PATTERN: Final = re.compile(r"^[0-9a-f]{16}$")
TTL_SECONDS: Final = 72 * 3600
RESULT_MAX_CHARS: Final = 60_000
GREP_PATTERN_MAX: Final = 200
NO_STORE_MESSAGE: Final = "No Context Saver store exists on this computer yet."
NOT_FOUND_MESSAGE: Final = "Nothing is stored under that key. It may have expired (originals are kept for 72 hours)."
BAD_KEY_MESSAGE: Final = "key must be the 16 hex characters from the Context Saver marker."

ENVELOPE_CLOSE: Final = "</untrusted_tool_data>"
_ENVELOPE_TAG_RE: Final = re.compile(r"<(/?\s*untrusted_tool_data)", re.IGNORECASE)


def store_path() -> Path:
    from dsh_intel_mcp.paths import data_home

    return data_home() / "context-saver" / "store.sqlite"


def tool_definitions() -> list[dict[str, Any]]:
    return [
        {
            "name": TOOL_NAME,
            "description": (
                "Fetch the full text behind a Context Saver marker, or a slice of it. Give the key from the "
                "marker; add start_line/end_line (1-based, inclusive) or grep (a case-insensitive text, use | between alternatives, "
                "returns matching lines with line numbers) to get only what you need."
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "key": {"type": "string", "description": "The 16-character key from the marker."},
                    "start_line": {"type": "integer", "minimum": 1},
                    "end_line": {"type": "integer", "minimum": 1},
                    "grep": {"type": "string", "description": "Only lines matching this pattern."},
                },
                "required": ["key"],
                "additionalProperties": False,
            },
        }
    ]


def wrap_untrusted(source: str, body: str, limit: int = RESULT_MAX_CHARS) -> str:
    """``body`` inside the untrusted envelope, at most ``limit`` characters."""
    opening = f'<untrusted_tool_data source="{source}">'
    room = max(0, limit - len(opening) - len(ENVELOPE_CLOSE) - 2)
    text = _ENVELOPE_TAG_RE.sub(r"&lt;\1", body or "").strip()[:room]
    return f"{opening}\n{text}\n{ENVELOPE_CLOSE}"


def _positive_int(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else None


def _slice(text: str, start_line: int | None, end_line: int | None, grep: str | None) -> str:
    lines = text.split("\n")
    first = start_line or 1
    last = min(len(lines), end_line) if end_line else len(lines)
    if first > last:
        return ""
    selected = lines[first - 1:last]
    if not grep:
        return "\n".join(selected)
    # Literal alternatives ("a|b"): a model-written regex could backtrack forever on a large original.
    alternatives = [part for part in grep[:GREP_PATTERN_MAX].split("|") if part]
    if not alternatives:
        return ""
    rx = re.compile("|".join(re.escape(part) for part in alternatives), re.IGNORECASE)
    return "\n".join(f"{number}: {line}" for number, line in enumerate(selected, start=first) if rx.search(line))


def _lookup(key: str) -> tuple[str | None, str]:
    """The stored text for ``key``, or (None, why not)."""
    path = store_path()
    if not path.exists():
        return None, NO_STORE_MESSAGE
    try:
        conn = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True, timeout=5)
        try:
            row = conn.execute(
                "SELECT text FROM originals WHERE key = ? AND created >= ?", (key, time.time() - TTL_SECONDS)
            ).fetchone()
        finally:
            conn.close()
    except sqlite3.Error:
        return None, "The Context Saver store could not be read."
    return (row[0], "") if row else (None, NOT_FOUND_MESSAGE)


class ContextMcp:
    """JSON-RPC facade over the read-only store."""

    def handle(self, method: str, params: dict[str, Any]) -> dict[str, Any] | None:
        if method == "initialize":
            return {
                "protocolVersion": params.get("protocolVersion") or "2025-06-18",
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "dsh-intel-context", "version": "1"},
            }
        if method in {"notifications/initialized", "notifications/cancelled"}:
            return None
        if method == "ping":
            return {}
        if method == "tools/list":
            return {"tools": tool_definitions()}
        if method == "tools/call":
            return self._call(str(params.get("name") or ""), params.get("arguments") or {})
        raise RuntimeError(f"Unsupported MCP method: {method}")

    def _call(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        if name != TOOL_NAME:
            raise RuntimeError(f"Unknown context tool: {name}")
        text, is_error = self._retrieve(arguments)
        result: dict[str, Any] = {"content": [{"type": "text", "text": text}]}
        if is_error:
            result["isError"] = True
        return result

    def _retrieve(self, arguments: dict[str, Any]) -> tuple[str, bool]:
        key = arguments.get("key")
        if not isinstance(key, str) or not KEY_PATTERN.match(key):
            return BAD_KEY_MESSAGE, True
        original, reason = _lookup(key)
        if original is None:
            return reason, True
        grep = arguments.get("grep")
        body = _slice(
            original,
            _positive_int(arguments.get("start_line")),
            _positive_int(arguments.get("end_line")),
            grep if isinstance(grep, str) and grep else None,
        )
        return wrap_untrusted("context_saver", body), False


def main() -> int:
    server = ContextMcp()
    for raw in sys.stdin:
        message: dict[str, Any] = {}
        try:
            message = json.loads(raw)
            request_id = message.get("id")
            result = server.handle(str(message.get("method") or ""), message.get("params") or {})
            if request_id is None or result is None:
                continue
            response = {"jsonrpc": "2.0", "id": request_id, "result": result}
        except Exception as exc:  # noqa: BLE001 - JSON-RPC requires a structured error boundary.
            response = {
                "jsonrpc": "2.0",
                "id": message.get("id") if isinstance(message, dict) else None,
                "error": {"code": -32_000, "message": str(exc)[:2_000]},
            }
        sys.stdout.write(json.dumps(response, ensure_ascii=False, separators=(",", ":")) + "\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
