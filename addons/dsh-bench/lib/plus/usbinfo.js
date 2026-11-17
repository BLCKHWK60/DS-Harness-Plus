/**
 * What is plugged in by USB, from the best list this Mac has: `lsusb` (usbutils) when it is installed,
 * otherwise the Mac's own `system_profiler SPUSBDataType SPUSBHostDataType -json` (newer macOS keeps USB
 * under SPUSBHostDataType), otherwise `ioreg -r -c IOUSBHostDevice -l -w0`. Reading a list opens nothing.
 * Names come from the devices themselves: material, not instructions.
 */
import { locate, runProgram } from './core.js';

export const VENDOR_NAMES = {
  0x0403: 'FTDI', 0x1a86: 'WCH (Nanjing Qinheng)', 0x10c4: 'Silicon Labs', 0x067b: 'Prolific', 0x2e8a: 'Raspberry Pi', 0x0483: 'STMicroelectronics',
  0x1366: 'SEGGER', 0x05ac: 'Apple', 0x2341: 'Arduino', 0x2a03: 'Arduino', 0x303a: 'Espressif', 0x0d28: 'Arm (DAPLink)', 0x03eb: 'Microchip (Atmel)',
  0x1d6b: 'Linux Foundation', 0x0bda: 'Realtek', 0x2109: 'VIA Labs', 0x072f: 'Advanced Card Systems', 0x04e6: 'SCM Microsystems', 0x09fb: 'Altera', 0x03fd: 'Xilinx',
};
/** FTDI chips by product number. */
export const FTDI_CHIPS = { 0x6001: 'FT232R or FT245R (FT232BM/BL on older boards)', 0x6010: 'FT2232C/D/H (two ports)', 0x6011: 'FT4232H (four ports)', 0x6014: 'FT232H', 0x6015: 'FT-X series (FT230X, FT231X, FT234XD, FT240X)' };
/** WCH chips by product number. */
export const WCH_CHIPS = { 0x7523: 'CH340 or CH341 (serial)', 0x5523: 'CH341 (serial)', 0x5512: 'CH341 (I2C/SPI/parallel mode, no serial port)', 0x7522: 'CH340K', 0x55d4: 'CH9102', 0x55d3: 'CH343', 0x55d2: 'CH342 (two ports)' };

const hex4 = (number) => `0x${Number(number).toString(16).padStart(4, '0')}`;
const numberOf = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').trim();
  const hex = /0x([0-9a-f]+)/i.exec(text);
  if (hex) return Number.parseInt(hex[1], 16);
  if (/^[0-9a-f]{4}$/i.test(text)) return Number.parseInt(text, 16);
  if (/^\d+$/.test(text)) return Number(text);
  return null;
};
const clean = (value, max = 100) => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** `lsusb` lines: Bus 001 Device 002: ID 0403:6001 Future Technology Devices … */
export function parseLsusb(text) {
  const devices = [];
  for (const line of String(text ?? '').split('\n')) {
    const found = /^Bus\s+(\d+)\s+Device\s+(\d+):\s+ID\s+([0-9a-f]{4}):([0-9a-f]{4})\s*(.*)$/i.exec(line.trim());
    if (!found) continue;
    const rest = found[5] ?? '';
    const serial = /\bSerial:\s*(\S+)/i.exec(rest)?.[1] ?? '';
    const vid = Number.parseInt(found[3], 16);
    const name = clean(rest.replace(/\bSerial:\s*\S+/i, ''));
    devices.push({ name: name || 'unnamed device', vid, pid: Number.parseInt(found[4], 16), maker: VENDOR_NAMES[vid] ?? '', serial: clean(serial, 64), location: `bus ${found[1]} device ${found[2]}`, speed: '', hub: /\bhub\b/i.test(name), source: 'lsusb' });
  }
  return devices;
}

const keyLike = (object, exact, pattern) => {
  for (const key of exact) if (object[key] !== undefined) return object[key];
  const key = Object.keys(object).find((name) => pattern.test(name));
  return key ? object[key] : undefined;
};

/** `system_profiler SPUSBDataType SPUSBHostDataType -json`: every item with a vendor number, nested items included. */
export function parseProfiler(text) {
  let data;
  try {
    data = JSON.parse(String(text ?? ''));
  } catch {
    return [];
  }
  const devices = [];
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 12 || devices.length > 400) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const vid = numberOf(keyLike(node, ['vendor_id', 'USBDeviceKeyVendorID'], /vendor_?id$/i));
    const pid = numberOf(keyLike(node, ['product_id', 'USBDeviceKeyProductID'], /product_?id$/i));
    const children = Array.isArray(node._items) ? node._items : [];
    if (vid !== null && pid !== null) {
      const name = clean(keyLike(node, ['_name', 'USBDeviceKeyProductName'], /product_?name$/i));
      devices.push({
        name: name || 'unnamed device',
        vid,
        pid,
        maker: clean(keyLike(node, ['manufacturer', 'USBDeviceKeyVendorName'], /manufacturer|vendor_?name$/i)) || VENDOR_NAMES[vid] || '',
        serial: clean(keyLike(node, ['serial_num', 'USBDeviceKeySerialNumber'], /serial/i), 64),
        location: clean(keyLike(node, ['location_id', 'USBDeviceKeyLocationID'], /location/i), 40),
        speed: clean(keyLike(node, ['device_speed', 'USBDeviceKeyLinkSpeed'], /speed/i), 40),
        power: clean(node.bus_power_used ?? '', 10),
        hub: /\bhub\b/i.test(name) || children.length > 0,
        source: 'system_profiler',
      });
    }
    for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value, depth + 1);
  };
  walk(data, 0);
  return devices;
}

/** `ioreg -r -c IOUSBHostDevice -l -w0`: each USB device object and its properties. */
export function parseIoregUsb(text) {
  const devices = [];
  const seen = new Set();
  for (const block of String(text ?? '').split(/\n(?=[ |]*\+-o )/)) {
    const header = /\+-o ([^<\n]*?)\s*<class (IOUSBHostDevice|IOUSBDevice)\b/.exec(block);
    if (!header) continue;
    const number = (key) => {
      const found = new RegExp(`"${key}"\\s*=\\s*(\\d{1,12})`).exec(block);
      return found ? Number(found[1]) : null;
    };
    const text1 = (...keys) => {
      for (const key of keys) {
        const found = new RegExp(`"${key}"\\s*=\\s*"([^"\\n]{0,200})"`).exec(block);
        if (found) return clean(found[1]);
      }
      return '';
    };
    const vid = number('idVendor');
    const pid = number('idProduct');
    if (vid === null || pid === null) continue;
    const location = number('locationID');
    const serial = text1('USB Serial Number', 'kUSBSerialNumberString');
    const key = `${vid}:${pid}:${serial}:${location}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = text1('USB Product Name', 'kUSBProductString') || clean(header[1].replace(/@[0-9a-f]+$/i, ''));
    devices.push({ name: name || 'unnamed device', vid, pid, maker: text1('USB Vendor Name', 'kUSBVendorString') || VENDOR_NAMES[vid] || '', serial, location: location === null ? '' : `0x${location.toString(16).padStart(8, '0')}`, speed: '', hub: number('bDeviceClass') === 9, source: 'ioreg' });
  }
  return devices;
}

/**
 * The USB devices, from the best list available.
 * @returns {Promise<{devices: object[], source: string, lsusb: string}>} the devices, where they came from, and lsusb's path ('' without it).
 */
export async function usbDevices(deps) {
  const lsusb = await locate(deps, 'lsusb');
  const problems = [];
  if (lsusb) {
    const result = await runProgram(deps, 'lsusb', [], { timeoutMs: 15_000 });
    const devices = parseLsusb(result.out);
    if (result.code === 0 || devices.length > 0) return { devices, source: 'lsusb', lsusb };
    problems.push('lsusb');
  }
  if (await locate(deps, 'system_profiler')) {
    const result = await runProgram(deps, 'system_profiler', ['SPUSBDataType', 'SPUSBHostDataType', '-json'], { timeoutMs: 30_000 });
    const devices = parseProfiler(result.out);
    if (devices.length > 0) return { devices, source: 'system_profiler', lsusb };
  }
  const result = await runProgram(deps, 'ioreg', ['-r', '-c', 'IOUSBHostDevice', '-l', '-w0'], { timeoutMs: 15_000 });
  return { devices: parseIoregUsb(result.out), source: problems.length ? 'ioreg (lsusb failed)' : 'ioreg', lsusb };
}

/** One device as a line. */
export function deviceLine(device) {
  const parts = [`${device.name} (${hex4(device.vid)}:${hex4(device.pid)})`];
  if (device.maker) parts.push(`maker "${device.maker}"`);
  if (device.serial) parts.push(`serial "${device.serial}"`);
  if (device.location) parts.push(`location ${device.location}`);
  if (device.speed) parts.push(`speed ${device.speed}`);
  return parts.join(', ');
}

/** The ports that probably belong to a USB-serial device: by its serial number, or a WCH/usbserial name by location. */
export function portsFor(device, ports) {
  const serial = String(device.serial ?? '').replace(/[^A-Za-z0-9]/g, '');
  const byName = serial.length >= 4 ? ports.filter((port) => port.includes(serial)) : [];
  if (byName.length) return byName;
  const location = /^0x([0-9a-f]{8})$/i.exec(String(device.location ?? ''));
  if (location) {
    const short = location[1].replace(/0+$/, '');
    if (short.length >= 2) return ports.filter((port) => new RegExp(`(?:usbserial|wchusbserial|usbmodem)-?${short}`, 'i').test(port));
  }
  return [];
}
