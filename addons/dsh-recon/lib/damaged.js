/**
 * A damaged privacy file (door.json: which conversations were moved out of Recon; wipe.json: which ended
 * conversations still have files to delete) is never overwritten and never read as "empty": that would stop
 * moved conversations being treated as private, or stop ended conversations from being deleted.
 * A copy of the damaged text is kept beside it (never over an earlier copy), and the caller fails closed.
 */
import { copyFileSync, constants, existsSync } from 'node:fs';

const stamp = (now) => new Date(now).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
/** file -> the damaged text already copied aside, so a file read again and again is copied once. */
const copied = new Map();

/**
 * Keep a copy of a damaged file beside it, under a name nobody has used.
 * @param {string} file - the damaged file (it stays where it is).
 * @param {string} text - what it held when it was read.
 * @param {() => number} [now] - the clock (tests).
 * @returns {{aside: string, copied: boolean}} where the copy is, and whether one exists.
 */
export function keepCopy(file, text, now = Date.now) {
  const known = copied.get(file);
  if (known && known.text === text) return { aside: known.aside, copied: true };
  const first = `${file}.damaged-${stamp(now())}`;
  let aside = first;
  for (let n = 2; existsSync(aside) && n < 1000; n += 1) aside = `${first}-${n}`;
  try {
    copyFileSync(file, aside, constants.COPYFILE_EXCL);
    copied.set(file, { text, aside });
    return { aside, copied: true };
  } catch {
    return { aside: '', copied: false };
  }
}
