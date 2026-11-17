/**
 * The night shift (plan step T10): the background process the owner switches on. It runs on the Mac it is
 * switched on on, only while that Mac is on power and has been idle for a while, and it stops the moment he
 * needs the machine. It never promotes anything by itself: in the morning he finds cards.
 *
 * What it does by itself: cut new rows, send one in five to the exam, sort the rest into sets, drop repeats,
 * build question-and-answer rows (checked against their source), find the weakest spot and propose the
 * lowest rung. What it does only where the owner allowed it for that set: train a candidate and examine it.
 */

/** The Mac's power from `pmset -g batt`: on mains power or not. */
export function onPower(text) {
  return /drawing from 'AC Power'/i.test(String(text ?? ''));
}

/** Seconds since the Mac was last used, from `ioreg -c IOHIDSystem -d 4` (HIDIdleTime, in nanoseconds). */
export function idleSeconds(text) {
  const found = /"HIDIdleTime"\s*=\s*(\d+)/.exec(String(text ?? ''));
  return found ? Math.floor(Number(found[1]) / 1e9) : 0;
}

/** The fixed commands that read power and idle time (never through a shell). */
export const POWER = ['/usr/bin/pmset', ['-g', 'batt']];
export const IDLE = ['/usr/sbin/ioreg', ['-c', 'IOHIDSystem', '-d', '4']];

/**
 * Whether the night shift may work now.
 * @param {{on: boolean, power: boolean, idle: number, idleMinutes: number, busy?: boolean}} now
 * @returns {{ok: boolean, why: string}}
 */
export function mayWork({ on, power, idle, idleMinutes = 15, busy = false }) {
  if (!on) return { ok: false, why: 'the night shift is switched off' };
  if (!power) return { ok: false, why: 'the Mac is not on power' };
  if (idle < idleMinutes * 60) return { ok: false, why: `the Mac was used ${Math.round(idle / 60)} minutes ago (it waits for ${idleMinutes} minutes of quiet)` };
  if (busy) return { ok: false, why: 'something else is running' };
  return { ok: true, why: '' };
}

/** Whether a running job must stop: the owner is back (the Mac was used in the last minute) or it lost power. */
export function mustStop({ power, idle }) {
  if (!power) return 'the Mac went on battery';
  if (idle < 60) return 'the Mac is being used';
  return '';
}

/** The steps of one night, in order; the last only for sets the owner allowed to train. */
export const STEPS = ['harvest', 'exam-split', 'sets', 'repeats', 'qa', 'weakest', 'propose', 'train'];
