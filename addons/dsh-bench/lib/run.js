/**
 * Running Bench's fixed commands: a program found in a fixed place, run with execFile (never a shell),
 * with arguments the recipes build from checked values. Bench never installs a program: when one is
 * missing it says how the user can get it.
 */
import { execFile } from 'node:child_process';
import { accessSync, constants, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

/** The programs Bench may run, where it looks for them, and how the user gets one. */
export const PROGRAMS = {
  esptool: {
    names: ['esptool.py', 'esptool'],
    places: ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local', 'bin'), join(homedir(), 'Library', 'Python', '3.12', 'bin'), join(homedir(), 'Library', 'Python', '3.11', 'bin')],
    get: 'Install esptool yourself, for example with `brew install esptool` or `pipx install esptool` in Terminal (Espressif\'s own tool: https://github.com/espressif/esptool). Bench never installs anything.',
  },
  adb: {
    names: ['adb'],
    places: ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), 'Library', 'Android', 'sdk', 'platform-tools')],
    get: 'Install Android\'s platform tools yourself, for example with `brew install android-platform-tools` (Google\'s download: https://developer.android.com/tools/releases/platform-tools). Bench never installs anything.',
  },
  stty: { names: ['stty'], places: ['/bin'], get: 'stty is part of macOS; it is missing from /bin.' },
  cat: { names: ['cat'], places: ['/bin'], get: 'cat is part of macOS; it is missing from /bin.' },
  pmset: { names: ['pmset'], places: ['/usr/bin'], get: 'pmset is part of macOS; it is missing from /usr/bin.' },
  system_profiler: { names: ['system_profiler'], places: ['/usr/sbin'], get: 'system_profiler is part of macOS; it is missing from /usr/sbin.' },
};

const runnable = (path) => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

let shellPath;
/**
 * The folders of the user's own shell PATH (read once, by the user's login shell, as Mission does), so a
 * program installed with pipx or a version manager is found.
 * @returns {Promise<string[]>} the folders.
 */
export function userPathFolders() {
  shellPath ??= new Promise((resolve) => {
    const shell = process.env.SHELL && existsSync(process.env.SHELL) ? process.env.SHELL : '/bin/zsh';
    execFile(shell, ['-lic', 'printf "__DSH_PATH__%s__DSH_END__" "$PATH"'], { timeout: 8000, env: { ...process.env, TERM: 'dumb' } }, (_error, stdout) => {
      const found = /__DSH_PATH__(.*?)__DSH_END__/s.exec(String(stdout ?? ''))?.[1] ?? '';
      resolve(found.split(':').filter((folder) => isAbsolute(folder)));
    });
  });
  return shellPath;
}

/**
 * Find a program in its fixed places, then in the user's PATH.
 * @param {string} id - a key of PROGRAMS.
 * @param {{places?: string[], pathFolders?: () => Promise<string[]>}} [options] - stand-ins for tests.
 * @returns {Promise<string>} its full path, or '' when it is not there.
 */
export async function findProgram(id, { places, pathFolders = userPathFolders } = {}) {
  const program = PROGRAMS[id];
  if (!program) return '';
  const folders = [...(places ?? program.places)];
  for (const folder of folders) for (const name of program.names) if (runnable(join(folder, name))) return join(folder, name);
  if (places) return '';
  for (const folder of await pathFolders()) for (const name of program.names) if (runnable(join(folder, name))) return join(folder, name);
  return '';
}

/**
 * Run one fixed command: no shell, a time limit, output kept small.
 * @param {string} file - the program's full path.
 * @param {string[]} args - its arguments, built by a recipe from checked values.
 * @param {{timeoutMs?: number, maxBuffer?: number}} [options] - limits.
 * @returns {Promise<{code: number | null, stdout: string, stderr: string, timedOut: boolean}>} how it ended.
 */
export function runFixed(file, args, { timeoutMs = 120_000, maxBuffer = 16 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    if (!isAbsolute(String(file ?? ''))) {
      resolve({ code: null, stdout: '', stderr: 'not a full path', timedOut: false });
      return;
    }
    execFile(file, args.map(String), { timeout: timeoutMs, maxBuffer, shell: false, env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' } }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : null) : 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), timedOut: Boolean(error?.killed && error?.signal) });
    });
  });
}

/** The command as shown to the user: the program's name and its arguments. */
export const shownCommand = (file, args) => [String(file).split('/').pop(), ...args.map((arg) => (/^[\w./:=,+-]+$/.test(String(arg)) ? String(arg) : JSON.stringify(String(arg))))].join(' ');
