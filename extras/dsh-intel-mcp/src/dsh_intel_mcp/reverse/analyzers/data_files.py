"""Data files: SQLite, HAR, plist, JSON, env-like files and a strings() fallback.

Files are only read, never loaded as code. SQLite opens read-only and
immutable. Secrets stay out of the facts: HAR/plist/JSON report names and
shapes, env-like files report key names, and sensitive columns are masked.
"""
from __future__ import annotations

import base64
import fnmatch
import json
import plistlib
import re
import sqlite3
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlsplit, parse_qsl

from dsh_intel_mcp.reverse.analyzers import AnalyzeContext, Analyzer, AnalyzerResult, register
from dsh_intel_mcp.reverse.evidence import REDACTED, is_secret_key, mask_value

VALUE_MAX = 80
SAMPLE_ROWS = 3
MAX_TABLES = 200
MAX_SHAPE_KEYS = 40
MAX_SHAPE_DEPTH = 5
MAX_HAR_ENDPOINTS = 500
STRINGS_SCAN_BYTES = 64 * 1024 * 1024
_SQLITE_MAGIC = b"SQLite format 3\x00"
_ARCHIVE_MAGICS = (b"PK\x03\x04", b"7z\xbc\xaf\x27\x1c", b"\x1f\x8b", b"BZh", b"\xfd7zXZ\x00")
_SCHEME_RE = re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{6,}")
_SECRET_TEXT_RE = re.compile(
    r"(?i)\b(authorization|bearer|passw(?:or)?d|secret|token|api[_-]?key|cookie)\b(\s*[:=]\s*|\s+)([^\s\"',;]{3,})"
)


# ── helpers ──────────────────────────────────────────────────────────────


def _trunc(value: str, limit: int = VALUE_MAX) -> str:
    return value if len(value) <= limit else value[: limit - 1] + "…"


def _sample_value(value: Any) -> Any:
    if isinstance(value, (bytes, bytearray, memoryview)):
        return f"<blob {len(value)} bytes>"
    if isinstance(value, str):
        return _trunc(value)
    return value


def _quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def sniff(path: Path) -> str:
    """'sqlite', 'plist', 'har', 'json', 'env', 'archive' or 'other' from content and name."""
    name = path.name.lower()
    try:
        with open(path, "rb") as fh:
            head = fh.read(4096)
    except OSError:
        return "other"
    if head.startswith(_SQLITE_MAGIC):
        return "sqlite"
    if head.startswith(b"bplist00"):
        return "plist"
    if head.startswith(_ARCHIVE_MAGICS):
        return "archive"
    stripped = head.lstrip(b"\xef\xbb\xbf \t\r\n")
    if stripped.startswith(b"<?xml") and b"<plist" in head:
        return "plist"
    if name.startswith(".env") or name.endswith(".env"):
        return "env"
    if name.endswith(".har"):
        return "har"
    if stripped[:1] in (b"{", b"["):
        return "har" if b'"entries"' in head and b'"log"' in head else "json"
    return "other"


def shape(value: Any, depth: int = 0) -> Any:
    """Keys and value types only; never values."""
    if depth >= MAX_SHAPE_DEPTH:
        return "…"
    if isinstance(value, dict):
        out = {str(k): shape(v, depth + 1) for k, v in list(value.items())[:MAX_SHAPE_KEYS]}
        if len(value) > MAX_SHAPE_KEYS:
            out["…"] = f"{len(value) - MAX_SHAPE_KEYS} more keys"
        return out
    if isinstance(value, list):
        return [shape(value[0], depth + 1), f"({len(value)} items)"] if value else []
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if value is None:
        return "null"
    if isinstance(value, (bytes, bytearray)):
        return "data"
    if hasattr(value, "isoformat"):
        return "date"
    return "string"


def mask_secrets(text: str) -> str:
    """``text`` with values after secret-looking names (token=..., Bearer ...) masked."""
    text = mask_value(text)
    text = _SCHEME_RE.sub(lambda m: f"{m.group(1)} {REDACTED}", text)
    return _SECRET_TEXT_RE.sub(lambda m: f"{m.group(1)}{m.group(2)}{REDACTED}", text)


# ── sqlite ───────────────────────────────────────────────────────────────


def _sqlite(path: Path, deadline: float | None = None) -> tuple[dict[str, Any], str, list[str]]:
    uri = f"file:{quote(str(path))}?mode=ro&immutable=1"
    conn = sqlite3.connect(uri, uri=True)
    if deadline:
        # A hostile view or recursive query must not outlive the analysis deadline.
        conn.set_progress_handler(lambda: 1 if time.monotonic() > deadline else 0, 20_000)
    conn.text_factory = lambda b: b.decode("utf-8", "replace")
    limits: list[str] = []
    tables: list[dict[str, Any]] = []
    try:
        rows = conn.execute("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()
        if len(rows) > MAX_TABLES:
            limits.append(f"Only the first {MAX_TABLES} of {len(rows)} tables are listed.")
        for name, kind in rows[:MAX_TABLES]:
            ident = _quote_ident(name)
            info = conn.execute(f"PRAGMA table_info({ident})").fetchall()
            columns = [{"name": c[1], "type": c[2], "pk": bool(c[5])} for c in info]
            names = [c["name"] for c in columns]
            entry: dict[str, Any] = {"table": name, "kind": kind, "columns": columns}
            try:
                entry["indexes"] = [
                    {"name": i[1], "unique": bool(i[2]), "columns": [c[2] for c in conn.execute(f"PRAGMA index_info({_quote_ident(i[1])})")]}
                    for i in conn.execute(f"PRAGMA index_list({ident})").fetchall()
                ]
                entry["row_count"] = conn.execute(f"SELECT COUNT(*) FROM {ident}").fetchone()[0]
                samples = conn.execute(f"SELECT * FROM {ident} LIMIT {SAMPLE_ROWS}").fetchall()
                entry["sample_rows"] = [
                    {n: (REDACTED if is_secret_key(n) and v is not None else _sample_value(v)) for n, v in zip(names, row)} for row in samples
                ]
            except sqlite3.Error as exc:
                limits.append(f"Table {name}: {type(exc).__name__}")
            tables.append(entry)
    finally:
        conn.close()
    total = sum(t.get("row_count", 0) for t in tables)
    summary = f"SQLite database with {len(tables)} table(s) and {total} row(s)"
    return {"tables": tables}, summary, limits


# ── HAR ──────────────────────────────────────────────────────────────────

_ID_SEGMENT_RE = re.compile(r"^(\d+|[0-9a-fA-F]{8,}|[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}|[A-Za-z0-9_\-]{20,})$")


def path_template(path: str) -> str:
    segments = [("{id}" if _ID_SEGMENT_RE.match(s) else s) for s in path.split("/")]
    return "/".join(segments) or "/"


def _json_body(text: str | None, encoding: str | None = None) -> Any:
    if not text:
        return None
    try:
        if encoding == "base64":
            text = base64.b64decode(text).decode("utf-8", "replace")
        return json.loads(text)
    except (ValueError, TypeError):
        return None


def _graphql_ops(body: Any) -> list[str]:
    ops = []
    for item in body if isinstance(body, list) else [body]:
        if isinstance(item, dict) and ("query" in item or "operationName" in item):
            name = item.get("operationName")
            if not name and isinstance(item.get("query"), str):
                m = re.search(r"\b(?:query|mutation|subscription)\s+([A-Za-z_]\w*)", item["query"])
                name = m.group(1) if m else "(anonymous)"
            ops.append(str(name or "(anonymous)"))
    return ops


def _har(data: Any) -> tuple[dict[str, Any], str, list[str]]:
    entries = ((data or {}).get("log") or {}).get("entries") if isinstance(data, dict) else None
    if not isinstance(entries, list):
        raise ValueError("Not a HAR file (no log.entries).")
    groups: "OrderedDict[tuple[str, str, str], dict[str, Any]]" = OrderedDict()
    limits = ["Header names, query parameter names and body shapes only: values, cookies and credentials are never recorded."]
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        req, res = entry.get("request") or {}, entry.get("response") or {}
        parts = urlsplit(str(req.get("url") or ""))
        # hostname + port only: ``netloc`` can carry ``user:password@``
        host = (parts.hostname or "").lower()
        try:
            port = parts.port
        except ValueError:
            port = None
        key = (str(req.get("method") or "GET").upper(), host + (f":{port}" if port else ""), path_template(parts.path))
        if key not in groups and len(groups) >= MAX_HAR_ENDPOINTS:
            continue
        g = groups.setdefault(
            key,
            {
                "method": key[0], "host": key[1], "path": key[2], "count": 0, "statuses": set(), "content_types": set(),
                "query_params": set(), "request_headers": set(), "response_headers": set(), "request_shape": None,
                "response_shape": None, "graphql": set(),
            },
        )
        g["count"] += 1
        g["statuses"].add(res.get("status"))
        mime = ((res.get("content") or {}).get("mimeType") or "").split(";")[0].strip()
        if mime:
            g["content_types"].add(mime)
        g["query_params"].update(k for k, _ in parse_qsl(parts.query, keep_blank_values=True))
        g["request_headers"].update(str(h.get("name", "")).lower() for h in req.get("headers") or [] if isinstance(h, dict))
        g["response_headers"].update(str(h.get("name", "")).lower() for h in res.get("headers") or [] if isinstance(h, dict))
        req_body = _json_body((req.get("postData") or {}).get("text"))
        if req_body is not None and g["request_shape"] is None:
            g["request_shape"] = shape(req_body)
        g["graphql"].update(_graphql_ops(req_body))
        content = res.get("content") or {}
        res_body = _json_body(content.get("text"), content.get("encoding"))
        if res_body is not None and g["response_shape"] is None:
            g["response_shape"] = shape(res_body)
    endpoints = []
    for g in groups.values():
        endpoints.append(
            {**g, **{k: sorted(g[k], key=str) for k in ("statuses", "content_types", "query_params", "request_headers", "response_headers", "graphql")}}
        )
    hosts = sorted({e["host"] for e in endpoints})
    summary = f"HAR capture with {len(entries)} request(s) across {len(hosts)} host(s) and {len(endpoints)} endpoint(s)"
    return {"endpoints": endpoints, "hosts": hosts}, summary, limits


# ── plist / json / env / strings ─────────────────────────────────────────


def _plist(path: Path) -> tuple[dict[str, Any], str, list[str]]:
    with open(path, "rb") as fh:
        data = plistlib.load(fh)
    tree = shape(data)
    keys = list(data.keys()) if isinstance(data, dict) else []
    return {"keys": keys, "tree": [tree]}, f"Property list with {len(keys)} top-level key(s)", ["Plist values are not recorded: keys and types only."]


def _json(path: Path, max_bytes: int) -> tuple[dict[str, Any], str, list[str]]:
    if path.stat().st_size > max_bytes:
        raise ValueError("The JSON file is larger than the analysis size limit.")
    with open(path, "rb") as fh:
        data = json.loads(fh.read().decode("utf-8-sig", "replace"))
    return {"shape": [shape(data)]}, "JSON document", ["JSON values are not recorded: keys and types only."]


def _env(path: Path) -> tuple[dict[str, Any], str, list[str]]:
    keys = []
    for line in path.read_text("utf-8", "replace").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            keys.append(line.split("=", 1)[0].removeprefix("export ").strip())
    return {"keys": keys}, f"Environment-style file with {len(keys)} key(s)", ["Values are never recorded: key names only."]


SECRET_FILE_PATTERNS = (".env*", "*.pem", "*.key", "id_rsa*", "id_dsa*", "id_ecdsa*", "id_ed25519*", "*.p12", "*.pfx", "*.keychain*", "*.kdbx", "credentials", "*.jks", "*.keystore")


def is_secret_file(path: Path) -> bool:
    name = path.name.lower()
    return any(fnmatch.fnmatch(name, p) for p in SECRET_FILE_PATTERNS)


_ASCII_RE = {}
_UTF16_RE = {}


def extract_strings(path: Path, min_len: int = 6, grep: str | None = None, max_results: int = 200) -> list[str]:
    """Printable ASCII and UTF-16LE runs of at least ``min_len`` characters, secrets masked."""
    if is_secret_file(path):
        return []  # keys, certificates and env files: never dump their strings
    min_len = max(3, int(min_len))
    ascii_re = _ASCII_RE.setdefault(min_len, re.compile(rb"[\x20-\x7e\t]{%d,}" % min_len))
    utf16_re = _UTF16_RE.setdefault(min_len, re.compile(rb"(?:[\x20-\x7e]\x00){%d,}" % min_len))
    with open(path, "rb") as fh:
        data = fh.read(STRINGS_SCAN_BYTES)
    found: list[tuple[int, str]] = [(m.start(), m.group().decode("ascii")) for m in ascii_re.finditer(data)]
    found += [(m.start(), m.group().decode("utf-16-le")) for m in utf16_re.finditer(data)]
    found.sort()
    needle = grep.lower() if grep else None
    out: list[str] = []
    for _, text in found:
        if needle and needle not in text.lower():
            continue
        out.append(_trunc(mask_secrets(text), 300))
        if len(out) >= max(1, max_results):
            break
    return out


def strings(path: Path, min_len: int = 6, grep: str | None = None, section: str | None = None, max_results: int = 200) -> str:
    """Formatted ``extract_strings`` output; the generic fallback when the native analyzer is absent."""
    found = extract_strings(path, min_len, grep, max_results)
    header = f"{len(found)} string(s) of length >= {min_len}" + (f" matching '{grep}'" if grep else "")
    if section:
        header += " (sections need the native analyzer; whole file scanned)"
    return header + "\n" + "\n".join(found)


# ── analyzer ─────────────────────────────────────────────────────────────


def detect(path: Path) -> bool:
    return path.is_file() and sniff(path) != "archive"


def run(path: Path, ctx: AnalyzeContext) -> AnalyzerResult:
    kind = sniff(path)
    limits: list[str] = []
    try:
        if kind == "sqlite":
            facts, summary, limits = _sqlite(path, ctx.deadline)
        elif kind == "har":
            if path.stat().st_size > ctx.max_bytes:
                raise ValueError("The HAR file is larger than the analysis size limit.")
            with open(path, "rb") as fh:
                facts, summary, limits = _har(json.loads(fh.read().decode("utf-8-sig", "replace")))
        elif kind == "plist":
            facts, summary, limits = _plist(path)
        elif kind == "json":
            facts, summary, limits = _json(path, ctx.max_bytes)
        elif kind == "env":
            facts, summary, limits = _env(path)
        else:
            found = extract_strings(path, 6, None, 100)
            facts = {"strings": found}
            summary = f"Unrecognised file ({path.stat().st_size} bytes); {len(found)} string(s) sampled"
            limits = ["Not a known data format. Use re_strings with grep to search further."]
    except (ValueError, sqlite3.Error, plistlib.InvalidFileException, OSError) as exc:
        found = extract_strings(path, 6, None, 100)
        facts = {"strings": found}
        summary = f"{kind} file could not be parsed ({type(exc).__name__}); {len(found)} string(s) sampled"
        limits = [f"Parsing failed: {str(exc)[:200]}"]
    return AnalyzerResult(summary=summary, facts=facts, limitations=limits)


register(Analyzer("data_files", "Data files (SQLite, HAR, plist, JSON, strings)", detect, run))
