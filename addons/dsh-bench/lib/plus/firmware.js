/**
 * Looking inside a firmware or data file without running anything: size, Shannon entropy (whole and per
 * region: compressed or encrypted parts read near 8 bits per byte), the first bytes, printable strings,
 * and known signatures (ELF, UF2, U-Boot, SquashFS, device trees, archives…).
 */

/** Shannon entropy of bytes, in bits per byte (0 to 8). */
export function entropy(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? []);
  if (bytes.length === 0) return 0;
  const counts = new Array(256).fill(0);
  for (const byte of bytes) counts[byte] += 1;
  let bits = 0;
  for (const count of counts) {
    if (!count) continue;
    const p = count / bytes.length;
    bits -= p * Math.log2(p);
  }
  return Math.round(bits * 1000) / 1000;
}

/** Entropy per region: the file in at most `rows` equal parts (each at least 4 KB). */
export function chunkEntropy(buffer, rows = 32) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? []);
  const size = Math.max(4096, Math.ceil(bytes.length / rows));
  const out = [];
  for (let at = 0; at < bytes.length; at += size) out.push({ offset: at, size: Math.min(size, bytes.length - at), entropy: entropy(bytes.subarray(at, at + size)) });
  return out;
}

/** Printable ASCII runs of at least `min` characters, longest first, each cut to 160. */
export function printableStrings(buffer, min = 6, limit = 40) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('latin1') : String(buffer ?? '');
  const found = text.match(new RegExp(`[\\x20-\\x7e]{${min},}`, 'g')) ?? [];
  return [...new Set(found)].sort((a, b) => b.length - a.length).slice(0, limit).map((run) => run.slice(0, 160));
}

/** A hex dump of the first `count` bytes, 16 to a row. */
export function hexHeader(buffer, count = 64, start = 0) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? []);
  const rows = [];
  for (let at = 0; at < Math.min(count, bytes.length); at += 16) {
    const slice = bytes.subarray(at, Math.min(at + 16, count));
    const hex = [...slice].map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
    const ascii = [...slice].map((byte) => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '.')).join('');
    rows.push(`${(start + at).toString(16).padStart(6, '0')}  ${hex.padEnd(47)}  ${ascii}`);
  }
  return rows.join('\n');
}

/** Signatures looked for at the start and through the file. */
const SIGNATURES = [
  { name: 'ELF executable', bytes: [0x7f, 0x45, 0x4c, 0x46], startOnly: true },
  { name: 'UF2 block (RP2040 and other boards)', bytes: [0x55, 0x46, 0x32, 0x0a], startOnly: true },
  { name: 'ESP32/ESP8266 app image', bytes: [0xe9], startOnly: true, weak: true },
  { name: 'Android boot image', bytes: [...Buffer.from('ANDROID!')], startOnly: true },
  { name: 'TRX firmware header', bytes: [...Buffer.from('HDR0')], startOnly: true },
  { name: 'U-Boot legacy image (uImage)', bytes: [0x27, 0x05, 0x19, 0x56] },
  { name: 'device tree / FIT image', bytes: [0xd0, 0x0d, 0xfe, 0xed] },
  { name: 'SquashFS (little-endian)', bytes: [...Buffer.from('hsqs')] },
  { name: 'SquashFS (big-endian)', bytes: [...Buffer.from('sqsh')] },
  { name: 'UBI image', bytes: [...Buffer.from('UBI#')] },
  { name: 'gzip', bytes: [0x1f, 0x8b, 0x08] },
  { name: 'xz', bytes: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00] },
  { name: 'zstd', bytes: [0x28, 0xb5, 0x2f, 0xfd] },
  { name: 'ZIP archive', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { name: 'cpio archive', bytes: [...Buffer.from('070701')] },
  { name: 'LZMA (common header)', bytes: [0x5d, 0x00, 0x00, 0x80, 0x00] },
  { name: 'JFFS2 node', bytes: [0x85, 0x19, 0x03, 0x20] },
];

/** What the file starts with, and where known structures sit inside it (at most `limit` finds). */
export function signatures(buffer, limit = 30) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? []);
  const start = [];
  const inside = [];
  if (/^:[0-9A-Fa-f]{10}/.test(bytes.subarray(0, 16).toString('latin1'))) start.push('Intel HEX text');
  for (const signature of SIGNATURES) {
    const needle = Buffer.from(signature.bytes);
    if (bytes.subarray(0, needle.length).equals(needle)) start.push(signature.name + (signature.weak ? ' (a guess: one byte)' : ''));
    if (signature.startOnly) continue;
    let at = bytes.indexOf(needle, 1);
    while (at >= 0 && inside.length < limit) {
      inside.push({ offset: at, name: signature.name });
      at = bytes.indexOf(needle, at + 1);
    }
  }
  inside.sort((a, b) => a.offset - b.offset);
  return { start, inside: inside.slice(0, limit) };
}

/** Everything `analyze` shows. */
export function analyzeBuffer(buffer) {
  return {
    size: buffer.length,
    entropy: entropy(buffer),
    chunks: chunkEntropy(buffer),
    header: hexHeader(buffer, 64),
    strings: printableStrings(buffer, 6, 40),
    signatures: signatures(buffer),
  };
}

/** A sentence for an entropy figure. */
export const entropyWord = (bits) => (bits > 7.5 ? 'likely compressed or encrypted' : bits < 4 ? 'likely plain code, text or padding' : 'mixed');
