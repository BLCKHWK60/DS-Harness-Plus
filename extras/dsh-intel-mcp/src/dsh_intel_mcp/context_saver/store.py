"""The reversible store: originals of compressed text, in SQLite.

``<data home>/context-saver/store.sqlite``, table ``originals(key, text,
created, bytes)``. A key is the first 16 hex characters of the text's sha256.
Rows older than 72 hours go, then the oldest rows beyond 1 GB. The file is
0600 and in WAL mode; readers (the Code retrieval server, ``retrieve``) open
it read-only.

Nothing here logs content.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
import sqlite3
import threading
import time
from pathlib import Path

from dsh_intel_mcp.paths import data_home

logger = logging.getLogger(__name__)

TTL_SECONDS = 72 * 3600
MAX_BYTES = 1024 * 1024 * 1024
DEFAULT_MAX_CHARS = 60_000
GREP_PATTERN_MAX = 200
KEY_PATTERN = re.compile(r"^[0-9a-f]{16}$")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS originals (
    key TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    created REAL NOT NULL,
    bytes INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS originals_created ON originals(created);
"""

_lock = threading.Lock()


def data_dir() -> Path:
    return data_home() / "context-saver"


def store_path() -> Path:
    return data_dir() / "store.sqlite"


def key_for(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", "surrogatepass")).hexdigest()[:16]


def _now() -> float:
    return time.time()


def _open_writer() -> sqlite3.Connection:
    path = store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=5)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(_SCHEMA)
        conn.commit()
    except Exception:
        conn.close()
        raise
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return conn


def open_readonly(path: Path | None = None) -> sqlite3.Connection | None:
    """A read-only connection to the store, or None when there is no store yet."""
    target = path or store_path()
    if not target.exists():
        return None
    return sqlite3.connect(f"{target.resolve().as_uri()}?mode=ro", uri=True, timeout=5)


def _prune(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM originals WHERE created < ?", (_now() - TTL_SECONDS,))
    total = conn.execute("SELECT COALESCE(SUM(bytes), 0) FROM originals").fetchone()[0]
    if total > MAX_BYTES:
        for key, size in conn.execute("SELECT key, bytes FROM originals ORDER BY created, key").fetchall():
            if total <= MAX_BYTES:
                break
            conn.execute("DELETE FROM originals WHERE key = ?", (key,))
            total -= size


def put(text: str) -> str:
    """Store ``text`` and return its key. Storing the same text again refreshes its age."""
    key = key_for(text)
    size = len(text.encode("utf-8", "surrogatepass"))
    with _lock:
        conn = _open_writer()
        try:
            conn.execute(
                "INSERT INTO originals(key, text, created, bytes) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(key) DO UPDATE SET created = excluded.created",
                (key, text, _now(), size),
            )
            _prune(conn)
            conn.commit()
        finally:
            conn.close()
    return key


def exists(key: str) -> bool:
    conn = open_readonly()
    if conn is None:
        return False
    try:
        return conn.execute("SELECT 1 FROM originals WHERE key = ?", (key,)).fetchone() is not None
    except sqlite3.Error:
        return False
    finally:
        conn.close()


def get(key: str) -> str | None:
    if not KEY_PATTERN.match(key or ""):
        return None
    conn = open_readonly()
    if conn is None:
        return None
    try:
        row = conn.execute(
            "SELECT text FROM originals WHERE key = ? AND created >= ?", (key, _now() - TTL_SECONDS)
        ).fetchone()
    except sqlite3.Error:
        return None
    finally:
        conn.close()
    return row[0] if row else None


def slice_text(
    text: str,
    *,
    start_line: int | None = None,
    end_line: int | None = None,
    grep: str | None = None,
    max_chars: int = DEFAULT_MAX_CHARS,
) -> str:
    """``text`` or a part of it: lines ``start_line``..``end_line`` (1-based, inclusive),
    or the lines matching ``grep`` (case-insensitive regex, else a plain substring), numbered."""
    lines = text.split("\n")
    first = max(1, start_line) if start_line else 1
    last = min(len(lines), end_line) if end_line else len(lines)
    if first > last:
        return ""
    selected = lines[first - 1:last]
    if grep:
        pattern = grep[:GREP_PATTERN_MAX]
        try:
            rx = re.compile(pattern, re.IGNORECASE)
        except re.error:
            rx = re.compile(re.escape(pattern), re.IGNORECASE)
        out = "\n".join(f"{number}: {line}" for number, line in enumerate(selected, start=first) if rx.search(line))
    else:
        out = "\n".join(selected)
    if len(out) > max_chars:
        out = out[:max_chars] + "\n[truncated: ask for a smaller start_line/end_line range or a grep]"
    return out


def retrieve(
    key: str,
    *,
    start_line: int | None = None,
    end_line: int | None = None,
    grep: str | None = None,
    max_chars: int = DEFAULT_MAX_CHARS,
) -> str | None:
    """The stored original for ``key`` (or a slice of it); None when it is not stored."""
    text = get(key)
    if text is None:
        return None
    return slice_text(text, start_line=start_line, end_line=end_line, grep=grep, max_chars=max_chars)


def stats() -> dict[str, int]:
    """``{"items", "bytes"}`` of what is stored."""
    conn = open_readonly()
    if conn is None:
        return {"items": 0, "bytes": 0}
    try:
        items, size = conn.execute("SELECT COUNT(*), COALESCE(SUM(bytes), 0) FROM originals").fetchone()
    except sqlite3.Error:
        return {"items": 0, "bytes": 0}
    finally:
        conn.close()
    return {"items": int(items), "bytes": int(size)}


def clear() -> None:
    """Delete every stored original."""
    if not store_path().exists():
        return
    with _lock:
        conn = _open_writer()
        try:
            conn.execute("DELETE FROM originals")
            conn.commit()
            try:
                conn.execute("VACUUM")
            except sqlite3.Error:
                pass
        finally:
            conn.close()


def delete_files() -> None:
    """Remove the store and its WAL files (the plugin's data cleaner)."""
    with _lock:
        for suffix in ("", "-wal", "-shm"):
            try:
                Path(f"{store_path()}{suffix}").unlink()
            except FileNotFoundError:
                pass
            except OSError as exc:
                logger.warning("Context Saver store file not removed: %s", type(exc).__name__)
