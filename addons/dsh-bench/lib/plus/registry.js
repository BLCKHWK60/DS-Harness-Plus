/**
 * The live monitors that feed the dashboard: named feeds with a short history kept in memory.
 *
 * Sources (as Bench Plus): obd (a car's values over an ELM327 adapter), serial (lines on a port), netif
 * (this Mac's throughput), router (a router's /proc/net/dev over SSH), hid (the HID device list).
 *
 * Safety, because an uncaught error in a timer once closed the app:
 * - a spec is checked completely before any timer starts, and at most 8 monitors run at once;
 * - every timer callback is inside try/catch and every tick's promise is caught: a tick's error only
 *   goes to that monitor's lastError, and nothing ever throws out of a timer;
 * - every timer is unref'd, and stop/stopAll clear them.
 */
import { baudOf, ifaceOf, intIn, maskSecrets, runProgram, serialPort, tidy } from './core.js';
import { sshHost } from './net.js';
import { MONITOR_PIDS, queryObd } from './obd.js';
import { readInterfaceCounters, readRouterCounters, rates } from './netflow.js';
import { parseHidDevices } from './hidwatch.js';
import { readFor, setLine } from './serialio.js';

export const SOURCES = ['obd', 'serial', 'netif', 'router', 'hid'];
export const MAX_MONITORS = 8;
const MAX_SAMPLES = 240;
/** The shortest time between two ticks, per source (a car query takes about two seconds). */
const MIN_INTERVAL = { obd: 3000, serial: 1000, netif: 1000, router: 2000, hid: 2000 };
const DEFAULT_INTERVAL = { obd: 5000, serial: 2000, netif: 1000, router: 2000, hid: 5000 };

const label = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim().slice(0, 80);

/**
 * Check a monitor's spec fully; throws a plain sentence when anything is wrong.
 * @returns {object} the monitor's settings.
 */
export function checkSpec(spec) {
  const source = String(spec?.source ?? '');
  if (!SOURCES.includes(source)) throw new Error(`Give a source: one of ${SOURCES.join(', ')}`);
  const intervalMs = intIn(spec.intervalMs, MIN_INTERVAL[source], 60_000, DEFAULT_INTERVAL[source], `interval for ${source} (milliseconds)`);
  const settings = { source, intervalMs, label: label(spec.label) };
  if (source === 'obd' || source === 'serial') {
    settings.port = serialPort(spec.port);
    settings.baud = baudOf(spec.baud, source === 'obd' ? 38400 : 115200);
    settings.target = settings.port;
  } else if (source === 'router') {
    settings.host = sshHost(spec.host);
    settings.iface = spec.iface === undefined || spec.iface === '' ? '' : ifaceOf(spec.iface);
    settings.target = settings.iface ? `${settings.iface} on ${settings.host}` : settings.host;
  } else if (source === 'netif') {
    settings.iface = spec.iface === undefined || spec.iface === '' ? '' : ifaceOf(spec.iface);
    settings.target = settings.iface || 'all interfaces';
  } else {
    settings.target = 'HID devices';
  }
  settings.label ||= `${source} ${settings.target}`.trim();
  return settings;
}

/**
 * The registry.
 * @param {object} deps - find, run, now, sleep, fs (stand-ins in tests), and optionally timers {setInterval, clearInterval, setTimeout, clearTimeout}.
 * @returns {{start: Function, stop: Function, stopAll: Function, state: Function, count: Function, tick: Function}} the registry.
 */
export function createRegistry(deps = {}) {
  const timers = { setInterval, clearInterval, setTimeout, clearTimeout, ...(deps.timers ?? {}) };
  const now = () => {
    try {
      const value = Number(deps.now?.() ?? Date.now());
      return Number.isFinite(value) ? value : Date.now();
    } catch {
      return Date.now();
    }
  };
  const monitors = new Map();
  let sequence = 0;

  const push = (monitor, values, text) => {
    const numeric = {};
    for (const [key, value] of Object.entries(values ?? {})) if (typeof value === 'number' && Number.isFinite(value)) numeric[key] = Math.round(value * 100) / 100;
    const at = now();
    monitor.history.push({ t: at, v: numeric });
    while (monitor.history.length > MAX_SAMPLES) monitor.history.shift();
    monitor.latest = { t: at, values: numeric, text: text == null ? null : maskSecrets(tidy(text)).slice(0, 4000) };
    monitor.lastError = null;
  };
  const sum = (picked, key) => Object.values(picked).reduce((total, entry) => total + (entry?.[key] ?? 0), 0);

  /** One reading; its error goes to lastError. Never rejects. */
  async function tick(id) {
    const monitor = monitors.get(id);
    if (!monitor || monitor.busy) return;
    monitor.busy = true;
    try {
      if (monitor.source === 'obd') {
        const result = await queryObd(deps, monitor.port, monitor.baud, { init: !monitor.ready, pids: MONITOR_PIDS });
        monitor.ready = Object.keys(result.values).length > 0;
        push(monitor, result.values, Object.keys(result.values).length ? Object.entries(result.values).map(([key, value]) => `${key}: ${value}`).join('  ') : `No values (${result.notes.join(', ') || 'no answer'}); the adapter is woken again next time.`);
      } else if (monitor.source === 'serial') {
        if (!monitor.ready) {
          await setLine(deps, monitor.port, monitor.baud);
          monitor.ready = true;
        }
        const text = await readFor(deps, monitor.port, Math.min(Math.max(500, monitor.intervalMs - 300), 2000));
        const lines = tidy(text).split('\n').map((line) => line.trim()).filter(Boolean);
        push(monitor, { lines: lines.length, bytes: Buffer.byteLength(text) }, lines.slice(-8).join('\n'));
      } else if (monitor.source === 'netif' || monitor.source === 'router') {
        const counters = monitor.source === 'netif' ? await readInterfaceCounters(deps) : await readRouterCounters(deps, monitor.host);
        const at = now();
        if (monitor.previous) {
          const all = rates(monitor.previous, counters, Math.max(1, at - monitor.previousAt));
          const picked = monitor.iface ? { [monitor.iface]: all[monitor.iface] } : all;
          push(monitor, { rx: sum(picked, 'rx'), tx: sum(picked, 'tx') }, monitor.target);
        }
        monitor.previous = counters;
        monitor.previousAt = at;
      } else if (monitor.source === 'hid') {
        const result = await runProgram(deps, 'ioreg', ['-r', '-c', 'IOHIDDevice', '-l', '-w0'], { timeoutMs: 10_000 });
        const devices = parseHidDevices(result.out);
        push(monitor, { devices: devices.length }, devices.slice(0, 30).map((device) => `${device.name} ${device.vendorId ?? '?'}:${device.productId ?? '?'}`).join('\n'));
      }
    } catch (error) {
      monitor.lastError = String(error?.message ?? error).slice(0, 300);
      if (monitor.source === 'serial' || monitor.source === 'obd') monitor.ready = false;
    } finally {
      monitor.busy = false;
    }
  }

  /** What a timer calls: nothing can leave it. */
  const guarded = (id) => () => {
    try {
      tick(id).catch((error) => {
        const monitor = monitors.get(id);
        if (monitor) monitor.lastError = String(error?.message ?? error).slice(0, 300);
      });
    } catch {
      /* nothing leaves a timer */
    }
  };

  function start(spec) {
    const settings = checkSpec(spec);
    if (monitors.size >= MAX_MONITORS) throw new Error(`${MAX_MONITORS} monitors are running, the most Bench keeps at once. Stop one first (bench_monitor stop)`);
    sequence += 1;
    const id = `${settings.source}-${sequence}`;
    const monitor = { ...settings, id, startedAt: now(), latest: null, lastError: null, busy: false, ready: false, history: [], previous: null, previousAt: 0 };
    monitors.set(id, monitor);
    try {
      monitor.timer = timers.setInterval(guarded(id), settings.intervalMs);
      monitor.timer?.unref?.();
      monitor.first = timers.setTimeout(guarded(id), 0);
      monitor.first?.unref?.();
    } catch (error) {
      stop(id);
      throw error;
    }
    return id;
  }

  function stop(id) {
    const monitor = monitors.get(String(id ?? ''));
    if (!monitor) return false;
    try {
      timers.clearInterval(monitor.timer);
      if (monitor.first) timers.clearTimeout(monitor.first);
    } catch {
      /* already cleared */
    }
    monitors.delete(monitor.id);
    return true;
  }

  function stopAll() {
    for (const id of [...monitors.keys()]) stop(id);
  }

  function state() {
    return [...monitors.values()].map((monitor) => {
      const key = monitor.latest ? Object.keys(monitor.latest.values)[0] ?? null : null;
      return {
        id: monitor.id,
        label: monitor.label,
        source: monitor.source,
        target: monitor.target,
        intervalMs: monitor.intervalMs,
        startedAt: monitor.startedAt,
        latest: monitor.latest,
        lastError: monitor.lastError,
        key,
        series: key ? monitor.history.map((sample) => ({ t: sample.t, v: sample.v[key] ?? null })).filter((sample) => sample.v !== null) : [],
      };
    });
  }

  return { start, stop, stopAll, state, count: () => monitors.size, tick: (id) => tick(String(id ?? '')).catch(() => {}) };
}
