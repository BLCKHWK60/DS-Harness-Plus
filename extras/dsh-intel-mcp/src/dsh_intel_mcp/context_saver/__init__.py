"""Context Saver: a reversible, deterministic compressor for large tool results.

Detects what a text is (JSON, log, search output, diff, code, HTML, prose), shrinks it
and keeps the original in a local store that the ``context`` MCP server reads back.
"""
from __future__ import annotations

from dsh_intel_mcp.context_saver import savings, store
from dsh_intel_mcp.context_saver.policy import MARKER, Compressed, Surface, clear_memo, compress_messages, compress_text, tokens
from dsh_intel_mcp.context_saver.store import retrieve

__all__ = ["MARKER", "Compressed", "Surface", "clear_memo", "compress_messages", "compress_text", "retrieve", "savings", "store", "tokens"]
