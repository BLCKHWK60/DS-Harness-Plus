"""Native-binary analyzer: Mach-O (incl. fat), ELF and PE via lief, with capstone
disassembly and direct-call cross references. Never executes the target; lief and
capstone are imported lazily so a missing wheel degrades to a limitation."""

from __future__ import annotations

import bisect
import logging
import plistlib
import re
import struct
import time
import warnings
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from dsh_intel_mcp.reverse.analyzers import (
    AnalyzeContext,
    Analyzer,
    AnalyzerResult,
    register,
)

logger = logging.getLogger(__name__)

SYMBOL_CAP = 2000
IMPORT_CAP = 2000
EXPORT_CAP = 2000
NAME_CAP = 500
SECTION_CAP = 200
LIBRARY_CAP = 300
XREF_SCAN_CAP = 32 * 1024 * 1024
STRING_SECTION_CAP = 64 * 1024 * 1024

_MACHO_MAGICS = {
    b"\xfe\xed\xfa\xce",
    b"\xfe\xed\xfa\xcf",
    b"\xce\xfa\xed\xfe",
    b"\xcf\xfa\xed\xfe",
}
_FAT_MAGICS = {b"\xca\xfe\xba\xbe", b"\xca\xfe\xba\xbf"}

CSIGN_SUPERBLOB_MAGIC = 0xFADE0CC0
CSIGN_CODEDIRECTORY_MAGIC = 0xFADE0C02
CSIGN_ENTITLEMENTS_MAGIC = 0xFADE7171
CSIGN_RUNTIME_FLAG = 0x10000


def expired(ctx: AnalyzeContext | None) -> bool:
    """True once ctx.deadline has passed (accepts wall-clock or monotonic deadlines)."""
    deadline = getattr(ctx, "deadline", None)
    if not deadline:
        return False
    now = time.time() if deadline > 1e9 else time.monotonic()
    return now >= deadline


# ---------------------------------------------------------------------------
# detection
# ---------------------------------------------------------------------------


def sniff(path: Path) -> str | None:
    """Return 'macho' | 'fat' | 'elf' | 'pe' from file magic, else None."""
    try:
        if not path.is_file():
            return None
        with path.open("rb") as fh:
            head = fh.read(4096)
            size = path.stat().st_size
            if head[:4] == b"\x7fELF":
                return "elf"
            if head[:4] in _MACHO_MAGICS:
                return "macho"
            if head[:4] in _FAT_MAGICS and len(head) >= 8:
                # Java class files share 0xCAFEBABE; their "count" is the class version (>= 45).
                if 0 < struct.unpack(">I", head[4:8])[0] < 20:
                    return "fat"
                return None
            if head[:2] == b"MZ" and len(head) >= 64:
                (lfanew,) = struct.unpack("<I", head[60:64])
                if 0 < lfanew < size - 4:
                    fh.seek(lfanew)
                    if fh.read(4) == b"PE\x00\x00":
                        return "pe"
    except OSError:
        return None
    return None


def _detect(path: Path) -> bool:
    return sniff(path) is not None


# ---------------------------------------------------------------------------
# code signature / entitlements (pure parsing, no lief)
# ---------------------------------------------------------------------------


def parse_code_signature(blob: bytes) -> dict[str, Any]:
    """Parse a Mach-O code-signature SuperBlob: entitlements, CodeDirectory facts."""
    out: dict[str, Any] = {"entitlements": None}
    if len(blob) < 12:
        return out
    magic, _length, count = struct.unpack(">III", blob[:12])
    if magic != CSIGN_SUPERBLOB_MAGIC or count > 256:
        return out
    for i in range(count):
        pos = 12 + i * 8
        if pos + 8 > len(blob):
            break
        _slot, offset = struct.unpack(">II", blob[pos : pos + 8])
        if offset + 8 > len(blob):
            continue
        sub_magic, sub_len = struct.unpack(">II", blob[offset : offset + 8])
        sub = blob[offset : offset + sub_len]
        if sub_magic == CSIGN_ENTITLEMENTS_MAGIC:
            try:
                parsed = plistlib.loads(sub[8:])
            except Exception:  # noqa: BLE001 - malformed plist is data, not an error
                parsed = None
            if isinstance(parsed, dict):
                out["entitlements"] = parsed
        elif sub_magic == CSIGN_CODEDIRECTORY_MAGIC and len(sub) >= 44:
            _m, _l, version, flags, _hash_off, ident_off = struct.unpack(">IIIIII", sub[:24])
            cd: dict[str, Any] = {
                "version": hex(version),
                "flags": hex(flags),
                "hardened_runtime": bool(flags & CSIGN_RUNTIME_FLAG),
            }
            if 0 < ident_off < len(sub):
                end = sub.find(b"\x00", ident_off)
                cd["identifier"] = sub[ident_off : end if end > 0 else len(sub)].decode("utf-8", "replace")
            if version >= 0x20200 and len(sub) >= 52:
                (team_off,) = struct.unpack(">I", sub[48:52])
                if 0 < team_off < len(sub):
                    end = sub.find(b"\x00", team_off)
                    cd["team_id"] = sub[team_off : end if end > 0 else len(sub)].decode("utf-8", "replace")
            out["code_directory"] = cd
    return out


def parse_entitlements(blob: bytes) -> dict | None:
    """Return the entitlements dict from a code-signature SuperBlob, or None."""
    return parse_code_signature(blob).get("entitlements")


# ---------------------------------------------------------------------------
# lief loading and a small format-neutral view
# ---------------------------------------------------------------------------


def _lief():
    import lief  # lazy: optional wheel

    try:
        lief.logging.disable()
    except Exception:  # noqa: BLE001
        pass
    return lief


def _pick_slice(fat) -> Any | None:
    best = None
    for i in range(len(fat)):
        sl = fat.at(i)
        name = str(sl.header.cpu_type)
        if "ARM64" in name:
            return sl
        if best is None or "X86_64" in name:
            best = sl
    return best


def _load(path: Path) -> tuple[Any, list[str]]:
    """Parse with lief; returns (binary, architectures). Raises on failure."""
    lief = _lief()
    kind = sniff(path)
    if kind == "fat":
        fat = lief.MachO.parse(str(path))
        if fat is None or len(fat) == 0:
            raise ValueError("lief could not parse the universal binary")
        archs = [str(fat.at(i).header.cpu_type).split(".")[-1].lower() for i in range(len(fat))]
        binary = _pick_slice(fat)
        return binary, archs
    binary = lief.parse(str(path))
    if binary is None:
        raise ValueError("lief could not parse the file")
    return binary, [_arch_name(binary)]


def _short(value: Any) -> str:
    return str(value).split(".")[-1]


def _arch_name(binary: Any) -> str:
    try:
        return _short(binary.abstract.header.architecture).lower()
    except Exception:  # noqa: BLE001
        return "unknown"


def _fmt(binary: Any) -> str:
    return _short(binary.format).lower()


@dataclass
class _Section:
    name: str
    segment: str
    va: int
    size: int
    flags: list[str]
    executable: bool
    _raw: Any = field(repr=False, default=None)

    @property
    def display(self) -> str:
        return f"{self.segment},{self.name}" if self.segment else self.name

    def data(self) -> bytes:
        try:
            return bytes(self._raw.content)
        except Exception:  # noqa: BLE001
            return b""


def _flag_names(obj: Any) -> list[str]:
    for attr in ("flags_list", "characteristics_lists"):
        try:
            value = getattr(obj, attr)
        except Exception:  # noqa: BLE001
            continue
        try:
            return [_short(f) for f in value]
        except Exception:  # noqa: BLE001
            continue
    return []


def _sections(binary: Any) -> list[_Section]:
    out: list[_Section] = []
    fmt = _fmt(binary)
    base = 0
    if fmt == "pe":
        try:
            base = int(binary.imagebase)
        except Exception:  # noqa: BLE001
            base = 0
    for sec in binary.sections:
        try:
            flags = _flag_names(sec)
            seg = ""
            if fmt == "macho":
                seg = getattr(sec, "segment_name", "") or ""
                executable = any(f in ("PURE_INSTRUCTIONS", "SOME_INSTRUCTIONS") for f in flags)
            elif fmt == "elf":
                executable = "EXECINSTR" in flags
            else:
                executable = "MEM_EXECUTE" in flags or "CNT_CODE" in flags
            va = int(sec.virtual_address) + base
            size = int(getattr(sec, "size", 0) or 0)
            out.append(_Section(sec.name, seg, va, size, flags, executable, sec))
        except Exception:  # noqa: BLE001
            continue
    return out


def _strip_us(name: str) -> str:
    return name[1:] if name.startswith("_") else name


@dataclass
class _Symbols:
    by_addr: dict[int, str]
    funcs: list[tuple[int, str]]  # sorted by address
    demangled: dict[str, str]
    names: dict[str, int]

    def __post_init__(self) -> None:
        self._addrs = [a for a, _ in self.funcs]

    def label(self, address: int, *, slack: int = 0x4000) -> str | None:
        exact = self.by_addr.get(address)
        if exact:
            return exact
        i = bisect.bisect_right(self._addrs, address) - 1
        if i >= 0:
            base, name = self.funcs[i]
            if 0 < address - base < slack:
                return f"{name}+{address - base:#x}"
        return None

    def next_after(self, address: int) -> int | None:
        i = bisect.bisect_right(self._addrs, address)
        return self._addrs[i] if i < len(self._addrs) else None


def _demangled(sym: Any) -> str:
    try:
        d = sym.demangled_name
        return d if isinstance(d, str) and d else ""
    except Exception:  # noqa: BLE001
        return ""


def _symbols(binary: Any, sections: list[_Section]) -> _Symbols:
    fmt = _fmt(binary)
    base = 0
    if fmt == "pe":
        try:
            base = int(binary.imagebase)
        except Exception:  # noqa: BLE001
            base = 0
    by_addr: dict[int, str] = {}
    demangled: dict[str, str] = {}
    names: dict[str, int] = {}

    def add(name: str, addr: int, dm: str = "") -> None:
        if not name or addr <= 0:
            return
        by_addr.setdefault(addr, name)
        names.setdefault(name, addr)
        if dm and dm != name:
            demangled.setdefault(name, dm)

    try:
        for sym in binary.symbols:
            try:
                value = int(sym.value)
                if fmt == "elf":
                    if not getattr(sym, "is_function", False):
                        continue
                    value &= ~1
                elif fmt == "pe":
                    value += base
                add(sym.name, value, _demangled(sym))
            except Exception:  # noqa: BLE001
                continue
    except Exception:  # noqa: BLE001
        pass
    try:
        for fn in binary.exported_functions:
            addr = int(fn.address)
            if fmt == "pe" and addr < base:
                addr += base
            add(fn.name, addr)
    except Exception:  # noqa: BLE001
        pass
    if fmt == "macho":
        for addr, stub_name in _macho_stub_names(binary, sections).items():
            by_addr.setdefault(addr, stub_name)
            names.setdefault(stub_name, addr)
    funcs = sorted(by_addr.items())
    return _Symbols(by_addr, funcs, demangled, names)


def _macho_stub_names(binary: Any, sections: list[_Section]) -> dict[int, str]:
    """Name __stubs entries by decoding adrp/ldr/br (arm64) or jmp [rip+x] (x86_64)."""
    stubs = [s for s in sections if s.name == "__stubs"]
    if not stubs:
        return {}
    try:
        got = {int(b.address): b.symbol.name for b in binary.bindings if b.symbol}
    except Exception:  # noqa: BLE001
        return {}
    arch = _arch_name(binary)
    out: dict[int, str] = {}
    try:
        cs_mod = _capstone()
    except ImportError:
        return {}
    arch_mode = _cs_arch(cs_mod, arch)
    if arch_mode is None:
        return {}
    md = cs_mod.Cs(*arch_mode)
    for sec in stubs:
        data = sec.data()
        insns = list(md.disasm(data, sec.va))
        if arch == "arm64":
            for i in range(0, len(insns) - 2, 3):
                a, b = insns[i], insns[i + 1]
                m = re.match(r"x\d+, #(0x[0-9a-f]+)", a.op_str)
                if a.mnemonic != "adrp" or not m or b.mnemonic != "ldr":
                    continue
                off = re.search(r"#(0x[0-9a-f]+|\d+)\]", b.op_str)
                slot = int(m.group(1), 16) + (int(off.group(1), 0) if off else 0)
                if slot in got:
                    out[a.address] = got[slot]
        else:
            for ins in insns:
                m = re.search(r"\[rip \+ (0x[0-9a-f]+)\]", ins.op_str)
                if ins.mnemonic == "jmp" and m:
                    slot = ins.address + ins.size + int(m.group(1), 16)
                    if slot in got:
                        out[ins.address] = got[slot]
    return out


def _capstone():
    import capstone  # lazy: optional wheel

    return capstone


def _cs_arch(cs: Any, arch: str) -> tuple[int, int] | None:
    return {
        "arm64": (cs.CS_ARCH_ARM64, cs.CS_MODE_ARM),
        "x64": (cs.CS_ARCH_X86, cs.CS_MODE_64),
        "x86": (cs.CS_ARCH_X86, cs.CS_MODE_32),
        "arm": (cs.CS_ARCH_ARM, cs.CS_MODE_ARM),
    }.get(arch)


# ---------------------------------------------------------------------------
# facts
# ---------------------------------------------------------------------------

_STRING_RE_CACHE: dict[int, tuple[re.Pattern[bytes], re.Pattern[bytes]]] = {}


def _string_patterns(min_len: int) -> tuple[re.Pattern[bytes], re.Pattern[bytes]]:
    if min_len not in _STRING_RE_CACHE:
        ascii_re = re.compile(rb"[\x20-\x7e\t]{%d,}" % min_len)
        utf16_re = re.compile(rb"(?:[\x20-\x7e]\x00){%d,}" % min_len)
        _STRING_RE_CACHE[min_len] = (ascii_re, utf16_re)
    return _STRING_RE_CACHE[min_len]


def _cstrings(data: bytes, limit: int = NAME_CAP) -> list[str]:
    out: list[str] = []
    for chunk in data.split(b"\x00"):
        if chunk:
            out.append(chunk.decode("utf-8", "replace"))
            if len(out) >= limit:
                break
    return out


def _capped(items: list, cap: int) -> list:
    return items[:cap]


def _hardening(binary: Any, fmt: str, sections: list[_Section], sig: dict[str, Any] | None) -> dict[str, Any]:
    out: dict[str, Any] = {}

    def safe(key: str, fn: Callable[[], Any]) -> None:
        try:
            out[key] = fn()
        except Exception:  # noqa: BLE001
            out[key] = None

    safe("pie", lambda: bool(binary.is_pie))
    safe("nx", lambda: bool(binary.has_nx))
    names = set()
    try:
        names = {s.name for s in binary.imported_symbols}
    except Exception:  # noqa: BLE001
        pass
    if fmt == "macho":
        out["stack_canary"] = "___stack_chk_guard" in names or "___stack_chk_fail" in names
        safe("code_signature", lambda: bool(binary.has_code_signature))
        if sig and sig.get("code_directory"):
            out["hardened_runtime"] = sig["code_directory"].get("hardened_runtime")
        else:
            out["hardened_runtime"] = False if out.get("code_signature") is not None else None
        safe("restrict_segment", lambda: any(s.name.upper() == "__RESTRICT" for s in binary.segments))
        safe("encrypted", lambda: bool(getattr(binary.encryption_info, "crypt_id", 0)) if binary.has_encryption_info else False)
    elif fmt == "elf":
        out["stack_canary"] = "__stack_chk_fail" in names
        safe("relro", lambda: any("GNU_RELRO" in str(s.type) for s in binary.segments))
        safe("bind_now", lambda: any("BIND_NOW" in str(e.tag) or "NOW" in str(e.tag) for e in binary.dynamic_entries))
    elif fmt == "pe":
        def dll_chars() -> list[str]:
            return [_short(c) for c in binary.optional_header.dll_characteristics_lists]

        safe("dll_characteristics", dll_chars)
        chars = out.get("dll_characteristics") or []
        out["aslr"] = "DYNAMIC_BASE" in chars
        out["high_entropy_va"] = "HIGH_ENTROPY_VA" in chars
        out["cfg"] = "GUARD_CF" in chars
        safe("authenticode_signed", lambda: bool(binary.has_signatures))
    return out


def _linked_libraries(binary: Any) -> list[str]:
    out: list[str] = []
    try:
        for lib in binary.libraries:
            out.append(lib if isinstance(lib, str) else lib.name)
    except Exception:  # noqa: BLE001
        pass
    return out


def _imports(binary: Any, fmt: str) -> list[str]:
    out: list[str] = []
    try:
        if fmt == "pe":
            for imp in binary.imports:
                for entry in imp.entries:
                    out.append(f"{imp.name}!{entry.name or '#' + str(entry.ordinal)}")
        else:
            for sym in binary.imported_symbols:
                lib = ""
                if fmt == "macho":
                    try:
                        lib = sym.library.name if sym.library else ""
                    except Exception:  # noqa: BLE001
                        lib = ""
                out.append(f"{sym.name} ({lib})" if lib else sym.name)
    except Exception:  # noqa: BLE001
        pass
    return out


def _exports(binary: Any) -> list[str]:
    out: list[str] = []
    try:
        out = [f.name for f in binary.exported_functions if f.name]
    except Exception:  # noqa: BLE001
        pass
    return out


def _objc_and_swift(binary: Any, sections: list[_Section], symbol_names: list[str], limitations: list[str]) -> dict[str, list]:
    classes: list[str] = []
    selectors: list[str] = []
    swift_types: list[str] = []
    have_metadata = False
    try:
        meta = binary.objc_metadata
        if meta is not None:
            for cls in meta.classes:
                have_metadata = True
                methods = [m.name for m in cls.methods][:20]
                classes.append(f"{cls.name}: {', '.join(methods)}" if methods else cls.name)
    except Exception:  # noqa: BLE001
        have_metadata = False
    for sec in sections:
        if sec.name == "__objc_classname" and not have_metadata:
            classes.extend(_cstrings(sec.data()))
        elif sec.name == "__objc_methname":
            selectors.extend(_cstrings(sec.data()))
        elif sec.name.startswith("__swift5_") and sec.name in ("__swift5_typeref", "__swift5_reflstr", "__swift5_capture"):
            swift_types.extend(s for s in _cstrings(sec.data(), NAME_CAP) if len(s) > 2)
    seen = set(classes)
    for name in symbol_names:
        if name.startswith("_OBJC_CLASS_$_"):
            cls = name[len("_OBJC_CLASS_$_") :]
            if cls not in seen:
                classes.append(cls)
                seen.add(cls)
    for name in symbol_names:
        if name.startswith(("_$s", "$s")):
            swift_types.append(name)
    out: dict[str, list] = {}
    if classes or selectors:
        out["objc_classes"] = _capped(classes, NAME_CAP)
        out["objc_selectors"] = _capped(selectors, NAME_CAP)
        if not have_metadata:
            limitations.append(
                "Objective-C: lief metadata parsing unavailable in this build; class names come from "
                "__objc_classname/OBJC_CLASS symbols and selectors from __objc_methname "
                "(class-to-method association not recovered)"
            )
    if swift_types:
        out["swift_types"] = _capped(sorted(set(swift_types)), NAME_CAP)
    return out


def analyze_facts(path: Path, ctx: AnalyzeContext | None = None) -> tuple[dict, list[str], str]:
    """Build (facts, limitations, summary) for a native binary. Raises on parse failure."""
    limitations: list[str] = []
    binary, archs = _load(path)
    fmt = _fmt(binary)
    arch = _arch_name(binary)
    sections = _sections(binary)
    symbols = _symbols(binary, sections)

    overview: dict[str, Any] = {
        "format": fmt,
        "architectures": archs,
        "analyzed_architecture": arch,
        "size_bytes": path.stat().st_size,
    }
    try:
        overview["entry_point"] = hex(int(binary.entrypoint))
    except Exception:  # noqa: BLE001
        overview["entry_point"] = None
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            overview["file_type"] = _short(binary.header.file_type)
    except Exception:  # noqa: BLE001
        pass
    if fmt == "macho":
        try:
            overview["platform"] = _short(binary.platform)
        except Exception:  # noqa: BLE001
            pass
    if len(archs) > 1:
        limitations.append(f"universal binary: only the {arch} slice was analyzed (slices: {', '.join(archs)})")

    sig: dict[str, Any] | None = None
    if fmt == "macho":
        sig = _read_signature(binary, path)

    all_symbols = [n for n, _ in sorted(symbols.names.items(), key=lambda kv: kv[1])]
    try:
        raw_symbols = [s.name for s in binary.symbols if s.name]
    except Exception:  # noqa: BLE001
        raw_symbols = all_symbols
    sym_rows = []
    for name in raw_symbols[:SYMBOL_CAP]:
        dm = symbols.demangled.get(name)
        sym_rows.append(f"{name} -> {dm}" if dm else name)
    imports = _imports(binary, fmt)
    exports = _exports(binary)

    facts: dict[str, Any] = {
        "overview": overview,
        "sections": [
            {"name": s.display, "address": hex(s.va), "size": s.size, "flags": s.flags}
            for s in sections[:SECTION_CAP]
        ],
        "linked_libraries": _linked_libraries(binary)[:LIBRARY_CAP],
        "imports": imports[:IMPORT_CAP],
        "exports": exports[:EXPORT_CAP],
        "symbols": sym_rows,
        "hardening": _hardening(binary, fmt, sections, sig),
        "counts": {
            "sections": len(sections),
            "imports": len(imports),
            "exports": len(exports),
            "symbols": len(raw_symbols),
            "libraries": len(_linked_libraries(binary)),
        },
    }
    if len(sections) > SECTION_CAP or len(imports) > IMPORT_CAP or len(raw_symbols) > SYMBOL_CAP:
        limitations.append(f"lists capped (sections {SECTION_CAP}, imports {IMPORT_CAP}, symbols {SYMBOL_CAP}); see counts")
    if fmt == "macho":
        facts.update(_objc_and_swift(binary, sections, raw_symbols, limitations))
        if sig is not None:
            facts["code_signature"] = sig.get("code_directory") or {}
            if sig.get("entitlements") is not None:
                facts["entitlements"] = sig["entitlements"]
    elif fmt in ("elf", "pe"):
        extra = _objc_and_swift(binary, [], [], limitations)
        facts.update({k: v for k, v in extra.items() if k == "swift_types"})
        if fmt == "elf":
            try:
                facts["interpreter"] = [binary.interpreter] if binary.has_interpreter else []
            except Exception:  # noqa: BLE001
                pass
        limitations.append("call names for imports through PLT/IAT are not resolved in disassembly/xrefs")
    interesting = sorted({n for n in raw_symbols if _strip_us(n) == "main" or n in ("DllMain", "_start", "WinMain")})
    if interesting:
        facts["entry_symbols"] = interesting
    summary = (
        f"{fmt} {arch} binary, {len(sections)} sections, {len(imports)} imports, "
        f"{len(exports)} exports, {len(raw_symbols)} symbols"
    )
    return facts, limitations, summary


def _read_signature(binary: Any, path: Path) -> dict[str, Any] | None:
    try:
        if not binary.has_code_signature:
            return None
        cs = binary.code_signature
        offset, size = int(cs.data_offset), int(cs.data_size)
        if size <= 0 or size > 16 * 1024 * 1024:
            return None
        base = int(getattr(binary, "fat_offset", 0) or 0)
        with path.open("rb") as fh:
            fh.seek(base + offset)
            blob = fh.read(size)
        return parse_code_signature(blob)
    except Exception:  # noqa: BLE001
        return None


def entitlements(path: Path | str) -> dict | None:
    """Entitlements dict embedded in a Mach-O code signature, or None."""
    p = Path(path)
    try:
        binary, _ = _load(p)
        if _fmt(binary) != "macho":
            return None
        sig = _read_signature(binary, p)
    except Exception:  # noqa: BLE001
        return None
    return (sig or {}).get("entitlements")


def _run(path: Path, ctx: AnalyzeContext) -> AnalyzerResult:
    try:
        if path.stat().st_size > ctx.max_bytes:
            return AnalyzerResult(
                f"native binary larger than the {ctx.max_bytes}-byte analysis cap; not parsed",
                {},
                [f"file exceeds max_bytes ({ctx.max_bytes})"],
            )
        facts, limitations, summary = analyze_facts(path, ctx)
    except ImportError as exc:
        return AnalyzerResult("native analysis unavailable", {}, [f"lief is not installed ({exc})"])
    except Exception as exc:  # noqa: BLE001
        return AnalyzerResult(
            "native binary could not be parsed",
            {},
            [f"parse failure: {type(exc).__name__}: {exc}"],
        )
    return AnalyzerResult(summary, facts, limitations)


# ---------------------------------------------------------------------------
# disassembly and cross references
# ---------------------------------------------------------------------------


@dataclass
class _Image:
    binary: Any
    arch: str
    sections: list[_Section]
    symbols: _Symbols

    def section_for(self, address: int) -> _Section | None:
        for sec in self.sections:
            if sec.va <= address < sec.va + max(sec.size, 0):
                return sec
        return None


def _open_image(path: Path) -> _Image:
    binary, _archs = _load(path)
    sections = _sections(binary)
    return _Image(binary, _arch_name(binary), sections, _symbols(binary, sections))


def _parse_address(text: str) -> int:
    return int(text.strip(), 16)  # addresses are hex, with or without 0x


def _resolve(img: _Image, symbol: str | None, address: str | None) -> tuple[str, int]:
    if address:
        try:
            addr = _parse_address(address)
        except ValueError as exc:
            raise ValueError(f"invalid address {address!r}") from exc
        return (img.symbols.label(addr) or f"{addr:#x}"), addr
    if not symbol:
        raise ValueError("provide a symbol or an address")
    names = img.symbols.names
    for cand in (symbol, "_" + symbol, symbol.lstrip("_")):
        if cand in names:
            return cand, names[cand]
    lowered = symbol.lower()
    for raw, dm in img.symbols.demangled.items():
        if dm == symbol and raw in names:
            return raw, names[raw]
    matches = [(n, a) for n, a in names.items() if lowered in n.lower() or lowered in img.symbols.demangled.get(n, "").lower()]
    if len(matches) == 1:
        return matches[0]
    if matches:
        shown = ", ".join(n for n, _ in sorted(matches)[:10])
        raise ValueError(f"symbol {symbol!r} is ambiguous ({len(matches)} matches: {shown})")
    raise ValueError(f"symbol {symbol!r} not found; stripped binaries need an address")


_ARM_RET = {"ret", "retaa", "retab"}
_ARM_COND_BRANCH = re.compile(r"^b\.[a-z]{2}$")


def _branch_target(arch: str, mnemonic: str, op_str: str) -> tuple[str, int] | None:
    """Return ('call'|'jump', target) for direct call/branch instructions."""
    m = mnemonic.lower()
    if arch == "arm64":
        kind = None
        if m == "bl":
            kind = "call"
        elif m == "b" or _ARM_COND_BRANCH.match(m) or m in ("cbz", "cbnz", "tbz", "tbnz"):
            kind = "jump"
        if kind is None:
            return None
        tok = op_str.rsplit(",", 1)[-1].strip().lstrip("#")
        if tok.startswith("0x"):
            try:
                return kind, int(tok, 16)
            except ValueError:
                return None
        return None
    if arch in ("x64", "x86"):
        if m == "call" or m == "jmp" or (m.startswith("j") and len(m) <= 4):
            tok = op_str.strip()
            if tok.startswith("0x") and " " not in tok:
                try:
                    return ("call" if m == "call" else "jump"), int(tok, 16)
                except ValueError:
                    return None
    return None


def _is_return(arch: str, mnemonic: str) -> bool:
    m = mnemonic.lower()
    if arch == "arm64":
        return m in _ARM_RET
    return m in ("ret", "retn", "retf")


def _disasm_function(img: _Image, start: int, max_instructions: int) -> tuple[list[Any], str | None]:
    cs_mod = _capstone()
    arch_mode = _cs_arch(cs_mod, img.arch)
    if arch_mode is None:
        raise ValueError(f"unsupported architecture {img.arch!r} for disassembly")
    sec = img.section_for(start)
    if sec is None:
        raise ValueError(f"address {start:#x} is not inside any section")
    data = sec.data()
    offset = start - sec.va
    if offset < 0 or offset >= len(data):
        raise ValueError(f"address {start:#x} has no file-backed bytes")
    limit_addr = sec.va + len(data)
    nxt = img.symbols.next_after(start)
    if nxt is not None and nxt < limit_addr:
        limit_addr = nxt
    window = data[offset : limit_addr - sec.va]
    md = cs_mod.Cs(*arch_mode)
    md.skipdata = True
    insns: list[Any] = []
    furthest = start
    note = None
    for ins in md.disasm(window, start):
        insns.append(ins)
        tgt = _branch_target(img.arch, ins.mnemonic, ins.op_str)
        if tgt and tgt[0] == "jump" and start <= tgt[1] < limit_addr:
            furthest = max(furthest, tgt[1])
        if _is_return(img.arch, ins.mnemonic) and ins.address + ins.size > furthest:
            note = "return"
            break
        if len(insns) >= max_instructions:
            note = f"max_instructions ({max_instructions}) reached"
            break
    if note is None:
        note = "end of function bounds (next symbol or section end)"
    return insns, note


def disassemble(path: Path | str, symbol: str | None = None, address: str | None = None, max_instructions: int = 200) -> str:
    """Disassemble one function. Returns text; raises ValueError for user errors."""
    p = Path(path)
    max_instructions = max(1, min(int(max_instructions or 200), 5000))
    try:
        img = _open_image(p)
    except ImportError as exc:
        return f"disassembly unavailable: {exc}"
    except ValueError as exc:
        return f"cannot disassemble: {exc}"
    try:
        name, start = _resolve(img, symbol, address)
        insns, stop = _disasm_function(img, start, max_instructions)
    except ImportError as exc:
        return f"disassembly unavailable: {exc}"
    except ValueError as exc:
        return f"cannot disassemble: {exc}"
    lines = [f"{name} @ {start:#x} ({img.arch}): {len(insns)} instructions, stopped: {stop}"]
    for ins in insns:
        text = f"{ins.address:#x}: {ins.mnemonic} {ins.op_str}".rstrip()
        tgt = _branch_target(img.arch, ins.mnemonic, ins.op_str)
        if tgt:
            label = img.symbols.label(tgt[1])
            if label:
                text += f"    ; {label}"
        lines.append(text)
    return "\n".join(lines)


def _scan_direct_branches(img: _Image, target: int) -> list[tuple[int, str]]:
    """Find direct call/branch instructions in executable sections that hit `target`."""
    hits: list[tuple[int, str]] = []
    for sec in img.sections:
        if not sec.executable:
            continue
        data = sec.data()[:XREF_SCAN_CAP]
        if img.arch == "arm64":
            pos = 0
            n = len(data) - 3
            while pos < n:
                (word,) = struct.unpack_from("<I", data, pos)
                top = word & 0xFC000000
                if top in (0x94000000, 0x14000000):
                    imm = word & 0x03FFFFFF
                    if imm & 0x02000000:
                        imm -= 0x04000000
                    pc = sec.va + pos
                    if pc + imm * 4 == target:
                        hits.append((pc, "call (bl)" if top == 0x94000000 else "branch (b)"))
                pos += 4
        elif img.arch in ("x64", "x86"):
            for pos in range(len(data) - 4):
                op = data[pos]
                if op in (0xE8, 0xE9):
                    (rel,) = struct.unpack_from("<i", data, pos + 1)
                    pc = sec.va + pos
                    if pc + 5 + rel == target:
                        hits.append((pc, "call" if op == 0xE8 else "jmp"))
        else:
            cs_mod = _capstone()
            arch_mode = _cs_arch(cs_mod, img.arch)
            if arch_mode is None:
                continue
            md = cs_mod.Cs(*arch_mode)
            for ins in md.disasm(data, sec.va):
                tgt = _branch_target(img.arch, ins.mnemonic, ins.op_str)
                if tgt and tgt[1] == target:
                    hits.append((ins.address, ins.mnemonic))
    return hits


def xrefs(path: Path | str, symbol: str | None = None, address: str | None = None) -> str:
    """Direct callers of a function and the direct calls it makes."""
    p = Path(path)
    try:
        img = _open_image(p)
        name, start = _resolve(img, symbol, address)
        insns, _stop = _disasm_function(img, start, 4000)
        callers = _scan_direct_branches(img, start)
    except ImportError as exc:
        return f"xrefs unavailable: {exc}"
    except ValueError as exc:
        return f"cannot compute xrefs: {exc}"
    callees: list[tuple[int, int, str]] = []
    end = insns[-1].address + insns[-1].size if insns else start
    for ins in insns:
        tgt = _branch_target(img.arch, ins.mnemonic, ins.op_str)
        if tgt and not (start <= tgt[1] < end):
            callees.append((ins.address, tgt[1], tgt[0]))
    lines = [f"{name} @ {start:#x} ({img.arch}): {len(callers)} direct caller site(s), {len(callees)} direct callee site(s)"]
    lines.append("callers:")
    for addr, kind in sorted(callers)[:200]:
        owner = img.symbols.label(addr) or "?"
        lines.append(f"  {addr:#x} {kind} in {owner}")
    if not callers:
        lines.append("  (none found)")
    lines.append("callees:")
    for site, tgt, kind in callees[:200]:
        label = img.symbols.label(tgt) or "?"
        lines.append(f"  {site:#x} {kind} -> {tgt:#x} {label}")
    if not callees:
        lines.append("  (none found)")
    lines.append("limitations: direct calls only; indirect calls and Objective-C message sends are not resolved")
    return "\n".join(lines)


def strings(
    path: Path | str,
    min_len: int = 6,
    grep: str | None = None,
    section: str | None = None,
    max_results: int = 200,
) -> str:
    """ASCII and UTF-16LE strings per section (whole file when the binary cannot be parsed)."""
    p = Path(path)
    min_len = max(3, min(int(min_len or 6), 200))
    max_results = max(1, min(int(max_results or 200), 5000))
    ascii_re, utf16_re = _string_patterns(min_len)
    pattern = None
    if grep:
        try:
            pattern = re.compile(grep, re.IGNORECASE)
        except re.error:
            pattern = re.compile(re.escape(grep), re.IGNORECASE)
    chunks: list[tuple[str, int, bytes]] = []
    note = ""
    try:
        img = _open_image(p)
        for sec in img.sections:
            if section and section.lower() not in sec.display.lower():
                continue
            data = sec.data()[:STRING_SECTION_CAP]
            if data:
                chunks.append((sec.display, sec.va, data))
    except Exception as exc:  # noqa: BLE001
        note = f"note: could not parse as a native binary ({type(exc).__name__}); scanning raw file bytes"
        try:
            chunks.append(("file", 0, p.read_bytes()[:STRING_SECTION_CAP]))
        except OSError as oserr:
            return f"cannot read file: {oserr}"
    results: list[str] = []
    total = 0
    for name, base, data in chunks:
        found: list[tuple[int, str, str]] = []
        for m in ascii_re.finditer(data):
            found.append((m.start(), "ascii", m.group().decode("ascii", "replace")))
        for m in utf16_re.finditer(data):
            found.append((m.start(), "utf16", m.group().decode("utf-16le", "replace")))
        found.sort()
        for off, enc, text in found:
            if pattern and not pattern.search(text):
                continue
            total += 1
            if len(results) < max_results:
                shown = text if len(text) <= 300 else text[:300] + "..."
                results.append(f"{name} {base + off:#x} [{enc}] {shown}")
    head = f"{total} matching string(s); showing {len(results)}"
    if note:
        head += f"\n{note}"
    return head + ("\n" + "\n".join(results) if results else "")


register(
    Analyzer(
        name="native",
        title="Native binary (Mach-O / ELF / PE)",
        detect=_detect,
        run=_run,
    )
)
