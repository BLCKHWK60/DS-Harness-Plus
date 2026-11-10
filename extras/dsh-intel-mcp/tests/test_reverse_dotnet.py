import random
import struct
from pathlib import Path
from types import SimpleNamespace as NS

import pytest

from dsh_intel_mcp.reverse import analyzers
from dsh_intel_mcp.reverse.analyzers import AnalyzeContext, dotnet


def _ctx(tmp_path):
    return AnalyzeContext(work_dir=tmp_path / "work", max_bytes=50 * 1024 * 1024, deadline=1e18)


class _Heap:
    def __init__(self, strings):
        self._items = {}
        offset = 1
        for s in strings:
            raw = s.encode("utf-16le")
            self._items[offset] = (raw, len(raw) + 2)  # length prefix + trailing flag byte
            offset += len(raw) + 2
        self._size = offset

    def sizeof(self):
        return self._size

    def get_with_size(self, offset):
        return self._items[offset]


def _stub_pe():
    method = lambda name: NS(row=NS(Name=name))  # noqa: E731
    tables = NS(
        Assembly=NS(rows=[NS(Name="Demo.App", MajorVersion=1, MinorVersion=2, BuildNumber=3, RevisionNumber=4, Culture="")]),
        AssemblyRef=NS(rows=[NS(Name="System.Runtime", MajorVersion=7, MinorVersion=0, BuildNumber=0, RevisionNumber=0)]),
        ModuleRef=NS(rows=[NS(Name="ole32.dll")]),
        TypeDef=NS(
            rows=[
                NS(TypeNamespace="", TypeName="<Module>", MethodList=[]),
                NS(TypeNamespace="Demo.App", TypeName="Program", MethodList=[method("Main"), method(".ctor")]),
            ]
        ),
        MethodDef=NS(rows=[NS(Name="Main"), NS(Name=".ctor")]),
        ImplMap=NS(rows=[NS(ImportName="CoInitialize", ImportScope=NS(row=NS(Name="ole32.dll")))]),
        ManifestResource=NS(rows=[]),
    )
    net = NS(
        mdtables=tables,
        metadata=NS(struct=NS(Version=b"v4.0.30319\x00\x00")),
        resources=[NS(name="Demo.App.logo.png", data=b"\x89PNG....")],
        user_strings=_Heap(["Hello world", "ab", "https://example.com/api"]),
    )
    return NS(net=net)


def test_build_facts_from_stub():
    facts, limitations = dotnet.build_facts(_stub_pe())
    assert facts["overview"]["assembly_name"] == "Demo.App"
    assert facts["overview"]["assembly_version"] == "1.2.3.4"
    assert facts["overview"]["runtime_version"] == "v4.0.30319"
    assert facts["references"] == ["System.Runtime 7.0.0.0"]
    program = next(t for t in facts["types"] if t["type"] == "Demo.App.Program")
    assert program["methods"] == ["Main", ".ctor"]
    assert facts["pinvoke"] == [{"dll": "ole32.dll", "entry": "CoInitialize"}]
    assert facts["resources"] == [{"name": "Demo.App.logo.png", "size": 8}]
    assert facts["user_strings"] == ["Hello world", "https://example.com/api"]
    assert facts["counts"]["types"] == 2


def _pe_stub(tmp_path, clr_rva):
    """Minimal PE32+ header with data directories; CLR directory set when clr_rva."""
    dos = b"MZ" + b"\x00" * 58 + struct.pack("<I", 64)
    coff = b"PE\x00\x00" + b"\x00" * 20
    opt = struct.pack("<H", 0x20B) + b"\x00" * 106 + struct.pack("<I", 16)
    dirs = bytearray(16 * 8)
    if clr_rva:
        dirs[14 * 8 : 14 * 8 + 8] = struct.pack("<II", clr_rva, 72)
    f = tmp_path / "x.dll"
    f.write_bytes(dos + coff + opt + bytes(dirs))
    return f


def test_detection_requires_cli_header(tmp_path):
    native_pe = _pe_stub(tmp_path, 0)
    assert not analyzers.get("dotnet").detect(native_pe)
    cli = tmp_path / "cli"
    cli.mkdir()
    assert analyzers.get("dotnet").detect(_pe_stub(cli, 0x2000))
    text = tmp_path / "a.txt"
    text.write_text("hi")
    assert not analyzers.get("dotnet").detect(text)


def _find_sample():
    for root in (Path("/usr/local/share/dotnet"), Path.home() / ".nuget"):
        if root.is_dir():
            for p in root.rglob("*.dll"):
                if dotnet.has_cli_header(p) and p.stat().st_size < 20 * 1024 * 1024:
                    return p
    return None


def test_end_to_end_sample_dll(tmp_path):
    pytest.importorskip("dnfile")
    sample = _find_sample()
    if sample is None:
        pytest.skip("no sample .NET DLL found under /usr/local/share/dotnet or ~/.nuget")
    result = analyzers.get("dotnet").run(sample, _ctx(tmp_path))
    assert result.facts["overview"]["assembly_name"]
    assert result.facts["types"]


def test_fuzz_never_raises(tmp_path):
    pytest.importorskip("dnfile")
    rng = random.Random(5)
    analyzer = analyzers.get("dotnet")
    seed = (_pe_stub(tmp_path, 0x2000)).read_bytes()
    for i in range(200):
        f = tmp_path / f"fz{i}.dll"
        if i % 2:
            f.write_bytes(seed + rng.randbytes(rng.randint(0, 300)))
        else:
            f.write_bytes(rng.randbytes(rng.randint(0, 300)))
        result = analyzer.run(f, _ctx(tmp_path))
        assert isinstance(result.limitations, list)
        assert isinstance(analyzer.detect(f), bool)
