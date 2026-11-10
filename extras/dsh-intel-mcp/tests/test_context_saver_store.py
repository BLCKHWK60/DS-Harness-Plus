"""The reversible store: put and retrieve, slices, pruning, read-only readers, the data cleaner."""
from __future__ import annotations

import os
import sqlite3
import stat
import time

import pytest

from dsh_intel_mcp import context_saver
from dsh_intel_mcp.context_saver import policy, savings, store


@pytest.fixture(autouse=True)
def _home(tmp_path, monkeypatch):
    monkeypatch.setenv("DSH_INTEL_HOME", str(tmp_path / "home"))
    policy.clear_memo()
    yield


TEXT = "\n".join(f"line {i}: {'needle' if i % 10 == 0 else 'hay'}" for i in range(1, 101))


def test_put_and_retrieve_round_trip():
    key = store.put(TEXT)
    assert len(key) == 16 and key == store.key_for(TEXT) and store.put(TEXT) == key
    assert store.retrieve(key) == TEXT
    assert store.retrieve("0" * 16) is None
    assert store.retrieve("not-a-key") is None
    assert store.stats()["items"] == 1


def test_retrieve_before_any_store_exists():
    assert store.retrieve("0" * 16) is None
    assert store.stats() == {"items": 0, "bytes": 0}


def test_slices_by_line_range_and_grep():
    key = store.put(TEXT)
    assert store.retrieve(key, start_line=2, end_line=3) == "line 2: hay\nline 3: hay"
    assert store.retrieve(key, start_line=99) == "line 99: hay\nline 100: needle"
    assert store.retrieve(key, start_line=50, end_line=10) == ""
    hits = store.retrieve(key, grep="needle").split("\n")
    assert hits[0] == "10: line 10: needle" and len(hits) == 10
    assert store.retrieve(key, grep="NEEDLE", start_line=1, end_line=30).count("\n") == 2
    assert store.retrieve(key, grep="(unclosed") == ""  # a bad regex is a plain substring
    out = store.retrieve(key, max_chars=50)
    assert out.startswith(TEXT[:50]) and "truncated" in out


def test_ttl_prune(monkeypatch):
    old = store.put("old text")
    real = time.time()
    monkeypatch.setattr(store, "_now", lambda: real + store.TTL_SECONDS + 10)
    assert store.retrieve(old) is None  # expired on read
    fresh = store.put("fresh text")  # and pruned on the next write
    assert store.stats()["items"] == 1 and store.retrieve(fresh) == "fresh text"


def test_size_cap_prunes_oldest_first(monkeypatch):
    monkeypatch.setattr(store, "MAX_BYTES", 250)
    clock = iter(range(1000, 2000))
    monkeypatch.setattr(store, "_now", lambda: float(next(clock)))
    monkeypatch.setattr(store, "TTL_SECONDS", 10**9)
    keys = [store.put(f"{i}" * 100) for i in range(4)]
    assert store.retrieve(keys[0]) is None and store.retrieve(keys[1]) is None
    assert store.retrieve(keys[2]) and store.retrieve(keys[3])
    assert store.stats()["bytes"] <= 250


def test_file_mode_wal_and_readonly_reader():
    key = store.put(TEXT)
    path = store.store_path()
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600
    writer = sqlite3.connect(path)
    assert writer.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    reader = store.open_readonly()
    try:
        assert reader.execute("SELECT text FROM originals WHERE key = ?", (key,)).fetchone()[0] == TEXT
        with pytest.raises(sqlite3.OperationalError):
            reader.execute("DELETE FROM originals")
    finally:
        reader.close()
        writer.close()


def test_clear_empties_the_store():
    store.put(TEXT)
    store.clear()
    assert store.stats() == {"items": 0, "bytes": 0}


def test_delete_files_removes_store_and_ledger():
    store.put(TEXT)
    savings.record("chat", 100, 10)
    assert store.store_path().exists() and savings.savings_path().exists()
    store.delete_files()
    savings.reset()
    assert not store.store_path().exists() and not savings.savings_path().exists()
    assert not list(store.data_dir().glob("store.sqlite*"))
    store.delete_files()  # nothing left is fine
