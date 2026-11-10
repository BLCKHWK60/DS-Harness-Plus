"""The envelope that marks text taken from a target as untrusted data."""
from __future__ import annotations

import re
from typing import Final

RESULT_MAX_CHARS: Final = 60_000
ENVELOPE_CLOSE: Final = "</untrusted_tool_data>"
_ENVELOPE_TAG_RE: Final = re.compile(r"<(/?\s*untrusted_tool_data)", re.IGNORECASE)


def wrap_untrusted(source: str, body: str, limit: int = RESULT_MAX_CHARS) -> str:
    """``body`` inside the untrusted envelope, at most ``limit`` characters."""
    opening = f'<untrusted_tool_data source="{source}">'
    room = max(0, limit - len(opening) - len(ENVELOPE_CLOSE) - 2)
    text = _ENVELOPE_TAG_RE.sub(r"&lt;\1", body or "").strip()[:room]
    return f"{opening}\n{text}\n{ENVELOPE_CLOSE}"
