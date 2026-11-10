"""Writes the Context Saver store the retrieval server reads (the writer itself belongs to the Context Saver plugin)."""
from __future__ import annotations

import hashlib
import sqlite3
import time

from dsh_intel_mcp.paths import data_home

SCHEMA = """
CREATE TABLE IF NOT EXISTS originals (
    key TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    created REAL NOT NULL,
    bytes INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS originals_created ON originals(created);
"""


def put(text: str, created: float | None = None) -> str:
    """Store ``text`` under its key (first 16 hex characters of its SHA-256) and return the key."""
    key = hashlib.sha256(text.encode("utf-8", "surrogatepass")).hexdigest()[:16]
    path = data_home() / "context-saver" / "store.sqlite"
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    try:
        conn.executescript(SCHEMA)
        conn.execute(
            "INSERT INTO originals(key, text, created, bytes) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET created = excluded.created",
            (key, text, time.time() if created is None else created, len(text.encode("utf-8", "surrogatepass"))),
        )
        conn.commit()
    finally:
        conn.close()
    return key
