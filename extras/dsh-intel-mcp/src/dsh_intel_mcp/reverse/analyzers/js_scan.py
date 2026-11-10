"""Static facts from JavaScript and TypeScript text. Pure functions; nothing is executed.

Regex based and deliberately forgiving: minified bundles and half-broken
sources still yield what they contain. Every list is de-duplicated, sorted
and capped, and values that could be secrets (environment variable values,
header values) are never captured, only names.
"""
from __future__ import annotations

import re
from typing import Any

MAX_ITEMS = 300
_Q = r"""['"`]"""
_STR = r"""['"`]([^'"`\n]{1,300})['"`]"""

_REQUIRE_RE = re.compile(r"""\brequire\(\s*""" + _STR + r"\s*\)")
_IMPORT_FROM_RE = re.compile(r"""\bimport\s+(?:[\w*{}\s,$]+?\s+from\s+)?""" + _STR)
_DYNAMIC_IMPORT_RE = re.compile(r"""\bimport\(\s*""" + _STR + r"\s*\)")
_EXPORT_NAMED_RE = re.compile(
    r"\bexport\s+(?:async\s+)?(?:const|let|var|function\*?|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)"
)
_EXPORT_DEFAULT_RE = re.compile(r"\bexport\s+default\b")
_EXPORTS_ASSIGN_RE = re.compile(r"\b(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=")
_MODULE_EXPORTS_OBJ_RE = re.compile(r"\bmodule\.exports\s*=\s*\{")

_IPC_MAIN_RE = re.compile(r"\bipcMain\.(handle|handleOnce|on|once)\(\s*" + _STR)
_IPC_RENDERER_RE = re.compile(r"\bipcRenderer\.(invoke|send|sendSync|sendToHost|on|once)\(\s*" + _STR)
_WEBCONTENTS_SEND_RE = re.compile(r"\b(?:webContents|win|window|mainWindow)\w*\.send\(\s*" + _STR)

_BRIDGE_RE = re.compile(r"\bcontextBridge\.exposeInMainWorld\(\s*" + _STR + r"\s*,\s*")
_PRELOAD_RE = re.compile(r"\bpreload\s*:\s*((?:[\w.]+\([^)]*\))|[^,}\n]+)")
_BROWSER_WINDOW_RE = re.compile(r"\bnew\s+(?:Electron\.)?BrowserWindow\s*\(")
_WEBPREFS_RE = re.compile(r"\bwebPreferences\s*:\s*\{")
_FLAG_RE = re.compile(r"""(?:^|[,{\s])['"]?([A-Za-z]\w*)['"]?\s*:\s*([^,}\n]+)""")

_SCHEME_RE = re.compile(r"\bprotocol\.(registerSchemesAsPrivileged|handle|registerFileProtocol|registerHttpProtocol|registerStringProtocol|registerBufferProtocol|registerStreamProtocol)\(")
_SCHEME_NAME_RE = re.compile(r"""\bscheme\s*:\s*""" + _STR)
_PROTOCOL_HANDLE_RE = re.compile(r"""\bprotocol\.(?:handle|register\w+Protocol)\(\s*""" + _STR)
_DEFAULT_CLIENT_RE = re.compile(r"""\bapp\.setAsDefaultProtocolClient\(\s*""" + _STR)
_OPEN_EXTERNAL_RE = re.compile(r"\bshell\.openExternal\(")

_FETCH_RE = re.compile(r"\bfetch\(\s*" + _STR)
_AXIOS_RE = re.compile(r"\baxios(?:\.(?:get|post|put|patch|delete|head|request))?\(\s*" + _STR)
_XHR_RE = re.compile(r"""\.open\(\s*['"](?:GET|POST|PUT|PATCH|DELETE|HEAD)['"]\s*,\s*""" + _STR, re.I)
_NET_REQUEST_RE = re.compile(r"\b(?:net\.request|net\.fetch|got|ky)(?:\.\w+)?\(\s*" + _STR)
_API_ROUTE_RE = re.compile(r"""['"`](/api/[A-Za-z0-9_\-./{}:$@%]*)['"`]""")
_ENV_DOT_RE = re.compile(r"\bprocess\.env\.([A-Za-z_][A-Za-z0-9_]*)")
_ENV_BRACKET_RE = re.compile(r"""\bprocess\.env\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\]""")
_SOURCEMAP_RE = re.compile(r"[/#@*]+\s*#?\s*sourceMappingURL=([^\s'\"*]+)")
_NODE_ADDON_RE = re.compile(r"""\b([\w./-]+\.node)\b""")
_URL_RE = re.compile(r"""https?://[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]{4,300}""")


def _cap(values: set[str] | list[str]) -> list[str]:
    return sorted(set(values))[:MAX_ITEMS]


def _matching_brace(text: str, start: int) -> int:
    """Index of the ``}`` closing the ``{`` at ``start``, or -1. Skips strings and comments."""
    depth = 0
    i = start
    n = len(text)
    quote = ""
    while i < n:
        ch = text[i]
        if quote:
            if ch == "\\":
                i += 2
                continue
            if ch == quote:
                quote = ""
        elif ch in "'\"`":
            quote = ch
        elif ch == "/" and i + 1 < n and text[i + 1] == "/":
            nl = text.find("\n", i)
            if nl == -1:
                return -1
            i = nl
        elif ch == "/" and i + 1 < n and text[i + 1] == "*":
            end = text.find("*/", i + 2)
            if end == -1:
                return -1
            i = end + 1
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def _top_level_members(body: str) -> list[str]:
    """Property and method names at depth 1 of an object literal body (without the outer braces)."""
    names: list[str] = []
    depth = 0
    i = 0
    n = len(body)
    quote = ""
    start = 0  # start of the current top-level segment
    segments: list[str] = []
    while i < n:
        ch = body[i]
        if quote:
            if ch == "\\":
                i += 2
                continue
            if ch == quote:
                quote = ""
        elif ch in "'\"`":
            quote = ch
        elif ch in "{[(":
            depth += 1
        elif ch in "}])":
            depth -= 1
        elif ch == "," and depth == 0:
            segments.append(body[start:i])
            start = i + 1
        i += 1
    segments.append(body[start:])
    for seg in segments:
        m = re.match(
            r"""\s*(?:(?:async|get|set|static)\s+)*\*?\s*(?:['"]([^'"]+)['"]|([A-Za-z_$][\w$]*))\s*(?=[:(,]|$|\s*\n)""",
            seg,
        )
        if m:
            names.append(m.group(1) or m.group(2))
    return names


def _object_after(text: str, pos: int) -> tuple[str, int] | None:
    """The ``{...}`` object literal starting at or after ``pos`` (whitespace only between), as (body, end)."""
    m = re.compile(r"\s*\{").match(text, pos)
    if not m:
        return None
    start = m.end() - 1
    end = _matching_brace(text, start)
    if end == -1:
        return None
    return text[start + 1 : end], end


def _line_of(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


def scan_text(text: str, *, path: str = "") -> dict[str, Any]:
    """Return the facts found in one JS/TS source text (see module docstring)."""
    out: dict[str, Any] = {}

    requires = {m.group(1) for m in _REQUIRE_RE.finditer(text)}
    requires |= {m.group(1) for m in _IMPORT_FROM_RE.finditer(text)}
    requires |= {m.group(1) for m in _DYNAMIC_IMPORT_RE.finditer(text)}
    out["imports"] = _cap(requires)

    exports = {m.group(1) for m in _EXPORT_NAMED_RE.finditer(text)}
    exports |= {m.group(1) for m in _EXPORTS_ASSIGN_RE.finditer(text)}
    if _EXPORT_DEFAULT_RE.search(text):
        exports.add("default")
    for m in _MODULE_EXPORTS_OBJ_RE.finditer(text):
        obj = _object_after(text, m.end() - 1)
        if obj:
            exports.update(_top_level_members(obj[0]))
    out["exports"] = _cap(exports)

    handlers: list[dict[str, Any]] = []
    callers: list[dict[str, Any]] = []
    listeners: list[dict[str, Any]] = []
    sends: list[dict[str, Any]] = []
    for m in _IPC_MAIN_RE.finditer(text):
        handlers.append({"channel": m.group(2), "kind": m.group(1), "line": _line_of(text, m.start())})
    for m in _IPC_RENDERER_RE.finditer(text):
        item = {"channel": m.group(2), "kind": m.group(1), "line": _line_of(text, m.start())}
        (listeners if m.group(1) in ("on", "once") else callers).append(item)
    for m in _WEBCONTENTS_SEND_RE.finditer(text):
        sends.append({"channel": m.group(1), "kind": "send", "line": _line_of(text, m.start())})
    out["ipc_handlers"] = handlers[:MAX_ITEMS]
    out["ipc_callers"] = callers[:MAX_ITEMS]
    out["ipc_listeners"] = listeners[:MAX_ITEMS]
    out["ipc_sends"] = sends[:MAX_ITEMS]

    bridges: list[dict[str, Any]] = []
    for m in _BRIDGE_RE.finditer(text):
        keys: list[str] = []
        obj = _object_after(text, m.end())
        if obj:
            keys = _top_level_members(obj[0])
        bridges.append({"key": m.group(1), "members": sorted(set(keys))[:MAX_ITEMS], "line": _line_of(text, m.start())})
    out["exposed_apis"] = bridges[:MAX_ITEMS]

    windows: list[dict[str, Any]] = []
    for m in _BROWSER_WINDOW_RE.finditer(text):
        obj = _object_after(text, m.end())
        if not obj:
            continue
        flags: dict[str, str] = {}
        wp = _WEBPREFS_RE.search(obj[0])
        if wp:
            start = wp.end() - 1
            end = _matching_brace(obj[0], start)
            if end != -1:
                inner = obj[0][start + 1 : end]
                for fm in _FLAG_RE.finditer(inner):
                    flags[fm.group(1)] = fm.group(2).strip()[:200]
                pm = _PRELOAD_RE.search(inner)
                if pm:
                    flags["preload"] = pm.group(1).strip()[:200]
        windows.append({"flags": flags, "line": _line_of(text, m.start())})
    out["browser_windows"] = windows[:MAX_ITEMS]

    protocols: set[str] = set()
    for m in _SCHEME_RE.finditer(text):
        if m.group(1) == "registerSchemesAsPrivileged":
            obj_end = _matching_brace(text, text.find("{", m.end())) if "{" in text[m.end() : m.end() + 400] else -1
            window = text[m.end() : obj_end if obj_end != -1 else m.end() + 600]
            protocols.update(f"scheme:{s.group(1)}" for s in _SCHEME_NAME_RE.finditer(window))
    protocols.update(f"handle:{m.group(1)}" for m in _PROTOCOL_HANDLE_RE.finditer(text))
    protocols.update(f"default-client:{m.group(1)}" for m in _DEFAULT_CLIENT_RE.finditer(text))
    out["protocols"] = _cap(protocols)
    out["open_external_lines"] = [_line_of(text, m.start()) for m in _OPEN_EXTERNAL_RE.finditer(text)][:MAX_ITEMS]

    endpoints: set[str] = set()
    for rx in (_FETCH_RE, _AXIOS_RE, _XHR_RE, _NET_REQUEST_RE):
        endpoints.update(m.group(1) for m in rx.finditer(text))
    out["endpoints"] = _cap(endpoints)
    out["api_routes"] = _cap({m.group(1) for m in _API_ROUTE_RE.finditer(text)})
    out["urls"] = _cap({m.group(0).rstrip(".,;)") for m in _URL_RE.finditer(text)})
    out["env_names"] = _cap(
        {m.group(1) for m in _ENV_DOT_RE.finditer(text)} | {m.group(1) for m in _ENV_BRACKET_RE.finditer(text)}
    )
    out["source_map_comments"] = _cap({m.group(1) for m in _SOURCEMAP_RE.finditer(text)})
    out["native_addons"] = _cap({m.group(1) for m in _NODE_ADDON_RE.finditer(text) if len(m.group(1)) < 120})
    return out


def merge(into: dict[str, list[Any]], scanned: dict[str, Any], *, path: str) -> None:
    """Add one file's scan to an aggregate. Dict items gain a ``file`` key; strings are de-duplicated."""
    for key, values in scanned.items():
        if not isinstance(values, list):
            continue
        bucket = into.setdefault(key, [])
        for value in values:
            if isinstance(value, dict):
                bucket.append({**value, "file": path})
            elif value not in bucket:
                bucket.append(value)


def preload_name(flag_value: str) -> str | None:
    """The last string literal of a ``preload:`` expression, e.g. ``path.join(__dirname, 'preload.js')`` -> preload.js."""
    found = re.findall(r"""['"`]([^'"`]+)['"`]""", flag_value)
    return found[-1] if found else None
