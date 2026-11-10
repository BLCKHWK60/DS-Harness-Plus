"""macOS .app bundles: what is inside, read from the plist and the directory tree only."""
from __future__ import annotations

import plistlib
from pathlib import Path
from typing import Any

from dsh_intel_mcp.reverse.analyzers import AnalyzeContext, Analyzer, AnalyzerResult, optional_module, register

_INFO_KEYS = (
    "CFBundleIdentifier",
    "CFBundleName",
    "CFBundleDisplayName",
    "CFBundleShortVersionString",
    "CFBundleVersion",
    "CFBundleExecutable",
    "LSMinimumSystemVersion",
    "LSUIElement",
    "NSPrincipalClass",
    "DTSDKName",
)
_MAX_ITEMS = 200
_JSC_SCAN_BYTES = 32 * 1024 * 1024


def detect(path: Path) -> bool:
    return path.is_dir() and path.name.lower().endswith(".app") and (path / "Contents").is_dir()


def _names(directory: Path, *, dirs_only: bool = False) -> list[str]:
    if not directory.is_dir() or directory.is_symlink():
        return []
    out = []
    for child in sorted(directory.iterdir(), key=lambda p: p.name.lower()):
        if dirs_only and not child.is_dir():
            continue
        out.append(child.name)
        if len(out) >= _MAX_ITEMS:
            break
    return out


def _read_info(contents: Path) -> tuple[dict[str, Any], list[str]]:
    plist = contents / "Info.plist"
    limits: list[str] = []
    if not plist.is_file():
        return {}, ["No Info.plist found."]
    try:
        with open(plist, "rb") as fh:
            data = plistlib.load(fh)
    except Exception:  # noqa: BLE001 - malformed plist is a finding, not a crash
        return {}, ["Info.plist could not be parsed."]
    if not isinstance(data, dict):
        return {}, ["Info.plist is not a dictionary."]
    info: dict[str, Any] = {k: data[k] for k in _INFO_KEYS if k in data and isinstance(data[k], (str, int, float, bool))}
    url_types = []
    for entry in data.get("CFBundleURLTypes") or []:
        if isinstance(entry, dict):
            url_types.append(
                {"name": entry.get("CFBundleURLName"), "schemes": [s for s in entry.get("CFBundleURLSchemes") or [] if isinstance(s, str)]}
            )
    doc_types = []
    for entry in data.get("CFBundleDocumentTypes") or []:
        if isinstance(entry, dict):
            doc_types.append(
                {
                    "name": entry.get("CFBundleTypeName"),
                    "role": entry.get("CFBundleTypeRole"),
                    "extensions": [s for s in entry.get("CFBundleTypeExtensions") or [] if isinstance(s, str)],
                    "content_types": [s for s in entry.get("LSItemContentTypes") or [] if isinstance(s, str)],
                }
            )
    return {"info": info, "url_types": url_types, "document_types": doc_types}, limits


def _runtimes(contents: Path, frameworks: list[str], executables: list[str], main_exe: Path | None) -> list[str]:
    found: list[str] = []
    joined = [f.lower() for f in frameworks]
    if any(f.startswith("electron framework") for f in joined):
        found.append("Electron")
    if any(f.startswith("qt") for f in joined):
        found.append("Qt")
    if any(f.startswith("flutter") for f in joined):
        found.append("Flutter")
    if any(f.startswith("python") for f in joined) or any(e.lower().startswith("python") for e in executables):
        found.append("Python")
    probes = [f.lower() for f in frameworks] + [e.lower() for e in executables]
    if any(k in p for p in probes for k in ("coreclr", "hostfxr", "microsoft.netcore", "dotnet", "mono")):
        found.append(".NET / Mono")
    if any(f.startswith("javascriptcore") for f in joined):
        found.append("JavaScriptCore")
    elif main_exe is not None and main_exe.is_file():
        try:
            with open(main_exe, "rb") as fh:
                if b"JavaScriptCore" in fh.read(_JSC_SCAN_BYTES):
                    found.append("JavaScriptCore")
        except OSError:
            pass
    return found


def run(path: Path, ctx: AnalyzeContext) -> AnalyzerResult:
    contents = path / "Contents"
    limits: list[str] = []
    info_facts, info_limits = _read_info(contents)
    limits += info_limits
    info = info_facts.get("info", {})

    executables = _names(contents / "MacOS")
    frameworks = _names(contents / "Frameworks")
    main_name = info.get("CFBundleExecutable")
    main_exe = contents / "MacOS" / main_name if isinstance(main_name, str) and "/" not in main_name else None

    helpers = {
        "helper_apps": [n for n in frameworks if n.lower().endswith(".app")]
        + _names(contents / "Helpers")
        + _names(contents / "Library" / "Helpers"),
        "xpc_services": _names(contents / "XPCServices"),
        "login_items": _names(contents / "Library" / "LoginItems"),
        "plugins": _names(contents / "PlugIns"),
    }
    asar = []
    resources = contents / "Resources"
    if resources.is_dir():
        for item in ("app.asar", "app.asar.unpacked", "default_app.asar"):
            if (resources / item).exists():
                asar.append(f"Contents/Resources/{item}")
    runtimes = _runtimes(contents, frameworks, executables, main_exe)
    signature = (contents / "_CodeSignature").is_dir()
    next_steps: list[str] = []
    if asar or "Electron" in runtimes:
        next_steps.append("Electron app: run re_inspect with analyzer='electron' on this bundle to unpack app.asar.")
    if main_exe is not None and main_exe.is_file():
        next_steps.append(f"Main executable: re_inspect path='{main_exe.relative_to(path)}' with analyzer='native'.")

    facts: dict[str, Any] = {
        "info": [info] if info else [],
        "url_types": info_facts.get("url_types", []),
        "document_types": info_facts.get("document_types", []),
        "executables": executables,
        "frameworks": frameworks,
        "helpers": [{"kind": k, "name": n} for k, names in helpers.items() for n in names],
        "runtimes": runtimes,
        "asar": asar,
        "code_signature": [{"present": bool(signature)}],
        "next_steps": next_steps,
    }

    native = optional_module("native")
    entitlements = getattr(native, "entitlements", None)
    if callable(entitlements) and main_exe is not None and main_exe.is_file():
        try:
            facts["entitlements"] = entitlements(main_exe)
        except Exception:  # noqa: BLE001
            limits.append("The native analyzer could not read entitlements.")
    else:
        limits.append("Entitlements need the native analyzer, which is not available here.")

    name = info.get("CFBundleDisplayName") or info.get("CFBundleName") or path.name
    version = info.get("CFBundleShortVersionString") or info.get("CFBundleVersion") or "unknown version"
    parts = [f"{name} {version} ({info.get('CFBundleIdentifier', 'no bundle id')})"]
    if runtimes:
        parts.append("runtimes: " + ", ".join(runtimes))
    parts.append(f"{len(executables)} executable(s), {len(frameworks)} framework(s), signature {'present' if signature else 'absent'}")
    return AnalyzerResult(summary="; ".join(parts), facts=facts, limitations=limits)


register(Analyzer("app_bundle", "macOS app bundle", detect, run))
