"""Android APK analyzer: AndroidManifest.xml (binary XML), DEX string/type/method
tables and signing-file names. Static only; signatures are not validated."""

from __future__ import annotations

import logging
import re
import struct
import zipfile
from pathlib import Path
from typing import Any

from dsh_intel_mcp.reverse.analyzers import (
    AnalyzeContext,
    Analyzer,
    AnalyzerResult,
    register,
)
from dsh_intel_mcp.reverse.analyzers import axml
from dsh_intel_mcp.reverse.analyzers.native import expired

logger = logging.getLogger(__name__)

CLASS_CAP = 1500
METHOD_CAP_PER_CLASS = 40
METHODS_TOTAL_CAP = 3000
URL_CAP = 200
COMPONENT_TAGS = ("activity", "activity-alias", "service", "receiver", "provider")
MANIFEST_MAX = 8 * 1024 * 1024
_URL_RE = re.compile(r"^https?://[^\s]{4,300}$")


def _detect(path: Path) -> bool:
    try:
        if not path.is_file() or not zipfile.is_zipfile(path):
            return False
        with zipfile.ZipFile(path) as zf:
            return "AndroidManifest.xml" in zf.namelist()
    except (OSError, zipfile.BadZipFile, ValueError):
        return False


# ---------------------------------------------------------------------------
# manifest
# ---------------------------------------------------------------------------


def _intent_filters(component: axml.Element) -> list[dict[str, Any]]:
    filters = []
    for flt in component.children:
        if flt.tag != "intent-filter":
            continue
        entry: dict[str, Any] = {"actions": [], "categories": [], "data": []}
        for child in flt.children:
            if child.tag == "action":
                entry["actions"].append(child.attrs.get("name"))
            elif child.tag == "category":
                entry["categories"].append(child.attrs.get("name"))
            elif child.tag == "data":
                entry["data"].append({k: v for k, v in child.attrs.items() if v not in ("", None)})
        filters.append(entry)
    return filters


def manifest_facts(root: axml.Element) -> dict[str, Any]:
    """Build manifest facts from a parsed AXML tree."""
    facts: dict[str, Any] = {}
    attrs = root.attrs
    overview: dict[str, Any] = {
        "package": attrs.get("package"),
        "version_name": attrs.get("versionName"),
        "version_code": attrs.get("versionCode"),
    }
    for sdk in root.find_all("uses-sdk"):
        overview["min_sdk"] = sdk.attrs.get("minSdkVersion")
        overview["target_sdk"] = sdk.attrs.get("targetSdkVersion")
        overview["max_sdk"] = sdk.attrs.get("maxSdkVersion")
    for app in root.find_all("application"):
        for key, label in (("debuggable", "debuggable"), ("allowBackup", "allow_backup"), ("usesCleartextTraffic", "cleartext_traffic")):
            if key in app.attrs:
                overview[label] = app.attrs[key]
        if "name" in app.attrs:
            overview["application_class"] = app.attrs["name"]
    facts["overview"] = overview
    facts["permissions"] = sorted({str(p.attrs.get("name")) for p in root.find_all("uses-permission") + root.find_all("uses-permission-sdk-23")})
    defined = [
        {"name": p.attrs.get("name"), "protection_level": p.attrs.get("protectionLevel")}
        for p in root.find_all("permission")
    ]
    if defined:
        facts["defined_permissions"] = defined
    features = sorted({str(f.attrs.get("name")) for f in root.find_all("uses-feature") if f.attrs.get("name")})
    if features:
        facts["features"] = features
    keys = {
        "activity": "activities",
        "activity-alias": "activities",
        "service": "services",
        "receiver": "receivers",
        "provider": "providers",
    }
    for key in ("activities", "services", "receivers", "providers"):
        facts[key] = []
    for tag in COMPONENT_TAGS:
        for comp in root.find_all(tag):
            filters = _intent_filters(comp)
            explicit = comp.attrs.get("exported")
            row = {
                "name": comp.attrs.get("name"),
                "exported": explicit if explicit is not None else bool(filters),
                "exported_explicit": explicit is not None,
                "permission": comp.attrs.get("permission"),
                "intent_filters": filters,
            }
            if tag == "provider":
                row["authorities"] = comp.attrs.get("authorities")
            facts[keys[tag]].append(row)
    exported = [
        f"{kind}:{row['name']}"
        for kind in ("activities", "services", "receivers", "providers")
        for row in facts[kind]
        if row["exported"]
    ]
    facts["exported_components"] = exported
    return facts


# ---------------------------------------------------------------------------
# dex
# ---------------------------------------------------------------------------


def _uleb(data: bytes, pos: int) -> tuple[int, int]:
    result = shift = 0
    while pos < len(data):
        byte = data[pos]
        pos += 1
        result |= (byte & 0x7F) << shift
        if not byte & 0x80:
            break
        shift += 7
        if shift > 35:
            break
    return result, pos


def _descriptor(desc: str) -> str:
    if desc.startswith("L") and desc.endswith(";"):
        return desc[1:-1].replace("/", ".")
    return desc


def parse_dex(data: bytes, *, deadline_ctx: AnalyzeContext | None = None) -> dict[str, Any]:
    """Header plus class and method names from a DEX file. Raises ValueError if malformed."""
    if len(data) < 0x70 or data[:4] != b"dex\n":
        raise ValueError("not a DEX file")
    (file_size, header_size, endian) = struct.unpack_from("<III", data, 32)
    if endian != 0x12345678:
        raise ValueError("unsupported DEX endianness")
    str_n, str_off, type_n, type_off, proto_n, _proto_off, field_n, _field_off, method_n, method_off, class_n, class_off = struct.unpack_from(
        "<12I", data, 56
    )
    for count, size in ((str_n, 4), (type_n, 4), (method_n, 8), (class_n, 32)):
        if count > 2_000_000 or count * size > len(data):
            raise ValueError("DEX table counts exceed file size")
    strings_cache: dict[int, str] = {}

    def string(idx: int) -> str:
        if idx in strings_cache:
            return strings_cache[idx]
        if idx >= str_n or str_off + idx * 4 + 4 > len(data):
            return ""
        (off,) = struct.unpack_from("<I", data, str_off + idx * 4)
        if off >= len(data):
            return ""
        _size, pos = _uleb(data, off)
        end = data.find(b"\x00", pos)
        value = data[pos : end if end >= 0 else len(data)].decode("utf-8", "replace")
        strings_cache[idx] = value
        return value

    def type_name(idx: int) -> str:
        if idx >= type_n or type_off + idx * 4 + 4 > len(data):
            return ""
        (sidx,) = struct.unpack_from("<I", data, type_off + idx * 4)
        return _descriptor(string(sidx))

    classes: list[str] = []
    for i in range(min(class_n, CLASS_CAP * 20)):
        pos = class_off + i * 32
        if pos + 4 > len(data):
            break
        (cidx,) = struct.unpack_from("<I", data, pos)
        classes.append(type_name(cidx))
        if i % 2000 == 0 and expired(deadline_ctx):
            break
    methods: dict[str, list[str]] = {}
    total = 0
    for i in range(method_n):
        pos = method_off + i * 8
        if pos + 8 > len(data):
            break
        cls_idx, _proto_idx, name_idx = struct.unpack_from("<HHI", data, pos)
        cname = type_name(cls_idx)
        bucket = methods.setdefault(cname, [])
        if len(bucket) < METHOD_CAP_PER_CLASS and total < METHODS_TOTAL_CAP:
            bucket.append(string(name_idx))
            total += 1
        if i % 5000 == 0 and expired(deadline_ctx):
            break
    urls: list[str] = []
    for i in range(min(str_n, 200_000)):
        s = string(i)
        if _URL_RE.match(s):
            urls.append(s)
            if len(urls) >= URL_CAP:
                break
    return {
        "header": {
            "version": data[4:7].decode("ascii", "replace"),
            "file_size": file_size,
            "header_size": header_size,
            "strings": str_n,
            "types": type_n,
            "prototypes": proto_n,
            "fields": field_n,
            "methods": method_n,
            "classes": class_n,
        },
        "classes": classes,
        "methods": methods,
        "urls": urls,
    }


# ---------------------------------------------------------------------------
# analyzer
# ---------------------------------------------------------------------------


def _run(path: Path, ctx: AnalyzeContext) -> AnalyzerResult:
    limitations = [
        "signing: META-INF file names only; certificate chains and signature validity are not verified "
        "(APK v2/v3 signing blocks are not inspected)"
    ]
    facts: dict[str, Any] = {}
    try:
        zf = zipfile.ZipFile(path)
    except Exception as exc:  # noqa: BLE001
        return AnalyzerResult("APK could not be opened", {}, [f"not a readable zip: {type(exc).__name__}: {exc}"])
    with zf:
        names = zf.namelist()
        facts["entries"] = {"count": len(names), "native_libs": sorted(n for n in names if n.startswith("lib/") and n.endswith(".so"))[:200]}
        facts["signing_files"] = sorted(n for n in names if n.upper().startswith("META-INF/") and n.upper().endswith((".RSA", ".DSA", ".EC", ".SF", ".MF")))
        try:
            info = zf.getinfo("AndroidManifest.xml")
            if info.file_size > MANIFEST_MAX:
                raise ValueError("manifest larger than 8 MB")
            with zf.open(info) as fh:
                raw = fh.read(MANIFEST_MAX + 1)
            root = axml.parse(raw)
            facts.update(manifest_facts(root))
        except Exception as exc:  # noqa: BLE001
            limitations.append(f"AndroidManifest.xml could not be parsed: {type(exc).__name__}: {exc}")
        dex_names = sorted(n for n in names if re.fullmatch(r"classes\d*\.dex", n))
        dex_summary: list[dict[str, Any]] = []
        all_classes: list[str] = []
        methods: dict[str, list[str]] = {}
        urls: list[str] = []
        for name in dex_names:
            if expired(ctx):
                limitations.append("deadline reached before all DEX files were parsed")
                break
            info = zf.getinfo(name)
            if info.file_size > ctx.max_bytes:
                limitations.append(f"{name} ({info.file_size} bytes) exceeds max_bytes; skipped")
                continue
            try:
                with zf.open(info) as fh:
                    parsed = parse_dex(fh.read(ctx.max_bytes + 1), deadline_ctx=ctx)
            except Exception as exc:  # noqa: BLE001
                limitations.append(f"{name} could not be parsed: {type(exc).__name__}: {exc}")
                continue
            dex_summary.append({"file": name, **parsed["header"]})
            all_classes.extend(parsed["classes"])
            for cls, meths in parsed["methods"].items():
                methods.setdefault(cls, []).extend(meths)
            urls.extend(parsed["urls"])
        if dex_summary:
            facts["dex_files"] = dex_summary
            facts["classes"] = all_classes[:CLASS_CAP]
            facts["methods_by_class"] = {c: m for c, m in list(methods.items())[:CLASS_CAP] if m}
            facts["urls"] = sorted(set(urls))[:URL_CAP]
            if len(all_classes) > CLASS_CAP:
                limitations.append(f"class list capped at {CLASS_CAP} of {len(all_classes)}")
            limitations.append("DEX: names only; bytecode is not disassembled or decompiled")
    overview = facts.get("overview", {})
    summary = (
        f"Android APK {overview.get('package') or '(unknown package)'} "
        f"v{overview.get('version_name') or '?'}: "
        f"{len(facts.get('permissions', []))} permissions, "
        f"{len(facts.get('exported_components', []))} exported components, "
        f"{len(all_classes)} classes in {len(dex_summary)} dex file(s)"
    )
    return AnalyzerResult(summary, facts, limitations)


register(
    Analyzer(
        name="android",
        title="Android APK",
        detect=_detect,
        run=_run,
    )
)
