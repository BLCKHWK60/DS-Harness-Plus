import json
import re

import pytest

from dsh_intel_mcp.reverse.evidence import EvidenceStore


@pytest.fixture
def store(tmp_path):
    return EvidenceStore(tmp_path / "reverse" / "evidence.sqlite")


def test_put_get_roundtrip_and_id_format(store):
    ev = store.put("t", "app_bundle", "sum", {"a": [1, 2], "b": ["x"]}, ["limit"])
    assert re.fullmatch(r"ev_[0-9a-f]{12}", ev)
    rec = store.get(ev)
    assert rec["analyzer"] == "app_bundle" and rec["facts"]["a"] == [1, 2] and rec["limitations"] == ["limit"]
    assert store.get("ev_000000000000") is None
    assert store.get("../etc") is None


def test_page_without_facet_lists_facets(store):
    ev = store.put("t", "x", "summary", {"alpha": [1, 2, 3], "beta": []}, ["careful"])
    text = store.page(ev, None, 1)
    assert "alpha (3 items)" in text and "Limitation: careful" in text


def test_large_facet_is_paged(store):
    ev = store.put("t", "x", "s", {"rows": [f"row-{i:05d}" for i in range(2000)]}, [])
    first = store.page(ev, "rows", 1, page_chars=1000)
    assert "page 1 of" in first and "next: page=2" in first
    last_page = int(re.search(r"page 1 of (\d+)", first).group(1))
    last = store.page(ev, "rows", last_page, 1000)
    assert "next:" not in last
    assert "row-01999" in store.page(ev, "rows", last_page - 1, 1000)
    assert "No facet" in store.page(ev, "nope", 1)


def test_secret_keyed_values_are_scrubbed(store):
    ev = store.put("t", "x", "s", {"cfg": [{"api_token": "hunter2-value", "name": "ok", "password": "string"}]}, [])
    dumped = json.dumps(store.get(ev)["facts"])
    assert "hunter2-value" not in dumped and "ok" in dumped
    assert '"password": "string"' in dumped
