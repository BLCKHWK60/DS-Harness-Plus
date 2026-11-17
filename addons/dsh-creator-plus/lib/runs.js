/**
 * Run folders. Every sandboxed program runs in a fresh throwaway folder of its own (`<home>/runs/r-…`):
 * the host makes it and fills it from copies only the host can write (the checked copy, the prepared
 * change, Creator Plus's own modules, the owner's Plus folder) BEFORE any sandboxed program starts; the
 * sandbox may write only there; afterwards the host reads nothing from it (only the programs' output) and
 * removes it (removing never follows a link). Every folder on the way to it is checked to be no link.
 */
import { cpSync, lstatSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

/**
 * Make a folder inside a base folder, every part of the way checked to be a real folder, never a link.
 * @param {string} base - a folder only the host writes (Creator Plus's own).
 * @param {...string} parts - the folders below it.
 * @returns {string} the folder.
 */
export function ownFolder(base, ...parts) {
  mkdirSync(dirname(base), { recursive: true, mode: 0o700 });
  let here = base;
  for (const part of ['', ...parts]) {
    here = part ? join(here, part) : here;
    let stat;
    try {
      stat = lstatSync(here);
    } catch {
      mkdirSync(here, { mode: 0o700 });
      stat = lstatSync(here);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${here} is not a plain folder; nothing was done.`);
  }
  return here;
}

/** @returns {boolean} whether any part of a path below a base folder is a link (a part that is not there yet is no link). */
export function linkOnTheWay(base, path) {
  const rel = relative(base, path);
  if (rel.startsWith('..') || rel === '') return rel !== '';
  let here = base;
  for (const part of rel.split(sep)) {
    here = join(here, part);
    try {
      if (lstatSync(here).isSymbolicLink()) return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Copy a folder the host owns into a run folder, without links. */
export function copyIn(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true, dereference: false, errorOnExist: false, force: true, filter: (path) => !lstatSync(path).isSymbolicLink() });
}

/**
 * @param {{home: string, run: Function}} options - Creator Plus's own folder, and the sandboxed runner (lib/sandbox.js).
 * @returns {{with: (prepare: (dir: string) => object, work: (inside: object) => Promise<any>) => Promise<any>}} run folders.
 */
export function openRuns({ home, run }) {
  return {
    /**
     * One run: a fresh folder, filled by `prepare(dir)` (host copies, before anything runs), then `work`
     * with a runner bound to it; the folder is removed at the end, whatever happened.
     */
    async with(prepare, work) {
      const root = ownFolder(home, 'runs');
      const dir = mkdtempSync(join(root, 'r-'));
      try {
        mkdirSync(join(dir, 'tmp'), { mode: 0o700 });
        const placed = (await prepare(dir)) ?? {};
        const bound = (file, args, options = {}) => run(file, args, { ...options, place: dir });
        return await work({ ...placed, dir, run: bound });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
