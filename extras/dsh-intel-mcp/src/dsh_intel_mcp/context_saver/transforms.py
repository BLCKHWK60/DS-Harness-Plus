"""Deterministic text transforms for Context Saver.

Every function is a pure function of its input: no clock, no randomness, no
I/O. Each returns the shortened text; whether the saving is worth keeping is
policy's call (``policy.compress_text``).
"""
from __future__ import annotations

import html as html_lib
import json
import math
import re
from html.parser import HTMLParser
from typing import Any

# ── JSON ────────────────────────────────────────────────────────────────

JSON_MIN_ITEMS = 8
JSON_SCALAR_MIN_ITEMS = 20
JSON_HEAD = 3
JSON_TAIL = 2
JSON_MAX_EXTRA = 200
JSON_OUTLIER_Z = 3.0
JSON_MAX_OUTLIERS_PER_KEY = 10
JSON_MAX_DISTINCT = 12
JSON_MAX_KEYS = 30
STRING_CUT_OVER = 300
STRING_HEAD = 200
STRING_TAIL = 60

_ERROR_KEYS = frozenset({"error", "errors", "exception", "exceptions", "failed", "failure", "traceback", "fatal", "stacktrace"})
_STATUS_KEYS = frozenset({"status", "status_code", "statuscode", "http_status"})
_OK_KEYS = frozenset({"ok", "success"})
_LEVEL_KEYS = frozenset({"status", "level", "severity", "state", "result", "outcome"})
_ERROR_WORDS = frozenset({"error", "err", "failed", "failure", "fatal", "exception", "critical"})


def _cut(text: str) -> str:
    if len(text) <= STRING_CUT_OVER:
        return text
    omitted = len(text) - STRING_HEAD - STRING_TAIL
    return f"{text[:STRING_HEAD]}…[{omitted} chars cut]…{text[-STRING_TAIL:]}"


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _is_error_like(item: Any, depth: int = 0) -> bool:
    if not isinstance(item, dict):
        return False
    for key, value in item.items():
        name = str(key).lower()
        if name in _ERROR_KEYS and value not in (None, False, "", 0) and value != [] and value != {}:
            return True
        if name in _STATUS_KEYS and isinstance(value, int) and not isinstance(value, bool) and value >= 400:
            return True
        if name in _OK_KEYS and value is False:
            return True
        if name in _LEVEL_KEYS and isinstance(value, str) and value.lower() in _ERROR_WORDS:
            return True
        if depth < 2 and isinstance(value, dict) and _is_error_like(value, depth + 1):
            return True
    return False


def _type_name(value: Any) -> str:
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int"
    if isinstance(value, float):
        return "float"
    if isinstance(value, str):
        return "str"
    if value is None:
        return "null"
    return "list" if isinstance(value, list) else "obj"


def _schema(items: list[Any]) -> str:
    order: list[str] = []
    types: dict[str, dict[str, int]] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        for key, value in item.items():
            if key not in types:
                if len(order) >= JSON_MAX_KEYS:
                    continue
                order.append(key)
                types[key] = {}
            counts = types[key]
            name = _type_name(value)
            counts[name] = counts.get(name, 0) + 1
    parts = []
    for key in order:
        ranked = sorted(types[key].items(), key=lambda kv: (-kv[1], kv[0]))
        parts.append(f"{key}:{'/'.join(name for name, _ in ranked[:2])}")
    return ", ".join(parts)


def _outliers(items: list[Any]) -> dict[str, list[int]]:
    """Per numeric key, the indexes of items more than 3 standard deviations from the mean."""
    keys: list[str] = []
    for item in items:
        if isinstance(item, dict):
            for key in item:
                if key not in keys and len(keys) < JSON_MAX_KEYS:
                    keys.append(key)
    found: dict[str, list[int]] = {}
    for key in keys:
        points = [(i, it[key]) for i, it in enumerate(items) if isinstance(it, dict) and _is_number(it.get(key))]
        if len(points) < JSON_MIN_ITEMS:
            continue
        mean = sum(v for _, v in points) / len(points)
        std = math.sqrt(sum((v - mean) ** 2 for _, v in points) / len(points))
        if std == 0:
            continue
        scored = [(abs(v - mean) / std, i) for i, v in points]
        flagged = sorted(((z, i) for z, i in scored if z > JSON_OUTLIER_Z), key=lambda zi: (-zi[0], zi[1]))
        if flagged:
            found[key] = sorted(i for _, i in flagged[:JSON_MAX_OUTLIERS_PER_KEY])
    return found


def _label(value: Any) -> str:
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)


def _value_counts(items: list[Any]) -> dict[str, dict[str, int]]:
    """Counts for keys with few distinct scalar values, present in at least half of the items."""
    total = len(items)
    seen: dict[str, dict[Any, int]] = {}
    present: dict[str, int] = {}
    dropped: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        for key, value in item.items():
            if key in dropped:
                continue
            if not (value is None or isinstance(value, (str, bool, int))) or (isinstance(value, str) and len(value) > 60):
                dropped.add(key)
                seen.pop(key, None)
                continue
            if key not in seen and len(seen) + len(dropped) >= JSON_MAX_KEYS * 4:
                continue
            counts = seen.setdefault(key, {})
            counts[(type(value).__name__, value)] = counts.get((type(value).__name__, value), 0) + 1
            present[key] = present.get(key, 0) + 1
            if len(counts) > JSON_MAX_DISTINCT:
                dropped.add(key)
                seen.pop(key, None)
    result: dict[str, dict[str, int]] = {}
    for key, counts in seen.items():
        if present.get(key, 0) * 2 < total or len(counts) > max(1, min(JSON_MAX_DISTINCT, total // 2)):
            continue
        ranked = sorted(counts.items(), key=lambda kv: (-kv[1], _label(kv[0][1])))
        result[key] = {_label(value): n for (_, value), n in ranked}
        if len(result) >= JSON_MAX_KEYS:
            break
    return result


def _crushable(items: list[Any]) -> bool:
    if len(items) >= JSON_MIN_ITEMS:
        dicts = sum(1 for it in items if isinstance(it, dict))
        if dicts * 2 >= len(items):
            return True
    return len(items) >= JSON_SCALAR_MIN_ITEMS


def _crush_list(items: list[Any]) -> Any:
    n = len(items)
    keep = set(range(min(JSON_HEAD, n))) | set(range(max(0, n - JSON_TAIL), n))
    extras: list[int] = [i for i, item in enumerate(items) if i not in keep and _is_error_like(item)][:JSON_MAX_EXTRA]
    keep.update(extras)
    outliers = _outliers(items)
    flagged = sorted({i for indexes in outliers.values() for i in indexes} - keep)[:JSON_MAX_EXTRA]
    keep.update(flagged)
    if len(keep) >= n:
        return [_crush(item) for item in items]
    meta: dict[str, Any] = {"total": n, "kept": len(keep), "omitted": n - len(keep)}
    schema = _schema(items)
    if schema:
        meta["schema"] = schema
    meta["kept_indexes"] = sorted(keep)
    if extras:
        meta["error_like_indexes"] = extras
    if outliers:
        meta["outlier_indexes"] = outliers
    counts = _value_counts(items)
    if counts:
        meta["value_counts"] = counts
    return {"_context_saver": meta, "items_kept": [_crush(items[i]) for i in sorted(keep)]}


def _crush(node: Any) -> Any:
    if isinstance(node, dict):
        return {key: _crush(value) for key, value in node.items()}
    if isinstance(node, list):
        return _crush_list(node) if _crushable(node) else [_crush(value) for value in node]
    if isinstance(node, str):
        return _cut(node)
    return node


def _parse_json(text: str) -> Any:
    stripped = text.strip()
    try:
        return json.loads(stripped)
    except ValueError:
        pass
    rows = []
    for line in stripped.split("\n"):
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def json_crush(text: str) -> str:
    """Shrink big JSON arrays: schema, first 3, last 2, error-like items, outliers, value counts.

    Always valid JSON. A top-level array becomes ``{"_context_saver": {...},
    "items_kept": [...]}``; objects keep their shape and each big array inside
    is crushed the same way. Text that is not JSON comes back unchanged.
    """
    try:
        value = _parse_json(text)
    except ValueError:
        return text
    if not isinstance(value, (dict, list)):
        return text
    return json.dumps(_crush(value), ensure_ascii=False, separators=(",", ":"))


# ── logs ────────────────────────────────────────────────────────────────

LOG_FIRST = 20
LOG_LAST = 30
LOG_CONTEXT = 2
LOG_TOP_TEMPLATES = 6
LOG_REPEAT_MIN = 3
TEMPLATE_MAX = 160

_IMPORTANT = re.compile(r"(?i)\b(?:errors?|warn(?:ing)?s?|fail(?:ed|ure|ures|s)?|exception|traceback|fatal|panic)\b")
_TS = re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?|\b\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\b")
_UUID = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")
_HEX = re.compile(r"\b(?:0x[0-9a-fA-F]+|[0-9a-fA-F]{8,})\b")
_NUM = re.compile(r"\b\d+(?:\.\d+)?\b")


def _template(line: str) -> str:
    out = _TS.sub("<ts>", line)
    out = _UUID.sub("<uuid>", out)
    out = _HEX.sub("<hex>", out)
    out = _NUM.sub("<n>", out)
    out = " ".join(out.split())
    return out[:TEMPLATE_MAX]


def _plural(n: int) -> str:
    return "line" if n == 1 else "lines"


def _summarize_gap(gap: list[tuple[str, int]]) -> list[str]:
    counts: dict[str, int] = {}
    for line, count in gap:
        if not line.strip():
            continue
        template = _template(line)
        counts[template] = counts.get(template, 0) + count
    if not counts:
        return []
    ranked = sorted(counts.items(), key=lambda kv: -kv[1])
    out = [f"[{count} {_plural(count)} like: {template}]" for template, count in ranked[:LOG_TOP_TEMPLATES]]
    rest = ranked[LOG_TOP_TEMPLATES:]
    if rest:
        lines = sum(count for _, count in rest)
        out.append(f"[+{lines} more {_plural(lines)} in {len(rest)} other patterns]")
    return out


def log_fold(text: str) -> str:
    """Fold a log: exact repeats to ``(×N)``, near-duplicates to ``[N lines like: template]``.

    Lines with error/warn/fail/exception/traceback/fatal/panic stay, with two
    lines of context either side, as do the first 20 and last 30 lines.
    """
    lines = text.split("\n")
    entries: list[tuple[str, int]] = []
    for line in lines:
        if entries and entries[-1][0] == line:
            entries[-1] = (line, entries[-1][1] + 1)
        else:
            entries.append((line, 1))
    n = len(entries)
    keep = [False] * n
    for i in range(min(LOG_FIRST, n)):
        keep[i] = True
    for i in range(max(0, n - LOG_LAST), n):
        keep[i] = True
    for i, (line, _) in enumerate(entries):
        if _IMPORTANT.search(line):
            for j in range(max(0, i - LOG_CONTEXT), min(n, i + LOG_CONTEXT + 1)):
                keep[j] = True
    out: list[str] = []
    gap: list[tuple[str, int]] = []
    for i, (line, count) in enumerate(entries):
        if keep[i]:
            if gap:
                out.extend(_summarize_gap(gap))
                gap = []
            out.append(f"{line} (×{count})" if count > 1 else line)
        elif count >= LOG_REPEAT_MIN and line.strip():
            # An exact repeat is its own line, folded to (×N), rather than part of a pattern.
            if gap:
                out.extend(_summarize_gap(gap))
                gap = []
            out.append(f"{line} (×{count})")
        else:
            gap.append((line, count))
    if gap:
        out.extend(_summarize_gap(gap))
    return "\n".join(out)


# ── search output ───────────────────────────────────────────────────────

SEARCH_HITS_PER_FILE = 5
SEARCH_MAX_FILES = 30
SEARCH_HIT_MAX = 160

_SEARCH_HIT = re.compile(r"^([^:\s]+):(\d+)[:-](.*)$")


def search_fold(text: str) -> str:
    """Group grep-style ``path:line:text`` output by file: 5 hits per file, 30 files, with totals."""
    groups: dict[str, list[tuple[str, str]]] = {}
    other = 0
    for line in text.split("\n"):
        match = _SEARCH_HIT.match(line)
        if match is None:
            if line.strip():
                other += 1
            continue
        groups.setdefault(match.group(1), []).append((match.group(2), match.group(3).strip()[:SEARCH_HIT_MAX]))
    out: list[str] = []
    total_hits = sum(len(hits) for hits in groups.values())
    shown_files = list(groups.items())[:SEARCH_MAX_FILES]
    shown_hits = 0
    for path, hits in shown_files:
        suffix = f", showing {SEARCH_HITS_PER_FILE}" if len(hits) > SEARCH_HITS_PER_FILE else ""
        out.append(f"{path} ({len(hits)} {'hit' if len(hits) == 1 else 'hits'}{suffix})")
        for number, body in hits[:SEARCH_HITS_PER_FILE]:
            out.append(f"  {number}: {body}")
            shown_hits += 1
    omitted_files = len(groups) - len(shown_files)
    note = f"[{total_hits} hits in {len(groups)} files; showing {shown_hits}"
    if omitted_files:
        note += f"; {omitted_files} more files omitted"
    if other:
        note += f"; {other} other lines omitted"
    out.append(note + "]")
    return "\n".join(out)


# ── diffs ───────────────────────────────────────────────────────────────

DIFF_CONTEXT = 2
DIFF_BIG_HUNK = 150
DIFF_BIG_HEAD = 50
DIFF_BIG_TAIL = 20
DIFF_GAP_NOTE_MIN = 3

_HUNK_HEADER = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


def _trim_hunk(body: list[str]) -> list[str]:
    changed = [i for i, line in enumerate(body) if line[:1] in ("+", "-")]
    focus = changed
    skipped_changed = 0
    hole: tuple[int, int] | None = None
    if len(changed) > DIFF_BIG_HUNK:
        focus = changed[:DIFF_BIG_HEAD] + changed[-DIFF_BIG_TAIL:]
        middle = changed[DIFF_BIG_HEAD:-DIFF_BIG_TAIL]
        skipped_changed = len(middle)
        hole = (middle[0], middle[-1])
        added = sum(1 for i in middle if body[i][0] == "+")
        removed = skipped_changed - added
    keep: set[int] = set()
    for i in focus:
        keep.update(range(max(0, i - DIFF_CONTEXT), min(len(body), i + DIFF_CONTEXT + 1)))
    for i, line in enumerate(body):
        if line.startswith("\\") and i - 1 in keep:
            keep.add(i)
    out: list[str] = []
    gap = 0
    noted_hole = False
    for i, line in enumerate(body):
        in_hole = hole is not None and hole[0] <= i <= hole[1]
        if in_hole and i not in keep:
            if not noted_hole:
                out.append(f"[… {skipped_changed} changed lines omitted (+{added}/-{removed}) …]")
                noted_hole = True
            gap = 0
            continue
        if i in keep:
            if gap >= DIFF_GAP_NOTE_MIN:
                out.append(f"[… {gap} unchanged lines omitted …]")
            gap = 0
            out.append(line)
        else:
            gap += 1
    if gap >= DIFF_GAP_NOTE_MIN:
        out.append(f"[… {gap} unchanged lines omitted …]")
    return out


def diff_fold(text: str) -> str:
    """Keep a unified diff's headers and changed lines; trim context to 2 lines; summarise huge hunks."""
    lines = text.split("\n")
    n = len(lines)
    out: list[str] = []
    i = 0
    while i < n:
        line = lines[i]
        match = _HUNK_HEADER.match(line)
        if match is None:
            out.append(line)
            i += 1
            continue
        old = int(match.group(2)) if match.group(2) is not None else 1
        new = int(match.group(4)) if match.group(4) is not None else 1
        body: list[str] = []
        j = i + 1
        while j < n and (old > 0 or new > 0 or lines[j].startswith("\\")):
            current = lines[j]
            if current.startswith("\\"):
                pass
            elif current.startswith("-"):
                old -= 1
            elif current.startswith("+"):
                new -= 1
            else:
                old -= 1
                new -= 1
            body.append(current)
            j += 1
        out.append(line)
        out.extend(_trim_hunk(body))
        i = j
    return "\n".join(out)


# ── HTML ────────────────────────────────────────────────────────────────

HTML_MAX_LINKS = 40
LINK_TEXT_MAX = 80

_SKIP_TAGS = frozenset({"script", "style", "noscript", "template", "svg", "iframe"})
_BLOCK_TAGS = frozenset({
    "p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "header",
    "footer", "ul", "ol", "table", "nav", "main", "aside", "form", "pre", "blockquote", "hr", "title",
})


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.links: list[tuple[str, str]] = []
        self._skip = 0
        self._href: str | None = None
        self._link_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _SKIP_TAGS:
            self._skip += 1
            return
        if tag in _BLOCK_TAGS:
            self.parts.append("\n")
        if tag == "a" and self._skip == 0:
            self._href = dict(attrs).get("href") or None
            self._link_text = []

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIP_TAGS:
            self._skip = max(0, self._skip - 1)
            return
        if tag in _BLOCK_TAGS:
            self.parts.append("\n")
        if tag == "a" and self._href is not None:
            label = " ".join("".join(self._link_text).split())
            self.links.append((label[:LINK_TEXT_MAX], self._href))
            self._href = None

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        self.parts.append(data)
        if self._href is not None:
            self._link_text.append(data)


def html_text(text: str) -> str:
    """Drop scripts and styles from HTML: the visible text, then an outline of its links."""
    parser = _TextExtractor()
    parser.feed(text)
    parser.close()
    lines = []
    for raw in "".join(parser.parts).split("\n"):
        line = " ".join(raw.split())
        if line and (not lines or lines[-1] != line):
            lines.append(line)
    seen: set[tuple[str, str]] = set()
    links: list[str] = []
    for label, href in parser.links:
        if (label, href) in seen or href.startswith(("#", "javascript:")):
            continue
        seen.add((label, href))
        links.append(f"- {label or href} -> {href}" if label else f"- {href}")
    out = "\n".join(lines)
    if links:
        extra = len(links) - HTML_MAX_LINKS
        out += "\n\nLinks:\n" + "\n".join(links[:HTML_MAX_LINKS])
        if extra > 0:
            out += f"\n[+{extra} more links]"
    return out


# ── code ────────────────────────────────────────────────────────────────

CODE_HEAD_LINES = 40
_IMPORT_LINE = re.compile(r"^(?:import |from \S+ import |#include |using |use |require\(|const \w+ = require\()")


def _guess_path(text: str) -> str:
    """A file name with a plausible extension, for the Code Map extractor."""
    if re.search(r"^\s*(?:def |class \w+.*:|from \S+ import |import \w+$)", text, re.MULTILINE):
        return "snippet.py"
    if re.search(r"^\s*package \w+\s*$", text, re.MULTILINE) and "func " in text:
        return "snippet.go"
    if re.search(r"^\s*(?:fn |impl |pub fn |use \w+::)", text, re.MULTILINE):
        return "snippet.rs"
    if re.search(r"^\s*(?:public |private )?(?:static )?class \w+", text, re.MULTILINE) and ";" in text:
        return "Snippet.java"
    if re.search(r"^\s*#include", text, re.MULTILINE):
        return "snippet.c"
    return "snippet.ts" if re.search(r"\binterface \w+|: (?:string|number)\b", text) else "snippet.js"


def code_outline(text: str) -> str:
    """The first 40 lines, then the imports and definition signatures of the rest.

    Uses the Code Map extractor when it is installed; without it, head_tail.
    """
    try:
        from dsh_intel_mcp.codemap.symbols import extract
    except ImportError:
        return head_tail(text)
    lines = text.split("\n")
    if len(lines) <= CODE_HEAD_LINES:
        return text
    try:
        definitions = extract(_guess_path(text), text)
    except Exception:  # noqa: BLE001 - an extractor failure is a fallback, not an error
        return head_tail(text)
    if not definitions:
        return head_tail(text)
    out = lines[:CODE_HEAD_LINES]
    rest: list[str] = [
        f"{number}: {line}" for number, line in enumerate(lines[CODE_HEAD_LINES:], start=CODE_HEAD_LINES + 1)
        if _IMPORT_LINE.match(line)
    ]
    for definition in sorted(definitions, key=lambda d: (d.line, d.name)):
        if definition.line > CODE_HEAD_LINES:
            rest.append(f"{definition.line}: {(definition.signature or definition.name).strip()}")
    omitted = len(lines) - CODE_HEAD_LINES
    out.append(f"[… {omitted} more lines; imports and signatures follow …]")
    out.extend(rest)
    return "\n".join(out)


# ── head and tail ───────────────────────────────────────────────────────

HEAD_SHARE = 0.6


def head_tail(text: str) -> str:
    """A quarter of the text: the first 60% and last 40% of that budget, a marker between."""
    budget = len(text) // 4
    head_size = int(budget * HEAD_SHARE)
    tail_size = budget - head_size
    head, tail = text[:head_size], text[len(text) - tail_size:] if tail_size else ""
    cut = head.rfind("\n")
    if cut > head_size // 2:
        head = head[:cut]
    cut = tail.find("\n")
    if 0 <= cut < tail_size // 2:
        tail = tail[cut + 1:]
    omitted = len(text) - len(head) - len(tail)
    return f"{head}\n[… {omitted} chars omitted …]\n{tail}"
