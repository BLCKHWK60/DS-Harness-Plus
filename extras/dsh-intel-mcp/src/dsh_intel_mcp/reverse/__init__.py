"""Reverse engineer: read-only analysis of apps, binaries, archives, data files and websites.

Nothing here executes or loads a target as code. Analyzers read bytes and
report facts; the stdio MCP server in ``mcp`` is what the Code agent uses.
"""
from __future__ import annotations

import logging
import shutil

from dsh_intel_mcp.paths import data_home

logger = logging.getLogger(__name__)

PLUGIN_ID = "reverse-engineer"


def reverse_home():
    return data_home() / "reverse"
