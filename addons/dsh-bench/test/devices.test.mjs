/**
 * Bench's device steps (plan B3, B4, B5, B7, B9) with stand-ins only: no real port is opened, no real
 * esptool, adb or device is used, the Mac's Bluetooth list is a sample. Stand-in programs are small
 * scripts in a throwaway folder (stty, cat), or a scripted runner that answers as esptool, adb and pmset do.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gate, lookOnlyFamily, powerOf, powerRefusal } from '../lib/gate.js';
import { addressOf, bootCheck, parseFlashId, protectedHit, rangesOf, sizeBytes, sourceRefusal } from '../lib/esp32.js';
import { adbArgs, parseBattery, parseDevices, parseProps, settingRaw, settingRefusal } from '../lib/android.js';
import { bluetoothReport, parseBluetooth } from '../lib/bluetooth.js';
import { createSerial, deviceLine, portRefusal } from '../lib/serial.js';
import { PROGRAMS, findProgram } from '../lib/run.js';
import { NOT_ALLOWED, NOT_THERE, NO_BACKUPS, NO_COMMANDS, NO_DEVICE_FILES, benchRefusal } from '../lib/guard.js';
import { protectedPhrase } from '../lib/devices.js';

test('the protected-part words the user must write themselves', () => {
  assert.equal(protectedPhrase({ name: 'ESP32  Board 1' }), 'write protected esp32 board 1');
});

const scratch = () => mkdtempSync(join(tmpdir(), 'bench-dev-'));
const card = (level, asks, extra = {}) => ({ name: 'ESP32 board 1', permissions: { level, asks }, ...extra });

test('the gates: Identify always; Read by level; Adjust and Write as the card allows; Restricted, Ask-Auto, Full Auto; Write always asks', () => {
  assert.deepEqual(gate({ card: card('identify', 'ask-auto'), need: 'identify' }), { ok: true, ask: false, why: '' });
  assert.equal(gate({ card: card('identify', 'ask-auto'), need: 'read' }).ok, false);
  assert.equal(gate({ card: card('read', 'ask-auto'), need: 'read' }).ok, true);
  assert.match(gate({ card: card('read', 'full-auto'), need: 'adjust' }).why, /highest level is Read[\s\S]*Only the user can raise it, on Settings → Bench/);
  assert.deepEqual(gate({ card: card('adjust', 'ask-auto'), need: 'adjust' }), { ok: true, ask: true, why: '' });
  assert.deepEqual(gate({ card: card('adjust', 'full-auto'), need: 'adjust' }), { ok: true, ask: false, why: '' });
  assert.match(gate({ card: card('write', 'restricted'), need: 'adjust' }).why, /Restricted/);
  assert.equal(gate({ card: card('write', 'restricted'), need: 'write' }).ok, false);
  assert.deepEqual(gate({ card: card('write', 'full-auto'), need: 'write' }), { ok: true, ask: true, why: '' }, 'a write asks in every mode');
  assert.equal(gate({ card: card('adjust', 'ask-auto'), need: 'write' }).ok, false);
  assert.equal(gate({ card: {}, need: 'read' }).ok, true, 'a card from before starts at Read');
});

test('look-only families: Adjust and Write are refused whatever the card says; Read stays', () => {
  for (const name of ['Bosch eBike', 'Omron blood pressure monitor', 'Nuki smart lock', 'Living room thermostat', 'Anker power bank', 'Ninebot scooter']) {
    const c = { name, permissions: { level: 'write', asks: 'full-auto' } };
    assert.ok(lookOnlyFamily(c), name);
    assert.equal(gate({ card: c, need: 'adjust' }).ok, false, name);
    assert.equal(gate({ card: c, need: 'write' }).ok, false, name);
    assert.equal(gate({ card: c, need: 'read' }).ok, true, name);
  }
  for (const name of ['ESP32 board 1', 'Pixel 7', 'Raspberry Pi Pico']) assert.equal(lookOnlyFamily({ name }), '', name);
});

test('power: no write on a Mac running on its battery below 50%; on power or well charged it may', () => {
  const low = powerOf("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t23%; discharging; 2:01 remaining present: true");
  assert.deepEqual(low, { battery: true, percent: 23 });
  assert.match(powerRefusal(low), /battery at 23%[\s\S]*plug the Mac in/);
  assert.equal(powerRefusal(powerOf("Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t23%; charging")), '');
  assert.equal(powerRefusal(powerOf("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t80%; discharging")), '');
  assert.match(powerRefusal(powerOf("Now drawing from 'Battery Power'")), /battery/, 'on battery and the charge unknown: no');
  assert.equal(powerRefusal(powerOf("Now drawing from 'AC Power'")), '', 'a Mac without a battery');
});

const FLASH_ID = `esptool.py v4.8.1
Serial port /dev/cu.SLAB_USBtoUART
Connecting....
Detecting chip type... ESP32
Chip is ESP32-D0WD-V3 (revision v3.1)
Features: WiFi, BT, Dual Core, 240MHz, VRef calibration in efuse, Coding Scheme None
Crystal is 40MHz
MAC: 24:6f:28:aa:bb:cc
Uploading stub...
Manufacturer: 20
Device: 4016
Detected flash size: 4MB
Hard resetting via RTS pin...`;

test('the ESP32 recipe: chip details, sizes, addresses, official sources only, protected parts, the start check', () => {
  assert.deepEqual(parseFlashId(FLASH_ID), { chip: 'ESP32-D0WD-V3 (revision v3.1)', features: 'WiFi, BT, Dual Core, 240MHz, VRef calibration in efuse, Coding Scheme None', mac: '24:6f:28:aa:bb:cc', flash: '4MB', flashBytes: 4 * 1024 * 1024 });
  assert.equal(sizeBytes('512KB'), 512 * 1024);
  assert.equal(sizeBytes('64MB'), undefined, 'larger than Bench works with');
  assert.equal(addressOf('0x10000'), 0x10000);
  assert.equal(addressOf('0x10001'), undefined, 'not on a 4 KB boundary');
  assert.equal(addressOf('0x10000; rm'), undefined);
  assert.equal(sourceRefusal('https://github.com/esphome/esphome/releases/download/2026.1.0/x.bin'), '');
  assert.equal(sourceRefusal('https://dl.espressif.com/x.bin'), '');
  assert.equal(sourceRefusal('https://micropython.org/resources/firmware/ESP32_GENERIC.bin'), '');
  assert.match(sourceRefusal('https://github.com/someone/fork/releases/x.bin'), /is not a source Bench knows/);
  assert.match(sourceRefusal('https://forum.example.com/attachment/123'), /never flashed/);
  assert.match(sourceRefusal('http://dl.espressif.com/x.bin'), /https/);
  assert.match(protectedHit(0x0, 0x1000), /loader/);
  assert.match(protectedHit(0xe000, 0x4000), /loader/, 'a write that starts below 0x10000');
  assert.equal(protectedHit(0x10000, 0x100000), '');
  assert.deepEqual(rangesOf('0x9000-0xF000, 0x3E0000-0x400000, nonsense'), [[0x9000, 0xf000], [0x3e0000, 0x400000]]);
  assert.match(protectedHit(0x3f0000, 0x1000, rangesOf('0x3E0000-0x400000')), /a part you protected/);
  assert.equal(bootCheck(['rst:0x1 (POWERON_RESET)', 'I (32) boot: ESP-IDF v5.1']).ok, true);
  assert.equal(bootCheck(['invalid header: 0xffffffff']).ok, false);
  assert.equal(bootCheck([]).ok, undefined);
});

test('Android: adb\'s list, only the chosen build properties, the battery; settings checked so the phone\'s shell cannot be reached', () => {
  assert.deepEqual(parseDevices('List of devices attached\nR58N123ABC device usb:1-1 product:panther model:Pixel_7 device:panther transport_id:2\nEMU-5554 unauthorized usb:1-2 transport_id:3\nbad;id device\n'), [
    { serial: 'R58N123ABC', state: 'device', model: 'Pixel 7', product: 'panther' },
    { serial: 'EMU-5554', state: 'unauthorized', model: '', product: '' },
  ]);
  const props = parseProps('[ro.product.model]: [Pixel 7]\n[ro.build.version.release]: [15]\n[persist.sys.timezone]: [Europe/Berlin]\n[ro.boot.flash.locked]: [1]');
  assert.deepEqual(props, { 'ro.product.model': 'Pixel 7', 'ro.build.version.release': '15', 'ro.boot.flash.locked': '1' }, 'nothing else of getprop');
  assert.deepEqual(parseBattery('Current Battery Service state:\n  AC powered: false\n  USB powered: true\n  level: 81\n  temperature: 290\n'), { 'AC powered': 'false', 'USB powered': 'true', level: '81', temperature: '290' });
  assert.equal(settingRefusal({ namespace: 'system', key: 'screen_off_timeout', value: '60000', change: true }), '');
  assert.match(settingRefusal({ namespace: 'system', key: 'screen_off_timeout', value: '1; reboot', change: true }), /is not a value screen_off_timeout takes/);
  assert.match(settingRefusal({ namespace: 'global', key: 'private_dns_mode', value: 'off', change: true }), /protections/);
  assert.match(settingRefusal({ namespace: 'global', key: 'http_proxy' }), /protections/, 'not even read');
  assert.match(settingRefusal({ namespace: 'global', key: 'some_new_setting', value: '1', change: true }), /Bench changes only these settings/);
  assert.equal(settingRefusal({ namespace: 'global', key: 'some_new_setting' }), '', 'read, it may be');
  assert.equal(adbArgs.put('X', 'system', 'font_scale', "1'; reboot").at(-1), "'1'\\''; reboot'", 'every value goes to the phone in quotes');
  assert.equal(settingRaw('30000 it\'s\n'), "30000 it's");
  assert.equal(settingRaw('null\n'), null);
  assert.equal(settingRaw('a\nb\n'), undefined, 'a value that cannot be kept exactly');
  assert.match(settingRefusal({ namespace: 'global', key: 'adb_enabled', value: '0', change: true }), /protections/);
  assert.match(settingRefusal({ namespace: 'secure', key: 'lockscreen.disabled', value: '1', change: true }), /protections/);
  assert.match(settingRefusal({ namespace: 'vendor', key: 'x' }), /namespace/);
  assert.match(settingRefusal({ namespace: 'system', key: 'a b' }), /letters, digits/);
});

const BLUETOOTH = JSON.stringify({ SPBluetoothDataType: [{ controller_properties: { controller_address: '11:22:33:44:55:66' }, device_connected: [{ 'Magic Keyboard': { device_address: 'AA-BB-CC-DD-EE-01', device_minorType: 'Keyboard', device_vendorID: '0x004C', device_batteryLevelMain: '78%' } }], device_not_connected: [{ 'Bosch eBike\u202e': { device_address: 'AA-BB-CC-DD-EE-02', device_services: ['Battery', 'Device Information'] } }] }] });

test('Bluetooth: the Mac\'s list read, names cleaned, look-only devices marked, nothing connected to', () => {
  const found = parseBluetooth(BLUETOOTH);
  assert.equal(found.connected.length, 1);
  assert.equal(found.connected[0].name, 'Magic Keyboard');
  assert.equal(found.connected[0].battery, '78%');
  assert.equal(found.paired[0].name, 'Bosch eBike', 'a hidden direction mark is cleaned');
  assert.equal(found.paired[0].lookOnly, 'vehicles and e-bikes');
  const text = bluetoothReport(found, new Date(Date.UTC(2026, 10, 16, 12)));
  assert.match(text, /Nothing was connected to and nothing was sent/);
  assert.match(text, /"Bosch eBike": services Battery, Device Information · Mac's identifier AA-BB-CC-DD-EE-02 · LOOK-ONLY \(vehicles and e-bikes\)/);
  assert.doesNotMatch(text, /11:22:33:44:55:66/, 'the Mac\'s own controller is not listed');
  assert.throws(() => parseBluetooth('not json'), /could not be read/);
});

test('ports: only a /dev/cu port bench_usb listed, never the Mac\'s own', () => {
  const shown = new Set(['/dev/cu.SLAB_USBtoUART']);
  assert.equal(portRefusal('/dev/cu.SLAB_USBtoUART', shown), '');
  assert.match(portRefusal('/dev/cu.usbmodem1', shown), /not listed by bench_usb/);
  assert.match(portRefusal('/dev/cu.debug-console', new Set(['/dev/cu.debug-console'])), /Mac's own/);
  assert.match(portRefusal('/dev/tty.SLAB_USBtoUART', shown), /not a serial port Bench opens/);
  assert.match(portRefusal('/dev/cu.x;rm', shown), /not a serial port/);
  assert.equal(deviceLine('wifi password: hunter22\u0007 ok'), 'wifi password: [masked]  ok');
});

/** Stand-in stty and cat in a throwaway folder: stty notes its arguments; cat prints lines and waits. */
function standInPrograms(lines, { failStty = false } = {}) {
  const dir = scratch();
  const notes = join(dir, 'stty-args.txt');
  writeFileSync(join(dir, 'stty'), `#!/bin/sh\necho "$@" > "${notes}"\n${failStty ? 'echo "stty: no such port" >&2; exit 1' : 'exit 0'}\n`);
  writeFileSync(join(dir, 'cat'), `#!/bin/sh\n${lines.map((line) => `printf '%s\\n' '${line.replace(/'/g, "'\\''")}'`).join('\n')}\nsleep 30\n`);
  chmodSync(join(dir, 'stty'), 0o755);
  chmodSync(join(dir, 'cat'), 0o755);
  return { dir, stty: join(dir, 'stty'), cat: join(dir, 'cat'), notes };
}

test('watching a port: the line is set with fixed arguments, every line is kept with its time, secrets masked, and it stops on time', async () => {
  const programs = standInPrograms(['rst:0x1 (POWERON_RESET),boot:0x13', 'wifi password: hunter22', 'temp=21.5']);
  const folder = scratch();
  try {
    const serial = createSerial({ stty: programs.stty, cat: programs.cat });
    const logFile = join(folder, 'today.log');
    const started = Date.now();
    const got = await serial.watch({ port: '/dev/cu.SLAB_USBtoUART', baud: 115200, seconds: 1, logFile });
    assert.ok(Date.now() - started < 6000, 'stopped on time');
    assert.equal(readFileSync(programs.notes, 'utf8').trim(), '-f /dev/cu.SLAB_USBtoUART 115200 raw -echo -hupcl clocal cs8 -cstopb -parenb');
    assert.equal(got.lines, 3);
    const log = readFileSync(logFile, 'utf8');
    assert.match(log, /^\d{4}-\d\d-\d\dT[\d:.]+Z  rst:0x1/m);
    assert.match(log, /wifi password: \[masked\]/);
    assert.doesNotMatch(log, /hunter22/);
    await assert.rejects(serial.watch({ port: '/dev/cu.x', baud: 12345, seconds: 1, logFile }), /not one Bench uses/);
    const failing = createSerial({ stty: standInPrograms([], { failStty: true }).stty, cat: programs.cat });
    await assert.rejects(failing.watch({ port: '/dev/cu.x', baud: 115200, seconds: 1, logFile }), /could not be set up/);
  } finally {
    rmSync(programs.dir, { recursive: true, force: true });
    rmSync(folder, { recursive: true, force: true });
  }
});

test('programs: found in their fixed places; when missing, Bench says how to get them and installs nothing', async () => {
  const dir = scratch();
  try {
    writeFileSync(join(dir, 'esptool.py'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(dir, 'esptool.py'), 0o755);
    assert.equal(await findProgram('esptool', { places: [dir] }), join(dir, 'esptool.py'));
    assert.equal(await findProgram('adb', { places: [dir] }), '');
    assert.match(PROGRAMS.adb.get, /brew install android-platform-tools[\s\S]*Bench never installs anything/);
    assert.match(PROGRAMS.esptool.get, /pipx install esptool/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the guard: nothing in the Bench folder or under /dev is read or written by file tools; searching a folder that holds it is refused', () => {
  const folder = scratch();
  const old = scratch();
  try {
    const decide = (name, args, cwd = '/') => benchRefusal({ name, args, cwd, benchFolders: [folder, old] });
    assert.equal(decide('read', { file_path: join(folder, 'devices', 'esp32-board-1', 'backups', 'x-flash.bin') }), NO_BACKUPS);
    assert.equal(decide('read', { file_path: join(folder, 'devices', 'esp32-board-1', 'card.md') }), NO_BACKUPS, 'bench_devices shows the card');
    assert.equal(decide('read', { file_path: join(old, 'devices', 'x', 'backups', 'y.bin') }), NO_BACKUPS, 'a Bench folder used before');
    assert.equal(decide('grep', { pattern: 'psk', path: join(folder, 'devices') }), NO_BACKUPS);
    assert.equal(decide('glob', { pattern: join(folder, 'devices', '**', '*.bin') }), NO_BACKUPS);
    assert.equal(decide('grep', { pattern: 'psk', path: dirname(folder) }), NO_BACKUPS, 'a search over a folder that holds the Bench folder');
    assert.equal(decide('grep', { pattern: 'psk' }, dirname(folder)), NO_BACKUPS, 'a search with no path searches the conversation\'s folder');
    assert.equal(decide('read', { file_path: '/dev/cu.SLAB_USBtoUART' }), NO_DEVICE_FILES);
    assert.equal(decide('write', { file_path: '/dev/cu.SLAB_USBtoUART', content: 'x' }), NOT_THERE);
    assert.equal(decide('edit', { file_path: join(folder, 'devices', 'x', 'card.json') }), NOT_THERE);
    assert.equal(decide('read', { file_path: '/elsewhere/notes.md' }), '');
    assert.equal(decide('write', { file_path: '/elsewhere/report.md', content: 'x' }), '', 'a Long run writes its own files outside the Bench folder');
  } finally {
    rmSync(folder, { recursive: true, force: true });
    rmSync(old, { recursive: true, force: true });
  }
});

test('the guard is an allow-list: every way to run a command and every tool Bench does not know is closed', () => {
  const decide = (name, args = {}) => benchRefusal({ name, args, cwd: '/', benchFolders: [] });
  for (const name of ['bash', 'terminal', 'terminal_open', 'terminal_send', 'shell', 'pwsh', 'powershell', 'run_code', 'job_output', 'job_kill', 'terminal_whatever', 'shell_exec']) assert.equal(decide(name), NO_COMMANDS, name);
  for (const name of ['str_replace_editor', 'apply_patch', 'notebook_edit', 'mcp__someone__run', 'computer', 'browser_click', 'spawn_agent']) assert.equal(decide(name), NOT_ALLOWED, name);
  for (const name of ['bench_usb', 'bench_esp32', 'web_search', 'web_fetch', 'pdf_read', 'library_search', 'todo_write', 'ask_user_question', 'mission_step', 'diagram_draw', 'remember']) assert.equal(decide(name), '', name);
});


test('the power rule: no write on the Mac\'s battery below 30% (the owner\'s choice)', () => {
  assert.equal(powerRefusal({ battery: true, percent: 30 }), '');
  assert.equal(powerRefusal({ battery: true, percent: 35 }), '');
  assert.match(powerRefusal({ battery: true, percent: 29 }), /below 30%/);
  assert.equal(powerRefusal({ battery: false, percent: 5 }), '', 'plugged in');
});

test('the catalogue: 22 families with doors, deepest level and what is built; guesses from what a device reports; radio limits and failsafes never changed', async () => {
  const { FAMILIES, catalogueText, familiesOf, neverChanged, recipeText } = await import('../lib/catalogue.js');
  assert.equal(FAMILIES.length, 22);
  assert.equal(new Set(FAMILIES.map((family) => family.id)).size, 22);
  for (const family of FAMILIES) {
    assert.ok(family.name && family.kinds && family.doors.length && family.deepest && family.built.length, family.id);
    assert.match(recipeText(family), new RegExp(`^# Recipe: ${family.name.replace(/[()]/g, '.')}`));
  }
  assert.equal(familiesOf({ vendorId: 0x10c4 })[0].family.id, 'maker-boards');
  assert.equal(familiesOf({ name: 'Bosch Kiox 300' })[0].family.id, 'bikes-scooters-cars');
  assert.ok(FAMILIES.find((family) => family.id === 'bikes-scooters-cars').lookOnly);
  assert.equal(familiesOf({ name: 'Living room', type: '_ipp._tcp' })[0].family.id, 'printers-scanners');
  assert.equal(familiesOf({ name: 'x', services: ['180D'] })[0].family.id, 'wearables-health');
  assert.match(catalogueText(), /\| Drones and radio control \|[\s\S]*Failsafes and radio limits are look-only/);
  for (const key of ['wireless.radio0.txpower', 'wifi_country_code', 'failsafe_throttle', 'rth_altitude', 'max_speed', 'lora_frequency', 'region']) assert.match(neverChanged(key), /never changes it/, key);
  assert.equal(neverChanged('screen_brightness'), '');
  assert.match(settingRefusal({ namespace: 'global', key: 'ble_tx_power_level', value: '1', change: true }), /radio limit or a safety setting/);
});

test('downloads: at most 8 GB (the owner\'s choice); a larger file is refused before anything is written', async () => {
  const { FIRMWARE_MAX, download } = await import('../lib/firmware.js');
  assert.equal(FIRMWARE_MAX, 8 * 1024 * 1024 * 1024);
  const folder = scratch();
  try {
    const fetchFn = async () => ({ status: 200, headers: { get: (name) => (name === 'content-length' ? String(9 * 1024 * 1024 * 1024) : null) }, arrayBuffer: async () => new ArrayBuffer(1) });
    await assert.rejects(download({ url: 'https://dl.gl-inet.com/x.bin', folder, fetchFn, kind: 'router' }), /more than Bench downloads/);
    assert.deepEqual(readdirSync(folder), []);
    const small = async () => ({ status: 200, headers: { get: (name) => (name === 'content-length' ? String(7 * 1024 * 1024 * 1024) : null) }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
    const got = await download({ url: 'https://dl.gl-inet.com/x.bin', folder, fetchFn: small, kind: 'router' });
    assert.equal(got.bytes, 3, '7 GB announced is within the limit');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('two backups in the same moment never share a name, and one never replaces another', async () => {
  const { freeName } = await import('../lib/kit.js');
  const folder = mkdtempSync(join(tmpdir(), 'bench-names-'));
  try {
    assert.equal(freeName(folder, '20261117-013508-423-config', '.tar.gz'), '20261117-013508-423-config.tar.gz');
    writeFileSync(join(folder, '20261117-013508-423-config.tar.gz'), 'first');
    assert.equal(freeName(folder, '20261117-013508-423-config', '.tar.gz'), '20261117-013508-423-config-2.tar.gz');
    // An ESP32 backup also checks its hidden second read.
    writeFileSync(join(folder, '.20261117-013508-flash-check.bin'), 'x');
    assert.equal(freeName(folder, '20261117-013508-flash', '', [(name) => `${name}.bin`, (name) => `.${name}-check.bin`]), '20261117-013508-flash-2');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
