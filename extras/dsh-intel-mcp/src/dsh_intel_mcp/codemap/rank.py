"""Personalised PageRank over the file reference graph (pure Python)."""
from __future__ import annotations

import re
from typing import Final, Iterable

from .index import CodeIndex

DAMPING: Final = 0.85
ITERATIONS: Final = 30
MAX_DEFINING_FILES: Final = 20
MIN_NAME_LENGTH: Final = 4
TEST_EDGE_FACTOR: Final = 0.25
_TEST_PATH: Final = re.compile(r"(^|/)(tests?|__tests__|spec|specs)/|(^|/)test_[^/]*$|_test\.[a-z]+$|\.(test|spec)\.[a-z]+$")


def is_test_path(path: str) -> bool:
    return bool(_TEST_PATH.search(path))


def rank_files(
    index: CodeIndex,
    focus_files: Iterable[str] = (),
    focus_symbols: Iterable[str] = (),
) -> list[tuple[str, float]]:
    """(path, score) for every indexed file, best first; ties break by path."""
    focus_key = (tuple(focus_files), tuple(focus_symbols))
    cached = index.rank_cache.get(focus_key)
    if cached is not None and cached[0] == index.generation:
        return list(cached[1])
    result = _compute(index, focus_files, focus_symbols)
    index.rank_cache = {k: v for k, v in index.rank_cache.items() if v[0] == index.generation}
    index.rank_cache[focus_key] = (index.generation, result)
    return list(result)


def _compute(index: CodeIndex, focus_files: Iterable[str], focus_symbols: Iterable[str]) -> list[tuple[str, float]]:
    focus_files, focus_symbols = tuple(focus_files), tuple(focus_symbols)
    paths = [f.path for f in index.files()]
    if not paths:
        return []
    known = set(paths)
    defined_in = index.defining_files()
    weights: dict[tuple[str, str], float] = {}
    edges = index.reference_edges()
    referencing: dict[str, int] = {}
    for _source, name, _count in edges:
        referencing[name] = referencing.get(name, 0) + 1
    common = max(25, len(paths) // 20)  # a name used all over the repo says nothing about any one file
    for source, name, count in edges:
        if referencing[name] > common:
            continue
        targets = defined_in.get(name)
        if not targets or len(targets) > MAX_DEFINING_FILES or len(name) < MIN_NAME_LENGTH:
            continue
        share = count / len(targets) * (TEST_EDGE_FACTOR if is_test_path(source) else 1.0)
        for target in targets:
            if target != source and target in known and source in known:
                key = (source, target)
                weights[key] = weights.get(key, 0.0) + share
    out_edges: dict[str, list[tuple[str, float]]] = {}
    for (source, target), weight in weights.items():
        out_edges.setdefault(source, []).append((target, weight))

    personal = {p: (0.2 if is_test_path(p) else 1.0) for p in paths}
    boosted = {f for f in focus_files if f in known}
    symbols = {s for s in focus_symbols if s}
    for name in symbols:
        for file in defined_in.get(name, ()):
            boosted.add(file)
    if boosted:
        # Focus files, files defining a focus symbol and their direct neighbours carry the walk.
        personal = {p: 0.01 for p in paths}
        for file in boosted:
            personal[file] = 20.0
        for (source, target), weight in weights.items():
            if source in boosted:
                personal[target] = max(personal[target], 3.0)
            if target in boosted:
                personal[source] = max(personal[source], 3.0)
    total = sum(personal.values())
    personal = {p: v / total for p, v in personal.items()}

    normalised = {
        source: [(target, weight / sum(w for _t, w in links)) for target, weight in links]
        for source, links in out_edges.items()
    }
    score = dict(personal)
    for _ in range(ITERATIONS):
        nxt = {p: (1 - DAMPING) * personal[p] for p in paths}
        dangling = 0.0
        for path in paths:
            links = normalised.get(path)
            if not links:
                dangling += score[path]
                continue
            share = DAMPING * score[path]
            for target, weight in links:
                nxt[target] += share * weight
        if dangling:
            for path in paths:
                nxt[path] += DAMPING * dangling * personal[path]
        score = nxt
    return sorted(score.items(), key=lambda item: (-item[1], item[0]))
