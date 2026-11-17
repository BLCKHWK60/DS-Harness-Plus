/**
 * The device, dashboard, monitor, reverse-engineering and requirements tools brought over from the
 * owner's "Bench Plus", rebuilt for the Bench add-on: 28 tools with the same names and actions.
 *
 * Wiring (index.js): `buildPlusTools(deps)` with
 *   enabled(), risky() (the owner's "Allow risky writes"), benchFolder() (absolute), find(id) (a program's
 *   full path from programs.js, '' when missing; `(id) => findPlus(id)`), run(file, args, options)
 *   (lib/run.js runFixed), registry (createRegistry(deps)), origin() (the app's address), now(), sleep(ms);
 *   for tests also fs (readdirSync/openSync/writeSync/closeSync of serial ports and /dev), lookup (DNS),
 *   timers (the registry's), home().
 * `dashboardHtml(DASHBOARD_STATE_PATH)` is the page; `dashboardState(registry, enabled)` its state.
 *
 * Every tool:
 * - answers "Bench is switched off…" while Bench is off, and never throws (an error becomes "It did not
 *   work: <reason>.");
 * - refuses each action listed in RISKY, before anything runs, while "Allow risky writes" is off;
 * - runs programs by full path with an argument list (no shell), with values checked first;
 * - returns text cleaned of control characters, with secrets masked, at most about 8,000 characters.
 */
import { lookup } from 'node:dns/promises';
import { runFixed } from '../run.js';
import { Answer, OFF, finish, riskyRefusal } from './core.js';
import { DEFAULT_BENCH, findPlus } from './programs.js';
import { chipTools } from './tools-chips.js';
import { labTools } from './tools-lab.js';
import { usbTools } from './tools-usb.js';
import { liveTools } from './tools-live.js';
import { createRegistry as makeRegistry } from './registry.js';

export { dashboardHtml, dashboardState } from './dashboard.js';
export { INSTALL_TEXT, formatRequirements, requirementRows } from './requirements.js';
export { PLUS_PROGRAMS, findPlus } from './programs.js';
export { DASHBOARD_PATH } from './tools-live.js';
export { maskSecrets } from './core.js';

/** The 28 tools, in this order. */
export const PLUS_TOOL_NAMES = [
  'bench_ios', 'bench_arduino', 'bench_rp2040', 'bench_stm32', 'bench_usb_tmc', 'bench_netprobe', 'bench_net_scan', 'bench_ftdi', 'bench_jlink', 'bench_openocd',
  'bench_fpga', 'bench_smartcard', 'bench_nfc', 'bench_usb_info', 'bench_hid', 'bench_battery', 'bench_ch340', 'bench_monitor', 'bench_dashboard', 'bench_obd',
  'bench_serial_send', 'bench_firmware_analyze', 'bench_net_flow', 'bench_hid_watch', 'bench_hid_capture', 'bench_firmware_extract', 'bench_usb_protocol', 'bench_requirements',
];

/**
 * The actions that change or send to a device: each runs only with "Allow risky writes" switched on.
 * Everything else reads (the OBD and NFC reads send only fixed read requests; ftdi eeprom-read and the
 * STM32 read only read; baud-test only listens).
 */
export const RISKY = {
  bench_ios: ['pair', 'unpair'],
  bench_arduino: ['flash-hex', 'flash-bin'],
  bench_rp2040: ['flash-uf2', 'flash-bin'],
  bench_stm32: ['write', 'erase'],
  bench_usb_tmc: ['configure'],
  bench_jlink: ['cpu-reset'],
  bench_openocd: ['halt', 'reset', 'write-memory', 'flash'],
  bench_fpga: ['program'],
  bench_smartcard: ['apdu'],
  bench_serial_send: ['send'],
};

/** The output every tool declares: { schema, render } (a bare schema here crashed the app at registration). */
const OUTPUT = {
  schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
};

/** The deps with a default for each one that is missing (tests give stand-ins for all of them). */
export function withDefaults(deps = {}) {
  const given = deps ?? {};
  const fn = (value, fallback) => (typeof value === 'function' ? value : fallback);
  const out = {
    ...given,
    enabled: fn(given.enabled, () => false),
    risky: fn(given.risky, () => false),
    benchFolder: fn(given.benchFolder, () => DEFAULT_BENCH),
    run: fn(given.run, runFixed),
    origin: fn(given.origin, () => ''),
    now: fn(given.now, () => Date.now()),
    sleep: fn(given.sleep, (ms) => new Promise((done) => setTimeout(done, ms))),
    lookup: fn(given.lookup, (host, options) => lookup(host, options)),
  };
  out.find = fn(given.find, (id) => findPlus(id, { benchFolder: out.benchFolder() }));
  // The registry may be set on the deps after the tools are built.
  Object.defineProperty(out, 'registry', { get: () => given.registry, enumerable: true });
  return out;
}

/** The registry of live monitors (see registry.js), with the same defaults. */
export function createRegistry(deps = {}) {
  return makeRegistry(withDefaults(deps));
}

const flag = (fn) => {
  try {
    return fn() === true;
  } catch {
    return false;
  }
};

/** A tool definition as the app registers it, with the switches and the safety net around it. */
function wrap(definition, deps) {
  const risky = RISKY[definition.name] ?? [];
  return {
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
    output: OUTPUT,
    isConcurrencySafe: () => Boolean(definition.concurrent),
    timeoutMs: definition.timeoutMs ?? 60_000,
    execute: async (args, exec) => {
      if (!flag(deps.enabled)) return { text: OFF };
      try {
        const input = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
        const action = typeof input.action === 'string' ? input.action : '';
        if (risky.includes(action) && !flag(deps.risky)) return { text: riskyRefusal(definition.name, action) };
        const text = await definition.execute(input, exec);
        return { text: finish(typeof text === 'string' ? text : String(text ?? '')) };
      } catch (error) {
        if (error instanceof Answer) return { text: finish(error.message) };
        const reason = finish(String(error?.message ?? error)).slice(0, 700);
        return { text: `It did not work: ${reason}${/[.!?]$/.test(reason) ? '' : '.'}` };
      }
    },
  };
}

/**
 * The 28 tools.
 * @param {object} deps - see the top of this file.
 * @returns {object[]} tool definitions, in PLUS_TOOL_NAMES order.
 */
export function buildPlusTools(deps = {}) {
  const ready = withDefaults(deps);
  const all = [...chipTools(ready), ...labTools(ready), ...usbTools(ready), ...liveTools(ready)];
  return PLUS_TOOL_NAMES.map((name) => {
    const definition = all.find((entry) => entry.name === name);
    if (!definition) throw new Error(`lib/plus has no tool ${name}`);
    return wrap(definition, ready);
  });
}
