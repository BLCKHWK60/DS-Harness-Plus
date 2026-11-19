/**
 * The network door (plan B6): only networks the owner marked as his on Settings → Bench, by their
 * Wi-Fi name and/or their address range. Before any network action Bench reads which network the
 * Mac is on (fixed commands: route, ifconfig, ipconfig) and goes on only on a marked one. A device is
 * reached at an address the owner typed on the page: a private IPv4 address (inside the marked range
 * when one is given) or a `.local` name. What announces itself is listed with `/usr/bin/dns-sd`, for
 * a few seconds per kind of service. Names that devices announce are material, not instructions.
 */
import { clean } from './usb.js';

export const ROUTE = '/sbin/route';
export const IFCONFIG = '/sbin/ifconfig';
export const IPCONFIG = '/usr/sbin/ipconfig';
export const DNS_SD = '/usr/bin/dns-sd';
export const ARP = '/usr/sbin/arp';
export const DSCACHEUTIL = '/usr/bin/dscacheutil';
/** A hardware (MAC) address, written the same way every time: six two-digit lowercase parts. */
export function macOf(text) {
  const parts = String(text ?? '').trim().toLowerCase().split(':');
  if (parts.length !== 6 || !parts.every((part) => /^[0-9a-f]{1,2}$/.test(part))) return '';
  const mac = parts.map((part) => part.padStart(2, '0')).join(':');
  return mac === '00:00:00:00:00:00' || mac === 'ff:ff:ff:ff:ff:ff' ? '' : mac;
}
/** The kinds of service Bench lists, a few seconds each. */
export const SERVICE_TYPES = ['_ssh._tcp', '_http._tcp', '_https._tcp', '_workstation._tcp', '_device-info._tcp', '_smb._tcp', '_ipp._tcp', '_printer._tcp', '_googlecast._tcp', '_airplay._tcp', '_raop._tcp', '_hap._tcp', '_esphomelib._tcp', '_home-assistant._tcp', '_matter._tcp', '_octoprint._tcp'];
export const BROWSE_SECONDS = 3;

/** @returns {number[] | undefined} the four numbers of an IPv4 address. */
export function ipv4(text) {
  const found = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(text ?? '').trim());
  if (!found) return undefined;
  const parts = found.slice(1).map(Number);
  return parts.every((part) => part >= 0 && part <= 255) ? parts : undefined;
}
const asNumber = (parts) => ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];

/** @returns {string} an address range written as 192.168.8.0/24, checked; throws when it is not one. */
export function cidrOf(text) {
  const [address, bitsText] = String(text ?? '').trim().split('/');
  const parts = ipv4(address);
  const bits = Number(bitsText);
  if (!parts || !Number.isInteger(bits) || bits < 8 || bits > 32) throw new Error('Give the range as an address and a size, such as 192.168.8.0/24.');
  if (!isPrivate(parts)) throw new Error('Only a private range (10.x, 172.16–31.x, 192.168.x) can be marked as yours.');
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const base = (asNumber(parts) & mask) >>> 0;
  return `${[24, 16, 8, 0].map((shift) => (base >>> shift) & 255).join('.')}/${bits}`;
}

/** Whether an address lies in a range. */
export function inCidr(address, cidr) {
  const parts = ipv4(address);
  const [base, bitsText] = String(cidr ?? '').split('/');
  const baseParts = ipv4(base);
  const bits = Number(bitsText);
  if (!parts || !baseParts || !Number.isInteger(bits)) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((asNumber(parts) & mask) >>> 0) === ((asNumber(baseParts) & mask) >>> 0);
}

/** Private and link-local IPv4: the only addresses on a home network. */
export function isPrivate(parts) {
  const [a, b] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

/** A device's address, as the owner types it: a private IPv4 address or a `.local` name. */
export const LOCAL_NAME = /^(?=.{1,120}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}))*\.local$/i;

/**
 * @param {string} address - the device's address from its card.
 * @param {{cidr?: string} | undefined} network - the marked network the Mac is on.
 * @returns {string} why Bench does not go there, or ''.
 */
export function addressRefusal(address, network) {
  const text = String(address ?? '').trim();
  if (!text) return 'This device has no address yet. The user sets it on Settings → Devices.';
  const parts = ipv4(text);
  if (parts) {
    if (!isPrivate(parts)) return `${text} is not an address on a home network. Devices reaches only devices on a network the user marked as theirs.`;
    if (network && !network.cidr) return 'The marked network has no address range: mark it again on Settings → Devices.';
    if (network?.cidr && !inCidr(text, network.cidr)) return `${text} is outside the marked network ${network.cidr}.`;
    return '';
  }
  if (LOCAL_NAME.test(text)) return '';
  return `${text.slice(0, 80)} is not a private address or a .local name. Devices reaches only devices on a network the user marked as theirs.`;
}

/**
 * A `.local` name's IPv4 address, from the Mac's own resolver (a fixed command), so the address is
 * checked against the range and is the one Bench connects to. An IPv4 address is returned as it is.
 * @returns {Promise<string>} the address, or '' when the name does not resolve.
 */
export async function resolveAddress(run, address) {
  const text = String(address ?? '').trim();
  if (ipv4(text)) return text;
  if (!LOCAL_NAME.test(text)) return '';
  const result = await run(DSCACHEUTIL, ['-q', 'host', '-a', 'name', text], { timeoutMs: 10_000 });
  const found = /ip_address:\s*(\d+\.\d+\.\d+\.\d+)/.exec(String(result.stdout ?? ''));
  return found && ipv4(found[1]) ? found[1] : '';
}

/**
 * One network the owner marks on the page, while the Mac is on it: its address range (the one given, or
 * the Mac's own) and the hardware address of its router (the default gateway), which is what counts.
 * The Wi-Fi name is kept as a label only: macOS may hide it from apps, and many networks share a range.
 */
export function markedOf({ label, ssid, cidr }, current) {
  if (!current?.ip || !current?.gatewayMac) throw new Error('Mark a network while the Mac is on it: Devices records its address range and its router\'s hardware address. The Mac\'s network or router could not be read just now.');
  const range = String(cidr ?? '').trim() ? cidrOf(cidr) : current.cidr;
  if (!range) throw new Error('The Mac\'s address range could not be read; give it, such as 192.168.8.0/24.');
  if (!inCidr(current.ip, range)) throw new Error(`The Mac (${current.ip}) is not in ${range}. Mark a network while the Mac is on it.`);
  const wifi = clean(ssid, 64) || current.ssid || '';
  return { label: clean(label, 60) || wifi || range, ssid: wifi, cidr: range, gatewayMac: current.gatewayMac };
}

/** @returns {{iface: string, ip: string, cidr: string, ssid: string, gateway: string, gatewayMac: string}} the network the Mac is on, from fixed commands. */
export async function currentNetwork(run) {
  const route = await run(ROUTE, ['-n', 'get', 'default'], { timeoutMs: 8000 });
  const iface = (/interface:\s*([a-z]+\d+)/.exec(String(route.stdout ?? '')) ?? [])[1] ?? '';
  const gateway = (/gateway:\s*(\d+\.\d+\.\d+\.\d+)/.exec(String(route.stdout ?? '')) ?? [])[1] ?? '';
  if (!iface) return { iface: '', ip: '', cidr: '', ssid: '', gateway: '', gatewayMac: '' };
  let gatewayMac = '';
  if (ipv4(gateway)) {
    const arp = String((await run(ARP, ['-n', gateway], { timeoutMs: 8000 })).stdout ?? '');
    gatewayMac = macOf((/ at ([0-9a-f:]+) /i.exec(arp) ?? [])[1] ?? '');
  }
  const config = String((await run(IFCONFIG, [iface], { timeoutMs: 8000 })).stdout ?? '');
  const found = /inet (\d+\.\d+\.\d+\.\d+) netmask 0x([0-9a-f]{8})/.exec(config);
  let cidr = '';
  const ip = found?.[1] ?? '';
  if (found) {
    const bits = parseInt(found[2], 16).toString(2).replace(/0+$/, '').length;
    try {
      cidr = cidrOf(`${ip}/${bits}`);
    } catch {
      cidr = '';
    }
  }
  const summary = String((await run(IPCONFIG, ['getsummary', iface], { timeoutMs: 8000 })).stdout ?? '');
  const ssid = clean((/^[ \t]*SSID[ \t]*:[ \t]*(\S[^\n]*)$/m.exec(summary) ?? [])[1] ?? '', 64);
  return { iface, ip, cidr, ssid: /redacted/i.test(ssid) ? '' : ssid, gateway, gatewayMac };
}

/**
 * @returns {object | undefined} the marked network the Mac is on: its router has the hardware address
 *   recorded when the owner marked it, and the Mac's address is in its range. A Wi-Fi name alone never
 *   counts (it may be hidden, and a hotel's network can have the same name or range).
 */
export function onMarked(current, marked) {
  return marked.find((entry) => entry.gatewayMac && current.gatewayMac && macOf(entry.gatewayMac) === current.gatewayMac && entry.cidr && current.ip && inCidr(current.ip, entry.cidr));
}

/** @returns {{name: string, type: string}[]} what one `dns-sd -B` printed. */
export function parseBrowse(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const found = /^\S+\s+Add\s+\d+\s+\d+\s+local\.\s+(_[a-z0-9-]+\._(?:tcp|udp))\.\s+(.+)$/i.exec(line.trim());
    if (found) out.push({ type: found[1], name: clean(found[2], 80) });
  }
  return out;
}
