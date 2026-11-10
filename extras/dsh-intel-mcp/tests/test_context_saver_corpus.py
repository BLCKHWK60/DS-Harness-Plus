"""Context Saver on generated, realistic corpora: savings targets, and nothing important lost."""
from __future__ import annotations

import json
import random

import pytest

from dsh_intel_mcp.context_saver import compress_text, policy, store


@pytest.fixture(autouse=True)
def _home(tmp_path, monkeypatch):
    monkeypatch.setenv("DSH_INTEL_HOME", str(tmp_path / "home"))
    policy.clear_memo()
    yield
    policy.clear_memo()


def _run(text: str, surface: str = "cowork", retrievable: bool = True):
    return compress_text(text, surface=surface, retrievable=retrievable, min_chars=4000)


def _saved(result) -> float:
    return 1 - result.tokens_after / result.tokens_before


def _json_response() -> tuple[str, dict]:
    rng = random.Random(7)
    items = []
    for i in range(2000):
        items.append({
            "id": i,
            "name": f"customer-{i:04d}",
            "region": rng.choice(["us-east", "us-west", "eu", "apac"]),
            "plan": rng.choice(["free", "pro", "team"]),
            "latency_ms": rng.randint(80, 120),
            "active": True,
            "notes": "regular account, no issues reported in the last billing period",
        })
    items[700] = {**items[700], "error": "upstream timeout while syncing ERRMARK-A"}
    items[1300] = {**items[1300], "status": 503, "message": "service unavailable ERRMARK-B"}
    items[1555] = {**items[1555], "ok": False, "message": "rejected ERRMARK-C"}
    items[400] = {**items[400], "latency_ms": 90_000}
    items[1700] = {**items[1700], "latency_ms": 120_000}
    return json.dumps({"data": items, "page": 1}), {"first": 0, "last": 1999}


def test_json_api_response():
    text, _ = _json_response()
    result = _run(text)
    assert result.changed and result.kind == "json"
    assert _saved(result) >= 0.85
    body = result.text.split("\n[Context Saver:")[0]
    parsed = json.loads(body)
    kept = parsed["data"]["items_kept"]
    kept_ids = {item["id"] for item in kept}
    assert {0, 1, 2, 1998, 1999} <= kept_ids
    for mark in ("ERRMARK-A", "ERRMARK-B", "ERRMARK-C"):
        assert mark in result.text
    assert {400, 1700} <= kept_ids  # the two latency outliers
    assert "latency_ms" in parsed["data"]["_context_saver"]["outlier_indexes"]
    assert parsed["data"]["_context_saver"]["value_counts"]["plan"]


def _build_log() -> str:
    rng = random.Random(11)
    lines = []
    for i in range(5000):
        stamp = f"2024-05-01 10:{(i // 60) % 60:02d}:{i % 60:02d}"
        if i % 7 == 0:
            lines.append(f"{stamp} INFO compiling module {rng.randint(1, 900)} in {rng.randint(10, 99)}ms")
        elif i % 7 == 1:
            lines.append(f"{stamp} INFO step {i} ok")
        elif i % 7 == 2:
            lines.append(f"{stamp} DEBUG cache hit for key {rng.getrandbits(48):012x}")
        elif i % 7 == 3:
            lines.append(f"{stamp} INFO uploading artifact {rng.randint(1, 50)} to bucket-{rng.randint(1, 4)}")
        else:
            lines.append(f"{stamp} INFO heartbeat ok")
    for at, name in ((1200, "A"), (2600, "B"), (4100, "C")):
        lines[at] = f"2024-05-01 11:00:00 ERROR build failed in target {name}: ERRMARK-{name}"
    return "\n".join(lines)


def test_build_log():
    text = _build_log()
    result = _run(text)
    assert result.changed and result.kind == "log"
    assert _saved(result) >= 0.80
    out = result.text.split("\n")
    for name, at in (("A", 1200), ("B", 2600), ("C", 4100)):
        index = next(i for i, line in enumerate(out) if f"ERRMARK-{name}" in line)
        original = text.split("\n")
        # two lines of context either side survive (when they are not repeats of each other)
        assert original[at - 1] in out[max(0, index - 2):index]
        assert original[at + 1] in out[index + 1:index + 3]
    assert "lines like:" in result.text


def _grep_output() -> str:
    rng = random.Random(3)
    lines = []
    for f in range(25):
        path = f"src/components/feature_{f:02d}/internal/handlers/module_{f:02d}.py"
        for k in range(16):
            lines.append(f"{path}:{rng.randint(1, 900)}:    result = process_request(self.client, payload_{k}, retries=3)  # TODO-{f}")
    return "\n".join(lines)


def test_grep_output():
    text = _grep_output()
    assert len(text.split("\n")) == 400
    result = _run(text)
    assert result.changed and result.kind == "search"
    assert _saved(result) >= 0.70
    assert "400 hits in 25 files" in result.text
    assert "src/components/feature_00" in result.text


def _big_diff() -> tuple[str, list[str]]:
    rng = random.Random(5)
    out = ["diff --git a/app.py b/app.py", "index 1111111..2222222 100644", "--- a/app.py", "+++ b/app.py"]
    small_changes: list[str] = []
    line_no = 1
    sizes = [1, 2, 1, 2, 1] + [12] * 6 + [40, 300]
    for h, size in enumerate(sizes):
        context = [f" unchanged_{h}_{i} = compute_something_long(argument_one, argument_two)" for i in range(22)]
        changes = []
        for c in range(size):
            changes.append(f"-old_{h}_{c} = legacy_call({rng.randint(1, 99)})")
            changes.append(f"+new_{h}_{c} = modern_call({rng.randint(1, 99)})")
        body = context[:11] + changes + context[11:]
        old = len(context) + size
        out.append(f"@@ -{line_no},{old} +{line_no},{old} @@ def handler_{h}():")
        out.extend(body)
        if h < 5:
            small_changes.extend(changes)
        line_no += 400
    return "\n".join(out), small_changes


def test_diff():
    text, small = _big_diff()
    assert len(text.split("\n")) > 800
    result = _run(text)
    assert result.changed and result.kind == "diff"
    assert _saved(result) >= 0.50
    kept = set(result.text.split("\n"))
    for line in small:
        assert line in kept


def test_prose_is_unchanged():
    prose = " ".join(["The quick brown fox jumps over the lazy dog, then rests by the river."] * 240)
    assert 4000 < len(prose) < 20_000
    result = _run(prose)
    assert not result.changed and result.text == prose
    # a huge block is the only prose that is cut
    huge = _run("word " * 8000)
    assert huge.changed and huge.kind == "head_tail" and "chars omitted" in huge.text


def test_retrieval_returns_the_original():
    text = _build_log()
    result = _run(text)
    assert store.retrieve(result.key, max_chars=10**7) == text
    assert store.retrieve(result.key, start_line=1201, end_line=1201) == text.split("\n")[1200]
