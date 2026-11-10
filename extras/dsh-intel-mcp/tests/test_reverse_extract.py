import io
import os
import tarfile
import zipfile

import pytest

from dsh_intel_mcp.reverse import extract


def _zip(path, members):
    with zipfile.ZipFile(path, "w") as zf:
        for name, data in members.items():
            zf.writestr(name, data)


def test_extracts_normal_zip(tmp_path):
    z = tmp_path / "a.zip"
    _zip(z, {"dir/a.txt": b"hello", "b.txt": b"world"})
    report = extract.safe_extract(z, tmp_path / "out")
    assert (tmp_path / "out/dir/a.txt").read_bytes() == b"hello"
    assert report.files == 2 and not report.skipped


def test_zip_slip_refused(tmp_path):
    z = tmp_path / "evil.zip"
    _zip(z, {"../escape.txt": b"x", "/abs.txt": b"x", "ok.txt": b"fine"})
    report = extract.safe_extract(z, tmp_path / "out")
    assert not (tmp_path / "escape.txt").exists()
    assert (tmp_path / "out/ok.txt").exists()
    assert len(report.skipped) == 2


def test_tar_traversal_and_links_skipped(tmp_path):
    t = tmp_path / "e.tar"
    with tarfile.open(t, "w") as tf:
        for name, data in (("../x.txt", b"x"), ("good.txt", b"g")):
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tf.addfile(info, io.BytesIO(data))
        link = tarfile.TarInfo("link")
        link.type = tarfile.SYMTYPE
        link.linkname = "/etc/passwd"
        tf.addfile(link)
    report = extract.safe_extract(t, tmp_path / "out")
    assert (tmp_path / "out/good.txt").exists()
    assert not (tmp_path / "x.txt").exists() and not (tmp_path / "out/link").exists()
    assert len(report.skipped) == 2


def test_zip_symlink_member_skipped(tmp_path):
    z = tmp_path / "s.zip"
    with zipfile.ZipFile(z, "w") as zf:
        info = zipfile.ZipInfo("lnk")
        info.external_attr = (0o120777) << 16
        zf.writestr(info, "/etc/passwd")
        zf.writestr("f.txt", "x")
    report = extract.safe_extract(z, tmp_path / "out")
    assert not (tmp_path / "out/lnk").exists() and report.files == 1


def test_size_cap(tmp_path):
    z = tmp_path / "big.zip"
    _zip(z, {"a": b"0" * 5000})
    with pytest.raises(extract.ExtractError):
        extract.safe_extract(z, tmp_path / "out", max_bytes=1000)


def test_unsupported_and_7z(tmp_path):
    f = tmp_path / "x.7z"
    f.write_bytes(b"7z\xbc\xaf\x27\x1c" + b"\0" * 20)
    with pytest.raises(extract.ExtractError, match="7z"):
        extract.safe_extract(f, tmp_path / "o")
    g = tmp_path / "plain"
    g.write_bytes(b"nothing")
    with pytest.raises(extract.ExtractError):
        extract.safe_extract(g, tmp_path / "o")


def _asar(path, files):
    import json
    import struct

    offset, tree, blob = 0, {}, b""
    for name, data in files.items():
        tree[name] = {"size": len(data), "offset": str(offset)}
        offset += len(data)
        blob += data
    raw = json.dumps({"files": tree}).encode()
    pad = (4 - len(raw) % 4) % 4
    pickle_size = 8 + len(raw) + pad
    path.write_bytes(struct.pack("<IIII", 4, pickle_size, pickle_size - 4, len(raw)) + raw + b"\0" * pad + blob)


def test_asar_extract_and_traversal(tmp_path):
    a = tmp_path / "app.asar"
    _asar(a, {"main.js": b"console.log(1)", "../evil.js": b"x"})
    assert ("main.js", 14) in extract.list_asar(a)
    report = extract.safe_extract(a, tmp_path / "out")
    assert (tmp_path / "out/main.js").read_bytes() == b"console.log(1)"
    assert not (tmp_path / "evil.js").exists() and report.skipped


def test_prune_extractions(tmp_path, monkeypatch):
    monkeypatch.setenv("DSH_INTEL_HOME", str(tmp_path))
    old = extract.new_extract_dir("ev_old")
    fresh = extract.new_extract_dir("ev_new")
    (old / "f").write_text("x")
    os.utime(old, (1, 1))
    assert extract.prune_extractions() == 1
    assert not old.exists() and fresh.exists()
