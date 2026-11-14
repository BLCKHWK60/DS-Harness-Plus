/**
 * "End and wipe": deleting a Recon conversation for good. Not the trash: the files are removed.
 * The app keeps an open conversation in memory, and its files cannot be taken away under it, so a
 * conversation is first put on a list and its files are deleted as soon as the app has let go of
 * it, at the latest when the app next starts. The list holds ids only.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, sep } from 'node:path';

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{5,120}$/;

/**
 * @param {string} file - where the list is kept; '' keeps it in memory.
 * @returns {object} the list of conversations waiting to be deleted.
 */
export function openWipeList(file) {
  let ids = [];
  if (file) {
    try {
      const read = JSON.parse(readFileSync(file, 'utf8'));
      if (Array.isArray(read)) ids = read.filter((id) => typeof id === 'string' && ID.test(id));
    } catch {
      ids = [];
    }
  }
  const save = () => {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(ids));
    renameSync(temp, file);
  };
  return {
    add(id) {
      if (!ID.test(String(id)) || ids.includes(id)) return;
      ids = [...ids, id];
      save();
    },
    done(id) {
      if (!ids.includes(id)) return;
      ids = ids.filter((other) => other !== id);
      save();
    },
    has: (id) => ids.includes(id),
    list: () => [...ids],
  };
}

/**
 * Delete one conversation's files. Refuses anything that is not plainly a conversation's own
 * folder inside the app's conversations folder.
 * @param {object} part - `id`, `folder` (the conversation's own folder), `cache` (its list entry file, optional).
 * @param {string} root - the app's conversations folder.
 * @returns {boolean} whether the folder is gone now.
 */
export function wipeFiles({ id, folder, cache }, root) {
  if (!ID.test(String(id))) throw new Error('not a conversation id');
  if (existsSync(folder)) {
    const real = realpathSync(folder);
    const base = realpathSync(root);
    if (basename(real) !== id || !real.startsWith(base + sep) || real === base) throw new Error('that folder is not a conversation of this app; nothing was deleted');
    rmSync(real, { recursive: true, force: true });
  }
  if (cache && basename(cache) === `${id}.json`) rmSync(cache, { force: true });
  return !existsSync(folder);
}
