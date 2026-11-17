/**
 * OBD-II over an ELM327 serial adapter, as Bench Plus read it: fixed AT commands and fixed mode-01 PIDs
 * (current data, read only) are the only things sent; nothing the model writes reaches the adapter.
 * Reading a car is reading: no PID here changes anything on it.
 */
import { exchange } from './serialio.js';

/** The values Bench asks for, and how each is decoded (SAE J1979, mode 01). */
export const PIDS = {
  '010C': { name: 'rpm', decode: ([a, b]) => (b === undefined ? null : (a * 256 + b) / 4) },
  '010D': { name: 'speedKph', decode: ([a]) => a },
  '0105': { name: 'coolantC', decode: ([a]) => a - 40 },
  '015C': { name: 'oilC', decode: ([a]) => a - 40 },
  '010F': { name: 'intakeC', decode: ([a]) => a - 40 },
  '0104': { name: 'loadPct', decode: ([a]) => (a * 100) / 255 },
  '0111': { name: 'throttlePct', decode: ([a]) => (a * 100) / 255 },
  '012F': { name: 'fuelPct', decode: ([a]) => (a * 100) / 255 },
  '0142': { name: 'moduleV', decode: ([a, b]) => (b === undefined ? null : (a * 256 + b) / 1000) },
};
/** What a read asks; a monitor asks the first five each time. */
export const READ_PIDS = Object.keys(PIDS);
export const MONITOR_PIDS = ['010C', '010D', '0105', '0111', '0142'];
/** Wakes the adapter: reset, echo off, line feeds off, headers off, automatic protocol. */
export const INIT = ['ATZ', 'ATE0', 'ATL0', 'ATH0', 'ATSP0'];

/** Decode one PID's bytes into a number, or null. */
export function decodePid(pid, bytes) {
  const entry = PIDS[pid];
  if (!entry || !Array.isArray(bytes) || bytes.length === 0) return null;
  const value = entry.decode(bytes);
  return Number.isFinite(value) ? value : null;
}

/** One response line ("41 0C 1A F8" or "410C1AF8") as {pid, bytes}, or null. */
export function parseLine(line) {
  let parts = String(line ?? '').toUpperCase().replace(/[^0-9A-F ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1 && parts[0].length >= 6 && parts[0].length % 2 === 0) parts = parts[0].match(/../g);
  if (parts.length < 3 || parts[0] !== '41' || !parts.every((part) => /^[0-9A-F]{2}$/.test(part))) return null;
  return { pid: `01${parts[1]}`, bytes: parts.slice(2).map((part) => Number.parseInt(part, 16)) };
}

/** A whole adapter dump decoded: {values, raw, notes} (the first answer of each PID counts). */
export function parseDump(text) {
  const values = {};
  const raw = {};
  const notes = new Set();
  for (const line of String(text ?? '').split(/\r\n|\r|\n|>/)) {
    const trimmed = line.trim();
    if (/^(?:NO DATA|SEARCHING\.*|UNABLE TO CONNECT|BUS INIT.*|CAN ERROR|STOPPED|\?|ELM327.*|BUS BUSY|FB ERROR|DATA ERROR)$/i.test(trimmed)) notes.add(trimmed.toUpperCase().slice(0, 40));
    const parsed = parseLine(trimmed);
    if (!parsed || raw[parsed.pid]) continue;
    raw[parsed.pid] = parsed.bytes;
    const value = decodePid(parsed.pid, parsed.bytes);
    if (value !== null) values[PIDS[parsed.pid].name] = Math.round(value * 10) / 10;
  }
  return { values, raw, notes: [...notes] };
}

/** The steps sent: the wake-up (when asked) then the PIDs, each with its wait. */
export function obdSteps({ init = true, pids = READ_PIDS } = {}) {
  const steps = [];
  if (init) {
    steps.push({ text: 'ATZ\r', waitMs: 1200 });
    for (const command of INIT.slice(1)) steps.push({ text: `${command}\r`, waitMs: 300 });
    // The first request after ATSP0 searches the car's protocol, which can take a few seconds.
    steps.push({ text: '0100\r', waitMs: 4000 });
  }
  for (const pid of pids) steps.push({ text: `${pid}\r`, waitMs: 400 });
  return steps;
}

/**
 * Ask a car for its current values through an ELM327 adapter.
 * @returns {Promise<{values: object, raw: object, notes: string[], dump: string}>} what it answered.
 */
export async function queryObd(deps, port, baud, { init = true, pids = READ_PIDS } = {}) {
  const dump = await exchange(deps, port, baud, obdSteps({ init, pids }));
  return { ...parseDump(dump), dump };
}
