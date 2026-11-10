"""When and how Context Saver compresses: the policy over detect, transforms, store and savings.

``compress_text`` is deterministic: the same text, surface and ``retrievable``
always give the same result (memoised, so a repeated request is byte-identical
and provider prompt caches stay valid). It touches the store only to keep the
original when the result is retrievable. Nothing here logs content.
"""
from __future__ import annotations

import hashlib
import logging
import threading
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Literal

from dsh_intel_mcp.context_saver import detect as detect_mod
from dsh_intel_mcp.context_saver import savings, store, transforms

logger = logging.getLogger(__name__)

Surface = Literal["chat", "cowork", "code"]

MARKER = '\n[Context Saver: {before}→{after} tokens. Full text: context_retrieve("{key}")]'
MIN_GAIN = 0.15
HUGE_CHARS = 20_000
MEMO_SIZE = 2048
DEFAULT_MIN_CHARS = 4000
CHAT_KINDS = frozenset({detect_mod.JSON, detect_mod.LOG, detect_mod.SEARCH, detect_mod.DIFF})

_TRANSFORMS = {
    detect_mod.JSON: transforms.json_crush,
    detect_mod.LOG: transforms.log_fold,
    detect_mod.SEARCH: transforms.search_fold,
    detect_mod.DIFF: transforms.diff_fold,
    detect_mod.HTML: transforms.html_text,
    detect_mod.CODE: transforms.code_outline,
}


@dataclass(frozen=True)
class Compressed:
    text: str
    tokens_before: int
    tokens_after: int
    key: str | None
    kind: str
    changed: bool


def tokens(text: str) -> int:
    """The token estimate: ceil(chars / 4)."""
    return -(-len(text) // 4)


# ── compression ─────────────────────────────────────────────────────────

_memo: OrderedDict[str, Compressed] = OrderedDict()
_memo_lock = threading.Lock()


def clear_memo() -> None:
    with _memo_lock:
        _memo.clear()


def _unchanged(text: str, kind: str) -> Compressed:
    before = tokens(text)
    return Compressed(text, before, before, None, kind, False)


def _pick(kind: str, text: str, surface: str) -> tuple[str, Any] | None:
    if surface == "chat":
        return (kind, _TRANSFORMS[kind]) if kind in CHAT_KINDS else None
    if kind in _TRANSFORMS:
        return kind, _TRANSFORMS[kind]
    if len(text) >= HUGE_CHARS:
        return "head_tail", transforms.head_tail
    return None


def _marked(body: str, before: int, key: str) -> str:
    after = tokens(body)
    for _ in range(3):
        final = body + MARKER.format(before=before, after=after, key=key)
        actual = tokens(final)
        if actual == after:
            break
        after = actual
    return body + MARKER.format(before=before, after=after, key=key)


def _compute(text: str, surface: str, retrievable: bool, min_gain: float) -> tuple[Compressed, bool]:
    """The result, and whether it is a new saving worth recording."""
    kind = detect_mod.detect(text)
    picked = _pick(kind, text, surface)
    if picked is None:
        return _unchanged(text, kind), False
    kind, transform = picked
    before = tokens(text)
    try:
        body = transform(text)
    except Exception as exc:  # noqa: BLE001 - a transform failure leaves the text as it was
        logger.warning("Context Saver transform failed: %s", type(exc).__name__)
        return _unchanged(text, kind), False
    key: str | None = None
    final = body
    if retrievable:
        key = store.key_for(text)
        final = _marked(body, before, key)
    after = tokens(final)
    if after > before * (1 - min_gain):
        return _unchanged(text, kind), False
    if retrievable:
        try:
            store.put(text)
        except Exception as exc:  # noqa: BLE001 - no stored original means no retrieval marker, so no change
            logger.warning("Context Saver store unavailable: %s", type(exc).__name__)
            return _unchanged(text, kind), False
    return Compressed(final, before, after, key, kind, True), True


def compress_text(
    text: str, *, surface: Surface, retrievable: bool, min_chars: int, min_gain: float = MIN_GAIN
) -> Compressed:
    """Compress ``text`` for ``surface``; changed only when at least ``min_gain`` (default 15%) smaller.

    Under ``min_chars`` the text is returned as it is. When ``retrievable`` and
    changed, the original is stored and the result ends with the retrieval marker.
    """
    if not isinstance(text, str) or len(text) < min_chars:
        return _unchanged(text if isinstance(text, str) else "", "none")
    memo_key = hashlib.sha256(f"{surface}|{retrievable}|{min_gain}|{text}".encode("utf-8", "surrogatepass")).hexdigest()
    with _memo_lock:
        hit = _memo.get(memo_key)
        if hit is not None:
            _memo.move_to_end(memo_key)
    if hit is not None:
        if hit.changed and hit.key is not None and not store.exists(hit.key):
            try:
                store.put(text)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Context Saver store unavailable: %s", type(exc).__name__)
                return _unchanged(text, hit.kind)
        return hit
    result, record = _compute(text, surface, retrievable, min_gain)
    with _memo_lock:
        _memo[memo_key] = result
        while len(_memo) > MEMO_SIZE:
            _memo.popitem(last=False)
    if record:
        savings.record(surface, result.tokens_before, result.tokens_after)
    return result


# ── chat history ────────────────────────────────────────────────────────


def _compress_blocks(content: Any, min_chars: int) -> tuple[Any, int, int, bool]:
    """``content`` compressed, its text tokens before and after, and whether it changed."""
    if isinstance(content, str):
        result = compress_text(content, surface="chat", retrievable=False, min_chars=min_chars)
        return result.text, result.tokens_before, result.tokens_after, result.changed
    if not isinstance(content, list):
        return content, 0, 0, False
    blocks: list[Any] = []
    before = after = 0
    changed = False
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text" and isinstance(block.get("text"), str):
            result = compress_text(block["text"], surface="chat", retrievable=False, min_chars=min_chars)
            before += result.tokens_before
            after += result.tokens_after
            if result.changed:
                block = {**block, "text": result.text}
                changed = True
        blocks.append(block)
    return (blocks if changed else content), before, after, changed


def compress_messages(
    messages: list[dict], *, protect_recent: int = 4, min_chars: int
) -> tuple[list[dict], int, int]:
    """``messages`` with their older text compressed, and the text tokens before and after.

    Chat has no tools, so only the near-lossless transforms run (JSON, log,
    search, diff) and nothing is retrievable: no marker. System messages, the
    last ``protect_recent`` messages and anything that is not plain text stay.
    """
    boundary = max(0, len(messages) - max(0, protect_recent))
    out: list[dict] = []
    total_before = total_after = 0
    for index, message in enumerate(messages):
        if (
            index >= boundary
            or not isinstance(message, dict)
            or message.get("role") not in ("user", "assistant")
            or message.get("tool_calls")
        ):
            out.append(message)
            continue
        content, before, after, changed = _compress_blocks(message.get("content"), min_chars)
        total_before += before
        total_after += after
        out.append({**message, "content": content} if changed else message)
    return out, total_before, total_after
