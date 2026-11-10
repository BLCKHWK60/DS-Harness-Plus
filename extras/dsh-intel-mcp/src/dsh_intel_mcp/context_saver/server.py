"""A stdio helper that serves compression requests to the dsh Context Saver plugin.

Newline-delimited JSON, one request per line: ``{"id": 1, "method": "...", "params": {...}}``;
one reply per line: ``{"id": 1, "result": ...}`` or ``{"id": 1, "error": "..."}``.

Methods:
- ``ping``: ``"pong"``.
- ``compress``: ``{text, surface, retrievable, min_chars, min_gain}`` -> the compressed text and counts.
- ``savings``: ``{days}`` -> the savings ledger summary.
- ``reset_savings``: clears the ledger.
- ``store_stats``: the store's size and count.

Standard library plus this package; started with ``python -m dsh_intel_mcp.context_saver`` and
``DSH_INTEL_HOME`` set (the same directory the ``context`` retrieval server reads).
"""
from __future__ import annotations

import json
import sys
from typing import Any, Callable

from dsh_intel_mcp.context_saver import policy, savings, store

SURFACES = ("chat", "cowork", "code")


def _positive_int(value: Any, name: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        raise ValueError(f"{name} must be a positive integer")
    return value


def compress(params: dict[str, Any]) -> dict[str, Any]:
    text = params.get("text")
    if not isinstance(text, str):
        raise ValueError("text must be a string")
    surface = params.get("surface", "cowork")
    if surface not in SURFACES:
        raise ValueError(f"surface must be one of {', '.join(SURFACES)}")
    min_gain = params.get("min_gain", policy.MIN_GAIN)
    if not isinstance(min_gain, (int, float)) or isinstance(min_gain, bool) or not 0 < min_gain < 1:
        raise ValueError("min_gain must be a number between 0 and 1")
    result = policy.compress_text(
        text,
        surface=surface,
        retrievable=bool(params.get("retrievable", True)),
        min_chars=_positive_int(params.get("min_chars", policy.DEFAULT_MIN_CHARS), "min_chars"),
        min_gain=float(min_gain),
    )
    return {
        "text": result.text,
        "tokens_before": result.tokens_before,
        "tokens_after": result.tokens_after,
        "key": result.key,
        "kind": result.kind,
        "changed": result.changed,
    }


METHODS: dict[str, Callable[[dict[str, Any]], Any]] = {
    "ping": lambda _params: "pong",
    "compress": compress,
    "savings": lambda params: savings.summary(_positive_int(params.get("days", 30), "days")),
    "reset_savings": lambda _params: savings.reset(),
    "store_stats": lambda _params: store.stats(),
}


def handle(line: str) -> dict[str, Any] | None:
    """One reply for one request line, or None for a blank line."""
    line = line.strip()
    if not line:
        return None
    try:
        request = json.loads(line)
        request_id = request.get("id")
        method = request.get("method")
        params = request.get("params") or {}
        if method not in METHODS:
            raise ValueError(f"unknown method {method!r}")
        if not isinstance(params, dict):
            raise ValueError("params must be an object")
        return {"id": request_id, "result": METHODS[method](params)}
    except Exception as exc:  # noqa: BLE001 - every failure is one error reply, never a dead helper
        request_id = request.get("id") if isinstance(locals().get("request"), dict) else None
        return {"id": request_id, "error": f"{type(exc).__name__}: {exc}"}


def main() -> int:
    for line in sys.stdin:
        reply = handle(line)
        if reply is not None:
            sys.stdout.write(json.dumps(reply, ensure_ascii=False, separators=(",", ":")) + "\n")
            sys.stdout.flush()
    return 0
