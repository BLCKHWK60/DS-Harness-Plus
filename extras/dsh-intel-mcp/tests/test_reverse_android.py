import random
import struct
import zipfile

from dsh_intel_mcp.reverse import analyzers
from dsh_intel_mcp.reverse.analyzers import AnalyzeContext, android, axml

ANDROID_NS = "http://schemas.android.com/apk/res/android"


def _ctx(tmp_path):
    return AnalyzeContext(work_dir=tmp_path / "work", max_bytes=50 * 1024 * 1024, deadline=1e18)


def _string_pool(strings, utf8):
    pool_header = 28
    offsets, blob = [], b""
    for s in strings:
        offsets.append(len(blob))
        if utf8:
            raw = s.encode("utf-8")
            blob += bytes([len(s)]) + bytes([len(raw)]) + raw + b"\x00"
        else:
            blob += struct.pack("<H", len(s)) + s.encode("utf-16le") + b"\x00\x00"
    blob += b"\x00" * ((-len(blob)) % 4)
    strings_start = pool_header + 4 * len(strings)
    size = strings_start + len(blob)
    head = struct.pack("<HHIIIIII", 0x0001, pool_header, size, len(strings), 0, 0x100 if utf8 else 0, strings_start, 0)
    return head + b"".join(struct.pack("<I", o) for o in offsets) + blob


def _attr(pool, name, value, ns=ANDROID_NS):
    """value: str | bool | int. Returns the 20-byte attribute record."""
    ns_idx = pool.index(ns) if ns else -1
    name_idx = pool.index(name)
    if isinstance(value, bool):
        return struct.pack("<iiIHBBI", ns_idx, name_idx, 0xFFFFFFFF, 8, 0, 0x12, 0xFFFFFFFF if value else 0)
    if isinstance(value, int):
        return struct.pack("<iiIHBBI", ns_idx, name_idx, 0xFFFFFFFF, 8, 0, 0x10, value)
    return struct.pack("<iiIHBBI", ns_idx, name_idx, pool.index(value), 8, 0, 0x03, pool.index(value))


def _element(pool, tag, attrs, end=False):
    tag_idx = pool.index(tag)
    if end:
        body = struct.pack("<iiII", -1, tag_idx, 0, 0)[:8]
        return struct.pack("<HHIII", 0x0103, 16, 16 + 8, 1, 0xFFFFFFFF) + body
    packed = b"".join(attrs)
    body = struct.pack("<iiHHHHHH", -1, tag_idx, 20, 20, len(attrs), 0, 0, 0)
    size = 16 + len(body) + len(packed)
    return struct.pack("<HHIII", 0x0102, 16, size, 1, 0xFFFFFFFF) + body + packed


def build_manifest(utf8=True, obfuscate_names=False):
    pool = [
        ANDROID_NS, "manifest", "package", "versionName", "uses-sdk", "minSdkVersion", "targetSdkVersion",
        "uses-permission", "name", "application", "activity", "exported", "intent-filter", "action", "service",
        "com.example.app", "1.2.3", "android.permission.INTERNET", "com.example.app.MainActivity",
        "android.intent.action.MAIN", "com.example.app.Sync",
    ]
    ev = []
    ev.append(_element(pool, "manifest", [_attr(pool, "package", "com.example.app", ns=None), _attr(pool, "versionName", "1.2.3")]))
    ev.append(_element(pool, "uses-sdk", [_attr(pool, "minSdkVersion", 21), _attr(pool, "targetSdkVersion", 34)]))
    ev.append(_element(pool, "uses-sdk", [], end=True))
    ev.append(_element(pool, "uses-permission", [_attr(pool, "name", "android.permission.INTERNET")]))
    ev.append(_element(pool, "uses-permission", [], end=True))
    ev.append(_element(pool, "application", []))
    ev.append(_element(pool, "activity", [_attr(pool, "name", "com.example.app.MainActivity"), _attr(pool, "exported", True)]))
    ev.append(_element(pool, "intent-filter", []))
    ev.append(_element(pool, "action", [_attr(pool, "name", "android.intent.action.MAIN")]))
    ev.append(_element(pool, "action", [], end=True))
    ev.append(_element(pool, "intent-filter", [], end=True))
    ev.append(_element(pool, "activity", [], end=True))
    ev.append(_element(pool, "service", [_attr(pool, "name", "com.example.app.Sync"), _attr(pool, "exported", False)]))
    ev.append(_element(pool, "service", [], end=True))
    ev.append(_element(pool, "application", [], end=True))
    ev.append(_element(pool, "manifest", [], end=True))
    body = _string_pool(pool, utf8) + b"".join(ev)
    return struct.pack("<HHI", 0x0003, 8, 8 + len(body)) + body


def _uleb(n):
    out = b""
    while True:
        b = n & 0x7F
        n >>= 7
        out += bytes([b | (0x80 if n else 0)])
        if not n:
            return out


def build_dex(classes, methods):
    """classes: ['com.foo.Bar']; methods: [(class_index, 'name')]."""
    strings = []
    for c in classes:
        strings.append("L" + c.replace(".", "/") + ";")
    for _, m in methods:
        strings.append(m)
    strings.append("https://api.example.com/v1")
    header_size = 0x70
    n_str, n_type, n_meth, n_cls = len(strings), len(classes), len(methods), len(classes)
    str_ids_off = header_size
    type_ids_off = str_ids_off + 4 * n_str
    meth_ids_off = type_ids_off + 4 * n_type
    cls_defs_off = meth_ids_off + 8 * n_meth
    data_off = cls_defs_off + 32 * n_cls
    blob, offs = b"", []
    for s in strings:
        offs.append(data_off + len(blob))
        raw = s.encode()
        blob += _uleb(len(s)) + raw + b"\x00"
    tables = b"".join(struct.pack("<I", o) for o in offs)
    tables += b"".join(struct.pack("<I", i) for i in range(n_type))
    for i, (ci, _) in enumerate(methods):
        tables += struct.pack("<HHI", ci, 0, len(classes) + i)
    for i in range(n_cls):
        tables += struct.pack("<I", i) + b"\x00" * 28
    total = header_size + len(tables) + len(blob)
    head = b"dex\n035\x00" + b"\x00" * 24 + struct.pack("<III", total, header_size, 0x12345678)
    head += struct.pack("<II", 0, 0) + struct.pack("<I", 0)  # link_size, link_off, map_off
    head += struct.pack(
        "<12I", n_str, str_ids_off, n_type, type_ids_off, 0, 0, 0, 0, n_meth, meth_ids_off, n_cls, cls_defs_off
    )
    head = head.ljust(header_size, b"\x00")
    return head + tables + blob


def build_apk(path, manifest=None, dex=None, extra=()):
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("AndroidManifest.xml", manifest if manifest is not None else build_manifest())
        if dex is not None:
            zf.writestr("classes.dex", dex)
        zf.writestr("META-INF/CERT.RSA", b"x")
        zf.writestr("META-INF/CERT.SF", b"x")
        zf.writestr("lib/arm64-v8a/libnative.so", b"x")
        for name, data in extra:
            zf.writestr(name, data)


def test_axml_parse_utf8_and_utf16():
    for utf8 in (True, False):
        root = axml.parse(build_manifest(utf8=utf8))
        assert root.tag == "manifest"
        assert root.attrs["package"] == "com.example.app"
        sdk = root.find_all("uses-sdk")[0]
        assert sdk.attrs["minSdkVersion"] == 21 and sdk.attrs["targetSdkVersion"] == 34
        assert root.find_all("activity")[0].attrs["exported"] is True


def test_apk_facts(tmp_path):
    apk = tmp_path / "app.apk"
    build_apk(apk, dex=build_dex(["com.example.app.MainActivity", "com.example.util.Net"], [(0, "onCreate"), (1, "fetch")]))
    analyzer = analyzers.get("android")
    assert analyzer.detect(apk)
    result = analyzer.run(apk, _ctx(tmp_path))
    facts = result.facts
    assert facts["overview"]["package"] == "com.example.app"
    assert facts["overview"]["min_sdk"] == 21 and facts["overview"]["target_sdk"] == 34
    assert facts["permissions"] == ["android.permission.INTERNET"]
    assert facts["activities"][0]["name"] == "com.example.app.MainActivity"
    assert facts["activities"][0]["exported"] is True
    assert facts["activities"][0]["intent_filters"][0]["actions"] == ["android.intent.action.MAIN"]
    assert facts["services"][0]["exported"] is False
    assert "activities:com.example.app.MainActivity" in facts["exported_components"]
    assert facts["classes"] == ["com.example.app.MainActivity", "com.example.util.Net"]
    assert facts["methods_by_class"]["com.example.app.MainActivity"] == ["onCreate"]
    assert facts["urls"] == ["https://api.example.com/v1"]
    assert "META-INF/CERT.RSA" in facts["signing_files"]
    assert any("signing" in lim for lim in result.limitations)


def test_non_apk_zip_not_detected(tmp_path):
    z = tmp_path / "x.zip"
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("a.txt", "a")
    assert not analyzers.get("android").detect(z)


def test_bad_manifest_and_dex_degrade(tmp_path):
    apk = tmp_path / "bad.apk"
    build_apk(apk, manifest=b"\x03\x00garbage", dex=b"dex\n035\x00" + b"\x00" * 10)
    result = analyzers.get("android").run(apk, _ctx(tmp_path))
    assert any("AndroidManifest" in lim for lim in result.limitations)
    assert any("classes.dex" in lim for lim in result.limitations)


def test_fuzz_never_raises(tmp_path):
    rng = random.Random(7)
    manifest, dex = build_manifest(), build_dex(["a.B"], [(0, "m")])
    analyzer = analyzers.get("android")
    for i in range(200):
        f = tmp_path / f"fz{i}.apk"
        if i % 3 == 0:
            f.write_bytes(rng.randbytes(rng.randint(0, 300)))
        else:
            m, d = bytearray(manifest), bytearray(dex)
            for buf in (m, d):
                for _ in range(rng.randint(1, 6)):
                    buf[rng.randrange(len(buf))] = rng.randrange(256)
            build_apk(f, manifest=bytes(m), dex=bytes(d))
        result = analyzer.run(f, _ctx(tmp_path))
        assert isinstance(result.limitations, list)
        try:
            axml.parse(rng.randbytes(rng.randint(0, 200)))
        except axml.AxmlError:
            pass
