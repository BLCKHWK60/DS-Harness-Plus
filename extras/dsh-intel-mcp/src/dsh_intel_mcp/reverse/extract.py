"""Safe extraction of archives into <data home>/reverse/extract/<id>/.

Members that would land outside the destination, symlinks, hard links and
devices are skipped (traversal is reported); total output is capped. Nothing
extracted is ever executed.
"""
from __future__ import annotations

import json
import os
import shutil
import struct
import tarfile
import time
import zipfile
import zlib
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath

from dsh_intel_mcp.paths import data_home

MAX_EXTRACT_BYTES = 1024**3
MAX_EXTRACT_FILES = 100_000
TTL_SECONDS = 7 * 24 * 3600
_CHUNK = 1024 * 256


class ExtractError(ValueError):
    """The archive cannot be extracted safely (too large, unreadable, unsupported)."""


@dataclass
class ExtractReport:
    root: Path
    files: int = 0
    bytes: int = 0
    skipped: list[str] = field(default_factory=list)


def extract_root() -> Path:
    return data_home() / "reverse" / "extract"


def new_extract_dir(extract_id: str) -> Path:
    path = extract_root() / extract_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def prune_extractions(ttl_seconds: int = TTL_SECONDS, now: float | None = None) -> int:
    """Delete extraction folders untouched for ``ttl_seconds``; the number removed."""
    base = extract_root()
    if not base.is_dir():
        return 0
    cutoff = (now if now is not None else time.time()) - ttl_seconds
    removed = 0
    for child in base.iterdir():
        try:
            if child.is_symlink() or not child.is_dir():
                continue
            if child.stat().st_mtime < cutoff:
                shutil.rmtree(child, ignore_errors=True)
                removed += 1
        except OSError:
            continue
    return removed


def _safe_target(dest: Path, member: str) -> Path | None:
    """Where ``member`` lands under ``dest``, or None when it would escape."""
    name = member.replace("\\", "/")
    pure = PurePosixPath(name)
    if pure.is_absolute() or (len(name) > 1 and name[1] == ":") or ".." in pure.parts:
        return None
    parts = [p for p in pure.parts if p not in ("", ".")]
    if not parts:
        return None
    target = dest.joinpath(*parts)
    try:
        target.resolve().relative_to(dest.resolve())
    except ValueError:
        return None
    return target


def _write_stream(source, target: Path, report: ExtractReport, max_bytes: int, executable: bool = False) -> None:
    if report.files >= MAX_EXTRACT_FILES:
        raise ExtractError("The archive holds too many files to extract.")
    target.parent.mkdir(parents=True, exist_ok=True)
    # a symlink planted earlier (never by us) must not redirect the write
    if target.is_symlink():
        report.skipped.append(f"{target.name}: symlink in the way")
        return
    with open(target, "wb") as out:
        while True:
            chunk = source.read(_CHUNK)
            if not chunk:
                break
            report.bytes += len(chunk)
            if report.bytes > max_bytes:
                raise ExtractError("The archive expands past the extraction size limit.")
            out.write(chunk)
    os.chmod(target, 0o644)  # never carry an executable bit out of a target
    report.files += 1


def _extract_zip(archive: Path, dest: Path, max_bytes: int, report: ExtractReport) -> None:
    try:
        zf = zipfile.ZipFile(archive)
    except (zipfile.BadZipFile, OSError) as exc:
        raise ExtractError("That zip file could not be read.") from exc
    with zf:
        infos = zf.infolist()
        if sum(i.file_size for i in infos) > max_bytes:
            raise ExtractError("The archive expands past the extraction size limit.")
        for info in infos:
            if info.is_dir():
                continue
            mode = (info.external_attr >> 16) & 0o170000
            if mode in (0o120000, 0o020000, 0o060000, 0o010000, 0o140000):
                report.skipped.append(f"{info.filename}: link or special file")
                continue
            target = _safe_target(dest, info.filename)
            if target is None:
                report.skipped.append(f"{info.filename}: path escapes the extraction folder")
                continue
            with zf.open(info) as src:
                _write_stream(src, target, report, max_bytes)


def _extract_tar(archive: Path, dest: Path, max_bytes: int, report: ExtractReport) -> None:
    try:
        tf = tarfile.open(archive, "r:*")
    except (tarfile.TarError, OSError) as exc:
        raise ExtractError("That tar file could not be read.") from exc
    with tf:
        total = 0
        for member in tf:
            if member.isdir():
                continue
            if not member.isfile():
                report.skipped.append(f"{member.name}: link or special file")
                continue
            total += member.size
            if total > max_bytes:
                raise ExtractError("The archive expands past the extraction size limit.")
            target = _safe_target(dest, member.name)
            if target is None:
                report.skipped.append(f"{member.name}: path escapes the extraction folder")
                continue
            src = tf.extractfile(member)
            if src is None:
                continue
            with src:
                _write_stream(src, target, report, max_bytes)


def read_asar_header(archive: Path) -> tuple[dict, int]:
    """(file tree, data offset) of an Electron asar; the tree is plain JSON, never evaluated."""
    with open(archive, "rb") as fh:
        prefix = fh.read(16)
        if len(prefix) < 16:
            raise ExtractError("That asar file is truncated.")
        _, pickle_size, _, json_len = struct.unpack("<IIII", prefix)
        if json_len <= 0 or json_len > 64 * 1024 * 1024:
            raise ExtractError("That asar header is not valid.")
        raw = fh.read(json_len)
    try:
        tree = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise ExtractError("That asar header is not valid.") from exc
    return tree, 8 + pickle_size


def _walk_asar(node: dict, prefix: str = ""):
    for name, entry in (node.get("files") or {}).items():
        path = f"{prefix}{name}"
        if isinstance(entry, dict) and "files" in entry:
            yield from _walk_asar(entry, path + "/")
        elif isinstance(entry, dict):
            yield path, entry


def list_asar(archive: Path) -> list[tuple[str, int]]:
    tree, _ = read_asar_header(archive)
    return [(path, int(entry.get("size") or 0)) for path, entry in _walk_asar(tree)]


def _extract_asar(archive: Path, dest: Path, max_bytes: int, report: ExtractReport) -> None:
    tree, base = read_asar_header(archive)
    entries = list(_walk_asar(tree))
    if sum(int(e.get("size") or 0) for _, e in entries) > max_bytes:
        raise ExtractError("The archive expands past the extraction size limit.")
    size_on_disk = archive.stat().st_size
    with open(archive, "rb") as fh:
        for path, entry in entries:
            if entry.get("link") or entry.get("unpacked"):
                report.skipped.append(f"{path}: link or unpacked file")
                continue
            target = _safe_target(dest, path)
            if target is None:
                report.skipped.append(f"{path}: path escapes the extraction folder")
                continue
            try:
                offset = base + int(entry.get("offset", 0))
                size = int(entry.get("size") or 0)
            except (TypeError, ValueError):
                report.skipped.append(f"{path}: bad entry")
                continue
            if offset < base or offset + size > size_on_disk:
                report.skipped.append(f"{path}: outside the archive")
                continue
            fh.seek(offset)
            _write_stream(_Limited(fh, size), target, report, max_bytes)


class _Limited:
    def __init__(self, fh, remaining: int) -> None:
        self._fh, self._left = fh, remaining

    def read(self, n: int) -> bytes:
        if self._left <= 0:
            return b""
        data = self._fh.read(min(n, self._left))
        self._left -= len(data)
        return data


def archive_kind(path: Path) -> str | None:
    """'zip', 'tar', 'asar', '7z' or None, from content rather than the name."""
    try:
        if path.suffix.lower() == ".asar":
            read_asar_header(path)
            return "asar"
        with open(path, "rb") as fh:
            head = fh.read(8)
        if head.startswith(b"7z\xbc\xaf\x27\x1c"):
            return "7z"
        if zipfile.is_zipfile(path):
            return "zip"
        if tarfile.is_tarfile(path):
            return "tar"
    except (OSError, ExtractError):
        return None
    return None


def safe_extract(archive: Path, dest: Path, *, max_bytes: int = MAX_EXTRACT_BYTES) -> ExtractReport:
    """Extract a zip/jar/tar(.gz/.bz2/.xz)/asar into ``dest``; ``ExtractError`` when unsafe or unsupported."""
    archive = Path(archive)
    kind = archive_kind(archive)
    if kind is None:
        raise ExtractError("That file is not a supported archive.")
    if kind == "7z":
        raise ExtractError("7z archives are not supported.")
    dest.mkdir(parents=True, exist_ok=True)
    report = ExtractReport(root=dest)
    try:
        {"zip": _extract_zip, "tar": _extract_tar, "asar": _extract_asar}[kind](archive, dest, max_bytes, report)
    except ExtractError:
        raise
    except (OSError, ValueError, EOFError, RuntimeError, zlib.error, tarfile.TarError, zipfile.BadZipFile) as exc:
        # name clashes (file vs folder), over-long names, encrypted or damaged members
        raise ExtractError(f"The archive could not be extracted safely ({type(exc).__name__}).") from exc
    return report
