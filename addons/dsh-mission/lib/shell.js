/**
 * Runs a command that proves a piece of work (a test, a build, a grep), for real, and says
 * whether it passed. It runs inside macOS's sandbox with the same fence the assistant's own
 * terminal has in a Mission mode: it may write only inside the conversation's folder and in the
 * system's temporary folders.
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CHECK_MS = 10 * 60_000;
export const OUTPUT_MAX = 6000;
const SANDBOX = '/usr/bin/sandbox-exec';

/**
 * Device ports and disks, closed to a Bench Long run's checks: serial ports (/dev/cu.*, /dev/tty.*)
 * and disks (/dev/disk*, /dev/rdisk*). /dev/null and the like stay open.
 */
export const DEVICE_PORTS = '(deny file-read* file-write* (regex #"^/dev/(cu|tty)\\.") (regex #"^/dev/r?disk"))';

/**
 * The sandbox rules: everything may be read and run; writing only inside the folder and temp.
 * @param {string} root - the folder.
 * @param {{closePorts?: boolean}} [options] - also close the device ports (a Bench Long run); the last rule wins.
 * @returns {string} the profile.
 */
export function fence(root, { closePorts = false } = {}) {
  const q = (path) => JSON.stringify(String(path));
  return [
    '(version 1)',
    '(allow default)',
    '(deny file-write*)',
    `(allow file-write* (subpath ${q(root)}) (subpath "/private/tmp") (subpath "/tmp") (subpath "/private/var/folders") (subpath "/var/folders") (subpath "/dev"))`,
    ...(closePorts ? [DEVICE_PORTS] : []),
  ].join('\n');
}

/**
 * The sandbox rules for a Recon Long run's checks (Settings → Recon, off unless switched on): no
 * network and no name lookups, no Mac services (nothing can ask another program to go online), no
 * launching apps or scripts (open, osascript, Shortcuts, Automator), nothing of the user's home folder
 * or other disks is read, writing only inside the run's folder, device ports closed.
 * Tried on macOS 27.2: a local server reachable from outside was refused inside ("Operation not
 * permitted"), a name lookup failed, test, grep, wc, sort, sed, awk, ls, cat, find and python worked.
 * @param {string} root - the run's folder.
 * @param {string} [home] - the user's home folder.
 * @returns {string} the profile.
 */
export function offlineFence(root, home = homedir()) {
  const q = (path) => JSON.stringify(String(path));
  let real = root;
  try {
    real = realpathSync(root);
  } catch {
    real = root;
  }
  const folders = [...new Set([root, real])].map((path) => `(subpath ${q(path)})`).join(' ');
  return [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    '(deny file-write*)',
    `(allow file-write* ${folders} (literal "/dev/null") (literal "/dev/zero") (literal "/dev/dtracehelper") (literal "/dev/tty"))`,
    `(deny file-read* (subpath ${q(home)}) (subpath "/Volumes"))`,
    `(allow file-read* ${folders})`,
    '(deny mach-lookup)',
    '(deny process-exec (literal "/usr/bin/open") (literal "/usr/bin/osascript") (literal "/usr/bin/shortcuts") (literal "/usr/bin/automator"))',
    DEVICE_PORTS,
  ].join('\n');
}

let pathOnce;
/**
 * The PATH of the user's own shell, so commands such as npm are found. An app started from the
 * Finder has only the system's short PATH.
 * @returns {Promise<string>} the PATH.
 */
export function userPath() {
  pathOnce ??= new Promise((resolve) => {
    const fallback = [process.env.PATH, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].filter(Boolean).join(':');
    const shell = process.env.SHELL && existsSync(process.env.SHELL) ? process.env.SHELL : '/bin/zsh';
    // The marker keeps whatever a profile prints out of the answer.
    execFile(shell, ['-lic', 'printf "__DSH_PATH__%s__DSH_END__" "$PATH"'], { timeout: 8000, env: { ...process.env, TERM: 'dumb' } }, (_error, stdout) => {
      const found = /__DSH_PATH__(.*?)__DSH_END__/s.exec(String(stdout ?? ''))?.[1];
      resolve(found ? [...new Set([...found.split(':'), ...fallback.split(':')])].filter(Boolean).join(':') : fallback);
    });
  });
  return pathOnce;
}

/**
 * Run one command in the folder.
 * @param {object} job - the command.
 * @param {string} job.command - a shell command line.
 * @param {string} job.root - the folder to run it in.
 * @param {number} [job.timeoutMs] - stop it after this long.
 * @param {AbortSignal} [job.signal] - stops it early.
 * @param {boolean} [job.closePorts] - close the device ports (a Bench Long run); without the sandbox the command is not run.
 * @param {boolean} [job.offline] - a Recon Long run's check: no internet, the run's folder only (offlineFence); without the sandbox it is not run.
 * @returns {Promise<{ok: boolean, code: number | null, output: string, timedOut: boolean, seconds: number}>} how it ended and the end of what it printed.
 */
export async function runCommand({ command, root, timeoutMs = CHECK_MS, signal, closePorts = false, offline = false, sandbox = SANDBOX }) {
  const path = await userPath();
  const started = Date.now();
  const confined = existsSync(sandbox);
  // Ports and the internet can be closed only by the sandbox: without it, such a check is not run at all.
  if (offline && !confined) return { ok: false, code: null, output: "The Mac's sandbox is not available, so this check was not run: in Recon, checks must run without the internet.", timedOut: false, seconds: 0 };
  if (closePorts && !confined) return { ok: false, code: null, output: "The Mac's sandbox is not available, so this check was not run: in Bench, device ports must stay closed to checks.", timedOut: false, seconds: 0 };
  // An offline check keeps its temporary files in the run's own folder, the only place it may write.
  let temp = '';
  if (offline) {
    temp = join(root, '.dsh-mission', 'tmp');
    mkdirSync(temp, { recursive: true, mode: 0o700 });
  }
  const profile = offline ? offlineFence(root) : fence(root, { closePorts });
  const args = confined ? ['-p', profile, '/bin/bash', '-c', command] : ['-c', command];
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(confined ? sandbox : '/bin/bash', args, { cwd: root, env: { ...process.env, PATH: path, HOME: homedir(), CI: '1', TERM: 'dumb', NO_COLOR: '1', FORCE_COLOR: '0', ...(temp ? { TMPDIR: temp } : {}) }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    } catch (error) {
      resolve({ ok: false, code: null, output: `The command could not be started: ${error.message}`, timedOut: false, seconds: 0 });
      return;
    }
    let text = '';
    const take = (chunk) => {
      text += chunk.toString('utf8');
      // Only the end matters, and a chatty command must not fill memory.
      if (text.length > OUTPUT_MAX * 4) text = text.slice(-OUTPUT_MAX * 2);
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    let timedOut = false;
    const stop = () => {
      // The whole group: a test runner's own children must not live on.
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);
    signal?.addEventListener('abort', stop, { once: true });
    const done = (code, extra = '') => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      let output = (text + extra).replace(/\r/g, '').trim();
      if (output.length > OUTPUT_MAX) output = `…${output.slice(-OUTPUT_MAX)}`;
      if (timedOut) output += `\nStopped: it ran longer than ${Math.round(timeoutMs / 60000)} minutes.`;
      resolve({ ok: code === 0 && !timedOut && !signal?.aborted, code, output, timedOut, seconds: Math.round((Date.now() - started) / 100) / 10 });
    };
    child.on('error', (error) => done(null, `\nThe command could not be started: ${error.message}`));
    child.on('close', (code) => done(code));
  });
}
