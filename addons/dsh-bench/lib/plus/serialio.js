/**
 * Talking to a serial port without a shell (rule 1): `stty -f <port> <baud> raw …` sets the line, `cat <port>`
 * reads it for a set time (both run by full path with an argument list), and a write opens the port with
 * O_WRONLY | O_NONBLOCK | O_NOCTTY from this process. Only a checked port and a speed from the fixed list
 * are ever used.
 *
 * Opening a port raises its control lines (DTR, RTS), which restarts many boards (Arduino, ESP32): the
 * tools that open a port say so in their descriptions.
 */
import { closeSync, constants, openSync, readdirSync, writeSync } from 'node:fs';
import { baudOf, runProgram, serialPort, tail } from './core.js';

/** stty's fixed arguments after the port and speed. */
export const LINE_ARGS = ['raw', '-echo', '-hupcl', 'clocal', 'cs8', '-cstopb', '-parenb'];
const io = (deps) => ({ openSync, writeSync, closeSync, readdirSync, ...(deps?.fs ?? {}) });

/** Set a port's speed and raw mode. */
export async function setLine(deps, port, baud) {
  const checked = serialPort(port);
  const speed = baudOf(baud);
  const result = await runProgram(deps, 'stty', ['-f', checked, String(speed), ...LINE_ARGS], { timeoutMs: 10_000 });
  if (result.code !== 0) throw new Error(`the port ${checked} could not be set up (${tail(result.err) || `stty ended with ${result.code}`}); is it plugged in, and not open in another program?`);
}

/** Read a port for `ms` milliseconds (cat is stopped when the time is up). */
export async function readFor(deps, port, ms) {
  const result = await runProgram(deps, 'cat', [serialPort(port)], { timeoutMs: Math.max(100, Math.min(60_000, Math.round(ms))), maxBuffer: 2 * 1024 * 1024 });
  return result.out;
}

/** Write text to a port (opened write-only, without becoming the controlling terminal). */
export async function writeTo(deps, port, text) {
  const fs = io(deps);
  const fd = fs.openSync(serialPort(port), constants.O_WRONLY | constants.O_NONBLOCK | constants.O_NOCTTY);
  try {
    const bytes = Buffer.from(String(text), 'latin1');
    let done = 0;
    for (let tries = 0; done < bytes.length && tries < 50; tries += 1) {
      try {
        done += fs.writeSync(fd, bytes, done, bytes.length - done);
      } catch (error) {
        if (error?.code !== 'EAGAIN') throw error;
        await deps.sleep(20);
      }
    }
    if (done < bytes.length) throw new Error(`the port ${port} did not take the whole command`);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Set the line, start reading, send each step (text, then a wait), and return all that came back.
 * @param {{text: string, waitMs: number}[]} steps - what is sent, in order.
 * @returns {Promise<string>} what the device answered.
 */
export async function exchange(deps, port, baud, steps, { tailMs = 300 } = {}) {
  await setLine(deps, port, baud);
  const total = steps.reduce((sum, step) => sum + step.waitMs, 0) + tailMs + 200;
  const reading = readFor(deps, port, total);
  reading.catch(() => {});
  await deps.sleep(150);
  for (const step of steps) {
    await writeTo(deps, port, step.text);
    await deps.sleep(step.waitMs);
  }
  return reading;
}

/** The Mac's own ports (Bluetooth, debug consoles), never a device's. */
const OWN = /^cu\.(?:Bluetooth-Incoming-Port|debug-console|wlan-debug|.*-WirelessiAP)$/i;

/** The serial ports in /dev now (cu.… only: the call-out side), without the Mac's own. */
export function serialPorts(deps) {
  try {
    return io(deps).readdirSync('/dev').map(String).filter((name) => /^cu\.[A-Za-z0-9._-]{1,80}$/.test(name) && !OWN.test(name)).map((name) => `/dev/${name}`).sort();
  } catch {
    return [];
  }
}
