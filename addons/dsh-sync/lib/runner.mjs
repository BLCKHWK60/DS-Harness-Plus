// lib/runner.mjs — dsh-sync addition. Runs git and age as plain child processes (no shell), replacing the original's
// dependency on dsh's subprocess service so this plugin imports nothing from dsh.
import { spawn } from 'node:child_process'

/** Environment added to every git call: no prompts, no optional locks, and only these transports (never `ext::`). */
export const GIT_ENV = Object.freeze({
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_ALLOW_PROTOCOL: 'file:git:http:https:ssh',
})

/**
 * Run a program without a shell and collect its output.
 * @param {string} file - program.
 * @param {string[]} args - arguments.
 * @param {{cwd?: string, timeoutMs?: number, signal?: AbortSignal, binary?: boolean, maxBytes?: number, env?: object}} [options] - options.
 * @returns {Promise<{code: number, stdout: string | Buffer, stderr: string}>} exit code and output; rejects on spawn failure, timeout, abort or oversize output.
 */
export function runProcess(file, args, options = {}) {
  const { cwd, timeoutMs = 120000, signal, binary = false, maxBytes = 262144, env = {} } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('sync operation aborted'));
      return;
    }
    let child;
    try {
      child = spawn(file, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (error) {
      reject(error);
      return;
    }
    const out = [];
    const err = [];
    let outBytes = 0;
    let errBytes = 0;
    let failure = null;
    const kill = (reason) => {
      if (failure) return;
      failure = reason;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    };
    const timer = setTimeout(() => kill(new Error(`${file.split('/').pop()} ${args[0] ?? ''} timed out after ${timeoutMs}ms`)), timeoutMs);
    const onAbort = () => kill(signal.reason instanceof Error ? signal.reason : new Error('sync operation aborted'));
    signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout.on('data', (chunk) => {
      outBytes += chunk.length;
      if (outBytes > maxBytes) {
        kill(new Error(`output of ${file.split('/').pop()} ${args[0] ?? ''} exceeded ${maxBytes} bytes`));
        return;
      }
      out.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      errBytes += chunk.length;
      if (errBytes <= maxBytes) err.push(chunk);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(error);
    });
    child.on('close', (code, sig) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (failure) {
        reject(failure);
        return;
      }
      const stdout = Buffer.concat(out);
      resolve({ code: code ?? (sig ? 128 : 0), stdout: binary ? stdout : stdout.toString('utf8'), stderr: Buffer.concat(err).toString('utf8') });
    });
  });
}

/**
 * The git runner the backend expects: `run(args, {cwd, binary, timeoutMs, signal})`.
 * @param {{gitBin: string, commandTimeoutMs: number, maxOutputBytes: number, maxBinaryBytes: number}} settings - settings.
 * @returns {(args: string[], options?: object) => Promise<{code: number, stdout: string | Buffer, stderr: string}>} runner.
 */
export function makeGitRunner(settings) {
  return (args, options = {}) =>
    runProcess(settings.gitBin, args, {
      cwd: options.cwd,
      timeoutMs: options.timeoutMs ?? settings.commandTimeoutMs,
      signal: options.signal,
      binary: options.binary === true,
      maxBytes: options.binary === true ? settings.maxBinaryBytes : settings.maxOutputBytes,
      env: GIT_ENV,
    });
}

/**
 * The age runner the encrypted backend expects: `run([exe, ...args], {cwd, timeoutMs, signal})`.
 * @param {{commandTimeoutMs: number, maxOutputBytes: number}} settings - settings.
 * @returns {(argv: string[], options?: object) => Promise<{code: number, stdout: string, stderr: string}>} runner.
 */
export function makeAgeRunner(settings) {
  return (argv, options = {}) =>
    runProcess(argv[0], argv.slice(1), {
      cwd: options.cwd,
      timeoutMs: options.timeoutMs ?? settings.commandTimeoutMs,
      signal: options.signal,
      maxBytes: settings.maxOutputBytes,
    });
}
