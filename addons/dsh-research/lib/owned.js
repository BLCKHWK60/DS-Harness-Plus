/**
 * Files made for a Scratch conversation (Scratch part, step 40): which report files a Scratch thread
 * made, so they go when the thread is deleted for good. Kept in one small JSON file of this add-on.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, sep } from 'node:path';

/** At most this many files are remembered (the oldest are forgotten first: their files simply stay). */
export const OWNED_MAX = 2000;

/**
 * @param {string} file - the JSON file ('' keeps nothing).
 * @returns {{add: (sessionId: string, path: string) => void, take: (ids: string[]) => string[], list: () => Array<{id: string, file: string}>}} the list.
 */
export function openOwned(file) {
  const read = () => {
    try {
      const value = JSON.parse(readFileSync(file, 'utf8'));
      return Array.isArray(value) ? value.filter((entry) => typeof entry?.id === 'string' && typeof entry?.file === 'string') : [];
    } catch {
      return [];
    }
  };
  const write = (entries) => {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temp, JSON.stringify(entries.slice(-OWNED_MAX)), { mode: 0o600 });
    renameSync(temp, file);
  };
  return {
    add(sessionId, path) {
      if (!file || !sessionId || !isAbsolute(String(path ?? ''))) return;
      write([...read(), { id: String(sessionId), file: String(path) }]);
    },
    take(ids) {
      if (!file) return [];
      const want = new Set(ids);
      const entries = read();
      const gone = entries.filter((entry) => want.has(entry.id));
      if (gone.length > 0) write(entries.filter((entry) => !want.has(entry.id)));
      return gone.map((entry) => entry.file);
    },
    list: () => (file ? read() : []),
  };
}

/** @returns {boolean} whether `path` is a file inside `folder` (never the folder itself, never outside it). */
export function insideFolder(path, folder) {
  if (!isAbsolute(String(path ?? '')) || !isAbsolute(String(folder ?? ''))) return false;
  const rel = relative(folder, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** Remove report files inside `folder` (and a sidecar of the same name with `extra` appended). @returns {number} how many went. */
export function removeOwned(files, folder, extras = []) {
  let removed = 0;
  for (const path of files) {
    if (!insideFolder(path, folder)) continue;
    for (const target of [path, ...extras.map((extra) => `${path}${extra}`)]) {
      if (!existsSync(target)) continue;
      // A sidecar folder (a report's packet) goes with its files; never through a link.
      const stat = lstatSync(target);
      rmSync(target, { force: true, recursive: target !== path && stat.isDirectory() && !stat.isSymbolicLink() });
      if (target === path) removed += 1;
    }
  }
  return removed;
}
