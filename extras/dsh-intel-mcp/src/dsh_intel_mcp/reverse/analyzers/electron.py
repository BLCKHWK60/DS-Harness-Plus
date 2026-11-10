"""Electron app analyzer: app.asar / app directory internals.

Reads the app's package.json, scans the JS for IPC channels, preload bridges,
window security flags, protocols and endpoints (js_scan), and lists native
addons and source maps. Nothing from the app is executed or imported.
"""
from __future__ import annotations

import json
import plistlib
import time
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

from dsh_intel_mcp.reverse.analyzers import AnalyzeContext, Analyzer, AnalyzerResult, register
from dsh_intel_mcp.reverse.analyzers import asar, js_scan

#: Large-app limits: files scanned and bytes read.
MAX_JS_FILES = 5000
MAX_JS_BYTES = 200 * 1024 * 1024
#: Largest single JS file scanned.
MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_MAPS = 40
MAX_MAP_SOURCES = 200
_JS_SUFFIXES = (".js", ".cjs", ".mjs", ".jsx", ".ts", ".tsx")


@dataclass
class _Layout:
    asar: Path | None = None
    app_dir: Path | None = None
    resources: Path | None = None
    plist: Path | None = None


def _package_has_electron(pkg: Path) -> bool:
    try:
        data = json.loads(pkg.read_text("utf-8", errors="replace"))
    except (OSError, ValueError):
        return False
    if not isinstance(data, dict):
        return False
    return any(
        isinstance(data.get(k), dict) and "electron" in data[k]
        for k in ("dependencies", "devDependencies")
    )


def _locate(path: Path) -> _Layout | None:
    try:
        if path.is_file():
            return _Layout(asar=path, resources=path.parent) if path.suffix == ".asar" else None
        if not path.is_dir():
            return None
        candidates = [path / "Contents" / "Resources", path / "resources", path]
        for res in candidates:
            if (res / "app.asar").is_file():
                layout = _Layout(asar=res / "app.asar", resources=res)
                plists = list(path.glob("Contents/Frameworks/Electron Framework.framework/Resources/Info.plist"))
                layout.plist = plists[0] if plists else None
                return layout
            if (res / "app" / "package.json").is_file():
                return _Layout(app_dir=res / "app", resources=res)
        if (path / "package.json").is_file() and _package_has_electron(path / "package.json"):
            return _Layout(app_dir=path, resources=path)
    except OSError:
        return None
    return None


def detect(path: Path) -> bool:
    return _locate(Path(path)) is not None


class _Source:
    """Uniform read access to either an ASAR archive or a directory tree."""

    def __init__(self, layout: _Layout) -> None:
        self.layout = layout
        self.limitations: list[str] = []
        self.archive: asar.AsarArchive | None = None
        self._entries: dict[str, asar.AsarEntry] = {}
        self._files: dict[str, int] = {}
        if layout.asar is not None:
            try:
                self.archive = asar.open_archive(layout.asar)
            except asar.AsarError as exc:
                self.limitations.append(f"Could not read app.asar: {exc}")
            else:
                self._entries = self.archive.by_path()
                self._files = {p: e.size for p, e in self._entries.items()}
                self.limitations.extend(self.archive.limitations)
        elif layout.app_dir is not None:
            root = layout.app_dir.resolve()
            for p in sorted(root.rglob("*")):
                try:
                    if p.is_symlink() or not p.is_file():
                        continue
                    self._files[p.relative_to(root).as_posix()] = p.stat().st_size
                except OSError:
                    continue
                if len(self._files) >= 200_000:
                    self.limitations.append("Only the first 200,000 files of the app folder were listed.")
                    break

    @property
    def files(self) -> dict[str, int]:
        return self._files

    def read(self, rel: str, limit: int = MAX_FILE_BYTES) -> bytes | None:
        if self.archive is not None:
            entry = self._entries.get(rel)
            return asar.read_member(self.archive, entry, limit) if entry else None
        root = self.layout.app_dir
        if root is None or not asar.safe_member_name(rel):
            return None
        try:
            base = root.resolve()
            target = (base / rel).resolve()
            if base not in target.parents:
                return None
            with open(target, "rb") as fh:
                return fh.read(limit)
        except OSError:
            return None

    def read_text(self, rel: str, limit: int = MAX_FILE_BYTES) -> str | None:
        data = self.read(rel, limit)
        return None if data is None else data.decode("utf-8", errors="replace")


def _resolve_ref(base_file: str, ref: str, files: dict[str, int]) -> str | None:
    """Map a relative require/preload reference to a file in the tree."""
    if not ref or ref.startswith(("/", "http")) or ref.startswith("node:"):
        return None
    if ref.startswith("."):
        joined = PurePosixPath(base_file).parent / ref
    else:
        joined = PurePosixPath(ref)
    parts: list[str] = []
    for part in joined.parts:
        if part == "..":
            if parts:
                parts.pop()
        elif part != ".":
            parts.append(part)
    cand = "/".join(parts)
    for suffix in ("", ".js", ".cjs", ".mjs", ".ts", "/index.js"):
        if cand + suffix in files:
            return cand + suffix
    return None


def _electron_version(layout: _Layout, pkg: dict[str, Any]) -> str | None:
    if layout.plist is not None:
        try:
            with open(layout.plist, "rb") as fh:
                info = plistlib.load(fh)
            version = info.get("CFBundleVersion") or info.get("CFBundleShortVersionString")
            if version:
                return str(version)
        except (OSError, ValueError, plistlib.InvalidFileException):
            pass
    if layout.resources is not None:
        for cand in (layout.resources.parent / "version", layout.resources / "version"):
            try:
                text = cand.read_text("utf-8").strip()
            except OSError:
                continue
            if text and len(text) < 40:
                return text
    for key in ("devDependencies", "dependencies"):
        deps = pkg.get(key)
        if isinstance(deps, dict) and isinstance(deps.get("electron"), str):
            return f"{deps['electron']} (declared in package.json)"
    return None


def _window_risks(windows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    risks: list[dict[str, Any]] = []
    for win in windows:
        flags = win.get("flags", {})
        where = f"{win.get('file', '?')}:{win.get('line', '?')}"
        ni = flags.get("nodeIntegration") == "true"
        ci_off = flags.get("contextIsolation") == "false"
        if ni and ci_off:
            risks.append({
                "severity": "high", "where": where,
                "note": "nodeIntegration is true and contextIsolation is false: any script that runs in this "
                        "window (including injected or remote content) can use Node.js and the whole system.",
            })
        elif ni:
            risks.append({"severity": "high", "where": where,
                          "note": "nodeIntegration is true: page scripts can use Node.js APIs directly."})
        elif ci_off:
            risks.append({"severity": "medium", "where": where,
                          "note": "contextIsolation is false: page scripts share globals with the preload script."})
        if flags.get("sandbox") == "false":
            risks.append({"severity": "medium", "where": where,
                          "note": "sandbox is false: the renderer is not OS-sandboxed."})
        if flags.get("webSecurity") == "false":
            risks.append({"severity": "high", "where": where,
                          "note": "webSecurity is false: same-origin protections are disabled."})
        if flags.get("allowRunningInsecureContent") == "true":
            risks.append({"severity": "medium", "where": where,
                          "note": "allowRunningInsecureContent is true: http content can run in https pages."})
        if flags.get("enableRemoteModule") == "true":
            risks.append({"severity": "high", "where": where,
                          "note": "enableRemoteModule is true: renderers can reach main-process objects."})
    return risks


def _ipc_map(agg: dict[str, list[Any]]) -> list[dict[str, Any]]:
    handlers: dict[str, list[str]] = {}
    callers: dict[str, list[str]] = {}
    for h in agg.get("ipc_handlers", []):
        handlers.setdefault(h["channel"], []).append(h["file"])
    for c in agg.get("ipc_callers", []):
        callers.setdefault(c["channel"], []).append(c["file"])
    rows: list[dict[str, Any]] = []
    for channel in sorted(set(handlers) | set(callers)):
        if channel in handlers and channel in callers:
            status = "matched"
        elif channel in callers:
            status = "unmatched: called but no handler found"
        else:
            status = "unmatched: handler with no caller found in scanned files"
        rows.append({
            "channel": channel, "status": status,
            "handlers": sorted(set(handlers.get(channel, []))),
            "callers": sorted(set(callers.get(channel, []))),
        })
    return rows


def _select_files(src: _Source, entries: list[str], pkg: dict[str, Any]) -> tuple[list[str], list[str], list[str]]:
    """Return ``(scan order, main files, preload files)``; main and preload come first."""
    files = src.files
    main_files: list[str] = []
    main = pkg.get("main")
    if isinstance(main, str):
        found = _resolve_ref("package.json", "./" + main.lstrip("./"), files)
        if found:
            main_files.append(found)
    preload: list[str] = [
        f for f in files if PurePosixPath(f).name.lower().startswith("preload") and f.endswith(_JS_SUFFIXES)
    ]
    js = [f for f in entries if f.endswith(_JS_SUFFIXES)]
    order: list[str] = []
    seen: set[str] = set()

    def add(f: str) -> None:
        if f not in seen and f in files:
            seen.add(f)
            order.append(f)

    for f in main_files + preload:
        add(f)
    # Files required relatively from main/preload, one level.
    for f in list(order):
        text = src.read_text(f)
        if text is None:
            continue
        for ref in js_scan.scan_text(text)["imports"]:
            target = _resolve_ref(f, ref, files)
            if target:
                add(target)
    for f in js:
        add(f)
    return order, main_files, preload


def analyze_layout(layout: _Layout, ctx: AnalyzeContext) -> AnalyzerResult:
    src = _Source(layout)
    limitations = list(src.limitations)
    files = src.files

    pkg: dict[str, Any] = {}
    pkg_text = src.read_text("package.json") if "package.json" in files else None
    if pkg_text:
        try:
            loaded = json.loads(pkg_text)
            pkg = loaded if isinstance(loaded, dict) else {}
        except ValueError:
            limitations.append("package.json could not be parsed.")
    elif files:
        limitations.append("No package.json found in the app.")

    app_js = [f for f in files if f.endswith(_JS_SUFFIXES) and "node_modules/" not in f and not f.endswith(".min.js.map")]
    order, main_files, preload_files = _select_files(src, app_js, pkg)

    agg: dict[str, list[Any]] = {}
    open_external: list[dict[str, Any]] = []
    scanned = 0
    read_bytes = 0
    for rel in order:
        if scanned >= MAX_JS_FILES:
            limitations.append(f"Scan stopped at {MAX_JS_FILES} JavaScript files.")
            break
        if read_bytes >= MAX_JS_BYTES:
            limitations.append(f"Scan stopped at {MAX_JS_BYTES // (1024 * 1024)} MB of JavaScript.")
            break
        if ctx.deadline and time.monotonic() > ctx.deadline:
            limitations.append("Scan stopped at the time limit.")
            break
        data = src.read(rel)
        if data is None:
            continue
        scanned += 1
        read_bytes += len(data)
        found = js_scan.scan_text(data.decode("utf-8", errors="replace"), path=rel)
        if found["open_external_lines"]:
            open_external.append({"file": rel, "lines": found["open_external_lines"][:20]})
        js_scan.merge(agg, found, path=rel)
    skipped = len(app_js) - scanned
    if skipped > 0 and scanned >= MAX_JS_FILES:
        limitations.append(f"{skipped} JavaScript files were not scanned.")

    # Preload files named in window options also count as preload.
    for win in agg.get("browser_windows", []):
        ref = win.get("flags", {}).get("preload")
        name = js_scan.preload_name(ref) if ref else None
        if name:
            target = _resolve_ref(win["file"], "./" + name.lstrip("./"), files) or next(
                (f for f in files if f.endswith("/" + name) or f == name), None
            )
            if target and target not in preload_files:
                preload_files.append(target)

    addons = sorted(f for f in files if f.endswith(".node"))
    unpacked_addons: list[str] = []
    if layout.asar is not None:
        unpacked_dir = layout.asar.with_name(layout.asar.name + ".unpacked")
        if unpacked_dir.is_dir():
            try:
                unpacked_addons = sorted(
                    p.relative_to(unpacked_dir).as_posix() for p in unpacked_dir.rglob("*.node") if not p.is_symlink()
                )
            except OSError:
                pass
    addons = sorted(set(addons) | set(unpacked_addons))

    maps: list[dict[str, Any]] = []
    for rel in sorted(f for f in files if f.endswith(".map"))[:MAX_MAPS]:
        text = src.read_text(rel, 16 * 1024 * 1024)
        sources: list[str] = []
        try:
            doc = json.loads(text) if text else {}
            if isinstance(doc, dict) and isinstance(doc.get("sources"), list):
                sources = [str(s) for s in doc["sources"]][:MAX_MAP_SOURCES]
        except ValueError:
            pass
        maps.append({"path": rel, "sources": sources})
    map_refs = sorted({s for s in agg.get("source_map_comments", []) if isinstance(s, str)})

    windows = agg.get("browser_windows", [])
    risks = _window_risks(windows)
    ipc = _ipc_map(agg)
    unmatched = [row for row in ipc if row["status"].startswith("unmatched")]
    version = _electron_version(layout, pkg)

    deps = pkg.get("dependencies")
    dev_deps = pkg.get("devDependencies")
    facts: dict[str, Any] = {
        "app": [{
            "name": pkg.get("name"), "version": pkg.get("version"), "main": pkg.get("main"),
            "description": pkg.get("description"),
            "electron_version": version,
            "packaging": "asar" if layout.asar is not None else "directory",
            "files_total": len(files), "js_files_scanned": scanned,
        }],
        "dependencies": sorted(deps)[:500] if isinstance(deps, dict) else [],
        "dev_dependencies": sorted(dev_deps)[:500] if isinstance(dev_deps, dict) else [],
        "entry_files": [{"role": "main", "path": p} for p in main_files]
        + [{"role": "preload", "path": p} for p in sorted(set(preload_files))],
        "ipc_channels": ipc,
        "ipc_main_to_renderer": agg.get("ipc_sends", []) + [
            {**x, "listener": True} for x in agg.get("ipc_listeners", [])
        ],
        "exposed_apis": agg.get("exposed_apis", []),
        "windows": windows,
        "security_risks": risks,
        "protocols": agg.get("protocols", []),
        "open_external_uses": open_external,
        "native_addons": addons,
        "source_maps": maps,
        "source_map_references": map_refs[:100],
        "endpoints": agg.get("endpoints", []),
        "api_routes": agg.get("api_routes", []),
        "env_names": agg.get("env_names", []),
    }
    if asar_archive := src.archive:
        facts["asar"] = [{"path": str(layout.asar), "files": len(asar_archive.entries),
                          **asar.integrity_summary(asar_archive)}]

    extracted: Path | None = None
    if src.archive is not None:
        dest = ctx.work_dir / "electron-app"
        try:
            written, lim = asar.extract(src.archive, dest, max_bytes=ctx.max_bytes)
        except OSError as exc:
            limitations.append(f"Could not extract app.asar: {exc}")
        else:
            limitations.extend(lim)
            if written:
                extracted = dest
    if addons:
        limitations.append("Native .node addons were listed only; analyze them with the native analyzer.")

    name = pkg.get("name") or "unnamed app"
    parts = [f"Electron app '{name}'" + (f" {pkg['version']}" if pkg.get("version") else "")]
    if version:
        parts.append(f"Electron {version}")
    parts.append(f"{len(ipc)} IPC channels ({len(unmatched)} unmatched)")
    parts.append(f"{len(facts['exposed_apis'])} preload APIs")
    parts.append(f"{len(windows)} windows, {len(risks)} security notes")
    if addons:
        parts.append(f"{len(addons)} native addons")
    return AnalyzerResult(
        summary=", ".join(parts) + ".", facts=facts, limitations=limitations, extracted_root=extracted
    )


def run(path: Path, ctx: AnalyzeContext) -> AnalyzerResult:
    layout = _locate(Path(path))
    if layout is None:
        return AnalyzerResult(summary="Not an Electron app.", facts={}, limitations=["No app.asar or app folder found."])
    return analyze_layout(layout, ctx)


register(Analyzer(name="electron", title="Electron app (ASAR / app folder)", detect=detect, run=run))
