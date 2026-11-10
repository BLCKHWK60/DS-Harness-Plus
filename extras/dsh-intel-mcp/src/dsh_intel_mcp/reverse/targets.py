"""Validation of what a Reverse Engineer task may point at."""
from __future__ import annotations

import ipaddress
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from dsh_intel_mcp.paths import data_home

TargetKind = Literal["workspace", "path", "url"]

_PRIVATE_HOME_DIRS = (".ssh", ".gnupg", ".aws", ".kube")
_BLOCKED_SUFFIXES = (".local", ".internal", ".localhost", ".lan", ".home.arpa")


@dataclass(frozen=True)
class Target:
    kind: TargetKind
    value: str


def _under(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def _refused_roots() -> list[Path]:
    home = Path(os.path.expanduser("~"))
    roots = [home / name for name in _PRIVATE_HOME_DIRS]
    roots.append(data_home())
    resolved: list[Path] = []
    for root in roots:
        resolved.append(root)
        try:
            resolved.append(root.resolve())
        except OSError:
            pass
    return resolved


def is_private_location(real: Path) -> bool:
    """Whether ``real`` is inside a private folder (~/.ssh, ~/.aws, the Cowork home, ...)."""
    return any(_under(real, root) for root in _refused_roots())


def _contains_private_location(real: Path) -> bool:
    """Whether ``real`` is a parent of a private folder, so that reading under it would reach one."""
    return any(_under(root, real) for root in _refused_roots())


def _validate_path(value: str) -> Target:
    raw = (value or "").strip()
    if not raw:
        raise ValueError("Choose a file or folder to analyze.")
    path = Path(raw).expanduser()
    if not path.is_absolute():
        raise ValueError("The target path must be absolute.")
    if not path.exists():
        raise ValueError("The target path does not exist.")
    real = path.resolve()
    for root in _refused_roots():
        if _under(real, root) or _under(path, root):
            raise ValueError("That location holds private data and cannot be a Reverse Engineer target.")
    if real.is_dir() and _contains_private_location(real):
        raise ValueError("That folder contains private data (such as ~/.ssh or the Cowork home); pick a narrower folder.")
    return Target("path", str(real))


def _validate_url(value: str, allow_websites: bool) -> Target:
    if not allow_websites:
        raise ValueError("Website targets are turned off in the Reverse Engineer plugin settings.")
    raw = (value or "").strip()
    parts = urlsplit(raw)
    if parts.scheme.lower() != "https":
        raise ValueError("Website targets must use https.")
    try:
        host = (parts.hostname or "").lower().rstrip(".")
        parts.port  # noqa: B018 - raises ValueError on a malformed port
    except ValueError as exc:
        raise ValueError("That website address is not valid.") from exc
    if not host:
        raise ValueError("That website address is not valid.")
    if parts.username or parts.password:
        raise ValueError("Website targets cannot contain credentials.")
    try:
        ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        pass
    else:
        raise ValueError("Website targets must use a host name, not an IP address.")
    if host == "localhost" or "." not in host or host.endswith(_BLOCKED_SUFFIXES):
        raise ValueError("Website targets must be public sites, not local or internal hosts.")
    return Target("url", raw)


def validate_target(kind: str, value: str, *, allow_websites: bool) -> Target:
    """The checked ``Target``; ``ValueError`` carries a message fit to show the owner."""
    if kind == "workspace":
        text = (value or "").strip()
        return _validate_path(text) if text else Target("workspace", "")
    if kind == "path":
        return _validate_path(value)
    if kind == "url":
        return _validate_url(value, allow_websites)
    raise ValueError("Unknown target type.")


def url_host(url: str) -> str:
    return (urlsplit(url).hostname or "").lower()
