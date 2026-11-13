/**
 * Runs a command that proves a piece of work (a test, a build, a grep), for real, and says
 * whether it passed. It runs inside macOS's sandbox with the same fence the assistant's own
 * terminal has in a Mission mode: it may write only inside the conversation's folder and in the
 * system's temporary folders.
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

export const CHECK_MS = 10 * 60_000;
export const OUTPUT_MAX = 6000;
const SANDBOX = '/usr/bin/sandbox-exec';

/** The sandbox rules: everything may be read and run; writing only inside the folder and temp. */
export function fence(root) {
  const q = (path) => JSON.stringify(String(path));
  return [
    '(version 1)',
    '(allow default)',
    '(deny file-write*)',
    `(allow file-write* (subpath ${q(root)}) (subpath "/private/tmp") (subpath "/tmp") (subpath "/private/var/folders") (subpath "/var/folders") (subpath "/dev"))`,
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
 * @returns {Promise<{ok: boolean, code: number | null, output: string, timedOut: boolean, seconds: number}>} how it ended and the end of what it printed.
 */
export async function runCommand({ command, root, timeoutMs = CHECK_MS, signal }) {
  const path = await userPath();
  const started = Date.now();
  const confined = existsSync(SANDBOX);
  const args = confined ? ['-p', fence(root), '/bin/bash', '-c', command] : ['-c', command];
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(confined ? SANDBOX : '/bin/bash', args, { cwd: root, env: { ...process.env, PATH: path, HOME: homedir(), CI: '1', TERM: 'dumb', NO_COLOR: '1', FORCE_COLOR: '0' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
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
