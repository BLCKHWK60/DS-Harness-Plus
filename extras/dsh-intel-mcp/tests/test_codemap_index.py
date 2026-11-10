import os
import subprocess
from pathlib import Path

import pytest

from dsh_intel_mcp.codemap import index as index_module
from dsh_intel_mcp.codemap.index import CodeIndex, resolve_rel


def _git_init(root: Path) -> None:
    subprocess.run(["git", "init", "-q"], cwd=root, check=True)


def _write(root: Path, rel: str, text: str) -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return path


def _repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    root.mkdir()
    _write(root, "a.py", "def alpha():\n    return 1\n")
    _write(root, "b.py", "from a import alpha\n\ndef beta():\n    return alpha()\n")
    return root


def test_git_root_respects_gitignore(tmp_path: Path) -> None:
    root = _repo(tmp_path)
    _git_init(root)
    _write(root, ".gitignore", "ignored.py\nbuild_output/\n")
    _write(root, "ignored.py", "def hidden(): pass\n")
    _write(root, "build_output/x.py", "def y(): pass\n")
    _write(root, ".env", "TOKEN=1\n")
    _write(root, "uv.lock", "x\n")
    idx = CodeIndex(root, tmp_path / "db.sqlite")
    idx.refresh()
    paths = {f.path for f in idx.files()}
    assert {"a.py", "b.py", ".gitignore"} <= paths
    assert not paths & {"ignored.py", "build_output/x.py", ".env", "uv.lock"}


def test_non_git_root_skips_vendor_dirs(tmp_path: Path) -> None:
    root = _repo(tmp_path)
    _write(root, "node_modules/p/i.js", "function x(){}\n")
    _write(root, "src/.venv/l.py", "def z(): pass\n")
    _write(root, "src/ok.py", "def ok(): pass\n")
    idx = CodeIndex(root, tmp_path / "db.sqlite")
    idx.refresh()
    assert {f.path for f in idx.files()} == {"a.py", "b.py", "src/ok.py"}


def test_big_and_binary_files_are_skipped(tmp_path: Path) -> None:
    root = _repo(tmp_path)
    _write(root, "big.py", "x = 1\n" * 300_000)
    (root / "blob.py").write_bytes(b"def a():\n\x00\x01\x02")
    idx = CodeIndex(root, tmp_path / "db.sqlite")
    idx.refresh()
    assert {f.path for f in idx.files()} == {"a.py", "b.py"}


def test_refresh_is_incremental_and_drops_deletions(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = _repo(tmp_path)
    idx = CodeIndex(root, tmp_path / "db.sqlite")
    first = idx.refresh()
    assert first.parsed == 2 and first.removed == 0
    assert idx.refresh().parsed == 0

    calls: list[str] = []
    real = index_module.extract
    monkeypatch.setattr(index_module, "extract", lambda path, text: calls.append(path) or real(path, text))
    _write(root, "a.py", "def alpha():\n    return 2\n\ndef gamma():\n    pass\n")
    stats = idx.refresh()
    assert calls == ["a.py"] and stats.parsed == 1
    assert {d.name for d in idx.definitions("a.py")} == {"alpha", "gamma"}

    (root / "b.py").unlink()
    stats = idx.refresh()
    assert stats.removed == 1 and idx.definitions("b.py") == []
    assert {f.path for f in idx.files()} == {"a.py"}


def test_cache_survives_a_new_instance(tmp_path: Path) -> None:
    root = _repo(tmp_path)
    CodeIndex(root, tmp_path / "db.sqlite").refresh()
    again = CodeIndex(root, tmp_path / "db.sqlite")
    assert again.refresh().parsed == 0
    assert oct(os.stat(tmp_path / "db.sqlite").st_mode & 0o777) == "0o600"


def test_references_cover_names_defined_later_in_another_file(tmp_path: Path) -> None:
    root = _repo(tmp_path)
    idx = CodeIndex(root, tmp_path / "db.sqlite")
    idx.refresh()
    assert idx.reference_files("alpha") == {"b.py": 2}
    _write(root, "c.py", "def delta():\n    return 1\n")
    _write(root, "b.py", "from a import alpha\n\ndef beta():\n    return alpha() + delta()\n")
    idx.refresh()
    assert idx.reference_files("delta") == {"b.py": 1}
    _write(root, "d.py", "x = 'delta'\n\ndef later():\n    return delta()\n")
    idx.refresh()
    assert set(idx.reference_files("delta")) == {"b.py", "d.py"}


def test_file_cap_sets_truncated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = tmp_path / "many"
    root.mkdir()
    for n in range(8):
        _write(root, f"f{n}.py", f"def f{n}(): pass\n")
    monkeypatch.setattr(index_module, "MAX_FILES", 5)
    idx = CodeIndex(root, tmp_path / "db.sqlite")
    stats = idx.refresh()
    assert stats.truncated and idx.truncated and stats.files == 5


def test_symlink_escaping_the_root_is_ignored(tmp_path: Path) -> None:
    root = _repo(tmp_path)
    outside = tmp_path / "outside.py"
    outside.write_text("def leaked(): pass\n")
    os.symlink(outside, root / "link.py")
    os.symlink(tmp_path, root / "linkdir")
    idx = CodeIndex(root, tmp_path / "db.sqlite")
    idx.refresh()
    assert {f.path for f in idx.files()} == {"a.py", "b.py"}


def test_enclosing_returns_the_innermost_definition(tmp_path: Path) -> None:
    root = tmp_path / "r"
    root.mkdir()
    _write(root, "m.py", "class K:\n    def run(self):\n        x = 1\n        return x\n\nTOP = 1\n")
    idx = CodeIndex(root, tmp_path / "db.sqlite")
    idx.refresh()
    assert idx.enclosing("m.py", 3).name == "K.run"
    assert idx.enclosing("m.py", 1).name == "K"
    assert idx.enclosing("m.py", 6) is None


def test_resolve_rel_rejects_escapes(tmp_path: Path) -> None:
    for bad in ("../x", "/etc/passwd", "a/../../x", "~/x", "C:\\Windows"):
        with pytest.raises(ValueError):
            resolve_rel(tmp_path, bad)
    assert resolve_rel(tmp_path, ".") == tmp_path.resolve()
