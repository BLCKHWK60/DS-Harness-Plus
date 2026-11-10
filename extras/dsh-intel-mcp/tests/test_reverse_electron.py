"""Electron analyzer and js_scan: IPC map, bridge APIs, window flags, addons, source maps."""
from __future__ import annotations

import json
import time
from pathlib import Path

from dsh_intel_mcp.reverse.analyzers import AnalyzeContext, electron, js_scan
from tests.test_reverse_asar import build_asar

MAIN_JS = """
const { app, BrowserWindow, ipcMain, shell, protocol } = require('electron');
const path = require('path');
const notes = require('./notes');
protocol.registerSchemesAsPrivileged([{ scheme: 'notes-app', privileges: { secure: true } }]);
app.setAsDefaultProtocolClient('notesapp');
ipcMain.handle('get-notes', async () => notes.all());
ipcMain.on('unused-handler', () => {});
function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.webContents.send('notes-updated', 1);
  shell.openExternal('https://example.com/help');
}
fetch('https://api.example.com/v1/items');
const token = process.env.NOTES_TOKEN;
//# sourceMappingURL=main.js.map
"""
PRELOAD_JS = """
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getNotes: () => ipcRenderer.invoke('get-notes'),
  orphan: () => ipcRenderer.invoke('orphan'),
  onUpdated(cb) { ipcRenderer.on('notes-updated', cb); },
  version: '1',
});
"""


def _ctx(tmp_path: Path) -> AnalyzeContext:
    return AnalyzeContext(work_dir=tmp_path / "work", max_bytes=50_000_000, deadline=time.monotonic() + 60)


def _check(facts: dict) -> None:
    rows = {r["channel"]: r for r in facts["ipc_channels"]}
    assert rows["get-notes"]["status"] == "matched"
    assert rows["orphan"]["status"].startswith("unmatched")
    assert rows["unused-handler"]["status"].startswith("unmatched")
    api = facts["exposed_apis"][0]
    assert api["key"] == "api"
    assert {"getNotes", "orphan", "onUpdated", "version"} <= set(api["members"])
    assert any(r["severity"] == "high" and "contextIsolation" in r["note"] for r in facts["security_risks"])
    assert {"role": "preload", "path": "preload.js"} in facts["entry_files"]
    assert "scheme:notes-app" in facts["protocols"] and "default-client:notesapp" in facts["protocols"]
    assert "https://api.example.com/v1/items" in facts["endpoints"]
    assert "NOTES_TOKEN" in facts["env_names"]
    assert facts["open_external_uses"] and facts["open_external_uses"][0]["file"] == "main.js"


def _app_files() -> dict[str, bytes]:
    return {
        "package.json": json.dumps({"name": "notes", "version": "1.2.3", "main": "main.js",
                                    "dependencies": {"left-pad": "1"}, "devDependencies": {"electron": "^30.0.0"}}).encode(),
        "main.js": MAIN_JS.encode(), "preload.js": PRELOAD_JS.encode(), "notes.js": b"module.exports = { all() {} };",
        "dist/app.js.map": json.dumps({"version": 3, "sources": ["src/a.ts", "src/b.ts"]}).encode(),
    }


def test_electron_directory(tmp_path: Path) -> None:
    app = tmp_path / "app"
    for name, data in _app_files().items():
        (app / name).parent.mkdir(parents=True, exist_ok=True)
        (app / name).write_bytes(data)
    assert electron.detect(app)
    result = electron.run(app, _ctx(tmp_path))
    _check(result.facts)
    assert result.facts["app"][0]["electron_version"].startswith("^30.0.0")
    assert result.facts["source_maps"] == [{"path": "dist/app.js.map", "sources": ["src/a.ts", "src/b.ts"]}]
    assert "1 unmatched" not in result.summary and "Electron app 'notes' 1.2.3" in result.summary
    json.dumps(result.facts)


def test_electron_mac_bundle_with_asar(tmp_path: Path) -> None:
    app = tmp_path / "Notes.app"
    res = app / "Contents" / "Resources"
    res.mkdir(parents=True)
    build_asar(res / "app.asar", _app_files(), unpacked={"native.node": b"\xcf\xfa"})
    fw = app / "Contents" / "Frameworks" / "Electron Framework.framework" / "Resources"
    fw.mkdir(parents=True)
    import plistlib
    (fw / "Info.plist").write_bytes(plistlib.dumps({"CFBundleVersion": "30.1.2"}))
    assert electron.detect(app) and electron.detect(res / "app.asar")
    result = electron.run(app, _ctx(tmp_path))
    _check(result.facts)
    assert result.facts["app"][0]["electron_version"] == "30.1.2"
    assert result.facts["native_addons"] == ["native.node"]
    assert result.extracted_root is not None and (result.extracted_root / "main.js").exists()
    assert result.facts["asar"][0]["entries_with_integrity"] >= 4


def test_not_electron(tmp_path: Path) -> None:
    (tmp_path / "package.json").write_text(json.dumps({"dependencies": {"express": "1"}}))
    assert not electron.detect(tmp_path)


def test_js_scan_misc() -> None:
    found = js_scan.scan_text(
        "import a from 'pkg-a'; import('lazy'); export const x = 1; export default function f() {}\n"
        "axios.post('/api/save', {}); const u = '/api/users/{id}';\n"
        "new BrowserWindow({ webPreferences: { sandbox: false, webSecurity: false } });\n"
        "const e = process.env['SECRET_NAME'];"
    )
    assert {"pkg-a", "lazy"} <= set(found["imports"])
    assert {"x", "default"} <= set(found["exports"])
    assert "/api/save" in found["endpoints"] and "/api/users/{id}" in found["api_routes"]
    assert found["browser_windows"][0]["flags"] == {"sandbox": "false", "webSecurity": "false"}
    assert found["env_names"] == ["SECRET_NAME"]
