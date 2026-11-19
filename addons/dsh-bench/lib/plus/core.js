/**
 * What every lib/plus tool shares: the checks on each value the model sends, the rules for files it
 * names, the masking of secrets in what a device prints, and running a program by its full path with an
 * argument list (never a shell).
 *
 * Rules kept here:
 * - no value from the model reaches a program unchecked, and none may start with "-";
 * - a file the model names is a plain file (not a link), of a capped size, never in the Bench folder's
 *   backups and never in ~/.ssh, ~/.gnupg, ~/Library/Keychains, ~/.aws, /etc, /dev or /private/var/db;
 * - what a device prints is cleaned of control characters, masked and cut before it is shown.
 */
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { shownCommand } from '../run.js';
import { DEFAULT_BENCH, PLUS_PROGRAMS, installOf, runnable } from './programs.js';

/** Speeds a serial port may be set to. */
export const BAUDS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
/** The longest text a tool returns. */
export const TEXT_MAX = 8000;
export const OFF = 'Devices is switched off in Settings → Devices.';
export const NEVER_INSTALLS = 'Devices never installs anything.';
export const MB = 1024 * 1024;

/** An answer that is returned as it is (not as "It did not work: …"): a missing program, a plain refusal. */
export class Answer extends Error {}

/** The sentence for an action that changes a device while "Allow risky writes" is off. */
export const riskyRefusal = (tool, action) => `${tool} ${action} changes the device, so it runs only with "Allow risky writes" switched on (Settings → Devices → Danger zone). Nothing was sent.`;

/** A value as it is quoted back in a refusal: short, one line. */
export const quoted = (value) => JSON.stringify(String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 60));

/** Refuse a value that would read as an option. */
export function noDash(value, what) {
  if (String(value ?? '').startsWith('-')) throw new Error(`The ${what} ${quoted(value)} starts with "-", which a program would read as an option. Devices never passes that`);
  return value;
}

export const PORT_RE = /^\/dev\/(?:cu|tty)\.[A-Za-z0-9._-]{1,80}$/;
/** A serial port: /dev/cu.… or /dev/tty.… */
export function serialPort(value) {
  const text = typeof value === 'string' ? value : '';
  if (!PORT_RE.test(text)) throw new Error(`${quoted(text)} is not a serial port Devices opens: give a /dev/cu.… port (bench_usb lists them)`);
  return text;
}

/** A speed from the fixed list (or the fallback when none is given). */
export function baudOf(value, fallback) {
  const number = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!BAUDS.includes(number)) throw new Error(`The speed ${quoted(value)} is not one Devices uses: ${BAUDS.join(', ')}`);
  return number;
}

/** A network interface's name (en0, bridge100, br-lan). */
export function ifaceOf(value) {
  const text = typeof value === 'string' ? value : '';
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(text) || text.startsWith('-')) throw new Error(`${quoted(text)} is not an interface name (letters, digits, . _ -; for example en0)`);
  return text;
}

/** A hexadecimal address or value: 0x followed by 1 to 8 digits, returned as written in lower case. */
export function hexOf(value, what = 'address', max = 0xffffffff) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^0x[0-9a-fA-F]{1,8}$/.test(text)) throw new Error(`The ${what} ${quoted(value)} is not a hexadecimal number like 0x08000000`);
  if (Number.parseInt(text, 16) > max) throw new Error(`The ${what} ${text} is larger than 0x${max.toString(16)}`);
  return text.toLowerCase();
}

/** A whole number within limits (or the fallback when none is given). */
export function intIn(value, min, max, fallback, what) {
  if (value === undefined || value === null || value === '') {
    if (fallback === undefined) throw new Error(`Give the ${what} (a whole number from ${min} to ${max})`);
    return fallback;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`The ${what} ${quoted(value)} is not a whole number from ${min} to ${max}`);
  return number;
}

/** A device, target, adapter or chip name: letters, digits and _ . + -, never starting with "-". */
export function nameOf(value, what) {
  const text = typeof value === 'string' ? value : '';
  if (!text) throw new Error(`Give the ${what}`);
  noDash(text, what);
  if (!/^[A-Za-z0-9_.+-]{1,64}$/.test(text)) throw new Error(`The ${what} ${quoted(text)} may hold only letters, digits and _ . + - (at most 64)`);
  return text;
}

/** One of a fixed list. */
export function oneOf(value, list, what, fallback) {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) return fallback;
  if (!list.includes(value)) throw new Error(`The ${what} ${quoted(value)} is not one of: ${list.join(', ')}`);
  return value;
}

/**
 * A USB vendor or product number: 0x0403, or four hexadecimal digits as lsusb shows them (0403, 05ac), or a
 * decimal number of another length as the Mac's lists show them (615, 1027 is four digits: write 0x0403).
 */
export function usbId(value, what) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffff) return value;
  const text = typeof value === 'string' ? value.trim() : '';
  if (/^0x[0-9a-fA-F]{1,4}$/.test(text) || /^[0-9a-fA-F]{4}$/.test(text)) return Number.parseInt(text.replace(/^0x/i, ''), 16);
  if (/^\d{1,3}$|^\d{5}$/.test(text) && Number(text) <= 0xffff) return Number(text);
  throw new Error(`The ${what} ${quoted(value)} is not a USB number like 0x0403`);
}
export const hex4 = (number) => `0x${Number(number).toString(16).padStart(4, '0')}`;

const within = (path, folder) => {
  const a = path.toLowerCase();
  const b = folder.replace(/\/+$/, '').toLowerCase();
  return a === b || a.startsWith(`${b}${sep}`);
};
/** A path in its real spelling (the folder's real path, with the name kept). */
function realOf(path) {
  try {
    return join(realpathSync.native(dirname(path)), basename(path));
  } catch {
    return path;
  }
}
const benchOf = (deps) => {
  try {
    const folder = deps?.benchFolder?.();
    return typeof folder === 'string' && isAbsolute(folder) ? resolve(folder) : '';
  } catch {
    return '';
  }
};

/**
 * Check a file the model names (rule 3): its full path, a plain file and not a link, at most `maxBytes`,
 * outside the closed folders and the Bench folder's backups.
 * @param {object} deps - the tools' deps (benchFolder, home).
 * @param {unknown} value - the path.
 * @param {{maxBytes: number, exts?: string[], what?: string, noColon?: boolean, tclSafe?: boolean}} rules - the limits.
 * @returns {{path: string, size: number}} the checked file.
 */
export function checkFile(deps, value, { maxBytes, exts = [], what = 'file', noColon = false, tclSafe = false }) {
  const raw = typeof value === 'string' ? value : '';
  if (!raw) throw new Error(`Give the ${what}'s full path`);
  if (raw.length > 1024 || /[\u0000-\u001f]/.test(raw)) throw new Error(`That ${what} path is not one Devices reads`);
  if (!isAbsolute(raw)) throw new Error(`Give the ${what}'s full path, starting with /, not ${quoted(raw)}`);
  const path = resolve(raw);
  if (noColon && path.includes(':')) throw new Error(`The ${what}'s path holds ":", which the program reads as a separator: rename or move the file`);
  if (tclSafe && !/^[A-Za-z0-9 ._/+@,~=-]+$/.test(path)) throw new Error(`The ${what}'s path may hold only letters, digits, spaces and . _ / + @ , ~ = - here (the program reads the rest as commands): rename or move the file`);
  const home = typeof deps?.home === 'function' ? deps.home() : homedir();
  const closed = [join(home, '.ssh'), join(home, '.gnupg'), join(home, 'Library', 'Keychains'), join(home, '.aws'), '/etc', '/private/etc', '/dev', '/private/dev', '/var/db', '/private/var/db'];
  const bench = benchOf(deps);
  const benches = bench ? [bench, realOf(bench)] : [];
  for (const spelling of [path, realOf(path)]) {
    if (closed.some((folder) => within(spelling, folder))) throw new Error(`Devices does not read files in ${closed.find((folder) => within(spelling, folder))}: it holds keys, passwords or devices. Nothing was read`);
    for (const folder of benches) {
      if (within(spelling, folder) && relative(folder.toLowerCase(), spelling.toLowerCase()).split(sep).includes('backups')) throw new Error('The Devices folder\'s backups can hold Wi-Fi and other keys and are never given to a tool by path. Nothing was read');
    }
  }
  let info;
  try {
    info = lstatSync(path);
  } catch {
    throw new Error(`There is no file at ${path}`);
  }
  if (info.isSymbolicLink()) throw new Error(`${path} is a link: Devices reads only a plain file, never through a link`);
  if (!info.isFile()) throw new Error(`${path} is not a plain file`);
  if (info.size > maxBytes) throw new Error(`${path} is ${Math.ceil(info.size / MB)} MB; Devices takes at most ${Math.round(maxBytes / MB)} MB here`);
  if (exts.length > 0 && !exts.includes(extname(path).toLowerCase())) throw new Error(`${basename(path)} is not a ${exts.join(', ')} file`);
  return { path, size: info.size };
}

/** Read a checked file without following a link, at most `maxBytes`. */
export function readChecked(path, maxBytes) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(fd);
    if (!info.isFile()) throw new Error(`${path} is not a plain file`);
    const size = Math.min(info.size, maxBytes);
    const buffer = Buffer.alloc(size);
    let done = 0;
    while (done < size) {
      const got = readSync(fd, buffer, done, size - done, done);
      if (got <= 0) break;
      done += got;
    }
    return buffer.subarray(0, done);
  } finally {
    closeSync(fd);
  }
}

export const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/**
 * A folder inside the Bench folder, made when missing, never through a link: <Bench folder>/<parts…>.
 * @returns {string} its full path.
 */
export function benchDir(deps, ...parts) {
  const bench = benchOf(deps);
  if (!bench) throw new Error('The Devices folder is not set; switch Devices on in Settings → Devices');
  mkdirSync(bench, { recursive: true, mode: 0o700 });
  let at = bench;
  for (const part of parts) {
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(part) || part === '.' || part === '..') throw new Error('That folder name is not one Devices makes');
    at = join(at, part);
    let info;
    try {
      info = lstatSync(at);
    } catch {
      mkdirSync(at, { mode: 0o700 });
      continue;
    }
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`${at} is not a plain folder; Devices writes only into its own folders, never through a link`);
  }
  return at;
}

/** A name in a folder that is not taken yet: <stem><ext>, else <stem>-2<ext>, -3… (a dump is never overwritten). */
export function freshName(folder, stem, ext = '') {
  for (let n = 1; n < 1000; n += 1) {
    const path = join(folder, `${stem}${n === 1 ? '' : `-${n}`}${ext}`);
    try {
      lstatSync(path);
    } catch {
      return path;
    }
  }
  throw new Error(`Too many files named ${stem} in ${folder}`);
}

/** A short name for a file or device: lower-case letters, digits and dashes. */
export function slugOf(name) {
  const slug = String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return slug || 'file';
}

/** A time for a file's name: 20261117-102030. */
export function stampOf(deps) {
  let ms;
  try {
    ms = Number(deps?.now?.() ?? Date.now());
  } catch {
    ms = Date.now();
  }
  const iso = new Date(Number.isFinite(ms) ? ms : Date.now()).toISOString();
  return `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}`;
}

/**
 * A temporary file Bench writes (a fixed command file for a program), in a new private folder that is
 * removed afterwards.
 */
export async function withTempFile(name, content, work) {
  const folder = mkdtempSync(join(tmpdir(), 'bench-plus-'));
  const file = join(folder, name);
  try {
    writeFileSync(file, content, { mode: 0o600, flag: 'wx' });
    return await work(file);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/** Names of secrets, as a word or part of an identifier (WIFI_PASS, ap_psk, client-secret). */
const SECRET = String.raw`(?:[A-Za-z0-9]{1,40}[_-]){0,3}(?:pass(?:word|wd|phrase)?|pwd|psk|wpa[_-]?(?:key|psk|passphrase)|secret|token|api[_-]?key|auth[_-]?key|access[_-]?key|private[_-]?key)(?:[_-][A-Za-z0-9]{1,40}){0,3}`;
const LABELLED = new RegExp(String.raw`(?<![A-Za-z0-9])(${SECRET})(["']?\s{0,8}[:=]\s{0,8})("[^"\n]{0,2000}"|'[^'\n]{0,2000}'|[^\s,;}\]"']{1,2000})`, 'gi');
const PRIVATE_BLOCK = /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]{0,40}PRIVATE KEY-----|$)/g;

/** The same names written in camelCase (WiFiPassword, adminPass, apiToken); "bypass" is not one. */
const CAMEL = /(?<![A-Za-z0-9])([A-Za-z0-9]{1,40}(?:Pass(?:word|wd|phrase)?|PSK|Psk|Secret|Token|ApiKey|AuthKey|AccessKey|PrivateKey)(?:[A-Z][A-Za-z0-9]{0,40})?)(["']?\s{0,8}[:=]\s{0,8})("[^"\n]{0,2000}"|'[^'\n]{0,2000}'|[^\s,;}\]"']{1,2000})/g;

/** Mask what looks like a secret in text a device or program printed: named passwords, keys, PSKs, tokens, private key blocks. */
export function maskSecrets(text) {
  return String(text ?? '')
    .replace(PRIVATE_BLOCK, '[masked private key]')
    .replace(LABELLED, (_all, key, between) => `${key}${between}[masked]`)
    .replace(CAMEL, (_all, key, between) => `${key}${between}[masked]`);
}

/** Control and direction characters (tab and line end stay). */
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;
/** Text from a device or program, made safe to show: no control or direction characters, \n line ends. */
export function tidy(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n').replace(CONTROL, ' ');
}

/** Cut a text to the size a tool returns. */
export function cap(text, max = TEXT_MAX) {
  const value = String(text ?? '');
  return value.length <= max ? value : `${value.slice(0, max)}\n… (cut: ${value.length - max} more characters)`;
}

/** What every tool's text goes through before it is returned. */
export const finish = (text) => cap(maskSecrets(tidy(text)));

/** The last lines of a program's error output, for an "It did not work" sentence. */
export const tail = (text, lines = 6) => tidy(text).split('\n').map((line) => line.trimEnd()).filter(Boolean).slice(-lines).join(' | ').slice(0, 500);

/** The sentence for a program that is not on this Mac (rule 9). */
export function missingText(id, deps) {
  const bench = benchOf(deps) || DEFAULT_BENCH;
  const program = PLUS_PROGRAMS[id];
  const label = program?.names?.[0] ?? id;
  const install = installOf(id, bench);
  const uses = program?.used ? ` (Devices uses it for ${program.used})` : '';
  if (/ is part of macOS/.test(install)) return `${label} is not on this Mac${uses}: ${install} ${NEVER_INSTALLS}`;
  return `${label} is not on this Mac${uses}. Install it yourself in Terminal: ${install}. ${NEVER_INSTALLS}`;
}

/**
 * Where a program is: first a helper the user built into the Bench folder in use, then deps.find.
 * @returns {Promise<string>} its full path, or ''.
 */
export async function locate(deps, id) {
  const program = PLUS_PROGRAMS[id];
  const bench = benchOf(deps);
  if (program?.bench && bench) {
    const folder = program.bench === 'venv' ? join(bench, 'venv', 'bin') : join(bench, 'bin');
    for (const name of program.names) if (runnable(join(folder, name))) return join(folder, name);
  }
  try {
    const found = await deps.find(id);
    return typeof found === 'string' && isAbsolute(found) ? found : '';
  } catch {
    return '';
  }
}

/** Find a program or answer with how to install it. */
export async function need(deps, id) {
  const file = await locate(deps, id);
  if (!file) throw new Answer(missingText(id, deps));
  return file;
}

/**
 * Run a program by id: found with `locate`, run with deps.run and an argument list.
 * @returns {Promise<{file: string, code: number|null, out: string, err: string, all: string, timedOut: boolean, shown: string}>} how it ended.
 */
export async function runProgram(deps, id, args, { timeoutMs = 60_000, maxBuffer = 8 * MB, input, env } = {}) {
  const file = await need(deps, id);
  for (const arg of args) if (typeof arg !== 'string') throw new Error('An argument was not text');
  const result = await deps.run(file, args, { timeoutMs, maxBuffer, ...(input === undefined ? {} : { input }), ...(env ? { env } : {}) });
  const out = String(result?.stdout ?? '');
  const err = String(result?.stderr ?? '');
  return { file, code: result?.code ?? null, out, err, all: [out, err].filter((part) => part.trim()).join('\n'), timedOut: Boolean(result?.timedOut), shown: shownCommand(file, args) };
}

/** A result that did not end well, as a sentence. */
export function failure(result, what) {
  if (result.timedOut) return `${what} did not finish in time and was stopped${result.all.trim() ? `; it printed: ${tail(result.all)}` : ''}`;
  return `${what} ended with code ${result.code ?? 'none'}${result.all.trim() ? `: ${tail(result.all)}` : ''}`;
}
