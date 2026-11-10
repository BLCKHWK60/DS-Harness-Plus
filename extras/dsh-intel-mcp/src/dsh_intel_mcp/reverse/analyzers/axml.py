"""Binary Android XML (AXML) chunk parser: string pool (UTF-8/UTF-16), resource map,
namespaces, start/end elements and typed attribute values. Pure stdlib; every read
is bounds-checked and malformed input raises AxmlError."""

from __future__ import annotations

import struct
from dataclasses import dataclass, field

RES_STRING_POOL = 0x0001
RES_XML = 0x0003
RES_XML_START_NAMESPACE = 0x0100
RES_XML_END_NAMESPACE = 0x0101
RES_XML_START_ELEMENT = 0x0102
RES_XML_END_ELEMENT = 0x0103
RES_XML_CDATA = 0x0104
RES_XML_RESOURCE_MAP = 0x0180

TYPE_REFERENCE = 0x01
TYPE_FLOAT = 0x04
TYPE_STRING = 0x03
TYPE_INT_DEC = 0x10
TYPE_INT_HEX = 0x11
TYPE_INT_BOOLEAN = 0x12

UTF8_FLAG = 1 << 8

# Attribute names recovered from the resource map when the string pool omits them
# (common in obfuscated manifests).
ANDROID_ATTR_IDS = {
    0x01010000: "theme",
    0x01010001: "label",
    0x01010002: "icon",
    0x01010003: "name",
    0x01010006: "permission",
    0x01010009: "protectionLevel",
    0x0101000E: "enabled",
    0x0101000F: "debuggable",
    0x01010010: "exported",
    0x01010018: "authorities",
    0x0101001D: "launchMode",
    0x01010024: "value",
    0x01010025: "resource",
    0x01010026: "mimeType",
    0x01010027: "scheme",
    0x01010028: "host",
    0x01010029: "port",
    0x0101002A: "path",
    0x0101002B: "pathPrefix",
    0x0101002C: "pathPattern",
    0x0101020C: "minSdkVersion",
    0x0101021B: "versionCode",
    0x0101021C: "versionName",
    0x01010270: "targetSdkVersion",
    0x01010271: "maxSdkVersion",
    0x01010280: "allowBackup",
    0x010104EC: "usesCleartextTraffic",
}


class AxmlError(ValueError):
    pass


@dataclass
class Element:
    tag: str
    attrs: dict[str, object] = field(default_factory=dict)
    children: list["Element"] = field(default_factory=list)

    def iter(self):
        yield self
        for child in self.children:
            yield from child.iter()

    def find_all(self, tag: str) -> list["Element"]:
        return [e for e in self.iter() if e.tag == tag]


def _u16(data: bytes, off: int) -> int:
    if off < 0 or off + 2 > len(data):
        raise AxmlError("truncated data")
    return struct.unpack_from("<H", data, off)[0]


def _u32(data: bytes, off: int) -> int:
    if off < 0 or off + 4 > len(data):
        raise AxmlError("truncated data")
    return struct.unpack_from("<I", data, off)[0]


def _parse_string_pool(data: bytes, start: int, size: int, header_size: int) -> list[str]:
    string_count = _u32(data, start + 8)
    flags = _u32(data, start + 16)
    strings_start = _u32(data, start + 20)
    if string_count > 1_000_000:
        raise AxmlError("implausible string count")
    offsets_at = start + header_size
    if offsets_at + string_count * 4 > start + size:
        raise AxmlError("string offsets overrun the chunk")
    utf8 = bool(flags & UTF8_FLAG)
    out: list[str] = []
    end = start + size
    for i in range(string_count):
        off = start + strings_start + _u32(data, offsets_at + i * 4)
        if off >= end:
            out.append("")
            continue
        if utf8:
            n = data[off]
            off += 1
            if n & 0x80:
                n = ((n & 0x7F) << 8) | data[off]
                off += 1
            blen = data[off] if off < end else 0
            off += 1
            if blen & 0x80:
                blen = ((blen & 0x7F) << 8) | data[off]
                off += 1
            out.append(data[off : min(off + blen, end)].decode("utf-8", "replace"))
        else:
            n = _u16(data, off)
            off += 2
            if n & 0x8000:
                n = ((n & 0x7FFF) << 16) | _u16(data, off)
                off += 2
            out.append(data[off : min(off + n * 2, end)].decode("utf-16le", "replace"))
    return out


def _value(raw_idx: int, vtype: int, vdata: int, pool: list[str]):
    if vtype == TYPE_STRING:
        return pool[raw_idx] if 0 <= raw_idx < len(pool) else ""
    if raw_idx != 0xFFFFFFFF and vtype == 0 and 0 <= raw_idx < len(pool):
        return pool[raw_idx]
    if vtype == TYPE_INT_BOOLEAN:
        return vdata != 0
    if vtype == TYPE_INT_DEC:
        return vdata - (1 << 32) if vdata & 0x80000000 else vdata
    if vtype == TYPE_INT_HEX:
        return f"0x{vdata:x}"
    if vtype == TYPE_REFERENCE:
        return f"@0x{vdata:08x}"
    if vtype == TYPE_FLOAT:
        return struct.unpack("<f", struct.pack("<I", vdata))[0]
    return vdata


def parse(data: bytes, *, max_elements: int = 50_000) -> Element:
    """Parse a binary XML document into an Element tree (root element returned)."""
    if len(data) < 8 or _u16(data, 0) != RES_XML:
        raise AxmlError("not a binary XML document")
    doc_size = min(_u32(data, 4), len(data))
    pos = _u16(data, 2)
    pool: list[str] = []
    res_ids: list[int] = []
    root: Element | None = None
    stack: list[Element] = []
    count = 0
    while pos + 8 <= doc_size:
        ctype = _u16(data, pos)
        header_size = _u16(data, pos + 2)
        size = _u32(data, pos + 4)
        if size < 8 or header_size < 8 or pos + size > doc_size:
            raise AxmlError("bad chunk bounds")
        if ctype == RES_STRING_POOL:
            pool = _parse_string_pool(data, pos, size, header_size)
        elif ctype == RES_XML_RESOURCE_MAP:
            res_ids = [_u32(data, pos + header_size + i * 4) for i in range((size - header_size) // 4)]
        elif ctype == RES_XML_START_ELEMENT:
            count += 1
            if count > max_elements:
                raise AxmlError("too many elements")
            body = pos + 16  # skip header + lineNumber + comment
            name_idx = struct.unpack_from("<i", data, body + 4)[0]
            attr_start = _u16(data, body + 8)
            attr_size = _u16(data, body + 10)
            attr_count = _u16(data, body + 12)
            tag = pool[name_idx] if 0 <= name_idx < len(pool) else f"?{name_idx}"
            element = Element(tag)
            attr_at = body + attr_start
            if attr_size < 20:
                raise AxmlError("bad attribute size")
            for i in range(min(attr_count, 2000)):
                a = attr_at + i * attr_size
                _ns, a_name, raw_value = struct.unpack_from("<iiI", data, a)
                vtype = data[a + 15] if a + 15 < len(data) else 0
                vdata = _u32(data, a + 16)
                name = pool[a_name] if 0 <= a_name < len(pool) else ""
                if not name and 0 <= a_name < len(res_ids):
                    name = ANDROID_ATTR_IDS.get(res_ids[a_name], f"attr_0x{res_ids[a_name]:08x}")
                element.attrs[name or f"?{a_name}"] = _value(raw_value, vtype, vdata, pool)
            if stack:
                stack[-1].children.append(element)
            elif root is None:
                root = element
            stack.append(element)
        elif ctype == RES_XML_END_ELEMENT:
            if stack:
                stack.pop()
        pos += size
    if root is None:
        raise AxmlError("document has no root element")
    return root
