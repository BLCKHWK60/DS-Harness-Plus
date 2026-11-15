// Loads the add-on for a test with its room moved to a throwaway folder. apply() empties the room,
// and the real one (/private/tmp/dsh-recon-room) may be in use by the running app, so no test may
// load index.js any other way.
import { mkdtempSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

/**
 * Whether two paths name the same folder, by what the disk says rather than by their spelling:
 * /tmp is a link to /private/tmp, and the Mac's disk does not tell capitals from small letters.
 * @param {string} room - the room the add-on took.
 * @param {string} real - the real room.
 * @returns {boolean} true when they are, or may be, the same folder.
 */
export function sameRoom(room, real) {
  if (room === real) return true;
  // The real room's name in any spelling, whether it exists now or not.
  if (basename(room).toLowerCase() === basename(real).toLowerCase()) return true;
  try {
    const a = statSync(room);
    const b = statSync(real);
    if (a.dev === b.dev && a.ino === b.ino) return true;
  } catch {
    /* one of them is not there: no folder is shared now */
  }
  try {
    // The native call gives the spelling on disk; the plain one keeps the spelling it is given.
    return realpathSync.native(room).toLowerCase() === realpathSync.native(real).toLowerCase();
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<object>} the add-on's module, whose ROOM is a throwaway folder.
 */
export async function loadRecon() {
  if (!process.env.DSH_RECON_ROOM) {
    const room = mkdtempSync(join(tmpdir(), 'dsh-recon-room-test-'));
    process.env.DSH_RECON_ROOM = room;
    process.on('exit', () => rmSync(room, { recursive: true, force: true }));
  }
  const recon = await import('../../index.js');
  if (sameRoom(recon.ROOM, recon.DEFAULT_ROOM)) throw new Error('The test room was not taken, so the add-on is not started: it would empty the real Recon folder.');
  return recon;
}
