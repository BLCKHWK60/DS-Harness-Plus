/**
 * Writes in a folder Creator Plus does not hold alone (the build folder inside the conversation's
 * folder, where the model writes too): every part of the way, from a base folder down, is checked to be
 * a plain folder, never a link (lstat); a new file is made with O_EXCL|O_NOFOLLOW; a file is replaced
 * through a new file beside it and a rename (which replaces a name, never follows it). One helper for
 * every host write there: the plan's brief, the first files, the passport, the hand-off.
 */
import { closeSync, constants as fsConstants, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { basename, dirname, join, normalize, sep } from 'node:path';

/** How a new file is opened: made fresh (never over a name that appeared meanwhile), never through a link. */
export const NEW = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW;

/** @returns {string[]} a relative path's parts, refusing anything that leaves the base. */
function partsOf(rel) {
  const clean = normalize(String(rel ?? ''));
  if (!clean || clean === '.' || clean.startsWith('..') || clean.startsWith(sep) || clean.includes('\0')) throw new Error(`"${String(rel).slice(0, 80)}" is not a place inside the build folder.`);
  return clean.split(sep).filter(Boolean);
}

/**
 * A folder below the base, made when missing, every part checked to be a plain folder.
 * @param {string} base - a plain folder that exists (the conversation's folder, by its real path).
 * @param {string} rel - the folder below it.
 * @returns {string} the folder.
 */
export function safeDir(base, rel = '') {
  let here = base;
  if (!lstatSync(base).isDirectory()) throw new Error(`${base} is not a plain folder; nothing was written.`);
  for (const part of rel ? partsOf(rel) : []) {
    here = join(here, part);
    let stat;
    try {
      stat = lstatSync(here);
    } catch {
      mkdirSync(here, { mode: 0o755 });
      stat = lstatSync(here);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${here} is a link or not a folder; Creator Plus does not write through links. Nothing was written.`);
  }
  return here;
}

/**
 * Write a file below the base.
 * @param {string} base - a plain folder that exists.
 * @param {string} rel - the file below it.
 * @param {string | Buffer} data - its contents.
 * @param {{keep?: boolean, fresh?: boolean, mode?: number}} [options] - `keep`: leave a file that is there;
 *   `fresh`: refuse when one is there; otherwise replace it.
 * @returns {'written' | 'kept'} what happened.
 */
export function safeWrite(base, rel, data, { keep = false, fresh = false, mode = 0o644 } = {}) {
  const parts = partsOf(rel);
  const dir = safeDir(base, parts.slice(0, -1).join(sep));
  const target = join(dir, parts[parts.length - 1]);
  let there = false;
  try {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${target} is a link or not a file; nothing was written.`);
    there = true;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (there && keep) return 'kept';
  if (there && fresh) throw new Error(`${basename(target)} is there already; nothing was written over it.`);
  const write = (path) => {
    const fd = openSync(path, NEW, mode);
    try {
      writeSync(fd, typeof data === 'string' ? data : Buffer.from(data));
    } finally {
      closeSync(fd);
    }
  };
  // A new file only: made with O_EXCL|O_NOFOLLOW, so a name that appeared meanwhile is neither replaced nor followed.
  if (fresh) {
    write(target);
    return 'written';
  }
  const temp = join(dir, `.${basename(target)}.${process.pid}.${Math.random().toString(36).slice(2, 10)}.tmp`);
  write(temp);
  try {
    renameSync(temp, target);
  } catch (error) {
    try {
      unlinkSync(temp);
    } catch {
      /* gone */
    }
    throw error;
  }
  return 'written';
}

/**
 * Copy a folder the host owns (Creator Plus's own modules) below the base, file by file through safeWrite.
 * Links in the source are left out.
 */
export function safeCopy(from, base, rel) {
  safeDir(base, rel);
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const inside = join(rel, entry.name);
    if (entry.isDirectory()) safeCopy(join(from, entry.name), base, inside);
    else if (entry.isFile()) safeWrite(base, inside, readFileSync(join(from, entry.name)), { keep: true });
  }
}

/** @returns {string} a path below the base, as a relative path (refusing one outside it). */
export function below(base, path) {
  const rel = normalize(path).slice(normalize(base).length + 1);
  if (!normalize(path).startsWith(`${normalize(base)}${sep}`)) throw new Error(`${path} is not inside ${base}.`);
  return rel || dirname(rel);
}
