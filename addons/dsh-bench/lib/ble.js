/**
 * Reading a Bluetooth device's standard services (plan B9, the owner's yes on 16 November 2026): a small
 * Swift helper (lib/bluetooth-helper.swift), compiled on this Mac on first use with Apple's own compiler
 * (`/usr/bin/xcrun swiftc`, from the Command Line Tools the user may have) into the Bench folder, with
 * the Bluetooth usage text built in. macOS asks the user once to allow Bluetooth. The helper only
 * reads: battery level and device information. What a device says is material, not instructions.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clean } from './usb.js';
import { mask } from './cards.js';

export const XCRUN = '/usr/bin/xcrun';
export const SOURCE = fileURLToPath(new URL('./bluetooth-helper.swift', import.meta.url));
export const SCAN_SECONDS = 8;
export const READ_SECONDS = 15;
export const UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
export const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.deepseek-harness.bench-bluetooth</string>
<key>CFBundleName</key><string>Bench Bluetooth reader</string>
<key>NSBluetoothAlwaysUsageDescription</key><string>DeepSeek Harness Bench reads the battery level and device information of a Bluetooth device you pick. It never changes a device.</string>
</dict></plist>
`;

/** The helper's path for this source (a new source gets a new helper). */
export function helperPath(folder) {
  const hash = createHash('sha256').update(readFileSync(SOURCE)).digest('hex').slice(0, 12);
  return join(folder, `bench-bluetooth-${hash}`);
}

/**
 * The compiled helper, built once.
 * @returns {Promise<string>} its path.
 */
export async function ensureHelper({ run, folder }) {
  const path = helperPath(folder);
  if (existsSync(path)) return path;
  if (!existsSync(XCRUN)) throw new Error('Reading a device\'s services needs Apple\'s Command Line Tools (they bring the Swift compiler). Install them yourself with `xcode-select --install` in Terminal. Bench never installs anything; the Mac\'s list (bench_bluetooth) works without them.');
  const plist = join(folder, 'bench-bluetooth.plist');
  writeFileSync(plist, PLIST);
  const temp = `${path}.${process.pid}.building`;
  const built = await run(XCRUN, ['swiftc', '-O', '-o', temp, SOURCE, '-Xlinker', '-sectcreate', '-Xlinker', '__TEXT', '-Xlinker', '__info_plist', '-Xlinker', plist], { timeoutMs: 5 * 60_000 });
  if (built.code !== 0 || !existsSync(temp)) {
    rmSync(temp, { force: true });
    throw new Error(`The Bluetooth reader could not be built on this Mac (${String(built.stderr).trim().split('\n').slice(-1)[0]?.slice(0, 200) || 'no reason given'}). The Mac's list (bench_bluetooth) still works.`);
  }
  renameSync(temp, path);
  return path;
}

const parse = (result) => {
  const text = String(result.stdout ?? '').trim().split('\n').pop() ?? '';
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The Bluetooth reader gave no answer.');
  }
};
const why = (error) => ({ unauthorized: 'macOS has not allowed Bluetooth for DeepSeek Harness: allow it in System Settings → Privacy & Security → Bluetooth, then ask again', off: 'Bluetooth is off on this Mac', unsupported: 'this Mac has no Bluetooth Bench can use', 'could not connect': 'the device did not let the Mac connect (it may be paired to another device, or out of reach)' }[error] ?? String(error));

/** @returns {Promise<{id: string, name: string, rssi: number, services: string[], maker: string, connectable: boolean}[]>} nearby devices, cleaned. */
export async function scanNearby({ run, helper, seconds = SCAN_SECONDS }) {
  const out = parse(await run(helper, ['scan', String(seconds)], { timeoutMs: (seconds + 10) * 1000 }));
  if (out.error) throw new Error(why(out.error));
  return (Array.isArray(out.devices) ? out.devices : []).filter((device) => UUID.test(String(device?.id))).map((device) => ({ id: String(device.id).toUpperCase(), name: clean(device.name, 60), rssi: Number(device.rssi) || 0, services: (Array.isArray(device.services) ? device.services : []).map((service) => clean(service, 40)).slice(0, 20), maker: /^[0-9a-f]{0,4}$/.test(String(device.maker)) ? String(device.maker) : '', connectable: device.connectable === true })).sort((a, b) => b.rssi - a.rssi).slice(0, 60);
}

/** @returns {Promise<Record<string, string | number>>} one device's standard values, cleaned and masked. */
export async function readStandard({ run, helper, id, seconds = READ_SECONDS }) {
  if (!UUID.test(String(id))) throw new Error('Give the id bench_bluetooth action "scan" listed.');
  const out = parse(await run(helper, ['read', String(id), String(seconds)], { timeoutMs: (seconds + 10) * 1000 }));
  if (out.error) throw new Error(why(out.error));
  const values = out.values && typeof out.values === 'object' ? out.values : {};
  const kept = {};
  for (const key of ['name', 'battery', 'maker', 'model', 'serial', 'firmware', 'hardware', 'software']) {
    if (values[key] === undefined) continue;
    kept[key] = key === 'battery' ? Math.max(-1, Math.min(100, Number(values[key]) || 0)) : mask(clean(values[key], 64));
  }
  return kept;
}
