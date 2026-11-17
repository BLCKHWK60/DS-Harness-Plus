/**
 * Tuning Plus's own folder (`tuning` in the app's data, or a full path from Settings), plain files the
 * owner can read:
 *   rows/<mode>.jsonl     rows that may go into data sets (never an exam row)
 *   exam/<mode>.jsonl     the exam: one row in five, chosen by code; never trains
 *   sets.json             the named data sets (row ids, what each was used for)
 *   shelf.json            adapters, tuned prompts and instruction sets, with their exam results
 *   cards.json            results the owner acts on (taste test, promote, not now, never again)
 *   state.json            where the last harvest stopped, the install's exam salt
 *   shelf/<id>/           an adapter's files; models/ a fused copy; exports/ sets written out
 * Nothing is written through a link, and nothing outside this folder.
 */
import { randomBytes } from 'node:crypto';
import { closeSync, constants as fs, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { basename, dirname, join, sep } from 'node:path';

const MODE_NAME = /^[a-z][a-z0-9-]{0,39}$/;
/** The most rows one file keeps (the newest); older ones are let go when it grows past this. */
export const ROW_CAP = 50_000;

/** A folder inside the store, made when missing, never a link. */
export function folderIn(root, ...parts) {
  let dir = root;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (lstatSync(dir).isSymbolicLink()) throw new Error('The Tuning Plus folder is a link; Tuning Plus does not write through links.');
  for (const part of parts) {
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(part) || part === '.' || part === '..') throw new Error('not a folder name');
    dir = join(dir, part);
    try {
      const stat = lstatSync(dir);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${part} in the Tuning Plus folder is ${stat.isSymbolicLink() ? 'a link' : 'a file'}.`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      mkdirSync(dir, { mode: 0o700 });
    }
  }
  return dir;
}

/** Add lines to a file, never through a link (O_NOFOLLOW). */
export function appendLines(file, lines) {
  if (lines.length === 0) return;
  const fd = openSync(file, fs.O_WRONLY | fs.O_APPEND | fs.O_CREAT | fs.O_NOFOLLOW, 0o600);
  try {
    writeSync(fd, `${lines.join('\n')}\n`);
  } finally {
    closeSync(fd);
  }
}

/**
 * Replace a file whole, through a new file beside it: never half written, never through a link (a link in
 * its place is replaced, not followed), and only when its folder really is inside `within`.
 */
export function writeText(file, text, within) {
  const folder = dirname(file);
  if (within) {
    const real = realpathSync(folder);
    const root = realpathSync(within);
    if (real !== root && !real.startsWith(`${root}${sep}`)) throw new Error('That folder is not where it should be (a link); nothing was written.');
  }
  try {
    if (lstatSync(file).isSymbolicLink()) throw new Error(`${basename(file)} is a link; Tuning Plus does not write through links.`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const temp = join(folder, `.${basename(file)}.${process.pid}.${Date.now()}.${randomBytes(3).toString('hex')}.tmp`);
  writeFileSync(temp, text, { mode: 0o600, flag: 'wx' });
  renameSync(temp, file);
}

/** Replace a JSON file whole, through a new file beside it (never half written, never through a link). */
export function writeJson(file, value, within) {
  writeText(file, `${JSON.stringify(value, null, 2)}\n`, within);
}

export function readJson(file, fallback) {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    return value && typeof value === 'object' ? value : fallback;
  } catch {
    return fallback;
  }
}

const cache = new Map();
/** Each line of a JSON-lines file that parses, read again only when the file changed (its size and time). */
export function readLinesCached(file) {
  let stat;
  try {
    stat = statSync(file);
  } catch {
    cache.delete(file);
    return [];
  }
  const had = cache.get(file);
  if (had && had.size === stat.size && had.mtimeMs === stat.mtimeMs) return had.lines;
  const lines = readLines(file);
  cache.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, lines });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return lines;
}

/** Each line of a JSON-lines file that parses. */
export function readLines(file, max = 200_000) {
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* a broken line is skipped */
    }
    if (out.length >= max) break;
  }
  return out;
}

/**
 * @param {() => string} rootOf - the folder (empty: none set).
 * @returns {object} the store.
 */
export function openStore(rootOf) {
  const root = () => {
    const folder = String(rootOf() ?? '').trim();
    if (!folder) throw new Error('There is no Tuning Plus folder.');
    return folderIn(folder);
  };
  const where = () => String(rootOf() ?? '').trim();
  const path = (...parts) => join(where(), ...parts);
  const state = () => readJson(path('state.json'), {});
  const setState = (patch) => {
    root();
    const next = { ...state(), ...patch };
    writeJson(path('state.json'), next);
    return next;
  };
  /** This install's exam salt, made once. */
  const salt = () => {
    const had = state().salt;
    if (typeof had === 'string' && had.length >= 16) return had;
    return setState({ salt: randomBytes(16).toString('hex') }).salt;
  };
  let known;
  let knownRoot = '';
  const counts = new Map();
  /** Every id already stored, in any mode's file, pool or exam: a row is kept once, on one side. */
  const allIds = () => {
    const here = where();
    if (!known || knownRoot !== here) {
      known = new Map();
      knownRoot = here;
      counts.clear();
      for (const side of ['rows', 'exam']) {
        for (const name of listModes(path(side))) {
          const lines = readLines(path(side, `${name}.jsonl`));
          counts.set(path(side, `${name}.jsonl`), lines.length);
          for (const row of lines) if (row?.id) known.set(row.id, side);
        }
      }
    }
    return known;
  };
  /** Rewrite a rows file keeping only some lines (temp file and rename: never half written, never through a link). */
  const rewrite = (file, keep) => {
    const lines = readLines(file);
    const kept = lines.filter(keep);
    if (kept.length === lines.length) return 0;
    writeText(file, kept.length > 0 ? `${kept.map((row) => JSON.stringify(row)).join('\n')}\n` : '');
    return lines.length - kept.length;
  };
  const cap = (file, added) => {
    counts.set(file, (counts.get(file) ?? 0) + added);
    if ((counts.get(file) ?? 0) <= ROW_CAP) return;
    const lines = readLines(file);
    const keep = new Set(lines.slice(-ROW_CAP).map((row) => row.id));
    rewrite(file, (row) => keep.has(row.id));
    known = undefined;
  };
  return {
    where,
    root,
    path,
    folder: (...parts) => folderIn(root(), ...parts),
    state,
    setState,
    salt,
    /**
     * Keep rows: each in the exam or in the pool, never both, and each once.
     * @param {string} mode - the mode's name.
     * @param {object[]} rows - rows with `exam` set by code.
     * @returns {{kept: number, exam: number, repeats: number}} what was added.
     */
    addRows(mode, rows) {
      if (!MODE_NAME.test(mode)) throw new Error('not a mode name');
      const pool = join(folderIn(root(), 'rows'), `${mode}.jsonl`);
      const exam = join(folderIn(root(), 'exam'), `${mode}.jsonl`);
      const ids = allIds();
      const toPool = [];
      const toExam = [];
      let repeats = 0;
      for (const row of rows) {
        if (ids.has(row.id)) {
          repeats += 1;
          continue;
        }
        if (row.exam === true) {
          ids.set(row.id, 'exam');
          toExam.push(JSON.stringify(row));
        } else {
          ids.set(row.id, 'rows');
          toPool.push(JSON.stringify(row));
        }
      }
      appendLines(pool, toPool);
      appendLines(exam, toExam);
      cap(pool, toPool.length);
      cap(exam, toExam.length);
      return { kept: toPool.length, exam: toExam.length, repeats };
    },
    /** @returns {boolean} whether a row with this id is stored (pool or exam). */
    has: (id) => allIds().has(id),
    /** Take rows out (a turn corrected after it was kept). @returns {number} how many were taken out. */
    removeRows(ids) {
      const gone = new Set(ids);
      const stored = allIds();
      if (![...gone].some((id) => stored.has(id))) return 0;
      let removed = 0;
      for (const side of ['rows', 'exam']) for (const name of listModes(path(side))) removed += rewrite(path(side, `${name}.jsonl`), (row) => !gone.has(row.id));
      known = undefined;
      return removed;
    },
    /** @returns {object[]} the pool rows of one mode, or of every mode (read again only when a file changed). */
    rows(mode) {
      const modes = mode ? [mode] : listModes(path('rows'));
      return modes.flatMap((name) => readLinesCached(path('rows', `${name}.jsonl`)));
    },
    /** @returns {object[]} the exam rows of one mode, or of every mode. */
    exam(mode) {
      const modes = mode ? [mode] : listModes(path('exam'));
      return modes.flatMap((name) => readLinesCached(path('exam', `${name}.jsonl`)));
    },
    sets: () => readJson(path('sets.json'), { sets: {} }),
    saveSets: (value) => { root(); writeJson(path('sets.json'), value); },
    shelf: () => readJson(path('shelf.json'), { entries: [] }),
    saveShelf: (value) => { root(); writeJson(path('shelf.json'), value); },
    cards: () => readJson(path('cards.json'), { cards: [], never: [] }),
    saveCards: (value) => { root(); writeJson(path('cards.json'), value); },
  };
}

/** The modes that have a rows file in a folder. */
function listModes(dir) {
  try {
    return readdirSync(dir).filter((name) => name.endsWith('.jsonl')).map((name) => name.slice(0, -6)).filter((name) => MODE_NAME.test(name));
  } catch {
    return [];
  }
}
