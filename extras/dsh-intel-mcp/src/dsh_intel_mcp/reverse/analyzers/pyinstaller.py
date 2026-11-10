"""PyInstaller analyzer: locate the CArchive cookie, parse the TOC, and list the
embedded PYZ module names. Nothing is executed and no unmarshalled code objects are
created: the PYZ table of contents is read with a tiny marshal subset reader."""

from __future__ import annotations

import importlib.util
import logging
import mmap
import re
import struct
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from dsh_intel_mcp.reverse.analyzers import (
    AnalyzeContext,
    Analyzer,
    AnalyzerResult,
    register,
)
from dsh_intel_mcp.reverse.analyzers.native import expired

logger = logging.getLogger(__name__)

MAGIC = b"MEI\x0c\x0b\x0a\x0b\x0e"
COOKIE_V21 = struct.Struct("!8sIIII64s")  # PyInstaller >= 2.1
COOKIE_V20 = struct.Struct("!8sIIII")  # PyInstaller 2.0
ENTRY_HEAD = struct.Struct("!IIIIBc")
MAX_TOC_ENTRIES = 50_000
MAX_PYZ_NAMES = 5000
MAX_ENTRY_BYTES = 64 * 1024 * 1024

TYPE_NAMES = {
    "b": "binary",
    "d": "dependency",
    "m": "pure module (source-less)",
    "M": "pure package",
    "s": "entry script",
    "x": "data",
    "z": "PYZ archive",
    "Z": "PYZ archive (zlib)",
    "o": "runtime option",
    "l": "splash resource",
    "a": "python module",
    "p": "python package",
}


@dataclass
class Cookie:
    cookie_pos: int
    pkg_start: int
    toc_offset: int
    toc_len: int
    pyvers: int
    pylib: str
    cookie_size: int


def _python_version(pyvers: int) -> str:
    if pyvers >= 100:
        return f"{pyvers // 100}.{pyvers % 100}"
    return f"{pyvers // 10}.{pyvers % 10}"


def find_cookie(buf: Any) -> Cookie | None:
    """Find the CArchive cookie by scanning backwards for MAGIC; accepts bytes or mmap."""
    end = len(buf)
    pos = end
    while True:
        pos = buf.rfind(MAGIC, 0, pos)
        if pos < 0:
            return None
        for struct_, size in ((COOKIE_V21, COOKIE_V21.size), (COOKIE_V20, COOKIE_V20.size)):
            if pos + size > end:
                continue
            fields = struct_.unpack(bytes(buf[pos : pos + size]))
            _magic, pkg_len, toc_offset, toc_len, pyvers = fields[:5]
            pylib = ""
            if size == COOKIE_V21.size:
                pylib = fields[5].split(b"\x00", 1)[0].decode("ascii", "replace")
            pkg_start = pos + size - pkg_len
            if pkg_len <= 0 or pkg_start < 0 or toc_len <= 0 or toc_offset + toc_len > pkg_len:
                continue
            if not (20 <= pyvers <= 399):
                continue
            return Cookie(pos, pkg_start, toc_offset, toc_len, pyvers, pylib, size)
        # False positive: keep scanning earlier.


def parse_toc(buf: Any, cookie: Cookie) -> tuple[list[dict[str, Any]], list[str]]:
    """Parse the TOC. Returns (entries, limitations); truncated data yields a limitation."""
    limitations: list[str] = []
    entries: list[dict[str, Any]] = []
    start = cookie.pkg_start + cookie.toc_offset
    stop = start + cookie.toc_len
    if stop > len(buf):
        limitations.append("TOC extends past the end of the file (truncated archive)")
        stop = len(buf)
    pos = start
    while pos + ENTRY_HEAD.size <= stop:
        if len(entries) >= MAX_TOC_ENTRIES:
            limitations.append(f"TOC capped at {MAX_TOC_ENTRIES} entries")
            break
        entry_len = struct.unpack("!I", bytes(buf[pos : pos + 4]))[0]
        if entry_len < ENTRY_HEAD.size or pos + entry_len > stop:
            limitations.append("malformed TOC entry; remaining entries skipped")
            break
        _el, entry_pos, cmp_size, raw_size, cflag, typecode = ENTRY_HEAD.unpack(bytes(buf[pos : pos + ENTRY_HEAD.size]))
        name = bytes(buf[pos + ENTRY_HEAD.size : pos + entry_len]).split(b"\x00", 1)[0].decode("utf-8", "replace")
        code = typecode.decode("ascii", "replace")
        entries.append(
            {
                "name": name,
                "type": code,
                "type_name": TYPE_NAMES.get(code, "unknown"),
                "offset": entry_pos,
                "compressed_size": cmp_size,
                "size": raw_size,
                "compressed": bool(cflag),
            }
        )
        pos += entry_len
    return entries, limitations


def read_entry(buf: Any, cookie: Cookie, entry: dict[str, Any], max_bytes: int = MAX_ENTRY_BYTES) -> bytes:
    """Return the (decompressed) bytes of one TOC entry; raises ValueError if out of range."""
    start = cookie.pkg_start + entry["offset"]
    size = entry["compressed_size"]
    if start < 0 or size > max_bytes or start + size > len(buf):
        raise ValueError(f"entry {entry['name']!r} is out of range or too large")
    raw = bytes(buf[start : start + size])
    if entry["compressed"]:
        d = zlib.decompressobj()
        out = d.decompress(raw, max_bytes)
        if d.unconsumed_tail:
            raise ValueError(f"entry {entry['name']!r} decompresses past the size cap")
        return out
    return raw


# --- PYZ table of contents (marshal subset: None/ints/strings/tuples/lists/dicts) ---


class _Marshal:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.pos = 0
        self.refs: list[Any] = []
        self.budget = 400_000

    def _take(self, n: int) -> bytes:
        if n < 0 or self.pos + n > len(self.data):
            raise ValueError("truncated marshal data")
        chunk = self.data[self.pos : self.pos + n]
        self.pos += n
        return chunk

    def load(self, depth: int = 0) -> Any:
        self.budget -= 1
        if self.budget < 0 or depth > 20:
            raise ValueError("marshal data too large or deep")
        code = self._take(1)[0]
        flag = bool(code & 0x80)
        t = chr(code & 0x7F)
        slot = None
        if flag and t in "uUtTaAzZsS)([{<>":
            slot = len(self.refs)
            self.refs.append(None)

        def finish(value: Any) -> Any:
            if slot is not None:
                self.refs[slot] = value
            elif flag and t in "iIlLNgGyYfF":
                self.refs.append(value)
            return value

        if t == "N":
            return finish(None)
        if t in "TF":
            return finish(t == "T")
        if t == "0":
            return None
        if t == "i":
            return finish(struct.unpack("<i", self._take(4))[0])
        if t == "I":
            return finish(struct.unpack("<q", self._take(8))[0])
        if t in "uUtTaA":
            n = struct.unpack("<I", self._take(4))[0]
            return finish(self._take(n).decode("utf-8", "replace"))
        if t in "zZ":
            n = self._take(1)[0]
            return finish(self._take(n).decode("utf-8", "replace"))
        if t in "sy":
            n = struct.unpack("<I", self._take(4))[0]
            return finish(self._take(n))
        if t == "r":
            idx = struct.unpack("<I", self._take(4))[0]
            if idx >= len(self.refs):
                raise ValueError("bad marshal reference")
            return self.refs[idx]
        if t in "([<>)":
            n = self._take(1)[0] if t == ")" else struct.unpack("<I", self._take(4))[0]
            if n > 200_000:
                raise ValueError("marshal sequence too long")
            items = [self.load(depth + 1) for _ in range(n)]
            value: Any = items if t == "[" else tuple(items)
            return finish(value)
        if t == "{":
            result: dict[Any, Any] = {}
            if slot is not None:
                self.refs[slot] = result
            while True:
                if self.data[self.pos : self.pos + 1] == b"0":
                    self.pos += 1
                    break
                key = self.load(depth + 1)
                val = self.load(depth + 1)
                try:
                    result[key] = val
                except TypeError:
                    raise ValueError("unhashable marshal dict key") from None
            return result
        raise ValueError(f"unsupported marshal type {t!r}")


def parse_pyz(data: bytes) -> tuple[list[str], str, list[str]]:
    """Return (module names, python magic hex, limitations) from a PYZ archive blob."""
    limitations: list[str] = []
    if data[:4] != b"PYZ\x00" or len(data) < 12:
        raise ValueError("not a PYZ archive")
    pyc_magic = data[4:8]
    (toc_pos,) = struct.unpack("!i", data[8:12])
    if not 0 < toc_pos < len(data):
        raise ValueError("PYZ table of contents offset is out of range")
    magic_hex = pyc_magic.hex()
    if pyc_magic != importlib.util.MAGIC_NUMBER:
        limitations.append(
            "PYZ was built for a different Python than the one running this server "
            f"(magic {magic_hex}); only module names were read from the table of contents, bytecode was not unmarshalled"
        )
    toc = _Marshal(data[toc_pos:]).load()
    names: list[str] = []
    if isinstance(toc, dict):
        names = [str(k) for k in toc.keys()]
    elif isinstance(toc, (list, tuple)):
        for item in toc:
            if isinstance(item, (list, tuple)) and item:
                names.append(str(item[0]))
    return names, magic_hex, limitations


# --- analyzer ---


def _detect(path: Path) -> bool:
    try:
        if not path.is_file() or path.stat().st_size < COOKIE_V20.size:
            return False
        with path.open("rb") as fh, mmap.mmap(fh.fileno(), 0, access=mmap.ACCESS_READ) as buf:
            return find_cookie(buf) is not None
    except (OSError, ValueError):
        return False


def _run(path: Path, ctx: AnalyzeContext) -> AnalyzerResult:
    try:
        size = path.stat().st_size
        if size == 0:
            return AnalyzerResult("empty file", {}, ["file is empty"])
        with path.open("rb") as fh, mmap.mmap(fh.fileno(), 0, access=mmap.ACCESS_READ) as buf:
            return _analyze(buf, ctx)
    except Exception as exc:  # noqa: BLE001
        return AnalyzerResult(
            "PyInstaller archive could not be parsed",
            {},
            [f"parse failure: {type(exc).__name__}: {exc}"],
        )


def _analyze(buf: Any, ctx: AnalyzeContext) -> AnalyzerResult:
    cookie = find_cookie(buf)
    if cookie is None:
        return AnalyzerResult("no PyInstaller CArchive cookie found", {}, ["CArchive cookie not found (not a PyInstaller bundle or truncated)"])
    entries, limitations = parse_toc(buf, cookie)
    facts: dict[str, Any] = {
        "overview": {
            "python_version": _python_version(cookie.pyvers),
            "python_library": cookie.pylib,
            "archive_offset": cookie.pkg_start,
            "archive_length": cookie.cookie_pos + cookie.cookie_size - cookie.pkg_start,
            "toc_entries": len(entries),
        },
        "toc": entries[:2000],
        "entry_scripts": [e["name"] for e in entries if e["type"] == "s"],
    }
    if len(entries) > 2000:
        limitations.append(f"toc facet capped at 2000 of {len(entries)} entries")
    modules: list[str] = []
    pyz_info: list[dict[str, Any]] = []
    for entry in entries:
        if entry["type"] not in ("z", "Z"):
            continue
        if expired(ctx):
            limitations.append("deadline reached before all PYZ archives were read")
            break
        try:
            blob = read_entry(buf, cookie, entry, min(ctx.max_bytes, MAX_ENTRY_BYTES))
            names, magic_hex, lims = parse_pyz(blob)
        except Exception as exc:  # noqa: BLE001
            limitations.append(f"PYZ {entry['name']} could not be read: {type(exc).__name__}: {exc}")
            continue
        limitations.extend(lims)
        pyz_info.append({"name": entry["name"], "python_magic": magic_hex, "modules": len(names)})
        modules.extend(names)
    if pyz_info:
        facts["pyz_archives"] = pyz_info
        facts["modules"] = sorted(set(modules))[:MAX_PYZ_NAMES]
        if len(set(modules)) > MAX_PYZ_NAMES:
            limitations.append(f"module list capped at {MAX_PYZ_NAMES}")
    facts["binaries"] = [e["name"] for e in entries if e["type"] == "b"][:500]
    limitations.append("entries are listed, not extracted; use the extraction helpers for individual members")
    summary = (
        f"PyInstaller bundle (Python {facts['overview']['python_version']}): "
        f"{len(entries)} TOC entries, {len(facts['entry_scripts'])} entry script(s), {len(modules)} PYZ modules"
    )
    return AnalyzerResult(summary, facts, limitations)


_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def extract_entries(path: Path, dest: Path, names: list[str] | None = None, *, max_bytes: int = MAX_ENTRY_BYTES) -> list[Path]:
    """Write selected TOC entries (default: entry scripts) under ``dest``. Names are sanitised
    to flat file names so no entry can escape ``dest``."""
    written: list[Path] = []
    dest.mkdir(parents=True, exist_ok=True)
    with path.open("rb") as fh, mmap.mmap(fh.fileno(), 0, access=mmap.ACCESS_READ) as buf:
        cookie = find_cookie(buf)
        if cookie is None:
            raise ValueError("no PyInstaller CArchive cookie found")
        entries, _ = parse_toc(buf, cookie)
        wanted = set(names) if names else {e["name"] for e in entries if e["type"] == "s"}
        for entry in entries:
            if entry["name"] not in wanted:
                continue
            flat = _SAFE_NAME.sub("_", entry["name"]).strip("._") or "entry"
            out = dest / flat
            out.write_bytes(read_entry(buf, cookie, entry, max_bytes))
            written.append(out)
    return written


register(
    Analyzer(
        name="pyinstaller",
        title="PyInstaller bundle",
        detect=_detect,
        run=_run,
    )
)
