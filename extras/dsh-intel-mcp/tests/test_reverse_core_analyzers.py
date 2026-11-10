import json
import plistlib
import sqlite3
import zipfile
from pathlib import Path

import pytest

from dsh_intel_mcp.reverse import analyzers
from dsh_intel_mcp.reverse.analyzers import AnalyzeContext
from dsh_intel_mcp.reverse.evidence import EvidenceStore


def _ctx(tmp_path, max_bytes=50 * 1024 * 1024):
    return AnalyzeContext(work_dir=tmp_path / "work", max_bytes=max_bytes, deadline=1e18)


def _run(name, path, tmp_path):
    return analyzers.get(name).run(path, _ctx(tmp_path))


@pytest.fixture
def app(tmp_path):
    root = tmp_path / "Demo.app"
    contents = root / "Contents"
    (contents / "MacOS").mkdir(parents=True)
    (contents / "Frameworks" / "Electron Framework.framework").mkdir(parents=True)
    (contents / "Frameworks" / "Demo Helper.app").mkdir()
    (contents / "Resources").mkdir()
    (contents / "_CodeSignature").mkdir()
    (contents / "XPCServices" / "Updater.xpc").mkdir(parents=True)
    (contents / "MacOS" / "Demo").write_bytes(b"\xcf\xfa\xed\xfe fake JavaScriptCore")
    (contents / "Resources" / "app.asar").write_bytes(b"asar")
    with open(contents / "Info.plist", "wb") as fh:
        plistlib.dump(
            {
                "CFBundleIdentifier": "com.example.demo",
                "CFBundleName": "Demo",
                "CFBundleShortVersionString": "1.2.3",
                "CFBundleExecutable": "Demo",
                "LSMinimumSystemVersion": "12.0",
                "CFBundleURLTypes": [{"CFBundleURLName": "demo", "CFBundleURLSchemes": ["demo"]}],
                "CFBundleDocumentTypes": [{"CFBundleTypeName": "Doc", "CFBundleTypeExtensions": ["dmo"], "CFBundleTypeRole": "Editor"}],
                "SomeSecretToken": "should-not-appear",
            },
            fh,
        )
    return root


def test_registry_loads_core_analyzers():
    names = {a.name for a in analyzers.all_analyzers()}
    assert {"app_bundle", "data_files", "archives"} <= names
    with pytest.raises(KeyError):
        analyzers.get("nope")


def test_app_bundle_facts(app, tmp_path):
    assert any(a.name == "app_bundle" for a in analyzers.analyzers_for(app))
    result = _run("app_bundle", app, tmp_path)
    f = result.facts
    assert f["info"][0]["CFBundleIdentifier"] == "com.example.demo"
    assert f["info"][0]["LSMinimumSystemVersion"] == "12.0"
    assert f["url_types"][0]["schemes"] == ["demo"]
    assert f["document_types"][0]["extensions"] == ["dmo"]
    assert f["executables"] == ["Demo"]
    assert "Electron Framework.framework" in f["frameworks"]
    assert "Electron" in f["runtimes"] and "JavaScriptCore" in f["runtimes"]
    assert f["asar"] == ["Contents/Resources/app.asar"]
    assert f["code_signature"] == [{"present": True}]
    assert any("electron" in s for s in f["next_steps"])
    kinds = {h["kind"] for h in f["helpers"]}
    assert {"helper_apps", "xpc_services"} <= kinds
    assert any("native analyzer" in lim for lim in result.limitations) or "entitlements" in f
    assert "should-not-appear" not in json.dumps(f)


def test_plain_dir_is_not_an_app(tmp_path):
    d = tmp_path / "folder"
    d.mkdir()
    assert not any(a.name == "app_bundle" for a in analyzers.analyzers_for(d))


def test_sqlite_samples_truncated(tmp_path):
    db = tmp_path / "t.sqlite"
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT, data BLOB, api_token TEXT)")
    conn.execute("CREATE INDEX idx_body ON notes(body)")
    for i in range(5):
        conn.execute("INSERT INTO notes (body, data, api_token) VALUES (?,?,?)", ("x" * 300, b"\x00" * 42, "tok-secret-value"))
    conn.commit()
    conn.close()
    result = _run("data_files", db, tmp_path)
    table = result.facts["tables"][0]
    assert table["row_count"] == 5 and len(table["sample_rows"]) == 3
    row = table["sample_rows"][0]
    assert len(row["body"]) == 80 and row["data"] == "<blob 42 bytes>"
    assert table["indexes"][0]["name"] == "idx_body"
    assert "tok-secret-value" not in json.dumps(result.facts)
    assert [c["name"] for c in table["columns"]] == ["id", "body", "data", "api_token"]


def test_har_names_only_and_no_secret_values(tmp_path):
    har = {
        "log": {
            "entries": [
                {
                    "request": {
                        "method": "POST",
                        "url": "https://api.example.com/v1/users/12345/items/9f1c2a3b-0000-4000-8000-123456789abc?page=2&sig=SECRETQUERY",
                        "headers": [{"name": "Authorization", "value": "Bearer SECRETAUTH123"}, {"name": "Cookie", "value": "sid=SECRETCOOKIE"}],
                        "cookies": [{"name": "sid", "value": "SECRETCOOKIE"}],
                        "postData": {"mimeType": "application/json", "text": json.dumps({"operationName": "GetUser", "query": "query GetUser { me }", "variables": {"password": "SECRETPW"}})},
                    },
                    "response": {
                        "status": 200,
                        "headers": [{"name": "Set-Cookie", "value": "sid=SECRETSET"}],
                        "content": {"mimeType": "application/json; charset=utf-8", "text": json.dumps({"id": 1, "name": "Bob", "tags": ["a"], "access_token": "SECRETBODYTOKEN"})},
                    },
                }
            ]
        }
    }
    p = tmp_path / "cap.har"
    p.write_text(json.dumps(har))
    result = _run("data_files", p, tmp_path)
    ep = result.facts["endpoints"][0]
    assert ep["path"] == "/v1/users/{id}/items/{id}" and ep["host"] == "api.example.com"
    assert ep["request_headers"] == ["authorization", "cookie"] and ep["response_headers"] == ["set-cookie"]
    assert ep["graphql"] == ["GetUser"] and ep["statuses"] == [200]
    assert ep["query_params"] == ["page", "sig"] and ep["content_types"] == ["application/json"]
    assert ep["response_shape"]["tags"][0] == "string"
    store = EvidenceStore(tmp_path / "ev.sqlite")
    ev = store.put(str(p), "data_files", result.summary, result.facts, result.limitations)
    dumped = json.dumps(store.get(ev)) + store.page(ev, "endpoints", 1) + store.page(ev, None, 1)
    for secret in ("SECRETAUTH123", "SECRETCOOKIE", "SECRETSET", "SECRETQUERY", "SECRETPW", "SECRETBODYTOKEN", "Bob"):
        assert secret not in dumped


def test_plist_json_and_env_report_no_values(tmp_path):
    pl = tmp_path / "prefs.plist"
    pl.write_bytes(plistlib.dumps({"Token": "PLISTSECRET", "Nested": {"a": 1}}, fmt=plistlib.FMT_BINARY))
    r = _run("data_files", pl, tmp_path)
    assert sorted(r.facts["keys"]) == ["Nested", "Token"] and "PLISTSECRET" not in json.dumps(r.facts)

    js = tmp_path / "c.json"
    js.write_text(json.dumps({"name": "n", "items": [{"id": 1}], "ok": True}))
    r = _run("data_files", js, tmp_path)
    assert r.facts["shape"][0] == {"name": "string", "items": [{"id": "number"}, "(1 items)"], "ok": "boolean"}

    env = tmp_path / ".env"
    env.write_text("API_KEY=ENVSECRET\n# c\nexport DB=postgres://u:ENVPW@h/d\n")
    r = _run("data_files", env, tmp_path)
    assert r.facts["keys"] == ["API_KEY", "DB"] and "ENVSECRET" not in json.dumps(r.facts) and "ENVPW" not in json.dumps(r.facts)


def test_strings_fallback_ascii_and_utf16(tmp_path):
    from dsh_intel_mcp.reverse.analyzers import data_files

    f = tmp_path / "blob.bin"
    f.write_bytes(b"\x00\x01hello world\x00\xff" + "wide text".encode("utf-16-le") + b"\x00\x00ab\x00Authorization: Bearer abc123xyz\x00")
    out = data_files.strings(f, min_len=6)
    assert "hello world" in out and "wide text" in out and "ab" not in out.split("\n", 1)[1].split()
    assert "abc123xyz" not in out
    assert "hello world" in data_files.strings(f, grep="HELLO") and "wide" not in data_files.strings(f, grep="HELLO")
    r = _run("data_files", f, tmp_path)
    assert r.facts["strings"]


def test_zip_listing_and_extraction(tmp_path):
    z = tmp_path / "pkg.zip"
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("a/b.txt", "hello")
        zf.writestr("../evil", "x")
    assert any(a.name == "archives" for a in analyzers.analyzers_for(z))
    assert not any(a.name == "data_files" for a in analyzers.analyzers_for(z))
    result = _run("archives", z, tmp_path)
    assert {r["path"] for r in result.facts["listing"]} == {"a/b.txt", "../evil"}
    assert result.extracted_root == tmp_path / "work"
    assert (tmp_path / "work/a/b.txt").read_text() == "hello"
    assert not (tmp_path / "evil").exists() and result.facts["skipped_members"]


def test_archive_over_cap_lists_only(tmp_path):
    z = tmp_path / "big.zip"
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("a", b"0" * 4000)
    result = analyzers.get("archives").run(z, _ctx(tmp_path, max_bytes=100))
    assert result.extracted_root is None and result.facts["listing"] and any("Not extracted" in l for l in result.limitations)
