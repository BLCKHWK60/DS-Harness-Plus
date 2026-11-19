/**
 * lib/plus: the monitor registry (a spec is checked before any timer starts, a tick's error only goes to
 * lastError and nothing leaves a timer, stopAll clears every timer, at most 8), the dashboard page (text
 * only, the state address cannot break out of its script) and its state, the requirements list, the
 * program finder, and the install texts. Timers, programs and ports are stand-ins.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INSTALL_TEXT, PLUS_PROGRAMS, createRegistry, dashboardHtml, dashboardState, findPlus, formatRequirements, requirementRows } from '../lib/plus/index.js';
import { MAX_MONITORS } from '../lib/plus/registry.js';

const unhandled = [];
process.on('unhandledRejection', (reason) => unhandled.push(reason));
process.on('uncaughtException', (error) => unhandled.push(error));
const settle = () => new Promise((done) => setImmediate(done));

/** Timers that never fire by themselves: the test calls their callbacks. */
function fakeTimers() {
  const made = [];
  const cleared = [];
  return {
    made,
    cleared,
    timers: {
      setInterval: (callback, ms) => { const handle = { kind: 'interval', callback, ms, unref() { this.unrefd = true; } }; made.push(handle); return handle; },
      clearInterval: (handle) => cleared.push(handle),
      setTimeout: (callback, ms) => { const handle = { kind: 'timeout', callback, ms, unref() { this.unrefd = true; } }; made.push(handle); return handle; },
      clearTimeout: (handle) => cleared.push(handle),
    },
  };
}

function registryWorld(run) {
  const clock = fakeTimers();
  let time = Date.UTC(2026, 10, 17, 10, 0, 0);
  const deps = {
    find: async (id) => `/fake/bin/${id}`,
    run,
    now: () => time,
    sleep: async () => {},
    fs: { openSync: () => 3, writeSync: (_fd, _b, _o, length) => length, closeSync: () => {}, readdirSync: () => [] },
    timers: clock.timers,
  };
  return { clock, registry: createRegistry(deps), advance: (ms) => { time += ms; } };
}

test('a monitor spec is checked fully before any timer starts', () => {
  const { clock, registry } = registryWorld(async () => ({ code: 0, stdout: '', stderr: '' }));
  const bad = [
    {},
    { source: 'shell' },
    { source: 'serial', port: '/dev/disk0' },
    { source: 'serial', port: '/dev/cu.usbserial-1', baud: 31337 },
    { source: 'obd', port: '/dev/cu.x;reboot' },
    { source: 'router', host: 'root@8.8.8.8' },
    { source: 'router', host: 'root@192.168.8.1', iface: 'br lan' },
    { source: 'netif', iface: '-en0' },
    { source: 'netif', intervalMs: 10 },
    { source: 'obd', port: '/dev/cu.usbserial-1', intervalMs: 1000 },
  ];
  for (const spec of bad) assert.throws(() => registry.start(spec), Error, JSON.stringify(spec));
  assert.equal(clock.made.length, 0, 'no timer was made');
  assert.equal(registry.count(), 0);
  for (let i = 0; i < MAX_MONITORS; i += 1) registry.start({ source: 'netif' });
  const before = clock.made.length;
  assert.throws(() => registry.start({ source: 'hid' }), /8 monitors are running, the most Devices keeps at once/);
  assert.equal(clock.made.length, before, 'the ninth made no timer');
  assert.ok(clock.made.every((handle) => handle.unrefd), 'every timer is unref\'d');
  registry.stopAll();
});

test('a tick that throws only sets lastError; nothing leaves a timer; stopAll clears every timer', async () => {
  const { clock, registry } = registryWorld(() => { throw new Error('the program crashed'); });
  const serial = registry.start({ source: 'serial', port: '/dev/cu.usbserial-1', label: 'Board' });
  const netif = registry.start({ source: 'netif' });
  const hid = registry.start({ source: 'hid' });
  assert.deepEqual([serial, netif, hid], ['serial-1', 'netif-2', 'hid-3']);
  for (const handle of clock.made) assert.doesNotThrow(() => handle.callback());
  await settle();
  await settle();
  const state = registry.state();
  for (const monitor of state) assert.match(monitor.lastError, /the program crashed/, monitor.id);
  // A timer whose tick finds no program at all: still only lastError.
  const missing = createRegistry({ find: async () => '', run: async () => ({ code: 0, stdout: '' }), sleep: async () => {}, timers: fakeTimers().timers });
  const id = missing.start({ source: 'hid' });
  await missing.tick(id);
  assert.match(missing.state()[0].lastError, /ioreg is not on this Mac/);
  missing.stopAll();
  // Stopping clears both of each monitor's timers.
  const intervals = clock.made.filter((handle) => handle.kind === 'interval');
  registry.stopAll();
  assert.equal(registry.count(), 0);
  for (const handle of clock.made) assert.ok(clock.cleared.includes(handle), `cleared ${handle.kind}`);
  assert.equal(intervals.length, 3);
  assert.equal(registry.stop('serial-1'), false);
  await settle();
  assert.deepEqual(unhandled, [], 'no unhandled error');
});

test('monitor readings: netif rates, a router over SSH, serial lines, OBD values, the HID count', async () => {
  let netstat = 0;
  let ssh = 0;
  const calls = [];
  const { registry, advance } = registryWorld(async (file, args) => {
    const program = file.split('/').pop();
    calls.push([program, ...args]);
    if (program === 'netstat') {
      netstat += 1;
      return { code: 0, stdout: `Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll\nen0 1500 <Link#4> aa:bb:cc:dd:ee:ff 1 0 ${netstat * 2000} 1 0 ${netstat * 1000} 0\n` };
    }
    if (program === 'ssh') {
      ssh += 1;
      return { code: 0, stdout: `br-lan: ${ssh * 4000} 0 0 0 0 0 0 0 ${ssh * 500} 0 0 0 0 0 0 0\n` };
    }
    if (program === 'cat') return { code: null, stdout: args[0].includes('obd') ? '41 0C 1A F8\r41 0D 32\r' : 'temp=21.5\npassword=hunter2\nready\n', timedOut: true };
    if (program === 'ioreg') return { code: 0, stdout: '+-o Keyboard  <class IOHIDDevice>\n    {\n      "Product" = "Keyboard"\n      "VendorID" = 1452\n    }\n' };
    return { code: 0, stdout: '', stderr: '' };
  });
  const netif = registry.start({ source: 'netif', iface: 'en0', label: 'Wi-Fi' });
  const router = registry.start({ source: 'router', host: 'root@192.168.8.1', iface: 'br-lan' });
  const serial = registry.start({ source: 'serial', port: '/dev/cu.usbserial-1' });
  const obd = registry.start({ source: 'obd', port: '/dev/cu.obdlink' });
  const hid = registry.start({ source: 'hid' });
  for (const id of [netif, router, serial, obd, hid]) await registry.tick(id);
  advance(2000);
  await registry.tick(netif);
  await registry.tick(router);
  const byId = Object.fromEntries(registry.state().map((monitor) => [monitor.id, monitor]));
  assert.deepEqual(byId[netif].latest.values, { rx: 1000, tx: 500 });
  assert.deepEqual(byId[router].latest.values, { rx: 2000, tx: 250 });
  assert.deepEqual(byId[serial].latest.values, { lines: 3, bytes: 33 });
  assert.match(byId[serial].latest.text, /password=\[masked\]/);
  assert.deepEqual(byId[obd].latest.values, { rpm: 1726, speedKph: 50 });
  assert.deepEqual(byId[hid].latest.values, { devices: 1 });
  assert.equal(byId[netif].key, 'rx');
  assert.equal(byId[netif].series.length, 1);
  assert.ok(calls.some((call) => call.join(' ') === 'ssh -o BatchMode=yes -o ConnectTimeout=5 root@192.168.8.1 cat /proc/net/dev'));
  assert.ok(calls.every((call) => !['sh', 'bash', 'zsh'].includes(call[0])));
  registry.stopAll();
});

test('the dashboard page: retitled, reads the state once a second with same-origin credentials, text only, the address cannot break out', () => {
  const html = dashboardHtml('/dsh-bench/dashboard/state');
  assert.match(html, /<title>Devices — live devices<\/title>/);
  assert.match(html, /const STATE_URL = "\/dsh-bench\/dashboard\/state";/);
  assert.match(html, /fetch\(STATE_URL, \{ credentials: 'same-origin', cache: 'no-store' \}\)/);
  assert.match(html, /setInterval\(refresh, 1000\)/);
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(html), 'device text is never markup');
  assert.match(html, /textContent/);
  const hostile = dashboardHtml('/x"</script><script>alert(1)</script>\u2028');
  assert.ok(!hostile.includes('</script><script>alert(1)'), 'cannot close its script');
  assert.equal(hostile.match(/<\/script>/g).length, 1, 'one script element');
  assert.match(hostile, /const STATE_URL = "\/x\\"\\u003c\/script\\u003e\\u003cscript\\u003ealert\(1\)\\u003c\/script\\u003e\\u2028";/);
  // The page's own policy allows exactly its script.
  const script = /<script>([\s\S]*)<\/script>/.exec(html)[1];
  const hash = createHash('sha256').update(script, 'utf8').digest('base64');
  assert.match(html, new RegExp(`script-src 'sha256-${hash.replace(/[+/=]/g, (c) => `\\${c}`)}'`));
  assert.match(html, /connect-src 'self'/);
});

test('the dashboard state: nothing while Devices is off, the monitors while on, never throws', () => {
  const { registry } = registryWorld(async () => ({ code: 0, stdout: '' }));
  registry.start({ source: 'netif', label: '<img src=x onerror=alert(1)>' });
  assert.deepEqual(dashboardState(registry, () => false), { enabled: false, monitors: [] });
  const on = dashboardState(registry, () => true);
  assert.equal(on.enabled, true);
  assert.equal(on.monitors.length, 1);
  assert.equal(on.monitors[0].label, '<img src=x onerror=alert(1)>', 'kept as text; the page shows it with textContent');
  assert.deepEqual(dashboardState({ state: () => { throw new Error('x'); } }, () => true), { enabled: true, monitors: [] });
  assert.deepEqual(dashboardState(registry, () => { throw new Error('x'); }), { enabled: false, monitors: [] });
  registry.stopAll();
});

test('requirementRows: every program any Devices tool uses, found or missing with its install command', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bench-plus-req-'));
  try {
    const bench = join(root, 'bench');
    mkdirSync(join(bench, 'bin'), { recursive: true });
    writeFileSync(join(bench, 'bin', 'moria'), '#!/bin/sh\n');
    chmodSync(join(bench, 'bin', 'moria'), 0o755);
    const missing = new Set(['nmap', 'tshark', 'moria', 'hid-capture', 'python3']);
    const rows = await requirementRows({ benchFolder: () => bench, find: async (id) => (missing.has(id) ? '' : `/fake/bin/${id}`) });
    const by = Object.fromEntries(rows.map((row) => [row.name, row]));
    for (const old of ['esptool', 'adb', 'fastboot', 'ssh', 'system_profiler', 'ioreg', 'stty', 'dns-sd', 'pmset', 'hidutil', 'netstat', 'lsof', 'tcpdump']) assert.ok(by[old], `${old} is listed`);
    for (const plus of ['idevice_id', 'ideviceinfo', 'idevicepair', 'avrdude', 'picotool', 'st-info', 'st-flash', 'openocd', 'JLinkExe', 'nmap', 'tshark', 'lsusb', 'ftdi_eeprom', 'pcsc_scan', 'scriptor', 'nfc-list', 'nfc-poll', 'nfc-scan-device', 'nfc-mfclassic', 'nfc-mfultralight', 'python3', 'moria', 'usb-rea', 'hid-capture', 'cat']) assert.ok(by[plus], `${plus} is listed`);
    assert.equal(rows.length, Object.keys(PLUS_PROGRAMS).length);
    assert.deepEqual(by.nmap, { name: 'nmap', used: 'bench_net_scan', builtIn: false, found: false, path: null, install: 'brew install nmap' });
    assert.deepEqual(by.ioreg, { name: 'ioreg', used: by.ioreg.used, builtIn: true, found: true, path: '/fake/bin/ioreg', install: null });
    assert.equal(by.moria.found, true, 'a helper in the Devices folder\'s bin counts');
    assert.equal(by.moria.path, join(bench, 'bin', 'moria'));
    assert.match(by['hid-capture'].install, /swiftc -O ".*lib\/plus\/hid-capture\.swift" -o ".*bench"\/bin\/hid-capture/);
    assert.match(by.python3.install, /venv.*pip install pyvisa pyvisa-py pyusb/);
    const text = formatRequirements(rows);
    assert.match(text, new RegExp(`^Ready \\(${rows.length - 4}\\):`));
    assert.match(text, /Missing \(4\):[\s\S]*- nmap, for bench_net_scan\n {4}install: brew install nmap/);
    assert.match(text, /Devices never installs anything\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findPlus: the fixed places, only a file that may be run, then the user\'s PATH (not for helpers kept out of it)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bench-plus-find-'));
  try {
    const here = join(root, 'bin');
    const path = join(root, 'path');
    mkdirSync(here, { recursive: true });
    mkdirSync(path, { recursive: true });
    writeFileSync(join(here, 'nmap'), '#!/bin/sh\n');
    chmodSync(join(here, 'nmap'), 0o755);
    writeFileSync(join(here, 'tshark'), 'not runnable');
    chmodSync(join(here, 'tshark'), 0o644);
    mkdirSync(join(here, 'picotool'));
    writeFileSync(join(path, 'avrdude'), '#!/bin/sh\n');
    chmodSync(join(path, 'avrdude'), 0o755);
    writeFileSync(join(path, 'hid-capture'), '#!/bin/sh\n');
    chmodSync(join(path, 'hid-capture'), 0o755);
    assert.equal(await findPlus('nmap', { places: [here] }), join(here, 'nmap'));
    assert.equal(await findPlus('tshark', { places: [here] }), '', 'not executable');
    assert.equal(await findPlus('picotool', { places: [here] }), '', 'a folder is not a program');
    assert.equal(await findPlus('no-such-program'), '');
    const pathFolders = async () => [path];
    assert.equal(await findPlus('avrdude', { pathFolders, benchFolder: join(root, 'bench') }), join(path, 'avrdude'), 'found on the PATH');
    assert.equal(await findPlus('hid-capture', { pathFolders, benchFolder: join(root, 'bench') }), '', 'the helper is never taken from the PATH');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the install texts for Settings and the Swift helper\'s build line', () => {
  for (const key of ['brew', 'capture', 'pyvisa', 'moria', 'usbRea', 'hidCapture', 'jlink', 'never']) assert.equal(typeof INSTALL_TEXT[key], 'string', key);
  assert.match(INSTALL_TEXT.brew, /^brew install libimobiledevice avrdude picotool stlink open-ocd nmap wireshark usbutils libftdi libnfc pcsc-tools esptool/);
  assert.match(INSTALL_TEXT.capture, /ChmodBPF/);
  assert.match(INSTALL_TEXT.moria, /cmake -S moria -B moria\/build -DCMAKE_BUILD_TYPE=Release/);
  assert.match(INSTALL_TEXT.usbRea, /pipx install usb-rea/);
  assert.match(INSTALL_TEXT.hidCapture, /swiftc -O ".*\/lib\/plus\/hid-capture\.swift" -o ~\/\.dsh\/bench\/bin\/hid-capture -framework IOKit -framework Foundation/);
  assert.match(INSTALL_TEXT.jlink, /SEGGER/);
  assert.match(INSTALL_TEXT.never, /Devices never installs anything/);
  const swift = readFileSync(new URL('../lib/plus/hid-capture.swift', import.meta.url), 'utf8');
  assert.match(swift, /^\/\/ {3}swiftc -O "<this file>" -o ~\/\.dsh\/bench\/bin\/hid-capture -framework IOKit -framework Foundation$/m);
  assert.match(swift, /IOHIDManagerRegisterInputValueCallback/);
});

test('the decoders: NDEF records (Wi-Fi keys never shown), MIFARE data blocks, HID descriptors, netstat, lsof, USB lists, OBD lines, a Mac without a battery', async () => {
  const { parseNdef, ndefInTlv, classicData } = await import('../lib/plus/tools-lab.js');
  const { decodeDescriptor } = await import('../lib/plus/hidwatch.js');
  const { parseNetstat, parseLsof, parseProcNetDev } = await import('../lib/plus/netflow.js');
  const { parseProfiler, parseIoregUsb, parseLsusb, portsFor } = await import('../lib/plus/usbinfo.js');
  const { parseLine, parseDump } = await import('../lib/plus/obd.js');
  const { parseBattery, capacityOf } = await import('../lib/plus/tools-usb.js');
  // A text record, a URI record and a Wi-Fi record (SSID "Home", key "hunter22") in one message.
  const text = Buffer.concat([Buffer.from([0x91, 0x01, 0x08]), Buffer.from('T'), Buffer.from([0x02]), Buffer.from('enhello')]);
  const uri = Buffer.concat([Buffer.from([0x11, 0x01, 0x05]), Buffer.from('U'), Buffer.from([0x03]), Buffer.from('a.io')]);
  const wsc = Buffer.from('100e001a' + '10450004' + Buffer.from('Home').toString('hex') + '10270008' + Buffer.from('hunter22').toString('hex') + '100f00020001', 'hex');
  const wifi = Buffer.concat([Buffer.from([0x52, 23, wsc.length]), Buffer.from('application/vnd.wfa.wsc'), wsc]);
  const records = parseNdef(Buffer.concat([text, uri, wifi]));
  assert.deepEqual(records, ['text (en) "hello"', 'address http://a.io', 'Wi-Fi settings for network "Home" (the network key is not shown)']);
  assert.ok(!records.join(' ').includes('hunter22'));
  // A MIFARE Classic 1K dump: the NDEF TLV in sector 1, the trailers (with keys) left out.
  const classic = Buffer.alloc(1024);
  const tlv = Buffer.concat([Buffer.from([0x03, uri.length]), Buffer.from([0xd1]), uri.subarray(1), Buffer.from([0xfe])]);
  tlv.copy(classic, 4 * 16);
  Buffer.from('FFFFFFFFFFFF', 'hex').copy(classic, 7 * 16);
  assert.equal(classicData(classic).length, 15 * 3 * 16);
  assert.deepEqual(parseNdef(ndefInTlv(classicData(classic))), ['address http://a.io']);
  assert.equal(ndefInTlv(Buffer.from([0x00, 0x01, 0x03, 0xaa, 0xbb, 0xcc, 0xfe])), null, 'no NDEF TLV');
  // A mouse descriptor: a signed logical minimum, nested collections.
  const mouse = decodeDescriptor('05010902a1010901a10005091901290315002501950375018102c0c0');
  assert.deepEqual(mouse.lines.slice(0, 4), ['Usage Page (Generic Desktop)', 'Usage (Mouse)', 'Collection (Application)', '  Usage (Pointer)']);
  assert.ok(mouse.lines.includes('    Input (Data,Variable,Absolute)'));
  assert.ok(decodeDescriptor('1581').lines.includes('Logical Minimum (-127)'));
  // netstat rows with and without a hardware address, a down interface; lsof; /proc/net/dev.
  assert.deepEqual(parseNetstat('Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll\nlo0 16384 <Link#1> 10 0 500 10 0 600 0\nen5* 1500 <Link#9> aa:bb:cc:00:11:22 1 0 70 2 0 80 0\nen0 1500 192.168.1 192.168.1.2 1 - 9 1 - 9 -\n'), { lo0: { rx: 500, tx: 600 }, en5: { rx: 70, tx: 80 } });
  assert.deepEqual(parseLsof('COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nMy\\x20App 9 me 3u IPv6 0x1 0t0 TCP [fe80::1]:5000->[fe80::2]:6000 (ESTABLISHED)\n'), [{ process: 'My App', pid: '9', local: '[fe80::1]:5000', remote: '[fe80::2]:6000' }]);
  assert.deepEqual(parseProcNetDev('Inter-| Receive\n face |bytes\n  eth0: 10 0 0 0 0 0 0 0 20 0 0 0 0 0 0 0\nbad line\n'), { eth0: { rx: 10, tx: 20 } });
  // USB lists: older system_profiler names, ioreg duplicates, lsusb with a serial.
  const older = parseProfiler(JSON.stringify({ SPUSBDataType: [{ _name: 'USB31Bus', _items: [{ _name: 'FT232R USB UART', vendor_id: '0x0403  (Future Technology Devices International Limited)', product_id: '0x6001', serial_num: 'A50285BI', manufacturer: 'FTDI', location_id: '0x01100000 / 1' }] }] }));
  assert.equal(older.length, 1);
  assert.equal(older[0].vid, 0x0403);
  assert.equal(older[0].serial, 'A50285BI');
  const twice = '+-o A@01100000  <class IOUSBHostDevice, id 1>\n  {\n    "idVendor" = 1027\n    "idProduct" = 24577\n    "locationID" = 17825792\n  }\n  +-o A@01100000  <class IOUSBHostDevice, id 1>\n    {\n      "idVendor" = 1027\n      "idProduct" = 24577\n      "locationID" = 17825792\n    }\n';
  assert.equal(parseIoregUsb(twice).length, 1);
  assert.deepEqual(parseLsusb('Bus 020 Device 003: ID 0403:6001 FTDI FT232R USB UART  Serial: A50285BI\n')[0].serial, 'A50285BI');
  assert.deepEqual(portsFor({ serial: 'A50285BI' }, ['/dev/cu.usbserial-A50285BI', '/dev/cu.usbserial-1420']), ['/dev/cu.usbserial-A50285BI']);
  // OBD: answers with or without spaces, adapter notes.
  assert.deepEqual(parseLine('410C1AF8'), { pid: '010C', bytes: [0x1a, 0xf8] });
  assert.equal(parseLine('7E8 03 41 0C'), null, 'a header line is not taken for data');
  assert.deepEqual(parseDump('UNABLE TO CONNECT\r>').notes, ['UNABLE TO CONNECT']);
  // A desktop Mac lists no battery; an Intel Mac keeps capacities in mAh.
  assert.deepEqual(parseBattery(''), {});
  assert.deepEqual(capacityOf(parseBattery('  "MaxCapacity" = 5200\n  "CurrentCapacity" = 2600\n  "DesignCapacity" = 6000\n')), { design: 6000, full: 5200, now: 2600, percent: 50, health: 86.7 });
});
