"""Reverse Engineer tools (``dsh-intel-reverse``).

``python -m dsh_intel_mcp.reverse --target-kind K --target T --root <cwd>
[--allow-websites 0|1] [--max-target-mb N]`` is the stdio MCP server Codex
runs. Every path argument is confined to the target and to extraction folders
under <data home>/reverse/extract/. Replies lead with a summary and cite
evidence ids; text taken from a target is wrapped as untrusted data.
"""
from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Callable, Final

from dsh_intel_mcp.reverse import analyzers as registry
from dsh_intel_mcp.reverse import extract
from dsh_intel_mcp.reverse.analyzers import AnalyzeContext, data_files
from dsh_intel_mcp.reverse.evidence import get_store
from dsh_intel_mcp.reverse.targets import Target, is_private_location, url_host, validate_target
from dsh_intel_mcp.untrusted import wrap_untrusted

SERVER_NAME: Final = "dsh-intel-reverse"
READ_MAX_LINES: Final = 400
READ_MAX_CHARS: Final = 40_000
REPLY_MAX_CHARS: Final = 60_000
ANALYZE_SECONDS: Final = 120
SECRET_FILE_PATTERNS: Final = data_files.SECRET_FILE_PATTERNS
MISSING_NATIVE: Final = "{tool} needs the native analyzer, which is not available in this build."


class ToolError(Exception):
    """A failure reported to the agent as a tool error."""


def _schema(properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {"type": "object", "properties": properties, "required": required or [], "additionalProperties": False}


_PATH = {"type": "string", "description": "Relative to the target root."}


def tool_definitions() -> list[dict[str, Any]]:
    return [
        {"name": "re_survey", "description": "Start here. What the target is, its top-level contents and which analyzers apply.", "inputSchema": _schema({"path": _PATH})},
        {
            "name": "re_inspect",
            "description": "Run an analyzer and keep its findings as evidence. Returns a summary and an evidence id; read details with re_evidence.",
            "inputSchema": _schema({"path": _PATH, "analyzer": {"type": "string", "description": "Analyzer name from re_survey; default is the first that applies."}}),
        },
        {
            "name": "re_evidence",
            "description": "Page through stored evidence. Without facet it lists the facets.",
            "inputSchema": _schema({"id": {"type": "string"}, "facet": {"type": "string"}, "page": {"type": "integer", "minimum": 1, "default": 1}}, ["id"]),
        },
        {
            "name": "re_files",
            "description": "List files under a path (no symlinks followed).",
            "inputSchema": _schema({"path": _PATH, "glob": {"type": "string"}, "max_results": {"type": "integer", "minimum": 1, "maximum": 1000, "default": 200}}),
        },
        {
            "name": "re_read",
            "description": "Read a text file (at most 400 lines or 40k characters). Use re_strings for binaries.",
            "inputSchema": _schema({"path": _PATH, "start": {"type": "integer", "minimum": 1}, "end": {"type": "integer", "minimum": 1}}, ["path"]),
        },
        {
            "name": "re_strings",
            "description": "Printable strings (ASCII and UTF-16) from a file, optionally filtered.",
            "inputSchema": _schema(
                {"path": _PATH, "min_len": {"type": "integer", "minimum": 3, "default": 6}, "grep": {"type": "string"}, "section": {"type": "string"}, "max_results": {"type": "integer", "minimum": 1, "maximum": 1000, "default": 200}},
                ["path"],
            ),
        },
        {
            "name": "re_disassemble",
            "description": "Disassemble a function or address range of a native binary (needs the native analyzer).",
            "inputSchema": _schema({"path": _PATH, "symbol": {"type": "string"}, "address": {"type": "string"}, "max_instructions": {"type": "integer", "minimum": 1, "maximum": 2000, "default": 200}}, ["path"]),
        },
        {
            "name": "re_xrefs",
            "description": "Cross-references to a symbol or address in a native binary (needs the native analyzer).",
            "inputSchema": _schema({"path": _PATH, "symbol": {"type": "string"}, "address": {"type": "string"}}, ["path"]),
        },
        {
            "name": "re_fetch",
            "description": "Fetch a page or asset from the target website (website targets only; same host only).",
            "inputSchema": _schema({"url": {"type": "string"}}, ["url"]),
        },
    ]


_SOURCE_UNSAFE = re.compile(r"[^\w./ @+=,:~-]")


def _src(kind: str, name: str) -> str:
    """An envelope ``source`` label: file names come from the target, so strip quotes, brackets and newlines."""
    return f"{kind}:{_SOURCE_UNSAFE.sub('_', name)[:200]}"


def _int(arguments: dict[str, Any], key: str, default: int | None, low: int, high: int) -> int | None:
    value = arguments.get(key)
    if value is None:
        return default
    try:
        return max(low, min(high, int(value)))
    except (TypeError, ValueError):
        raise ToolError(f"'{key}' must be an integer.") from None


def _inside(real: Path, base: Path) -> bool:
    if base.is_file():
        return real == base
    try:
        real.relative_to(base)
        return True
    except ValueError:
        return False


class ReverseServer:
    def __init__(self, target_kind: str, target: str, root: str, allow_websites: bool = True, max_target_mb: int = 500) -> None:
        self.allow_websites = allow_websites
        self.max_bytes = max(1, int(max_target_mb)) * 1024 * 1024
        self.target_error: str | None = None
        self.target: Target | None = None
        try:
            self.target = validate_target(target_kind, target, allow_websites=allow_websites)
        except ValueError as exc:
            self.target_error = str(exc)
        if self.target and self.target.kind == "path":
            self.root = Path(self.target.value)
        elif self.target and self.target.kind == "url":
            self.root = extract.extract_root()
            self.url_marker: Path | None = None
        else:
            self.root = Path(root or ".")
        self.root = self.root.resolve() if self.root.exists() else self.root
        self.store = get_store()
        self.url_marker = None
        if self.target and self.target.kind == "url":
            # The website analyzer reads a '*.url' marker holding the target URL.
            try:
                # one folder per URL, so two website tasks never overwrite each other's marker
                digest = hashlib.sha256(self.target.value.encode()).hexdigest()[:12]
                marker_dir = extract.extract_root() / f"website-{digest}"
                marker_dir.mkdir(parents=True, exist_ok=True)
                marker = marker_dir / "target.url"
                marker.write_text(self.target.value + "\n", encoding="utf-8")
                self.url_marker = marker.resolve()
            except OSError:
                self.url_marker = None

    def _real_for(self, args: dict[str, Any]) -> Path:
        """The path a survey/inspect call works on; a website target with no path means its URL marker."""
        if not args.get("path") and getattr(self, "url_marker", None) is not None:
            return self.url_marker
        return self._need_exists(self.resolve(args.get("path")))

    # ── confinement ──────────────────────────────────────────────────

    def _bases(self) -> list[Path]:
        bases = [self.root]
        ex = extract.extract_root()
        bases.append(ex.resolve() if ex.exists() else ex)
        return bases

    def resolve(self, raw: Any) -> Path:
        text = str(raw or ".").strip() or "."
        candidate = Path(text).expanduser() if text.startswith("~") else Path(text)
        if candidate.is_absolute():
            full = candidate
        else:
            if ".." in candidate.parts:
                raise ToolError("Paths cannot contain '..'.")
            full = self.root / candidate
        try:
            real = full.resolve()
        except OSError:
            raise ToolError("That path cannot be resolved.") from None
        if not any(_inside(real, base) for base in self._bases()):
            raise ToolError("That path is outside the target.")
        ex = extract.extract_root()
        in_extract = _inside(real, ex.resolve() if ex.exists() else ex)
        if not in_extract and is_private_location(real):
            raise ToolError("That path holds private data and is not readable here.")
        return real

    def display(self, real: Path) -> str:
        if self.root.is_dir() and _inside(real, self.root):
            rel = real.relative_to(self.root).as_posix()
            return rel or "."
        if self.root.is_file() and real == self.root:
            return self.root.name
        return str(real)

    def _need_exists(self, real: Path) -> Path:
        if not real.exists():
            raise ToolError(f"No such path: {self.display(real)}")
        return real

    def _guard_size(self, real: Path) -> None:
        total = 0
        if real.is_file():
            total = real.stat().st_size
        else:
            for dirpath, _, names in os.walk(real, followlinks=False):
                for name in names:
                    try:
                        total += os.lstat(os.path.join(dirpath, name)).st_size
                    except OSError:
                        continue
                if total > self.max_bytes:
                    break
        if total > self.max_bytes:
            raise ToolError(f"The target is larger than the {self.max_bytes // (1024 * 1024)} MB limit set in the plugin settings.")

    # ── tools ────────────────────────────────────────────────────────

    def _applicable(self, real: Path) -> list:
        """Analyzers for ``real``. The website analyzer fetches over the network, so it only ever runs on this task's own URL marker."""
        found = registry.analyzers_for(real)
        if self.url_marker is not None and real == self.url_marker:
            return [a for a in found if a.name == "website"] or found
        return [a for a in found if a.name != "website"]

    def re_survey(self, args: dict[str, Any]) -> str:
        real = self._real_for(args)
        names: list[str] = []
        if real.is_dir():
            for child in sorted(real.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))[:60]:
                names.append(child.name + ("/" if child.is_dir() and not child.is_symlink() else ""))
        found = self._applicable(real)
        lines = [f"Survey of {self.display(real)}: {'folder' if real.is_dir() else 'file'}" + (f", {real.stat().st_size} bytes" if real.is_file() else "")]
        if self.target and self.target.kind == "url":
            lines.append(f"Website target {self.target.value}: use re_fetch to read pages; extracted material appears under {extract.extract_root()}.")
        if names:
            lines.append("Top-level contents: " + ", ".join(names))
        if found:
            lines.append("Applicable analyzers (run with re_inspect analyzer=<name>):")
            lines += [f"- {a.name}: {a.title}" for a in found]
        else:
            lines.append("No analyzer applies to this path. Try re_files, re_read or re_strings.")
        missing = registry.missing_modules()
        if missing:
            lines.append("Not available in this build: " + ", ".join(sorted(missing)))
        facts = {"contents": names, "analyzers": [a.name for a in found]}
        ev = self.store.put(self.display(real), "survey", lines[0], facts, [])
        lines.append(f"evidence: {ev}")
        return "\n".join(lines)

    def re_inspect(self, args: dict[str, Any]) -> str:
        real = self._real_for(args)
        self._guard_size(real)
        wanted = str(args.get("analyzer") or "").strip()
        if wanted:
            try:
                analyzer = registry.get(wanted)
            except KeyError as exc:
                raise ToolError(str(exc.args[0])) from None
            if analyzer.name == "website" and not (self.url_marker is not None and real == self.url_marker):
                raise ToolError("The website analyzer only runs on this task's website target.")
            if not analyzer.detect(real):
                raise ToolError(f"The '{wanted}' analyzer does not apply to {self.display(real)}. Run re_survey to see which do.")
        else:
            found = self._applicable(real)
            if not found:
                raise ToolError("No analyzer applies to this path. Try re_strings or re_read.")
            analyzer = found[0]
        extract.prune_extractions()
        ev_id = self.store.new_id()
        work = extract.extract_root() / ev_id
        ctx = AnalyzeContext(work_dir=work, max_bytes=self.max_bytes, deadline=time.monotonic() + ANALYZE_SECONDS)
        try:
            result = analyzer.run(real, ctx)
        except ToolError:
            raise
        except Exception as exc:  # noqa: BLE001 - analyzer faults are tool errors, not protocol errors
            raise ToolError(f"The {analyzer.name} analyzer failed: {type(exc).__name__}: {str(exc)[:200]}") from None
        facts = dict(result.facts)
        if result.extracted_root and "extraction" not in facts:
            facts["extraction"] = [{"root": str(result.extracted_root)}]
        if work.is_dir() and not any(work.iterdir()):
            work.rmdir()
        self.store.put(self.display(real), analyzer.name, result.summary, facts, result.limitations, evidence_id=ev_id)
        lines = [f"{analyzer.title}: {result.summary}"]
        if result.extracted_root:
            lines.append(f"Extracted to {result.extracted_root} (browse with re_files / re_read / re_strings using that absolute path).")
        for note in result.limitations:
            lines.append(f"Limitation: {note}")
        sizes = self.store.facets(ev_id)
        if sizes:
            lines.append("Facets: " + ", ".join(f"{k} ({v})" for k, v in sizes.items()))
        lines.append(f"evidence: {ev_id} (read with re_evidence id={ev_id} facet=<name>)")
        return "\n".join(lines)

    def re_evidence(self, args: dict[str, Any]) -> str:
        ev_id = str(args.get("id") or "")
        facet = args.get("facet")
        text = self.store.page(ev_id, str(facet) if facet else None, _int(args, "page", 1, 1, 10_000) or 1)
        return wrap_untrusted(_src("evidence", ev_id), text, REPLY_MAX_CHARS)

    def re_files(self, args: dict[str, Any]) -> str:
        real = self._need_exists(self.resolve(args.get("path")))
        limit = _int(args, "max_results", 200, 1, 1000) or 200
        pattern = str(args.get("glob") or "").strip()
        if real.is_file():
            return f"{self.display(real)}  {real.stat().st_size} bytes"
        rows: list[str] = []
        truncated = False
        for dirpath, dirnames, filenames in os.walk(real, followlinks=False):
            dirnames.sort()
            for name in sorted(filenames):
                full = Path(dirpath) / name
                if full.is_symlink():
                    continue
                rel = full.relative_to(real).as_posix()
                if pattern and not (fnmatch.fnmatch(rel, pattern) or fnmatch.fnmatch(name, pattern)):
                    continue
                if len(rows) >= limit:
                    truncated = True
                    break
                try:
                    size = full.stat().st_size
                except OSError:
                    continue
                rows.append(f"{self.display(full)}  {size}")
            if truncated:
                break
        head = f"{len(rows)} file(s) under {self.display(real)}" + (f" matching '{pattern}'" if pattern else "")
        if truncated:
            head += f" (truncated at {limit}; narrow with path or glob)"
        return head + "\n" + "\n".join(rows)

    def re_read(self, args: dict[str, Any]) -> str:
        real = self._need_exists(self.resolve(args.get("path")))
        if not real.is_file():
            raise ToolError("That path is a folder; use re_files.")
        if any(fnmatch.fnmatch(real.name.lower(), p) for p in SECRET_FILE_PATTERNS):
            raise ToolError("That file looks like it holds secrets and is not readable here.")
        with open(real, "rb") as fh:
            sample = fh.read(8192)
            if b"\x00" in sample:
                raise ToolError("That is a binary file; use re_strings or re_inspect.")
            fh.seek(0)
            data = fh.read(READ_MAX_CHARS * 4 + 1)
        lines = data.decode("utf-8", "replace").splitlines()
        start = _int(args, "start", 1, 1, 10**9) or 1
        end = _int(args, "end", None, 1, 10**9)
        last = min(end if end is not None else start + READ_MAX_LINES - 1, start + READ_MAX_LINES - 1, len(lines))
        chosen = lines[start - 1 : last]
        body = data_files.mask_secrets("\n".join(f"{start + i}: {line}" for i, line in enumerate(chosen)))
        note = ""
        if len(body) > READ_MAX_CHARS:
            body, note = body[:READ_MAX_CHARS], "truncated at 40000 characters"
        elif end is None and last < len(lines) or len(data) > READ_MAX_CHARS * 4:
            note = f"more lines follow; continue with start={last + 1}"
        head = f"{_SOURCE_UNSAFE.sub('_', self.display(real))} lines {start}-{max(start, start + len(chosen) - 1)}" + (f" ({note})" if note else "")
        return head + "\n" + wrap_untrusted(_src("file", self.display(real)), body, REPLY_MAX_CHARS)

    def re_strings(self, args: dict[str, Any]) -> str:
        real = self._need_exists(self.resolve(args.get("path")))
        if not real.is_file():
            raise ToolError("That path is a folder; pass a file.")
        if any(fnmatch.fnmatch(real.name.lower(), p) for p in SECRET_FILE_PATTERNS):
            raise ToolError("That file looks like it holds secrets and is not readable here.")
        native = registry.optional_module("native")
        fn: Callable[..., str] = getattr(native, "strings", None) or data_files.strings
        text = fn(
            real,
            min_len=_int(args, "min_len", 6, 3, 100) or 6,
            grep=args.get("grep") or None,
            section=args.get("section") or None,
            max_results=_int(args, "max_results", 200, 1, 1000) or 200,
        )
        return wrap_untrusted(_src("strings", self.display(real)), text, REPLY_MAX_CHARS)

    def _native(self, tool: str, args: dict[str, Any], fn_name: str, **extra: Any) -> str:
        real = self._need_exists(self.resolve(args.get("path")))
        if not real.is_file():
            raise ToolError("Pass a file, not a folder.")
        native = registry.optional_module("native")
        fn = getattr(native, fn_name, None)
        if not callable(fn):
            raise ToolError(MISSING_NATIVE.format(tool=tool))
        if not (args.get("symbol") or args.get("address")):
            raise ToolError("Give a symbol or an address.")
        text = fn(real, symbol=args.get("symbol") or None, address=args.get("address") or None, **extra)
        return wrap_untrusted(_src(fn_name, self.display(real)), str(text), REPLY_MAX_CHARS)

    def re_disassemble(self, args: dict[str, Any]) -> str:
        return self._native("re_disassemble", args, "disassemble", max_instructions=_int(args, "max_instructions", 200, 1, 2000) or 200)

    def re_xrefs(self, args: dict[str, Any]) -> str:
        return self._native("re_xrefs", args, "xrefs")

    def re_fetch(self, args: dict[str, Any]) -> str:
        if not self.target or self.target.kind != "url":
            raise ToolError("re_fetch is only for website targets.")
        url = str(args.get("url") or "").strip()
        host = url_host(self.target.value)
        if url_host(url) != host or not url.lower().startswith("https://"):
            raise ToolError(f"Only https pages on {host} can be fetched.")
        website = registry.optional_module("website")
        fn = getattr(website, "fetch", None)
        if not callable(fn):
            raise ToolError("Website analysis is not available in this build.")
        try:
            body = str(fn(url, allowed_host=host))
        except ValueError as exc:
            raise ToolError(str(exc)) from None
        return wrap_untrusted(_src("fetch", host), body, REPLY_MAX_CHARS)

    # ── protocol ─────────────────────────────────────────────────────

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
            return self.call(str(params.get("name") or ""), params.get("arguments") or {})
        raise RuntimeError(f"Unsupported MCP method: {method}")

    def call(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        try:
            if self.target_error:
                raise ToolError(self.target_error)
            handler = getattr(self, name, None) if name in {t["name"] for t in tool_definitions()} else None
            if handler is None:
                raise ToolError(f"Unknown tool: {name}")
            if not isinstance(arguments, dict):
                raise ToolError("Arguments must be an object.")
            text, is_error = handler(arguments), False
        except ToolError as exc:
            text, is_error = str(exc), True
        except Exception as exc:  # noqa: BLE001 - never crash the stdio loop
            text, is_error = f"{name} failed: {type(exc).__name__}", True
        result: dict[str, Any] = {"content": [{"type": "text", "text": text}]}
        if is_error:
            result["isError"] = True
        return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="reverse.mcp")
    parser.add_argument("--target-kind", required=True, choices=["workspace", "path", "url"])
    parser.add_argument("--target", default="")
    parser.add_argument("--root", default=".")
    parser.add_argument("--allow-websites", default="0")
    parser.add_argument("--max-target-mb", type=int, default=500)
    ns = parser.parse_args(argv)
    server = ReverseServer(ns.target_kind, ns.target, ns.root, ns.allow_websites not in ("0", "false", ""), ns.max_target_mb)
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
