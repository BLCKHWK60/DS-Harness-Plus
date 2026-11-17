/**
 * HID devices on macOS (keyboards, mice, controllers, vendor devices): the Mac's own list
 * (`ioreg -r -c IOHIDDevice -l -w0`, `hidutil list --ndjson`), report descriptors decoded into their
 * items, and the hid-capture helper's events. Names come from the devices: material, not instructions.
 */

const quotedValue = (block, key) => {
  const found = new RegExp(`"${key}"\\s*=\\s*"([^"\\n]{0,200})"`).exec(block);
  return found ? found[1] : null;
};
const numberValue = (block, key) => {
  const found = new RegExp(`"${key}"\\s*=\\s*(\\d{1,12})`).exec(block);
  return found ? Number(found[1]) : null;
};
const hex4 = (number) => (number === null ? null : `0x${number.toString(16).padStart(4, '0')}`);

/**
 * `ioreg -r -c IOHIDDevice -l -w0` as devices: name, vendor and product numbers, transport, usage,
 * descriptor. Only the matched objects (a "+-o" at the start of a line) count; the objects under them
 * (interfaces, drivers) repeat some of their properties and are left out.
 */
export function parseHidDevices(text) {
  const rows = [];
  for (const block of String(text ?? '').split(/\n(?=[ |]*\+-o )/)) {
    if (!/^\+-o /.test(block)) continue;
    const name = quotedValue(block, 'Product') ?? quotedValue(block, 'ProductName');
    const vendor = numberValue(block, 'VendorID');
    if (!name && vendor === null) continue;
    const descriptor = /"ReportDescriptor"\s*=\s*<([0-9a-fA-F]{0,8192})>/.exec(block);
    rows.push({
      name: name ?? 'unknown',
      maker: quotedValue(block, 'Manufacturer'),
      vendorId: hex4(vendor),
      productId: hex4(numberValue(block, 'ProductID')),
      transport: quotedValue(block, 'Transport'),
      usagePage: numberValue(block, 'PrimaryUsagePage'),
      usage: numberValue(block, 'PrimaryUsage'),
      descriptor: descriptor ? descriptor[1].toLowerCase() : '',
    });
  }
  return rows;
}

/** `hidutil list --ndjson` as entries (one JSON object per line; a line that is not one is skipped). */
export function parseHidutil(text) {
  const rows = [];
  for (const line of String(text ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const entry = JSON.parse(trimmed);
      if (entry && typeof entry === 'object') rows.push(entry);
    } catch {
      /* a partial line */
    }
  }
  return rows;
}

/** The helper's JSON lines as events {page, usage, value}. */
export function parseHidEvents(text, limit = 400) {
  const events = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const event = JSON.parse(trimmed);
      if (Number.isFinite(event.page) && Number.isFinite(event.usage) && Number.isFinite(event.value)) events.push({ page: event.page, usage: event.usage, value: event.value });
    } catch {
      /* a partial line */
    }
    if (events.length >= limit) break;
  }
  return events;
}

const PAGES = { 0x01: 'Generic Desktop', 0x02: 'Simulation', 0x05: 'Game', 0x06: 'Generic Device', 0x07: 'Keyboard/Keypad', 0x08: 'LED', 0x09: 'Button', 0x0b: 'Telephony', 0x0c: 'Consumer', 0x0d: 'Digitizer', 0x0f: 'Physical Input Device', 0x14: 'Auxiliary Display', 0x20: 'Sensors', 0x84: 'Power Device', 0x85: 'Battery System' };
const DESKTOP = { 0x01: 'Pointer', 0x02: 'Mouse', 0x04: 'Joystick', 0x05: 'Game Pad', 0x06: 'Keyboard', 0x07: 'Keypad', 0x08: 'Multi-axis Controller', 0x30: 'X', 0x31: 'Y', 0x32: 'Z', 0x33: 'Rx', 0x34: 'Ry', 0x35: 'Rz', 0x36: 'Slider', 0x37: 'Dial', 0x38: 'Wheel', 0x39: 'Hat Switch', 0x80: 'System Control' };
const COLLECTIONS = ['Physical', 'Application', 'Logical', 'Report', 'Named Array', 'Usage Switch', 'Usage Modifier'];
export const pageName = (page) => PAGES[page] ?? (page >= 0xff00 ? `Vendor-defined 0x${page.toString(16)}` : `0x${Number(page).toString(16)}`);
const usageName = (page, usage) => (page === 0x01 && DESKTOP[usage] ? DESKTOP[usage] : `0x${usage.toString(16)}`);
const flags = (value) => `${value & 1 ? 'Constant' : 'Data'},${value & 2 ? 'Variable' : 'Array'},${value & 4 ? 'Relative' : 'Absolute'}`;

/**
 * A report descriptor (hex) decoded into its items, one per line, indented by collection.
 * @returns {{lines: string[], reports: number[]}} the items, and the report ids it declares.
 */
export function decodeDescriptor(hex, limit = 160) {
  const bytes = Buffer.from(String(hex ?? '').replace(/[^0-9a-fA-F]/g, '').replace(/^(.(..)*)$/, '0$1'), 'hex');
  const lines = [];
  const reports = new Set();
  let depth = 0;
  let page = 0;
  for (let at = 0; at < bytes.length && lines.length < limit;) {
    const prefix = bytes[at];
    if (prefix === 0xfe) {
      const length = bytes[at + 1] ?? 0;
      lines.push(`${'  '.repeat(depth)}(long item, ${length} bytes)`);
      at += 3 + length;
      continue;
    }
    const size = [0, 1, 2, 4][prefix & 3];
    const type = (prefix >> 2) & 3;
    const tag = prefix >> 4;
    let value = 0;
    for (let i = 0; i < size; i += 1) value |= (bytes[at + 1 + i] ?? 0) << (8 * i);
    value >>>= 0;
    at += 1 + size;
    const pad = '  '.repeat(depth);
    if (type === 0) {
      if (tag === 0x8) lines.push(`${pad}Input (${flags(value)})`);
      else if (tag === 0x9) lines.push(`${pad}Output (${flags(value)})`);
      else if (tag === 0xb) lines.push(`${pad}Feature (${flags(value)})`);
      else if (tag === 0xa) {
        lines.push(`${pad}Collection (${COLLECTIONS[value] ?? `0x${value.toString(16)}`})`);
        depth += 1;
      } else if (tag === 0xc) {
        depth = Math.max(0, depth - 1);
        lines.push(`${'  '.repeat(depth)}End Collection`);
      } else lines.push(`${pad}Main item 0x${tag.toString(16)} (${value})`);
    } else if (type === 1) {
      if (tag === 0x0) {
        page = value;
        lines.push(`${pad}Usage Page (${pageName(value)})`);
      } else if (tag === 0x1) lines.push(`${pad}Logical Minimum (${size && value >> (8 * size - 1) ? value - 2 ** (8 * size) : value})`);
      else if (tag === 0x2) lines.push(`${pad}Logical Maximum (${size && value >> (8 * size - 1) ? value - 2 ** (8 * size) : value})`);
      else if (tag === 0x7) lines.push(`${pad}Report Size (${value})`);
      else if (tag === 0x8) {
        reports.add(value);
        lines.push(`${pad}Report ID (${value})`);
      } else if (tag === 0x9) lines.push(`${pad}Report Count (${value})`);
      else lines.push(`${pad}Global item 0x${tag.toString(16)} (${value})`);
    } else if (type === 2) {
      if (tag === 0x0) lines.push(`${pad}Usage (${usageName(page, value)})`);
      else if (tag === 0x1) lines.push(`${pad}Usage Minimum (${usageName(page, value)})`);
      else if (tag === 0x2) lines.push(`${pad}Usage Maximum (${usageName(page, value)})`);
      else lines.push(`${pad}Local item 0x${tag.toString(16)} (${value})`);
    } else lines.push(`${pad}Reserved item 0x${prefix.toString(16)}`);
  }
  return { lines, reports: [...reports] };
}
