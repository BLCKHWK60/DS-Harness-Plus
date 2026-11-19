// ---- dsh-json-store: master copy. `node scripts/sync-kit.mjs` copies it to addons/<name>/lib/json-store.js ----
// Reading a small JSON file a store keeps (memory, settings of a mode, a learned list…) WITHOUT losing it
// when it is damaged. Before (review H4, 18 November 2026) about ten stores treated an unreadable file as
// empty and wrote over it at the next save, so one bad write or a hand edit lost everything. Now a damaged
// file is renamed `<file>.damaged-<date-time>` (kept for good, never overwritten), the store starts from its
// default, and one plain note is queued for the user (Settings → Settings Plus shows it once).
import { copyFileSync, constants, existsSync, readFileSync, renameSync } from 'node:fs';

/** The notes still to show, shared by every copy of this file in the app's process. */
const KEY = Symbol.for('dsh.damagedFiles');
const queue = () => (globalThis[KEY] ??= []);

const stamp = (now) => new Date(now).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

/**
 * Read a JSON file, or a default when there is nothing (yet) or it cannot be used.
 * @param {string} file - the file; '' gives the default (a store kept in memory).
 * @param {unknown | (() => unknown)} fallback - what a new store starts with (a function gives a fresh one).
 * @param {object} [options] - `label` (plain name for the note, "your memory"), `valid` (a check of the
 *   parsed value; false counts as damaged), `warn` (log line), `now` (tests).
 * @returns {unknown} the parsed value, or the default.
 */
export function readJsonStore(file, fallback, { label = '', valid, warn, now = Date.now } = {}) {
  const fresh = () => (typeof fallback === 'function' ? fallback() : fallback);
  if (!file) return fresh();
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    // Nothing there yet is normal. A file that cannot be read for another reason (no permission) is left
    // exactly where it is, and the store runs from its default for now.
    if (error?.code !== 'ENOENT') warn?.(`could not read ${file}: ${String(error?.message ?? error)}`);
    return fresh();
  }
  try {
    const value = JSON.parse(text);
    if (typeof valid !== 'function' || valid(value)) return value;
  } catch {
    // Not valid JSON: handled below.
  }
  // A name nobody has used: two damaged files in one second, or a second damage of the same file, never share one
  // (renaming onto an existing file would silently overwrite the first kept copy).
  const first = `${file}.damaged-${stamp(now())}`;
  let aside = first;
  for (let n = 2; existsSync(aside) && n < 1000; n += 1) aside = `${first}-${n}`;
  let kept = false;
  try {
    if (existsSync(aside)) throw new Error('no free name for the kept copy');
    renameSync(file, aside);
    kept = true;
  } catch (error) {
    warn?.(`${file} is damaged and could not be moved aside: ${String(error?.message ?? error)}`);
    try {
      // Moving failed: a copy still keeps the text (COPYFILE_EXCL never overwrites). The next save replaces the
      // damaged file itself, so the text must be safe somewhere first.
      copyFileSync(file, aside, constants.COPYFILE_EXCL);
      kept = true;
    } catch {
      kept = false;
    }
  }
  if (!kept) {
    // Neither moved nor copied: starting empty would let the next save write over the only copy. Stop instead.
    queue().push({ at: now(), label: String(label || 'a saved file'), file, aside: '' });
    throw new Error(`${file} is damaged and a safe copy of it could not be made, so it was left untouched and not used. Fix or move that file by hand, then start the app again.`);
  }
  warn?.(`${file} could not be read${kept ? `; it was kept as ${aside} and a new one was started` : ''}`);
  queue().push({ at: now(), label: String(label || 'a saved file'), file, aside: kept ? aside : '' });
  return fresh();
}

/** @returns {{at: number, label: string, file: string, aside: string}[]} the notes not yet shown (not removed). */
export const damagedNotes = () => [...queue()];
/** Remove the notes that were shown. @returns {number} how many were removed. */
export function clearDamagedNotes() {
  const list = queue();
  const n = list.length;
  list.length = 0;
  return n;
}
// ---- dsh-json-store:end ----
