/**
 * Bench's device tools end to end on a stand-in app: esptool, adb, pmset and the Mac's Bluetooth list
 * are scripted answers (nothing real runs), the serial reader is a stand-in, the user's yes is a
 * stand-in of the app's approval card, and permissions are set through Settings → Bench's own route.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { apply } from '../index.js';
import { MODE_ID } from '../lib/mode.js';

const FLASH_ID = (mac = '24:6f:28:aa:bb:cc') => `Chip is ESP32-D0WD-V3 (revision v3.1)\nFeatures: WiFi, BT\nMAC: ${mac}\nDetected flash size: 128KB\n`;
const BLUETOOTH = JSON.stringify({ SPBluetoothDataType: [{ device_connected: [{ 'Magic Keyboard': { device_address: 'AA-01', device_minorType: 'Keyboard' } }] }] });

/** The add-on on a stand-in app, with scripted programs. */
function world(options = {}) {
  const home = mkdtempSync(join(tmpdir(), 'bench-tools-'));
  const state = {
    approve: options.approve ?? 'allowed-once',
    asked: [],
    calls: [],
    watched: [],
    power: options.power ?? "Now drawing from 'AC Power'",
    mac: '24:6f:28:aa:bb:cc',
    secondReadDiffers: false,
    writeFails: false,
    settings: new Map([['system screen_off_timeout', '30000']]),
    missing: new Set(),
    bootLines: ['rst:0x1 (POWERON_RESET)', 'I (32) boot: ESP-IDF'],
    usb: { id: 'usb 0x10c4:0xea60 serial 0001', label: 'CP2102 USB to UART Bridge (0x10c4:0xea60, serial number "0001")' },
    // The web: pages and what they show (a stand-in; nothing is fetched).
    pages: new Map(),
    fetched: [],
    putCode: 0,
    holdWatch: false,
    beforeYes: undefined,
  };
  const run = async (file, args) => {
    state.calls.push([file, ...args]);
    const program = file.split('/').pop();
    if (program === 'esptool') {
      if (args.includes('flash_id')) return { code: 0, stdout: FLASH_ID(state.mac), stderr: '' };
      if (args.includes('read_flash')) {
        const out = args.at(-1);
        const reads = state.calls.filter((call) => call.includes('read_flash')).length;
        const bytes = Buffer.alloc(128 * 1024, reads === 2 && state.secondReadDiffers ? 7 : 1);
        writeFileSync(out, bytes);
        return { code: 0, stdout: 'Read 131072 bytes', stderr: '' };
      }
      if (args.includes('write_flash')) return state.writeFails ? { code: 2, stdout: '', stderr: 'A fatal error occurred: Failed to write to target RAM' } : { code: 0, stdout: 'Hash of data verified.', stderr: '' };
      if (args.includes('verify_flash')) return { code: 0, stdout: '-- verify OK (digest matched)', stderr: '' };
    }
    if (program === 'adb') {
      if (args[0] === 'devices') return { code: 0, stdout: state.devicesOut ?? 'List of devices attached\nR58N123ABC device usb:1-1 product:panther model:Pixel_7\n', stderr: '' };
      if (args.includes('getprop')) return { code: 0, stdout: '[ro.product.model]: [Pixel 7]\n[ro.boot.flash.locked]: [1]\n', stderr: '' };
      if (args.includes('dumpsys')) return { code: 0, stdout: '  level: 81\n', stderr: '' };
      if (args.includes('logcat')) return { code: 0, stdout: '11-16 10:00:00 I Wifi: psk=hunter22\n11-16 10:00:01 I App: started\n', stderr: '' };
      const at = args.indexOf('settings');
      if (at >= 0) {
        // The phone's shell reads the quoted words back.
        const unquote = (word) => (typeof word === 'string' && word.startsWith("'") ? word.slice(1, -1).replace(/'\\''/g, "'") : word);
        const [verb, namespace, key, value] = args.slice(at + 1).map(unquote);
        const id = `${namespace} ${key}`;
        if (verb === 'get') return { code: 0, stdout: `${state.settings.has(id) ? state.settings.get(id) : 'null'}\n`, stderr: '' };
        if (verb === 'put') { if (state.putCode !== 0) { if (state.putApplies) state.settings.set(id, value); return { code: state.putCode, stdout: '', stderr: 'Permission denial' }; } state.settings.set(id, value); return { code: 0, stdout: '', stderr: '' }; }
        if (verb === 'delete') { state.settings.delete(id); return { code: 0, stdout: '', stderr: '' }; }
      }
    }
    if (program === 'pmset') return { code: 0, stdout: state.power, stderr: '' };
    if (program === 'system_profiler') return { code: 0, stdout: BLUETOOTH, stderr: '' };
    return { code: 1, stdout: '', stderr: 'unknown' };
  };
  const serial = async () => ({
    watch: async ({ port, baud, seconds, logFile, signal }) => {
      state.watched.push({ port, baud, seconds });
      if (state.holdWatch) {
        // A long watch: it ends only when it is stopped.
        await new Promise((done) => (signal?.aborted ? done() : signal?.addEventListener('abort', done, { once: true })));
        const at = new Date();
        return { lines: 0, bytes: 0, newest: [], startedAt: at, endedAt: at, stoppedEarly: true };
      }
      writeFileSync(logFile, `${state.bootLines.join('\n')}\n`, { flag: 'a' });
      const at = new Date();
      return { lines: state.bootLines.length, bytes: 40, newest: state.bootLines.map((line) => `${at.toISOString()}  ${line}`), startedAt: at, endedAt: at, stoppedEarly: false };
    },
  });
  const registered = new Map();
  let route;
  const settings = { describe: () => [{ ns: 'modes', value: { extraModes: '{}', defaultMode: 'bench' } }], mutate: async () => {} };
  const services = { dshHomePath: (name) => join(home, name), settings, tools: { register(tool) { registered.set(tool.name, tool); return () => registered.delete(tool.name); } }, modes: { get: () => MODE_ID, isolated: () => false }, agents: { list: () => [] } };
  const ctx = {
    get: (key) => services[key],
    on() {},
    effect(fn) { fn(); },
    provide() {},
    inject: (_names, callback) => callback({ effect: (fn) => fn(), webServer: { register: (spec) => { route = spec.handler; return () => {}; } }, connection: { requestRejection: () => undefined } }),
    logger: { warn() {}, info() {} },
  };
  const config = { enabled: true, folder: '' };
  apply(ctx, config, {
    identify: async (onPorts) => { onPorts([{ port: '/dev/cu.SLAB_USBtoUART', ...state.usb }]); return 'USB report'; },
    find: async (id) => (state.missing.has(id) ? '' : `/fake/bin/${id}`),
    run,
    serial,
    approve: async (_exec, reason) => { state.asked.push(reason); state.beforeYes?.(); return state.approve; },
    fetch: async (url, options) => {
      state.fetched.push(url);
      assert.equal(options.redirect, 'manual', 'Bench follows each step of the way itself');
      const page = state.pages.get(url);
      if (!page) return { status: 404, headers: { get: () => null }, text: async () => '' };
      if (page.to) return { status: 302, headers: { get: (name) => (name === 'location' ? page.to : null) }, text: async () => '' };
      return { status: 200, headers: { get: () => null }, text: async () => page.text };
    },
  });
  const agent = (said = '', helper = false, conversation = 'b1') => ({ id: helper ? 'h1' : conversation, header: helper ? { parentSession: conversation } : {}, session: { deriveMessages: () => [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: said }] }] } });
  const call = async (name, args, { said = '', helper = false, conversation = 'b1', signal } = {}) => (await registered.get(name).execute(args, { agent: agent(said, helper, conversation), name, signal })).text;
  const post = async (body) => {
    let out = '';
    const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text; } };
    const req = { method: 'POST', url: '/dsh-bench/data', async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } };
    await route(req, res);
    return { status: res.statusCode, json: JSON.parse(out) };
  };
  const device = (name = 'esp32-board-1') => join(home, 'bench', 'devices', name);
  return { home, state, config, call, post, device, close: () => rmSync(home, { recursive: true, force: true }) };
}
const settle = () => new Promise((done) => setTimeout(done, 20));

test('watching a port: only one bench_usb listed; the user is asked once per device; a helper cannot ask; every watch is in the logbook', async () => {
  const app = world();
  try {
    await settle();
    await app.call('bench_card', { name: 'ESP32 board 1', chip: 'ESP32' });
    assert.match(await app.call('bench_serial_watch', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', minutes: 0.1 }), /not listed by bench_usb in this conversation in the last hour/);
    await app.call('bench_usb', {});
    assert.match(await app.call('bench_serial_watch', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', minutes: 0.1 }, { helper: true }), /a helper of a run cannot ask/, 'the first open needs the user, there');
    const first = await app.call('bench_serial_watch', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', baud: 115200, minutes: 0.1 });
    assert.match(app.state.asked[0], /^Open the serial port \/dev\/cu\.SLAB_USBtoUART of "ESP32 board 1"\? The device on it: CP2102 USB to UART Bridge \(0x10c4:0xea60, serial number "0001"\)\. Opening a serial port restarts many boards/);
    assert.match(first, /2 lines, 40 bytes, kept in devices\/esp32-board-1\/logs\/\d{4}-\d\d-\d\d\.log\. Nothing was sent to the device/);
    await app.call('bench_serial_watch', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', minutes: 0.1 }, { helper: true });
    assert.equal(app.state.asked.length, 1, 'asked once for this device; a helper may watch afterwards');
    assert.equal(app.state.watched.length, 2);
    const permissions = JSON.parse(readFileSync(join(app.device(), 'card.json'), 'utf8')).permissions;
    assert.equal(permissions.portAgreed, true);
    assert.equal(permissions.bound.usb.id, 'usb 0x10c4:0xea60 serial 0001', 'the card is linked to the device on the port');
    const log = readFileSync(join(app.device(), 'logbook.md'), 'utf8');
    assert.match(log, /Watched \/dev\/cu\.SLAB_USBtoUART for 6 s[\s\S]*Commands sent to the device: stty -f \/dev\/cu\.SLAB_USBtoUART 115200 raw -echo -hupcl clocal cs8 -cstopb -parenb\n  cat \/dev\/cu\.SLAB_USBtoUART\n  \(read only: nothing was sent to the device\)/);
    app.state.approve = 'rejected';
    await app.call('bench_card', { name: 'Board 2' });
    assert.match(await app.call('bench_serial_watch', { name: 'Board 2', port: '/dev/cu.SLAB_USBtoUART', minutes: 0.1 }), /The user said no/);
    assert.equal(app.state.watched.length, 2, 'not opened after a no');
  } finally {
    app.close();
  }
});

/** A device ready for a write: card, recovery path, port agreed, a checked backup, level Write. */
async function readyToWrite(app, { level = 'write', asks = 'ask-auto', recovery = 'Hold BOOT, press EN, flash the backup from 0x0 with esptool.' } = {}) {
  await app.call('bench_card', { name: 'ESP32 board 1', chip: 'ESP32', ...(recovery ? { recovery } : {}) });
  await app.call('bench_usb', {});
  assert.match(await app.call('bench_esp32', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', action: 'backup' }), /checked: read twice, both copies equal/);
  assert.equal((await app.post({ action: 'permissions', name: 'ESP32 board 1', level, asks, dryRun: false, ranges: '' })).status, 200);
  const firmware = join(app.device(), 'firmware');
  mkdirSync(firmware, { recursive: true });
  const bytes = Buffer.alloc(4096, 3);
  writeFileSync(join(firmware, 'app.bin'), bytes);
  const sum = createHash('sha256').update(bytes).digest('hex');
  app.state.pages.set(SOURCE, { text: `<html><li>app.bin</li><span>sha256:${sum.toUpperCase()}</span></html>` });
  return sum;
}
const SOURCE = 'https://github.com/esphome/esphome/releases/download/2026.1.0/app.bin';
const writes = (app) => app.state.calls.filter((entry) => entry.includes('write_flash')).length;

test('the ESP32 backup: read twice and compared, kept with its checksum, never two different reads passed off as one', async () => {
  const app = world();
  try {
    await settle();
    await app.call('bench_card', { name: 'ESP32 board 1' });
    await app.call('bench_usb', {});
    assert.match(await app.call('bench_esp32', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', action: 'info' }), /ESP32-D0WD-V3 \(revision v3\.1\)[\s\S]*MAC 24:6f:28:aa:bb:cc; flash 128KB/);
    await app.call('bench_esp32', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', action: 'backup' });
    const backups = JSON.parse(readFileSync(join(app.device(), 'backups.json'), 'utf8'));
    assert.equal(backups.length, 1);
    assert.equal(backups[0].verified, true);
    assert.equal(backups[0].mac, '24:6f:28:aa:bb:cc');
    assert.deepEqual(readdirSync(join(app.device(), 'backups')).filter((file) => !file.startsWith('.')), [backups[0].file], 'the second read goes once compared');
    app.state.secondReadDiffers = true;
    app.state.calls.length = 0;
    assert.match(await app.call('bench_esp32', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', action: 'backup' }), /two reads[\s\S]*differ[\s\S]*not checked/);
    assert.equal(JSON.parse(readFileSync(join(app.device(), 'backups.json'), 'utf8'))[1].verified, false);
    app.state.missing.add('esptool');
    assert.match(await app.call('bench_esp32', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', action: 'info' }), /esptool is not installed[\s\S]*Bench never installs anything/);
  } finally {
    app.close();
  }
});

test('a firmware write: refused at Read; a dry run shows what is missing; each of the four conditions holds it back', async () => {
  const app = world();
  try {
    await settle();
    const sum = await readyToWrite(app, { level: 'read' });
    const flash = (extra = {}) => app.call('bench_esp32', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', action: 'flash', file: 'app.bin', address: '0x10000', source: SOURCE, checksum: sum, ...extra });
    assert.match(await flash(), /highest level is Read/);
    assert.match(await flash({ dryRun: true }), /^Dry run: nothing was sent\.[\s\S]*Missing:\n- permission: ESP32 board 1's highest level is Read/);
    await app.post({ action: 'permissions', name: 'ESP32 board 1', level: 'write', asks: 'ask-auto', dryRun: false, ranges: '' });
    assert.match(await flash({ source: 'https://forum.example.com/files/app.bin' }), /Not written[\s\S]*firmware source: forum\.example\.com is not/);
    assert.match(await flash({ checksum: '0'.repeat(64) }), /Not written[\s\S]*firmware checksum: the file's SHA-256 is [0-9a-f]{64}, not 0{64}/);
    // Bench reads the page itself: a checksum the model gives does not count.
    app.state.pages.set(SOURCE, { text: '<html>no checksum here</html>' });
    assert.match(await flash(), /Not written[\s\S]*firmware checksum: the page does not show this file's SHA-256/);
    app.state.pages.set(SOURCE, { to: 'https://evil.example.net/app.bin' });
    assert.match(await flash(), /Not written[\s\S]*firmware checksum: evil\.example\.net: evil\.example\.net is not the maker's/);
    app.state.pages.set(SOURCE, { to: 'https://release-assets.githubusercontent.com/x/app.bin.sha256' });
    app.state.pages.set('https://release-assets.githubusercontent.com/x/app.bin.sha256', { text: `${sum}  app.bin\n` });
    assert.match(await flash({ dryRun: true }), /^Dry run: nothing was sent\.\n(?![\s\S]*Missing)/, 'GitHub\'s own download host, where a release file leads');
    app.state.pages.set(SOURCE, { text: 'nothing' });
    app.state.pages.set('https://github.com/esphome/esphome/releases/tag/2026.1.0', { text: `app.bin sha256:${sum}` });
    assert.match(await flash({ dryRun: true, checksumPage: 'https://github.com/esphome/esphome/releases/tag/2026.1.0' }), /^Dry run: nothing was sent\.\n(?![\s\S]*Missing)/, 'a checksum page of the same project');
    assert.match(await flash({ dryRun: true, checksumPage: 'https://pastebin.com/raw/abc' }), /Missing:\n- firmware checksum: pastebin\.com: pastebin\.com is not/);
    assert.match(await flash({ address: '0x30000' }), /Not written[\s\S]*ends past the flash/);
    assert.equal(writes(app), 0);
    assert.equal(app.state.asked.length, 1, 'only the first open was asked about');
  } finally {
    app.close();
  }
});

test('a firmware write needs the recovery path and a checked backup of this very chip', async () => {
  const app = world();
  try {
    await settle();
    const sum = await readyToWrite(app, { recovery: '' });
    const flash = () => app.call('bench_esp32', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', action: 'flash', file: 'app.bin', address: '0x10000', source: SOURCE, checksum: sum });
    assert.match(await flash(), /recovery path: the card names no way/);
    await app.call('bench_card', { name: 'ESP32 board 1', recovery: 'Hold BOOT and press EN, then write the backup from 0x0.' });
    app.state.mac = '24:6f:28:00:00:01';
    assert.match(await flash(), /is not the one backed up[\s\S]*Nothing was written/);
    app.state.mac = '';
    assert.match(await flash(), /MAC not read\) is not the one backed up[\s\S]*Nothing was written/, 'a chip that does not say its MAC is not taken for the one backed up');
    await app.post({ action: 'unlink', name: 'ESP32 board 1' });
    assert.match(await flash(), /MAC not read\) is not the one backed up[\s\S]*Nothing was written/, 'also on a card not linked to a chip');
    assert.equal(writes(app), 0);
  } finally {
    app.close();
  }
});

test('a firmware write: the user\'s yes every time (also in Full Auto), the power, the protected start of the flash with the user\'s own words; then read back and the start checked', async () => {
  const app = world();
  try {
    await settle();
    const sum = await readyToWrite(app, { asks: 'full-auto' });
    const flash = (extra = {}, said = '') => app.call('bench_esp32', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', action: 'flash', file: 'app.bin', address: '0x10000', source: SOURCE, checksum: sum, ...extra }, { said });
    app.state.power = "Now drawing from 'Battery Power'\n -InternalBattery-0\t20%; discharging";
    assert.match(await flash(), /battery at 20%/);
    app.state.power = "Now drawing from 'AC Power'";
    app.state.approve = 'rejected';
    assert.match(await flash(), /The user said no to writing firmware/);
    assert.equal(writes(app), 0);
    assert.match(app.state.asked.at(-1), /^Write firmware to "ESP32 board 1"\?\nWrite app\.bin \(4096 bytes, SHA-256 [0-9a-f]{64}\) to ESP32 board 1 at 0x10000\.\nSource: https:\/\/github\.com\/esphome[\s\S]*Saved first: backups\/[\s\S]*Way back: Hold BOOT[\s\S]*Cannot be undone by Bench/);
    app.state.approve = 'allowed-once';
    // The protected start of the flash: the user's own words, not the model's.
    assert.match(await flash({ address: '0x0' }), /protected part[\s\S]*"write protected esp32 board 1"/);
    assert.equal(writes(app), 0);
    const done = await flash({ address: '0x0' }, 'Yes: write protected ESP32 board 1');
    assert.match(done, /Written and read back: app\.bin at 0x0 on ESP32 board 1\.\nStart check: passed/);
    const order = app.state.calls.filter((entry) => entry[0].endsWith('esptool')).slice(-3).map((entry) => entry.find((part) => ['flash_id', 'write_flash', 'verify_flash'].includes(part)));
    assert.deepEqual(order, ['flash_id', 'write_flash', 'verify_flash']);
    assert.match(readFileSync(join(app.device(), 'logbook.md'), 'utf8'), /Firmware written: app\.bin[\s\S]*Check: passed[\s\S]*Commands sent to the device: esptool --port \/dev\/cu\.SLAB_USBtoUART --chip auto flash_id/);
  } finally {
    app.close();
  }
});

test('a failed write stops: no second try, the way back and the backup are shown; a failed start is said plainly', async () => {
  const app = world();
  try {
    await settle();
    const sum = await readyToWrite(app);
    app.state.writeFails = true;
    const said = await app.call('bench_esp32', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', action: 'flash', file: 'app.bin', address: '0x10000', source: SOURCE, checksum: sum });
    assert.match(said, /The write failed[\s\S]*does not try again by itself[\s\S]*To bring it back: Hold BOOT[\s\S]*The backup to restore: backups\//);
    assert.equal(writes(app), 1);
    app.state.writeFails = false;
    app.state.bootLines = ['invalid header: 0xffffffff'];
    assert.match(await app.call('bench_esp32', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', action: 'flash', file: 'app.bin', address: '0x10000', source: SOURCE, checksum: sum }), /Start check: FAILED[\s\S]*Bench stops here/);
  } finally {
    app.close();
  }
});

test('Restricted refuses a write even at level Write; a helper of a run never writes', async () => {
  const app = world();
  try {
    await settle();
    const sum = await readyToWrite(app, { asks: 'restricted' });
    const args = { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', action: 'flash', file: 'app.bin', address: '0x10000', source: SOURCE, checksum: sum };
    assert.match(await app.call('bench_esp32', args), /Restricted/);
    await app.post({ action: 'permissions', name: 'ESP32 board 1', level: 'write', asks: 'ask-auto', dryRun: false, ranges: '' });
    assert.match(await app.call('bench_esp32', args, { helper: true }), /a helper of a run cannot ask/);
    assert.equal(writes(app), 0);
  } finally {
    app.close();
  }
});

test('Android: phones listed, details read; a setting changed only as the card allows, its old value on the undo list, set back by undo', async () => {
  const app = world();
  try {
    await settle();
    await app.call('bench_card', { name: 'Pixel 7' });
    assert.match(await app.call('bench_android', { action: 'info', name: 'Pixel 7', serial: 'R58N123ABC' }), /listed in this conversation in the last hour/);
    assert.match(await app.call('bench_android', { action: 'devices' }), /R58N123ABC: device, model Pixel 7/);
    assert.match(await app.call('bench_android', { action: 'info', name: 'Pixel 7', serial: 'R58N123ABC' }), /ro\.product\.model: Pixel 7[\s\S]*battery level: 81[\s\S]*bootloader is locked; Bench does not unlock it/);
    const logs = await app.call('bench_android', { action: 'logs', name: 'Pixel 7', serial: 'R58N123ABC', lines: 50 });
    assert.match(logs, /psk=\[masked\]/);
    assert.doesNotMatch(logs, /hunter22/);
    const put = { action: 'setting_put', name: 'Pixel 7', serial: 'R58N123ABC', namespace: 'system', key: 'screen_off_timeout', value: '60000' };
    assert.match(await app.call('bench_android', put), /highest level is Read/);
    await app.post({ action: 'permissions', name: 'Pixel 7', level: 'adjust', asks: 'ask-auto', dryRun: false, ranges: '' });
    assert.match(await app.call('bench_android', { ...put, dryRun: true }), /^Dry run: nothing was sent\.\nChange system screen_off_timeout on Pixel 7 from 30000 to 60000/);
    assert.equal(app.state.settings.get('system screen_off_timeout'), '30000');
    assert.match(await app.call('bench_android', { ...put, value: '1;reboot' }), /is not a value screen_off_timeout takes/);
    assert.match(await app.call('bench_android', { ...put, namespace: 'global', key: 'http_proxy', value: 'x' }), /protections/);
    assert.match(await app.call('bench_android', { ...put, namespace: 'secure', key: 'some_setting', value: '1' }), /Bench changes only these settings/);
    assert.match(await app.call('bench_android', { ...put, namespace: 'global', key: 'adb_enabled', value: '0' }), /protections/);
    assert.match(await app.call('bench_android', put), /30000 → 60000, read back and equal\. It is on the undo list/);
    assert.match(app.state.asked.at(-1), /^Change system screen_off_timeout on Pixel 7 from 30000 to 60000/, 'Ask-Auto asked');
    await app.post({ action: 'permissions', name: 'Pixel 7', level: 'adjust', asks: 'full-auto', dryRun: false, ranges: '' });
    const asked = app.state.asked.length;
    await app.call('bench_android', { ...put, key: 'font_scale', value: '1.2' });
    assert.equal(app.state.asked.length, asked, 'Full Auto: no question, the change is logged');
    assert.match(readFileSync(join(app.device('pixel-7'), 'undo.md'), 'utf8'), /system screen_off_timeout: 30000 → 60000[\s\S]*system font_scale: \(not set\) → 1\.2/);
    assert.match(await app.call('bench_undo', { name: 'Pixel 7', which: 'last' }), /system font_scale: 1\.2 → \(not set\)\. Each was read back/);
    assert.equal(app.state.settings.has('system font_scale'), false, 'a setting that was not set is deleted again');
    assert.match(await app.call('bench_undo', { name: 'Pixel 7', which: 'last' }), /screen_off_timeout: 60000 → 30000/);
    assert.equal(app.state.settings.get('system screen_off_timeout'), '30000');
    assert.match(await app.call('bench_undo', { name: 'Pixel 7', which: 'last' }), /nothing to set back/);
  } finally {
    app.close();
  }
});

test('look-only devices: a phone setting refused on a card named for an e-bike, whatever its level', async () => {
  const app = world();
  try {
    await settle();
    await app.call('bench_card', { name: 'Bosch eBike display' });
    await app.post({ action: 'permissions', name: 'Bosch eBike display', level: 'write', asks: 'full-auto', dryRun: false, ranges: '' });
    await app.call('bench_android', { action: 'devices' });
    assert.match(await app.call('bench_android', { action: 'setting_put', name: 'Bosch eBike display', serial: 'R58N123ABC', namespace: 'system', key: 'screen_off_timeout', value: '60000' }), /vehicles and e-bikes, which Bench only reads/);
  } finally {
    app.close();
  }
});

test('Bluetooth: the Mac\'s list, read and nothing sent; the permissions route checks what the user gives', async () => {
  const app = world();
  try {
    await settle();
    assert.match(await app.call('bench_bluetooth', {}), /Nothing was connected to and nothing was sent[\s\S]*"Magic Keyboard": kind Keyboard/);
    await app.call('bench_card', { name: 'Board' });
    assert.equal((await app.post({ action: 'permissions', name: 'Board', level: 'root', asks: 'ask-auto' })).status, 400);
    assert.equal((await app.post({ action: 'permissions', name: 'Board', level: 'write', asks: 'ask-auto', ranges: 'everything' })).status, 400);
    const ok = await app.post({ action: 'permissions', name: 'Board', level: 'adjust', asks: 'restricted', dryRun: true, ranges: '0x9000-0xF000' });
    assert.equal(ok.status, 200);
    const row = ok.json.devices.find((entry) => entry.name === 'Board');
    assert.deepEqual([row.level, row.asks, row.dryRun, row.ranges], ['adjust', 'restricted', true, '0x9000-0xF000']);
    assert.match(readFileSync(join(app.device('board'), 'logbook.md'), 'utf8'), /Permissions changed by the user on Settings → Bench\n\n- Before: level read, asks ask-auto[\s\S]*- After: level adjust, asks restricted, dry run yes, protected 0x9000-0xF000/);
    assert.ok(ok.json.closed.some((rule) => rule.what.startsWith('Write (ESP32 firmware)')));
    assert.equal(existsSync(join(app.home, 'bench', 'devices', 'board', 'card.json')), true);
  } finally {
    app.close();
  }
});

test('a card is linked to one device: a card linked to the board on a port is refused for another board; only the user unlinks it', async () => {
  const app = world();
  try {
    await settle();
    await app.call('bench_card', { name: 'ESP32 board 1' });
    await app.call('bench_usb', {});
    await app.call('bench_serial_watch', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', minutes: 0.1 });
    assert.equal(app.state.asked.length, 1);
    // Another board on the same port: the card's permissions are not its.
    app.state.usb = { id: 'usb 0x1a86:0x7523 at 0x01100000', label: 'USB Serial (0x1a86:0x7523, plugged in at 0x01100000)' };
    await app.call('bench_usb', {});
    assert.match(await app.call('bench_serial_watch', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', minutes: 0.1 }), /linked to CP2102 USB to UART Bridge[\s\S]*the device on \/dev\/cu\.SLAB_USBtoUART is USB Serial \(0x1a86:0x7523[\s\S]*unlinks the card on Settings → Bench/);
    assert.equal(app.state.watched.length, 1, 'not opened');
    assert.equal(app.state.asked.length, 1, 'not asked either');
    const unlinked = await app.post({ action: 'unlink', name: 'ESP32 board 1' });
    assert.equal(unlinked.status, 200);
    assert.match(unlinked.json.devices.find((row) => row.name === 'ESP32 board 1').linked, /no device yet/);
    assert.match(readFileSync(join(app.device(), 'logbook.md'), 'utf8'), /The user unlinked the card from its devices on Settings → Bench/);
    await app.call('bench_serial_watch', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', minutes: 0.1 });
    assert.equal(app.state.asked.length, 2, 'asked again, for the new device');
    assert.equal(app.state.watched.length, 2);
  } finally {
    app.close();
  }
});

test('an ESP32 card is linked to its chip by MAC: another chip is refused before a backup', async () => {
  const app = world();
  try {
    await settle();
    await app.call('bench_card', { name: 'ESP32 board 1' });
    await app.call('bench_usb', {});
    assert.match(await app.call('bench_esp32', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', action: 'info' }), /The card is linked to this chip \(MAC 24:6f:28:aa:bb:cc\)/);
    app.state.mac = '24:6f:28:00:00:02';
    assert.match(await app.call('bench_esp32', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', action: 'backup' }), /has MAC 24:6f:28:00:00:02, and ESP32 board 1's card is linked to the chip with MAC 24:6f:28:aa:bb:cc/);
    assert.equal(app.state.calls.filter((entry) => entry.includes('read_flash')).length, 0);
    app.state.mac = '';
    assert.match(await app.call('bench_esp32', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', action: 'backup' }), /did not report the chip's MAC address/);
  } finally {
    app.close();
  }
});

test('ports and phones are used only by the conversation that listed them', async () => {
  const app = world();
  try {
    await settle();
    await app.call('bench_card', { name: 'ESP32 board 1' });
    await app.call('bench_usb', {}, { conversation: 'b2' });
    await app.call('bench_android', { action: 'devices' }, { conversation: 'b2' });
    assert.match(await app.call('bench_serial_watch', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', minutes: 0.1 }), /not listed by bench_usb in this conversation/);
    await app.call('bench_card', { name: 'Pixel 7' });
    assert.match(await app.call('bench_android', { action: 'info', name: 'Pixel 7', serial: 'R58N123ABC' }), /listed in this conversation/);
    assert.equal(app.state.watched.length, 0);
  } finally {
    app.close();
  }
});

test('a phone card is linked to one phone with the user\'s yes; another phone is refused; a helper cannot link', async () => {
  const app = world();
  try {
    await settle();
    await app.call('bench_card', { name: 'Pixel 7' });
    await app.call('bench_android', { action: 'devices' });
    assert.match(await app.call('bench_android', { action: 'info', name: 'Pixel 7', serial: 'R58N123ABC' }, { helper: true }), /a helper of a run cannot ask/);
    app.state.approve = 'rejected';
    assert.match(await app.call('bench_android', { action: 'info', name: 'Pixel 7', serial: 'R58N123ABC' }), /The user said no to linking Pixel 7 to a phone/);
    app.state.approve = 'allowed-once';
    assert.match(await app.call('bench_android', { action: 'info', name: 'Pixel 7', serial: 'R58N123ABC' }), /ro\.product\.model: Pixel 7/);
    assert.match(app.state.asked.at(-1), /^Link the card "Pixel 7" to the phone R58N123ABC \(Pixel 7\)\?/);
    const asked = app.state.asked.length;
    await app.call('bench_android', { action: 'info', name: 'Pixel 7', serial: 'R58N123ABC' });
    assert.equal(app.state.asked.length, asked, 'asked once');
    // A second phone appears: the card is not its.
    app.state.devicesOut = 'List of devices attached\nR58N123ABC device usb:1-1 model:Pixel_7\nZY22OTHER device usb:1-2 model:moto_g\n';
    await app.call('bench_android', { action: 'devices' });
    assert.match(await app.call('bench_android', { action: 'logs', name: 'Pixel 7', serial: 'ZY22OTHER' }), /linked to the phone R58N123ABC \(Pixel 7\), and ZY22OTHER is another one/);
  } finally {
    app.close();
  }
});

test('Android values reach the phone quoted; an old value with spaces and quotes comes back exactly; a refused put adds nothing', async () => {
  const app = world();
  try {
    await settle();
    await app.call('bench_card', { name: 'Pixel 7' });
    await app.post({ action: 'permissions', name: 'Pixel 7', level: 'adjust', asks: 'full-auto', dryRun: false, ranges: '' });
    await app.call('bench_android', { action: 'devices' });
    app.state.settings.set('system screen_off_timeout', "30000\tit's");
    const put = { action: 'setting_put', name: 'Pixel 7', serial: 'R58N123ABC', namespace: 'system', key: 'screen_off_timeout', value: '60000' };
    assert.match(await app.call('bench_android', put), /read back and equal/);
    const sent = app.state.calls.find((entry) => entry.includes('put'));
    assert.deepEqual(sent.slice(-3), ['system', "'screen_off_timeout'", "'60000'"], 'quoted for the phone\'s shell');
    assert.match(await app.call('bench_undo', { name: 'Pixel 7', which: 'last' }), /Each was read back/);
    assert.equal(app.state.settings.get('system screen_off_timeout'), "30000\tit's", 'set back exactly, not a cleaned copy');
    assert.ok(app.state.calls.some((entry) => entry.at(-1) === "'30000\tit'\\''s'"));
    app.state.putCode = 255;
    assert.match(await app.call('bench_android', put), /did not hold[\s\S]*Nothing was changed/);
    assert.match(await app.call('bench_undo', { name: 'Pixel 7', which: 'last' }), /nothing to set back/);
    // adb says it failed, yet the value changed: not called a success, and it can still be set back.
    app.state.putApplies = true;
    assert.match(await app.call('bench_android', put), /did not come out as asked[\s\S]*It is on the undo list/);
    app.state.putCode = 0;
    assert.match(await app.call('bench_undo', { name: 'Pixel 7', which: 'last' }), /60000 → 30000 it's/);
    assert.equal(app.state.settings.get('system screen_off_timeout'), "30000\tit's");
  } finally {
    app.close();
  }
});

test('a device set to "dry run by default" shows the dry run first, also for undo; the same change runs when asked again', async () => {
  const app = world();
  try {
    await settle();
    await app.call('bench_card', { name: 'Pixel 7' });
    await app.post({ action: 'permissions', name: 'Pixel 7', level: 'adjust', asks: 'full-auto', dryRun: true, ranges: '' });
    await app.call('bench_android', { action: 'devices' });
    const put = { action: 'setting_put', name: 'Pixel 7', serial: 'R58N123ABC', namespace: 'system', key: 'screen_off_timeout', value: '60000', dryRun: false };
    assert.match(await app.call('bench_android', put), /^Dry run: nothing was sent\. The user set this device to show a dry run first/, 'dryRun false does not skip it');
    assert.equal(app.state.settings.get('system screen_off_timeout'), '30000');
    assert.match(await app.call('bench_android', { ...put, value: '120000' }), /^Dry run/, 'another value is another change');
    assert.match(await app.call('bench_android', put), /read back and equal/);
    assert.match(await app.call('bench_undo', { name: 'Pixel 7', which: 'last' }), /^Dry run: nothing was sent\. The user set this device/);
    assert.equal(app.state.settings.get('system screen_off_timeout'), '60000');
    assert.match(await app.call('bench_undo', { name: 'Pixel 7', which: 'last' }), /Each was read back/);
  } finally {
    app.close();
  }
});

test('after a write the old backup does not count; the file and the power are checked again after the yes', async () => {
  const app = world();
  try {
    await settle();
    const sum = await readyToWrite(app);
    const args = { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', action: 'flash', file: 'app.bin', address: '0x10000', source: SOURCE };
    // The file changes while the user is asked.
    app.state.beforeYes = () => writeFileSync(join(app.device(), 'firmware', 'app.bin'), Buffer.alloc(4096, 9));
    assert.match(await app.call('bench_esp32', args), /The firmware file changed after you were asked\. Nothing was written/);
    assert.equal(writes(app), 0);
    writeFileSync(join(app.device(), 'firmware', 'app.bin'), Buffer.alloc(4096, 3));
    // The Mac is unplugged while the user is asked.
    app.state.beforeYes = () => { app.state.power = "Now drawing from 'Battery Power'\n -InternalBattery-0\t30%; discharging"; };
    assert.match(await app.call('bench_esp32', args), /battery at 30%/);
    assert.equal(writes(app), 0);
    app.state.power = "Now drawing from 'AC Power'";
    app.state.beforeYes = undefined;
    assert.match(await app.call('bench_esp32', { ...args, checksum: sum }), /Written and read back/);
    assert.match(await app.call('bench_esp32', args), /Not written[\s\S]*firmware was written since the last checked backup; make a new one/);
    await app.call('bench_esp32', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', action: 'backup' });
    assert.match(await app.call('bench_esp32', args), /Written and read back/);
    assert.equal(writes(app), 2);
    assert.equal(JSON.parse(readFileSync(join(app.device(), 'writes.json'), 'utf8')).filter((entry) => entry.ok).length, 2);
  } finally {
    app.close();
  }
});

test('the protected start of the flash needs the user\'s words for this very device, not a longer name and not a "don\'t"', async () => {
  const app = world();
  try {
    await settle();
    await readyToWrite(app);
    const flash = (said) => app.call('bench_esp32', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', action: 'flash', file: 'app.bin', address: '0x0', source: SOURCE }, { said });
    assert.match(await flash('write protected ESP32 board 10'), /protected part/);
    assert.match(await flash("Please don't write protected ESP32 board 1"), /protected part/);
    assert.match(await flash('do not write protected esp32 board 1.'), /protected part/);
    assert.equal(writes(app), 0);
    assert.match(await flash('OK, "write protected ESP32 board 1".'), /Written and read back/);
  } finally {
    app.close();
  }
});

test('a look-only mark stays when the card\'s words change; only the user lifts it', async () => {
  const app = world();
  try {
    await settle();
    await app.call('bench_card', { name: 'Display', model: 'Bosch Kiox 300' });
    await app.call('bench_card', { name: 'Display', model: 'Generic screen' });
    await app.post({ action: 'permissions', name: 'Display', level: 'write', asks: 'full-auto', dryRun: false, ranges: '' });
    await app.call('bench_android', { action: 'devices' });
    const put = { action: 'setting_put', name: 'Display', serial: 'R58N123ABC', namespace: 'system', key: 'screen_off_timeout', value: '60000' };
    assert.match(await app.call('bench_android', put), /vehicles and e-bikes, which Bench only reads/);
    const row = (await app.post({ action: 'permissions', name: 'Display', level: 'write', asks: 'full-auto', dryRun: false, ranges: '' })).json.devices.find((entry) => entry.name === 'Display');
    assert.equal(row.lookOnlyMarked, true);
    assert.equal(row.lookOnlyFromWords, '');
    await app.post({ action: 'permissions', name: 'Display', level: 'write', asks: 'full-auto', dryRun: false, ranges: '', clearLookOnly: true });
    assert.match(await app.call('bench_android', put), /read back and equal/);
    // A card made before cards were marked: its words name an e-bike, and the model changes them.
    await app.call('bench_card', { name: 'Old card', model: 'Plain board' });
    const file = join(app.device('old-card'), 'card.json');
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), model: 'Shimano Steps E8000 display' }));
    await app.call('bench_card', { name: 'Old card', model: 'Plain board again' });
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).permissions.lookOnly, 'vehicles and e-bikes', 'marked from the words it had');
  } finally {
    app.close();
  }
});

test('a long watch ends when Bench is switched off', async () => {
  const app = world();
  try {
    await settle();
    await app.call('bench_card', { name: 'ESP32 board 1' });
    await app.call('bench_usb', {});
    app.state.holdWatch = true;
    const watching = app.call('bench_serial_watch', { name: 'ESP32 board 1', port: '/dev/cu.SLAB_USBtoUART', minutes: 60 });
    await new Promise((done) => setTimeout(done, 100));
    app.config.enabled = false;
    const late = new Promise((done) => setTimeout(() => done('still watching after 6 s'), 6000));
    assert.match(await Promise.race([watching, late]), /stopped early: Bench was switched off/);
  } finally {
    app.close();
  }
});
