/**
 * Training on the owner's own Mac (plan steps T5, T9, T13), with Apple's mlx-lm, from a Python the owner
 * points Tuner Plus at. Tuner Plus installs nothing and downloads nothing: the base model is a folder on
 * this Mac, every command is fixed and run without a shell, and the child runs with the Hugging Face hub
 * offline. The base model's files are never changed: the adapter, a fused copy and every temporary file
 * are written in Tuner Plus's own folder, and the base model's files are fingerprinted before and after.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, readdirSync, rmSync, statSync, statfsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The fixed script that answers exam requests (lib/answer.py). */
export const ANSWER_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'answer.py');

/** How the owner installs the trainer (Tuner Plus never does). */
export const HOW_TO_INSTALL = 'Tuner Plus trains with Apple\'s MLX trainer (mlx-lm), which you install yourself in a Python of its own, for example: make a folder, run "uv venv" and "uv pip install mlx-lm" in it (or "python3 -m venv .venv" and ".venv/bin/pip install mlx-lm"), then give Tuner Plus the full path of that Python (…/.venv/bin/python). Tuner Plus never installs anything.';

/** The environment of every trainer run: no downloads, no telemetry. */
export const OFFLINE_ENV = { HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', HF_DATASETS_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1', TOKENIZERS_PARALLELISM: 'false' };

/** @returns {string} why a path is not a Python Tuner Plus may run, or ''. */
export function pythonProblem(path) {
  const value = String(path ?? '').trim();
  if (!value) return HOW_TO_INSTALL;
  if (!isAbsolute(value)) return 'Give the full path of the trainer\'s Python (starting with /).';
  if (!/\/python(?:3(?:\.\d+)?)?$/.test(value)) return 'The path must end in python or python3: the Python in which mlx-lm is installed.';
  if (!existsSync(value)) return `There is no ${value}.`;
  return '';
}

/** @returns {string} why a folder is not a local MLX model Tuner Plus may train or answer with, or ''. */
export function modelProblem(path) {
  const value = String(path ?? '').trim();
  if (!value) return 'Give the folder of the base model on this Mac (an MLX model folder with config.json).';
  if (!isAbsolute(value)) return 'Give the full path of the model\'s folder: Tuner Plus does not download models.';
  try {
    if (!statSync(value).isDirectory()) return 'That is not a folder.';
  } catch {
    return `There is no folder ${value}.`;
  }
  if (!existsSync(join(value, 'config.json'))) return 'That folder has no config.json, so it is not an MLX model folder.';
  return '';
}

/** A fingerprint of a folder's files (names, sizes, change times): to prove the base model was not changed. */
export function fingerprint(folder, max = 2000) {
  const hash = createHash('sha256');
  const walk = (dir, depth) => {
    if (depth > 3) return;
    let names = [];
    try {
      names = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of names.slice(0, max)) {
      const path = join(dir, name);
      let stat;
      try {
        stat = lstatSync(path);
      } catch {
        continue;
      }
      hash.update(`${path.slice(folder.length)}|${stat.size}|${Math.floor(stat.mtimeMs)}\n`);
      if (stat.isDirectory()) walk(path, depth + 1);
    }
  };
  walk(folder, 0);
  return hash.digest('hex');
}

/** @returns {boolean} whether a path is inside a folder (or is it). */
export const inside = (path, folder) => {
  const a = resolve(path);
  const b = resolve(folder);
  return a === b || a.startsWith(`${b}${sep}`);
};

/** The training settings, held inside safe bounds. */
export function trainSettings(input = {}) {
  const bound = (value, low, high, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(high, Math.max(low, number)) : fallback;
  };
  return {
    iters: Math.round(bound(input.iters, 10, 20000, 600)),
    batch: Math.round(bound(input.batch, 1, 32, 4)),
    layers: Math.round(bound(input.layers, 1, 64, 16)),
    lr: bound(input.lr, 1e-6, 1e-3, 1e-5),
    maxSeq: Math.round(bound(input.maxSeq, 256, 16384, 2048)),
  };
}

/**
 * Python is started isolated (-I: no current folder, no script folder, no PYTHON* settings and no user
 * packages on its path), in a new empty working folder: a planted mlx_lm/ in a folder Tuner Plus writes to
 * is never imported.
 */
export const ISOLATED = '-I';
/** @returns {string} a new empty working folder for one run (removed afterwards). */
export const emptyFolder = () => mkdtempSync(join(tmpdir(), 'dsh-tuning-run-'));

/** Bytes free on the disk that holds a folder (undefined when it cannot be read). */
export function freeBytes(folder) {
  try {
    const info = statfsSync(folder);
    return Number(info.bavail) * Number(info.bsize);
  } catch {
    return undefined;
  }
}
/** The size of a folder's files (a model's weights), in bytes. */
export function folderBytes(folder, max = 5000) {
  let total = 0;
  let seen = 0;
  const walk = (dir, depth) => {
    if (depth > 3 || seen > max) return;
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      seen += 1;
      try {
        const stat = lstatSync(join(dir, name));
        if (stat.isDirectory()) walk(join(dir, name), depth + 1);
        else if (stat.isFile()) total += stat.size;
      } catch { /* gone */ }
    }
  };
  walk(folder, 0);
  return total;
}

/** The checkpoints a training run leaves beside the adapter (0000050_adapters.safetensors…): not needed after. */
export const CHECKPOINT = /^\d{5,}_adapters\.safetensors$/;

/** The fixed arguments of a training run. */
export function trainArgs({ model, data, adapter, settings }) {
  const set = trainSettings(settings);
  return ['-m', 'mlx_lm', 'lora', '--model', model, '--train', '--data', data, '--adapter-path', adapter, '--fine-tune-type', 'lora', '--iters', String(set.iters), '--batch-size', String(set.batch), '--num-layers', String(set.layers), '--learning-rate', String(set.lr), '--max-seq-length', String(set.maxSeq), '--steps-per-report', '10', '--steps-per-eval', String(Math.max(20, Math.floor(set.iters / 4))), '--save-every', String(Math.max(50, Math.floor(set.iters / 4))), '--mask-prompt'];
}
/** The fixed arguments that fold an adapter into a copy of the base model (the base is never changed). */
export const fuseArgs = ({ model, adapter, out }) => ['-m', 'mlx_lm', 'fuse', '--model', model, '--adapter-path', adapter, '--save-path', out];
/** The fixed arguments of mlx-lm's own server with an adapter beside the base model (on this Mac only). */
export const serveArgs = ({ model, adapter, port }) => ['-m', 'mlx_lm', 'server', '--model', model, '--adapter-path', adapter, '--host', '127.0.0.1', '--port', String(port)];
/** The fixed arguments that answer exam requests. */
export const answerArgs = ({ model, adapter, input, output, maxTokens = 256 }) => [ANSWER_SCRIPT, '--model', model, ...(adapter ? ['--adapter', adapter] : []), '--input', input, '--output', output, '--max-tokens', String(maxTokens)];

/**
 * Progress lines of mlx-lm, old ("Iter 10: Train loss 2.345, …", "Iter 20: Val loss 2.1, …") and new (a table:
 * "    10    4.487 ▼    3,511      3.0k" and "    10    val 4.144    0.12s"), with colour codes taken out.
 */
export function progressOf(raw) {
  const line = String(raw ?? '').replace(/\u001b\[[0-9;]*m/g, '');
  const train = /Iter (\d+): Train loss ([\d.]+)/.exec(line);
  if (train) return { iter: Number(train[1]), loss: Number(train[2]) };
  const valid = /Iter (\d+): Val loss ([\d.]+)/.exec(line);
  if (valid) return { iter: Number(valid[1]), valLoss: Number(valid[2]) };
  const newValid = /^\s*(\d+)\s+val\s+([\d.]+)\b/.exec(line);
  if (newValid) return { iter: Number(newValid[1]), valLoss: Number(newValid[2]) };
  const newTrain = /^\s*(\d+)\s+([\d.]+)\s+[▼▲=─-]?\s+[\d,]+\s/.exec(line);
  if (newTrain) return { iter: Number(newTrain[1]), loss: Number(newTrain[2]) };
  return undefined;
}

/**
 * Run the trainer's Python with fixed arguments.
 * @param {{python: string, args: string[], timeoutMs: number, signal?: AbortSignal, onLine?: (line: string) => void, spawnFn?: typeof spawn}} job
 * @returns {Promise<{code: number | null, stopped: string, tail: string[], seconds: number, pid: number}>}
 */
export function runPython({ python, args, timeoutMs, signal, onLine, spawnFn = spawn }) {
  return new Promise((resolveRun) => {
    const started = Date.now();
    // Isolated, in a new empty folder: nothing in Tuner Plus's own folder can be imported as a module.
    const cwd = emptyFolder();
    const clean = () => rmSync(cwd, { recursive: true, force: true });
    let child;
    try {
      child = spawnFn(python, [ISOLATED, ...args], { cwd, env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: process.env.HOME ?? '', ...OFFLINE_ENV }, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      clean();
      resolveRun({ code: null, stopped: `it could not start: ${String(error?.message ?? error).slice(0, 200)}`, tail: [], seconds: 0, pid: 0 });
      return;
    }
    const tail = [];
    let stopped = '';
    let rest = '';
    const take = (chunk) => {
      const text = rest + String(chunk);
      const lines = text.split(/\r?\n/);
      rest = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        tail.push(line.slice(0, 400));
        if (tail.length > 40) tail.shift();
        onLine?.(line);
      }
    };
    child.stdout?.on('data', take);
    child.stderr?.on('data', take);
    const stop = (why) => {
      if (stopped) return;
      stopped = why;
      try {
        child.kill('SIGTERM');
      } catch {
        /* already gone */
      }
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }, 5000).unref?.();
    };
    const timer = setTimeout(() => stop('the time limit was reached'), Math.max(1000, timeoutMs));
    const onAbort = () => stop(String(signal?.reason?.message ?? signal?.reason ?? 'it was stopped'));
    if (signal?.aborted) onAbort();
    else signal?.addEventListener?.('abort', onAbort, { once: true });
    child.on('error', (error) => {
      clearTimeout(timer);
      clean();
      resolveRun({ code: null, stopped: `it could not start: ${String(error?.message ?? error).slice(0, 200)}`, tail, seconds: (Date.now() - started) / 1000, pid: child.pid ?? 0 });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      clean();
      signal?.removeEventListener?.('abort', onAbort);
      if (rest.trim()) tail.push(rest.slice(0, 400));
      resolveRun({ code, stopped, tail, seconds: (Date.now() - started) / 1000, pid: child.pid ?? 0 });
    });
  });
}
