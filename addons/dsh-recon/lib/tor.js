/**
 * Recon's own Tor. It is started when a Recon conversation first needs it and stopped when the
 * app closes or Recon is switched off. It keeps its state in a throwaway folder that is deleted
 * when it stops, listens only on this Mac, and never looks a name up for anyone: every request
 * must carry the name itself, so nothing can leak a lookup.
 *
 * The `tor` program is not part of Plus. The user installs it; this file only finds and runs it.
 */
import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Where a `tor` installed with Homebrew or by hand usually is. */
export const TOR_PLACES = ['/opt/homebrew/bin/tor', '/usr/local/bin/tor', '/opt/local/bin/tor', '/usr/bin/tor'];

/**
 * @param {string} [chosen] - a path the user set; '' looks in the usual places.
 * @returns {string} the program's path, or '' when there is none.
 */
export function findTor(chosen = '') {
  const own = String(chosen ?? '').trim();
  if (own) return existsSync(own) ? own : '';
  return TOR_PLACES.find((path) => existsSync(path)) ?? '';
}

/** A port on this Mac that nobody is using right now. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * @param {object} options - `bin()` (the program's path, '' when missing), `through()` (an upstream
 *   SOCKS5 proxy as 'host:port' for "Tor through WireGuard", '' for none), `env` (for tests), `startMs`.
 * @returns {object} start, stop and status.
 */
export function createTor({ bin, through = () => '', env, startMs = 150_000 } = {}) {
  let child;
  let dir = '';
  let port = 0;
  let state = 'stopped';
  let percent = 0;
  let detail = '';
  let starting;
  let via = '';

  const clean = () => {
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* removed at the next start */
      }
    }
    dir = '';
    port = 0;
    child = undefined;
    percent = 0;
  };

  const stop = () =>
    new Promise((resolve) => {
      const running = child;
      starting = undefined;
      if (!running || running.exitCode !== null) {
        clean();
        state = 'stopped';
        detail = '';
        resolve();
        return;
      }
      const hard = setTimeout(() => {
        try {
          running.kill('SIGKILL');
        } catch {
          /* gone */
        }
      }, 4000);
      running.once('exit', () => {
        clearTimeout(hard);
        clean();
        state = 'stopped';
        detail = '';
        resolve();
      });
      try {
        running.kill('SIGTERM');
      } catch {
        clearTimeout(hard);
        clean();
        state = 'stopped';
        resolve();
      }
    });

  const start = () => {
    if (state === 'ready') return Promise.resolve(port);
    if (starting) return starting;
    starting = (async () => {
      const program = String(bin?.() ?? '');
      if (!program) {
        state = 'missing';
        detail = 'The tor program is not installed.';
        throw new Error(detail);
      }
      state = 'starting';
      detail = '';
      percent = 0;
      via = String(through?.() ?? '');
      dir = mkdtempSync(join(tmpdir(), 'dsh-recon-tor-'));
      chmodSync(dir, 0o700);
      port = await freePort();
      const args = [
        '--SocksPort', `127.0.0.1:${port}`,
        '--DataDirectory', dir,
        '--ClientOnly', '1',
        '--AvoidDiskWrites', '1',
        // Refuse any request that already looked a name up outside Tor.
        '--SafeSocks', '1',
        '--Log', 'notice stdout',
        ...(via ? ['--Socks5Proxy', via] : []),
      ];
      await new Promise((resolve, reject) => {
        let settled = false;
        const done = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve();
        };
        const timer = setTimeout(() => done(new Error(`Tor did not connect within ${Math.round(startMs / 1000)} seconds (it reached ${percent}%).`)), startMs);
        try {
          child = spawn(program, args, { env: env ?? { HOME: dir, LANG: 'C', TZ: 'UTC', PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe'], cwd: dir });
        } catch (error) {
          done(new Error(`Tor could not be started: ${String(error?.message ?? error).slice(0, 160)}`));
          return;
        }
        let tail = '';
        const read = (chunk) => {
          tail = (tail + chunk.toString('utf8')).slice(-4000);
          for (const match of tail.matchAll(/Bootstrapped (\d{1,3})%/g)) percent = Math.max(percent, Number(match[1]));
          if (percent >= 100) done();
        };
        child.stdout.on('data', read);
        child.stderr.on('data', read);
        child.on('error', (error) => done(new Error(`Tor could not be started: ${String(error?.message ?? error).slice(0, 160)}`)));
        child.on('exit', (code) => {
          const last = tail.trim().split('\n').filter((line) => /\[(warn|err)\]/.test(line)).pop() ?? '';
          if (state === 'ready') {
            // It stopped by itself: nothing goes out any more, and nothing falls back to another way.
            clean();
            state = 'failed';
            detail = 'Tor stopped by itself. Nothing is sent until it is started again.';
          }
          done(new Error(`Tor stopped while starting (code ${code}). ${last.replace(/^.*?\[(warn|err)\]\s*/, '').slice(0, 200)}`.trim()));
        });
      });
      state = 'ready';
      detail = '';
      return port;
    })().catch(async (error) => {
      const why = String(error?.message ?? error);
      const missing = state === 'missing';
      await stop();
      state = missing ? 'missing' : 'failed';
      detail = why;
      throw new Error(why);
    }).finally(() => {
      starting = undefined;
    });
    return starting;
  };

  return {
    start,
    stop,
    /** @returns {{state: string, percent: number, port: number, detail: string, through: string, folder: string}} where it stands. `port` is 0 unless it is ready; `folder` is its throwaway folder while it runs. */
    status: () => ({ state: state === 'stopped' && !String(bin?.() ?? '') ? 'missing' : state, percent, port: state === 'ready' ? port : 0, detail, through: via, folder: dir }),
  };
}

/**
 * @param {string} program - the tor program.
 * @returns {Promise<string>} its version, '' when it cannot be told.
 */
export function torVersion(program) {
  return new Promise((resolve) => {
    if (!program) return resolve('');
    execFile(program, ['--version'], { timeout: 5000, env: { LANG: 'C', PATH: '/usr/bin:/bin' } }, (error, stdout) => resolve(error ? '' : (/Tor version ([\w.-]+)/.exec(String(stdout))?.[1] ?? '').replace(/\.$/, '')));
  });
}
