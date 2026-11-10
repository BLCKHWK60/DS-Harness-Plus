"""ASAR reader: listing, extraction, traversal refusal and damaged headers."""
from __future__ import annotations

import json
import struct
from pathlib import Path

import pytest

from dsh_intel_mcp.reverse.analyzers import asar


def build_asar(path: Path, files: dict[str, bytes], *, unpacked: dict[str, bytes] | None = None,
               extra_tree: dict | None = None) -> None:
    """Write an ASAR with Chromium pickle framing: nested dirs from '/' paths."""
    tree: dict = {"files": {}}
    blob = b""
    for name, data in files.items():
        node = tree
        parts = name.split("/")
        for part in parts[:-1]:
            node = node["files"].setdefault(part, {"files": {}})
        node["files"][parts[-1]] = {"size": len(data), "offset": str(len(blob)),
                                    "integrity": {"algorithm": "SHA256", "hash": "00", "blockSize": 4, "blocks": ["00"]}}
        blob += data
    for name, data in (unpacked or {}).items():
        tree["files"][name] = {"size": len(data), "unpacked": True}
        unpacked_dir = path.with_name(path.name + ".unpacked")
        unpacked_dir.mkdir(parents=True, exist_ok=True)
        (unpacked_dir / name).write_bytes(data)
    if extra_tree:
        tree["files"].update(extra_tree)
    raw = json.dumps(tree).encode()
    padded = raw + b"\x00" * (-len(raw) % 4)
    payload = 4 + len(padded)
    header = struct.pack("<II", 4, payload + 4) + struct.pack("<II", payload, len(raw)) + padded
    path.write_bytes(header + blob)


def test_list_and_extract(tmp_path: Path) -> None:
    archive_path = tmp_path / "app.asar"
    build_asar(archive_path, {"main.js": b"console.log(1)", "lib/util.js": b"module.exports = {}"},
               unpacked={"addon.node": b"\x7fELF"})
    archive = asar.open_archive(archive_path)
    entries = archive.by_path()
    assert set(entries) == {"main.js", "lib/util.js", "addon.node"}
    assert entries["addon.node"].unpacked and entries["main.js"].offset == 0
    assert asar.integrity_summary(archive) == {"entries_with_integrity": 2, "algorithms": ["SHA256"]}
    assert asar.read_member(archive, entries["lib/util.js"]) == b"module.exports = {}"
    assert asar.read_member(archive, entries["addon.node"]) == b"\x7fELF"

    dest = tmp_path / "out"
    written, limitations = asar.extract(archive, dest, max_bytes=1_000_000)
    assert written == 3 and not limitations
    assert (dest / "lib" / "util.js").read_bytes() == b"module.exports = {}"


def test_traversal_names_are_refused(tmp_path: Path) -> None:
    archive_path = tmp_path / "evil.asar"
    build_asar(archive_path, {"ok.js": b"1"}, extra_tree={"..": {"files": {"x": {"size": 1, "offset": "0"}}},
                                                          "../x": {"size": 1, "offset": "0"}})
    archive = asar.open_archive(archive_path)
    assert set(archive.by_path()) == {"ok.js"}
    assert any("unsafe" in lim for lim in archive.limitations)

    # A hand-built entry that bypasses the listing is still refused at extraction.
    bad = asar.AsarEntry(path="../escape.txt", size=1, offset=0)
    archive.entries.append(bad)
    dest = tmp_path / "out"
    written, limitations = asar.extract(archive, dest, max_bytes=1000)
    assert written == 1
    assert any("unsafe" in lim.lower() for lim in limitations)
    assert not (tmp_path / "escape.txt").exists()


def test_truncated_header_is_an_error(tmp_path: Path) -> None:
    good = tmp_path / "good.asar"
    build_asar(good, {"a.js": b"x"})
    data = good.read_bytes()
    for cut in (5, 20):
        broken = tmp_path / f"broken{cut}.asar"
        broken.write_bytes(data[:cut])
        with pytest.raises(asar.AsarError):
            asar.open_archive(broken)
    junk = tmp_path / "junk.asar"
    junk.write_bytes(b"\x01\x00\x00\x00" * 8)
    with pytest.raises(asar.AsarError):
        asar.open_archive(junk)


def test_extract_respects_byte_cap(tmp_path: Path) -> None:
    archive_path = tmp_path / "big.asar"
    build_asar(archive_path, {"a.bin": b"a" * 100, "b.bin": b"b" * 100})
    archive = asar.open_archive(archive_path)
    written, limitations = asar.extract(archive, tmp_path / "o", max_bytes=150)
    assert written == 1 and any("limit" in lim for lim in limitations)
