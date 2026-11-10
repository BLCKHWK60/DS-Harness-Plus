import re
from pathlib import Path

import pytest

from dsh_intel_mcp.codemap import render
from dsh_intel_mcp.codemap.index import CodeIndex


def _write(root: Path, rel: str, text: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    root = tmp_path / "packme"
    for n in range(12):
        body = "".join(f"    value_{n}_{i} = {i}\n" for i in range(40))
        _write(root, f"pkg/mod{n}.py", f"def func_{n}():\n{body}    return 1\n")
    _write(root, "README.md", "# title\nhello\n")
    _write(root, ".env", "SECRET=abc\n")
    _write(root, ".env.local", "SECRET=abc\n")
    _write(root, "keys/server.pem", "-----BEGIN-----\n")
    _write(root, "keys/id_rsa", "private\n")
    _write(root, "keys/cert.p12", "x\n")
    _write(root, "uv.lock", "lock\n")
    _write(root, "package-lock.json", "{}\n")
    _write(root, "yarn.lock", "x\n")
    (root / "blob.bin").write_bytes(b"\x00\x01\x02")
    return root


def _files_in(text: str) -> list[str]:
    return re.findall(r"^=== (\S+) \(~\d+ tokens\) ===$", text, flags=re.M)


def test_compress_is_smaller_than_full(repo: Path) -> None:
    small = render.pack(repo, compress=True, max_tokens=100_000)
    full = render.pack(repo, compress=False, max_tokens=100_000)
    assert len(small) < len(full) / 3
    assert "value_3_7 = 7" in full and "value_3_7" not in small
    assert "func_3" in small and "end of pack" in small


def test_pages_are_disjoint_and_cover_all_files(repo: Path) -> None:
    index = CodeIndex(repo, ":memory:")
    index.refresh()
    seen: list[str] = []
    page = 1
    while True:
        text = render.pack(index, compress=False, max_tokens=1500, page=page)
        seen += _files_in(text)
        match = re.search(r"next: page=(\d+)", text)
        if not match:
            break
        assert int(match.group(1)) == page + 1
        page += 1
    assert page > 1
    assert len(seen) == len(set(seen)) == 13  # 12 modules + README
    assert "No page" in render.pack(index, compress=False, max_tokens=1500, page=page + 1)


def test_secret_lock_and_binary_files_are_never_included(repo: Path) -> None:
    for compress in (True, False):
        text = render.pack(repo, compress=compress, max_tokens=100_000)
        files = _files_in(text)
        assert "README.md" in files
        for banned in (".env", ".env.local", "keys/server.pem", "keys/id_rsa", "keys/cert.p12", "uv.lock", "package-lock.json", "yarn.lock", "blob.bin"):
            assert banned not in files and banned not in text
        assert "SECRET=abc" not in text
    named = render.pack(repo, include=[".env", "keys/*"], max_tokens=100_000)
    assert named == "No files to pack."


def test_token_counts_are_present_and_include_ignore_filter(repo: Path) -> None:
    text = render.pack(repo, include=["pkg/*"], ignore=["pkg/mod1*"], compress=True, max_tokens=100_000)
    files = _files_in(text)
    assert "README.md" not in files and "pkg/mod0.py" in files and "pkg/mod10.py" not in files and "pkg/mod1.py" not in files
    assert all(int(n) > 0 for n in re.findall(r"\(~(\d+) tokens\) ===", text))
    assert "tree:" in text


def test_oversized_file_is_truncated_to_its_page(tmp_path: Path) -> None:
    root = tmp_path / "one"
    _write(root, "huge.txt", "line of text\n" * 5000)
    text = render.pack(root, compress=False, max_tokens=500)
    assert "file truncated" in text and render.tokens(text) < 700
