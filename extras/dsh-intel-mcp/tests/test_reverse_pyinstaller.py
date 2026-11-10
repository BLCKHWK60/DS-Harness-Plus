import importlib.util
import marshal
import random
import struct
import zlib

from dsh_intel_mcp.reverse import analyzers
from dsh_intel_mcp.reverse.analyzers import AnalyzeContext, pyinstaller

MAGIC = pyinstaller.MAGIC


def _ctx(tmp_path):
    return AnalyzeContext(work_dir=tmp_path / "work", max_bytes=50 * 1024 * 1024, deadline=1e18)


def _pyz(names, magic=None):
    toc = marshal.dumps([(n, (0, 0, 0)) for n in names])
    body = b"PYZ\x00" + (magic or importlib.util.MAGIC_NUMBER) + struct.pack("!i", 12)
    return body + toc


def _carchive(entries, pyvers=310, prefix=b"\x7fELF-stub" + b"\x00" * 32):
    """entries: list of (name, typecode, data, compress)."""
    blobs, toc_items = b"", []
    for name, code, data, compress in entries:
        payload = zlib.compress(data) if compress else data
        toc_items.append((len(prefix) * 0 + len(blobs), len(payload), len(data), compress, code, name))
        blobs += payload
    toc = b""
    for pos, csize, usize, compress, code, name in toc_items:
        raw_name = name.encode() + b"\x00"
        raw_name += b"\x00" * ((-len(raw_name)) % 16)
        entry_len = struct.calcsize("!IIIIBc") + len(raw_name)
        toc += struct.pack("!IIIIBc", entry_len, pos, csize, usize, int(compress), code.encode()) + raw_name
    toc_offset = len(blobs)
    pkg_len = len(blobs) + len(toc) + pyinstaller.COOKIE_V21.size
    cookie = pyinstaller.COOKIE_V21.pack(MAGIC, pkg_len, toc_offset, len(toc), pyvers, b"libpython3.10.so")
    return prefix + blobs + toc + cookie


def test_parses_entries_and_version(tmp_path):
    data = _carchive(
        [
            ("main", "s", b"print('hi')\n", True),
            ("PYZ-00.pyz", "z", _pyz(["os", "app.core"]), False),
            ("libfoo.so", "b", b"\x7fELFxxxx", True),
        ]
    )
    f = tmp_path / "app.bin"
    f.write_bytes(data)
    assert analyzers.get("pyinstaller").detect(f)
    result = analyzers.get("pyinstaller").run(f, _ctx(tmp_path))
    assert result.facts["overview"]["python_version"] == "3.10"
    assert result.facts["entry_scripts"] == ["main"]
    assert result.facts["modules"] == ["app.core", "os"]
    assert result.facts["binaries"] == ["libfoo.so"]
    assert "3.10" in result.summary


def test_foreign_pyz_magic_still_lists_names_with_limitation(tmp_path):
    data = _carchive([("PYZ-00.pyz", "z", _pyz(["a.b"], magic=b"\x00\x00\x0d\x0a"), True)])
    f = tmp_path / "app.bin"
    f.write_bytes(data)
    result = analyzers.get("pyinstaller").run(f, _ctx(tmp_path))
    assert result.facts["modules"] == ["a.b"]
    assert any("different Python" in lim for lim in result.limitations)


def test_extract_entry_scripts(tmp_path):
    f = tmp_path / "app.bin"
    f.write_bytes(_carchive([("../evil/main", "s", b"print(1)", True)]))
    written = pyinstaller.extract_entries(f, tmp_path / "out")
    assert len(written) == 1 and written[0].parent == tmp_path / "out"
    assert written[0].read_bytes() == b"print(1)"


def test_truncated_archive_is_a_limitation(tmp_path):
    data = _carchive([("main", "s", b"x" * 500, False)])
    for cut in (len(data) - 10, len(data) // 2, 5, 0):
        f = tmp_path / f"t{cut}.bin"
        f.write_bytes(data[:cut])
        result = analyzers.get("pyinstaller").run(f, _ctx(tmp_path))
        assert result.limitations


def test_corrupted_toc_does_not_raise(tmp_path):
    data = bytearray(_carchive([("main", "s", b"abc", False)]))
    data[-100:-90] = b"\xff" * 10
    f = tmp_path / "c.bin"
    f.write_bytes(bytes(data))
    result = analyzers.get("pyinstaller").run(f, _ctx(tmp_path))
    assert isinstance(result.limitations, list)


def test_fuzz_never_raises(tmp_path):
    rng = random.Random(99)
    base = _carchive([("main", "s", b"abc", True), ("PYZ-00.pyz", "z", _pyz(["x"]), False)])
    for i in range(200):
        f = tmp_path / f"fz{i}.bin"
        if i % 2:
            blob = bytearray(base)
            for _ in range(rng.randint(1, 8)):
                blob[rng.randrange(len(blob))] = rng.randrange(256)
            f.write_bytes(bytes(blob))
        else:
            f.write_bytes(rng.randbytes(rng.randint(0, 400)) + (MAGIC if i % 4 == 0 else b""))
        result = analyzers.get("pyinstaller").run(f, _ctx(tmp_path))
        assert isinstance(result.limitations, list)
