/**
 * Network throughput and connections: this Mac's interface counters (`netstat -ibn`, no root needed), a
 * router's /proc/net/dev over SSH (a fixed remote command), and this user's established TCP connections
 * (`lsof -nP -iTCP -sTCP:ESTABLISHED`).
 */
import { SSH_OPTIONS, sshHost } from './net.js';
import { failure, runProgram } from './core.js';

/**
 * `netstat -ibn` as {interface: {rx, tx}} byte totals, from each interface's <Link#n> row (it holds the
 * totals). A row without a hardware address has one column less.
 */
export function parseNetstat(text) {
  const out = {};
  for (const line of String(text ?? '').split('\n')) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 10 || !/^<Link#\d+>$/.test(cols[2] ?? '')) continue;
    const name = cols[0].replace(/\*$/, '');
    if (!/^[A-Za-z0-9._-]{1,32}$/.test(name) || name in out) continue;
    const [rx, tx] = cols.length >= 11 ? [Number(cols[6]), Number(cols[9])] : [Number(cols[5]), Number(cols[8])];
    if (Number.isFinite(rx) && Number.isFinite(tx)) out[name] = { rx, tx };
  }
  return out;
}

/** A router's /proc/net/dev as {interface: {rx, tx}}. */
export function parseProcNetDev(text) {
  const out = {};
  for (const line of String(text ?? '').split('\n')) {
    const at = line.indexOf(':');
    if (at < 0) continue;
    const name = line.slice(0, at).trim();
    if (!/^[A-Za-z0-9._@-]{1,32}$/.test(name)) continue;
    const numbers = line.slice(at + 1).trim().split(/\s+/).map(Number);
    if (numbers.length < 9 || !Number.isFinite(numbers[0]) || !Number.isFinite(numbers[8])) continue;
    out[name] = { rx: numbers[0], tx: numbers[8] };
  }
  return out;
}

/** Bytes per second between two snapshots taken `ms` apart (a counter that went back counts as 0). */
export function rates(before, after, ms) {
  const seconds = Math.max(0.001, ms / 1000);
  const out = {};
  for (const [name, now] of Object.entries(after ?? {})) {
    const then = (before ?? {})[name];
    if (!then) continue;
    out[name] = { rx: Math.max(0, now.rx - then.rx) / seconds, tx: Math.max(0, now.tx - then.tx) / seconds };
  }
  return out;
}

/** `lsof -nP -iTCP -sTCP:ESTABLISHED` as rows: process, pid, local and remote address. */
export function parseLsof(text) {
  const rows = [];
  for (const line of String(text ?? '').split('\n').slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 9) continue;
    const name = cols.find((col) => col.includes('->'));
    if (!name) continue;
    const [local, remote] = name.split('->');
    rows.push({ process: cols[0].replace(/\\x20/g, ' '), pid: cols[1], local, remote });
  }
  return rows;
}

export function humanRate(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes.toFixed(0)} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB/s`;
}

export async function readInterfaceCounters(deps) {
  const result = await runProgram(deps, 'netstat', ['-ibn'], { timeoutMs: 8000 });
  if (result.code !== 0) throw new Error(failure(result, 'netstat'));
  return parseNetstat(result.out);
}

export async function readRouterCounters(deps, host) {
  const result = await runProgram(deps, 'ssh', [...SSH_OPTIONS, sshHost(host), 'cat /proc/net/dev'], { timeoutMs: 12_000 });
  if (result.code !== 0) throw new Error(failure(result, `ssh to ${host}`));
  return parseProcNetDev(result.out);
}

export async function readConnections(deps) {
  const result = await runProgram(deps, 'lsof', ['-nP', '-iTCP', '-sTCP:ESTABLISHED'], { timeoutMs: 10_000 });
  // lsof ends with 1 when it found nothing.
  if (result.code !== 0 && result.out.trim()) throw new Error(failure(result, 'lsof'));
  return parseLsof(result.out);
}
