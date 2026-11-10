"""Content-type detection for Context Saver: json, diff, search, log, html, code or prose.

Pure and deterministic. Cheap checks run first; each kind has a conservative
test so that anything doubtful falls through to ``prose``, which is left alone.
"""
from __future__ import annotations

import json
import re

JSON = "json"
DIFF = "diff"
SEARCH = "search"
LOG = "log"
HTML = "html"
CODE = "code"
PROSE = "prose"

_SEARCH_LINE = re.compile(r"^[^:\s]+:\d+[:-]")
_TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}|\b\d{2}:\d{2}:\d{2}\b")
_LEVEL = re.compile(r"\b(?:TRACE|DEBUG|INFO|NOTICE|WARN|WARNING|ERROR|FATAL|CRITICAL|PANIC)\b")
_HUNK = re.compile(r"^@@ .*@@", re.MULTILINE)
_DIFF_FILE = re.compile(r"^(?:--- |\+\+\+ |diff --git )", re.MULTILINE)
_TAG = re.compile(r"</?[A-Za-z][^<>]{0,200}>")
_CODE_START = re.compile(
    r"^\s*(?:def|class|import|from|function|const|let|var|return|if|for|while|else|elif|public|private|"
    r"protected|static|package|use|fn|struct|impl|enum|interface|type|async|await|try|catch|switch|case|"
    r"#include|#define|@\w+|//|/\*|\*/|\*|#!)(?=\W|$)"
)
_CODE_END = ("{", "}", ";", "):", "});", "],", "},", ")", "=>")

JSONL_SHARE = 0.8
SEARCH_SHARE = 0.6
LOG_SHARE = 0.3
LOG_MIN_LINES = 200
CODE_SHARE = 0.5


def _json_container(text: str) -> bool:
    stripped = text.strip()
    if not stripped or stripped[0] not in "[{":
        return False
    try:
        return isinstance(json.loads(stripped), (dict, list))
    except ValueError:
        return False


def is_json_lines(lines: list[str]) -> bool:
    """At least 80% of the non-empty lines are JSON objects or arrays (two or more lines)."""
    if len(lines) < 2:
        return False
    good = 0
    for line in lines:
        stripped = line.strip()
        if stripped[:1] in ("{", "["):
            try:
                json.loads(stripped)
            except ValueError:
                continue
            good += 1
    return good >= JSONL_SHARE * len(lines)


def _looks_like_diff(text: str) -> bool:
    return bool(_HUNK.search(text)) and bool(_DIFF_FILE.search(text))


def _looks_like_html(text: str) -> bool:
    head = text.lstrip()[:200].lower()
    if head.startswith("<!doctype") or head.startswith("<html"):
        return True
    tags = _TAG.findall(text)
    if len(tags) < 20:
        return False
    return sum(len(tag) for tag in tags) / max(1, len(text)) > 0.25


def _looks_like_code(lines: list[str]) -> bool:
    code = 0
    for line in lines:
        stripped = line.strip()
        if _CODE_START.match(line) or stripped.endswith(_CODE_END):
            code += 1
    return code >= CODE_SHARE * len(lines)


def detect(text: str) -> str:
    """The kind of ``text``: ``json``, ``diff``, ``search``, ``html``, ``log``, ``code`` or ``prose``."""
    if not text or not text.strip():
        return PROSE
    if _json_container(text):
        return JSON
    lines = [line for line in text.split("\n") if line.strip()]
    if is_json_lines(lines):
        return JSON
    if _looks_like_diff(text):
        return DIFF
    if lines and sum(1 for line in lines if _SEARCH_LINE.match(line)) >= SEARCH_SHARE * len(lines):
        return SEARCH
    if _looks_like_html(text):
        return HTML
    if lines:
        marked = sum(1 for line in lines if _TIMESTAMP.search(line) or _LEVEL.search(line))
        if marked >= LOG_SHARE * len(lines):
            return LOG
        if len(lines) >= LOG_MIN_LINES and not _looks_like_code(lines):
            return LOG
    if lines and _looks_like_code(lines):
        return CODE
    return PROSE
