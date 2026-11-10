"""``python -m dsh_intel_mcp.context_saver`` starts the compression helper."""
from __future__ import annotations

import sys

from dsh_intel_mcp.context_saver.server import main

if __name__ == "__main__":
    sys.exit(main())
