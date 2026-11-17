/**
 * The sandbox for a plugin's code. Creator Plus's checks run code a model wrote (a plugin's tests, its
 * index.js, the trial copy loading it). That code runs only inside macOS's sandbox, built like Mission's
 * strictest fence (`offlineFence` in dsh-mission/lib/shell.js) and closer still:
 * - no network, no Mac services (`mach-lookup`), no launchd job (`job-creation`);
 * - only the programs it needs may start: the app's own Node, the shell and the two small tools the app's
 *   `dsh` command uses; no native code is loaded from anywhere but the system and the app;
 * - writing only in its run folder (a fresh throwaway folder per run, lib/runs.js);
 * - reading only the system, the app itself and its run folder: not the home folder, not the app's data
 *   (named too, wherever it is), not /tmp, /private/var/folders, /Users/Shared or other disks;
 * - no child processes at all for a plugin's own code (its tests run in one process): nothing of it can live
 *   on after its run; only the trial install, which runs the app's own `dsh` and package manager and none of
 *   the plugin's code (tried: neither its index.js nor its package scripts run), may start child processes;
 * - signals only to its own processes;
 * - a short list of environment variables: no keys, HOME and TMPDIR inside the run folder.
 * Where there is no sandbox, the code is not run (fixed rules 2 and 6; fail safe).
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { real, within } from './rules.js';

export const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
export const NO_SANDBOX = 'This Mac has no sandbox for a plugin\'s code (macOS\'s sandbox-exec was not found), so Creator Plus did not run it.';
/** Programs a check may start besides the app's own Node (the app's `dsh` command is a small sh script). */
export const HELPERS = ['/bin/sh', '/bin/bash', '/usr/bin/dirname', '/usr/bin/readlink'];
/** The only environment a sandboxed program gets (besides what Creator Plus sets itself). */
export const ENV_KEPT = ['LANG', 'LC_ALL', 'TZ'];
export const BASE_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
/** What a sandboxed program may read besides its run folder and the app: the system, nothing of the user's. */
export const SYSTEM_READ = ['/System', '/usr', '/bin', '/sbin', '/private/etc', '/private/var/db/timezone', '/dev', '/Library/Apple'];
/** The app's own complaint when the sandbox closes the Mac's code-signing service to it: noise, not a problem of the plugin. */
const SIGNING_NOISE = /^\[[\d/.:]+ERROR:electron\/shell\/common\/mac\/codesign_util\.cc:\d+\] SecCodeCheckValidity:.*$/gm;
/** @returns {string} a program's error output without the sandbox's known noise. */
export const quiet = (text) => String(text ?? '').replace(SIGNING_NOISE, '').replace(/\n{2,}/g, '\n').trim();

/** A path as a string in the sandbox's rule language. */
const quoted = (path) => `"${String(path).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const spell = (list) => [...new Set(list.filter(Boolean).flatMap((place) => [resolve(place), real(place)]))];
const subpaths = (list) => list.map((one) => `(subpath ${quoted(one)})`).join(' ');
const literals = (list) => list.map((one) => `(literal ${quoted(one)})`).join(' ');

/**
 * The sandbox's rules.
 * @param {{home?: string, places: string[], readOnly?: string[], programs?: string[], dataHome?: string}} input -
 *   `home` (the user's home folder), `places` (the only folders the code may read and write: its run folder),
 *   `readOnly` (folders it may also read: the app itself), `programs` (the programs it may start besides
 *   HELPERS: the app's Node, the app's `dsh` command), `dataHome` (the app's data folder, closed by name).
 * @returns {string} the profile.
 */
export function sandboxProfile({ home = homedir(), places, readOnly = [], programs = [], dataHome = '', fork = false }) {
  const spelled = spell(places);
  const readable = spell(readOnly);
  const closed = spell([home, dataHome, '/Volumes']);
  const runnable = spell([...programs, ...HELPERS]);
  return [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    '(deny mach-lookup)',
    '(deny job-creation)',
    '(deny process-exec)',
    `(allow process-exec ${literals(runnable)})`,
    '(deny file-map-executable)',
    `(allow file-map-executable ${subpaths(['/System', '/usr/lib', ...readable])})`,
    ...(fork ? [] : ['(deny process-fork)']),
    '(deny signal)',
    '(allow signal (target same-sandbox))',
    '(deny file-write*)',
    `(allow file-write* ${subpaths(spelled)} (literal "/dev/null") (literal "/dev/zero") (literal "/dev/dtracehelper") (literal "/dev/tty"))`,
    '(deny file-read-data (subpath "/"))',
    `(allow file-read-data ${subpaths(SYSTEM_READ)} (literal "/"))`,
    `(deny file-read-data ${subpaths(closed)})`,
    `(allow file-read-data ${subpaths([...spelled, ...readable])})`,
  ].join('\n');
}

/**
 * The environment of a sandboxed program: a short allow-list, never the app's own (which holds keys).
 * @param {object} given - what Creator Plus sets (DSH_HOME and the like).
 * @param {string} scratch - the run folder's temporary folder.
 * @param {object} [from] - the app's environment.
 * @returns {Record<string, string>} the environment.
 */
export function sandboxEnv(given, scratch, from = process.env) {
  const kept = Object.fromEntries(ENV_KEPT.filter((key) => typeof from[key] === 'string').map((key) => [key, from[key]]));
  return { ...kept, ...given, PATH: BASE_PATH, HOME: scratch, TMPDIR: `${scratch}/`, CI: '1', TERM: 'dumb', NO_COLOR: '1', ELECTRON_RUN_AS_NODE: '1' };
}

/**
 * A `run` that puts every program into the sandbox, in a run folder of its own.
 * @param {(file: string, args: string[], options: object) => Promise<{code: number, stdout: string, stderr: string}>} run - the plain runner
 *   (it gets `pureEnv: true`: this environment alone; it stops the program's whole process group when it ends).
 * @param {{home?: string, readOnly?: string[], programs?: string[], dataHome?: string, exists?: (path: string) => boolean}} options - the
 *   folders the code may only read (the app), the programs it may start (the app's Node and `dsh`), the app's data folder.
 * @returns {(file: string, args: string[], options: {place: string, cwd?: string, env?: object, timeoutMs?: number, fork?: boolean}) => Promise<{code: number, stdout: string, stderr: string}>} the sandboxed runner
 *   (`fork`: only the trial install, which runs the app's own programs, may start child processes).
 */
export function sandboxed(run, { home = homedir(), readOnly = [], programs = [], dataHome = '', exists = existsSync }) {
  return async (file, args, options = {}) => {
    if (!exists(SANDBOX_EXEC)) return { code: 1, stdout: '', stderr: NO_SANDBOX };
    const place = String(options.place ?? '');
    // A program runs only in a run folder (lib/runs.js), and starts inside it.
    if (!place) return { code: 1, stdout: '', stderr: 'No run folder was given, so nothing was run.' };
    const cwd = options.cwd || place;
    if (!within(real(cwd), real(place))) return { code: 1, stdout: '', stderr: 'A program starts only inside its run folder; nothing was run.' };
    const env = sandboxEnv(options.env ?? {}, join(place, 'tmp'));
    const result = await run(SANDBOX_EXEC, ['-p', sandboxProfile({ home, places: [place], readOnly, programs: [...programs, file], dataHome, fork: options.fork === true }), file, ...args], { ...options, cwd, env, pureEnv: true });
    return { ...result, stderr: quiet(result?.stderr) };
  };
}
