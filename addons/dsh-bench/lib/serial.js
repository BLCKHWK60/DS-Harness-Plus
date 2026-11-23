/**
 * Reading a device's serial port for a while (plan B3, and the owner's wish to watch a live signal
 * for a long time). It only reads: nothing is ever sent to the device.
 *
 * How the port is opened, on macOS: `stty -f <port> <baud> raw -echo -hupcl clocal cs8 -cstopb -parenb`
 * sets the line (fixed arguments; -hupcl keeps the control lines up when the port is closed, clocal
 * ignores the modem lines), then `/bin/cat <port>` reads it, and is stopped when the time is up.
 * Opening a port raises its control lines (DTR, RTS), which restarts many boards (ESP32 and Arduino
 * boards reset through them); macOS gives no way around that without a native module, so the user is
 * told before the first open of each device.
 */
import { spawn } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { appendNoLink, mask } from './cards.js';

/** Speeds a port may be opened at. */
export const BAUDS = [9600, 19200, 38400, 57600, 74880, 115200, 230400, 460800, 921600];
/** The longest single watch; a Long run calls again for longer. */
export const WATCH_MAX_MINUTES = 60;
/** Lines kept in memory for the answer (all of them go to the log file). */
const NEWEST = 40;
const LINE_MAX = 400;

/** The Mac's own ports, never a device's. */
const OWN = /^\/dev\/cu\.(Bluetooth-Incoming-Port|debug-console|wlan-debug|.*-WirelessiAP)$/i;

/** @returns {string} why a port may not be opened, or ''. */
export function portRefusal(port, shown) {
  const value = String(port ?? '');
  if (!/^\/dev\/cu\.[A-Za-z0-9._-]{1,80}$/.test(value)) return `"${value.slice(0, 80)}" is not a serial port Devices opens: give a /dev/cu.… port that bench_usb listed.`;
  if (OWN.test(value)) return `${value} is the Mac's own port, not a device's.`;
  if (shown && !shown.has(value)) return `${value} was not listed by bench_usb in this thread in the last hour. Call bench_usb first, then use a port it listed for a device.`;
  return '';
}

/** The readers running now: stopped when the app quits, so no port stays open behind it. */
const running = new Set();
let exitHooked = false;
const stopAll = () => {
  for (const child of running) {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
  running.clear();
};

/** One line from a device, as it is kept and shown: no control characters, secrets masked, cut. */
export function deviceLine(text) {
  return mask(String(text ?? '').replace(/\r/g, '').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, ' ').trimEnd()).slice(0, LINE_MAX);
}

/**
 * The serial reader.
 * @param {{stty: string, cat: string, spawnFn?: typeof spawn, now?: () => Date}} programs - full paths of stty and cat (stand-ins in tests).
 * @returns {{watch: Function}} the reader.
 */
export function createSerial({ stty, cat, spawnFn = spawn, now = () => new Date() }) {
  /** Run stty with fixed arguments. */
  const setLine = (port, baud) => new Promise((resolve, reject) => {
    const child = spawnFn(stty, ['-f', port, String(baud), 'raw', '-echo', '-hupcl', 'clocal', 'cs8', '-cstopb', '-parenb'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr?.on('data', (chunk) => { err += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`the port could not be set up (${err.trim().slice(0, 160) || `stty ended with ${code}`})`));
    });
  });

  return {
    /**
     * Read a port for a while and keep every line, with its time, in a log file.
     * @param {{port: string, baud: number, seconds: number, logFile: string, signal?: AbortSignal}} job - what to read.
     * @returns {Promise<{lines: number, bytes: number, newest: string[], startedAt: Date, endedAt: Date, stoppedEarly: boolean}>} what was read.
     */
    async watch({ port, baud, seconds, logFile, signal }) {
      if (!BAUDS.includes(Number(baud))) throw new Error(`The speed ${baud} is not one Devices uses: ${BAUDS.join(', ')}.`);
      const span = Math.max(1, Math.min(WATCH_MAX_MINUTES * 60, Math.round(Number(seconds) || 0)));
      try {
        if (lstatSync(logFile).isSymbolicLink()) throw new Error('The log file is a link; Devices does not write through links.');
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      await setLine(port, baud);
      const startedAt = now();
      let lines = 0;
      let bytes = 0;
      let rest = '';
      const newest = [];
      let pending = [];
      const flush = () => {
        if (pending.length === 0) return;
        appendNoLink(logFile, `${pending.join('\n')}\n`);
        pending = [];
      };
      const keep = (raw) => {
        const line = deviceLine(raw);
        if (!line.trim()) return;
        lines += 1;
        const stamped = `${now().toISOString()}  ${line}`;
        pending.push(stamped);
        newest.push(stamped);
        if (newest.length > NEWEST) newest.shift();
        if (pending.length >= 200) flush();
      };
      const child = spawnFn(cat, [port], { stdio: ['ignore', 'pipe', 'ignore'] });
      running.add(child);
      if (!exitHooked) {
        exitHooked = true;
        process.once('exit', stopAll);
      }
      let stoppedEarly = false;
      await new Promise((resolve) => {
        let finished = false;
        const end = () => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          clearInterval(flusher);
          signal?.removeEventListener?.('abort', onAbort);
          running.delete(child);
          try { child.kill('SIGTERM'); } catch { /* already gone */ }
          setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already gone */ } }, 2000).unref?.();
          resolve();
        };
        const onAbort = () => { stoppedEarly = true; end(); };
        const timer = setTimeout(end, span * 1000);
        const flusher = setInterval(flush, 1000);
        signal?.addEventListener?.('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
        child.stdout.on('data', (chunk) => {
          bytes += chunk.length;
          const text = rest + chunk.toString('utf8');
          const parts = text.split('\n');
          rest = parts.pop() ?? '';
          if (rest.length > 4000) { keep(rest); rest = ''; }
          for (const part of parts) keep(part);
        });
        child.on('error', () => { stoppedEarly = true; end(); });
        child.on('close', () => { if (!finished) stoppedEarly = true; end(); });
      });
      if (rest) keep(rest);
      flush();
      return { lines, bytes, newest, startedAt, endedAt: now(), stoppedEarly };
    },
  };
}
