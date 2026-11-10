import os

import pytest

from dsh_intel_mcp.reverse.targets import Target, validate_target


@pytest.fixture
def home(tmp_path, monkeypatch):
    home = tmp_path / "home"
    (home / ".ssh").mkdir(parents=True)
    cowork = tmp_path / "cowork"
    cowork.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("DSH_INTEL_HOME", str(cowork))
    return home


def test_accepts_existing_absolute_path(tmp_path, home):
    f = tmp_path / "app.bin"
    f.write_bytes(b"x")
    t = validate_target("path", str(f), allow_websites=True)
    assert t == Target("path", str(f.resolve()))


@pytest.mark.parametrize("value", ["", "relative/path", "/definitely/not/here"])
def test_refuses_bad_paths(home, value):
    with pytest.raises(ValueError):
        validate_target("path", value, allow_websites=True)


def test_refuses_private_dirs_and_symlink_into_them(tmp_path, home):
    secret = home / ".ssh" / "id_rsa"
    secret.write_text("k")
    with pytest.raises(ValueError):
        validate_target("path", str(home / ".ssh"), allow_websites=True)
    link = tmp_path / "innocent"
    os.symlink(home / ".ssh", link)
    with pytest.raises(ValueError):
        validate_target("path", str(link), allow_websites=True)
    with pytest.raises(ValueError):
        validate_target("path", str(secret), allow_websites=True)


def test_refuses_cowork_home(home, tmp_path):
    with pytest.raises(ValueError):
        validate_target("path", str(tmp_path / "cowork"), allow_websites=True)


def test_workspace_target_needs_no_value(home):
    assert validate_target("workspace", "", allow_websites=False) == Target("workspace", "")


def test_url_rules(home):
    ok = validate_target("url", "https://example.com/app", allow_websites=True)
    assert ok.kind == "url"
    for bad in (
        "http://example.com",
        "https://127.0.0.1/",
        "https://[::1]/",
        "https://10.0.0.5/x",
        "https://localhost/",
        "https://printer.local/",
        "https://svc.internal/",
        "https://user:pw@example.com/",
        "ftp://example.com",
        "https://intranet/",
        "",
    ):
        with pytest.raises(ValueError):
            validate_target("url", bad, allow_websites=True)


def test_urls_refused_when_websites_disabled(home):
    with pytest.raises(ValueError, match="turned off"):
        validate_target("url", "https://example.com", allow_websites=False)


def test_unknown_kind(home):
    with pytest.raises(ValueError):
        validate_target("ftp", "x", allow_websites=True)
