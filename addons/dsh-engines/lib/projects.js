/**
 * Which folders the Compare page may copy as a project (stage 6b lab fix). A comparison copies the whole folder three
 * times and gives one copy to an outside engine with a shell and the open network, so these are never taken:
 *   - Recon's room, a folder in it, or a folder that holds it (the room always sits directly in the temporary folder,
 *     so the temporary folder and every folder above it count as holding it). A folder named like a room in the
 *     temporary folder is refused also while Recon is off. Recon's answer that throws: refused (fail closed).
 *   - The app's data folder (it holds Scratch, the threads' folders of Devices guests, and the engines' own copies), a
 *     folder in it, or one that holds it.
 *   - /dev, a Devices folder, or a folder that holds or lies in one (Devices says; its answer 'unknown' refuses).
 * Pure apart from the real-path lookups; every outside answer comes in through `deps`.
 */
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';

const TEXTS = Object.freeze({
  en: Object.freeze({
    room: 'Recon\'s room cannot be compared: what Recon holds stays in Recon. Choose a project folder.',
    home: 'The app\'s own data folder (Scratch and the threads\' folders are in it) cannot be compared. Choose a project folder.',
    devices: 'A Devices folder (or /dev) cannot be compared: its device files stay in Devices. Choose a project folder.',
    unknown: 'This folder could not be checked, so it is not copied. Choose a project folder.',
  }),
});

/** @returns {string} the real path, or '' when it cannot be read. */
function real(path) {
  try {
    return realpathSync.native(path);
  } catch {
    return '';
  }
}

/** Whether `a` is `b`, lies in `b`, or holds `b` (both real paths). */
function touches(a, b) {
  if (!a || !b) return false;
  const top = (path) => (path === '/' ? '/' : `${path}/`);
  return a === b || a.startsWith(top(b)) || b.startsWith(top(a));
}

/**
 * @param {string} folder - the project's real path.
 * @param {{isRoom?: (path: string) => boolean, dshHome?: string, touchesDevices?: (path: string) => string, temp?: string[]}} deps
 * @returns {'' | 'room' | 'home' | 'devices' | 'unknown'} why it is refused ('' when it may be copied).
 */
export function projectRefusal(folder, deps = {}) {
  const at = real(String(folder ?? '')) || resolve(String(folder ?? '/'));
  // Recon's room: the room, a folder in it (Recon says), or a folder that holds the temporary folder the room sits in.
  if (typeof deps.isRoom === 'function') {
    try {
      if (deps.isRoom(at) === true) return 'room';
    } catch {
      return 'room';
    }
  }
  const temp = (deps.temp ?? [real('/tmp'), real(tmpdir())]).filter(Boolean);
  for (const place of temp) {
    if (place === at || place.startsWith(at === '/' ? '/' : `${at}/`)) return 'room';
    // A room's name directly in the temporary folder (or a folder in such a room), also while Recon is off.
    let up = at;
    while (up && up !== '/' && up.startsWith(`${place}/`)) {
      if (dirname(up) === place && /^dsh-recon-/i.test(basename(up))) return 'room';
      up = dirname(up);
    }
  }
  const home = deps.dshHome ? real(deps.dshHome) || resolve(deps.dshHome) : '';
  if (home && touches(at, home)) return 'home';
  if (['/dev', '/private/dev'].some((dev) => touches(at, dev))) return 'devices';
  if (typeof deps.touchesDevices === 'function') {
    let answer;
    try {
      answer = deps.touchesDevices(at);
    } catch {
      answer = 'unknown';
    }
    if (answer === 'devices' || answer === 'dev') return 'devices';
    if (answer !== '') return 'unknown';
  }
  return '';
}

/** The sentence for a refusal key. `_lang` is still accepted and ignored: English only (owner decision 28). */
// eslint-disable-next-line no-unused-vars
export function projectRefusalText(key, _lang = 'en') {
  return TEXTS.en[key] ?? TEXTS.en.unknown;
}
