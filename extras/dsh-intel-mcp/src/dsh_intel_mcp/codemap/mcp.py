"""Stdio MCP server for the Code Map: ``python -m dsh_intel_mcp.codemap --root <abs path>``.

Standard library plus this package only; newline-delimited JSON-RPC.
The index is built on the first tool call and refreshed at most every 30 seconds.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any, Callable, Final

REFRESH_INTERVAL_SECONDS: Final = 30.0
SERVER_NAME: Final = "dsh_intel_codemap"

_STRING_LIST: Final = {"type": "array", "items": {"type": "string"}}


def tool_definitions() -> list[dict[str, Any]]:
    def tool(name: str, description: str, properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
        return {
            "name": name,
            "description": description,
            "inputSchema": {"type": "object", "properties": properties, "required": required or [], "additionalProperties": False},
        }

    return [
        tool("code_overview", "Orient yourself: file and language counts, a depth-2 directory tree, entry points and the most referenced files. Start here.",
             {"path": {"type": "string", "default": ".", "description": "Subdirectory, relative to the project root."},
              "max_tokens": {"type": "integer", "minimum": 200, "default": 1200}}),
        tool("code_map", "Ranked map of the files that matter most with their definition signatures. Pass focus files or symbols to bias it toward what you are changing.",
             {"focus_files": _STRING_LIST, "focus_symbols": _STRING_LIST,
              "max_tokens": {"type": "integer", "minimum": 200, "default": 2000}}),
        tool("code_outline", "Every definition in one file with line ranges, nested by parent.",
             {"file": {"type": "string"}}, ["file"]),
        tool("code_symbol", "Find a definition by name (exact, then by last component) and show its location and body.",
             {"name": {"type": "string"}, "file": {"type": "string"}, "include_body": {"type": "boolean", "default": True}}, ["name"]),
        tool("code_refs", "Where a name is used: file:line, the line and the enclosing symbol.",
             {"name": {"type": "string"}, "max_results": {"type": "integer", "minimum": 1, "maximum": 500, "default": 50}}, ["name"]),
        tool("code_search", "Search file contents (literal by default, regex on request), skipping ignored, binary and secret files.",
             {"pattern": {"type": "string"}, "glob": {"type": "string"}, "regex": {"type": "boolean", "default": False},
              "max_results": {"type": "integer", "minimum": 1, "maximum": 500, "default": 50}}, ["pattern"]),
        tool("code_pack", "Pack the repository into one paged text: directory tree, then signatures (compress) or full text per file in ranked order. Secrets, lock files and binaries are always excluded.",
             {"include": _STRING_LIST, "ignore": _STRING_LIST, "compress": {"type": "boolean", "default": True},
              "max_tokens": {"type": "integer", "minimum": 300, "default": 20000}, "page": {"type": "integer", "minimum": 1, "default": 1}}),
    ]


class ToolArgumentError(ValueError):
    """Bad tool arguments; reported as a tool error, not a protocol error."""


def _arg(arguments: dict[str, Any], key: str, kind: type | tuple[type, ...], default: Any = None, required: bool = False) -> Any:
    value = arguments.get(key)
    if value is None:
        if required:
            raise ToolArgumentError(f"Missing required argument: {key}")
        return default
    if isinstance(value, bool) and kind in (int, (int,)):
        raise ToolArgumentError(f"Argument {key} must be an integer")
    if not isinstance(value, kind):
        raise ToolArgumentError(f"Argument {key} has the wrong type")
    return value


def _strings(arguments: dict[str, Any], key: str) -> list[str]:
    value = _arg(arguments, key, list, [])
    if not all(isinstance(item, str) for item in value):
        raise ToolArgumentError(f"Argument {key} must be a list of strings")
    return value


class CodeMapMcp:
    def __init__(self, root: Path, db_path: Path | str | None = None, refresh_interval: float = REFRESH_INTERVAL_SECONDS) -> None:
        self.root = Path(root).resolve()
        self._db_path = db_path
        self._interval = refresh_interval
        self._index: Any = None
        self._refreshed_at = 0.0

    def _ready(self) -> Any:
        from .index import CodeIndex

        if self._index is None:
            self._index = CodeIndex(self.root, self._db_path)
            self._index.refresh()
            self._refreshed_at = time.monotonic()
        elif time.monotonic() - self._refreshed_at >= self._interval:
            self._index.refresh()
            self._refreshed_at = time.monotonic()
        return self._index

    def handle(self, method: str, params: dict[str, Any]) -> dict[str, Any] | None:
        if method == "initialize":
            return {
                "protocolVersion": params.get("protocolVersion") or "2025-06-18",
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": SERVER_NAME, "version": "1"},
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
        handlers: dict[str, Callable[[Any, dict[str, Any]], str]] = {
            "code_overview": self._overview, "code_map": self._map, "code_outline": self._outline,
            "code_symbol": self._symbol, "code_refs": self._refs, "code_search": self._search, "code_pack": self._pack,
        }
        handler = handlers.get(name)
        if handler is None:
            raise RuntimeError(f"Unknown code map tool: {name}")
        if not isinstance(arguments, dict):
            return {"content": [{"type": "text", "text": "Tool arguments must be an object."}], "isError": True}
        try:
            text = handler(self._ready(), arguments)
            return {"content": [{"type": "text", "text": text}]}
        except ValueError as exc:  # includes ToolArgumentError and rejected paths
            return {"content": [{"type": "text", "text": str(exc)[:2000]}], "isError": True}
        except Exception as exc:  # noqa: BLE001 - tool failures are results, not protocol errors
            return {"content": [{"type": "text", "text": f"Code map failed: {str(exc)[:500]}"}], "isError": True}

    @staticmethod
    def _overview(index: Any, a: dict[str, Any]) -> str:
        from . import render

        return render.overview(index, _arg(a, "path", str, "."), _arg(a, "max_tokens", int, 1200))

    @staticmethod
    def _map(index: Any, a: dict[str, Any]) -> str:
        from . import render

        return render.repo_map(index, _strings(a, "focus_files"), _strings(a, "focus_symbols"), _arg(a, "max_tokens", int, 2000))

    @staticmethod
    def _outline(index: Any, a: dict[str, Any]) -> str:
        from . import render

        return render.outline(index, _arg(a, "file", str, required=True))

    @staticmethod
    def _symbol(index: Any, a: dict[str, Any]) -> str:
        from . import render

        return render.symbol(index, _arg(a, "name", str, required=True), _arg(a, "file", str), _arg(a, "include_body", bool, True))

    @staticmethod
    def _refs(index: Any, a: dict[str, Any]) -> str:
        from . import render

        return render.refs(index, _arg(a, "name", str, required=True), _arg(a, "max_results", int, 50))

    @staticmethod
    def _search(index: Any, a: dict[str, Any]) -> str:
        from . import render

        return render.search(index, _arg(a, "pattern", str, required=True), _arg(a, "glob", str),
                             _arg(a, "regex", bool, False), _arg(a, "max_results", int, 50))

    @staticmethod
    def _pack(index: Any, a: dict[str, Any]) -> str:
        from . import render

        return render.pack(index, _strings(a, "include"), _strings(a, "ignore"), _arg(a, "compress", bool, True),
                           _arg(a, "max_tokens", int, 20_000), _arg(a, "page", int, 1))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="dsh_intel_mcp.codemap")
    parser.add_argument("--root", required=True)
    args = parser.parse_args(argv)
    root = Path(args.root)
    if not root.is_absolute() or not root.is_dir():
        print("--root must be an existing absolute directory", file=sys.stderr)
        return 2
    server = CodeMapMcp(root)
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
