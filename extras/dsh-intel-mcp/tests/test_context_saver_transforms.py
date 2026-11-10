"""Context Saver detection, transforms, policy and savings on small hand-made inputs."""
from __future__ import annotations

import json

import pytest

from dsh_intel_mcp.context_saver import compress_messages, compress_text, detect, policy, savings, transforms


@pytest.fixture(autouse=True)
def _home(tmp_path, monkeypatch):
    monkeypatch.setenv("DSH_INTEL_HOME", str(tmp_path / "home"))
    policy.clear_memo()
    yield
    policy.clear_memo()


# ── detect ──


def test_detect_kinds():
    items = [{"id": i, "v": "x"} for i in range(5)]
    assert detect.detect(json.dumps(items)) == "json"
    assert detect.detect("\n".join(json.dumps(i) for i in items)) == "json"
    assert detect.detect("--- a/f\n+++ b/f\n@@ -1,2 +1,2 @@\n-a\n+b\n c") == "diff"
    assert detect.detect("\n".join(f"src/a.py:{i}:hit {i}" for i in range(10))) == "search"
    assert detect.detect("\n".join(f"2024-01-01 10:00:{i:02d} INFO step {i}" for i in range(10))) == "log"
    assert detect.detect("<!DOCTYPE html><html><body>hi</body></html>") == "html"
    code = "\n".join(["import os", "def f(x):", "    return x + 1", "class A:", "    pass"] * 4)
    assert detect.detect(code) == "code"
    assert detect.detect("A plain sentence about nothing in particular.\nAnother one follows here.") == "prose"
    assert detect.detect("") == "prose"
    assert detect.detect("\n".join(f"line {i}" for i in range(250))) == "log"


# ── transforms ──


def _items(n=40):
    return [{"id": i, "kind": "a" if i % 2 else "b", "n": 10 + i % 3, "text": f"item {i}"} for i in range(n)]


def test_json_stays_valid_and_keeps_errors_and_edges():
    items = _items()
    items[20] = {**items[20], "error": "boom"}
    items[25] = {**items[25], "status": 500}
    out = transforms.json_crush(json.dumps(items))
    parsed = json.loads(out)
    kept = {item["id"] for item in parsed["items_kept"]}
    assert {0, 1, 2, 38, 39, 20, 25} <= kept
    meta = parsed["_context_saver"]
    assert meta["total"] == 40 and meta["omitted"] == 40 - len(kept)
    assert meta["schema"].startswith("id:int, kind:str")
    assert meta["value_counts"]["kind"] == {"b": 20, "a": 20}


def test_json_outliers_by_z_score():
    items = [{"id": i, "n": 100} for i in range(60)]
    items[30]["n"] = 100_000
    parsed = json.loads(transforms.json_crush(json.dumps(items)))
    assert 30 in {item["id"] for item in parsed["items_kept"]}
    assert parsed["_context_saver"]["outlier_indexes"] == {"n": [30]}


def test_json_objects_recurse_and_long_strings_are_cut_in_the_middle():
    doc = {"meta": {"count": 40}, "rows": _items(), "blob": "x" * 2000, "small": [1, 2, 3]}
    parsed = json.loads(transforms.json_crush(json.dumps(doc)))
    assert parsed["meta"] == {"count": 40} and parsed["small"] == [1, 2, 3]
    assert "_context_saver" in parsed["rows"]
    assert "chars cut" in parsed["blob"] and len(parsed["blob"]) < 400
    assert parsed["blob"].startswith("x" * 200) and parsed["blob"].endswith("x" * 60)


def test_json_lines_and_non_json():
    lines = "\n".join(json.dumps(i) for i in _items())
    assert "_context_saver" in json.loads(transforms.json_crush(lines))
    assert transforms.json_crush("not json at all") == "not json at all"
    assert transforms.json_crush("42") == "42"


def test_log_fold_repeats_templates_and_errors():
    lines = [f"2024-01-01 10:00:{i % 60:02d} INFO startup line {i}" for i in range(20)]
    lines += ["heartbeat ok"] * 50
    lines += [f"INFO step {i} ok" for i in range(100)]
    lines += ["a", "b", "ERROR disk full", "c", "d"]
    lines += [f"INFO tail {i}" for i in range(60)]
    out = transforms.log_fold("\n".join(lines)).split("\n")
    assert "heartbeat ok (×50)" in out
    assert "[100 lines like: INFO step <n> ok]" in out
    index = out.index("ERROR disk full")
    assert out[index - 2:index + 3] == ["a", "b", "ERROR disk full", "c", "d"]
    assert out[:20] == lines[:20]
    assert out[-1] == "INFO tail 59"


def test_search_fold_caps_hits_per_file_and_files():
    lines = [f"f{f}.py:{n}:match {n}" for f in range(35) for n in range(1, 9)]
    out = transforms.search_fold("\n".join(lines)).split("\n")
    assert out[0] == "f0.py (8 hits, showing 5)"
    assert out.count("  1: match 1") == 30
    assert "  6: match 6" not in out
    assert out[-1] == "[280 hits in 35 files; showing 150; 5 more files omitted]"


def test_diff_fold_trims_context_and_keeps_changes():
    body = [f" ctx{i}" for i in range(10)] + ["-gone", "+here"] + [f" tail{i}" for i in range(10)]
    diff = "\n".join(["--- a/x", "+++ b/x", "@@ -1,21 +1,21 @@"] + body)
    out = transforms.diff_fold(diff).split("\n")
    assert out[:3] == ["--- a/x", "+++ b/x", "@@ -1,21 +1,21 @@"]
    assert "-gone" in out and "+here" in out
    assert " ctx9" in out and " ctx8" in out and " ctx7" not in out
    assert " tail1" in out and " tail2" not in out
    assert "[… 8 unchanged lines omitted …]" in out
    assert len(out) < len(body)


def test_diff_fold_summarises_a_huge_hunk():
    changes = [f"+line{i}" for i in range(400)]
    diff = "\n".join(["--- a/x", "+++ b/x", "@@ -0,0 +1,400 @@"] + changes)
    out = transforms.diff_fold(diff)
    assert "+line0" in out and "+line399" in out and "+line200" not in out
    assert "changed lines omitted (+330/-0)" in out


def test_html_text_drops_scripts_and_lists_links():
    page = (
        "<html><head><style>p{color:red}</style><script>var secret=1;</script></head><body>"
        "<h1>Title</h1><p>Hello <b>world</b></p><a href='/docs'>Docs</a><a href='#top'>Top</a>"
        "<script>alert(1)</script></body></html>"
    )
    out = transforms.html_text(page)
    assert "Title" in out and "Hello world" in out
    assert "secret" not in out and "alert" not in out and "color:red" not in out
    assert "- Docs -> /docs" in out and "#top" not in out


def test_head_tail_budget_and_marker():
    text = "\n".join(f"line {i:05d}" for i in range(2000))
    out = transforms.head_tail(text)
    assert out.startswith("line 00000") and out.endswith("line 01999")
    assert "chars omitted" in out
    assert len(out) < len(text) / 3


def test_code_outline_falls_back_to_head_tail_without_the_extractor():
    text = "\n".join(f"def f{i}(x):\n    return x" for i in range(300))
    out = transforms.code_outline(text)
    assert out.startswith("def f0(x):")
    assert len(out) < len(text)


# ── policy ──


def test_policy_threshold_gain_and_marker():
    small = json.dumps(_items(5))
    assert compress_text(small, surface="cowork", retrievable=True, min_chars=4000).changed is False
    big = json.dumps(_items(400))
    result = compress_text(big, surface="cowork", retrievable=True, min_chars=4000)
    assert result.changed and result.key and result.kind == "json"
    assert result.text.endswith(f'Full text: context_retrieve("{result.key}")]')
    assert f"{result.tokens_before}→" in result.text
    assert result.tokens_after < result.tokens_before * 0.85


def test_policy_chat_has_no_marker_and_only_lossless_kinds():
    big = json.dumps(_items(400))
    chat = compress_text(big, surface="chat", retrievable=False, min_chars=4000)
    assert chat.changed and chat.key is None and "Context Saver" not in chat.text
    html = "<p>" + "text <b>bold</b> " * 800 + "</p><script>x=1</script>" * 50
    assert not compress_text(html, surface="chat", retrievable=False, min_chars=4000).changed
    assert compress_text(html, surface="cowork", retrievable=True, min_chars=4000).changed
    assert not compress_text("word " * 8000, surface="chat", retrievable=False, min_chars=4000).changed


def test_policy_incompressible_text_is_unchanged():
    rows = json.dumps([{"id": i, "v": f"unique-{i}"} for i in range(5)] + ["z" * 5000])
    # a long string alone is cut, but small arrays are left; the gain rule decides
    result = compress_text(rows, surface="cowork", retrievable=True, min_chars=100)
    assert result.text == rows or result.tokens_after <= result.tokens_before * 0.85


def test_determinism_across_calls_and_memo_clear():
    big = json.dumps(_items(400))
    a = compress_text(big, surface="cowork", retrievable=True, min_chars=4000)
    b = compress_text(big, surface="cowork", retrievable=True, min_chars=4000)
    policy.clear_memo()
    c = compress_text(big, surface="cowork", retrievable=True, min_chars=4000)
    assert a == b == c
    for fn in (transforms.json_crush, transforms.head_tail, transforms.html_text):
        assert fn(big) == fn(big)


def test_compress_messages_protects_recent_and_structure():
    big = json.dumps(_items(400))
    messages = [
        {"role": "system", "content": big},
        {"role": "user", "content": big},
        {"role": "assistant", "content": [{"type": "text", "text": big}, {"type": "image", "source": "x"}]},
        {"role": "assistant", "content": big, "tool_calls": [{"id": "1"}]},
        {"role": "user", "content": "short"},
        {"role": "assistant", "content": big},
        {"role": "user", "content": big},
        {"role": "assistant", "content": big},
        {"role": "user", "content": "now"},
    ]
    out, before, after = compress_messages(messages, protect_recent=4, min_chars=4000)
    assert out[0] is messages[0] and out[3] is messages[3] and out[4] is messages[4]
    assert out[1]["content"] != big and "Context Saver" not in out[1]["content"]
    assert out[2]["content"][0]["text"] != big and out[2]["content"][1] == {"type": "image", "source": "x"}
    assert out[5:] == messages[5:]
    assert messages[1]["content"] == big  # the input is not modified
    assert 0 < after < before


# ── savings ──


def test_savings_record_summary_reset():
    assert savings.summary()["period"] == {"calls": 0, "before": 0, "after": 0, "saved": 0}
    savings.record("chat", 1000, 100)
    savings.record("code", 500, 400)
    summary = savings.summary(30)
    assert summary["today"] == {"calls": 2, "before": 1500, "after": 500, "saved": 1000}
    assert summary["bySurface"]["chat"]["saved"] == 900
    assert summary["bySurface"]["cowork"]["calls"] == 0
    assert len(summary["byDay"]) == 1
    savings.reset()
    assert savings.summary()["period"]["calls"] == 0


def test_compress_records_savings_once_per_distinct_text():
    big = json.dumps(_items(400))
    for _ in range(3):
        compress_text(big, surface="cowork", retrievable=True, min_chars=4000)
    assert savings.summary()["bySurface"]["cowork"]["calls"] == 1


def test_code_outline_with_the_code_map_extractor():
    pytest.importorskip("cowork.coding.codemap.symbols")
    code = "\n".join(["import os", "from x import y", ""] + [f"def func_{i}(a, b):\n    return a + b + {i}\n" for i in range(60)])
    out = transforms.code_outline(code)
    assert out.startswith("import os") and "def func_59(a, b):" in out
    assert "imports and signatures follow" in out and len(out) < len(code)
