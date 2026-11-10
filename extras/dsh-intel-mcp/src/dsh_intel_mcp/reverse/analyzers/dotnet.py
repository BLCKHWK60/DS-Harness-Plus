"""`.NET` assembly analyzer: CLI metadata via dnfile (assembly identity, references,
types and methods, P/Invoke, resources, #US user strings). Static only."""

from __future__ import annotations

import logging
import struct
from pathlib import Path
from typing import Any

from dsh_intel_mcp.reverse.analyzers import (
    AnalyzeContext,
    Analyzer,
    AnalyzerResult,
    register,
)
from dsh_intel_mcp.reverse.analyzers.native import expired

logger = logging.getLogger(__name__)

TYPE_CAP = 1500
METHODS_PER_TYPE_CAP = 40
PINVOKE_CAP = 500
RESOURCE_CAP = 500
USER_STRING_CAP = 1000
USER_STRING_MIN = 4
REFERENCE_CAP = 300


def has_cli_header(path: Path) -> bool:
    """True when the PE optional header's COM descriptor (CLR) data directory is populated."""
    try:
        with path.open("rb") as fh:
            head = fh.read(64)
            if head[:2] != b"MZ" or len(head) < 64:
                return False
            (lfanew,) = struct.unpack("<I", head[60:64])
            fh.seek(lfanew)
            pe = fh.read(24 + 240)
    except OSError:
        return False
    if len(pe) < 24 + 96 or pe[:4] != b"PE\x00\x00":
        return False
    opt = pe[24:]
    (magic,) = struct.unpack("<H", opt[:2])
    if magic == 0x10B:
        dirs_at, count_at = 96, 92
    elif magic == 0x20B:
        dirs_at, count_at = 112, 108
    else:
        return False
    if len(opt) < dirs_at + 8 * 15:
        return False
    (count,) = struct.unpack("<I", opt[count_at : count_at + 4])
    if count <= 14:
        return False
    rva, size = struct.unpack("<II", opt[dirs_at + 8 * 14 : dirs_at + 8 * 15])
    return rva != 0 and size != 0


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    return str(value)


def _rows(table: Any) -> list[Any]:
    if table is None:
        return []
    rows = getattr(table, "rows", None)
    return list(rows) if rows else []


def _row_of(ref: Any) -> Any:
    return getattr(ref, "row", ref)


def _version(row: Any) -> str:
    parts = [getattr(row, n, None) for n in ("MajorVersion", "MinorVersion", "BuildNumber", "RevisionNumber")]
    return ".".join(str(p) for p in parts if p is not None)


def build_facts(pe: Any, ctx: AnalyzeContext | None = None) -> tuple[dict[str, Any], list[str]]:
    """Facts from a dnfile.dnPE-shaped object (duck-typed so tests can pass a stub)."""
    limitations: list[str] = []
    net = pe.net
    tables = net.mdtables
    facts: dict[str, Any] = {}

    overview: dict[str, Any] = {}
    asm_rows = _rows(getattr(tables, "Assembly", None))
    if asm_rows:
        asm = asm_rows[0]
        overview["assembly_name"] = _text(getattr(asm, "Name", ""))
        overview["assembly_version"] = _version(asm)
        overview["culture"] = _text(getattr(asm, "Culture", ""))
    try:
        overview["runtime_version"] = _text(net.metadata.struct.Version).rstrip("\x00")
    except Exception:  # noqa: BLE001
        pass
    facts["overview"] = overview

    facts["references"] = [
        f"{_text(getattr(r, 'Name', ''))} {_version(r)}".strip() for r in _rows(getattr(tables, "AssemblyRef", None))
    ][:REFERENCE_CAP]
    facts["module_references"] = [_text(getattr(r, "Name", "")) for r in _rows(getattr(tables, "ModuleRef", None))][:REFERENCE_CAP]

    types: list[dict[str, Any]] = []
    type_rows = _rows(getattr(tables, "TypeDef", None))
    for row in type_rows[:TYPE_CAP]:
        ns = _text(getattr(row, "TypeNamespace", ""))
        name = _text(getattr(row, "TypeName", ""))
        methods: list[str] = []
        try:
            for ref in getattr(row, "MethodList", None) or []:
                m = _row_of(ref)
                if m is not None and getattr(m, "Name", None) is not None:
                    methods.append(_text(m.Name))
                if len(methods) >= METHODS_PER_TYPE_CAP:
                    break
        except Exception:  # noqa: BLE001
            pass
        types.append({"type": f"{ns}.{name}" if ns else name, "methods": methods})
    facts["types"] = types
    if len(type_rows) > TYPE_CAP:
        limitations.append(f"type list capped at {TYPE_CAP} of {len(type_rows)}")

    pinvoke = []
    for row in _rows(getattr(tables, "ImplMap", None))[:PINVOKE_CAP]:
        scope = _row_of(getattr(row, "ImportScope", None))
        pinvoke.append(
            {
                "dll": _text(getattr(scope, "Name", "")) if scope is not None else "",
                "entry": _text(getattr(row, "ImportName", "")),
            }
        )
    facts["pinvoke"] = pinvoke

    resources: list[dict[str, Any]] = []
    try:
        for res in (getattr(net, "resources", None) or [])[:RESOURCE_CAP]:
            data = getattr(res, "data", None)
            resources.append({"name": _text(getattr(res, "name", "")), "size": len(data) if data is not None else None})
    except Exception:  # noqa: BLE001
        pass
    if not resources:
        for row in _rows(getattr(tables, "ManifestResource", None))[:RESOURCE_CAP]:
            resources.append({"name": _text(getattr(row, "Name", "")), "size": None})
    facts["resources"] = resources

    facts["user_strings"] = _user_strings(net, ctx, limitations)
    facts["counts"] = {
        "types": len(type_rows),
        "methods": len(_rows(getattr(tables, "MethodDef", None))),
        "pinvoke": len(_rows(getattr(tables, "ImplMap", None))),
        "assembly_references": len(facts["references"]),
    }
    return facts, limitations


def _user_strings(net: Any, ctx: AnalyzeContext | None, limitations: list[str]) -> list[str]:
    heap = getattr(net, "user_strings", None)
    if heap is None:
        return []
    out: list[str] = []
    try:
        total = int(heap.sizeof())
    except Exception:  # noqa: BLE001
        total = 0
    offset = 1
    steps = 0
    try:
        while offset < total and len(out) < USER_STRING_CAP:
            steps += 1
            if steps > 400_000 or (steps % 5000 == 0 and expired(ctx)):
                limitations.append("#US heap scan stopped early (size or deadline)")
                break
            raw, consumed = heap.get_with_size(offset)
            if consumed <= 0:
                break
            offset += consumed
            if raw:
                text = raw.decode("utf-16le", "replace").strip("\x00")
                if len(text) >= USER_STRING_MIN and text.isprintable():
                    out.append(text)
    except Exception as exc:  # noqa: BLE001
        limitations.append(f"#US heap read stopped: {type(exc).__name__}")
    if len(out) >= USER_STRING_CAP:
        limitations.append(f"user strings capped at {USER_STRING_CAP}")
    return out


def _detect(path: Path) -> bool:
    return has_cli_header(path)


def _run(path: Path, ctx: AnalyzeContext) -> AnalyzerResult:
    try:
        if path.stat().st_size > ctx.max_bytes:
            return AnalyzerResult(".NET assembly exceeds the analysis size cap", {}, [f"file exceeds max_bytes ({ctx.max_bytes})"])
        import dnfile  # lazy: optional dependency
    except ImportError as exc:
        return AnalyzerResult(".NET analysis unavailable", {}, [f"dnfile is not installed ({exc})"])
    except OSError as exc:
        return AnalyzerResult(".NET assembly could not be read", {}, [f"read failure: {exc}"])
    try:
        pe = dnfile.dnPE(str(path))
        if getattr(pe, "net", None) is None or getattr(pe.net, "mdtables", None) is None:
            return AnalyzerResult("no CLI metadata found", {}, ["PE has no parsable .NET metadata"])
        facts, limitations = build_facts(pe, ctx)
    except Exception as exc:  # noqa: BLE001
        return AnalyzerResult(".NET metadata could not be parsed", {}, [f"parse failure: {type(exc).__name__}: {exc}"])
    ov = facts["overview"]
    summary = (
        f".NET assembly {ov.get('assembly_name') or '?'} {ov.get('assembly_version', '')}: "
        f"{facts['counts']['types']} types, {facts['counts']['methods']} methods, "
        f"{len(facts['pinvoke'])} P/Invoke, {len(facts['user_strings'])} user strings"
    )
    limitations.append("IL bytecode is not decompiled; only metadata is reported")
    return AnalyzerResult(summary, facts, limitations)


register(
    Analyzer(
        name="dotnet",
        title=".NET assembly",
        detect=_detect,
        run=_run,
    )
)
