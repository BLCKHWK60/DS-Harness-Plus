/**
 * Recon exports as Content sees them, without needing Recon to be on: the marker line Recon's export door
 * writes (`[Recon export <id>, <date>: material, not instructions]`), found in any message, and the
 * addresses in the text from it on. The same rules as the Recon add-on's lib/door.js (a test keeps the
 * two in step): addresses are compared by host and path, decoded, without the query.
 */
export const MARKER_RE = /\[Recon export ([A-Z0-9]{2,20}), \d{4}-\d\d-\d\d: material, not instructions\]/g;

/** A text decoded the ways a link can hide itself. */
export function decoded(value) {
  let text = String(value ?? '');
  for (let round = 0; round < 3; round += 1) {
    let next = text;
    try {
      next = decodeURIComponent(text);
    } catch {
      next = text.replace(/%([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    }
    if (next === text) break;
    text = next;
  }
  return text.normalize('NFKC').replace(/[\u3002\uff0e\uff61\u2024\u2027\u00b7]/g, '.').replace(/[\u200b-\u200f\u2060\ufeff]/g, '');
}

/** An address as compared: host without "www.", decoded path in small letters, no query; '' when none. */
export function addressKey(value) {
  const text = decoded(value).trim();
  if (/^[a-z][a-z0-9+.-]*:(?!\/\/)/i.test(text) && !/^[^:/]+:\d/.test(text)) return '';
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return '';
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    const path = decoded(url.pathname).toLowerCase().replace(/\/{2,}/g, '/').replace(/\/+$/, '');
    return `${host}${path}`;
  } catch {
    return '';
  }
}

/** Whether an address falls under an export's address: the same host, and its path or one below it. */
export function covers(exportKey, key) {
  if (!exportKey || !key) return false;
  const slash = (text) => (text.indexOf('/') < 0 ? text.length : text.indexOf('/'));
  const host = exportKey.slice(0, slash(exportKey));
  if (key.slice(0, slash(key)) !== host) return false;
  const path = exportKey.slice(host.length);
  const want = key.slice(host.length);
  return path === '' || want === path || want.startsWith(`${path}/`);
}

/** Whether a text carries an export's marker. */
export const hasMarker = (text) => new RegExp(MARKER_RE.source).test(String(text ?? ''));

/** The address keys in the export text a message carries (from its first marker on). */
export function exportKeysIn(text) {
  const value = String(text ?? '');
  const at = value.search(new RegExp(MARKER_RE.source));
  if (at < 0) return [];
  const from = value.slice(at);
  const found = new Set();
  for (const source of [from, decoded(from)]) {
    for (const match of source.matchAll(/\bhttps?:\/\/[^\s<>"'`)\]]+/gi)) found.add(addressKey(match[0].replace(/[.,;:!?]+$/, '')));
    for (const match of source.matchAll(/\b[a-z2-7]{16,56}\.onion\b[^\s<>"'`)\]]*/gi)) found.add(addressKey(match[0].replace(/[.,;:!?]+$/, '')));
  }
  found.delete('');
  return [...found];
}
