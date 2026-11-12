/**
 * How long one research run may take. Kept apart from the plugin so it can be tested without the app.
 */

/** Time kept back, inside a program, for writing the report after the searching stops. */
export const REPORT_RESERVE_MS = 3 * 60 * 1000;

/**
 * Whether a tool call was made from inside a program (the app's PTC preset).
 * @param {unknown} callId - the call's id.
 * @returns {boolean} true when it was.
 */
export function insideProgram(callId) {
  return String(callId ?? '').includes(':ptc:');
}

/**
 * The time budget of a run, in minutes.
 * The app stops a program after a fixed time, with everything in it. Inside one, searching ends
 * early enough to leave time for the report, so a long run ends with a report instead of nothing.
 * @param {object} want - what applies.
 * @param {number} [want.configured] - the limit from Settings.
 * @param {number} [want.asked] - what the model asked for.
 * @param {boolean} [want.inProgram] - the call came from inside a program.
 * @param {number} [want.programMaxMs] - the longest a program may run.
 * @returns {number} minutes, at least 1.
 */
export function researchMinutes({ configured, asked, inProgram, programMaxMs } = {}) {
  let minutes = Math.min(Number(configured) || 20, Number(asked) || Infinity);
  const max = Number(programMaxMs);
  if (inProgram && max > 0) minutes = Math.min(minutes, (max - REPORT_RESERVE_MS) / 60000);
  return Math.max(1, minutes);
}
