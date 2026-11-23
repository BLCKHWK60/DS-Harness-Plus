/**
 * Which threads are in the left panel's Trash (dsh-cowork-shell). The trash moves a deleted thread's
 * files out of the app's store for 30 days, so the app no longer lists it, yet it can still be put
 * back. Its choices (tab, Web, Tools, isolation, access level) must therefore be kept until it is
 * erased for good. Read straight from the trash folder, so it works whichever add-on loads first.
 *
 * Layout (see addons/dsh-cowork-shell/lib/trash.js): `<dir>/<id>/info.json` lists the thread
 * and its helper threads as `parts`; `<dir>/pending.json` lists threads whose files
 * could not move yet.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SAFE = /^[\w-][\w.-]{0,159}$/;
const safe = (id) => typeof id === 'string' && SAFE.test(id) && !id.includes('..');

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * The ids of every thread in the trash: moved ones with their helper threads, and
 * those still waiting to move.
 * @param {string} dir - the trash folder (`<app home>/trash/conversations`), or '' when unknown.
 * @returns {Set<string> | null} the ids; an empty set when there is no trash folder; null when the
 *   trash could not be read, in which case nothing may be treated as gone.
 */
export function trashedIds(dir) {
  const ids = new Set();
  if (!dir) return null;
  let names;
  try {
    // Folders only: pending.json sits beside them.
    names = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    return error?.code === 'ENOENT' ? ids : null;
  }
  try {
    for (const name of names) {
      if (!safe(name)) continue;
      const info = readJson(join(dir, name, 'info.json'));
      if (!info || typeof info !== 'object') {
        // A folder without its record may be a move in progress: keep its id.
        ids.add(name);
        continue;
      }
      if (safe(info.id)) ids.add(info.id);
      for (const part of Array.isArray(info.parts) ? info.parts : []) if (safe(part?.id)) ids.add(part.id);
    }
    const pending = readJson(join(dir, 'pending.json'));
    for (const item of Array.isArray(pending) ? pending : []) if (safe(item?.id)) ids.add(item.id);
  } catch {
    return null;
  }
  return ids;
}
