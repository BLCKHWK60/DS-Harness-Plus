"""Definition extraction for the Code Map: Python through ``ast``, the rest through tree-sitter.

Every grammar import is lazy and every failure degrades to a regex scan, so a
broken wheel or a malformed file costs accuracy, never a crash. ``extract`` never raises.
"""
from __future__ import annotations

import ast
import importlib
import logging
import re
from dataclasses import dataclass
from typing import Any, Final

logger = logging.getLogger(__name__)

SIGNATURE_MAX: Final = 200

# extension -> (language key, grammar module, function exported by the wheel)
_GRAMMARS: Final[dict[str, tuple[str, str]]] = {
    "python": ("tree_sitter_python", "language"),
    "javascript": ("tree_sitter_javascript", "language"),
    "typescript": ("tree_sitter_typescript", "language_typescript"),
    "tsx": ("tree_sitter_typescript", "language_tsx"),
    "go": ("tree_sitter_go", "language"),
    "rust": ("tree_sitter_rust", "language"),
    "java": ("tree_sitter_java", "language"),
    "c": ("tree_sitter_c", "language"),
    "cpp": ("tree_sitter_cpp", "language"),
    "csharp": ("tree_sitter_c_sharp", "language"),
    "ruby": ("tree_sitter_ruby", "language"),
    "php": ("tree_sitter_php", "language_php"),
    "bash": ("tree_sitter_bash", "language"),
    "swift": ("tree_sitter_swift", "language"),
    "kotlin": ("tree_sitter_kotlin", "language"),
}

_EXTENSIONS: Final[dict[str, str]] = {
    ".py": "python", ".pyi": "python",
    ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".ts": "typescript", ".mts": "typescript", ".cts": "typescript", ".tsx": "tsx",
    ".go": "go", ".rs": "rust", ".java": "java",
    ".c": "c", ".h": "c",
    ".cc": "cpp", ".cpp": "cpp", ".cxx": "cpp", ".hpp": "cpp", ".hh": "cpp", ".hxx": "cpp",
    ".cs": "csharp", ".rb": "ruby", ".php": "php",
    ".sh": "bash", ".bash": "bash", ".swift": "swift", ".kt": "kotlin", ".kts": "kotlin",
}


@dataclass(frozen=True)
class Definition:
    name: str
    kind: str
    line: int
    end_line: int
    signature: str
    parent: str | None = None
    file: str = ""


def language_for(path: str) -> str | None:
    """Language key for ``path`` by extension, or None when the Code Map does not parse it."""
    dot = path.rfind(".")
    return _EXTENSIONS.get(path[dot:].lower()) if dot != -1 else None


# ── grammars ─────────────────────────────────────────────────────────────

_PARSERS: dict[str, Any] = {}


def reset_grammar_cache() -> None:
    _PARSERS.clear()


def _parser(lang: str) -> Any | None:
    if lang in _PARSERS:
        return _PARSERS[lang]
    parser = None
    spec = _GRAMMARS.get(lang)
    if spec is not None:
        try:
            tree_sitter = importlib.import_module("tree_sitter")
            module = importlib.import_module(spec[0])
            parser = tree_sitter.Parser(tree_sitter.Language(getattr(module, spec[1])()))
        except Exception as exc:  # noqa: BLE001 - a broken wheel degrades to the regex fallback
            logger.info("code map: no %s grammar (%s)", lang, exc)
    _PARSERS[lang] = parser
    return parser


# ── entry point ──────────────────────────────────────────────────────────


def extract(path: str, text: str) -> list[Definition]:
    """Definitions in ``text`` (file ``path``), ordered by line. Never raises."""
    try:
        lang = language_for(path)
        if lang is None or not text:
            return []
        found: list[Definition] | None = None
        if lang == "python":
            found = _python_ast(text)
        if found is None:
            found = _tree_sitter(lang, text)
        if found is None:
            found = _regex(lang, text)
        found.sort(key=lambda d: (d.line, d.end_line))
        return found
    except Exception as exc:  # noqa: BLE001 - extraction must never break an index refresh
        logger.info("code map: extract failed for %s: %s", path, exc)
        return []


def _first_line(text: str) -> str:
    return text.strip().split("\n", 1)[0].strip()[:SIGNATURE_MAX]


# ── Python (ast) ─────────────────────────────────────────────────────────


def _python_ast(text: str) -> list[Definition] | None:
    try:
        tree = ast.parse(text)
    except (SyntaxError, ValueError, RecursionError, MemoryError):
        return None
    lines = text.split("\n")
    out: list[Definition] = []

    def visit(body: list[ast.stmt], parent: str | None, parent_is_class: bool) -> None:
        for node in body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                is_class = isinstance(node, ast.ClassDef)
                qualified = f"{parent}.{node.name}" if parent and parent_is_class else node.name
                kind = "class" if is_class else ("method" if parent_is_class else "function")
                line = node.lineno
                signature = _first_line(lines[line - 1]) if 0 < line <= len(lines) else node.name
                out.append(Definition(qualified, kind, line, node.end_lineno or line, signature, parent))
                visit(node.body, qualified, is_class)
            else:
                for attr in ("body", "orelse", "finalbody"):
                    inner = getattr(node, attr, None)
                    if isinstance(inner, list) and inner and isinstance(inner[0], ast.stmt):
                        visit(inner, parent, parent_is_class)
                for handler in getattr(node, "handlers", []) or []:
                    visit(handler.body, parent, parent_is_class)

    visit(tree.body, None, False)
    return out


# ── tree-sitter ──────────────────────────────────────────────────────────

_KEYWORDS: Final = (
    "function", "method", "class", "interface", "struct", "enum", "trait", "impl", "type_alias",
    "type_definition", "type_spec", "type_item", "module", "protocol", "object", "constructor",
    "record", "namespace", "mod_item", "union",
)
_NOT_DEFINITIONS: Final = (
    "_type", "_body", "_expression", "_call", "_parameter", "_parameters", "_reference", "_clause",
    "_list", "_literal", "_arguments", "_modifier", "_name", "_identifier", "_heritage", "_declarator",
    "_annotation", "_pattern", "_variant", "_entry", "_constant",
)
_NAME_CHILDREN: Final = frozenset(
    {"identifier", "type_identifier", "simple_identifier", "property_identifier", "constant", "name"}
)
_DECLARATOR_LEAVES: Final = frozenset(
    {"identifier", "field_identifier", "qualified_identifier", "destructor_name", "operator_name", "type_identifier"}
)
_CLASS_LIKE: Final = frozenset({"class", "interface", "struct", "enum", "trait", "impl", "protocol", "module"})
_ARROW_VALUES: Final = frozenset({"arrow_function", "function_expression", "function", "generator_function"})


def _kind_of(node_type: str, parent_kind: str | None) -> str:
    t = node_type
    if "method" in t or "constructor" in t:
        return "method"
    if "function" in t:
        return "method" if parent_kind in _CLASS_LIKE else "function"
    if "class" in t or "record" in t or "object" in t:
        return "class"
    for key in ("interface", "struct", "union", "enum", "trait", "impl", "protocol"):
        if key in t:
            return "struct" if key == "union" else key
    if t.startswith("type") or "type_alias" in t:
        return "type"
    return "module"


def _name_of(node: Any, src: bytes) -> str | None:
    name = node.child_by_field_name("name")
    if name is None and node.type == "impl_item":
        name = node.child_by_field_name("type")
    if name is None and node.type.startswith(("function_definition", "function_declaration")):
        name = node.child_by_field_name("declarator")
        hops = 0
        while name is not None and name.type not in _DECLARATOR_LEAVES and hops < 8:
            name = name.child_by_field_name("declarator") or name.child_by_field_name("name")
            hops += 1
        if name is not None and name.type not in _DECLARATOR_LEAVES:
            name = None
    if name is None and any(k in node.type for k in ("declaration", "definition", "item", "spec")):
        for child in node.children:
            if child.type in _NAME_CHILDREN:
                name = child
                break
    if name is None:
        return None
    text = src[name.start_byte:name.end_byte].decode("utf-8", "replace").strip()
    return text if text and len(text) <= 200 and "\n" not in text else None


def _classify(node: Any, src: bytes, parent_kind: str | None) -> tuple[str, str, Any] | None:
    """(name, kind, signature node) when ``node`` is a definition."""
    t = node.type
    if t == "variable_declarator":
        value = node.child_by_field_name("value")
        name = node.child_by_field_name("name")
        if value is not None and name is not None and value.type in _ARROW_VALUES and name.type == "identifier":
            text = src[name.start_byte:name.end_byte].decode("utf-8", "replace")
            return text, "function", node.parent or node
        return None
    if not any(k in t for k in _KEYWORDS) or t.endswith(_NOT_DEFINITIONS):
        return None
    if t.endswith("_specifier") and node.child_by_field_name("body") is None:
        return None
    name = _name_of(node, src)
    if not name:
        return None
    kind = _kind_of(t, parent_kind)
    if t == "class_declaration":  # Swift/Kotlin keep struct, enum and interface under one node type
        for child in node.children:
            if child.type in {"struct", "enum", "interface", "protocol", "actor"}:
                kind = "class" if child.type == "actor" else child.type
                break
            if child.type in {"class", "{", "class_body", "enum_class_body"}:
                break
    return name, kind, node


def _tree_sitter(lang: str, text: str) -> list[Definition] | None:
    parser = _parser(lang)
    if parser is None:
        return None
    src = text.encode("utf-8", "replace")
    tree = parser.parse(src)
    out: list[Definition] = []
    stack: list[tuple[Any, str | None, str | None]] = [(tree.root_node, None, None)]
    while stack:
        node, parent, parent_kind = stack.pop()
        hit = _classify(node, src, parent_kind)
        child_parent, child_kind = parent, parent_kind
        if hit is not None:
            name, kind, sig_node = hit
            start = node.start_point[0] + 1
            end = node.end_point[0] + (0 if node.end_point[1] == 0 and node.end_point[0] > node.start_point[0] else 1)
            signature = _first_line(src[sig_node.start_byte:sig_node.end_byte].decode("utf-8", "replace"))
            out.append(Definition(name, kind, start, max(start, end), signature, parent))
            child_parent, child_kind = name, kind
        for child in reversed(node.children):
            stack.append((child, child_parent, child_kind))
    return out


# ── regex fallback ───────────────────────────────────────────────────────

_REGEX_FAMILIES: Final[dict[str, list[tuple[str, str]]]] = {
    "python": [
        (r"^(\s*)(?:async\s+)?def\s+(\w+)", "function"),
        (r"^(\s*)class\s+(\w+)", "class"),
    ],
    "js": [
        (r"^(\s*)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)", "function"),
        (r"^(\s*)(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)", "class"),
        (r"^(\s*)(?:export\s+)?interface\s+(\w+)", "interface"),
        (r"^(\s*)(?:export\s+)?type\s+(\w+)\s*(?:<[^=]*>)?\s*=", "type"),
        (r"^(\s*)(?:export\s+)?(?:const\s+)?enum\s+(\w+)", "enum"),
        (r"^(\s*)(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|\w+\s*=>)", "function"),
    ],
    "go": [
        (r"^()func\s+(?:\([^)]*\)\s*)?(\w+)", "function"),
        (r"^()type\s+(\w+)\s+(?:struct|interface)\b", "type"),
        (r"^()type\s+(\w+)\s", "type"),
    ],
    "rust": [
        (r"^(\s*)(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:const\s+)?fn\s+(\w+)", "function"),
        (r"^(\s*)(?:pub(?:\([^)]*\))?\s+)?struct\s+(\w+)", "struct"),
        (r"^(\s*)(?:pub(?:\([^)]*\))?\s+)?enum\s+(\w+)", "enum"),
        (r"^(\s*)(?:pub(?:\([^)]*\))?\s+)?trait\s+(\w+)", "trait"),
        (r"^(\s*)impl(?:<[^>]*>)?\s+(?:[\w:<>]+\s+for\s+)?(\w+)", "impl"),
        (r"^(\s*)(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)", "module"),
        (r"^(\s*)(?:pub(?:\([^)]*\))?\s+)?type\s+(\w+)", "type"),
    ],
    "ruby": [
        (r"^(\s*)def\s+(?:self\.)?(\w+[?!=]?)", "function"),
        (r"^(\s*)class\s+(\w+)", "class"),
        (r"^(\s*)module\s+(\w+)", "module"),
    ],
    "bash": [
        (r"^()(?:function\s+)?(\w+)\s*\(\)\s*\{?", "function"),
        (r"^()function\s+(\w+)", "function"),
    ],
    "c": [  # also covers java, kotlin, swift, c#, php, c++
        (r"^(\s*)(?:(?:public|private|protected|internal|static|final|abstract|sealed|open|data|partial|export)\s+)*(?:class|interface|struct|enum|trait|protocol|object|record|namespace)\s+(\w+)", "class"),
        (r"^(\s*)(?:(?:public|private|protected|internal|static|final|override|open|async|public)\s+)*(?:fun|func|function)\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?(\w+)", "function"),
        (r"^(\s*)(?:(?:public|private|protected|internal|static|final|abstract|synchronized|override|virtual|async)\s+)+[\w<>\[\],.?*& ]+?\s+(\w+)\s*\([^;]*$", "method"),
        (r"^()[A-Za-z_][\w \t*&:<>,]*?[ \t*&](\w+)\s*\([^;{]*\)\s*(?:const\s*)?\{?\s*$", "function"),
    ],
}
_FAMILY_OF: Final[dict[str, str]] = {
    "python": "python", "javascript": "js", "typescript": "js", "tsx": "js", "go": "go", "rust": "rust",
    "ruby": "ruby", "bash": "bash",
}
_NOT_NAMES: Final = frozenset({"if", "for", "while", "switch", "catch", "return", "else", "sizeof", "elif"})
_INDENT_FAMILIES: Final = frozenset({"python", "ruby"})


def _regex(lang: str, text: str) -> list[Definition]:
    family = _FAMILY_OF.get(lang, "c")
    compiled = [(re.compile(pattern), kind) for pattern, kind in _REGEX_FAMILIES[family]]
    lines = text.split("\n")
    raw: list[tuple[int, int, str, str]] = []  # line index, indent, name, kind
    for index, line in enumerate(lines):
        if len(line) > 400 or not line.strip():
            continue
        for pattern, kind in compiled:
            match = pattern.match(line)
            if match and match.group(2 if match.re.groups >= 2 else 1) not in _NOT_NAMES:
                name = match.group(2 if match.re.groups >= 2 else 1)
                indent = len(match.group(1)) if match.re.groups >= 2 else 0
                raw.append((index, indent, name, kind))
                break
    out: list[Definition] = []
    for pos, (index, indent, name, kind) in enumerate(raw):
        end = len(lines)
        for later_index, later_indent, _n, _k in raw[pos + 1:]:
            if later_indent <= indent:
                end = later_index
                break
        else:
            end = len(lines)
        if family not in _INDENT_FAMILIES and pos + 1 < len(raw):
            end = min(end, raw[pos + 1][0])
        while end > index + 1 and not lines[end - 1].strip():
            end -= 1
        out.append(Definition(name, kind, index + 1, max(index + 1, end), _first_line(lines[index])))
    return out
