"""Where the servers keep their caches and stores.

There is no default location: the data directory comes from the environment variable
``DSH_INTEL_HOME`` (an absolute path) so the user, not this package, decides where data lives.
"""
from __future__ import annotations

import os
from pathlib import Path

ENV_VAR = "DSH_INTEL_HOME"


class DataHomeError(RuntimeError):
    """The data directory is not configured or not usable."""


def data_home() -> Path:
    """The absolute data directory from ``DSH_INTEL_HOME``; fails loudly when unset or relative."""
    raw = os.environ.get(ENV_VAR, "").strip()
    if not raw:
        raise DataHomeError(f"{ENV_VAR} is not set: set it to an absolute directory for the servers' data")
    path = Path(raw).expanduser()
    if not path.is_absolute():
        raise DataHomeError(f"{ENV_VAR} must be an absolute path, got {raw!r}")
    return path
