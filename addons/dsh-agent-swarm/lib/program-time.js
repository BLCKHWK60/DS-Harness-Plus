/**
 * Time inside a program (the app's PTC preset), for the long helper tools.
 *
 * Under PTC the model calls tools from inside a `run_code` program. The app stops a program after
 * its time limit (`timeoutMs`: 120 s by default, 600 s at most), and that limit includes the time
 * of every tool the program calls. A tool that runs longer is cancelled with the program, and
 * everything it found is lost. So a long tool called from a program shortens its own time budget
 * to end before the program does, and hands back what it has.
 *
 * Same recognition as Deep research (dsh-deep-research/lib/budget.js): a call made from a program
 * has `:ptc:` in its call id. Deep research plans against the longest a program may run
 * (`ptcRuntime.timeout.maxMs`). This goes one step further when it can: it watches each program
 * start (the `run_code` call, its `timeoutMs` and the moment it began), so a call from a program
 * knows how much of that program's own time is left. When the program's start was not seen, it
 * falls back to Deep research's way: the longest a program may run.
 * The start is noted when the app dispatches the program (the add-ons' `tools/execute` hook), after
 * any approval wait in the tool pipeline, so time spent waiting for the owner is not counted as
 * program time. (An approval inside run_code itself is still counted: the safe direction.)
 *
 * Kept apart from the plugin, with no app imports, so it can be tested on its own and copied to
 * the other long helper tools (delegate_role, review_lanes, run_pipeline) as it is.
 */

/** The app's program tool. */
export const PROGRAM_TOOL = 'run_code';
/** The app's program limits when the runtime does not say (dsh-ptc-runtime-node defaults). */
export const APP_DEFAULT_MS = 120_000;
export const APP_MAX_MS = 600_000;
/** Kept back from the program's remaining time: handing back the result and letting the program finish. */
export const SAFETY_MS = 20_000;
/** Part of the safety margin: how long a stopped helper is given to hand back its unfinished answer. */
export const SALVAGE_MS = 5_000;
/** With less time than this left, starting (or starting another helper) is not worth it. */
export const MIN_RUN_MS = 15_000;
/** Programs remembered at once (a program that never reports its end must not grow the list forever). */
const MAX_PROGRAMS = 200;

/**
 * Whether a tool call was made from inside a program (the app's PTC preset).
 * @param {unknown} callId - the call's id.
 * @returns {boolean} true when it was.
 */
export function insideProgram(callId) {
  return String(callId ?? '').includes(':ptc:');
}

/**
 * The call id of the program a call was made from (`<program>:ptc:<n>`).
 * @param {unknown} callId - the nested call's id.
 * @returns {string} the program's call id, or '' when the call is not from a program.
 */
export function programCallId(callId) {
  const id = String(callId ?? '');
  const at = id.lastIndexOf(':ptc:');
  return at > 0 ? id.slice(0, at) : '';
}

/**
 * The time limit of one program, as the app works it out: what the program asked for, or the
 * default, never above the maximum.
 * @param {unknown} asked - the program's `timeoutMs`, if any.
 * @param {{defaultMs?: number, maxMs?: number}} [runtime] - the app's program limits.
 * @returns {number} milliseconds.
 */
export function programLimitMs(asked, runtime) {
  const max = Number(runtime?.maxMs) > 0 ? Number(runtime.maxMs) : APP_MAX_MS;
  const fallback = Number(runtime?.defaultMs) > 0 ? Number(runtime.defaultMs) : APP_DEFAULT_MS;
  const want = Number(asked) > 0 ? Number(asked) : fallback;
  return Math.min(want, max);
}

/**
 * Remembers when each program started and how long it may run.
 * @param {{now?: () => number}} [options] - a clock, for tests.
 * @returns {{seen: (exec: object, runtime?: object) => void, done: (exec: object) => void, windowFor: (callId: unknown, runtime?: object) => (null | {limitMs: number, remainingMs: number, exact: boolean}), size: () => number}} the clock.
 */
export function createProgramClock({ now = Date.now } = {}) {
  const programs = new Map();
  return {
    /** A tool call is about to run: when it is a program, note its start and its limit. */
    seen(exec, runtime) {
      if (exec?.name !== PROGRAM_TOOL) return;
      const id = String(exec.callId ?? '');
      if (!id || programs.has(id)) return;
      const args = exec.arguments && typeof exec.arguments === 'object' ? exec.arguments : {};
      if (programs.size >= MAX_PROGRAMS) programs.delete(programs.keys().next().value);
      programs.set(id, { startedAt: now(), limitMs: programLimitMs(args.timeoutMs, runtime) });
    },
    /** A tool call has ended: a program is forgotten. */
    done(exec) {
      if (exec?.name === PROGRAM_TOOL) programs.delete(String(exec.callId ?? ''));
    },
    /**
     * How much program time a call has, or null when the call is not from a program.
     * exact: the program's start was seen; otherwise the longest a program may run is assumed.
     */
    windowFor(callId, runtime) {
      if (!insideProgram(callId)) return null;
      const known = programs.get(programCallId(callId));
      if (known) return { limitMs: known.limitMs, remainingMs: Math.max(0, known.startedAt + known.limitMs - now()), exact: true };
      const limitMs = Number(runtime?.maxMs) > 0 ? Number(runtime.maxMs) : APP_MAX_MS;
      return { limitMs, remainingMs: limitMs, exact: false };
    },
    size: () => programs.size,
  };
}

/**
 * The time budget of one run.
 * @param {{ownMs: number, window: null | {remainingMs: number}}} want - the tool's own limit and the program's time, if any.
 * @returns {{ms: number, shortened: boolean, tooShort: boolean}} ms: the run's budget; shortened: cut to fit a
 *   program; tooShort: so little is left that the run should not start.
 */
export function timeBudget({ ownMs, window }) {
  const own = Math.max(1, Number(ownMs) || 1);
  if (!window) return { ms: own, shortened: false, tooShort: false };
  const room = Math.max(0, Number(window.remainingMs) - SAFETY_MS);
  if (room >= own) return { ms: own, shortened: false, tooShort: false };
  return { ms: room, shortened: true, tooShort: room < MIN_RUN_MS };
}

/**
 * A duration in plain words.
 * @param {number} ms - milliseconds.
 * @returns {string} e.g. "45 seconds", "2 minutes", "about 3.5 minutes".
 */
export function plainDuration(ms) {
  const s = Math.max(0, Math.round(Number(ms) / 1000));
  if (s === 1) return '1 second';
  if (s < 90) return `${s} seconds`;
  const minutes = Math.round((s / 60) * 2) / 2;
  return Number.isInteger(minutes) ? `${minutes} minutes` : `about ${minutes} minutes`;
}

/** What to do for a full run: the same words for every tool. */
const fullRun = (tool) =>
  `For a full run, switch this thread to the Standard preset, or call ${tool} alone in a new program with timeoutMs set higher (600000, which is 10 minutes, at most).`;

/**
 * The note handed back when a run was shortened because of PTC's program limit.
 * @param {object} what - what happened.
 * @param {string} what.tool - the tool's name.
 * @param {number} what.limitMs - the program's time limit.
 * @param {number} what.budgetMs - the time the run had.
 * @param {number} [what.finished] - parts that finished.
 * @param {number} [what.total] - all parts.
 * @param {string} [what.unit] - what the count says, after "N of M" ("members answered", "steps finished").
 * @param {boolean} [what.tooShort] - the run did not start at all.
 * @param {number} [what.leftMs] - with tooShort: the program time that was left.
 * @returns {string} plain text.
 */
export function shortenedNote({ tool, limitMs, budgetMs, finished, total, unit = 'parts finished', tooShort = false, leftMs }) {
  if (tooShort) {
    return `Not started: ${tool} was called inside a program (PTC), and only ${plainDuration(Number.isFinite(leftMs) ? leftMs : budgetMs + SAFETY_MS)} ${Math.round(Number(leftMs) / 1000) === 1 ? 'was' : 'were'} left of the program's time limit, too little for a useful run. Nothing was spent. ${fullRun(tool)}`;
  }
  const count = Number.isFinite(finished) && Number.isFinite(total) ? ` ${finished} of ${total} ${unit}.` : '';
  return (
    `Shortened to fit PTC: ${tool} ran inside a program, and PTC stops a program when its time limit runs out ` +
    `(${plainDuration(limitMs)} for this program; 10 minutes at most). So it had ${plainDuration(budgetMs)} and stopped early.${count} ` +
    `Everything found so far is below. ${fullRun(tool)}`
  );
}
