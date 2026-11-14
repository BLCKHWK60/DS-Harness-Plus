/**
 * Putting an engine's work into the project. The engine works in a copy; this file finds what it
 * changed there, and copies those changes into the real project when the permission mode, or the
 * user, says so.
 *   - A file the user changed in the project in the meantime is not overwritten: it is reported.
 *   - What is replaced or deleted is kept first, so the last apply can be undone.
 *   - Only plain files inside the project are touched. Links are left alone.
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';

/** Folders that are not the engine's handwork; never compared, never applied. */
export const SKIP = new Set(['.git', 'node_modules', '.dsh-mission', '.venv', '__pycache__', '.DS_Store']);
const MAX_FILES = 40_000;

/** Every plain file under a folder, as paths from its top. */
function filesOf(root) {
  const out = new Map();
  const walk = (dir, prefix) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else if (entry.isFile()) {
        if (out.size >= MAX_FILES) throw new Error('The project has too many files to compare.');
        out.set(rel, join(dir, entry.name));
      }
    }
  };
  walk(root, '');
  return out;
}
const same = (a, b) => {
  try {
    const one = lstatSync(a);
    const two = lstatSync(b);
    if (!one.isFile() || !two.isFile() || one.size !== two.size) return false;
    return readFileSync(a).equals(readFileSync(b));
  } catch {
    return false;
  }
};
const safe = (rel) => typeof rel === 'string' && rel.length > 0 && !rel.startsWith('/') && !rel.split('/').some((part) => part === '..' || part === '' || SKIP.has(part));

/**
 * What the engine changed: the difference between the starting point and its copy.
 * @param {string} base - the starting point.
 * @param {string} work - the engine's copy.
 * @returns {{path: string, kind: 'added' | 'changed' | 'removed'}[]} in path order.
 */
export function pending(base, work) {
  const before = filesOf(base);
  const after = filesOf(work);
  const out = [];
  for (const [rel, file] of after) {
    if (!before.has(rel)) out.push({ path: rel, kind: 'added' });
    else if (!same(before.get(rel), file)) out.push({ path: rel, kind: 'changed' });
  }
  for (const rel of before.keys()) if (!after.has(rel)) out.push({ path: rel, kind: 'removed' });
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Put changes into the project.
 * @param {object} input - `project`, `base`, `work`, `undo` (a folder for what is replaced),
 *   `only` (paths to apply; leave out for all), `kinds` (kinds to apply; leave out for all).
 * @returns {{applied: {path: string, kind: string}[], conflicts: string[], left: {path: string, kind: string}[]}}
 *   `conflicts` are files the user changed in the project since the engine started; they are not touched.
 */
export function apply({ project, base, work, undo, only, kinds }) {
  const all = pending(base, work);
  const wanted = all.filter((change) => (!only || only.includes(change.path)) && (!kinds || kinds.includes(change.kind)));
  const applied = [];
  const conflicts = [];
  rmSync(undo, { recursive: true, force: true });
  const record = [];
  for (const change of wanted) {
    if (!safe(change.path)) continue;
    const target = join(project, change.path);
    const origin = join(base, change.path);
    const made = join(work, change.path);
    // The project must still look as it did when the engine started: same file, or no file.
    const untouched = change.kind === 'added' ? !existsSync(target) : same(target, origin);
    if (!untouched && !same(target, made)) {
      conflicts.push(change.path);
      continue;
    }
    let had = false;
    try {
      had = lstatSync(target).isFile();
    } catch {
      had = false;
    }
    if (existsSync(target) && !had) {
      conflicts.push(change.path);
      continue;
    }
    if (had) {
      mkdirSync(dirname(join(undo, 'files', change.path)), { recursive: true });
      copyFileSync(target, join(undo, 'files', change.path));
    }
    record.push({ path: change.path, had });
    if (change.kind === 'removed') {
      rmSync(target, { force: true });
      rmSync(origin, { force: true });
    } else {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(made, target);
      mkdirSync(dirname(origin), { recursive: true });
      copyFileSync(made, origin);
    }
    applied.push(change);
  }
  if (record.length > 0) {
    mkdirSync(undo, { recursive: true });
    writeFileSync(join(undo, 'undo.json'), JSON.stringify({ at: Date.now(), project, files: record }));
  }
  const done = new Set(applied.map((change) => change.path));
  return { applied, conflicts, left: all.filter((change) => !done.has(change.path)) };
}

/**
 * Take back the last apply: every file it replaced or deleted is put back, every file it added is removed.
 * @param {string} project - the project.
 * @param {string} undo - the folder the last apply kept.
 * @returns {string[]} the paths put back; empty when there is nothing to take back.
 */
export function undoLast(project, undo) {
  let record;
  try {
    record = JSON.parse(readFileSync(join(undo, 'undo.json'), 'utf8'));
  } catch {
    return [];
  }
  if (record?.project !== project || !Array.isArray(record.files)) return [];
  const back = [];
  for (const file of record.files) {
    if (!safe(file?.path)) continue;
    const target = join(project, file.path);
    if (file.had) {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(undo, 'files', file.path), target);
    } else rmSync(target, { force: true });
    back.push(file.path);
  }
  rmSync(undo, { recursive: true, force: true });
  return back;
}

/** A short list of changes for a message. */
export function listing(changes, max = 30) {
  const sign = { added: '+', changed: '~', removed: '−' };
  const lines = changes.slice(0, max).map((change) => `${sign[change.kind] ?? '?'} ${change.path.split(sep).join('/')}`);
  if (changes.length > max) lines.push(`… and ${changes.length - max} more`);
  return lines.join('\n');
}
