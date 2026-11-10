"""Text views of a CodeIndex, each within a token budget (tokens = ceil(chars / 4))."""
from __future__ import annotations

import fnmatch
import os
import re
import shutil
import subprocess
from collections import defaultdict
from math import ceil
from pathlib import Path, PurePosixPath
from typing import Final, Iterable, Sequence

from .index import LOCK_NAMES, SECRET_PATTERNS, SKIP_DIRS, CodeIndex, is_lock, is_secret, resolve_rel
from .rank import rank_files
from .symbols import Definition

FOOTER_RESERVE_TOKENS: Final = 40
SYMBOL_BODY_MAX_LINES: Final = 200
SYMBOL_MAX_MATCHES: Final = 5
LINE_TRIM: Final = 200
RG_TIMEOUT_SECONDS: Final = 20
ENTRY_POINTS: Final = frozenset(
    {"main.py", "__main__.py", "app.py", "server.py", "cli.py", "manage.py", "wsgi.py", "asgi.py", "index.ts", "index.js",
     "main.ts", "main.js", "server.ts", "server.js", "main.go", "main.rs", "lib.rs", "Main.java", "Program.cs", "main.swift",
     "main.kt", "main.c", "main.cpp", "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "Makefile", "Dockerfile"}
)


def tokens(text: str) -> int:
    return ceil(len(text) / 4)


class _Budget:
    """Collects lines up to ``max_tokens``; ``text()`` appends the truncation footer."""

    def __init__(self, max_tokens: int, hint: str) -> None:
        self.limit = max(FOOTER_RESERVE_TOKENS + 10, int(max_tokens))
        self.hint = hint
        self.lines: list[str] = []
        self.used = 0
        self.truncated = False

    def add(self, line: str) -> bool:
        cost = tokens(line) + 1
        if self.truncated or self.used + cost > self.limit - FOOTER_RESERVE_TOKENS:
            self.truncated = True
            return False
        self.lines.append(line)
        self.used += cost
        return True

    def text(self) -> str:
        body = "\n".join(self.lines)
        if self.truncated:
            body += f"\n(~{tokens(body)} tokens; truncated — {self.hint})"
        return body


def _trim(text: str, limit: int = LINE_TRIM) -> str:
    text = text.strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _rel(index: CodeIndex, rel: str) -> str:
    """Normalised project-relative posix path for a user-supplied ``rel`` (ValueError when unsafe)."""
    target = resolve_rel(index.root, rel)
    return "." if target == index.root else target.relative_to(index.root).as_posix()


def _read_lines(index: CodeIndex, rel: str) -> list[str]:
    try:
        return (index.root / rel).resolve().read_text("utf-8", errors="replace").split("\n")
    except OSError:
        return []


def _members(index: CodeIndex, prefix: str) -> list[str]:
    paths = [f.path for f in index.files()]
    if prefix in ("", "."):
        return paths
    return [p for p in paths if p == prefix or p.startswith(prefix.rstrip("/") + "/")]


# ── overview ─────────────────────────────────────────────────────────────


def overview(index: CodeIndex, path: str = ".", max_tokens: int = 1200) -> str:
    prefix = _rel(index, path)
    infos = [f for f in index.files() if prefix == "." or f.path == prefix or f.path.startswith(prefix + "/")]
    budget = _Budget(max_tokens, "pass a subdirectory as path or raise max_tokens")
    title = index.root.name if prefix == "." else f"{index.root.name}/{prefix}"
    defs = index.definitions()
    count_defs = sum(1 for d in defs if prefix == "." or d.file.startswith(prefix))
    budget.add(f"{title}: {len(infos)} files, {sum(f.lines for f in infos)} lines, {count_defs} definitions"
               + (" (index truncated at the file cap)" if index.truncated else ""))
    languages: dict[str, int] = defaultdict(int)
    for f in infos:
        languages[f.lang or "other"] += 1
    budget.add("languages: " + ", ".join(f"{k} {v}" for k, v in sorted(languages.items(), key=lambda kv: (-kv[1], kv[0]))[:8]))

    budget.add("")
    budget.add("structure:")
    base_depth = 0 if prefix == "." else len(PurePosixPath(prefix).parts)
    top_files: list[str] = []
    dirs: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    dir_totals: dict[str, int] = defaultdict(int)
    for f in infos:
        parts = PurePosixPath(f.path).parts[base_depth:]
        if len(parts) == 1:
            top_files.append(parts[0])
        else:
            dir_totals[parts[0]] += 1
            if len(parts) == 2:
                dirs[parts[0]]["."] += 1
            else:
                dirs[parts[0]][parts[1]] += 1
    for name in sorted(dir_totals):
        budget.add(f"  {name}/ ({dir_totals[name]} files)")
        for sub, count in sorted(dirs[name].items()):
            if sub != ".":
                budget.add(f"    {sub}/ ({count} files)")
    shown = sorted(top_files)
    for name in shown[:20]:
        budget.add(f"  {name}")
    if len(shown) > 20:
        budget.add(f"  … {len(shown) - 20} more files")

    entries = [f.path for f in infos if PurePosixPath(f.path).name in ENTRY_POINTS and len(PurePosixPath(f.path).parts) <= 4]
    if entries:
        budget.add("")
        budget.add("entry points: " + ", ".join(sorted(entries, key=lambda p: (len(p), p))[:10]))

    ranked = [p for p, _s in rank_files(index) if p in {f.path for f in infos}][:15]
    if ranked:
        budget.add("")
        budget.add("most referenced files:")
        for path_ in ranked:
            names = [d.name for d in index.definitions(path_) if d.parent is None][:4]
            budget.add(f"  {path_}" + (f"  ({', '.join(names)})" if names else ""))
    return budget.text()


# ── repo map ─────────────────────────────────────────────────────────────

_MAP_DEFS_PER_FILE: Final = 14


def _depth(d: Definition, by_name: dict[str, Definition]) -> int:
    depth, cursor, hops = 0, d, 0
    while cursor.parent and hops < 6:
        parent = by_name.get(cursor.parent)
        if parent is None:
            break
        depth += 1
        cursor = parent
        hops += 1
    return depth


def repo_map(
    index: CodeIndex,
    focus_files: Sequence[str] = (),
    focus_symbols: Sequence[str] = (),
    max_tokens: int = 2000,
) -> str:
    focus = [_rel(index, f) for f in focus_files]
    budget = _Budget(max_tokens, "pass focus_files or focus_symbols, or raise max_tokens")
    ranked = rank_files(index, focus, focus_symbols)
    shown = 0
    for path_, _score in ranked:
        defs = index.definitions(path_)
        if not defs and path_ not in focus:
            continue
        by_name = {d.name: d for d in defs}
        block = [f"{path_}:"]
        for d in defs[:_MAP_DEFS_PER_FILE]:
            block.append("  " * (1 + _depth(d, by_name)) + f"{d.line}: {_trim(d.signature, 120)}")
        if len(defs) > _MAP_DEFS_PER_FILE:
            block.append(f"  … {len(defs) - _MAP_DEFS_PER_FILE} more")
        if not all(budget.add(line) for line in block):
            break
        shown += 1
    if not shown and not budget.truncated:
        return "No definitions found."
    return budget.text()


# ── outline / symbol ─────────────────────────────────────────────────────


def outline(index: CodeIndex, file: str) -> str:
    rel = _rel(index, file)
    info = next((f for f in index.files() if f.path == rel), None)
    if info is None:
        raise ValueError(f"Not an indexed file: {file}")
    defs = index.definitions(rel)
    budget = _Budget(4000, "use code_symbol for individual definitions")
    budget.add(f"{rel} ({info.lang or 'text'}, {info.lines} lines, {len(defs)} definitions)")
    by_name = {d.name: d for d in defs}
    for d in defs:
        if not budget.add("  " * _depth(d, by_name) + f"L{d.line}-{d.end_line} {d.kind} {d.name}: {_trim(d.signature, 140)}"):
            break
    return budget.text()


def symbol(index: CodeIndex, name: str, file: str | None = None, include_body: bool = True) -> str:
    rel = _rel(index, file) if file else None
    matches = index.find_definitions(name, rel)
    if not matches:
        return f"No definition named {name!r} found."
    budget = _Budget(6000, "pass file to pick one definition or include_body=false")
    budget.add(f"{len(matches)} definition(s) of {name}")
    for d in matches[:SYMBOL_MAX_MATCHES]:
        budget.add("")
        budget.add(f"{d.file}:{d.line}-{d.end_line} {d.kind} {d.name}" + (f" (in {d.parent})" if d.parent else ""))
        if not include_body:
            budget.add(f"  {d.signature}")
            continue
        lines = _read_lines(index, d.file)[d.line - 1:d.end_line]
        capped = lines[:SYMBOL_BODY_MAX_LINES]
        for offset, text in enumerate(capped):
            if not budget.add(f"{d.line + offset:>5}  {text.rstrip()}"[:400]):
                return budget.text()
        if len(lines) > len(capped):
            budget.add(f"      … {len(lines) - len(capped)} more lines (use code_search or read the file)")
    if len(matches) > SYMBOL_MAX_MATCHES:
        budget.add(f"… {len(matches) - SYMBOL_MAX_MATCHES} more definitions; pass file to narrow")
    return budget.text()


# ── refs ─────────────────────────────────────────────────────────────────


def refs(index: CodeIndex, name: str, max_results: int = 50) -> str:
    name = name.strip()
    if not name:
        raise ValueError("name is required")
    tail = re.split(r"[.:]+", name)[-1]
    hits = index.references(tail)
    if not hits:  # not a name defined in the repo: fall back to a word search
        word = re.compile(rf"\b{re.escape(tail)}\b")
        hits = [(p, n) for p, n, text in _python_search(index, word, None, 10_000) if word.search(text)]
    budget = _Budget(max(500, min(8000, max_results * 60)), "lower max_results or search a narrower name")
    shown = hits[: max(1, int(max_results))]
    budget.add(f"{len(hits)} reference(s) to {tail}" + (f" (showing {len(shown)})" if len(shown) < len(hits) else ""))
    cache: dict[str, list[str]] = {}
    for path_, line in shown:
        lines = cache.setdefault(path_, _read_lines(index, path_))
        text = _trim(lines[line - 1]) if 0 < line <= len(lines) else ""
        scope = index.enclosing(path_, line)
        if not budget.add(f"{path_}:{line}: {text}" + (f"  [in {scope.name}]" if scope else "")):
            break
    return budget.text()


# ── search ───────────────────────────────────────────────────────────────


def _glob_match(path_: str, glob: str | None) -> bool:
    if not glob:
        return True
    base = PurePosixPath(path_).name
    options = {glob, glob.replace("**/", "")}
    return any(fnmatch.fnmatchcase(path_, g) or fnmatch.fnmatchcase(base, g) for g in options)


def _rg_binary() -> str | None:
    found = shutil.which("rg")
    return found if found and os.path.isfile(found) and os.access(found, os.X_OK) else None


def _rg_search(index: CodeIndex, binary: str, pattern: str, glob: str | None, regex: bool, limit: int) -> list[tuple[str, int, str]] | None:
    argv = [binary, "--line-number", "--no-heading", "--with-filename", "--color", "never", "--no-follow",
            "--max-filesize", "1M", "--max-columns", "300", "--no-messages"]
    for skip in sorted(SKIP_DIRS):
        argv += ["-g", f"!{skip}/"]
    for name in sorted(LOCK_NAMES) + list(SECRET_PATTERNS) + ["*.lock"]:
        argv += ["-g", f"!{name}"]
    if glob:
        argv += ["-g", glob]
    if not regex:
        argv.append("-F")
    argv += ["-e", pattern, "--", "."]
    try:
        done = subprocess.run(argv, cwd=index.root, capture_output=True, timeout=RG_TIMEOUT_SECONDS, check=False)  # noqa: S603
    except (OSError, subprocess.SubprocessError):
        return None
    if done.returncode not in (0, 1):
        return None
    out: list[tuple[str, int, str]] = []
    for raw in done.stdout.decode("utf-8", "replace").splitlines():
        match = re.match(r"^(?:\./)?(.*?):(\d+):(.*)$", raw)
        if match and not is_secret(match.group(1)) and not is_lock(match.group(1)):
            out.append((match.group(1), int(match.group(2)), match.group(3)))
    out.sort(key=lambda item: (item[0], item[1]))
    return out[:limit]


def _python_search(index: CodeIndex, pattern: "re.Pattern[str] | str", glob: str | None, limit: int) -> list[tuple[str, int, str]]:
    out: list[tuple[str, int, str]] = []
    for info in index.files():
        if not _glob_match(info.path, glob):
            continue
        for number, text in enumerate(_read_lines(index, info.path), 1):
            if (pattern.search(text) if isinstance(pattern, re.Pattern) else pattern in text):
                out.append((info.path, number, text))
                if len(out) >= limit:
                    return out
    return out


def search(index: CodeIndex, pattern: str, glob: str | None = None, regex: bool = False, max_results: int = 50) -> str:
    if not pattern:
        raise ValueError("pattern is required")
    limit = max(1, min(int(max_results), 500))
    compiled: "re.Pattern[str] | None" = None
    if regex:
        try:
            compiled = re.compile(pattern)
        except re.error as exc:
            raise ValueError(f"Invalid regex: {exc}") from exc
    hits: list[tuple[str, int, str]] | None = None
    binary = _rg_binary()
    if binary:
        hits = _rg_search(index, binary, pattern, glob, regex, limit + 1)
    if hits is None:
        hits = _python_search(index, compiled or pattern, glob, limit + 1)
    budget = _Budget(max(500, min(10_000, limit * 70)), "narrow with glob or a more specific pattern")
    more = len(hits) > limit
    budget.add(f"{min(len(hits), limit)}{'+' if more else ''} match(es) for {pattern!r}")
    for path_, line, text in hits[:limit]:
        if not budget.add(f"{path_}:{line}: {_trim(text)}"):
            break
    if more and not budget.truncated:
        budget.truncated = True
        budget.hint = "more matches exist; narrow with glob or a more specific pattern"
    return budget.text()


# ── pack ─────────────────────────────────────────────────────────────────

_SECRET_NAMES: Final = SECRET_PATTERNS


def _pack_candidates(index: CodeIndex, include: Sequence[str], ignore: Sequence[str]) -> list[str]:
    def selected(path_: str, patterns: Sequence[str]) -> bool:
        return any(
            fnmatch.fnmatchcase(path_, p) or _glob_match(path_, p) or path_.startswith(p.rstrip("/") + "/")
            for p in patterns if p
        )

    ordered = [p for p, _s in rank_files(index)]
    out = []
    for path_ in ordered:
        if is_secret(path_) or is_lock(path_):
            continue
        if include and not selected(path_, include):
            continue
        if ignore and selected(path_, ignore):
            continue
        out.append(path_)
    return out


def _tree(paths: Iterable[str], max_lines: int = 120) -> list[str]:
    grouped: dict[str, list[str]] = defaultdict(list)
    for p in sorted(paths):
        pure = PurePosixPath(p)
        grouped[str(pure.parent) if str(pure.parent) != "." else "."].append(pure.name)
    lines = []
    for directory in sorted(grouped):
        names = grouped[directory]
        lines.append(f"{directory}/: " + ", ".join(names[:12]) + (f", … +{len(names) - 12}" if len(names) > 12 else ""))
    if len(lines) > max_lines:
        lines = lines[:max_lines] + [f"… {len(lines) - max_lines} more directories"]
    return lines


def _file_block(index: CodeIndex, path_: str, compress: bool, page_budget: int) -> tuple[str, int]:
    if compress:
        defs = index.definitions(path_)
        if defs:
            by_name = {d.name: d for d in defs}
            body_lines = ["  " * _depth(d, by_name) + f"{d.line}: {_trim(d.signature, 160)}" for d in defs]
        else:
            body_lines = [_trim(line, 160) for line in _read_lines(index, path_)[:20] if line.strip()]
    else:
        body_lines = _read_lines(index, path_)
    body = "\n".join(body_lines)
    cap = max(100, page_budget - 30) * 4
    note = ""
    if len(body) > cap:
        body, note = body[:cap], "\n… [file truncated to fit one page; use code_symbol or read the file]"
    cost = tokens(body + note)
    return f"=== {path_} (~{cost} tokens) ===\n{body}{note}", cost


def pack(
    root: "Path | CodeIndex",
    include: Sequence[str] = (),
    ignore: Sequence[str] = (),
    compress: bool = True,
    max_tokens: int = 20_000,
    page: int = 1,
) -> str:
    """Directory tree plus signatures (compress) or full text per file, in ranked order, paged by ``max_tokens``."""
    if isinstance(root, CodeIndex):
        index = root
    else:
        index = CodeIndex(Path(root), db_path=":memory:")
        index.refresh()
    limit = max(300, int(max_tokens))
    page = max(1, int(page))
    paths = _pack_candidates(index, list(include), list(ignore))
    if not paths:
        return "No files to pack."
    head = [f"{index.root.name}: {len(paths)} files ({'signatures' if compress else 'full text'})", "", "tree:", *_tree(paths), ""]
    head_cost = tokens("\n".join(head)) + 20
    pages: list[list[str]] = [[]]
    used = head_cost if head_cost < limit // 2 else limit // 2
    for path_ in paths:
        block, cost = _file_block(index, path_, compress, limit - (used if not pages[-1] else 0))
        if pages[-1] and used + cost > limit:
            pages.append([])
            used = 0
            block, cost = _file_block(index, path_, compress, limit)
        pages[-1].append(block)
        used += cost
    if page > len(pages):
        return f"No page {page}; the pack has {len(pages)} page(s)."
    parts = [f"page {page}/{len(pages)}"]
    if page == 1:
        parts += head
    parts += pages[page - 1]
    body = "\n".join(parts)
    if page < len(pages):
        body += f"\n(~{tokens(body)} tokens; next: page={page + 1})"
    else:
        body += f"\n(~{tokens(body)} tokens; end of pack)"
    return body
