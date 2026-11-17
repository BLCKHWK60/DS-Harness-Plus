/**
 * lib/plus: each tool's reading actions on scripted programs (nothing real runs): the exact arguments
 * each program gets, what the tool makes of its output, and the files it keeps (only in the Bench
 * folder's dumps, extracted and usb-rea folders).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildPlusTools, createRegistry } from '../lib/plus/index.js';
import { LINE_ARGS } from '../lib/plus/serialio.js';

const NETSTAT = (rx, tx) => [
  'Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll',
  'lo0        16384 <Link#1>                         1000     0     100000     1000     0     100000     0',
  'lo0        16384 127           127.0.0.1          1000     -     100000     1000     -     100000     -',
  `en0        1500  <Link#11>   aa:bb:cc:dd:ee:ff   5000     0    ${rx}     4000     0    ${tx}     0`,
  'en0        1500  192.168.1     192.168.1.10       5000     -    9000000     4000     -    1000000     -',
].join('\n');
const BATTERY = `+-o AppleSmartBattery  <class AppleSmartBattery, id 0x100000a2f, registered, matched, active, busy 0 (0 ms), retain 7>
    {
      "BatteryInstalled" = Yes
      "CycleCount" = 123
      "DesignCapacity" = 4790
      "AppleRawMaxCapacity" = 4380
      "AppleRawCurrentCapacity" = 3700
      "MaxCapacity" = 100
      "CurrentCapacity" = 85
      "Temperature" = 3012
      "IsCharging" = Yes
      "ExternalConnected" = Yes
      "AdapterDetails" = {"Watts"=96,"Voltage"=20000,"Current"=4700,"Description"="pd charger"}
      "UsbHvcMenu" = ({"Index"=0,"MaxVoltage"=5000,"MaxCurrent"=3000},{"Index"=1,"MaxVoltage"=9000,"MaxCurrent"=3000},{"Index"=2,"MaxVoltage"=20000,"MaxCurrent"=4700})
    }
`;
const HID_IOREG = `+-o Magic Keyboard  <class AppleUserUSBHostHIDDevice, id 0x1000, registered, matched, active, busy 0 (1 ms), retain 9>
    {
      "Product" = "Magic Keyboard"
      "Manufacturer" = "Apple Inc."
      "VendorID" = 1452
      "ProductID" = 615
      "Transport" = "USB"
      "PrimaryUsagePage" = 1
      "PrimaryUsage" = 6
      "ReportDescriptor" = <05010906a101850175019508050719e029e7150025018102c0>
    }
    +-o IOHIDInterface  <class IOHIDInterface, id 0x1001, registered, matched, active, busy 0 (0 ms), retain 6>
        {
          "Product" = "Magic Keyboard"
          "VendorID" = 1452
        }
+-o Game Pad  <class IOHIDUserDevice, id 0x2000, registered, matched, active, busy 0 (0 ms), retain 5>
    {
      "Product" = "Game Pad"
      "VendorID" = 1118
      "ProductID" = 2835
      "Transport" = "Bluetooth"
    }
`;
const USB_IOREG = `+-o FT232R USB UART@01100000  <class IOUSBHostDevice, id 0x10000, registered, matched, active, busy 0 (12 ms), retain 22>
    {
      "idVendor" = 1027
      "idProduct" = 24577
      "USB Product Name" = "FT232R USB UART"
      "USB Vendor Name" = "FTDI"
      "USB Serial Number" = "A50285BI"
      "locationID" = 17825792
    }
`;
const HIDUTIL = [
  { 'Built-In': true, VendorID: 0, ProductID: 0, Product: 'PMU tdie14', PrimaryUsagePage: 65280, PrimaryUsage: 5, LocationID: 1 },
  { 'Built-In': false, VendorID: 1452, ProductID: 615, Product: 'Magic Keyboard', PrimaryUsagePage: 1, PrimaryUsage: 6, Transport: 'USB', LocationID: 2 },
  { 'Built-In': false, VendorID: 1452, ProductID: 615, Product: 'Magic Keyboard', PrimaryUsagePage: 1, PrimaryUsage: 6, Transport: 'USB', LocationID: 2 },
];
const LSUSB = 'Bus 001 Device 002: ID 0403:6001 Future Technology Devices International, Ltd FT232 Serial (UART) IC\nBus 001 Device 003: ID 1a86:7523 QinHeng Electronics CH340 serial converter\nBus 001 Device 001: ID 05e3:0610 Genesys Logic, Inc. Hub\n';
const PROFILER_USB = JSON.stringify({ SPUSBDataType: [], SPUSBHostDataType: [{ _name: 'USB 3.1 Bus', _items: [{ _name: 'USB2.0 Hub', USBDeviceKeyVendorID: '0x05e3', USBDeviceKeyProductID: '0x0610', _items: [{ _name: 'USB Serial', USBDeviceKeyVendorID: '0x1a86', USBDeviceKeyProductID: '0x7523', USBDeviceKeyVendorName: 'QinHeng', USBDeviceKeyLocationID: '0x14200000' }] }] }] });
const OBD_DUMP = '>ATZ\r\rELM327 v1.5\r\r>OK\r>OK\r>OK\r>OK\r>SEARCHING...\r41 00 BE 1F A8 13\r\r>41 0C 1A F8\r\r>41 0D 32\r>41 05 7B\r>41 5C 5A\r>NO DATA\r>41 04 80\r>41 11 33\r>41 2F FF\r>41 42 30 D4\r';
/** An NTAG dump: 4 pages of header, then an NDEF TLV with one URI record (https://ex.com). */
const NTAG = Buffer.concat([Buffer.from('04a23bc1d2e3f480aa48000012345678e1106d00', 'hex').subarray(0, 16), Buffer.from('030bd101075504' + Buffer.from('ex.com').toString('hex') + 'fe', 'hex'), Buffer.alloc(100)]);

function world() {
  const root = mkdtempSync(join(tmpdir(), 'bench-plus-devices-'));
  const bench = join(root, 'bench');
  mkdirSync(bench, { recursive: true });
  const calls = [];
  const writes = [];
  const counters = { netstat: 0, ssh: 0 };
  const state = { missing: new Set(), paths: {}, flashBytes: Buffer.alloc(256, 0xab) };
  const scripts = join(root, 'oc', 'share', 'openocd', 'scripts');
  for (const cfg of ['interface/stlink.cfg', 'interface/ftdi/digilent-hs1.cfg', 'target/stm32f1x.cfg', 'fpga/xilinx-xc7.cfg']) {
    mkdirSync(join(scripts, cfg, '..'), { recursive: true });
    writeFileSync(join(scripts, cfg), '# stand-in\n');
  }
  state.paths.openocd = join(root, 'oc', 'bin', 'openocd');
  const replies = {
    idevice_id: () => ({ stdout: '00008030-001A2D3C0E91802E\n' }),
    ideviceinfo: () => ({ stdout: `DeviceName: Bench iPhone\nProductType: iPhone15,2\nProductVersion: 18.1\nDevicePublicKey: ${'A'.repeat(400)}\n` }),
    avrdude: (args) => (args.includes('signature:r:-:h') ? { stdout: '0x1e,0x95,0xf\n' } : args.includes('lfuse:r:-:h') ? { stdout: '0xff\n0xde\n0xfd\n' } : { stderr: 'avrdude: Device signature = 0x1e950f (probably m328p)\n' }),
    picotool: (args) => ({ stdout: args.includes('-d') ? 'Device Information\n flash size: 2048K\n flash id: 0xE6614103E7452D2F\n' : 'Program Information\n name: blink\n' }),
    'st-info': () => ({ stdout: 'Found 1 stlink programmers\n  chipid: 0x410\n  descr: F1xx Medium-density\n' }),
    'st-flash': (args) => {
      if (args[0] === 'read') writeFileSync(args[1], state.flashBytes.subarray(0, Number.parseInt(args[3], 16)));
      return { stderr: 'st-flash 1.8.0\nINFO common.c: read done\n' };
    },
    python3: (args) => ({ stdout: args[2] === 'list' ? 'USB0::0x1AB1::0x04CE::DS1ZA123::INSTR\nASRL/dev/cu.usbserial-1::INSTR\n' : 'RIGOL TECHNOLOGIES,DS1054Z,DS1ZA123,00.04.04\n' }),
    pcsc_scan: (args) => ({ stdout: args.includes('-r') ? '0: ACS ACR122U PICC Interface 00 00\n' : 'Reader 0: ACS ACR122U PICC Interface 00 00\n  ATR: 3B 8F 80 01 80 4F 0C A0 00 00 03 06 03 00 01 00 00 00 00 6A\n' }),
    'nfc-scan-device': () => ({ stdout: '1 NFC device(s) found:\n- ACS / ACR122U PICC Interface:\n    acr122_usb:001:004\n' }),
    'nfc-poll': () => ({ stdout: 'ISO/IEC 14443A (106 kbps) target:\n    ATQA (SENS_RES): 00  44\n       UID (NFCID1): 04  a2  3b  c1  d2  e3  f4\n' }),
    'nfc-list': () => ({ stdout: '1 ISO14443A passive target(s) found:\n    UID (NFCID1): 04  a2  3b  c1\n' }),
    'nfc-mfultralight': (args) => {
      writeFileSync(args.at(-1), NTAG);
      return { stdout: 'Found MIFARE Ultralight card with UID: 04a23bc1d2e3f4\nReading 45 pages |.............................................|\nDone, 45 of 45 pages read.\n' };
    },
    tshark: (args) => {
      if (args[0] === '-D') return { stdout: '1. en0 (Wi-Fi)\n2. lo0 (Loopback)\n' };
      if (args.includes('-z')) return { stdout: 'Protocol Hierarchy Statistics\neth frames:10 bytes:1200\n  ip frames:10\n' };
      return { stdout: '    1 0.000000 192.168.1.50 → 192.168.1.1 DNS 74 Standard query\n    2 0.010000 192.168.1.1 → 192.168.1.50 DNS 90 Standard query response\n' };
    },
    nmap: () => ({ stdout: 'Nmap scan report for 192.168.1.40\nHost is up.\n22/tcp open ssh\n' }),
    lsusb: (args) => ({ stdout: args.includes('-v') ? 'Bus 001 Device 002: ID 0403:6001\nDevice Descriptor:\n  bLength 18\n' : LSUSB }),
    system_profiler: (args) => (args[0] === 'SPPowerDataType' ? { stdout: 'Power:\n    Battery Information:\n      Health Information:\n          Cycle Count: 123\n          Condition: Normal\n          Maximum Capacity: 91%\n      Serial Number: SECRETSERIAL\n' } : { stdout: PROFILER_USB }),
    ioreg: (args) => ({ stdout: args.includes('AppleSmartBattery') ? BATTERY : args.includes('IOHIDDevice') ? HID_IOREG : USB_IOREG }),
    hidutil: (args) => {
      if (args[0] !== 'list') return { stdout: `RegistryID Key Value\n0x1000 ${args.at(-1)} something\n` };
      // Like hidutil: --matching keeps the entries whose fields equal the JSON's.
      const matching = args.includes('--matching') ? JSON.parse(args[args.indexOf('--matching') + 1]) : {};
      return { stdout: HIDUTIL.filter((entry) => Object.entries(matching).every(([key, value]) => entry[key] === value)).map((entry) => JSON.stringify(entry)).join('\n') };
    },
    pmset: (args) => ({ stdout: args[1] === 'batt' ? "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1234)	85%; charging; 0:40 remaining present: true\n" : args[1] === 'adapter' ? ' Wattage = 96W\n Current = 4700mA\n Voltage = 20000mV\n' : "Now drawing from 'AC Power'\n" }),
    JLinkExe: () => ({ stdout: 'SEGGER J-Link Commander V7.94\nConnecting to J-Link via USB...O.K.\n20000000 = 00000000 11111111 22222222 33333333\n' }),
    openocd: (args) => ({ stderr: args.includes('scan_chain') ? 'Info : JTAG tap: auto0.tap tap/device found: 0x0362d093 (mfg: 0x049 (Xilinx), part: 0x362d, ver: 0x0)\n   TapName  Enabled IdCode\n 0 auto0.tap Y 0x0362d093\n' : 'Info : [stm32f1x.cpu] halted\n0x20000000: 20005000 08000145 0800014d 0800014f\n' }),
    netstat: () => {
      counters.netstat += 1;
      return { stdout: counters.netstat % 2 ? NETSTAT(9000000, 1000000) : NETSTAT(9100000, 1050000) };
    },
    ssh: (args) => {
      counters.ssh += 1;
      assert.equal(args.at(-1), 'cat /proc/net/dev', 'a fixed remote command');
      return { stdout: `Inter-|   Receive\n face |bytes packets\n br-lan: ${counters.ssh % 2 ? 1000 : 3000} 10 0 0 0 0 0 0 ${counters.ssh % 2 ? 500 : 1500} 5 0 0 0 0 0 0\n` };
    },
    lsof: () => ({ stdout: 'COMMAND   PID   USER   FD   TYPE  DEVICE SIZE/OFF NODE NAME\nSafari    123 owner    20u  IPv4 0xabc      0t0  TCP 192.168.1.10:52144->17.57.146.20:443 (ESTABLISHED)\n' }),
    moria: (args) => {
      if (args[0] === '-e') {
        const folder = args[2];
        mkdirSync(join(folder, '0x40-squashfs'), { recursive: true });
        writeFileSync(join(folder, 'manifest.json'), JSON.stringify([{ offset: 64, type: 'squashfs', path: '0x40-squashfs' }]));
        return { stdout: 'extracted 1 region\n' };
      }
      return { stdout: JSON.stringify({ findings: [{ offset: 0, type: 'uimage', confidence: 0.98, size: 64 }, { offset: 64, type: 'squashfs', confidence: 0.95 }] }) };
    },
    'usb-rea': (args) => {
      if (args[0] === 'lookup') return { stdout: 'nzxt kraken x (liquidctl kraken2.py)\n' };
      writeFileSync(args.at(-1), '# Report\nfan 100% 0x5a | counter\n');
      return { stdout: '' };
    },
    ftdi_eeprom: (args) => {
      const config = readFileSync(args.at(-1), 'utf8');
      const target = /filename="([^"]+)"/.exec(config)[1];
      writeFileSync(target, Buffer.concat([Buffer.from('0040036001600000', 'hex'), Buffer.from('FTDI FT232R USB UART', 'latin1'), Buffer.alloc(100)]));
      return { stdout: 'FTDI read eeprom: 0\nEEPROM size: 128\n', config };
    },
    'hid-capture': () => ({ stdout: '{"page":7,"usage":4,"value":1}\n{"page":7,"usage":4,"value":0}\n{"page":1,"usage":48,"value":-3}\n' }),
    cat: () => ({ stdout: state.catOut ?? '' }),
  };
  const run = async (file, args, options = {}) => {
    const program = file.split('/').pop();
    const answer = replies[program] ? await replies[program](args, options) : {};
    calls.push({ file, program, args: [...args], options, config: answer?.config });
    return { code: 0, stdout: '', stderr: '', timedOut: false, ...answer };
  };
  const deps = {
    enabled: () => true,
    risky: () => false,
    benchFolder: () => bench,
    home: () => join(root, 'home'),
    find: async (id) => (state.missing.has(id) ? '' : state.paths[id] ?? `/fake/bin/${id}`),
    run,
    origin: () => 'http://127.0.0.1:4321',
    now: () => Date.UTC(2026, 10, 17, 10, 20, 30),
    sleep: async () => {},
    lookup: async () => [{ address: '192.168.1.40', family: 4 }],
    fs: {
      readdirSync: () => ['cu.usbserial-A50285BI', 'cu.usbserial-1420', 'cu.Bluetooth-Incoming-Port', 'tty.usbserial-A50285BI'],
      openSync: (path) => { writes.push({ open: path }); return 7; },
      writeSync: (_fd, buffer, offset, length) => { writes.push({ data: Buffer.from(buffer).subarray(offset, offset + length).toString('latin1') }); return length; },
      closeSync: () => {},
    },
  };
  deps.registry = createRegistry({ ...deps, timers: { setInterval: () => ({ unref() {} }), clearInterval: () => {}, setTimeout: () => ({ unref() {} }), clearTimeout: () => {} } });
  const tools = buildPlusTools(deps);
  const call = async (name, args) => (await tools.find((tool) => tool.name === name).execute(args, {})).text;
  const argsOf = (program) => calls.filter((entry) => entry.program === program).map((entry) => entry.args);
  const file = (name, bytes) => {
    mkdirSync(join(root, 'files'), { recursive: true });
    writeFileSync(join(root, 'files', name), bytes);
    return join(root, 'files', name);
  };
  return { root, bench, calls, writes, state, deps, call, argsOf, file, scripts, close: () => rmSync(root, { recursive: true, force: true }) };
}
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('bench_ios, bench_arduino, bench_rp2040: reading actions and their arguments', async () => {
  const app = world();
  try {
    assert.match(await app.call('bench_ios', { action: 'list' }), /Connected iPhone\/iPad \(1\), by UDID:\n- 00008030-001A2D3C0E91802E/);
    const info = await app.call('bench_ios', { action: 'info', udid: '00008030-001A2D3C0E91802E' });
    assert.match(info, /ProductVersion: 18\.1/);
    assert.match(info, /DevicePublicKey: \[400 characters, not shown\]/);
    assert.deepEqual(app.argsOf('idevice_id'), [['-l']]);
    assert.deepEqual(app.argsOf('ideviceinfo'), [['-u', '00008030-001A2D3C0E91802E']]);

    const board = { part: 'm328p', programmer: 'arduino', port: '/dev/cu.usbserial-1420', baud: 57600 };
    const base = ['-p', 'm328p', '-c', 'arduino', '-P', '/dev/cu.usbserial-1420', '-b', '57600'];
    assert.match(await app.call('bench_arduino', { action: 'info', ...board }), /Device signature = 0x1e950f/);
    assert.match(await app.call('bench_arduino', { action: 'read-signature', ...board }), /Signature: 0x1e 0x95 0x0f \(ATmega328P\)/);
    assert.match(await app.call('bench_arduino', { action: 'read-fuses', ...board }), /Fuses: low 0xff, high 0xde, extended 0xfd/);
    const hex = app.file('blink.hex', ':00000001FF\n');
    assert.match(await app.call('bench_arduino', { action: 'verify', ...board, file: hex }), /The chip's flash matches blink\.hex/);
    assert.deepEqual(app.argsOf('avrdude'), [[...base, '-v'], [...base, '-U', 'signature:r:-:h'], [...base, '-U', 'lfuse:r:-:h', '-U', 'hfuse:r:-:h', '-U', 'efuse:r:-:h'], [...base, '-U', `flash:v:${hex}:i`]]);

    assert.match(await app.call('bench_rp2040', { action: 'info' }), /Program Information/);
    assert.match(await app.call('bench_rp2040', { action: 'read-id' }), /flash id: 0xE6614103E7452D2F/);
    assert.deepEqual(app.argsOf('picotool'), [['info', '-a'], ['info', '-d']]);
  } finally {
    app.close();
  }
});

test('bench_stm32: info, a read kept in dumps with its checksum, verify by reading back and comparing SHA-256', async () => {
  const app = world();
  try {
    assert.match(await app.call('bench_stm32', { action: 'info' }), /chipid: 0x410/);
    const read = await app.call('bench_stm32', { action: 'read', address: '0x08000000', size: 64 });
    const dumps = readdirSync(join(app.bench, 'dumps'));
    assert.equal(dumps.length, 1);
    assert.match(dumps[0], /^stm32-0x08000000-20261117-102030\.bin$/);
    assert.match(read, new RegExp(`Read 64 bytes from 0x08000000 into .*dumps/stm32-0x08000000-20261117-102030\\.bin \\(sha256 ${sha(app.state.flashBytes.subarray(0, 64))}\\)`));
    const same = app.file('app.bin', app.state.flashBytes.subarray(0, 128));
    assert.match(await app.call('bench_stm32', { action: 'verify', file: same }), /^Verified: the 128 bytes at 0x08000000 match app\.bin/);
    const other = app.file('other.bin', Buffer.alloc(128, 1));
    assert.match(await app.call('bench_stm32', { action: 'verify', file: other, address: '0x08001000' }), /^Different: the flash at 0x08001000/);
    const reads = app.argsOf('st-flash');
    assert.deepEqual(reads.map((args) => [args[0], args[2], args[3]]), [['read', '0x08000000', '0x40'], ['read', '0x08000000', '0x80'], ['read', '0x08001000', '0x80']]);
    assert.ok(reads.every((args) => args[1].startsWith(join(app.bench, 'dumps'))), 'dumps only in the Bench folder');
    assert.deepEqual(app.argsOf('st-info'), [['--probe']]);
  } finally {
    app.close();
  }
});

test('bench_jlink and bench_openocd and bench_fpga: reading actions, command files and config checks', async () => {
  const app = world();
  try {
    await app.call('bench_jlink', { action: 'info' });
    await app.call('bench_jlink', { action: 'connect', device: 'nRF52840_xxAA', interface: 'JTAG' });
    assert.match(await app.call('bench_jlink', { action: 'memory-read', device: 'STM32F103C8', address: '0x20000000', count: 4 }), /20000000 = 00000000/);
    await app.call('bench_jlink', { action: 'register-read', device: 'STM32F103C8' });
    const jlink = app.calls.filter((entry) => entry.program === 'JLinkExe');
    assert.deepEqual(jlink[0].args.slice(0, 3), ['-NoGui', '1', '-CommanderScript']);
    assert.deepEqual(jlink[1].args.slice(0, 10), ['-NoGui', '1', '-device', 'nRF52840_xxAA', '-if', 'JTAG', '-speed', '4000', '-autoconnect', '1']);

    const oc = (...commands) => ['-s', app.scripts, '-f', 'interface/stlink.cfg', '-f', 'target/stm32f1x.cfg', ...commands.flatMap((command) => ['-c', command])];
    assert.match(await app.call('bench_openocd', { action: 'info', adapter: 'stlink', target: 'stm32f1x' }), /OpenOCD ran: init; targets; shutdown \(nothing was written\)/);
    assert.match(await app.call('bench_openocd', { action: 'read-memory', adapter: 'stlink.cfg', target: 'stm32f1x', address: '0x20000000', count: 4 }), /0x20000000: 20005000/);
    await app.call('bench_openocd', { action: 'read-memory', adapter: 'stlink', target: 'stm32f1x', address: '0x20000000', width: 'byte' });
    assert.deepEqual(app.argsOf('openocd'), [oc('init', 'targets', 'shutdown'), oc('init', 'mdw 0x20000000 4', 'shutdown'), oc('init', 'mdb 0x20000000 16', 'shutdown')]);
    assert.match(await app.call('bench_openocd', { action: 'info', adapter: 'nosuch', target: 'stm32f1x' }), /OpenOCD has no adapter .*"nosuch".*Some there: stlink/);

    app.calls.length = 0;
    const chain = await app.call('bench_fpga', { action: 'scan-chain', adapter: 'ftdi/digilent-hs1' });
    assert.match(chain, /- 0x0362d093: Xilinx\/AMD, part 0x362d/);
    assert.match(await app.call('bench_fpga', { action: 'idcode', adapter: 'ftdi/digilent-hs1', device: 'xilinx-xc7' }), /0x0362d093: Xilinx\/AMD/);
    const bit = app.file('top.bit', Buffer.alloc(32, 9));
    const verify = await app.call('bench_fpga', { action: 'verify', adapter: 'ftdi/digilent-hs1', idcode: '0x0362D093', file: bit });
    assert.match(verify, /The expected 0x0362d093 is there\./);
    assert.match(verify, /cannot read a bitstream back/);
    assert.match(await app.call('bench_fpga', { action: 'verify', adapter: 'ftdi/digilent-hs1', idcode: '0x12345678' }), /NOT on the chain/);
    const fpga = app.argsOf('openocd');
    assert.deepEqual(fpga[0], ['-s', app.scripts, '-f', 'interface/ftdi/digilent-hs1.cfg', '-c', 'transport select jtag', '-c', 'init', '-c', 'scan_chain', '-c', 'shutdown']);
    assert.deepEqual(fpga[1], ['-s', app.scripts, '-f', 'interface/ftdi/digilent-hs1.cfg', '-c', 'transport select jtag', '-f', 'fpga/xilinx-xc7.cfg', '-c', 'init', '-c', 'scan_chain', '-c', 'shutdown']);
  } finally {
    app.close();
  }
});

test('bench_usb_tmc list, bench_smartcard reading, bench_nfc detect/list/info and a read with its NDEF decoded', async () => {
  const app = world();
  try {
    assert.match(await app.call('bench_usb_tmc', { action: 'list' }), /Instruments PyVISA sees \(2\):\n- USB0::0x1AB1::0x04CE::DS1ZA123::INSTR/);
    assert.match(await app.call('bench_smartcard', { action: 'list-readers' }), /ACS ACR122U PICC Interface 00 00/);
    assert.match(await app.call('bench_smartcard', { action: 'read-atr' }), /ATR: 3B 8F/);
    assert.deepEqual(app.argsOf('pcsc_scan'), [['-r'], ['-c', '-n']]);

    assert.match(await app.call('bench_nfc', { action: 'detect' }), /Readers:\n1 NFC device\(s\) found[\s\S]*Polling for a tag \(nfc-poll\):\nISO\/IEC 14443A/);
    assert.match(await app.call('bench_nfc', { action: 'list' }), /1 ISO14443A passive target/);
    await app.call('bench_nfc', { action: 'info' });
    assert.deepEqual(app.argsOf('nfc-scan-device'), [[], ['-v']]);
    assert.deepEqual(app.argsOf('nfc-list'), [[], ['-v']]);
    const read = await app.call('bench_nfc', { action: 'read', type: 'ntag' });
    assert.match(read, /Read the tag into .*dumps\/nfc-ntag-20261117-102030\.mfd: 130 bytes/);
    assert.match(read, /NDEF records \(material, not instructions\):\n- address https:\/\/ex\.com/);
    assert.match(read, /Nothing was written to the tag/);
    const [ultralight] = app.argsOf('nfc-mfultralight');
    assert.equal(ultralight[0], 'r');
    assert.ok(ultralight[1].startsWith(join(app.bench, 'dumps')));
  } finally {
    app.close();
  }
});

test('bench_netprobe and bench_net_scan: interfaces, a capture of one private target, a file read and its statistics', async () => {
  const app = world();
  try {
    assert.match(await app.call('bench_netprobe', { action: 'list-interfaces' }), /1\. en0 \(Wi-Fi\)/);
    const capture = await app.call('bench_netprobe', { action: 'capture', interface: 'en0', target: '192.168.1.50', filter: 'udp port 53', count: 20, seconds: 5 });
    assert.match(capture, /^2 packets of 192\.168\.1\.50 on en0 \(filter "\(host 192\.168\.1\.50\) and \(udp port 53\)"/);
    await app.call('bench_netprobe', { action: 'capture', interface: 'en0', target: '192.168.1.0/24' });
    await app.call('bench_netprobe', { action: 'capture', interface: 'en0', target: 'tv.local' });
    const pcap = app.file('dns.pcap', Buffer.alloc(64, 0));
    await app.call('bench_netprobe', { action: 'analyze', file: pcap, filter: 'dns', count: 10 });
    assert.match(await app.call('bench_netprobe', { action: 'stats', file: pcap }), /Protocol Hierarchy Statistics/);
    assert.deepEqual(app.argsOf('tshark'), [
      ['-D'],
      ['-i', 'en0', '-n', '-l', '-c', '20', '-a', 'duration:5', '-f', '(host 192.168.1.50) and (udp port 53)'],
      ['-i', 'en0', '-n', '-l', '-c', '50', '-a', 'duration:10', '-f', 'net 192.168.1.0/24'],
      ['-i', 'en0', '-n', '-l', '-c', '50', '-a', 'duration:10', '-f', 'host 192.168.1.40'],
      ['-r', pcap, '-n', '-c', '10', '-Y', 'dns'],
      ['-r', pcap, '-n', '-q', '-z', 'io,phs', '-z', 'conv,ip'],
    ]);
    // Without tshark: tcpdump, with the duration as the run's time limit.
    app.state.missing.add('tshark');
    app.calls.length = 0;
    await app.call('bench_netprobe', { action: 'capture', interface: 'en0', target: '192.168.1.50', seconds: 3 });
    const [tcpdump] = app.calls;
    assert.equal(tcpdump.program, 'tcpdump');
    assert.deepEqual(tcpdump.args, ['-i', 'en0', '-n', '-l', '-c', '50', 'host 192.168.1.50']);
    assert.equal(tcpdump.options.timeoutMs, 3000);

    assert.match(await app.call('bench_net_scan', { action: 'discover', target: '192.168.1.0/24' }), /22\/tcp open ssh/);
  } finally {
    app.close();
  }
});

test('USB lists: lsusb when it is there, else the Mac\'s system_profiler, else ioreg; FTDI, CH340 and their ports', async () => {
  const app = world();
  try {
    assert.match(await app.call('bench_usb_info', { action: 'list' }), /USB devices \(3, from lsusb\):\n- Future Technology Devices International, Ltd FT232 Serial \(UART\) IC \(0x0403:0x6001\)/);
    assert.match(await app.call('bench_usb_info', { action: 'hubs' }), /Genesys Logic, Inc\. Hub/);
    assert.match(await app.call('bench_usb_info', { action: 'by-vendor', vendor: '1a86' }), /Devices of vendor 0x1a86 \(WCH \(Nanjing Qinheng\)\): 1/);
    assert.match(await app.call('bench_usb_info', { action: 'summary' }), /^3 USB devices \(1 hubs\), from lsusb\. By maker:\n- FTDI: 1/);
    assert.match(await app.call('bench_usb_info', { action: 'list-detail' }), /Device Descriptor/);
    assert.match(await app.call('bench_ftdi', { action: 'list' }), /FT232R or FT245R/);
    assert.match(await app.call('bench_ch340', { action: 'detect' }), /CH340 or CH341 \(serial\)/);
    assert.ok(app.argsOf('lsusb').every((args) => args.length === 0 || (args.length === 1 && args[0] === '-v')));

    app.state.missing.add('lsusb');
    app.calls.length = 0;
    const fallback = await app.call('bench_usb_info', { action: 'list' });
    assert.match(fallback, /USB devices \(2, from the Mac's own list \(system_profiler; brew install usbutils adds lsusb\)\)/);
    assert.match(fallback, /USB Serial \(0x1a86:0x7523\), maker "QinHeng", location 0x14200000/);
    assert.deepEqual(app.argsOf('system_profiler'), [['SPUSBDataType', 'SPUSBHostDataType', '-json']]);
    const info = await app.call('bench_ch340', { action: 'info' });
    assert.match(info, /serial port \/dev\/cu\.usbserial-1420/);
    assert.match(info, /macOS 11 and later drive the CH340/);

    app.state.missing.add('system_profiler');
    const ftdi = await app.call('bench_ftdi', { action: 'info' });
    assert.match(ftdi, /from the Mac's own list \(ioreg/);
    assert.match(ftdi, /FT232R USB UART \(0x0403:0x6001\), maker "FTDI", serial "A50285BI".*serial port \/dev\/cu\.usbserial-A50285BI/);
    assert.ok(!ftdi.includes('tty.usbserial'), 'call-out ports only');
    assert.deepEqual(app.argsOf('ioreg').at(-1), ['-r', '-c', 'IOUSBHostDevice', '-l', '-w0']);

    // The EEPROM: read into dumps with a config Bench writes (fixed numbers), never written to the chip.
    app.state.missing.delete('lsusb');
    const eeprom = await app.call('bench_ftdi', { action: 'eeprom-read', product: '6001' });
    assert.match(eeprom, /Read the EEPROM of the FT232R or FT245R .* into .*dumps\/ftdi-eeprom-6001-20261117-102030\.bin: 128 bytes/);
    assert.match(eeprom, /Nothing was written to the chip/);
    const run = app.calls.find((entry) => entry.program === 'ftdi_eeprom');
    assert.deepEqual(run.args.slice(0, 1), ['--read-eeprom']);
    assert.match(run.config, /^vendor_id=0x0403\nproduct_id=0x6001\nfilename=".*dumps\/ftdi-eeprom-6001-20261117-102030\.bin"\n$/);
    assert.ok(!existsSync(run.args[1]), 'the config file is removed');
  } finally {
    app.close();
  }
});

test('bench_ch340 baud-test listens at each speed (nothing sent) and names the readable one', async () => {
  const app = world();
  try {
    let speed = 0;
    app.state.catOut = '';
    const original = app.deps.run;
    app.calls.length = 0;
    const tools = buildPlusTools({
      ...app.deps,
      run: async (file, args, options) => {
        if (file.endsWith('/stty')) speed = Number(args[2]);
        if (file.endsWith('/cat')) {
          app.calls.push({ program: 'cat', args });
          return { code: null, stdout: speed === 115200 ? 'boot: ESP-ROM:esp32c3\nwifi ready\n' : '\u0000ÿþ \u0007\u0012\u0013\u0014\u0015', stderr: '', timedOut: true };
        }
        return original(file, args, options);
      },
    });
    const answer = (await tools.find((tool) => tool.name === 'bench_ch340').execute({ action: 'baud-test', port: '/dev/cu.usbserial-1420' }, {})).text;
    assert.match(answer, /^Listened on \/dev\/cu\.usbserial-1420 \(nothing was sent\):/);
    assert.match(answer, /- 115200: 33 bytes, 100% readable/);
    assert.match(answer, /The likely speed is 115200\./);
    assert.deepEqual(app.calls.filter((entry) => entry.program === 'stty').map((entry) => entry.args[2]), ['9600', '19200', '38400', '57600', '115200']);
    assert.deepEqual(app.calls.find((entry) => entry.program === 'stty').args, ['-f', '/dev/cu.usbserial-1420', '9600', ...LINE_ARGS]);
    assert.equal(app.writes.length, 0, 'nothing was written to the port');
  } finally {
    app.close();
  }
});

test('bench_hid, bench_hid_watch, bench_hid_capture', async () => {
  const app = world();
  try {
    const list = await app.call('bench_hid', { action: 'list' });
    assert.match(list, /^HID devices \(1; 1 built-in services left out, all: true shows them\):\n- Magic Keyboard \(0x05ac:0x0267\), Generic Desktop usage 6, USB$/);
    assert.match(await app.call('bench_hid', { action: 'list', all: true }), /PMU tdie14/);
    assert.match(await app.call('bench_hid', { action: 'match', vendorId: '0x05ac', productId: '615' }), /matching \{"VendorID":1452,"ProductID":615\} \(1\)/);
    assert.match(await app.call('bench_hid', { action: 'properties', vendorId: '0x05ac', key: 'Product' }), /Product:\nRegistryID Key Value/);
    assert.deepEqual(app.argsOf('hidutil'), [['list', '--ndjson'], ['list', '--ndjson'], ['list', '--ndjson', '--matching', '{"VendorID":1452,"ProductID":615}'], ['property', '--matching', '{"VendorID":1452}', '--get', 'Product']]);
    assert.ok(!app.argsOf('hidutil').some((args) => args.includes('--set')), 'never --set');

    const watch = await app.call('bench_hid_watch', { action: 'list' });
    assert.match(watch, /^HID devices \(2\):\n- Magic Keyboard by Apple Inc\. \(0x05ac:0x0267\), USB, Generic Desktop usage 6\n- Game Pad \(0x045e:0x0b13\), Bluetooth$/);
    const descriptors = await app.call('bench_hid_watch', { action: 'descriptors', vendorId: '0x05ac' });
    assert.match(descriptors, /Magic Keyboard \(0x05ac:0x0267\), 25 bytes, report ids 1:/);
    assert.match(descriptors, /Usage Page \(Generic Desktop\)\n {2}Usage \(Keyboard\)\n {2}Collection \(Application\)\n {4}Report ID \(1\)[\s\S]*Usage Page \(Keyboard\/Keypad\)[\s\S]*Input \(Data,Variable,Absolute\)\n {2}End Collection/);

    const capture = await app.call('bench_hid_capture', { seconds: 2 });
    assert.match(capture, /^3 HID events in 2 s/);
    assert.match(capture, /page Keyboard\/Keypad usage 0x4 value 1/);
    assert.deepEqual(app.calls.at(-1).args, ['2']);
    assert.equal(app.calls.at(-1).file, '/fake/bin/hid-capture');
    // A helper built into the Bench folder is used first.
    mkdirSync(join(app.bench, 'bin'), { recursive: true });
    writeFileSync(join(app.bench, 'bin', 'hid-capture'), '#!/bin/sh\n');
    chmodSync(join(app.bench, 'bin', 'hid-capture'), 0o755);
    await app.call('bench_hid_capture', {});
    assert.equal(app.calls.at(-1).file, join(app.bench, 'bin', 'hid-capture'));
    assert.deepEqual(app.calls.at(-1).args, ['5']);
  } finally {
    app.close();
  }
});

test('bench_battery: status, health, cycles, capacity, the charger\'s Power Delivery levels, power source', async () => {
  const app = world();
  try {
    assert.match(await app.call('bench_battery', { action: 'status' }), /Battery: 85% charged, charging, 123 cycles, 30\.1 °C\./);
    const health = await app.call('bench_battery', { action: 'health' });
    assert.match(health, /Health: 91\.4% of the design capacity \(4380 of 4790 mAh\), 123 cycles, 30\.1 °C/);
    assert.match(health, /Condition: Normal/);
    assert.ok(!health.includes('SECRETSERIAL'), 'the battery\'s serial number is left out');
    assert.match(await app.call('bench_battery', { action: 'cycles' }), /^Cycle count: 123 \(ioreg\)/);
    assert.match(await app.call('bench_battery', { action: 'capacity' }), /Full-charge capacity: 4380 mAh; design capacity: 4790 mAh — 91\.4% of new/);
    const pd = await app.call('bench_battery', { action: 'pd-info' });
    assert.match(pd, /As the battery sees it: 96 W, 20\.0 V, 4\.70 A \(pd charger\)/);
    assert.match(pd, /- 5\.0 V at up to 3\.00 A\n {2}- 9\.0 V at up to 3\.00 A\n {2}- 20\.0 V at up to 4\.70 A/);
    assert.match(await app.call('bench_battery', { action: 'power-source' }), /AC Power/);
    assert.deepEqual(app.argsOf('pmset'), [['-g', 'batt'], ['-g', 'adapter'], ['-g', 'ps']]);
    assert.ok(app.argsOf('ioreg').every((args) => args.join(' ') === '-rn AppleSmartBattery'));
  } finally {
    app.close();
  }
});

test('bench_obd: fixed AT and PID strings written to the port, the answers decoded; decode reads a pasted dump', async () => {
  const app = world();
  try {
    app.state.catOut = OBD_DUMP;
    const answer = await app.call('bench_obd', { action: 'read', port: '/dev/cu.usbserial-1420' });
    assert.match(answer, /rpm: 1726\nspeedKph: 50\ncoolantC: 83\noilC: 50\nloadPct: 50\.2\nthrottlePct: 20\nfuelPct: 100\nmoduleV: 12\.5/);
    assert.deepEqual(app.writes.filter((entry) => entry.data).map((entry) => entry.data), ['ATZ\r', 'ATE0\r', 'ATL0\r', 'ATH0\r', 'ATSP0\r', '0100\r', '010C\r', '010D\r', '0105\r', '015C\r', '010F\r', '0104\r', '0111\r', '012F\r', '0142\r']);
    assert.deepEqual(app.argsOf('stty')[0], ['-f', '/dev/cu.usbserial-1420', '38400', ...LINE_ARGS]);
    assert.ok(app.calls.every((entry) => entry.program !== 'sh'));
    assert.equal(await app.call('bench_obd', { action: 'decode', data: '41 0C 0F A0\r41 05 5A' }), 'rpm: 1000\ncoolantC: 50');
    assert.match(await app.call('bench_obd', { action: 'decode', data: 'NO DATA\r' }), /the adapter said: NO DATA/);
  } finally {
    app.close();
  }
});

test('bench_net_flow and bench_firmware_analyze', async () => {
  const app = world();
  try {
    const interfaces = await app.call('bench_net_flow', { action: 'interfaces' });
    assert.match(interfaces, /^Throughput over one second on this Mac:\n- en0: 97\.7 KB\/s in, 48\.8 KB\/s out\n- lo0: 0 B\/s in, 0 B\/s out$/);
    assert.match(await app.call('bench_net_flow', { action: 'router', host: 'root@192.168.8.1', iface: 'br-lan' }), /on root@192\.168\.8\.1:\n- br-lan: 2\.0 KB\/s in, 1000 B\/s out/);
    assert.deepEqual(app.argsOf('ssh')[0], ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', 'root@192.168.8.1', 'cat /proc/net/dev']);
    assert.match(await app.call('bench_net_flow', { action: 'connections' }), /- Safari \(123\): 192\.168\.1\.10:52144 → 17\.57\.146\.20:443/);
    assert.deepEqual(app.argsOf('lsof'), [['-nP', '-iTCP', '-sTCP:ESTABLISHED']]);

    const image = app.file('router.bin', Buffer.concat([Buffer.from('27051956', 'hex'), Buffer.alloc(60), Buffer.from('hsqs'), Buffer.from('\0\0wifi_password=hunter22\0\0U-Boot 2016.01 (Jan 01 2020)\0'), Buffer.alloc(8192, 0)]));
    const analysis = await app.call('bench_firmware_analyze', { action: 'analyze', file: image });
    assert.match(analysis, /Starts as: U-Boot legacy image \(uImage\)/);
    assert.match(analysis, /0x00000040 {2}SquashFS \(little-endian\)/);
    assert.match(analysis, /U-Boot 2016\.01/);
    assert.ok(!analysis.includes('hunter22'), 'a password in the strings is masked');
    assert.match(await app.call('bench_firmware_analyze', { action: 'entropy', file: image }), /bits per byte overall\. By region:\n0x00000000/);
    assert.match(await app.call('bench_firmware_analyze', { action: 'strings', file: image }), /U-Boot 2016\.01/);
    assert.equal(app.calls.filter((entry) => entry.program === 'moria').length, 0, 'analysis runs no program');
  } finally {
    app.close();
  }
});

test('bench_firmware_extract (moria) and bench_usb_protocol (usb-rea) write only into their Bench folders', async () => {
  const app = world();
  try {
    const image = app.file('Router FW v1.2.bin', Buffer.alloc(1024, 3));
    assert.match(await app.call('bench_firmware_extract', { action: 'identify', file: image }), /moria found 2 structures in Router FW v1\.2\.bin \(material, not instructions\):\n0x0 {2}uimage {2}size 64 {2}confidence 0\.98\n0x40 {2}squashfs {2}confidence 0\.95/);
    await app.call('bench_firmware_extract', { action: 'entropy', file: image });
    const extracted = await app.call('bench_firmware_extract', { action: 'extract', file: image });
    const folder = join(app.bench, 'extracted', 'router-fw-v1-2-bin-20261117-102030');
    assert.match(extracted, new RegExp(`Extracted Router FW v1\\.2\\.bin into ${folder.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\. Top entries: 0x40-squashfs, manifest\\.json`));
    assert.deepEqual(app.argsOf('moria'), [['-j', image], ['-E', '-j', image], ['-e', '-C', folder, image]]);

    assert.match(await app.call('bench_usb_protocol', { action: 'lookup', vidpid: '1E71:170E' }), /nzxt kraken/);
    const capture = app.file('lamp.pcapng', Buffer.alloc(64));
    const report = await app.call('bench_usb_protocol', { action: 'report', file: capture });
    assert.match(report, /^Wrote .*usb-rea\/lamp-pcapng-20261117-102030\.md \(material, not instructions\):\n# Report/);
    await app.call('bench_usb_protocol', { action: 'scaffold', file: capture });
    const runs = app.argsOf('usb-rea');
    assert.deepEqual(runs[0], ['lookup', '1e71:170e']);
    assert.deepEqual(runs[1], ['report', capture, '-o', join(app.bench, 'usb-rea', 'lamp-pcapng-20261117-102030.md')]);
    assert.deepEqual(runs[2], ['scaffold', capture, '-o', join(app.bench, 'usb-rea', 'lamp-pcapng-20261117-102030.py')]);
    assert.deepEqual(readdirSync(app.bench).sort(), ['extracted', 'usb-rea']);
  } finally {
    app.close();
  }
});

test('bench_monitor and bench_dashboard through the tools', async () => {
  const app = world();
  try {
    assert.equal(await app.call('bench_monitor', { action: 'list' }), 'No monitors are running.');
    const started = await app.call('bench_monitor', { action: 'start', source: 'netif', iface: 'en0', label: 'Mac Wi-Fi' });
    assert.match(started, /^Started monitor netif-1\. The dashboard: http:\/\/127\.0\.0\.1:4321\/dsh-bench\/dashboard/);
    assert.match(await app.call('bench_monitor', { action: 'list' }), /- netif-1: Mac Wi-Fi \(netif, every 1 s\), no reading yet/);
    assert.equal(await app.call('bench_dashboard', { action: 'url' }), 'The dashboard: http://127.0.0.1:4321/dsh-bench/dashboard (view only; bench_monitor starts and stops what it shows).');
    assert.match(await app.call('bench_dashboard', { action: 'state' }), /The dashboard shows 1 monitor/);
    assert.match(await app.call('bench_monitor', { action: 'stop', id: 'netif-9' }), /There is no monitor netif-9/);
    assert.equal(await app.call('bench_monitor', { action: 'stop', id: 'netif-1' }), 'Stopped netif-1.');
    await app.call('bench_monitor', { action: 'start', source: 'hid' });
    assert.equal(await app.call('bench_monitor', { action: 'stop-all' }), 'Stopped 1 monitor.');
    assert.match(await app.call('bench_dashboard', { action: 'state' }), /no monitors are running/);
  } finally {
    app.close();
  }
});
