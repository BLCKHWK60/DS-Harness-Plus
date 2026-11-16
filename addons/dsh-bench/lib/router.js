/**
 * The router recipe (plan B6): a GL.iNet router such as the Slate 7 (GL-BE3600), whose firmware is
 * built on OpenWrt, reached over SSH with the owner's own account.
 * - Identify and Read: its release, GL.iNet version, model, kernel, uptime, storage layout and settings
 *   (`uci show` of a few packages), with keys and passwords masked.
 * - A checked configuration backup: `sysupgrade -b` into the router's memory, read twice and compared,
 *   kept on this Mac (it holds Wi-Fi and VPN keys: never shown to a model).
 * - Adjust with undo: only the settings on ROUTER_SETTINGS, each with the values it takes; radio limits
 *   (transmit power, country, channel, width) are never changed.
 * - Firmware by the maker's route: `sysupgrade` with a file from GL.iNet's download centre, which writes
 *   the firmware part only. Bench has no command that writes the loader (U-Boot) or the radio
 *   calibration (ART, factory): it never runs mtd or dd. The way back is GL.iNet's U-Boot recovery page.
 * Every command is a fixed string; values are single-quoted.
 */
import { mask } from './cards.js';
import { shq } from './ssh.js';
import { clean } from './usb.js';
import { neverChanged } from './catalogue.js';

export const IDENTIFY = 'cat /etc/openwrt_release 2>/dev/null; echo @@; cat /etc/glversion 2>/dev/null; echo @@; cat /tmp/sysinfo/model 2>/dev/null; cat /tmp/sysinfo/board_name 2>/dev/null; echo @@; uname -srm; echo @@; uptime; echo @@; cat /proc/uptime';
export const STORAGE = 'cat /proc/mtd 2>/dev/null; echo @@; df -h / /overlay /tmp 2>/dev/null';
export const SETTINGS = 'uci show system; uci show network; uci show wireless; uci show dhcp';
export const BACKUP_FILE = '/tmp/bench-config.tar.gz';
export const MAKE_BACKUP = `rm -f ${BACKUP_FILE}; sysupgrade -b ${BACKUP_FILE} >/dev/null 2>&1 && test -s ${BACKUP_FILE} && echo BENCH-OK`;
export const READ_BACKUP = `cat ${BACKUP_FILE}`;
export const DROP_BACKUP = `rm -f ${BACKUP_FILE}`;
export const FIRMWARE_FILE = '/tmp/bench-firmware.bin';
export const UPLOAD = `cat > ${FIRMWARE_FILE}`;
export const FIRMWARE_SUM = `sha256sum ${FIRMWARE_FILE}`;
export const FIRMWARE_TEST = `sysupgrade -T ${FIRMWARE_FILE} && echo BENCH-OK`;
/** Keeps the settings (sysupgrade's default); `-n` is never used. */
export const FIRMWARE_WRITE = `sysupgrade -v ${FIRMWARE_FILE}`;
export const DROP_FIRMWARE = `rm -f ${FIRMWARE_FILE}`;

/** Settings Bench may change on the router, the values each takes, and what is reloaded after. */
export const ROUTER_SETTINGS = [
  { key: /^system\.@system\[0\]\.hostname$/, value: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/, package: 'system', reload: '/etc/init.d/system reload', about: 'the router\'s name' },
  { key: /^system\.@system\[0\]\.zonename$/, value: /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){0,2}$/, package: 'system', reload: '/etc/init.d/system reload', about: 'the time zone\'s name' },
  { key: /^system\.@system\[0\]\.timezone$/, value: /^[A-Za-z0-9<>+,.:/-]{1,40}$/, package: 'system', reload: '/etc/init.d/system reload', about: 'the time zone rule' },
  { key: /^system\.ntp\.enabled$/, value: /^[01]$/, package: 'system', reload: '/etc/init.d/sysntpd restart', about: 'setting the clock from the internet' },
  { key: /^dhcp\.lan\.leasetime$/, value: /^\d{1,3}[mh]$/, check: (value) => /h$/.test(value) || Number(value.slice(0, -1)) >= 2, package: 'dhcp', reload: '/etc/init.d/dnsmasq reload', about: 'how long an address handed out lasts' },
  { key: /^wireless\.[A-Za-z0-9_]{1,40}\.ssid$/, value: /^[^\0\n\r]{1,32}$/, check: (value) => Buffer.byteLength(value, 'utf8') <= 32 && !/[\u0000-\u001f\u007f]/.test(value), package: 'wireless', reload: 'wifi reload', about: 'a Wi-Fi network\'s name', iface: true },
  { key: /^wireless\.[A-Za-z0-9_]{1,40}\.hidden$/, value: /^[01]$/, package: 'wireless', reload: 'wifi reload', about: 'whether a Wi-Fi network\'s name is shown', iface: true },
];
/** Never changed, whatever is asked: radio limits, keys and the parts that lock the owner out. */
export const ROUTER_NEVER = /(^|\.)(txpower|country|channel|channels|htmode|chanbw|band|legacy_rates|cell_density|noscan|key|sae_password|wpa_psk|password|encryption|ipaddr|netmask|proto)$|^(network|firewall|dropbear|uhttpd|rpcd)\./;
export const UCI_KEY = /^[a-z][a-z0-9_]{0,30}\.(?:@[a-z_-]{1,30}\[\d{1,2}\]|[A-Za-z0-9_]{1,40})\.[A-Za-z0-9_]{1,40}$/;

/** @returns {{rule: object | undefined, why: string}} the setting's rule, or why it is not changed. */
export function routerSettingRule(key, value) {
  const name = String(key ?? '');
  if (!UCI_KEY.test(name)) return { rule: undefined, why: 'Give the setting as uci writes it, such as system.@system[0].hostname.' };
  if (ROUTER_NEVER.test(name) || neverChanged(name)) return { rule: undefined, why: `${name} is a radio limit, a key or a setting that can lock you out of the router; Bench never changes it.` };
  const rule = ROUTER_SETTINGS.find((entry) => entry.key.test(name));
  if (!rule) return { rule: undefined, why: `Bench changes only these router settings: ${ROUTER_SETTINGS.map((entry) => entry.about).join(', ')}. ${name} is read only.` };
  if (value !== undefined && (!rule.value.test(String(value)) || (rule.check && !rule.check(String(value))))) return { rule: undefined, why: `${String(value).slice(0, 40)} is not a value ${name} takes${rule.package === 'wireless' && /ssid$/.test(name) ? ' (a Wi-Fi name is at most 32 bytes, without control characters)' : /leasetime$/.test(name) ? ' (at least 2m)' : ''}.` };
  return { rule, why: '' };
}

/** The fixed commands for one setting. */
export const uci = {
  get: (key) => `uci -q get ${shq(key)}`,
  sectionType: (key) => `uci -q get ${shq(key.split('.').slice(0, 2).join('.'))}`,
  set: (rule, key, value) => `uci set ${shq(`${key}=${value}`)} && uci commit ${rule.package} && ${rule.reload}`,
  unset: (rule, key) => `uci -q delete ${shq(key)}; uci commit ${rule.package} && ${rule.reload}`,
};

/** A setting's value as uci printed it: null when it is not set. */
export const uciValue = (result) => (result.code === 0 ? String(result.stdout ?? '').replace(/\n$/, '') : null);

/** An option whose value is a secret (keys, passwords, PINs, tokens): never read out, always masked. */
export const SECRET_OPTION = /(key|pass|pwd|pin|psk|secret|token|auth|private|wpa|sae|cert|identity)/i;
export const isSecretOption = (key) => SECRET_OPTION.test(String(key ?? '').split('.').pop());

/** Lines of `uci show`, with keys and passwords masked: never a secret to a model. */
export function maskedSettings(text) {
  return String(text ?? '').split('\n').map((line) => {
    const found = /^([^=]+)=(.*)$/.exec(line);
    if (found && isSecretOption(found[1])) return `${found[1]}='[masked]'`;
    return mask(clean(line, 300));
  }).filter((line) => line.trim()).slice(0, 400);
}

/** @returns {{openwrt: boolean, release: string, gl: string, model: string, kernel: string, uptime: string}} what IDENTIFY printed. */
export function parseIdentity(text) {
  const [release = '', gl = '', model = '', kernel = '', uptime = '', seconds = ''] = String(text ?? '').split('@@').map((part) => part.trim());
  const field = (name) => clean((new RegExp(`${name}='?([^'\\n]*)'?`).exec(release) ?? [])[1] ?? '', 80);
  return { openwrt: /DISTRIB_ID/.test(release), release: [field('DISTRIB_ID'), field('DISTRIB_RELEASE')].filter(Boolean).join(' '), gl: clean(gl, 40), model: clean(model.replace(/\n/g, ' / '), 120), kernel: clean(kernel, 120), uptime: clean(uptime, 120), uptimeSeconds: /^\d+(?:\.\d+)?/.test(seconds) ? Number.parseFloat(seconds) : undefined };
}

/** The partitions on the router: the loader and calibration are named so the owner sees what Bench never writes. */
export function parseMtd(text) {
  return String(text ?? '').split('@@')[0].split('\n').map((line) => /^(mtd\d+):\s+([0-9a-f]+)\s+[0-9a-f]+\s+"([^"]+)"/.exec(line.trim())).filter(Boolean).map((found) => ({ part: found[1], bytes: parseInt(found[2], 16), name: clean(found[3], 40), protected: /(u-?boot|bootloader|sbl|appsbl|art|factory|caldata|bdinfo|cal|qsee|devcfg|tz|rpm|cdt|mibib|ddr)/i.test(found[3]) }));
}
