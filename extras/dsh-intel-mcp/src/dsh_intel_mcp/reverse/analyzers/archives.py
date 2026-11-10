"""Archives (zip/jar/apk, tar family, asar): listing and safe extraction. 7z is not supported."""
from __future__ import annotations

import tarfile
import zipfile
from pathlib import Path
from typing import Any

from dsh_intel_mcp.reverse import extract
from dsh_intel_mcp.reverse.analyzers import AnalyzeContext, Analyzer, AnalyzerResult, register

MAX_LISTED = 500


def detect(path: Path) -> bool:
    return path.is_file() and extract.archive_kind(path) is not None


def _listing(path: Path, kind: str) -> tuple[list[dict[str, Any]], int]:
    rows: list[dict[str, Any]] = []
    total = 0
    if kind == "zip":
        with zipfile.ZipFile(path) as zf:
            infos = [i for i in zf.infolist() if not i.is_dir()]
            total = len(infos)
            rows = [{"path": i.filename, "size": i.file_size, "compressed": i.compress_size} for i in infos[:MAX_LISTED]]
    elif kind == "tar":
        with tarfile.open(path, "r:*") as tf:
            for m in tf:
                if m.isdir():
                    continue
                total += 1
                if len(rows) < MAX_LISTED:
                    rows.append({"path": m.name, "size": m.size, "type": "file" if m.isfile() else "link/special"})
    elif kind == "asar":
        entries = extract.list_asar(path)
        total = len(entries)
        rows = [{"path": p, "size": s} for p, s in entries[:MAX_LISTED]]
    return rows, total


def run(path: Path, ctx: AnalyzeContext) -> AnalyzerResult:
    kind = extract.archive_kind(path) or "unknown"
    limits: list[str] = []
    facts: dict[str, Any] = {}
    if kind == "7z":
        return AnalyzerResult("7z archive; 7z is not supported.", {"listing": []}, ["7z archives are not supported; extract it yourself and point at the folder."])
    try:
        rows, total = _listing(path, kind)
    except Exception as exc:  # noqa: BLE001 - damaged archive is a finding
        return AnalyzerResult(f"{kind} archive could not be read", {"listing": []}, [f"Listing failed: {type(exc).__name__}"])
    facts["listing"] = rows
    if total > len(rows):
        limits.append(f"Only the first {len(rows)} of {total} entries are listed.")
    declared = sum(int(r.get("size") or 0) for r in rows)
    summary = f"{kind} archive with {total} file(s), {declared} bytes listed"
    root: Path | None = None
    try:
        report = extract.safe_extract(path, ctx.work_dir, max_bytes=min(ctx.max_bytes, extract.MAX_EXTRACT_BYTES))
        root = report.root
        facts["extraction"] = [{"root": str(root), "files": report.files, "bytes": report.bytes}]
        if report.skipped:
            facts["skipped_members"] = report.skipped[:200]
            limits.append(f"{len(report.skipped)} member(s) skipped (links, special files or paths that escape the folder).")
        summary += f"; extracted {report.files} file(s) to {root}"
    except extract.ExtractError as exc:
        limits.append(f"Not extracted: {exc}")
    return AnalyzerResult(summary, facts, limits, extracted_root=root)


register(Analyzer("archives", "Archives (zip, jar, tar, asar)", detect, run))
