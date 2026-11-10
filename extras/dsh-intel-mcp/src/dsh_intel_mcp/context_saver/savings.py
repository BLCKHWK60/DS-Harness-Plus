"""The savings ledger: tokens before and after, per day and surface.

``<data home>/context-saver/savings.json``, ``{"days": {"YYYY-MM-DD":
{"chat": {"calls", "before", "after"}, ...}}}``, 90 days kept.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from dsh_intel_mcp.paths import data_home

logger = logging.getLogger(__name__)

KEEP_DAYS = 90
SURFACES = ("chat", "cowork", "code")

_lock = threading.Lock()


def savings_path() -> Path:
    return data_home() / "context-saver" / "savings.json"


def _today() -> date:
    return date.today()


def _load() -> dict[str, Any]:
    try:
        data = json.loads(savings_path().read_text("utf-8"))
    except (OSError, ValueError):
        return {"days": {}}
    if not isinstance(data, dict) or not isinstance(data.get("days"), dict):
        return {"days": {}}
    return data


def _write(data: dict[str, Any]) -> None:
    path = savings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(data, handle, separators=(",", ":"))
    os.replace(tmp, path)


def record(surface: str, before: int, after: int) -> None:
    """Add one compression of ``before`` tokens to ``after`` tokens to today's ledger."""
    try:
        with _lock:
            data = _load()
            days = data["days"]
            cutoff = (_today() - timedelta(days=KEEP_DAYS)).isoformat()
            for day in [d for d in days if d < cutoff]:
                del days[day]
            cell = days.setdefault(_today().isoformat(), {}).setdefault(surface, {"calls": 0, "before": 0, "after": 0})
            cell["calls"] = int(cell.get("calls", 0)) + 1
            cell["before"] = int(cell.get("before", 0)) + int(before)
            cell["after"] = int(cell.get("after", 0)) + int(after)
            _write(data)
    except OSError as exc:
        logger.warning("Context Saver savings not recorded: %s", type(exc).__name__)


def _blank() -> dict[str, int]:
    return {"calls": 0, "before": 0, "after": 0}


def _add(total: dict[str, int], cell: Any) -> None:
    if not isinstance(cell, dict):
        return
    for field in ("calls", "before", "after"):
        value = cell.get(field, 0)
        total[field] += value if isinstance(value, int) and not isinstance(value, bool) else 0


def _with_saved(cell: dict[str, int]) -> dict[str, int]:
    return {**cell, "saved": max(0, cell["before"] - cell["after"])}


def summary(days: int = 30) -> dict[str, Any]:
    """``{"today", "period", "bySurface", "byDay"}`` over the last ``days`` days."""
    data = _load()["days"]
    today = _today()
    first = (today - timedelta(days=max(1, days) - 1)).isoformat()
    today_total, period = _blank(), _blank()
    by_surface = {name: _blank() for name in SURFACES}
    by_day: list[dict[str, Any]] = []
    for day in sorted(d for d in data if first <= d <= today.isoformat()):
        cells = data[day]
        if not isinstance(cells, dict):
            continue
        row = _blank()
        for surface, cell in cells.items():
            _add(row, cell)
            _add(by_surface.setdefault(surface, _blank()), cell)
        _add(period, row)
        if day == today.isoformat():
            _add(today_total, row)
        by_day.append({"date": day, **_with_saved(row)})
    return {
        "today": _with_saved(today_total),
        "period": _with_saved(period),
        "bySurface": {name: _with_saved(cell) for name, cell in by_surface.items()},
        "byDay": by_day,
    }


def reset() -> None:
    with _lock:
        try:
            savings_path().unlink()
        except FileNotFoundError:
            pass
        except OSError as exc:
            logger.warning("Context Saver savings not reset: %s", type(exc).__name__)
