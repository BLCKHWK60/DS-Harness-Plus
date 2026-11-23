/**
 * Depth (build prompt, part 12): what Quick, Standard, Thorough and a Long run mean for each of the four
 * jobs. Settled by the owner's answers: a Long run never stops to wait; questions only in its first minute
 * (built: after that minute the question tool is refused and the model writes the question down with its
 * recommendation instead); everything else at the end, as one list.
 */

export const DEPTHS = {
  quick: { label: 'Quick', build: 'Follow the recipe\'s [must] steps; run the load and fit checks; no trial install.', change: 'Show the change and what it could break; prepare nothing.', keep: 'Compare the map with the one before; run nothing.', improve: 'The three findings that matter most.', checks: { trial: false, secondRead: false } },
  standard: { label: 'Standard', build: 'The recipe, tests first, all four checks.', change: 'Back up, change it in a copy, run that plugin\'s tests.', keep: 'Compare the map and check that every plugin loads.', improve: 'Findings per plugin, with their evidence.', checks: { trial: true, secondRead: false } },
  thorough: { label: 'Thorough', build: 'As Standard, and a second read of the plan and of the result by a checker that only reads (with Ultra Code, the work loop\'s checker).', change: 'As Standard, and the tests of every plugin it touches.', keep: 'As Standard, and every plugin\'s tests where they are.', improve: 'As Standard, and the change drafted in the trial copy.', checks: { trial: true, secondRead: true } },
  long: { label: 'Mission', build: 'Repeat until every check passes or a limit is reached.', change: 'Same, in the trial copy only.', keep: 'Same, for the whole setup.', improve: 'Same, and keep improving until a limit.', checks: { trial: true, secondRead: true } },
};

/** The first minute of a Long run, the only time it may ask. */
export const QUESTION_WINDOW_MS = 60_000;

export const LONG_RUN_NO_QUESTIONS = 'This is a Mission past its first minute: it never stops to wait for the user. Write the question down with your recommendation, go on with the recommendation, and put both on the list for the end (creator_note).';

/**
 * Whether a question may be asked now.
 * @param {{longSince?: number, now?: number}} input - when the Long run started (ms), or undefined when none is on.
 * @returns {string} why not, or ''.
 */
export function questionRefusal({ longSince, now = Date.now() }) {
  if (!longSince) return '';
  return now - longSince > QUESTION_WINDOW_MS ? LONG_RUN_NO_QUESTIONS : '';
}

/** @returns {string} the Depth's meaning for the model, one line per job. */
export function depthText(depth, { long = false } = {}) {
  const entry = long ? DEPTHS.long : DEPTHS[depth] ?? DEPTHS.standard;
  return [`Depth: ${entry.label}.`, `- Build: ${entry.build}`, `- Change: ${entry.change}`, `- Keep (after an update): ${entry.keep}`, `- Improve: ${entry.improve}`, ...(long ? ['- A Mission never waits for the user. Ask everything you can foresee in your first message (the first minute); after that, write questions down with your recommendation and go on. It works in the trial copy; every change for the real setup and every open question go on one list for the end.'] : [])].join('\n');
}
