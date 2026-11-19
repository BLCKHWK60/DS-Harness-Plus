/**
 * "End and wipe": deleting a Recon conversation for good. Not the trash: the files are removed.
 * The app keeps an open conversation in memory, and its files cannot be taken away under it, so a
 * conversation is first put on a list and its files are deleted as soon as the app has let go of
 * it, at the latest when the app next starts. The list holds ids only.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, sep } from 'node:path';
import { keepCopy } from './damaged.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{5,120}$/;

/**
 * The ids a damaged list still plainly holds: the leading run of quoted ids of a cut-off JSON array
 * (`["a1b2c3","d4e5f6","g7h`). Anything after the first thing that is not a quoted id is not trusted.
 * @param {string} text - the damaged file.
 * @returns {string[]} valid ids only.
 */
export function salvage(text) {
  const out = [];
  let rest = String(text).replace(/^\s*\[/, (m) => (m ? '' : m));
  if (rest === String(text)) return out;
  for (;;) {
    const hit = /^\s*"([^"\\]*)"\s*(?:,|\]|$)/.exec(rest);
    if (!hit) break;
    if (ID.test(hit[1]) && !out.includes(hit[1])) out.push(hit[1]);
    rest = rest.slice(hit[0].length);
  }
  return out;
}

/**
 * @param {string} file - where the list is kept; '' keeps it in memory.
 * @param {(id: string, what: 'add' | 'done') => void} [onChange] - told when a conversation joins or leaves the list (Artifacts forgets what it made).
 * @returns {object} the list of conversations waiting to be deleted.
 */
export function openWipeList(file, onChange) {
  let ids = [];
  /** Plain words when the file was damaged at start; '' otherwise. */
  let trouble = '';
  /** True when a damaged file could not be copied aside: nothing may be saved over it. */
  let blocked = false;
  if (file) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        blocked = true;
        trouble = `Recon's list of ended conversations waiting to be deleted (wipe.json) could not be read (${String(error?.code ?? error?.message ?? error).slice(0, 60)}), so it was left exactly as it is and no conversation can be ended until it can be read. Their files are deleted once it can.`;
      }
    }
    if (text !== undefined) {
      let ok = false;
      try {
        const read = JSON.parse(text);
        if (Array.isArray(read)) {
          ids = read.filter((id) => typeof id === 'string' && ID.test(id));
          ok = true;
        }
      } catch {
        ok = false;
      }
      if (!ok) {
        // Damaged (a cut-off write, a hand edit): a copy is kept, the ids that are still plainly there are
        // kept on the list (an ended conversation stays on its way to deletion), and the user is told.
        const kept = keepCopy(file, text);
        ids = salvage(text);
        blocked = !kept.copied;
        trouble = `Recon's list of ended conversations waiting to be deleted (wipe.json) was damaged. ${kept.copied ? `A copy was kept as ${kept.aside}.` : 'No copy could be made, so the file was left as it is and no conversation can be ended until that is fixed.'} ${ids.length} ended conversation${ids.length === 1 ? ' was' : 's were'} recovered and will still be deleted. If an ended conversation is still in your Archived list, end it again with /recon end confirm.`;
      }
    }
  }
  const save = () => {
    if (!file) return;
    if (blocked) throw new Error(trouble);
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
      try { onChange?.(String(id), 'add'); } catch { /* a listener never stops a wipe */ }
    },
    done(id) {
      if (!ids.includes(id)) return;
      ids = ids.filter((other) => other !== id);
      save();
      try { onChange?.(String(id), 'done'); } catch { /* a listener never stops a wipe */ }
    },
    has: (id) => ids.includes(id),
    list: () => [...ids],
    /** @returns {string} plain words when the file was damaged at start, else ''. */
    problem: () => trouble,
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

/**
 * Take an ended conversation out of the Cowork sidebar's trash as well: a conversation deleted from
 * the Archived list after /recon end would otherwise sit there for 30 days with "Put back", which
 * End and wipe never allows. Removes `<trashDir>/<id>` and the id from `<trashDir>/pending.json`.
 * @param {string} trashDir - the trash folder (`<app home>/trash/conversations`), or '' when unknown.
 * @param {string} id - the conversation.
 * @returns {{removed: boolean, unlisted: boolean}} what was taken out.
 */
export function wipeTrashed(trashDir, id) {
  const out = { removed: false, unlisted: false };
  if (!trashDir || !ID.test(String(id)) || !existsSync(trashDir)) return out;
  const base = realpathSync(trashDir);
  const folder = join(trashDir, id);
  if (existsSync(folder)) {
    const real = realpathSync(folder);
    if (basename(real) !== id || !real.startsWith(base + sep)) throw new Error('that folder is not in the trash; nothing was deleted');
    rmSync(real, { recursive: true, force: true });
    out.removed = !existsSync(folder);
  }
  const pendingFile = join(trashDir, 'pending.json');
  if (existsSync(pendingFile)) {
    let pending = [];
    try {
      pending = JSON.parse(readFileSync(pendingFile, 'utf8'));
    } catch {
      pending = [];
    }
    if (Array.isArray(pending) && pending.some((item) => item?.id === id)) {
      const temp = `${pendingFile}.${process.pid}.tmp`;
      writeFileSync(temp, JSON.stringify(pending.filter((item) => item?.id !== id), null, 2));
      renameSync(temp, pendingFile);
      out.unlisted = true;
    }
  }
  return out;
}

