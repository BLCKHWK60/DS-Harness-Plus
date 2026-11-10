import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

from dsh_intel_mcp.codemap.mcp import CodeMapMcp, tool_definitions

TOOLS = {"code_overview", "code_map", "code_outline", "code_symbol", "code_refs", "code_search", "code_pack"}


@pytest.fixture
def server(tmp_path: Path) -> CodeMapMcp:
    root = tmp_path / "fx"
    root.mkdir()
    (root / "lib.py").write_text("class Box:\n    def open(self):\n        return 1\n\ndef make_box():\n    return Box()\n")
    (root / "app.py").write_text("from lib import make_box\n\ndef run():\n    return make_box().open()\n")
    return CodeMapMcp(root, tmp_path / "db.sqlite")


def _call(server: CodeMapMcp, tool: str, **arguments: Any) -> dict[str, Any]:
    result = server.handle("tools/call", {"name": tool, "arguments": arguments})
    assert result is not None
    return result


def _text(result: dict[str, Any]) -> str:
    return result["content"][0]["text"]


def test_initialize_and_tools_list(server: CodeMapMcp) -> None:
    init = server.handle("initialize", {"protocolVersion": "2025-06-18"})
    assert init["serverInfo"]["name"] == "dsh_intel_codemap" and init["capabilities"] == {"tools": {"listChanged": False}}
    assert server.handle("notifications/initialized", {}) is None
    tools = server.handle("tools/list", {})["tools"]
    assert {t["name"] for t in tools} == TOOLS and len(tools) == 7
    for tool in tools:
        assert tool["inputSchema"]["type"] == "object" and tool["description"]
    required = {t["name"]: t["inputSchema"]["required"] for t in tool_definitions()}
    assert required["code_outline"] == ["file"] and required["code_symbol"] == ["name"] and required["code_search"] == ["pattern"]


def test_every_tool_on_a_fixture_repo(server: CodeMapMcp) -> None:
    assert "2 files" in _text(_call(server, "code_overview"))
    assert "lib.py:" in _text(_call(server, "code_map", focus_files=["app.py"]))
    assert "class Box" in _text(_call(server, "code_outline", file="lib.py"))
    assert "return Box()" in _text(_call(server, "code_symbol", name="make_box"))
    assert "app.py:4" in _text(_call(server, "code_refs", name="make_box"))
    assert "lib.py:1: class Box" in _text(_call(server, "code_search", pattern="class Box"))
    packed = _text(_call(server, "code_pack", compress=False))
    assert "=== lib.py" in packed and "return Box()" in packed
    for name in TOOLS:
        assert not _call(server, name, **({"file": "lib.py"} if name == "code_outline" else {"name": "Box"} if name in {"code_symbol", "code_refs"} else {"pattern": "x"} if name == "code_search" else {})).get("isError")


def test_unknown_tool_and_bad_arguments_are_errors(server: CodeMapMcp) -> None:
    with pytest.raises(RuntimeError, match="Unknown"):
        server.handle("tools/call", {"name": "code_nope", "arguments": {}})
    with pytest.raises(RuntimeError):
        server.handle("nope/method", {})
    missing = _call(server, "code_outline")
    assert missing["isError"] and "file" in _text(missing)
    assert _call(server, "code_symbol", name=5)["isError"]
    assert _call(server, "code_pack", page="1")["isError"]
    assert _call(server, "code_map", focus_files="lib.py")["isError"]
    assert _call(server, "code_search", pattern="(", regex=True)["isError"]


def test_paths_are_confined_to_the_root(server: CodeMapMcp) -> None:
    for bad in ("../x", "/etc/passwd"):
        assert _call(server, "code_outline", file=bad)["isError"]
        assert _call(server, "code_overview", path=bad)["isError"]
        assert _call(server, "code_symbol", name="Box", file=bad)["isError"]


def test_index_is_built_lazily_and_refreshed_on_an_interval(server: CodeMapMcp) -> None:
    assert server._index is None
    _call(server, "code_overview")
    assert server._index is not None
    (server.root / "new.py").write_text("def brand_new():\n    pass\n")
    assert "0 match" in _text(_call(server, "code_search", pattern="def brand_new"))  # within the 30 s window
    server._interval = 0.0
    assert "new.py:1: def brand_new" in _text(_call(server, "code_search", pattern="def brand_new"))


def test_stdio_round_trip(tmp_path: Path) -> None:
    root = tmp_path / "fx"
    root.mkdir()
    (root / "m.py").write_text("def hello():\n    pass\n")
    requests = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "code_symbol", "arguments": {"name": "hello"}}},
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "bogus", "arguments": {}}},
    ]
    import os

    env = {**os.environ, "DSH_INTEL_HOME": str(tmp_path / "home")}
    done = subprocess.run(
        [sys.executable, "-m", "dsh_intel_mcp.codemap", "--root", str(root)],
        input="\n".join(json.dumps(r) for r in requests) + "\n", capture_output=True, text=True, timeout=60, env=env, check=False,
    )
    replies = [json.loads(line) for line in done.stdout.splitlines()]
    assert [r["id"] for r in replies] == [1, 2, 3]
    assert "def hello" in replies[1]["result"]["content"][0]["text"]
    assert "error" in replies[2]
    assert any((tmp_path / "home" / "code-map").glob("*.sqlite"))
    bad = subprocess.run([sys.executable, "-m", "dsh_intel_mcp.codemap", "--root", "relative"], capture_output=True, text=True, timeout=60, env=env, check=False)
    assert bad.returncode == 2
