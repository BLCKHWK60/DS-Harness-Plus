import sys

import pytest

from dsh_intel_mcp.codemap import symbols
from dsh_intel_mcp.codemap.symbols import extract, language_for


def _by_name(defs):
    return {d.name: d for d in defs}


def test_python_functions_classes_and_qualified_methods() -> None:
    text = "class A:\n    def f(self, x):\n        return x\n\n    async def g(self): pass\n\nasync def top(a): pass\n"
    defs = _by_name(extract("m.py", text))
    assert defs["A"].kind == "class" and (defs["A"].line, defs["A"].end_line) == (1, 5)
    assert defs["A.f"].kind == "method" and defs["A.f"].parent == "A" and defs["A.f"].line == 2
    assert defs["A.g"].signature == "async def g(self): pass"
    assert defs["top"].kind == "function" and defs["top"].parent is None


FIXTURES = {
    "m.ts": ("export class Foo extends Bar { run(x: number): void {} }\ninterface Shape { area(): number }\nfunction helper() {}\nconst arrow = (a) => a\n",
             {"Foo": ("class", 1, None), "run": ("method", 1, "Foo"), "Shape": ("interface", 2, None), "helper": ("function", 3, None), "arrow": ("function", 4, None)}),
    "m.tsx": ("export function View() { return <div/> }\n", {"View": ("function", 1, None)}),
    "m.go": ("package x\n\nfunc (s *S) Run() int { return 1 }\ntype Thing struct{}\nfunc Free() {}\n",
             {"Run": ("method", 3, None), "Thing": ("type", 4, None), "Free": ("function", 5, None)}),
    "m.rs": ("struct S;\nimpl Other { fn go(&self) {} }\ntrait T { fn only(); }\nenum E { A }\n",
             {"S": ("struct", 1, None), "go": ("method", 2, "Other"), "T": ("trait", 3, None), "E": ("enum", 4, None)}),
    "M.java": ("public class M {\n  public int f(int x) { return x; }\n}\ninterface I {}\n",
               {"M": ("class", 1, None), "f": ("method", 2, "M"), "I": ("interface", 4, None)}),
    "m.swift": ("struct S {}\nclass C { func f() {} }\nprotocol P {}\n",
                {"S": ("struct", 1, None), "C": ("class", 2, None), "f": ("method", 2, "C"), "P": ("protocol", 3, None)}),
    "m.kt": ("interface I\nclass K { fun f() {} }\nfun top() {}\n",
             {"I": ("interface", 1, None), "K": ("class", 2, None), "f": ("method", 2, "K"), "top": ("function", 3, None)}),
}


@pytest.mark.parametrize("path", sorted(FIXTURES))
def test_tree_sitter_languages(path: str) -> None:
    text, expected = FIXTURES[path]
    defs = _by_name(extract(path, text))
    for name, (kind, line, parent) in expected.items():
        assert name in defs, (path, sorted(defs))
        assert (defs[name].kind, defs[name].line, defs[name].parent) == (kind, line, parent)
        assert defs[name].end_line >= line


def test_signature_is_the_first_line_and_capped() -> None:
    text = "function f(" + "a, " * 200 + ") {\n}\n"
    (d,) = [d for d in extract("m.js", text) if d.name == "f"]
    assert d.signature.startswith("function f(") and len(d.signature) <= 200 and "\n" not in d.signature


def test_grammar_import_failure_falls_back_to_regex(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(sys.modules, "tree_sitter", None)
    symbols.reset_grammar_cache()
    try:
        defs = _by_name(extract("m.go", "package x\nfunc Free() {\n}\ntype Thing struct {\n}\n"))
        assert defs["Free"].kind == "function" and defs["Free"].line == 2
        assert "Thing" in defs
        ts = _by_name(extract("m.ts", "export class A {}\nexport function b() {}\n"))
        assert {"A", "b"} <= set(ts)
    finally:
        monkeypatch.undo()
        symbols.reset_grammar_cache()


def test_garbage_and_unknown_input_never_raise() -> None:
    for path in ("a.py", "a.go", "a.rs", "a.ts", "a.kt", "a.unknown", ""):
        assert isinstance(extract(path, "def ((( \x00\x01{{{ \xff class"), list)
    assert extract("a.py", "") == []
    assert language_for("x.tsx") == "tsx" and language_for("Makefile") is None


def test_python_syntax_error_still_finds_definitions() -> None:
    names = {d.name for d in extract("broken.py", "def good():\n    pass\n\ndef bad(:\n")}
    assert "good" in names
