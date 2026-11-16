/**
 * The first recipe: ESP32 boards, through Espressif's esptool (installed by the user).
 *
 * Identify: `esptool --port P --chip auto flash_id` (chip, features, MAC, flash size). Read: a backup
 * of the whole flash, read twice and compared (`read_flash 0x0 <size> <file>`). Write: `write_flash
 * <address> <file>`, then `verify_flash` reads it back, then the port is watched for the board's start.
 * The eFuses are never touched (no espefuse at all): they are written once and can never go back.
 * Bench builds every command itself from checked values; a model never writes one.
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { clean } from './usb.js';

/** Speeds esptool may use. */
export const ESPTOOL_BAUDS = [115200, 230400, 460800, 921600];
/**
 * The start of the flash holds the second-stage loader (0x0 or 0x1000 by chip), the partition table
 * (0x8000) and the stored settings, Wi-Fi among them (NVS, from 0x9000): together up to 0x10000.
 * Writing there needs the second yes. The eFuses are never written.
 */
export const PROTECTED_END = 0x10000;
/** The largest flash Bench works with (ESP32 boards have up to 16 MB, some 32). */
export const FLASH_MAX = 32 * 1024 * 1024;

/**
 * Where firmware may come from: the maker or an open project's official release pages (plan, "The
 * way back", condition 3). A file from a forum, a chat or a download site is never flashed.
 */
export const OFFICIAL = [
  { host: /^(?:www\.|dl\.|docs\.)?espressif\.com$/, about: 'Espressif' },
  { host: /^github\.com$/, path: /^\/(?:espressif|esphome|arendst|micropython|meshtastic|Aircoookie|wled|adafruit|arduino|tasmota)\//i, about: 'the project\'s official GitHub releases' },
  { host: /^(?:ota\.tasmota\.com|micropython\.org|install\.wled\.me|firmware\.esphome\.io)$/, about: 'the project\'s own download site' },
];

/** @returns {string} why a firmware's source is not accepted, or ''. */
export function sourceRefusal(source) {
  let url;
  try {
    url = new URL(String(source ?? ''));
  } catch {
    return 'Give the address of the maker\'s or the official project\'s page the firmware came from.';
  }
  if (url.protocol !== 'https:') return 'The firmware\'s source must be an https address.';
  const host = url.hostname.toLowerCase();
  if (OFFICIAL.some((entry) => entry.host.test(host) && (!entry.path || entry.path.test(url.pathname)))) return '';
  return `${host} is not the maker's or an official project's release page Bench knows (${OFFICIAL.map((entry) => entry.about).join(', ')}). Firmware from a forum, a chat or a download site is never flashed.`;
}

/** GitHub's own download hosts, where a release file's address on github.com leads. */
export const DOWNLOAD_HOSTS = /^(?:objects|release-assets|github-releases)\.githubusercontent\.com$/;
/** The largest page Bench reads to find a checksum. */
export const PAGE_MAX = 4 * 1024 * 1024;

/** @returns {string} why one step of the way to the page (the page, or where it leads) is not accepted, or ''. */
function stepRefusal(url, first) {
  if (url.protocol !== 'https:') return 'the page must be reached over https';
  if (!first && DOWNLOAD_HOSTS.test(url.hostname.toLowerCase())) return '';
  return sourceRefusal(url.href);
}

/**
 * Bench reads the maker's or the project's page itself and looks for the file's SHA-256 there: the
 * checksum is never taken from what a model says.
 * @param {string} page - the page with the published checksum (the release page, or its checksum file).
 * @param {string} sum - the firmware file's own SHA-256.
 * @param {{fetchFn?: typeof fetch, timeoutMs?: number}} [options] - the web (a stand-in in tests).
 * @returns {Promise<{ok: boolean, why: string}>} whether the page publishes this checksum.
 */
export async function publishedOn(page, sum, { fetchFn = globalThis.fetch, timeoutMs = 20_000 } = {}) {
  let url;
  try {
    url = new URL(String(page ?? ''));
  } catch {
    return { ok: false, why: 'give the address of the page that publishes the checksum' };
  }
  if (typeof fetchFn !== 'function') return { ok: false, why: 'Bench cannot reach the web here' };
  for (let step = 0; step < 6; step += 1) {
    const refused = stepRefusal(url, step === 0);
    if (refused) return { ok: false, why: `${url.hostname}: ${refused}` };
    let response;
    try {
      response = await fetchFn(url.href, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'DeepSeek-Harness-Bench', accept: 'text/html,text/plain,*/*' } });
    } catch (error) {
      return { ok: false, why: `the page could not be read (${String(error?.message ?? error).slice(0, 120)})` };
    }
    const status = Number(response?.status ?? 0);
    if (status >= 300 && status < 400) {
      const next = response.headers?.get?.('location');
      if (!next) return { ok: false, why: 'the page sent Bench elsewhere without saying where' };
      url = new URL(next, url);
      continue;
    }
    if (status < 200 || status >= 300) return { ok: false, why: `the page answered ${status}` };
    const length = Number(response.headers?.get?.('content-length') ?? 0);
    if (length > PAGE_MAX) return { ok: false, why: 'the page is too large to read' };
    const text = String(await response.text()).slice(0, PAGE_MAX).toLowerCase();
    return text.includes(String(sum).toLowerCase())
      ? { ok: true, why: '' }
      : { ok: false, why: `the page does not show this file's SHA-256 (${sum}), so it is not the published file, or the checksum is on another page of the same project` };
  }
  return { ok: false, why: 'the page sent Bench elsewhere too many times' };
}

/** @returns {{chip: string, features: string, mac: string, flash: string, flashBytes: number | undefined}} what flash_id said. */
export function parseFlashId(text) {
  const value = String(text ?? '');
  const pick = (pattern) => clean((pattern.exec(value) ?? [])[1] ?? '', 120);
  // "Chip is …" (esptool 4) or "Chip type: …" (esptool 5), never "Detecting chip type...".
  const chip = pick(/^Chip is\s+([^\n]+)$/m) || pick(/^Chip type:\s+([^\n]+)$/m);
  const features = pick(/Features:\s*([^\n]+)/i);
  const mac = pick(/\bMAC:\s*([0-9a-f:]{17})/i).toLowerCase();
  const flash = pick(/Detected flash size:\s*([0-9]+\s*[KM]B)/i).replace(/\s+/g, '');
  return { chip, features, mac, flash, flashBytes: sizeBytes(flash) };
}

/** @returns {number | undefined} '4MB' in bytes. */
export function sizeBytes(text) {
  const found = /^(\d+)(KB|MB)$/i.exec(String(text ?? '').trim());
  if (!found) return undefined;
  const bytes = Number(found[1]) * (found[2].toUpperCase() === 'MB' ? 1024 * 1024 : 1024);
  return bytes > 0 && bytes <= FLASH_MAX ? bytes : undefined;
}

/** @returns {number | undefined} an address given as 0x… or a number, aligned to 4 KB. */
export function addressOf(value) {
  const text = String(value ?? '').trim().toLowerCase();
  const number = /^0x[0-9a-f]{1,8}$/.test(text) ? Number.parseInt(text, 16) : /^\d{1,10}$/.test(text) ? Number(text) : NaN;
  return Number.isInteger(number) && number >= 0 && number < FLASH_MAX && number % 0x1000 === 0 ? number : undefined;
}

export const hex = (number) => `0x${number.toString(16)}`;

/** @returns {string} a file's SHA-256. */
export function sha256Of(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * The owner's own protected ranges for a device, from Settings → Bench: "0x9000-0xF000, 0x3E0000-0x400000".
 * @returns {Array<[number, number]>} start (inclusive) and end (exclusive) of each.
 */
export function rangesOf(text) {
  const out = [];
  for (const part of String(text ?? '').split(/[,;\n]/)) {
    const found = /^\s*(0x[0-9a-f]{1,8})\s*-\s*(0x[0-9a-f]{1,8})\s*$/i.exec(part);
    if (!found) continue;
    const start = Number.parseInt(found[1], 16);
    const end = Number.parseInt(found[2], 16);
    if (end > start) out.push([start, end]);
  }
  return out;
}

/** @returns {string} which protected part a write from `address` for `bytes` touches, or ''. */
export function protectedHit(address, bytes, ranges = []) {
  if (address < PROTECTED_END) return `the loader, the partition table and the stored settings (below ${hex(PROTECTED_END)})`;
  const end = address + bytes;
  const hit = ranges.find(([start, stop]) => address < stop && end > start);
  return hit ? `a part you protected on Settings → Bench (${hex(hit[0])}-${hex(hit[1])})` : '';
}

/** What a board printing this after a write says about its start. */
export function bootCheck(lines) {
  const text = lines.join('\n');
  if (/invalid header|flash read err|Guru Meditation|ets_main\.c|Brownout detector was triggered|boot loop/i.test(text)) return { ok: false, why: 'the board printed signs of a failed start (invalid header, flash read error, crash or brownout)' };
  if (lines.length === 0) return { ok: undefined, why: 'the board printed nothing in the time watched (many firmwares print nothing): check it yourself' };
  return { ok: true, why: 'the board started and printed its first lines' };
}

/** The fixed esptool arguments, built from checked values only. */
export const esptoolArgs = {
  info: (port) => ['--port', port, '--chip', 'auto', 'flash_id'],
  read: (port, baud, bytes, file) => ['--port', port, '--chip', 'auto', '--baud', String(baud), 'read_flash', '0x0', hex(bytes), file],
  write: (port, baud, address, file) => ['--port', port, '--chip', 'auto', '--baud', String(baud), 'write_flash', hex(address), file],
  verify: (port, baud, address, file) => ['--port', port, '--chip', 'auto', '--baud', String(baud), 'verify_flash', hex(address), file],
};

/** @returns {number} a firmware file's size, or throws when it is not a plain file. */
export function fileSize(path) {
  const stat = statSync(path);
  if (!stat.isFile()) throw new Error('The firmware is not a plain file.');
  return stat.size;
}
