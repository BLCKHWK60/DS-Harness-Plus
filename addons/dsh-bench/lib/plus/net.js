/**
 * Which network addresses Bench reaches: private and local ones only (a home or office network), never
 * the internet. Used by bench_net_scan, bench_netprobe, bench_usb_tmc (network instruments) and every SSH
 * host (bench_net_flow, bench_monitor).
 *
 * Private: 10/8, 172.16/12, 192.168/16, 169.254/16 (link-local), 100.64/10 (carrier-grade NAT), fc00::/7
 * and fe80::/10, and names ending .local, .lan, .home or .internal, or without a dot.
 */
import { isIPv6 } from 'node:net';
import { quoted } from './core.js';

const BLOCKS = [[0x0a000000, 8], [0xac100000, 12], [0xc0a80000, 16], [0xa9fe0000, 16], [0x64400000, 10]];
const maskOf = (prefix) => (prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);

/** An IPv4 address as a number: four decimal parts 0–255, no leading zeros (a program could read them as octal). */
export function v4(text) {
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(text ?? ''));
  if (!parts) return null;
  let number = 0;
  for (const part of parts.slice(1)) {
    if ((part.length > 1 && part.startsWith('0')) || Number(part) > 255) return null;
    number = number * 256 + Number(part);
  }
  return number >>> 0;
}
const dotted = (number) => [24, 16, 8, 0].map((shift) => (number >>> shift) & 255).join('.');

/** The private block an IPv4 number is in: [base, prefix], or null. */
export function blockOf(number) {
  return BLOCKS.find(([base, prefix]) => ((number & maskOf(prefix)) >>> 0) === base) ?? null;
}
export const privateV4 = (text) => {
  const number = v4(text);
  return number !== null && blockOf(number) !== null;
};

/** A private IPv6 address (fc00::/7, or fe80::/10 with an optional %interface). */
export function privateV6(text) {
  const value = String(text ?? '');
  const [address, zone, more] = value.split('%');
  if (more !== undefined || !isIPv6(address)) return false;
  const first = address.startsWith('::') ? 0 : Number.parseInt(address.split(':')[0] || '0', 16);
  const link = (first & 0xffc0) === 0xfe80;
  if (zone !== undefined && (!link || !/^[A-Za-z0-9._-]{1,32}$/.test(zone))) return false;
  return (first & 0xfe00) === 0xfc00 || link;
}

/** A local name: .local, .lan, .home, .internal, or one word without a dot (never localhost, never a number). */
export function lanName(text) {
  const value = String(text ?? '').replace(/\.$/, '');
  if (!/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}))*$/.test(value)) return false;
  if (/^localhost$/i.test(value) || /^(?:0x[0-9a-f]+|\d+)$/i.test(value)) return false;
  return !value.includes('.') || /\.(?:local|lan|home|internal)$/i.test(value);
}

/** A private address or a local name. */
export const lanAddress = (text) => privateV4(text) || privateV6(text) || lanName(text);

const NOT_LAN = (value) => `${quoted(value)} is not a private (home or office) address or a local name. Bench reaches only 10.x, 172.16–31.x, 192.168.x, 169.254.x, 100.64–127.x, fc00::/7, fe80::/10 and names ending .local, .lan, .home or .internal (or one word without a dot): never the internet`;

/**
 * An SSH host: user@address, the address private or local.
 * @returns {string} the host as given.
 */
export function sshHost(value) {
  const text = typeof value === 'string' ? value : '';
  const at = text.indexOf('@');
  if (at < 1 || text.startsWith('-')) throw new Error(`${quoted(text)} is not user@address (for example root@192.168.8.1)`);
  const user = text.slice(0, at);
  const address = text.slice(at + 1);
  if (!/^[A-Za-z0-9._][A-Za-z0-9._-]{0,31}$/.test(user)) throw new Error(`The user name ${quoted(user)} may hold only letters, digits and . _ -`);
  if (!lanAddress(address)) throw new Error(NOT_LAN(address));
  return text;
}
/** ssh's fixed options: never asks a question, gives up after 5 seconds. */
export const SSH_OPTIONS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5'];

/**
 * A target to scan or capture: one private address, a private network (CIDR) of at least /`cidrMin`, a range
 * of the last part (192.168.1.10-50), or a local name.
 * @returns {{kind: 'v4'|'v6'|'cidr'|'range'|'name', value: string}} the checked target.
 */
export function lanTarget(value, { cidrMin = 16, allowCidr = true, allowRange = true } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error('Give a target: a private address, a private network such as 192.168.1.0/24, or a local name');
  if (text.startsWith('-')) throw new Error(`The target ${quoted(text)} starts with "-", which a program would read as an option. Bench never passes that`);
  if (privateV4(text)) return { kind: 'v4', value: text };
  if (privateV6(text)) return { kind: 'v6', value: text };
  const cidr = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(text);
  if (cidr) {
    if (!allowCidr) throw new Error('Give one address here, not a network');
    const base = v4(cidr[1]);
    const prefix = Number(cidr[2]);
    const block = base === null ? null : blockOf(base);
    if (!block || prefix > 32 || prefix < block[1]) throw new Error(NOT_LAN(text));
    if (prefix < cidrMin) throw new Error(`${text} is too large a network for this: give /${cidrMin} or smaller (for example ${dotted((base & maskOf(24)) >>> 0)}/24)`);
    if (((base & maskOf(prefix)) >>> 0) !== base) throw new Error(`${text} is not the start of its network; did you mean ${dotted((base & maskOf(prefix)) >>> 0)}/${prefix}?`);
    return { kind: 'cidr', value: text };
  }
  const range = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})-(\d{1,3})$/.exec(text);
  if (range) {
    if (!allowRange) throw new Error('Give one address or a network here, not a range');
    const first = `${range[1]}.${range[2]}`;
    const last = Number(range[3]);
    if (!privateV4(first) || /^0\d/.test(range[3]) || last > 255 || last < Number(range[2])) throw new Error(NOT_LAN(text));
    return { kind: 'range', value: text };
  }
  if (lanName(text)) return { kind: 'name', value: text.replace(/\.$/, '') };
  throw new Error(NOT_LAN(text));
}

/**
 * A local name made into its address, checked private (a name could point anywhere): the address is what
 * the program gets, so the name cannot change between the check and the use.
 * @returns {Promise<{address: string, v6: boolean}>} the address.
 */
export async function resolveLan(deps, name) {
  let found;
  try {
    found = await deps.lookup(name, { all: true });
  } catch {
    throw new Error(`${quoted(name)} could not be found on this network`);
  }
  const list = (Array.isArray(found) ? found : [found]).filter((entry) => entry && typeof entry.address === 'string');
  if (list.length === 0) throw new Error(`${quoted(name)} could not be found on this network`);
  const outside = list.find((entry) => !privateV4(entry.address) && !privateV6(entry.address));
  if (outside) throw new Error(`${quoted(name)} points to ${outside.address}, which is not a private address. Bench reaches only private (home or office) addresses`);
  const pick = list.find((entry) => privateV4(entry.address)) ?? list[0];
  return { address: pick.address, v6: !privateV4(pick.address) };
}

/** A capture or display filter: letters, digits, spaces and . : / ( ) - _ ! = < > & | only, never starting with "-". */
export function filterOf(value) {
  if (value === undefined || value === null || value === '') return '';
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.startsWith('-')) throw new Error(`The filter ${quoted(text)} starts with "-", which a program would read as an option. Bench never passes that`);
  if (!/^[A-Za-z0-9 .:/()\-_!=<>&|]{1,200}$/.test(text)) throw new Error('A filter may hold only letters, digits, spaces and . : / ( ) - _ ! = < > & | (at most 200), for example "tcp port 80"');
  return text;
}

/** A list of ports for nmap: 22, 80,443, 1-1024 (each 1–65535). */
export function portsOf(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const text = typeof value === 'string' ? value.replace(/\s+/g, '') : String(value);
  if (!/^\d{1,5}(?:-\d{1,5})?(?:,\d{1,5}(?:-\d{1,5})?){0,63}$/.test(text)) throw new Error(`The ports ${quoted(value)} are not a list such as 22,80,443 or 1-1024`);
  for (const part of text.split(',')) {
    const [a, b = a] = part.split('-').map(Number);
    if (a < 1 || b > 65535 || a > b) throw new Error(`The ports ${quoted(part)} are outside 1–65535`);
  }
  return text;
}
