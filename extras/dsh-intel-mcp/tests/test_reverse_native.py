import random
import shutil
import struct
import subprocess
import plistlib
from pathlib import Path

import pytest

from dsh_intel_mcp.reverse import analyzers
from dsh_intel_mcp.reverse.analyzers import AnalyzeContext, native

pytest.importorskip("lief")
pytest.importorskip("capstone")

C_SOURCE = """
#include <stdio.h>
static int helper(int x) { return x * 3 + 1; }
int main(int argc, char **argv) {
    printf("hello-re-literal %d\\n", helper(argc));
    puts("second");
    return 0;
}
"""


def _ctx(tmp_path, max_bytes=50 * 1024 * 1024):
    return AnalyzeContext(work_dir=tmp_path / "work", max_bytes=max_bytes, deadline=1e18)


@pytest.fixture(scope="module")
def binary(tmp_path_factory):
    cc = shutil.which("cc") or shutil.which("gcc") or shutil.which("clang")
    if not cc:
        pytest.skip("no C compiler available")
    d = tmp_path_factory.mktemp("native")
    src = d / "t.c"
    src.write_text(C_SOURCE)
    out = d / "t"
    proc = subprocess.run([cc, "-O0", "-o", str(out), str(src)], capture_output=True, text=True)
    if proc.returncode != 0:
        pytest.skip(f"compiler failed: {proc.stderr[:200]}")
    return out


def test_registered_and_detected(binary, tmp_path):
    assert analyzers.get("native") is not None
    assert native._detect(binary)
    text = tmp_path / "x.txt"
    text.write_text("hello")
    assert not native._detect(text)


def test_facts(binary, tmp_path):
    result = analyzers.get("native").run(binary, _ctx(tmp_path))
    facts = result.facts
    assert facts["overview"]["format"] in ("macho", "elf")
    assert any(s.lstrip("_") == "main" for s in facts["exports"] + facts["symbols"] + facts.get("entry_symbols", []))
    libs = " ".join(facts["linked_libraries"])
    assert "libSystem" in libs or "libc" in libs
    assert "pie" in facts["hardening"] and "nx" in facts["hardening"]
    assert facts["counts"]["sections"] == len(facts["sections"])


def test_disassemble_main_ends_at_return(binary):
    text = native.disassemble(binary, "main")
    lines = text.splitlines()
    assert "instructions" in lines[0]
    assert len(lines) > 3
    last = lines[-1].split(":", 1)[1].split()[0].lower()
    assert last.startswith("ret")


def test_disassemble_by_address_and_errors(binary):
    first = native.disassemble(binary, "main").splitlines()[1]
    addr = first.split(":")[0]
    assert native.disassemble(binary, address=addr).splitlines()[1] == first
    assert "not found" in native.disassemble(binary, "no_such_symbol_xyz")
    assert "invalid address" in native.disassemble(binary, address="zzz")


def test_xrefs_lists_callees_and_callers(binary):
    out = native.xrefs(binary, "main")
    assert "callees:" in out and "direct calls only" in out
    assert "helper" in out
    assert "printf" in out or "puts" in out
    helper_out = native.xrefs(binary, "helper")
    assert "main" in helper_out.split("callers:")[1].split("callees:")[0]


def test_strings_finds_literal(binary):
    out = native.strings(binary, grep="hello-re-literal")
    assert "hello-re-literal" in out
    assert "no-such-string-xyz" not in native.strings(binary, grep="second")
    assert "0 matching" in native.strings(binary, grep="absent-zzz")


def _superblob(entitlements: dict, hardened: bool = True) -> bytes:
    xml = plistlib.dumps(entitlements)
    ent = struct.pack(">II", native.CSIGN_ENTITLEMENTS_MAGIC, 8 + len(xml)) + xml
    ident = b"com.example.app\x00"
    flags = native.CSIGN_RUNTIME_FLAG if hardened else 0
    cd = struct.pack(
        ">9I4B3I", native.CSIGN_CODEDIRECTORY_MAGIC, 52 + len(ident), 0x20200, flags, 0, 52, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    )
    cd += ident
    header_len = 12 + 16
    blob = struct.pack(">III", native.CSIGN_SUPERBLOB_MAGIC, header_len + len(cd) + len(ent), 2)
    blob += struct.pack(">II", 0, header_len) + struct.pack(">II", 5, header_len + len(cd))
    return blob + cd + ent


def test_entitlements_blob_parser():
    blob = _superblob({"com.apple.security.app-sandbox": True, "keychain-access-groups": ["A.b"]})
    assert native.parse_entitlements(blob) == {
        "com.apple.security.app-sandbox": True,
        "keychain-access-groups": ["A.b"],
    }
    sig = native.parse_code_signature(blob)
    assert sig["code_directory"]["hardened_runtime"] is True
    assert sig["code_directory"]["identifier"] == "com.example.app"
    assert native.parse_entitlements(b"") is None
    assert native.parse_entitlements(b"\x00" * 64) is None


def test_fuzz_never_raises(tmp_path):
    rng = random.Random(1234)
    analyzer = analyzers.get("native")
    prefixes = [b"", b"\xcf\xfa\xed\xfe", b"\x7fELF", b"MZ", b"\xca\xfe\xba\xbe\x00\x00\x00\x02"]
    for i in range(200):
        f = tmp_path / f"fuzz{i}.bin"
        f.write_bytes(prefixes[i % len(prefixes)] + rng.randbytes(rng.randint(0, 600)))
        result = analyzer.run(f, _ctx(tmp_path))
        assert isinstance(result.limitations, list)
        assert isinstance(native.disassemble(f, "main"), str)
        assert isinstance(native.xrefs(f, "main"), str)
        assert isinstance(native.strings(f), str)


def test_size_cap_is_a_limitation(binary, tmp_path):
    result = analyzers.get("native").run(binary, _ctx(tmp_path, max_bytes=10))
    assert result.limitations
