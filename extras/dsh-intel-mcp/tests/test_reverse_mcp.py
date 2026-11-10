import json
import os
import plistlib
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

from dsh_intel_mcp.reverse import analyzers
from dsh_intel_mcp.reverse.mcp import ReverseServer, tool_definitions

TOOLS = ["re_survey", "re_inspect", "re_evidence", "re_files", "re_read", "re_strings", "re_disassemble", "re_xrefs", "re_fetch"]


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("DSH_INTEL_HOME", str(tmp_path / "cowork"))
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    (tmp_path / "cowork").mkdir()
    (tmp_path / "home").mkdir()
    return tmp_path


@pytest.fixture
def app(env):
    root = env / "Demo.app"
    c = root / "Contents"
    (c / "MacOS").mkdir(parents=True)
    (c / "Frameworks" / "Electron Framework.framework").mkdir(parents=True)
    (c / "Resources").mkdir()
    (c / "MacOS" / "Demo").write_bytes(b"\x00binary Demo executable string here")
    (c / "Resources" / "app.asar").write_bytes(b"asar")
    (c / "Resources" / "notes.txt").write_text("line1\nline2\nline3\n")
    (c / "Resources" / ".env").write_text("K=SECRETVAL\n")
    with open(c / "Info.plist", "wb") as fh:
        plistlib.dump({"CFBundleIdentifier": "com.example.demo", "CFBundleExecutable": "Demo"}, fh)
    return root


def call(server, name, **args):
    result = server.handle("tools/call", {"name": name, "arguments": args})
    return result["content"][0]["text"], bool(result.get("isError"))


def test_lists_nine_tools(env):
    assert [t["name"] for t in tool_definitions()] == TOOLS
    server = ReverseServer("workspace", "", ".")
    assert len(server.handle("tools/list", {})["tools"]) == 9
    assert server.handle("initialize", {})["serverInfo"]["name"] == "dsh-intel-reverse"


def test_survey_inspect_and_evidence(app, env):
    server = ReverseServer("path", str(app), str(env))
    text, err = call(server, "re_survey")
    assert not err and "app_bundle" in text and "evidence: ev_" in text
    text, err = call(server, "re_inspect", analyzer="app_bundle")
    assert not err and "com.example.demo" in text
    ev = text.split("evidence: ")[1].split()[0]
    assert ev.startswith("ev_")
    listing, _ = call(server, "re_evidence", id=ev)
    assert "runtimes" in listing and "untrusted_tool_data" in listing
    page, err = call(server, "re_evidence", id=ev, facet="runtimes")
    assert not err and "Electron" in page
    missing, _ = call(server, "re_evidence", id="ev_ffffffffffff")
    assert "No evidence" in missing


def test_inspect_default_picks_first_applicable(app, env):
    server = ReverseServer("path", str(app), str(env))
    text, err = call(server, "re_inspect")
    assert not err and "Demo" in text


def test_files_read_strings(app, env):
    server = ReverseServer("path", str(app), str(env))
    text, _ = call(server, "re_files", glob="*.txt")
    assert "Contents/Resources/notes.txt" in text and "Info.plist" not in text
    text, err = call(server, "re_read", path="Contents/Resources/notes.txt", start=2, end=3)
    assert not err and "2: line2" in text and "3: line3" in text and "1: line1" not in text
    text, err = call(server, "re_read", path="Contents/MacOS/Demo")
    assert err and "binary" in text
    text, err = call(server, "re_read", path="Contents/Resources/.env")
    assert err and "SECRETVAL" not in text
    text, err = call(server, "re_strings", path="Contents/MacOS/Demo", grep="executable")
    assert not err and "Demo executable string here" in text


def test_path_escapes_refused(app, env):
    outside = env / "outside.txt"
    outside.write_text("nope")
    (app / "Contents" / "Resources" / "link").symlink_to(outside)
    server = ReverseServer("path", str(app), str(env))
    for path in ("../outside.txt", str(outside), "Contents/../../outside.txt", "Contents/Resources/link", "/etc/passwd"):
        text, err = call(server, "re_read", path=path)
        assert err and "nope" not in text, path
    assert call(server, "re_files", path="../")[1]
    text, _ = call(server, "re_files")
    assert "link" not in text


def test_file_target_confined_to_itself(env):
    f = env / "one.txt"
    f.write_text("alpha\n")
    other = env / "two.txt"
    other.write_text("beta\n")
    server = ReverseServer("path", str(f), str(env))
    assert "alpha" in call(server, "re_read", path=".")[0]
    assert call(server, "re_read", path=str(other))[1]


def test_missing_analyzer_modules_give_clear_errors(app, env):
    server = ReverseServer("path", str(app), str(env))
    text, err = call(server, "re_inspect", analyzer="native")
    if "native" in analyzers.missing_modules():
        assert err and "not available" in text
    text, err = call(server, "re_inspect", analyzer="no_such_analyzer")
    assert err and "not available" in text
    if analyzers.optional_module("native") is None:
        text, err = call(server, "re_disassemble", path="Contents/MacOS/Demo", symbol="main")
        assert err and "native analyzer" in text
        text, err = call(server, "re_xrefs", path="Contents/MacOS/Demo", symbol="main")
        assert err and "native analyzer" in text
    text, err = call(server, "re_fetch", url="https://example.com")
    assert err and "website targets" in text


def test_archive_extraction_navigable_with_absolute_path(env):
    z = env / "p.zip"
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("src/main.py", "print('hi')\n")
    server = ReverseServer("path", str(z), str(env))
    text, err = call(server, "re_inspect", analyzer="archives")
    assert not err and "Extracted to" in text
    root = text.split("Extracted to ")[1].split(" ")[0]
    assert str(env / "cowork" / "reverse" / "extract") in root
    out, err = call(server, "re_read", path=f"{root}/src/main.py")
    assert not err and "print('hi')" in out
    assert call(server, "re_read", path=f"{root}/../../evidence.sqlite")[1]


def test_size_limit(env):
    f = env / "big.bin"
    f.write_bytes(b"0" * (2 * 1024 * 1024))
    server = ReverseServer("path", str(f), str(env), max_target_mb=1)
    text, err = call(server, "re_inspect")
    assert err and "limit" in text


def test_invalid_target_errors_every_tool(env):
    server = ReverseServer("path", "/nonexistent/zzz", str(env))
    text, err = call(server, "re_survey")
    assert err and "does not exist" in text


def test_website_target_fetch_host_check(env):
    server = ReverseServer("url", "https://example.com/app", str(env))
    text, err = call(server, "re_fetch", url="https://evil.test/")
    assert err and "example.com" in text
    text, err = call(server, "re_fetch", url="https://example.com/x")
    web = analyzers.optional_module("website")
    assert err == (web is None or not callable(getattr(web, "fetch", None)))


def test_subprocess_stdio(app, env):
    proc = subprocess.run(
        [sys.executable, "-m", "dsh_intel_mcp.reverse", "--target-kind", "path", "--target", str(app), "--root", str(env)],
        input=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}) + "\n",
        capture_output=True,
        text=True,
        timeout=60,
        env={**os.environ, "DSH_INTEL_HOME": str(env / "cowork"), "HOME": str(env / "home")},
        cwd=str(Path(__file__).resolve().parents[1]),
    )
    assert len(json.loads(proc.stdout.splitlines()[0])["result"]["tools"]) == 9
