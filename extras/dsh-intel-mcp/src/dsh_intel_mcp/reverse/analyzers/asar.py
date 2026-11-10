"""Read-only ASAR archive support: header parsing, listing and safe extraction.

An ASAR file is a Chromium pickle header followed by the packed file bytes:

    [uint32 = 4][uint32 header_size][pickle: uint32 payload size, uint32 json length, json, padding]

The member data starts at ``8 + header_size``. Entries marked ``unpacked``
live next to the archive in ``<name>.asar.unpacked/``. Nothing here executes
or imports anything from the archive.
"""
from __future__ import annotations

import json
import os
import struct
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any

#: Largest header JSON read; a real app header is a few MB at most.
MAX_HEADER_BYTES = 64 * 1024 * 1024
#: Most entries listed from one archive.
MAX_ENTRIES = 200_000


class AsarError(ValueError):
    """The archive header is truncated or malformed."""


@dataclass(frozen=True)
class AsarEntry:
    path: str
    size: int
    offset: int | None = None
    unpacked: bool = False
    executable: bool = False
    link: str | None = None
    integrity: dict[str, Any] | None = None


@dataclass
class AsarArchive:
    path: Path
    content_offset: int
    entries: list[AsarEntry] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)

    @property
    def unpacked_dir(self) -> Path:
        return self.path.with_name(self.path.name + ".unpacked")

    def by_path(self) -> dict[str, AsarEntry]:
        return {entry.path: entry for entry in self.entries}


def safe_member_name(name: str) -> bool:
    """Whether ``name`` is a plain relative POSIX path with no traversal."""
    if not name or name.startswith("/") or "\\" in name or "\x00" in name:
        return False
    return all(part not in ("", ".", "..") for part in name.split("/"))


def read_header(path: Path) -> tuple[dict[str, Any], int]:
    """Return ``(file tree, content offset)``; raise AsarError when the header is damaged."""
    try:
        with open(path, "rb") as fh:
            prefix = fh.read(16)
            if len(prefix) < 16:
                raise AsarError("Truncated ASAR header: fewer than 16 bytes.")
            first, header_size, payload_size, json_len = struct.unpack("<IIII", prefix)
            if first != 4:
                raise AsarError("Not an ASAR archive: unexpected pickle size field.")
            if json_len > MAX_HEADER_BYTES or header_size > MAX_HEADER_BYTES + 16:
                raise AsarError("ASAR header is implausibly large.")
            if json_len + 4 > payload_size or payload_size + 4 > header_size:
                raise AsarError("Inconsistent ASAR header sizes.")
            raw = fh.read(json_len)
    except OSError as exc:
        raise AsarError(f"Cannot read the archive: {exc}") from exc
    if len(raw) < json_len:
        raise AsarError("Truncated ASAR header: the JSON table ends early.")
    try:
        tree = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise AsarError("ASAR header JSON is not valid.") from exc
    if not isinstance(tree, dict):
        raise AsarError("ASAR header JSON is not an object.")
    return tree, 8 + header_size


def open_archive(path: Path) -> AsarArchive:
    """Parse the header into a flat entry list. Raises AsarError on a damaged header."""
    tree, content_offset = read_header(path)
    archive = AsarArchive(path=path, content_offset=content_offset)
    refused = 0

    def walk(node: dict[str, Any], prefix: str) -> None:
        nonlocal refused
        files = node.get("files")
        if not isinstance(files, dict):
            return
        for name, child in files.items():
            if not isinstance(child, dict):
                continue
            if len(archive.entries) >= MAX_ENTRIES:
                return
            rel = f"{prefix}{name}"
            if not safe_member_name(name):
                refused += 1
                continue
            if "files" in child:
                walk(child, rel + "/")
                continue
            try:
                size = int(child.get("size", 0))
                offset = int(child["offset"]) if "offset" in child else None
            except (TypeError, ValueError):
                refused += 1
                continue
            integrity = child.get("integrity") if isinstance(child.get("integrity"), dict) else None
            archive.entries.append(
                AsarEntry(
                    path=rel,
                    size=max(size, 0),
                    offset=offset,
                    unpacked=bool(child.get("unpacked")),
                    executable=bool(child.get("executable")),
                    link=child["link"] if isinstance(child.get("link"), str) else None,
                    integrity=integrity,
                )
            )

    walk(tree, "")
    if refused:
        archive.limitations.append(f"{refused} archive entries had unsafe or malformed names and were skipped.")
    if len(archive.entries) >= MAX_ENTRIES:
        archive.limitations.append(f"Only the first {MAX_ENTRIES} entries are listed.")
    return archive


def read_member(archive: AsarArchive, entry: AsarEntry, limit: int | None = None) -> bytes | None:
    """The bytes of one member (up to ``limit``), or None when it is a link or unavailable."""
    if entry.link is not None or not safe_member_name(entry.path):
        return None
    want = entry.size if limit is None else min(entry.size, limit)
    try:
        if entry.unpacked:
            base = archive.unpacked_dir.resolve()
            target = (base / entry.path).resolve()
            if base != target and base not in target.parents:
                return None
            with open(target, "rb") as fh:
                return fh.read(want)
        if entry.offset is None:
            return None
        with open(archive.path, "rb") as fh:
            fh.seek(archive.content_offset + entry.offset)
            data = fh.read(want)
        return data
    except OSError:
        return None


def integrity_summary(archive: AsarArchive) -> dict[str, Any]:
    """Which hash algorithms and how many entries carry integrity data."""
    algos: set[str] = set()
    count = 0
    for entry in archive.entries:
        if entry.integrity:
            count += 1
            algo = entry.integrity.get("algorithm")
            if isinstance(algo, str):
                algos.add(algo)
    return {"entries_with_integrity": count, "algorithms": sorted(algos)}


def extract(
    archive: AsarArchive,
    dest: Path,
    *,
    max_bytes: int,
    names: set[str] | None = None,
) -> tuple[int, list[str]]:
    """Write members under ``dest``; return ``(files written, limitations)``.

    Refuses any member whose resolved path leaves ``dest``, skips links, and
    stops at ``max_bytes`` of written data. Unpacked members are copied from
    the sibling ``.asar.unpacked`` directory when present.
    """
    limitations: list[str] = []
    dest = dest.resolve()
    dest.mkdir(parents=True, exist_ok=True)
    written = 0
    total = 0
    skipped_links = 0
    for entry in archive.entries:
        if names is not None and entry.path not in names:
            continue
        if entry.link is not None:
            skipped_links += 1
            continue
        if not safe_member_name(entry.path):
            limitations.append(f"Refused unsafe member name: {entry.path!r}")
            continue
        target = (dest / PurePosixPath(entry.path)).resolve()
        if dest != target and dest not in target.parents:
            limitations.append(f"Refused member that escapes the extraction folder: {entry.path!r}")
            continue
        if total + entry.size > max_bytes:
            limitations.append(f"Extraction stopped at the {max_bytes // (1024 * 1024)} MB limit.")
            break
        data = read_member(archive, entry)
        if data is None:
            limitations.append(f"Could not read member: {entry.path}")
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        if entry.executable:
            os.chmod(target, 0o644)  # never keep an executable bit
        total += len(data)
        written += 1
    if skipped_links:
        limitations.append(f"{skipped_links} symbolic links in the archive were not extracted.")
    return written, limitations
