"""``python -m dsh_intel_mcp.context`` starts the context stdio MCP server."""
from __future__ import annotations

import sys

from dsh_intel_mcp.context.mcp import main

if __name__ == "__main__":
    sys.exit(main())
