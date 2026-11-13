/**
 * Python for statistics and charts. Plus keeps its own private Python folder (a "virtual
 * environment") under the app's data folder, with the usual analysis packages. Nothing else on the
 * Mac is changed. A program runs inside macOS's own sandbox: it cannot use the network, it can read
 * the conversation's folder but nothing else in the user's home, and it can write only into the
 * output folder.
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Needed for the tool to be of use. */
export const CORE = ['numpy', 'pandas', 'scipy', 'matplotlib', 'openpyxl'];
/** Nice to have; a failure here does not stop the set-up. */
export const EXTRA = ['statsmodels', 'scikit-learn'];
export const CANDIDATES = ['/opt/homebrew/bin/python3', '/usr/local/bin/python3', '/usr/bin/python3'];
export const OUTPUT_CHARS = 16000;
export const RUN_MS = 120_000;
const SETUP_MS = 20 * 60_000;
const PICTURES = ['.png', '.jpg', '.jpeg', '.svg'];
/** The line the chart check prints; `execute` reads it back. */
export const CHART_PROBLEM = 'CHART-PROBLEM';
/**
 * Python lines put before every program. They make matplotlib look at each figure as it is saved:
 * when what is drawn reaches far outside the figure, something was placed with the wrong numbers
 * (a label offset in the wrong units is the usual cause) and a "tight" save would stretch the
 * picture around it. The check prints one line and still saves, so the model can read what went wrong.
 */
export const CHART_CHECK = [
  'try:',
  '    import matplotlib.figure as _dsh_figure',
  '    _dsh_savefig = _dsh_figure.Figure.savefig',
  '    def _dsh_checked_savefig(self, fname, *args, **kwargs):',
  '        try:',
  '            _box = self.get_tightbbox()',
  '            _w, _h = self.get_size_inches()',
  '            if _box.width > 1.6 * _w or _box.height > 1.6 * _h:',
  `                print("CHART-PROBLEM %s: the drawing is %.0f x %.0f inches but the figure is %.0f x %.0f, so something sits far outside the plot." % (os.path.basename(str(fname)), _box.width, _box.height, _w, _h))`,
  '        except Exception:',
  '            pass',
  '        return _dsh_savefig(self, fname, *args, **kwargs)',
  '    _dsh_figure.Figure.savefig = _dsh_checked_savefig',
  'except Exception:',
  '    pass',
];

const run = (file, args, options = {}) =>
  new Promise((resolve) => {
    execFile(file, args, { timeout: 30_000, maxBuffer: 4 * 1024 * 1024, ...options }, (error, stdout, stderr) => resolve({ ok: !error, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), error }));
  });

/**
 * A Python 3.9 or newer on this Mac.
 * @param {string[]} [candidates] - places to look.
 * @returns {Promise<{path: string, version: string} | undefined>} the first that works.
 */
export async function findPython(candidates = CANDIDATES) {
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    // macOS's own /usr/bin/python3 is a stand-in that asks to install Apple's developer tools when they are missing.
    if (path === '/usr/bin/python3' && !(await run('/usr/bin/xcode-select', ['-p'])).ok) continue;
    const found = await run(path, ['-c', 'import sys; print("%d.%d" % sys.version_info[:2]); print(sys.base_prefix)']);
    const [version, prefix] = found.stdout.trim().split('\n');
    const [major, minor] = String(version).split('.').map(Number);
    if (found.ok && major === 3 && minor >= 9) return { path, version, prefix: prefix ?? '' };
  }
  return undefined;
}

/** The sandbox rules for one run, in the sandbox's own language. */
export function sandboxProfile({ dataDir, outDir, runDir, envDir, prefix }) {
  const q = (path) => JSON.stringify(String(path));
  const readable = [dataDir, outDir, runDir, envDir, prefix].filter(Boolean);
  return [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    // Nothing in the user's home is readable, except what this run is about.
    `(deny file-read-data (subpath ${q(homedir())}))`,
    `(allow file-read-data ${readable.map((path) => `(subpath ${q(path)})`).join(' ')})`,
    '(deny file-write*)',
    `(allow file-write* (subpath ${q(outDir)}) (subpath ${q(runDir)}) (literal "/dev/null") (literal "/dev/dtracehelper"))`,
  ].join('\n');
}

/**
 * @param {string} dir - the private Python folder, for example <home>/data/python.
 * @param {object} [hooks] - for tests.
 * @returns {object} set-up and running.
 */
export function createPython(dir, hooks = {}) {
  const venv = join(dir, 'venv');
  const bin = join(venv, 'bin', 'python');
  const stateFile = join(dir, 'state.json');
  const logFile = join(dir, 'setup.log');
  let installing;
  let last = '';

  const readState = () => {
    try {
      const state = JSON.parse(readFileSync(stateFile, 'utf8'));
      return state && typeof state === 'object' ? state : {};
    } catch {
      return {};
    }
  };

  /** @returns {{state: 'ready' | 'installing' | 'failed' | 'missing', detail: string, packages: string[]}} where the set-up stands. */
  const status = () => {
    if (installing) return { state: 'installing', detail: last || 'Setting up Python…', packages: [] };
    const state = readState();
    if (state.status === 'ready' && existsSync(bin)) return { state: 'ready', detail: `Python ${state.version}`, packages: state.packages ?? [], missing: state.missing ?? [] };
    if (state.status === 'failed') return { state: 'failed', detail: String(state.error ?? 'The set-up failed.'), packages: [] };
    return { state: 'missing', detail: 'Python for statistics is not set up yet.', packages: [] };
  };

  /** Set the private Python folder up. Runs once at a time; the returned promise ends when it is done. */
  const setup = () => {
    if (installing) return installing;
    installing = (async () => {
      const log = [];
      const note = (text) => {
        last = text;
        log.push(`${new Date().toISOString()} ${text}`);
        try {
          mkdirSync(dir, { recursive: true });
          writeFileSync(logFile, log.join('\n') + '\n');
        } catch {
          /* the log is a convenience */
        }
      };
      const fail = (error) => {
        note(`Failed: ${error}`);
        writeFileSync(stateFile, JSON.stringify({ status: 'failed', error: String(error).slice(0, 400), at: Date.now() }));
        return status();
      };
      try {
        mkdirSync(dir, { recursive: true });
        const python = await (hooks.findPython ?? findPython)();
        if (!python) return fail('No Python 3 was found on this Mac. Install it from python.org or with Homebrew (brew install python), then press Set up again.');
        note(`Using Python ${python.version} at ${python.path}.`);
        if (!existsSync(bin)) {
          const made = await run(python.path, ['-m', 'venv', venv], { timeout: 120_000 });
          if (!made.ok) return fail(`The private Python folder could not be made: ${(made.stderr || made.error?.message || '').slice(-300)}`);
        }
        const pip = (packages) => run(bin, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '--quiet', ...packages], { timeout: SETUP_MS, env: { ...process.env, PIP_NO_INPUT: '1' } });
        note(`Downloading ${CORE.join(', ')}…`);
        const core = await pip(CORE);
        if (!core.ok) return fail(`The packages could not be downloaded: ${(core.stderr || core.error?.message || '').slice(-300)}`);
        const packages = [...CORE];
        const missing = [];
        for (const name of EXTRA) {
          note(`Downloading ${name}…`);
          if ((await pip([name])).ok) packages.push(name);
          else missing.push(name);
        }
        writeFileSync(stateFile, JSON.stringify({ status: 'ready', version: python.version, prefix: python.prefix, python: python.path, packages, missing, at: Date.now() }));
        note(`Ready: ${packages.join(', ')}.${missing.length > 0 ? ` Not available for this Python: ${missing.join(', ')}.` : ''}`);
        return status();
      } catch (error) {
        return fail(error?.message ?? error);
      }
    })().then(
      () => {
        installing = undefined;
        return status();
      },
      (error) => {
        installing = undefined;
        throw error;
      },
    );
    return installing;
  };

  /**
   * Run a program.
   * @param {object} job - what to run.
   * @param {string} job.code - the Python program.
   * @param {string} job.dataDir - the conversation's folder; the program starts in it.
   * @param {string} job.outDir - where it may write.
   * @param {number} [job.timeoutMs] - stop it after this long.
   * @returns {Promise<{ok: boolean, output: string, files: {name: string, path: string, size: number, picture: boolean, problem?: string}[], seconds: number}>} what it printed and what it wrote.
   */
  const execute = async ({ code, dataDir, outDir, timeoutMs = RUN_MS }) => {
    const now = status();
    if (now.state !== 'ready') throw new Error(now.state === 'installing' ? `Python is still being set up (${now.detail}). Try again in a minute.` : `Python for statistics is not set up (${now.detail}). The user sets it up in Settings → Data.`);
    const state = readState();
    mkdirSync(outDir, { recursive: true });
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const runDir = join(dir, 'runs', id);
    mkdirSync(join(runDir, 'tmp'), { recursive: true });
    const real = (path) => {
      try {
        return realpathSync(path);
      } catch {
        return path;
      }
    };
    const paths = { dataDir: real(dataDir), outDir: real(outDir), runDir: real(runDir), envDir: real(dir), prefix: state.prefix ? real(state.prefix) : '' };
    const script = join(runDir, 'program.py');
    // The lines before the program: charts are drawn without a window, and the two folders have names.
    const head = [
      'import os, sys',
      'os.environ.setdefault("MPLBACKEND", "Agg")',
      `DATA_DIR = ${JSON.stringify(paths.dataDir)}`,
      `OUT_DIR = ${JSON.stringify(paths.outDir)}`,
      ...CHART_CHECK,
      '',
    ].join('\n');
    writeFileSync(script, head + String(code));
    const before = new Map();
    for (const name of readdirSync(paths.outDir)) {
      try {
        before.set(name, statSync(join(paths.outDir, name)).mtimeMs);
      } catch {
        /* gone */
      }
    }
    const started = Date.now();
    const result = await new Promise((resolve) => {
      const child = spawn('/usr/bin/sandbox-exec', ['-p', sandboxProfile(paths), bin, '-I', '-X', 'utf8', script], {
        cwd: paths.dataDir,
        env: { PATH: '/usr/bin:/bin', HOME: paths.runDir, TMPDIR: join(paths.runDir, 'tmp'), MPLCONFIGDIR: join(paths.runDir, 'mpl'), MPLBACKEND: 'Agg', PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8', LANG: 'en_US.UTF-8', DATA_DIR: paths.dataDir, OUT_DIR: paths.outDir },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let text = '';
      let cut = false;
      const take = (chunk) => {
        if (text.length < OUTPUT_CHARS * 2) text += chunk.toString('utf8');
        else cut = true;
      };
      child.stdout.on('data', take);
      child.stderr.on('data', take);
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);
      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({ code: -1, text: `The program could not be started: ${error.message}`, cut, timedOut });
      });
      child.on('close', (exit) => {
        clearTimeout(timer);
        resolve({ code: exit, text, cut, timedOut });
      });
    });
    try {
      rmSync(runDir, { recursive: true, force: true });
    } catch {
      /* swept at the next run */
    }
    const files = [];
    for (const name of readdirSync(paths.outDir)) {
      if (name.startsWith('.')) continue;
      try {
        const info = statSync(join(paths.outDir, name));
        if (!info.isFile() || before.get(name) === info.mtimeMs) continue;
        // A picture the chart check complained about is marked, so it is not shown as if it were fine.
        const problem = result.text.split('\n').find((line) => line.startsWith(`${CHART_PROBLEM} ${name}: `));
        files.push({ name, path: join(paths.outDir, name), size: info.size, picture: PICTURES.some((ending) => name.toLowerCase().endsWith(ending)), ...(problem ? { problem: problem.slice(CHART_PROBLEM.length + name.length + 3) } : {}) });
      } catch {
        /* gone */
      }
    }
    let output = result.text.replaceAll(paths.runDir, '<run>');
    if (output.length > OUTPUT_CHARS) output = `${output.slice(0, OUTPUT_CHARS / 2)}\n… (${output.length - OUTPUT_CHARS} characters left out) …\n${output.slice(-OUTPUT_CHARS / 2)}`;
    else if (result.cut) output += '\n… (more output was left out)';
    if (result.timedOut) output += `\nStopped: the program ran longer than ${Math.round(timeoutMs / 1000)} seconds.`;
    return { ok: result.code === 0 && !result.timedOut, output: output.trim(), files, seconds: Math.round((Date.now() - started) / 100) / 10 };
  };

  return { status, setup, execute, dir };
}
