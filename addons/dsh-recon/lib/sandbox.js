/**
 * Runs Recon's fetch process locked down, one process per page. The lock is the macOS sandbox:
 *   - network: one local port, the proxy's. Nothing else, so no name is ever looked up on this
 *     Mac and nothing can go around the proxy;
 *   - files: it cannot read the user's folders or other disks, and cannot write anywhere;
 *   - it cannot start another program.
 * It gets a clean environment and is given a time limit.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const SANDBOX = '/usr/bin/sandbox-exec';
// An .mjs file on purpose: the locked process may read only this folder, so it cannot look at the
// package file one folder up to learn what kind of script a .js file is.
export const CHILD = fileURLToPath(new URL('./fetch-child.mjs', import.meta.url));
const q = (path) => `"${String(path).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * The lock, as the macOS sandbox reads it.
 * @param {object} input - `proxyPort`, `bin` (the program that runs the script), `script`.
 * @returns {string} the profile.
 */
export function profile({ proxyPort, bin, script }) {
  const port = Number(proxyPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('The proxy port is not usable.');
  return [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    `(allow network-outbound (remote tcp "localhost:${port}"))`,
    '(deny file-read-data (subpath "/Users") (subpath "/Volumes") (subpath "/private/var/root"))',
    `(allow file-read-data (subpath ${q(dirname(script))}) (subpath ${q(dirname(bin))}))`,
    '(deny file-write*)',
    '(allow file-write* (literal "/dev/null") (literal "/dev/dtracehelper"))',
    '(deny process-fork)',
    '(deny process-exec*)',
    `(allow process-exec* (literal ${q(bin)}))`,
  ].join('\n');
}

/**
 * Run one request in a locked process.
 * @param {object} request - what the fetch process is asked (see fetch-child.mjs).
 * @param {object} options - `proxyPort`, `bin` (default: the program running the app), `timeoutMs`.
 * @returns {Promise<object>} the process's answer; `{ok: false, why}` when it gave none.
 */
export function runLocked(request, { proxyPort, bin = process.execPath, timeoutMs = 90_000 } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(SANDBOX, ['-p', profile({ proxyPort, bin, script: CHILD }), bin, CHILD], {
        // Nothing of the app's environment goes in: no paths, no tokens, no proxy settings.
        env: { ELECTRON_RUN_AS_NODE: '1', LANG: 'C', TZ: 'UTC' },
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: '/',
      });
    } catch (error) {
      resolve({ ok: false, why: `the locked process could not be started (${String(error?.message ?? error).slice(0, 120)})` });
      return;
    }
    const out = [];
    let size = 0;
    let errors = '';
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish({ ok: false, why: 'the page did not arrive in time' }), timeoutMs);
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > 6_000_000) return finish({ ok: false, why: 'the answer was too large' });
      out.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      if (errors.length < 2000) errors += chunk.toString('utf8');
    });
    child.on('error', (error) => finish({ ok: false, why: `the locked process failed (${String(error?.message ?? error).slice(0, 120)})` }));
    child.on('close', () => {
      try {
        const answer = JSON.parse(Buffer.concat(out).toString('utf8'));
        finish(answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : { ok: false, why: 'the locked process gave no usable answer' });
      } catch {
        finish({ ok: false, why: `the locked process gave no answer${errors ? ` (${errors.trim().split('\n').pop().slice(0, 160)})` : ''}` });
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(request));
  });
}
