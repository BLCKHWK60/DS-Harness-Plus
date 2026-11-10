"""Incremental symbol and reference index of one repository, cached in SQLite.

The only subprocess it ever starts is ``git ls-files``. A file is re-parsed
only when its path, mtime or size changed.
"""
from __future__ import annotations

import fnmatch
import hashlib
import logging
import os
import re
import sqlite3
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Final, Iterable

from dsh_intel_mcp.paths import data_home

from .symbols import Definition, extract, language_for

logger = logging.getLogger(__name__)

MAX_FILES: Final = 20_000
MAX_FILE_BYTES: Final = 1_000_000
GIT_TIMEOUT_SECONDS: Final = 20
MAX_REFS_PER_NAME_PER_FILE: Final = 50
SKIP_DIRS: Final = frozenset(
    {".git", "node_modules", "dist", "build", "out", "target", ".venv", "venv", "__pycache__",
     ".next", ".cache", "vendor", "Pods", "DerivedData"}
)
LOCK_NAMES: Final = frozenset(
    {"package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "uv.lock", "Cargo.lock",
     "Gemfile.lock", "composer.lock", "go.sum", "bun.lockb", "Pipfile.lock", "Package.resolved"}
)
SECRET_PATTERNS: Final = (".env", ".env.*", "*.pem", "*.key", "id_rsa*", "id_ed25519*", "*.p12", "*.pfx", "*.keystore")
_TOKEN_RE: Final = re.compile(r"[A-Za-z_][A-Za-z0-9_]{2,}")

_SCHEMA: Final = """
CREATE TABLE IF NOT EXISTS files(path TEXT PRIMARY KEY, mtime_ns INTEGER, size INTEGER, lang TEXT, lines INTEGER);
CREATE TABLE IF NOT EXISTS defs(file TEXT, name TEXT, kind TEXT, line INTEGER, end_line INTEGER, signature TEXT, parent TEXT);
CREATE TABLE IF NOT EXISTS refs(file TEXT, name TEXT, line INTEGER);
CREATE INDEX IF NOT EXISTS defs_file ON defs(file);
CREATE INDEX IF NOT EXISTS defs_name ON defs(name);
CREATE INDEX IF NOT EXISTS refs_file ON refs(file);
CREATE INDEX IF NOT EXISTS refs_name ON refs(name);
"""


def is_secret(path: str) -> bool:
    base = PurePosixPath(path).name
    return any(fnmatch.fnmatch(base, pattern) for pattern in SECRET_PATTERNS)


def is_lock(path: str) -> bool:
    base = PurePosixPath(path).name
    return base in LOCK_NAMES or base.endswith(".lock")


def resolve_rel(root: Path, rel: str) -> Path:
    """``rel`` (relative to ``root``) resolved inside ``root``; ValueError for absolute paths, '..' and escapes."""
    text = (rel or ".").strip() or "."
    if "\x00" in text or PurePosixPath(text).is_absolute() or PureWindowsPath(text).is_absolute() or text.startswith("~"):
        raise ValueError(f"Path must be relative to the project root: {rel!r}")
    if ".." in PurePosixPath(text.replace("\\", "/")).parts:
        raise ValueError(f"Path may not contain '..': {rel!r}")
    base = root.resolve()
    target = (base / text).resolve()
    if target != base and base not in target.parents:
        raise ValueError(f"Path escapes the project root: {rel!r}")
    return target


@dataclass(frozen=True)
class FileInfo:
    path: str
    lang: str
    size: int
    lines: int


@dataclass(frozen=True)
class IndexStats:
    files: int
    parsed: int
    removed: int
    definitions: int
    truncated: bool
    seconds: float


def default_db_path(root: Path) -> Path:
    digest = hashlib.sha1(str(root.resolve()).encode("utf-8", "replace")).hexdigest()  # noqa: S324 - cache key, not security
    return data_home() / "code-map" / f"{digest}.sqlite"


class CodeIndex:
    def __init__(self, root: Path, db_path: Path | str | None = None) -> None:
        self.root = Path(root).resolve()
        self._lock = threading.RLock()
        self.truncated = False
        self.generation = 0  # bumped whenever a refresh changes the index; keys the rank cache
        self.rank_cache: dict[tuple, tuple[int, list[tuple[str, float]]]] = {}
        target: Path | str
        if str(db_path) == ":memory:":
            target = ":memory:"
        else:
            target = Path(db_path) if db_path is not None else default_db_path(self.root)
            target.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(str(target), check_same_thread=False)
        self._db.executescript(_SCHEMA)
        if target != ":memory:":
            try:
                os.chmod(target, 0o600)
            except OSError:
                pass

    def close(self) -> None:
        with self._lock:
            self._db.close()

    # ── listing ──────────────────────────────────────────────────────

    def _list_files(self) -> tuple[list[str], bool]:
        found: list[str] | None = None
        if (self.root / ".git").exists():
            found = self._git_files()
        if found is None:
            found = self._walk_files()
        kept: list[str] = []
        for rel in sorted(set(found)):
            parts = PurePosixPath(rel).parts
            if any(part in SKIP_DIRS for part in parts[:-1]) or is_lock(rel) or is_secret(rel):
                continue
            kept.append(rel)
        truncated = len(kept) > MAX_FILES
        return kept[:MAX_FILES], truncated

    def _git_files(self) -> list[str] | None:
        try:
            done = subprocess.run(  # noqa: S603,S607 - fixed argv, no shell
                ["git", "ls-files", "-co", "--exclude-standard", "-z"],
                cwd=self.root, capture_output=True, timeout=GIT_TIMEOUT_SECONDS, check=False,
            )
        except (OSError, subprocess.SubprocessError):
            return None
        if done.returncode != 0:
            return None
        return [p.decode("utf-8", "replace") for p in done.stdout.split(b"\x00") if p]

    def _walk_files(self) -> list[str]:
        out: list[str] = []
        for current, dirs, names in os.walk(self.root, followlinks=False):
            dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
            base = Path(current)
            for name in names:
                out.append((base / name).relative_to(self.root).as_posix())
            if len(out) > MAX_FILES * 2:
                break
        return out

    def _stat_text(self, rel: str) -> tuple[os.stat_result, bytes | None] | None:
        """(stat, None) cheap check first; the caller reads the bytes only when needed."""
        path = self.root / rel
        try:
            real = path.resolve()
            if self.root != real and self.root not in real.parents:
                return None  # symlink out of the root
            if not real.is_file():
                return None
            info = real.stat()
        except (OSError, RuntimeError):
            return None
        if info.st_size > MAX_FILE_BYTES:
            return None
        return info, None

    def _read(self, rel: str) -> str | None:
        try:
            data = (self.root / rel).resolve().read_bytes()
        except OSError:
            return None
        if b"\x00" in data[:8192]:
            return None
        return data.decode("utf-8", "replace")

    # ── refresh ──────────────────────────────────────────────────────

    def refresh(self) -> IndexStats:
        started = time.monotonic()
        with self._lock:
            listed, truncated = self._list_files()
            self.truncated = truncated
            known = {row[0]: (row[1], row[2]) for row in self._db.execute("SELECT path, mtime_ns, size FROM files")}
            changed: list[tuple[str, os.stat_result, str]] = []
            present: set[str] = set()
            for rel in listed:
                checked = self._stat_text(rel)
                if checked is None:
                    continue
                info = checked[0]
                if known.get(rel) == (info.st_mtime_ns, info.st_size):
                    present.add(rel)
                    continue
                text = self._read(rel)
                if text is None:
                    continue
                present.add(rel)
                changed.append((rel, info, text))
            removed = [path for path in known if path not in present]
            before_names = self._defined_names()
            with self._db:
                for path in removed:
                    self._drop(path)
                for rel, info, text in changed:
                    self._drop(rel)
                    lang = language_for(rel) or ""
                    defs = extract(rel, text) if lang else []
                    self._db.execute(
                        "INSERT INTO files(path, mtime_ns, size, lang, lines) VALUES(?,?,?,?,?)",
                        (rel, info.st_mtime_ns, info.st_size, lang, text.count("\n") + 1),
                    )
                    self._db.executemany(
                        "INSERT INTO defs VALUES(?,?,?,?,?,?,?)",
                        [(rel, d.name, d.kind, d.line, d.end_line, d.signature, d.parent) for d in defs],
                    )
                defined = self._defined_names()
                for rel, _info, text in changed:
                    self._store_refs(rel, text, defined)
                new_names = defined - before_names
                if new_names:
                    changed_paths = {rel for rel, _i, _t in changed}
                    for (rel,) in list(self._db.execute("SELECT path FROM files WHERE lang != ''")):
                        if rel in changed_paths:
                            continue
                        text = self._read(rel)
                        if text is not None:
                            self._store_refs(rel, text, new_names)
            if changed or removed:
                self.generation += 1
            definitions = self._db.execute("SELECT COUNT(*) FROM defs").fetchone()[0]
            files = self._db.execute("SELECT COUNT(*) FROM files").fetchone()[0]
        return IndexStats(files, len(changed), len(removed), definitions, truncated, time.monotonic() - started)

    def _drop(self, path: str) -> None:
        for table in ("files", "defs", "refs"):
            column = "path" if table == "files" else "file"
            self._db.execute(f"DELETE FROM {table} WHERE {column} = ?", (path,))  # noqa: S608 - fixed table names

    def _defined_names(self) -> set[str]:
        names: set[str] = set()
        for (name,) in self._db.execute("SELECT DISTINCT name FROM defs"):
            names.add(name)
            tail = re.split(r"[.:]+", name)[-1]
            if tail:
                names.add(tail)
        return names

    def _store_refs(self, rel: str, text: str, names: set[str]) -> None:
        if not names or not language_for(rel):
            return
        counts: dict[str, int] = {}
        rows: list[tuple[str, str, int]] = []
        for number, line in enumerate(text.split("\n"), 1):
            if len(line) > 2000:
                continue
            for token in _TOKEN_RE.findall(line):
                if token in names:
                    seen = counts.get(token, 0)
                    if seen < MAX_REFS_PER_NAME_PER_FILE:
                        counts[token] = seen + 1
                        rows.append((rel, token, number))
        self._db.executemany("INSERT INTO refs VALUES(?,?,?)", rows)

    # ── queries ──────────────────────────────────────────────────────

    def files(self) -> list[FileInfo]:
        with self._lock:
            rows = self._db.execute("SELECT path, lang, size, lines FROM files ORDER BY path").fetchall()
        return [FileInfo(*row) for row in rows]

    def definitions(self, file: str | None = None) -> list[Definition]:
        sql = "SELECT name, kind, line, end_line, signature, parent, file FROM defs"
        args: tuple[str, ...] = ()
        if file is not None:
            sql += " WHERE file = ?"
            args = (file,)
        with self._lock:
            rows = self._db.execute(sql + " ORDER BY file, line, end_line DESC", args).fetchall()
        return [Definition(*row) for row in rows]

    def enclosing(self, file: str, line: int) -> Definition | None:
        """The innermost definition of ``file`` whose range contains ``line``."""
        best: Definition | None = None
        for d in self.definitions(file):
            if d.line <= line <= d.end_line and (best is None or (d.end_line - d.line) <= (best.end_line - best.line)):
                best = d
        return best

    def find_definitions(self, name: str, file: str | None = None) -> list[Definition]:
        """Exact name matches first; otherwise definitions whose last dotted component equals ``name``."""
        with self._lock:
            rows = self._db.execute(
                "SELECT name, kind, line, end_line, signature, parent, file FROM defs ORDER BY file, line"
            ).fetchall()
        defs = [Definition(*row) for row in rows if file is None or row[6] == file]
        exact = [d for d in defs if d.name == name]
        if exact:
            return exact
        tail = re.split(r"[.:]+", name)[-1]
        return [d for d in defs if d.name.endswith(("." + name, "::" + name)) or d.name == tail or re.split(r"[.:]+", d.name)[-1] == tail]

    def reference_files(self, name: str) -> dict[str, int]:
        """File -> number of stored references to ``name`` (definition lines excluded)."""
        with self._lock:
            rows = self._db.execute(
                "SELECT r.file, COUNT(*) FROM refs r WHERE r.name = ? AND NOT EXISTS "
                "(SELECT 1 FROM defs d WHERE d.file = r.file AND d.line = r.line AND (d.name = r.name OR d.name LIKE '%.' || r.name)) "
                "GROUP BY r.file",
                (name,),
            ).fetchall()
        return {path: count for path, count in rows}

    def references(self, name: str) -> list[tuple[str, int]]:
        with self._lock:
            rows = self._db.execute(
                "SELECT r.file, r.line FROM refs r WHERE r.name = ? AND NOT EXISTS "
                "(SELECT 1 FROM defs d WHERE d.file = r.file AND d.line = r.line AND (d.name = r.name OR d.name LIKE '%.' || r.name)) "
                "ORDER BY r.file, r.line",
                (name,),
            ).fetchall()
        return [(path, line) for path, line in rows]

    def defining_files(self) -> dict[str, set[str]]:
        """Bare definition name -> files that define it."""
        out: dict[str, set[str]] = {}
        with self._lock:
            for name, file in self._db.execute("SELECT DISTINCT name, file FROM defs"):
                out.setdefault(re.split(r"[.:]+", name)[-1] or name, set()).add(file)
        return out

    def reference_edges(self) -> Iterable[tuple[str, str, int]]:
        """(referencing file, name, count) for every stored reference group."""
        with self._lock:
            return self._db.execute("SELECT file, name, COUNT(*) FROM refs GROUP BY file, name").fetchall()
