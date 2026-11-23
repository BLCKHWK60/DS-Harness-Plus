/**
 * The helper pool of a Mission (stage D, 20 November 2026): the lanes at work in one conversation and the words the
 * conductor (the conversation's own model) is told about them. The runner owns the pool; this file holds what can be
 * tested without the app.
 *
 * A pool (one per conversation, in memory):
 *   gen       bumped by Pause, a hold, Stop, a pause outside Mission, End, a continue and a restart: a lane of an older
 *             gen only releases what it held when it settles
 *   lanes     id -> lane; with one helper at once a settled lane stays until mission_step collects its text (stage C)
 *   closing   lanes that were stopped and have not settled yet (a continue, and a new lane for the same item, wait)
 *   told      texts for the conductor not given yet (newest last)
 *   waiters   mission_step calls waiting for news
 *   stopping  set at once when the Budget guard refused a step (the hold follows a tick later)
 * A lane: id 'L<n>', kind (plan, questions, work, recheck, checks, review, hunt, finish, repair), item, gen, epoch, stopper,
 * startedAt, what, asides (stage A's set-aside questions, kind 'mission' runs), blocked (files refused to it),
 * parkedApprovals, touched (files it changed), itemGrants, cutByTime, done, text, promise.
 */

/** Lane kinds that are steps of the run (the question pass is not one). */
export const STEP_KINDS = new Set(['plan', 'work', 'recheck', 'checks', 'review', 'hunt', 'finish', 'repair']);
/** Lane kinds that run alone: nothing else works while they do (and they wait until the pool has drained). */
/** Stage E: the repair helper runs alone too (it may change the Mission's settings and its files). */
export const ALONE_KINDS = new Set(['checks', 'review', 'hunt', 'recheck', 'repair']);
/** The most of the conductor's texts given in one answer, and the lines each keeps when there are several. */
export const TOLD_MAX = 6000;
export const TOLD_LINES = 12;

/** @returns {object} a new, empty pool. */
export function newPool() {
  return { gen: 0, n: 0, lanes: new Map(), closing: new Set(), told: [], waiters: new Set(), stopping: false, agent: undefined, lapStart: undefined, retry: new Map(), pumping: false, needsAt: {}, built: false };
}

/** @returns {object[]} the lanes still at work (not settled). */
export const liveLanes = (pool) => [...(pool?.lanes?.values() ?? [])].filter((lane) => !lane.done);
/** @returns {object[]} the live lanes that are steps (not the question pass). */
export const stepLanes = (pool) => liveLanes(pool).filter((lane) => STEP_KINDS.has(lane.kind));
/** @returns {object[]} the live work lanes. */
export const workLanes = (pool) => liveLanes(pool).filter((lane) => lane.kind === 'work');

/**
 * The texts waiting for the conductor, joined: newest last, each cut to TOLD_LINES lines when there are several, at most
 * TOLD_MAX characters (the oldest are dropped first).
 * @param {string[]} told - the texts.
 * @returns {string}
 */
export function joinTold(told) {
  const list = (told ?? []).map((text) => String(text ?? '').trim()).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0].length > TOLD_MAX ? `${list[0].slice(0, TOLD_MAX)}\n… (cut)` : list[0];
  // A final report is never cut: it is given in full.
  const parts = list.map((text) => (/final report/i.test(text.split('\n')[0] ?? '') || /This is the final report/.test(text) ? text : text.split('\n').slice(0, TOLD_LINES).join('\n')));
  while (parts.length > 1 && parts.join('\n\n').length > TOLD_MAX && !/This is the final report/.test(parts[0])) parts.shift();
  return parts.join('\n\n');
}

/** "items 2, 3" / "item 2". */
const itemsWords = (ids) => (ids.length === 1 ? `item ${ids[0]}` : `items ${ids.join(', ')}`);

/**
 * The conductor's line about the pool: what is being worked on now and what waits for the user.
 * @param {{working: string[], size: number, waiting: string[], other?: string}} now - item ids at work, the pool's size, items parked, and what a lane that has no item does.
 * @returns {string}
 */
export function poolLine({ working = [], size = 1, waiting = [], other = '' } = {}) {
  const busy = working.length > 0 ? `Now: ${itemsWords(working)} ${working.length === 1 ? 'is' : 'are'} being worked on (${working.length} of ${size} helpers).` : other ? `Now: ${other}.` : '';
  const wait = waiting.length === 1 ? ` Item ${waiting[0]} waits for the user.` : waiting.length > 1 ? ` Items ${waiting.join(', ')} wait for the user.` : '';
  return `${busy}${wait}`.trim();
}

/** What mission_step says when nothing settled while it waited. */
export function stillWorking({ working = [], minutes = 1, other = '' } = {}) {
  const what = working.length > 0 ? `${itemsWords(working)} (${working.length} helper${working.length === 1 ? '' : 's'})` : other || 'the next step';
  return `Still working: ${what}, ${minutes} minute${minutes === 1 ? '' : 's'} so far. This is normal. Call mission_step again in the next round; it waits for the next result. Do nothing else.`;
}

/** @returns {string} hh:mm of a time, for the conductor and the strip. */
export const clockOf = (at) => {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

/**
 * What mission_step says while only the user's answers can move the Mission on. Quiet (point 17): the app's goal is
 * paused while it waits, so the conductor is told not to call again; otherwise (the pause could not be made) stage D's way.
 * Its time limit never runs while it waits (point 17).
 * @param {{questions: number, approvals: number, until: number, quiet?: boolean}} wait - what waits, and when the Mission ends by itself (0: it waits until answered).
 * @returns {string}
 */
export function waitingText({ questions = 0, approvals = 0, until = 0, quiet = false } = {}) {
  const what = `${questions} question${questions === 1 ? '' : 's'}, ${approvals} approval${approvals === 1 ? '' : 's'}`;
  // Point 17: a quiet wait (the app's goal paused by Mission): no more rounds until the user answers.
  if (quiet) return `The Mission now waits for the user: only their answers can move it on (${what}), in the card above the chat box. ${until > 0 ? `With no answer it ends at ${clockOf(until)} with its report.` : 'It waits until they answer.'} Its time limit does not run while it waits. Tell the user this in one line and do not call mission_step again: the Mission carries on by itself when they answer.`;
  const ends = until > 0 ? `With no answer it ends at ${clockOf(until)} and keeps them for later.` : 'It waits until they answer.';
  return `Waiting for the user: only their answers can move the Mission on now (${what}), in the card above the chat box. ${ends} Tell the user this in one line, then call mission_step again in the next round. Its time limit does not run while it waits.`;
}
