import stat
from pathlib import Path

import pytest

from dsh_intel_mcp.codemap import render
from dsh_intel_mcp.codemap.index import CodeIndex
from dsh_intel_mcp.codemap.rank import rank_files


def _write(root: Path, rel: str, text: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


@pytest.fixture
def repo(tmp_path: Path) -> CodeIndex:
    root = tmp_path / "proj"
    _write(root, "core.py", "class Engine:\n    def start(self):\n        return 1\n\ndef shared_helper():\n    return 2\n")
    _write(root, "a.py", "from core import shared_helper\n\ndef use_a():\n    return shared_helper()\n")
    _write(root, "b.py", "from core import Engine, shared_helper\n\nclass Runner:\n    def go(self):\n        Engine().start()\n        return shared_helper()\n")
    _write(root, "lonely.py", "def unrelated_thing():\n    return 3\n")
    _write(root, "src/main.py", "from core import shared_helper\n\ndef main():\n    shared_helper()\n")
    _write(root, "notes.txt", "needle in a haystack\nsecond needle\n")
    _write(root, ".env", "needle=secret\n")
    idx = CodeIndex(root, tmp_path / "db.sqlite")
    idx.refresh()
    return idx


def test_the_most_referenced_file_ranks_first(repo: CodeIndex) -> None:
    ranked = rank_files(repo)
    assert ranked[0][0] == "core.py"
    assert {p for p, _ in ranked} == {f.path for f in repo.files()}


def test_focus_boosts_a_file_and_a_symbol(repo: CodeIndex) -> None:
    base = [p for p, _ in rank_files(repo)]
    focused = [p for p, _ in rank_files(repo, focus_files=["lonely.py"])]
    assert focused.index("lonely.py") < base.index("lonely.py")
    assert rank_files(repo, focus_symbols=["unrelated_thing"])[0][0] == "lonely.py"


def test_overview_lists_counts_tree_entry_points_and_top_files(repo: CodeIndex) -> None:
    text = render.overview(repo)
    assert "proj:" in text and "python" in text and "src/ (1 files)" in text
    assert "src/main.py" in text and "most referenced files:" in text and ".env" not in text
    assert render.overview(repo, "src").startswith("proj/src: 1 files")


def test_budgets_are_respected_with_a_truncation_footer(repo: CodeIndex) -> None:
    text = render.repo_map(repo, max_tokens=60)
    assert "truncated" in text.splitlines()[-1] and text.startswith("(") is False
    assert render.tokens(text) <= 80
    full = render.repo_map(repo, max_tokens=4000)
    assert "truncated" not in full and "class Engine" in full and "def shared_helper" in full


def test_outline_and_symbol(repo: CodeIndex) -> None:
    outline = render.outline(repo, "core.py")
    assert "L1-3 class Engine" in outline and "  L2-3 method Engine.start" in outline
    sym = render.symbol(repo, "Engine.start")
    assert "core.py:2-3 method Engine.start" in sym and "return 1" in sym
    assert "return 1" in render.symbol(repo, "start")  # suffix match
    assert "return 1" not in render.symbol(repo, "start", include_body=False)
    assert "No definition" in render.symbol(repo, "nope")


def test_symbol_body_is_capped_at_200_lines(tmp_path: Path) -> None:
    root = tmp_path / "big"
    _write(root, "m.py", "def long():\n" + "    x = 1\n" * 400)
    idx = CodeIndex(root, tmp_path / "db.sqlite")
    idx.refresh()
    text = render.symbol(idx, "long")
    assert "more lines" in text and text.count("x = 1") <= 200


def test_refs_show_file_line_text_and_enclosing_symbol(repo: CodeIndex) -> None:
    text = render.refs(repo, "shared_helper")
    assert "b.py:6:     return shared_helper()  [in Runner.go]" not in text  # text is trimmed
    assert "b.py:6: return shared_helper()  [in Runner.go]" in text
    assert "a.py:4: return shared_helper()  [in use_a]" in text
    assert "core.py:5" not in text  # the definition line is not a reference
    assert "showing 1" in render.refs(repo, "shared_helper", max_results=1)


def test_search_python_fallback(repo: CodeIndex, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(render.shutil, "which", lambda name: None)
    text = render.search(repo, "needle")
    assert "notes.txt:1: needle in a haystack" in text and "notes.txt:2: second needle" in text
    assert ".env" not in text
    assert "a.py:3: def use_a" in render.search(repo, r"def\s+use_\w+", regex=True)
    assert render.search(repo, "shared_helper", glob="*.txt").startswith("0 match(es)")
    assert "truncated" in render.search(repo, "needle", max_results=1)
    with pytest.raises(ValueError):
        render.search(repo, "(", regex=True)


def test_search_uses_an_existing_rg_binary(repo: CodeIndex, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    fake = tmp_path / "rg"
    fake.write_text("#!/bin/sh\nprintf './notes.txt:2:second needle\\n./.env:1:needle=secret\\n'\n")
    fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
    monkeypatch.setattr(render.shutil, "which", lambda name: str(fake))
    text = render.search(repo, "needle")
    assert "notes.txt:2: second needle" in text and ".env" not in text
    monkeypatch.setattr(render.shutil, "which", lambda name: str(tmp_path / "missing"))
    assert "notes.txt:1:" in render.search(repo, "needle")  # not a file -> Python


def test_paths_outside_the_root_are_rejected(repo: CodeIndex) -> None:
    for bad in ("../x", "/etc/passwd"):
        with pytest.raises(ValueError):
            render.outline(repo, bad)
        with pytest.raises(ValueError):
            render.overview(repo, bad)
        with pytest.raises(ValueError):
            render.symbol(repo, "x", file=bad)
        with pytest.raises(ValueError):
            render.repo_map(repo, focus_files=[bad])
