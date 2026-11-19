/**
 * lib/plus: what the model sends is checked before anything runs. Values that would read as options,
 * internet targets for nmap, capture and SSH, closed files (backups, ~/.ssh, /etc, links, too large), bad
 * ports, speeds and addresses are refused with nothing run; the instrument script is constant and gets
 * the resource and command only as arguments; device output is masked and cut; a missing program is
 * named with its install command. All programs are stand-ins.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPlusTools, createRegistry, maskSecrets } from '../lib/plus/index.js';
import { PYVISA_SCRIPT, resourceOf } from '../lib/plus/tools-lab.js';
import { checkFile } from '../lib/plus/core.js';
import { lanAddress, lanTarget, sshHost } from '../lib/plus/net.js';

function world(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bench-plus-safety-'));
  const bench = join(root, 'bench');
  const home = join(root, 'home');
  mkdirSync(bench, { recursive: true });
  mkdirSync(home, { recursive: true });
  const calls = [];
  const state = { risky: options.risky ?? true, missing: new Set(options.missing ?? []), reply: {}, dns: { 'printer.local': '192.168.1.40', 'evil.local': '93.184.216.34' } };
  const deps = {
    enabled: () => true,
    risky: () => state.risky,
    benchFolder: () => bench,
    home: () => home,
    find: async (id) => (state.missing.has(id) ? '' : `/fake/bin/${id}`),
    run: async (file, args, opts = {}) => {
      const program = file.split('/').pop();
      calls.push({ program, args: [...args], options: opts });
      const handler = state.reply[program];
      return { code: 0, stdout: '', stderr: '', timedOut: false, ...((typeof handler === 'function' ? await handler(args, opts) : handler) ?? {}) };
    },
    origin: () => '',
    now: () => Date.UTC(2026, 10, 17, 10, 20, 30),
    sleep: async () => {},
    lookup: async (name) => [{ address: state.dns[name] ?? '192.168.1.99', family: 4 }],
    fs: { readdirSync: () => [], openSync: () => { throw new Error('a port was opened'); }, writeSync: () => 0, closeSync: () => {} },
  };
  // OpenOCD's scripts folder, next to a stand-in openocd; a registry whose timers never start.
  const scripts = join(root, 'oc', 'share', 'openocd', 'scripts');
  for (const cfg of ['interface/stlink.cfg', 'target/stm32f1x.cfg']) {
    mkdirSync(join(scripts, cfg, '..'), { recursive: true });
    writeFileSync(join(scripts, cfg), '# stand-in\n');
  }
  const find = deps.find;
  deps.find = async (id) => (id === 'openocd' ? join(root, 'oc', 'bin', 'openocd') : find(id));
  deps.registry = createRegistry({ ...deps, timers: { setInterval: () => ({}), clearInterval: () => {}, setTimeout: () => ({}), clearTimeout: () => {} } });
  const tools = buildPlusTools(deps);
  const call = async (name, args) => (await tools.find((tool) => tool.name === name).execute(args, {})).text;
  const file = (path, bytes = Buffer.alloc(32, 7)) => {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, bytes);
    return path;
  };
  return { root, bench, home, calls, state, deps, call, file, close: () => rmSync(root, { recursive: true, force: true }) };
}

const refusedNothingRan = async (app, name, args, pattern) => {
  app.calls.length = 0;
  const answer = await app.call(name, args);
  assert.match(answer, /^It did not work: /, `${name} ${JSON.stringify(args)} is refused: ${answer}`);
  if (pattern) assert.match(answer, pattern, `${name}: ${answer}`);
  assert.equal(app.calls.length, 0, `${name} ${JSON.stringify(args)}: nothing ran (${JSON.stringify(app.calls)})`);
  return answer;
};

test('a value that starts with "-" never reaches a program', async () => {
  const app = world();
  try {
    const hex = app.file(join(app.root, 'fw', 'a.hex'), ':00000001FF\n');
    await refusedNothingRan(app, 'bench_arduino', { action: 'info', part: '-Uflash:w:x', programmer: 'usbasp' });
    await refusedNothingRan(app, 'bench_arduino', { action: 'flash-hex', part: 'm328p', programmer: '-x', file: hex });
    await refusedNothingRan(app, 'bench_jlink', { action: 'connect', device: '-CommanderScript' }, /starts with "-"/);
    await refusedNothingRan(app, 'bench_openocd', { action: 'info', adapter: '-c', target: 'stm32f1x' });
    await refusedNothingRan(app, 'bench_net_scan', { action: 'discover', target: '-iL/etc/passwd' }, /starts with "-"/);
    await refusedNothingRan(app, 'bench_netprobe', { action: 'capture', interface: 'en0', target: '192.168.1.5', filter: '-w /tmp/x' }, /starts with "-"/);
    await refusedNothingRan(app, 'bench_netprobe', { action: 'capture', interface: '-en0', target: '192.168.1.5' });
    await refusedNothingRan(app, 'bench_ios', { action: 'info', udid: '-u' });
    await refusedNothingRan(app, 'bench_smartcard', { action: 'apdu', reader: '-r', apdu: '00a4040000' });
    await refusedNothingRan(app, 'bench_usb_tmc', { action: 'configure', resource: 'USB0::0x1AB1::0x04CE::DS1::INSTR', command: '-x' });
    await refusedNothingRan(app, 'bench_usb_tmc', { action: 'query', resource: '-USB0::INSTR', command: '*IDN?' });
    await refusedNothingRan(app, 'bench_serial_send', { action: 'send', port: '/dev/cu.usbserial-1', command: '-reset' });
    await refusedNothingRan(app, 'bench_net_flow', { action: 'router', host: '-oProxyCommand=sh' });
    await refusedNothingRan(app, 'bench_monitor', { action: 'start', source: 'netif', iface: '-en0' });
  } finally {
    app.close();
  }
});

test('network tools reach private addresses only: nmap, capture, SSH and LAN instruments', async () => {
  const app = world();
  try {
    for (const target of ['8.8.8.8', 'example.com', '192.169.1.1', '172.32.0.1', '127.0.0.1', 'localhost', '1234', '0x7f000001', '010.0.0.1', '2001:db8::1', '192.168.1.0/16', '10.0.0.0/8']) {
      await refusedNothingRan(app, 'bench_net_scan', { action: 'port-scan', target });
    }
    await refusedNothingRan(app, 'bench_net_scan', { action: 'port-scan', target: '192.168.0.0/16' }, /too large/);
    await refusedNothingRan(app, 'bench_net_scan', { action: 'discover', target: 'evil.local' }, /points to 93\.184\.216\.34, which is not a private address/);
    await refusedNothingRan(app, 'bench_net_scan', { action: 'port-scan', target: '192.168.1.10', ports: '22;rm' });
    await refusedNothingRan(app, 'bench_net_scan', { action: 'port-scan', target: '192.168.1.10', ports: '0-70000' });
    await refusedNothingRan(app, 'bench_netprobe', { action: 'capture', interface: 'en0', target: '1.1.1.1' });
    await refusedNothingRan(app, 'bench_netprobe', { action: 'capture', interface: 'en0', target: '192.168.1.5', filter: 'host 1.1.1.1; reboot' }, /A filter may hold only/);
    await refusedNothingRan(app, 'bench_net_flow', { action: 'router', host: 'root@8.8.8.8' }, /not a private/);
    await refusedNothingRan(app, 'bench_net_flow', { action: 'router', host: 'root@router.example.com' }, /not a private/);
    await refusedNothingRan(app, 'bench_usb_tmc', { action: 'identify', resource: 'TCPIP0::8.8.8.8::inst0::INSTR' }, /local network only/);
    // The allowed ones run, with the address (a name is resolved and checked first).
    app.calls.length = 0;
    await app.call('bench_net_scan', { action: 'discover', target: '192.168.1.0/24' });
    await app.call('bench_net_scan', { action: 'port-scan', target: 'printer.local', ports: '22,80,443' });
    await app.call('bench_net_scan', { action: 'service-detect', target: '10.1.2.3' });
    await app.call('bench_net_scan', { action: 'quick-scan', target: '192.168.1.10-50' });
    await app.call('bench_net_scan', { action: 'discover', target: 'fe80::1%en0' });
    assert.deepEqual(app.calls.map((entry) => entry.args), [
      ['-sn', '192.168.1.0/24'],
      ['-sT', '-p', '22,80,443', '192.168.1.40'],
      ['-sT', '-sV', '10.1.2.3'],
      ['-sT', '-T4', '-p', app.calls[3].args[3], '192.168.1.10-50'],
      ['-6', '-sn', 'fe80::1%en0'],
    ]);
    assert.ok(app.calls.every((entry) => !entry.args.some((arg) => /^--script|^-sC$|^-O$|^-A$/.test(arg))), 'no NSE scripts, no -O, no -A');
    assert.match(await app.call('bench_net_scan', { action: 'os-detect', target: '192.168.1.10' }), /needs root, and Devices never runs anything as root, so nothing was run/);
    assert.equal(app.calls.length, 5);
    // The address rules themselves.
    for (const good of ['10.0.0.1', '172.16.5.4', '172.31.255.255', '192.168.8.1', '169.254.1.1', '100.64.0.1', 'fd00::1', 'fe80::1', 'nas.local', 'router.lan', 'box.home', 'srv.internal', 'raspberrypi']) assert.ok(lanAddress(good), good);
    for (const bad of ['100.128.0.1', '172.15.0.1', '11.0.0.1', '2600::1', 'nas.example', 'a b', '']) assert.ok(!lanAddress(bad), bad);
    assert.equal(sshHost('root@192.168.8.1'), 'root@192.168.8.1');
    assert.throws(() => sshHost('root@1.2.3.4'), /not a private/);
    assert.throws(() => sshHost('-oProxyCommand=x@192.168.1.1'), /not user@address/);
    assert.throws(() => lanTarget('192.168.1.1/24'), /not the start of its network/);
  } finally {
    app.close();
  }
});

test('files: a full path to a plain file, never a link, the Devices folder\'s backups, ~/.ssh, /etc or /dev, and capped', async () => {
  const app = world();
  try {
    const good = app.file(join(app.root, 'work', 'fw.bin'));
    const backup = app.file(join(app.bench, 'devices', 'esp32-board-1', 'backups', 'flash-1.bin'));
    const key = app.file(join(app.home, '.ssh', 'id_ed25519'), 'secret');
    const keychain = app.file(join(app.home, 'Library', 'Keychains', 'login.keychain-db'), 'x');
    const link = join(app.root, 'work', 'link.bin');
    symlinkSync(good, link);
    const big = join(app.root, 'work', 'big.bin');
    writeFileSync(big, '');
    truncateSync(big, 65 * 1024 * 1024);
    const analyze = (file) => refusedNothingRan(app, 'bench_firmware_analyze', { action: 'analyze', file });
    await analyze(backup).then((text) => assert.match(text, /backups can hold Wi-Fi and other keys/));
    await analyze(key).then((text) => assert.match(text, /does not read files in .*\.ssh/));
    await analyze(keychain);
    await analyze('/etc/hosts').then((text) => assert.match(text, /does not read files in \/(?:private\/)?etc/));
    await analyze('/dev/null');
    await analyze(link).then((text) => assert.match(text, /is a link/));
    await analyze(big).then((text) => assert.match(text, /at most 64 MB/));
    await analyze('fw.bin').then((text) => assert.match(text, /full path/));
    await analyze(join(app.root, 'work', 'missing.bin')).then((text) => assert.match(text, /There is no file/));
    await analyze(join(app.root, 'work')).then((text) => assert.match(text, /not a plain file/));
    // The same rules for every tool that takes a file, before any program runs.
    await refusedNothingRan(app, 'bench_stm32', { action: 'write', file: backup });
    await refusedNothingRan(app, 'bench_rp2040', { action: 'flash-uf2', file: link });
    await refusedNothingRan(app, 'bench_firmware_extract', { action: 'extract', file: key });
    await refusedNothingRan(app, 'bench_netprobe', { action: 'analyze', file: backup });
    await refusedNothingRan(app, 'bench_usb_protocol', { action: 'report', file: good }, /not a \.pcap, \.pcapng file/);
    await refusedNothingRan(app, 'bench_arduino', { action: 'flash-bin', part: 'm328p', programmer: 'usbasp', file: app.file(join(app.root, 'odd:name.bin')) }, /holds ":"/);
    await refusedNothingRan(app, 'bench_openocd', { action: 'flash', adapter: 'stlink', target: 'stm32f1x', file: app.file(join(app.root, 'x[exec rm].elf')) }, /may hold only/);
    // A plain file is read.
    assert.match(await app.call('bench_firmware_analyze', { action: 'header', file: good }), /^The first 256 bytes of .*\n000000  07 07 07/);
    assert.equal(checkFile(app.deps, good, { maxBytes: 1024 }).size, 32);
    assert.throws(() => checkFile(app.deps, good, { maxBytes: 16 }), /at most/);
  } finally {
    app.close();
  }
});

test('ports, speeds, hexadecimal addresses, counts and names are checked', async () => {
  const app = world();
  try {
    for (const port of ['/dev/disk0', '/dev/cu.x;rm -rf ~', '/dev/cu.', 'COM3', '/dev/cu.usbserial/../../etc/passwd']) {
      await refusedNothingRan(app, 'bench_obd', { action: 'read', port }, /not a serial port/);
      await refusedNothingRan(app, 'bench_monitor', { action: 'start', source: 'serial', port });
    }
    await refusedNothingRan(app, 'bench_serial_send', { action: 'send', port: '/dev/cu.usbserial-1', baud: 12345, command: 'AT' }, /not one Devices uses/);
    await refusedNothingRan(app, 'bench_ch340', { action: 'baud-test', port: '/dev/cu.wchusbserial1420', baud: 74880 }, /not one Devices uses/);
    for (const address of ['0x123456789', '08000000', 'abc', '0x', '0x8000000;reset']) await refusedNothingRan(app, 'bench_stm32', { action: 'read', address, size: 16 }, /hexadecimal/);
    await refusedNothingRan(app, 'bench_stm32', { action: 'read', size: 0 });
    await refusedNothingRan(app, 'bench_stm32', { action: 'read', size: 99_999_999 });
    await refusedNothingRan(app, 'bench_jlink', { action: 'memory-read', device: 'STM32F103C8', count: 100_000 });
    await refusedNothingRan(app, 'bench_jlink', { action: 'memory-read', device: 'STM32 F1; exit' });
    await refusedNothingRan(app, 'bench_openocd', { action: 'read-memory', adapter: '../../etc/x', target: 'stm32f1x', address: '0x0' });
    await refusedNothingRan(app, 'bench_arduino', { action: 'info', part: 'auto', programmer: 'arduino', port: '/dev/cu.usbmodem1' });
    await refusedNothingRan(app, 'bench_arduino', { action: 'info', programmer: 'arduino', port: '/dev/cu.usbmodem1' }, /never guesses/);
    await refusedNothingRan(app, 'bench_arduino', { action: 'info', part: 'm328p', programmer: 'arduino' }, /give port/);
    await refusedNothingRan(app, 'bench_smartcard', { action: 'apdu', apdu: '00 A4 zz' }, /hexadecimal/);
    await refusedNothingRan(app, 'bench_ios', { action: 'info', udid: '1234' }, /not a device UDID/);
    await refusedNothingRan(app, 'bench_hid', { action: 'match', vendorId: '0x12345' });
    await refusedNothingRan(app, 'bench_usb_protocol', { action: 'lookup', vidpid: '1e71:170e;ls' });
  } finally {
    app.close();
  }
});

test('bench_usb_tmc: the Python source is constant; the resource and command reach it only as arguments', async () => {
  const app = world();
  try {
    const resource = 'USB0::0x1AB1::0x04CE::DS1ZA123456::INSTR';
    app.state.reply.python3 = { stdout: 'RIGOL TECHNOLOGIES,DS1054Z,DS1ZA123456,00.04.04\n' };
    assert.match(await app.call('bench_usb_tmc', { action: 'query', resource, command: 'MEAS:VOLT:DC? CHAN1' }), /RIGOL TECHNOLOGIES/);
    await app.call('bench_usb_tmc', { action: 'identify', resource: 'TCPIP0::192.168.1.20::inst0::INSTR', timeoutMs: 2000 });
    await app.call('bench_usb_tmc', { action: 'list' });
    const [query, identify, list] = app.calls;
    assert.deepEqual(query.args, ['-c', PYVISA_SCRIPT, 'query', resource, 'MEAS:VOLT:DC? CHAN1', '5000']);
    assert.deepEqual(identify.args, ['-c', PYVISA_SCRIPT, 'query', 'TCPIP0::192.168.1.20::inst0::INSTR', '*IDN?', '2000']);
    assert.deepEqual(list.args, ['-c', PYVISA_SCRIPT, 'list']);
    for (const entry of app.calls) assert.equal(entry.args[1], PYVISA_SCRIPT, 'the same script every time');
    assert.ok(!PYVISA_SCRIPT.includes('DS1ZA') && !PYVISA_SCRIPT.includes('MEAS'), 'no value is in the source');
    assert.match(PYVISA_SCRIPT, /sys\.argv\[2\]/);
    assert.match(PYVISA_SCRIPT, /ResourceManager\('@py'\)/);
    // A query must only read; anything else goes through configure.
    await refusedNothingRan(app, 'bench_usb_tmc', { action: 'query', resource, command: '*RST' }, /ends with "\?"/);
    await refusedNothingRan(app, 'bench_usb_tmc', { action: 'query', resource, command: '*RST;*IDN?' }, /ends with "\?"/);
    await refusedNothingRan(app, 'bench_usb_tmc', { action: 'query', resource, command: '*IDN?\nSYST:REM' });
    // A resource that tries to become code is not a resource.
    for (const bad of ['USB0::0x1::0x2::X"); import os; os.system("id")#::INSTR', "GPIB0::1::INSTR'", 'USB0::0x1AB1::0x04CE::A B::INSTR']) {
      assert.throws(() => resourceOf(bad), /not a VISA resource/);
      await refusedNothingRan(app, 'bench_usb_tmc', { action: 'identify', resource: bad });
    }
    // PyVISA missing: the install steps, nothing installed.
    app.state.reply.python3 = { code: 3, stdout: 'BENCH_NO_PYVISA ModuleNotFoundError\n' };
    assert.match(await app.call('bench_usb_tmc', { action: 'list' }), /PyVISA is not installed .*pip install pyvisa pyvisa-py pyusb.*Devices never installs anything/);
  } finally {
    app.close();
  }
});

test('device output is cleaned, masked and cut; a missing program is named with its install command', async () => {
  const app = world();
  try {
    app.state.reply.ideviceinfo = { stdout: `DeviceName: Sam's\u202e iPhone\nWiFiPassword: hunter22\nwifi_psk=abc123\n-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----\n${'X'.repeat(20_000)}\n` };
    const answer = await app.call('bench_ios', { action: 'info' });
    assert.ok(!answer.includes('hunter22') && !answer.includes('abc123') && !answer.includes('MIIEow'), 'secrets masked');
    assert.match(answer, /WiFiPassword: \[masked\]/);
    assert.match(answer, /\[masked private key\]/);
    assert.ok(!answer.includes('\u202e'), 'direction characters removed');
    assert.ok(answer.length < 8300, `cut to about 8,000 (${answer.length})`);
    assert.equal(maskSecrets('ap_psk: s3cret, token=abc, bypass: 1, adminPass="x y", DevicePublicKey: AAAA'), 'ap_psk: [masked], token=[masked], bypass: 1, adminPass=[masked], DevicePublicKey: AAAA');

    const missing = world({ missing: ['avrdude', 'nmap', 'hid-capture', 'tshark', 'tcpdump'] });
    try {
      assert.equal(await missing.call('bench_arduino', { action: 'info', part: 'm328p', programmer: 'usbasp' }), 'avrdude is not on this Mac (Devices uses it for bench_arduino). Install it yourself in Terminal: brew install avrdude. Devices never installs anything.');
      assert.match(await missing.call('bench_net_scan', { action: 'discover', target: '192.168.1.0/24' }), /Install it yourself in Terminal: brew install nmap\. Devices never installs anything\./);
      assert.match(await missing.call('bench_hid_capture', { seconds: 2 }), /swiftc -O ".*hid-capture\.swift" -o ".*bench"\/bin\/hid-capture -framework IOKit -framework Foundation\. Devices never installs anything\./);
      assert.match(await missing.call('bench_netprobe', { action: 'list-interfaces' }), /tcpdump is not on this Mac/);
      assert.equal(missing.calls.length, 0, 'nothing ran');
    } finally {
      missing.close();
    }
  } finally {
    app.close();
  }
});
