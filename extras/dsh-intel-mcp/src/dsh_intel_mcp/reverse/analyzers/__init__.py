"""Analyzer registry. Each analyzer module registers itself at import.

Modules are imported lazily and one at a time: a broken or missing module
disables that analyzer only, with the reason logged.
"""
from __future__ import annotations

import importlib
import logging
import threading
from dataclasses import dataclass, field
from pathlib import Path
from types import ModuleType
from typing import Any, Callable

logger = logging.getLogger(__name__)

MODULES = (
    "app_bundle",
    "data_files",
    "archives",
    "native",
    "dotnet",
    "pyinstaller",
    "android",
    "electron",
    "website",
)


@dataclass
class AnalyzerResult:
    summary: str
    facts: dict[str, Any]
    limitations: list[str] = field(default_factory=list)
    extracted_root: Path | None = None


@dataclass
class AnalyzeContext:
    work_dir: Path
    max_bytes: int
    deadline: float


@dataclass(frozen=True)
class Analyzer:
    name: str
    title: str
    detect: Callable[[Path], bool]
    run: Callable[[Path, AnalyzeContext], AnalyzerResult]


_REGISTRY: dict[str, Analyzer] = {}
_LOCK = threading.Lock()
_LOADED = False
_MISSING: dict[str, str] = {}


def register(analyzer: Analyzer) -> None:
    _REGISTRY[analyzer.name] = analyzer


def load_all() -> None:
    """Import every analyzer module once; failures are recorded, never raised."""
    global _LOADED
    with _LOCK:
        if _LOADED:
            return
        _LOADED = True
        for name in MODULES:
            try:
                importlib.import_module(f"{__name__}.{name}")
            except ImportError as exc:
                _MISSING[name] = str(exc)
                logger.info("reverse analyzer module %s unavailable: %s", name, exc)
            except Exception as exc:  # noqa: BLE001 - one bad module must not break the rest
                _MISSING[name] = f"{type(exc).__name__}: {exc}"
                logger.warning("reverse analyzer module %s failed to load: %s", name, exc)


def missing_modules() -> dict[str, str]:
    load_all()
    return dict(_MISSING)


def optional_module(name: str) -> ModuleType | None:
    """The analyzer module ``name`` when it is present and importable, else None."""
    load_all()
    if name in _MISSING:
        return None
    try:
        return importlib.import_module(f"{__name__}.{name}")
    except Exception:  # noqa: BLE001
        return None


def all_analyzers() -> list[Analyzer]:
    load_all()
    return list(_REGISTRY.values())


def analyzers_for(path: Path) -> list[Analyzer]:
    load_all()
    found: list[Analyzer] = []
    for analyzer in _REGISTRY.values():
        try:
            if analyzer.detect(path):
                found.append(analyzer)
        except Exception:  # noqa: BLE001 - a detector that throws simply does not apply
            logger.debug("detector %s failed on %s", analyzer.name, path, exc_info=True)
    order = {name: i for i, name in enumerate(MODULES)}
    return sorted(found, key=lambda a: order.get(a.name, len(order)))


def get(name: str) -> Analyzer:
    load_all()
    try:
        return _REGISTRY[name]
    except KeyError:
        raise KeyError(f"The '{name}' analyzer is not available in this build.") from None
