/**
 * The Android recipe (plan B7), through Google's adb (installed by the user). Identify: the devices adb
 * sees. Read: a few build properties, the battery, a bounded piece of the log, one setting. Adjust: one
 * setting at a time, its old value saved first and read back after, with an undo entry.
 * Unlocking the bootloader and flashing are not built: they need their own yes and a full backup.
 *
 * adb joins the words after `shell` into one command line on the phone, so every value Bench passes
 * there is put in single quotes (a quote inside is written as '\''), and a new value is also checked to
 * be a plain word. Bench changes only the settings on its short list (brightness, screen timeout, font
 * size, sounds, rotation, animation speed, automatic time); every other setting is read only.
 */
import { clean } from './usb.js';
import { mask } from './cards.js';
import { neverChanged } from './catalogue.js';

export const SERIAL = /^[A-Za-z0-9._:-]{1,64}$/;
export const NAMESPACES = ['system', 'secure', 'global'];
export const KEY = /^[A-Za-z0-9_.]{1,80}$/;
export const VALUE = /^[A-Za-z0-9_.:,+-]{0,200}$/;
/** Settings Bench never reads or changes: identifiers and the phone's protections. */
export const REFUSED_KEYS = /(adb|usb_debugging|development_settings|install_non_market|unknown_sources|package_verifier|verifier_|lock_screen|lockscreen|device_provisioned|user_setup_complete|airplane|bluetooth_address|android_id|http_proxy|global_http_proxy|private_dns|vpn|always_on_vpn|wifi_|mobile_data|data_roaming|enabled_accessibility|accessibility_enabled|default_input_method|enabled_input_methods|location_|mock_location|bugreport|stay_on_while_plugged_in)/i;
/** The only settings Bench changes, each with the values it takes. Everything else is read only. */
export const CHANGEABLE = {
  system: {
    screen_brightness: /^(?:[0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])$/,
    screen_brightness_mode: /^[01]$/,
    screen_off_timeout: /^(?:[1-9][0-9]{3,6})$/,
    font_scale: /^(?:0\.[89][0-9]?|1(?:\.[0-9]{1,2})?)$/,
    haptic_feedback_enabled: /^[01]$/,
    sound_effects_enabled: /^[01]$/,
    accelerometer_rotation: /^[01]$/,
    volume_ring: /^(?:[0-9]|1[0-5])$/,
    volume_music: /^(?:[0-9]|1[0-5])$/,
    volume_alarm: /^(?:[0-9]|1[0-5])$/,
    volume_notification: /^(?:[0-9]|1[0-5])$/,
  },
  global: {
    auto_time: /^[01]$/,
    auto_time_zone: /^[01]$/,
    animator_duration_scale: /^(?:0|0\.5|1|1\.5|2|5|10)(?:\.0)?$/,
    transition_animation_scale: /^(?:0|0\.5|1|1\.5|2|5|10)(?:\.0)?$/,
    window_animation_scale: /^(?:0|0\.5|1|1\.5|2|5|10)(?:\.0)?$/,
  },
  secure: {},
};
/** The list as the tool and the page say it. */
export const CHANGEABLE_TEXT = Object.entries(CHANGEABLE).filter(([, keys]) => Object.keys(keys).length > 0).map(([namespace, keys]) => `${namespace}: ${Object.keys(keys).join(', ')}`).join('; ');
/** The longest old value Bench keeps for an undo. */
export const OLD_MAX = 2000;
/** The build properties Bench reads (everything else of getprop stays out). */
export const PROPS = ['ro.product.manufacturer', 'ro.product.brand', 'ro.product.model', 'ro.product.device', 'ro.build.version.release', 'ro.build.version.sdk', 'ro.build.version.security_patch', 'ro.build.display.id', 'ro.boot.flash.locked', 'ro.boot.verifiedbootstate'];
export const LOG_LINES_MAX = 500;

/** @returns {{serial: string, state: string, model: string, product: string}[]} what `adb devices -l` listed. */
export function parseDevices(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n').slice(1)) {
    const found = /^(\S+)\s+(device|unauthorized|offline|recovery|sideload|bootloader)\b(.*)$/.exec(line.trim());
    if (!found || !SERIAL.test(found[1])) continue;
    const field = (name) => clean((new RegExp(`\\b${name}:(\\S+)`).exec(found[3]) ?? [])[1] ?? '', 60).replace(/_/g, ' ');
    out.push({ serial: found[1], state: found[2], model: field('model'), product: field('product') });
  }
  return out;
}

/** @returns {Record<string, string>} the build properties Bench reads, from `getprop` output. */
export function parseProps(text) {
  const out = {};
  for (const line of String(text ?? '').split('\n')) {
    const found = /^\[([^\]]+)\]: \[([^\]]*)\]$/.exec(line.trim());
    if (found && PROPS.includes(found[1])) out[found[1]] = clean(found[2], 120);
  }
  return out;
}

/** @returns {Record<string, string>} the battery, from `dumpsys battery`. */
export function parseBattery(text) {
  const out = {};
  for (const name of ['AC powered', 'USB powered', 'status', 'health', 'level', 'scale', 'voltage', 'temperature']) {
    const found = new RegExp(`^\\s*${name}:\\s*(.+)$`, 'm').exec(String(text ?? ''));
    if (found) out[name] = clean(found[1], 40);
  }
  return out;
}

/** @returns {string} why a setting may not be read or changed, or ''. */
export function settingRefusal({ namespace, key, value, change = false, risky = false }) {
  if (!NAMESPACES.includes(namespace)) return `The namespace must be one of ${NAMESPACES.join(', ')}.`;
  if (!KEY.test(String(key ?? ''))) return 'A setting\'s name is letters, digits, dots and underscores only.';
  // The owner's "Allow risky writes" switch: any setting, any plain value (still undoable), but never
  // a radio limit or a drone's failsafe.
  if (risky && change) {
    const never = neverChanged(key);
    if (never) return never;
    if (!VALUE.test(String(value ?? ''))) return `${String(value ?? '').slice(0, 40)} is not a plain value (letters, digits and _ . : , + -).`;
    return '';
  }
  if (REFUSED_KEYS.test(key)) return `${key} is an identifier or one of the phone's protections (network, debugging, lock, accessibility and the like); Devices does not touch it.`;
  if (!change) return '';
  const never = neverChanged(key);
  if (never) return never;
  const allowed = CHANGEABLE[namespace]?.[key];
  if (!allowed) return `Devices changes only these settings: ${CHANGEABLE_TEXT}. ${namespace} ${key} is read only.`;
  if (!VALUE.test(String(value ?? '')) || !allowed.test(String(value ?? ''))) return `${String(value ?? '').slice(0, 40)} is not a value ${key} takes.`;
  return '';
}

/** A word for the phone's shell, in single quotes: nothing in it is read as a command. */
export const quoted = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;

/** The fixed adb arguments, built from checked values only; values for the phone's shell are quoted. */
export const adbArgs = {
  devices: () => ['devices', '-l'],
  props: (serial) => ['-s', serial, 'shell', 'getprop'],
  battery: (serial) => ['-s', serial, 'shell', 'dumpsys', 'battery'],
  logs: (serial, lines) => ['-s', serial, 'logcat', '-d', '-t', String(lines)],
  get: (serial, namespace, key) => ['-s', serial, 'shell', 'settings', 'get', namespace, quoted(key)],
  put: (serial, namespace, key, value) => ['-s', serial, 'shell', 'settings', 'put', namespace, quoted(key), quoted(value)],
  remove: (serial, namespace, key) => ['-s', serial, 'shell', 'settings', 'delete', namespace, quoted(key)],
};

/**
 * A setting's value exactly as the phone printed it (for the undo list): null when it was not set,
 * undefined when it cannot be kept exactly (several lines, too long).
 */
export const settingRaw = (text) => {
  const value = String(text ?? '').replace(/\r?\n$/, '');
  if (value === 'null') return null;
  if (value.includes('\n') || value.includes('\0') || value.length > OLD_MAX) return undefined;
  return value;
};

/** A setting's value as it is shown: "null" means it was not set. */
export const settingValue = (text) => {
  const value = String(text ?? '').trim().split('\n')[0] ?? '';
  return value === 'null' ? null : clean(value, 200);
};

/** Log lines as they are kept and shown: cleaned, secrets masked. */
export const logLines = (text) => String(text ?? '').split('\n').map((line) => mask(clean(line, 400))).filter((line) => line.trim());
