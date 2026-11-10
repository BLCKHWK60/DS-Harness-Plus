"""``python -m dsh_intel_mcp.reverse`` starts the reverse stdio MCP server."""
from __future__ import annotations

import sys

from dsh_intel_mcp.reverse.mcp import main

if __name__ == "__main__":
    sys.exit(main())
