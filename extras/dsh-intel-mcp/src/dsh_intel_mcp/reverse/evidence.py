"""Evidence store: what the analyzers found, kept so the agent can page through it."""
from __future__ import annotations

import json
import os
import re
import secrets
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from dsh_intel_mcp.paths import data_home

PAGE_CHARS = 8_000
REDACTED = "<redacted>"
_SECRET_KEY_RE = re.compile(
    r"(passw(or)?d|passwd|secret|token|api[-_]?key|apikey|authorization|cookie|credential|private[-_]?key|session[-_]?id)",
    re.IGNORECASE,
)
_TYPE_WORDS = frozenset({"string", "number", "integer", "boolean", "null", "array", "object", "bool", "int", "float", "data", "date", "dict"})
_ID_RE = re.compile(r"^ev_[0-9a-f]{12}$")


def is_secret_key(key: Any) -> bool:
    return isinstance(key, str) and bool(_SECRET_KEY_RE.search(key))


_URL_USERINFO_RE = re.compile(r"(?i)\b(https?|wss?|ftp)://[^/\s:@]+:[^/\s@]*@")
_URL_SECRET_PARAM_RE = re.compile(
    r"(?i)([?&;](?:[\w.-]*(?:passw(?:or)?d|secret|token|api[-_]?key|apikey|auth|sig(?:nature)?|credential|session[-_]?id|key)[\w.-]*)=)[^&#\s\"']+"
)
_TOKEN_SHAPES_RE = re.compile(
    r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}"  # JWT
    r"|\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"
    r"|\bsk-[A-Za-z0-9_-]{20,}"
    r"|\bgh[pousr]_[A-Za-z0-9]{30,}"
    r"|\bxox[abprs]-[A-Za-z0-9-]{10,}"
    r"|\bAIza[0-9A-Za-z_-]{30,}"
    r"|(?i:\bbearer\s+)[A-Za-z0-9._~+/=-]{12,}"
    r"|-----BEGIN [A-Z ]*PRIVATE KEY-----"
)
_NAME_KEYS = frozenset({"key", "name", "setting", "property", "field", "header", "param", "attribute"})
_VALUE_KEYS = frozenset({"value", "val", "data", "content", "text", "string"})


def mask_value(text: str) -> str:
    """URL credentials and query secrets, and well-known token shapes, replaced inside ``text``."""
    text = _URL_USERINFO_RE.sub(lambda m: f"{m.group(1)}://{REDACTED}@", text)
    text = _URL_SECRET_PARAM_RE.sub(lambda m: m.group(1) + REDACTED, text)
    return _TOKEN_SHAPES_RE.sub(REDACTED, text)


def scrub(value: Any) -> Any:
    """``value`` with secret-looking values replaced; type names stay.

    Scalars under secret-looking keys are replaced, as are the value of a
    ``{"name": "<secret-looking name>", "value": ...}`` pair (HAR headers, key/value
    tables) and any URL credential or well-known token shape inside a string.
    """
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        named_secret = any(
            isinstance(v, str) and str(k).lower() in _NAME_KEYS and is_secret_key(v) for k, v in value.items()
        )
        for key, item in value.items():
            if not isinstance(item, (dict, list)) and item not in _TYPE_WORDS and item is not None and (
                is_secret_key(key) or (named_secret and str(key).lower() in _VALUE_KEYS)
            ):
                out[str(key)] = REDACTED
            else:
                out[str(key)] = scrub(item)
        return out
    if isinstance(value, (list, tuple)):
        return [scrub(item) for item in value]
    if isinstance(value, str):
        return mask_value(value)
    return value


def evidence_dir() -> Path:
    return data_home() / "reverse"


class EvidenceStore:
    def __init__(self, db_path: Path | None = None) -> None:
        self._path = db_path or (evidence_dir() / "evidence.sqlite")
        self._lock = threading.Lock()
        self._ready = False

    def _connect(self) -> sqlite3.Connection:
        # Always ensure the table: the plugin's data cleaner may have deleted the file under a live server.
        self._path.parent.mkdir(parents=True, exist_ok=True)
        fresh = not self._path.exists()
        conn = sqlite3.connect(self._path)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS evidence (id TEXT PRIMARY KEY, target TEXT NOT NULL, analyzer TEXT NOT NULL,"
            " summary TEXT NOT NULL, facts TEXT NOT NULL, limitations TEXT NOT NULL, created_at REAL NOT NULL)"
        )
        conn.commit()
        if fresh:
            try:
                os.chmod(self._path, 0o600)
            except OSError:
                pass
        self._ready = True
        return conn

    @staticmethod
    def new_id() -> str:
        return "ev_" + secrets.token_hex(6)

    def put(
        self,
        target: str,
        analyzer: str,
        summary: str,
        facts: dict[str, Any],
        limitations: list[str],
        *,
        evidence_id: str | None = None,
    ) -> str:
        ev_id = evidence_id or self.new_id()
        payload = json.dumps(scrub(facts), ensure_ascii=False, default=str)
        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    "INSERT OR REPLACE INTO evidence VALUES (?,?,?,?,?,?,?)",
                    (ev_id, target, analyzer, mask_value(summary), payload, json.dumps([mask_value(str(x)) for x in limitations]), time.time()),
                )
                conn.commit()
            finally:
                conn.close()
        return ev_id

    def get(self, evidence_id: str) -> dict[str, Any] | None:
        if not _ID_RE.match(evidence_id or ""):
            return None
        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT id, target, analyzer, summary, facts, limitations, created_at FROM evidence WHERE id=?",
                    (evidence_id,),
                ).fetchone()
            finally:
                conn.close()
        if row is None:
            return None
        return {
            "id": row[0],
            "target": row[1],
            "analyzer": row[2],
            "summary": row[3],
            "facts": json.loads(row[4]),
            "limitations": json.loads(row[5]),
            "created_at": row[6],
        }

    def facets(self, evidence_id: str) -> dict[str, int]:
        record = self.get(evidence_id)
        if record is None:
            return {}
        return {k: len(v) if isinstance(v, (list, dict)) else 1 for k, v in record["facts"].items()}

    def page(self, evidence_id: str, facet: str | None, page: int, page_chars: int = PAGE_CHARS) -> str:
        record = self.get(evidence_id)
        if record is None:
            return f"No evidence with id {evidence_id}."
        facts = record["facts"]
        if facet is None:
            lines = [f"{record['id']} [{record['analyzer']}] {record['summary']}", "Facets (ask with facet=<name>):"]
            for name, size in self.facets(evidence_id).items():
                lines.append(f"- {name} ({size} item{'s' if size != 1 else ''})")
            for note in record["limitations"]:
                lines.append(f"Limitation: {note}")
            return "\n".join(lines)
        if facet not in facts:
            return f"No facet '{facet}' in {evidence_id}. Facets: {', '.join(facts) or 'none'}."
        text = json.dumps(facts[facet], ensure_ascii=False, indent=1)
        size = max(1, page_chars)
        total = max(1, -(-len(text) // size))
        number = min(max(1, int(page or 1)), total)
        body = text[(number - 1) * size : number * size]
        footer = f"(page {number} of {total}" + (f"; next: page={number + 1})" if number < total else ")")
        return f"{record['id']} / {facet}\n{body}\n{footer}"


_STORE: EvidenceStore | None = None
_STORE_PATH: Path | None = None


def get_store() -> EvidenceStore:
    """The store for the current data home (re-created if the home moved)."""
    global _STORE, _STORE_PATH
    path = evidence_dir() / "evidence.sqlite"
    if _STORE is None or _STORE_PATH != path:
        _STORE, _STORE_PATH = EvidenceStore(path), path
    return _STORE
