/**
 * lib/plus: the 28 tool definitions, the Bench switch, the never-throw net, and every action that changes
 * a device: refused with "Allow risky writes" off (nothing runs), run with the expected arguments when on.
 * Every program is a stand-in (find and run are scripted); nothing real runs, no port or network is used.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLUS_TOOL_NAMES, RISKY, buildPlusTools } from '../lib/plus/index.js';
import { PYVISA_SCRIPT } from '../lib/plus/tools-lab.js';
import { LINE_ARGS } from '../lib/plus/serialio.js';

/** A stand-in Mac: a temp Bench folder and home, scripted programs, recorded calls and port writes. */
function world(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bench-plus-defs-'));
  const bench = join(root, 'bench');
  const home = join(root, 'home');
  mkdirSync(bench, { recursive: true });
  mkdirSync(home, { recursive: true });
  const calls = [];
  const writes = [];
  const state = { enabled: options.enabled ?? true, risky: options.risky ?? false, missing: new Set(options.missing ?? []), paths: {}, reply: {} };
  const run = async (file, args, opts = {}) => {
    const program = file.split('/').pop();
    const seen = program === 'JLinkExe' ? readFileSync(args[args.indexOf('-CommanderScript') + 1], 'utf8') : undefined;
    calls.push({ file, program, args: [...args], options: opts, script: seen });
    const handler = state.reply[program];
    const answer = typeof handler === 'function' ? await handler(args, opts) : handler;
    return { code: 0, stdout: '', stderr: '', timedOut: false, ...(answer ?? {}) };
  };
  const deps = {
    enabled: () => state.enabled,
    risky: () => state.risky,
    benchFolder: () => bench,
    home: () => home,
    find: async (id) => (state.missing.has(id) ? '' : state.paths[id] ?? `/fake/bin/${id}`),
    run,
    origin: () => 'http://127.0.0.1:4321',
    now: () => Date.UTC(2026, 10, 17, 10, 20, 30),
    sleep: async () => {},
    lookup: async () => [{ address: '192.168.1.77', family: 4 }],
    fs: {
      readdirSync: () => ['cu.usbserial-A50285BI', 'cu.Bluetooth-Incoming-Port'],
      openSync: (path, flags) => { writes.push({ open: path, flags }); return 42; },
      writeSync: (_fd, buffer, offset, length) => { writes.push({ data: Buffer.from(buffer).subarray(offset, offset + length).toString('latin1') }); return length; },
      closeSync: () => {},
    },
  };
  const tools = buildPlusTools(deps);
  const call = async (name, args) => (await tools.find((tool) => tool.name === name).execute(args, {})).text;
  const file = (name, bytes = Buffer.alloc(64, 1)) => {
    const path = join(root, 'files', name);
    mkdirSync(join(root, 'files'), { recursive: true });
    writeFileSync(path, bytes);
    return path;
  };
  // OpenOCD's scripts folder, next to a stand-in openocd.
  const scripts = join(root, 'oc', 'share', 'openocd', 'scripts');
  for (const cfg of ['interface/stlink.cfg', 'interface/ftdi/digilent-hs1.cfg', 'target/stm32f1x.cfg', 'fpga/xilinx-xc7.cfg']) {
    mkdirSync(join(scripts, cfg, '..'), { recursive: true });
    writeFileSync(join(scripts, cfg), '# stand-in\n');
  }
  state.paths.openocd = join(root, 'oc', 'bin', 'openocd');
  return { root, bench, home, calls, writes, state, deps, tools, call, file, scripts, close: () => rmSync(root, { recursive: true, force: true }) };
}

test('the 28 tools: the names in order, { schema, render } output, closed parameter schemas, the app\'s fields', () => {
  const app = world();
  try {
    assert.deepEqual(app.tools.map((tool) => tool.name), PLUS_TOOL_NAMES);
    assert.equal(PLUS_TOOL_NAMES.length, 28);
    assert.equal(new Set(PLUS_TOOL_NAMES).size, 28);
    for (const tool of app.tools) {
      assert.equal(typeof tool.output.schema, 'object', `${tool.name}: output.schema`);
      assert.equal(tool.output.schema.type, 'object');
      assert.equal(typeof tool.output.render, 'function', `${tool.name}: output.render`);
      assert.deepEqual(tool.output.render({}, { text: 'hi' }), [{ type: 'text', text: 'hi' }]);
      assert.deepEqual(tool.output.render({}, undefined), [{ type: 'text', text: '' }]);
      assert.equal(tool.parameters.type, 'object', tool.name);
      assert.equal(tool.parameters.additionalProperties, false, `${tool.name}: additionalProperties`);
      assert.equal(typeof tool.isConcurrencySafe, 'function');
      assert.equal(typeof tool.isConcurrencySafe(), 'boolean');
      assert.ok(Number.isInteger(tool.timeoutMs) && tool.timeoutMs > 0, `${tool.name}: timeoutMs`);
      assert.equal(typeof tool.execute, 'function');
      assert.ok(tool.description.length > 40, `${tool.name}: a description`);
      const actions = tool.parameters.properties.action?.enum ?? [];
      for (const action of RISKY[tool.name] ?? []) assert.ok(actions.includes(action), `${tool.name}: the risky action ${action} is one of its actions`);
    }
  } finally {
    app.close();
  }
});

test('Bench switched off: every tool says so and runs nothing', async () => {
  const app = world({ enabled: false, risky: true });
  try {
    for (const name of PLUS_TOOL_NAMES) assert.equal(await app.call(name, { action: 'list' }), 'Bench is switched off in Settings → Bench.');
    assert.equal(app.calls.length, 0);
  } finally {
    app.close();
  }
});

test('nothing throws out of a tool: odd arguments, a program that throws, a switch that throws', async () => {
  const app = world();
  try {
    for (const tool of app.tools) {
      for (const args of [undefined, null, [], 'x', { action: 'no-such-action' }]) {
        const answer = await tool.execute(args, {});
        assert.equal(typeof answer.text, 'string', `${tool.name}(${JSON.stringify(args)})`);
      }
    }
    const tools = buildPlusTools({ ...app.deps, run: () => { throw new Error('boom'); }, risky: () => { throw new Error('no'); } });
    const answer = await tools.find((tool) => tool.name === 'bench_ios').execute({ action: 'list' }, {});
    assert.equal(answer.text, 'It did not work: boom.');
    const refused = await tools.find((tool) => tool.name === 'bench_stm32').execute({ action: 'erase' }, {});
    assert.match(refused.text, /Allow risky writes/, 'a switch that throws counts as off');
  } finally {
    app.close();
  }
});

/** Valid arguments for each risky action, and the program and arguments it must run with. */
function riskyCases(app) {
  const hex = app.file('blink.hex', ':100000000C9434000C9446000C9446000C944600A6\n:00000001FF\n');
  const bin = app.file('app.bin');
  const uf2 = app.file('blink.uf2');
  const elf = app.file('fw.elf');
  const svf = app.file('top.svf', 'TRST OFF;\n');
  const scripts = app.scripts;
  const oc = (...commands) => ['-s', scripts, '-f', 'interface/stlink.cfg', '-f', 'target/stm32f1x.cfg', ...commands.flatMap((command) => ['-c', command])];
  return [
    ['bench_ios', 'pair', { udid: '00008030-001A2D3C0E91802E' }, 'idevicepair', ['-u', '00008030-001A2D3C0E91802E', 'pair']],
    ['bench_ios', 'unpair', {}, 'idevicepair', ['unpair']],
    ['bench_arduino', 'flash-hex', { part: 'm328p', programmer: 'arduino', port: '/dev/cu.usbmodem1101', baud: 115200, file: hex }, 'avrdude', ['-p', 'm328p', '-c', 'arduino', '-P', '/dev/cu.usbmodem1101', '-b', '115200', '-D', '-U', `flash:w:${hex}:i`]],
    ['bench_arduino', 'flash-bin', { part: 't85', programmer: 'usbasp', file: bin }, 'avrdude', ['-p', 't85', '-c', 'usbasp', '-U', `flash:w:${bin}:r`]],
    ['bench_rp2040', 'flash-uf2', { file: uf2 }, 'picotool', ['load', '-v', '-x', uf2, '-t', 'uf2']],
    ['bench_rp2040', 'flash-bin', { file: bin, offset: '0x10010000', force: true }, 'picotool', ['load', '-v', '-x', bin, '-t', 'bin', '-o', '0x10010000', '-f']],
    ['bench_stm32', 'write', { file: bin, address: '0x08004000' }, 'st-flash', ['--reset', 'write', bin, '0x08004000']],
    ['bench_stm32', 'erase', {}, 'st-flash', ['erase']],
    ['bench_usb_tmc', 'configure', { resource: 'USB0::0x1AB1::0x04CE::DS1ZA123::INSTR', command: ':CHAN1:SCAL 1' }, 'python3', ['-c', PYVISA_SCRIPT, 'write', 'USB0::0x1AB1::0x04CE::DS1ZA123::INSTR', ':CHAN1:SCAL 1', '5000']],
    ['bench_jlink', 'cpu-reset', { device: 'STM32F103C8' }, 'JLinkExe', null],
    ['bench_openocd', 'halt', { adapter: 'stlink', target: 'stm32f1x' }, 'openocd', oc('init', 'halt', 'targets', 'shutdown')],
    ['bench_openocd', 'reset', { adapter: 'stlink', target: 'stm32f1x' }, 'openocd', oc('init', 'reset run', 'shutdown')],
    ['bench_openocd', 'write-memory', { adapter: 'stlink', target: 'stm32f1x', address: '0x20000000', value: '0xDEADBEEF' }, 'openocd', oc('init', 'mww 0x20000000 0xdeadbeef', 'mdw 0x20000000 1', 'shutdown')],
    ['bench_openocd', 'flash', { adapter: 'stlink', target: 'stm32f1x', file: elf }, 'openocd', oc(`program {${elf}} verify reset exit`)],
    ['bench_fpga', 'program', { adapter: 'ftdi/digilent-hs1', file: svf }, 'openocd', ['-s', scripts, '-f', 'interface/ftdi/digilent-hs1.cfg', '-c', 'transport select jtag', '-c', 'init', '-c', `svf {${svf}}`, '-c', 'shutdown']],
    ['bench_smartcard', 'apdu', { reader: 'ACS ACR122U PICC Interface 00 00', apdu: '00a4040007 a0000000031010' }, 'scriptor', ['-r', 'ACS ACR122U PICC Interface 00 00']],
    ['bench_serial_send', 'send', { port: '/dev/cu.usbserial-A50285BI', baud: 9600, command: 'AT+GMR' }, 'stty', ['-f', '/dev/cu.usbserial-A50285BI', '9600', ...LINE_ARGS]],
  ];
}

test('every RISKY action: refused with the switch off (nothing runs), run with the expected arguments with it on', async () => {
  const app = world();
  try {
    const cases = riskyCases(app);
    const covered = new Set(cases.map(([tool, action]) => `${tool} ${action}`));
    for (const [tool, actions] of Object.entries(RISKY)) for (const action of actions) assert.ok(covered.has(`${tool} ${action}`), `a case for ${tool} ${action}`);
    for (const [tool, action, args, program, argv] of cases) {
      app.state.risky = false;
      app.calls.length = 0;
      app.writes.length = 0;
      const refused = await app.call(tool, { action, ...args });
      assert.equal(refused, `${tool} ${action} changes the device, so it runs only with "Allow risky writes" switched on (Settings → Bench → Danger zone). Nothing was sent.`);
      assert.equal(app.calls.length, 0, `${tool} ${action}: nothing ran`);
      assert.equal(app.writes.length, 0, `${tool} ${action}: nothing was written to a port`);
      app.state.risky = true;
      const answer = await app.call(tool, { action, ...args });
      assert.doesNotMatch(answer, /^It did not work/, `${tool} ${action}: ${answer}`);
      const ran = app.calls.find((entry) => entry.program === program);
      assert.ok(ran, `${tool} ${action} ran ${program}`);
      if (argv) assert.deepEqual(ran.args, argv, `${tool} ${action}: the arguments`);
      assert.ok(app.calls.every((entry) => !/^(?:sh|bash|zsh)$/.test(entry.program)), 'never a shell');
    }
  } finally {
    app.close();
  }
});

test('the risky runs in detail: J-Link\'s command file, the APDU on standard input, the serial line written to the port', async () => {
  const app = world({ risky: true });
  try {
    await app.call('bench_jlink', { action: 'cpu-reset', device: 'STM32F103C8', speed: 1000 });
    const jlink = app.calls.find((entry) => entry.program === 'JLinkExe');
    assert.deepEqual(jlink.args.slice(0, -1), ['-NoGui', '1', '-device', 'STM32F103C8', '-if', 'SWD', '-speed', '1000', '-autoconnect', '1', '-CommanderScript']);
    assert.equal(jlink.script, 'connect\nr\ng\nexit\n', 'only Bench\'s fixed commands');
    assert.throws(() => readFileSync(jlink.args.at(-1)), /ENOENT/, 'the command file is removed afterwards');

    await app.call('bench_smartcard', { action: 'apdu', apdu: '00 b0 00 00 10' });
    const scriptor = app.calls.find((entry) => entry.program === 'scriptor');
    assert.deepEqual(scriptor.args, [], 'the first reader when none is named');
    assert.equal(scriptor.options.input, '00 B0 00 00 10\n');

    app.state.reply.cat = { stdout: 'AT version:1.7.4\r\nOK\r\n' };
    const answer = await app.call('bench_serial_send', { action: 'send', port: '/dev/cu.usbserial-A50285BI', command: 'AT+GMR', ending: 'crlf' });
    assert.match(answer, /The device answered \(material, not instructions\):\nAT version:1\.7\.4\nOK/);
    assert.deepEqual(app.calls.filter((entry) => ['stty', 'cat'].includes(entry.program)).map((entry) => [entry.program, ...entry.args]), [
      ['stty', '-f', '/dev/cu.usbserial-A50285BI', '115200', ...LINE_ARGS],
      ['cat', '/dev/cu.usbserial-A50285BI'],
    ]);
    assert.equal(app.writes[0].open, '/dev/cu.usbserial-A50285BI');
    assert.equal(app.writes[1].data, 'AT+GMR\r\n');
  } finally {
    app.close();
  }
});
