/**
 * A mission run as plain data and pure steps, so the order of work can be tested without the app.
 *
 * The run is a fixed sequence that the add-on drives, one step per call:
 *   plan      a planner turns the goal into a checklist; each item says when it is done and,
 *             where possible, a command that proves it
 *   work      each item goes to a worker (stage D: several at once, Helpers at once); afterwards the item's command
 *             is run for real
 *   checks    the run's overall commands (tests, build) are run for real
 *   review    a reviewer reads the changes against the goal and may reopen or add items
 *   finish    the report
 * A model never decides that something passed: commands decide, and the reviewer decides only
 * what no command covers.
 */

import { shownAccess } from './guard.js';
import { loopLine } from './loop.js';
import { DECIDED_FOR_AUTO, OPEN_FOR_WAIT } from './prompts.js';

export const LIMITS = { maxItems: 12, maxTries: 3, maxReviews: 2, maxSteps: 60, waitMinutes: 3 };
export const LIMIT_RANGE = { maxItems: [1, 30], maxTries: [1, 8], maxReviews: [0, 5], maxSteps: [5, 300], waitMinutes: [0, 60] };
export const ROLES = ['plan', 'implement', 'review'];

/**
 * A Mission (stage B, 19 November 2026: Mission and Long run are one thing; inside, every new Mission is
 * `kind: 'long'`, and kind 'mission' stays only so runs saved before still load): an optional clock, laps as
 * the limit, extra laps that hunt for weak spots after the list is done, a gate that undoes a lap that breaks a
 * check that passed, and notes the add-on keeps between laps. A lap is: work on the open items, the overall
 * commands, then a review.
 *   minutes 0  no time limit: it runs until its checklist is done (or another limit);
 *   laps 0     no lap limit (LAPS_AUTO laps count for the steps and reviews it may use);
 *   steps 0    the steps are worked out from the laps.
 */
export const LONG = { minutes: 120, laps: 10, fullTime: false, steps: 0 };
export const LONG_RANGE = { minutes: [10, 720], laps: [1, 50], steps: [5, 2000] };
/** The laps a Mission with no lap limit is sized for (its steps, reviews and items). */
export const LAPS_AUTO = 50;
/** Stops of one item to wait for the user before the next one counts as a try, and file waits before one does (stage D). */
export const PARKS_MAX = 2;
export const FILE_WAITS_MAX = 6;
/** Helpers at once (stage D): the most, and the default of Settings → Mission (longHelpers). */
export const HELPERS_MAX = 8;
export const HELPERS_DEFAULT = 4;
/** @returns {number} a Mission's helpers at once: 1 for runs from before stage D and for /mission runs of old. */
export const helpersOf = (run) => (isLong(run) ? Math.min(HELPERS_MAX, Math.max(1, Math.round(Number(run.long?.helpers) || 1))) : 1);
/** @returns {number} a helpers-at-once value read from a setting or a card: 1 to 8, the default when it is not a number. */
export function readHelpers(value, fallback = HELPERS_DEFAULT) {
  const number = Math.round(Number(value));
  if (value === null || value === '' || typeof value === 'boolean' || !Number.isFinite(number)) return fallback;
  return Math.min(HELPERS_MAX, Math.max(1, number));
}
/**
 * When it needs you (the owner's point 17, 20 November 2026), fixed for a Mission when it starts:
 *   decide  Full auto: it never asks; helpers decide questions themselves and note it; it never gives itself permission
 *           (what needs the user's yes is not asked and not done, and the report lists it); it never waits
 *   ask     Ask, keep working: stage D as built (questions with a safe default finish on it; only what truly needs the
 *           user waits; other work goes on)
 *   wait    Ask and wait: every question and every request for the user's yes waits; other items go on
 * The id is 'decide', never 'auto' (that is Auto under Mission access).
 */
export const NEEDS = Object.freeze(['decide', 'ask', 'wait']);
export const NEEDS_LABELS = Object.freeze({ decide: 'Full auto', ask: 'Ask, keep working', wait: 'Ask and wait' });
/** Wait for me: minutes 1 to 720; 0 waits until the user answers. */
export const WAIT_RANGE = Object.freeze([1, 720]);
/** Stops of one item to wait for the user before the next one counts as a try, with Ask and wait (every question waits). */
export const PARKS_MAX_WAIT = 6;
/** @returns {'decide' | 'ask' | 'wait'} a When-it-needs-you value read from a setting or a card; anything else is the fallback. */
export function readNeeds(value, fallback = 'ask') {
  if (NEEDS.includes(value)) return value;
  return NEEDS.includes(fallback) ? fallback : 'ask';
}
/** @returns {number | null} a Wait-for-me value: null when not given (or not a number), 0 (until you answer) for 0 or less, else 1 to 720 minutes. */
export function readWaitChoice(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number <= 0) return 0;
  return Math.min(WAIT_RANGE[1], Math.max(WAIT_RANGE[0], Math.round(number)));
}
/**
 * Wait for me with Ask, keep working, from Settings: the saved value (0 or more), else taken from stage D's waitMinutes
 * (its old default 3, or nothing, becomes 30; 0 stays until you answer; any other value is kept).
 * @param {unknown} saved - longWaitAsk (-1: not set).
 * @param {unknown} legacy - waitMinutes.
 * @returns {number} minutes; 0 waits until you answer.
 */
export function waitAskOf(saved, legacy) {
  const own = Number(saved);
  if (saved !== null && saved !== '' && typeof saved !== 'boolean' && Number.isFinite(own) && own >= 0) return readWaitChoice(own) ?? 30;
  const old = Number(legacy);
  if (legacy === null || legacy === undefined || legacy === '' || typeof legacy === 'boolean' || !Number.isFinite(old) || Math.round(old) === 3) return 30;
  if (old <= 0) return 0;
  return readWaitChoice(old) ?? 30;
}
/** @returns {'decide' | 'ask' | 'wait'} a run's When it needs you: Ask, keep working for runs from before and for kind 'mission'. */
export const needsOf = (run) => (isLong(run) && NEEDS.includes(run.long?.needs) ? run.long.needs : 'ask');
/**
 * A run's Wait for me in minutes (0: until you answer): its own, else read from the waitMinutes it was started with
 * (stage D runs; its old default 3 becomes 30).
 */
export function waitOf(run) {
  const own = Number(run?.long?.waitFor);
  if (run?.long && run.long.waitFor !== null && run.long.waitFor !== undefined && Number.isFinite(own) && own >= 0) return Math.round(own);
  const legacy = Number(run?.limits?.waitMinutes);
  if (!Number.isFinite(legacy) || Math.round(legacy) === 3) return 30;
  if (legacy <= 0) return 0;
  return Math.round(legacy);
}
/** @returns {number} how long a run waits for the user when nothing else can move, in ms (Infinity: until you answer; 0 for Full auto, which never waits). */
export function waitMsOf(run) {
  if (needsOf(run) === 'decide') return 0;
  const minutes = waitOf(run);
  return minutes > 0 ? minutes * 60000 : Infinity;
}
/** @returns {number} the most stops to wait for the user an item may make before the next counts as a try. */
export const parksMaxOf = (run) => (needsOf(run) === 'wait' ? PARKS_MAX_WAIT : PARKS_MAX);
/**
 * The clock a Mission reads: now, but not past a pause or the start of a wait for the user (their time does not count;
 * the deadline moves on by it when they end).
 */
export function clockAt(run, at = Date.now()) {
  let clock = at;
  if (Number(run?.pausedAt) > 0) clock = Math.min(clock, Number(run.pausedAt));
  if (Number(run?.long?.waitingSince) > 0) clock = Math.min(clock, Number(run.long.waitingSince));
  // Stage E: a wait for the model server stops it too (its span is added to the deadline when it ends).
  if (Number(run?.long?.down?.since) > 0) clock = Math.min(clock, Number(run.long.down.since));
  return clock;
}
/**
 * A wait for the user is over (an answer, Pause, End, or Wait for me ran out): its time is added to the deadline and to
 * the waited total, so it never counts as working time.
 * @param {object} run - the run; changed in place.
 * @param {number} [at] - now.
 * @returns {number} the span waited, in ms.
 */
export function closeWait(run, at = Date.now()) {
  const L = run?.long;
  if (!L) return 0;
  const since = Number(L.waitingSince) || 0;
  let span = 0;
  if (since > 0) {
    span = Math.max(0, at - since);
    if (span > 0) {
      if (Number(L.deadline) > 0) L.deadline += span;
      L.waitedMs = (Number(L.waitedMs) || 0) + span;
    }
  }
  delete L.waitingSince;
  delete L.quietGoal;
  return span;
}

/**
 * Stage E: a wait for the model server is over (a try, a pause, the end): its time is added to the deadline and to the
 * time it waited for the server, so it never counts as working time.
 * @param {object} run - the run; changed in place.
 * @param {number} [at] - now.
 * @returns {number} the span waited, in ms.
 */
export function closeDown(run, at = Date.now()) {
  const L = run?.long;
  if (!L?.down) return 0;
  const span = Math.max(0, at - (Number(L.down.since) || at));
  if (span > 0) {
    if (Number(L.deadline) > 0) L.deadline += span;
    L.downMs = (Number(L.downMs) || 0) + span;
  }
  // Review of stage E: when the wait ended (its time is in the deadline now); a restart pauses the run from no earlier.
  L.downClosedAt = Math.max(Number(L.downClosedAt) || 0, at);
  delete L.down;
  return span;
}

/**
 * Review of stage E: from when a run that the app found on after a restart counts as paused: its last step, the start
 * of a wait for its model server that was still on, or the end of one (that time already went to the deadline).
 * @returns {number} the time (0 when none is known).
 */
export function restartPauseFrom(run) {
  return Math.max(Number(run?.lastStepAt) || 0, Number(run?.long?.down?.since) || 0, Number(run?.long?.downClosedAt) || 0);
}

/** Laps in a row that find nothing before a Long run stops early (decision 2). */
export const EMPTY_LAPS = 2;
/** The longest the run notes may be, so a small model is not swamped. */
export const NOTES_MAX = 2000;
/** The longest one note of yours to a Mission under way may be, and how many of them it keeps. */
export const ASK_MAX = 1000;
export const ASKS_KEPT = 10;
/** The longest the conversation before a Mission may be (its brief), as kept with the run; the newest part is kept. */
export const CONTEXT_MAX = 16000;
/** The longest the user's notes and answers may be, as given to the helpers. */
export const USER_NOTES_MAX = 3000;
/** The last part of the brief a worker gets, when the Mission started from the conversation. */
export const BRIEF_MAX = 2000;

/**
 * @returns {{minutes: number, laps: number, fullTime: boolean, steps: number}} a Mission's own limits, checked.
 * 0 (or less) means no limit for minutes and laps, and automatic for steps; a value under a range's low end is
 * raised to it (minutes 1..9 become 10).
 */
export function readLong(given = {}) {
  const out = {};
  for (const key of ['minutes', 'laps', 'steps']) {
    const [low, high] = LONG_RANGE[key];
    const number = Number(given?.[key]);
    if (!Number.isFinite(number) || given?.[key] === null || given?.[key] === '' || typeof given?.[key] === 'boolean') out[key] = LONG[key];
    else if (Math.round(number) <= 0) out[key] = 0;
    else out[key] = Math.min(high, Math.max(low, Math.round(number)));
  }
  out.fullTime = given?.fullTime === true && out.minutes > 0;
  return out;
}

/** @returns {boolean} whether this is a Long run. */
export const isLong = (run) => run?.kind === 'long';
const TEXT_MAX = 600;
const OUTPUT_MAX = 3000;

const clip = (value, max = TEXT_MAX) => String(value ?? '').replace(/\r/g, '').trim().slice(0, max);
/** The newest part of a text (its end), at most `max` characters. */
const clipNewest = (value, max) => {
  const text = String(value ?? '').replace(/\r/g, '').trim();
  return text.length > max ? `…${text.slice(-(max - 1))}` : text;
};
const line = (value, max = 160) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const tail = (value, max = OUTPUT_MAX) => {
  const text = String(value ?? '').replace(/\r/g, '').trim();
  return text.length > max ? `…${text.slice(-max)}` : text;
};

/**
 * Limits as whole numbers inside their ranges.
 * @param {object} [given] - numbers from the settings.
 * @returns {typeof LIMITS} the limits.
 */
export function readLimits(given = {}) {
  const out = {};
  for (const [key, fallback] of Object.entries(LIMITS)) {
    const [low, high] = LIMIT_RANGE[key];
    const number = Number(given?.[key]);
    out[key] = Number.isFinite(number) ? Math.min(high, Math.max(low, Math.round(number))) : fallback;
  }
  return out;
}

/** Access levels the app knows. */
const LEVELS = ['read-only', 'workspace-write', 'danger-full-access'];

/**
 * A Long run's tools in its tab, as chosen on its card.
 * @param {unknown} tools - `{files, web}`.
 * @returns {{files: boolean, web: boolean} | undefined} the switches; undefined when not given.
 */
export function readTools(tools) {
  if (!tools || typeof tools !== 'object') return undefined;
  return { files: tools.files === true, web: tools.web === true };
}

/**
 * What a Long run in a Read Only tab puts back when it ends: the access level and preset from before,
 * and whether a Mission mode was on before (then it stays on).
 * @param {unknown} restore - `{sandbox, preset, modeWasOn}`.
 * @returns {{sandbox: string, preset: string, modeWasOn: boolean} | undefined}
 */
export function readRestore(restore) {
  if (!restore || typeof restore !== 'object' || !LEVELS.includes(restore.sandbox)) return undefined;
  return { sandbox: restore.sandbox, preset: typeof restore.preset === 'string' ? restore.preset.slice(0, 80) : '', modeWasOn: restore.modeWasOn === true };
}

/**
 * @param {object} start - how the run begins.
 * @returns {object} a new run.
 */
export function newRun({ id, goal, mode, root, limits, checkpoint, at = Date.now(), kind = 'mission', long }) {
  const run = {
    id, goal: clip(goal, 4000), mode, root, limits: readLimits(limits), checkpoint: checkpoint ?? 0,
    phase: 'plan', status: 'running', summary: '', items: [], checks: [], checkResults: [], reviews: 0, reviewNote: '', steps: 0, startedAt: at, endedAt: 0, stopReason: '',
    // Questions for the user, each with the default the run goes on with (shown by later stages; kept in the report).
    questions: [],
  };
  if (kind !== 'long') return run;
  const own = readLong(long);
  run.kind = 'long';
  // The card's other choices go with the run (keep the Mac awake, also on battery, try again, effort by role).
  const cap = Math.floor(Number(long?.tokenCap));
  const extra = { keepAwake: long?.keepAwake === true, battery: long?.battery === true, retry: long?.retry === true, effort: long?.effort === true, tokenCap: Number.isFinite(cap) && cap > 0 ? Math.min(cap, 1e10) : 0 };
  // The run's tools in its own tab (Files and commands, Web), and what to put back when it ends in a Read Only tab.
  const tools = readTools(long?.tools);
  if (tools) extra.tools = tools;
  const restore = readRestore(long?.restore);
  if (restore) extra.restore = restore;
  // A Recon conversation's run: no commands, one model, nothing kept outside its folder.
  if (long?.isolated === true) extra.isolated = true;
  // A Recon run whose checks are switched on (Settings → Recon): they run without the internet.
  if (long?.isolated === true && long?.offlineChecks === true) extra.offlineChecks = true;
  // A Bench conversation's run (its own add-on decides): checks on or off (Settings → Bench), and
  // device ports closed to them; its workers have no commands.
  // Item 4A, stage 6a (owner's answer): `home: true` only when Mission read the thread as the Devices mode in the
  // Devices space; its checks keep the network as before 6a. Missing (a guest, or not sure): the Devices fence.
  if (long?.bench && typeof long.bench === 'object') extra.bench = { checks: long.bench.checks !== false, closedPorts: long.bench.closedPorts !== false, ...(long.bench.home === true ? { home: true } : {}) };
  // A Creator Plus conversation's run (its own add-on decides): checks in the offline fence, no keys in
  // their environment, workers without commands.
  if (long?.creator && typeof long.creator === 'object') extra.creator = { cleanEnv: long.creator.cleanEnv !== false };
  // Its brief: what was said in the conversation before it (for the planner and reviewer; the newest part kept).
  const context = clipNewest(long?.context, CONTEXT_MAX);
  if (context) extra.context = context;
  // Started from the conversation (Start Mission with little or nothing typed): its workers get the end of the brief too.
  if (long?.fromThread === true && context) extra.fromThread = true;
  // Stage D: how many helpers work at once (only when given: runs from before, and /mission runs of old, run with one).
  const helpers = Math.round(Number(long?.helpers));
  if (Number.isFinite(helpers) && helpers >= 1) {
    extra.helpers = Math.min(HELPERS_MAX, helpers);
    const asked = Math.round(Number(long?.helpersAsked));
    extra.helpersAsked = Number.isFinite(asked) && asked >= 1 ? Math.min(HELPERS_MAX, asked) : extra.helpers;
    extra.helpersWhy = ['server', 'no-checkpoints'].includes(long?.helpersWhy) ? long.helpersWhy : '';
  }
  // Stage E: what the assistant may do while it is paused, and Carry on by itself after a restart (only when given: a
  // Mission from before has neither, and never carries on by itself).
  if (long?.assistant === 'look' || long?.assistant === 'talk') extra.assistant = long.assistant;
  if (typeof long?.carryOn === 'boolean') extra.carryOn = long.carryOn;
  // Point 17: when it needs you, and how long it waits for you (fixed for the run; a continue keeps them).
  extra.needs = readNeeds(long?.needs);
  const waitFor = Number(long?.waitFor);
  if (long?.waitFor !== null && long?.waitFor !== undefined && long?.waitFor !== '' && typeof long?.waitFor !== 'boolean' && Number.isFinite(waitFor)) extra.waitFor = extra.needs === 'decide' ? 0 : Math.min(WAIT_RANGE[1], Math.max(0, Math.round(waitFor)));
  else if (extra.needs === 'decide') extra.waitFor = 0;
  // No time limit: deadline 0, and "use the full time" means nothing.
  // firstMinutes (stage C): the time limit it started with, kept for the report and the extra-time rule after the end.
  run.long = { ...own, ...extra, firstMinutes: own.minutes, deadline: own.minutes > 0 ? at + own.minutes * 60000 : 0, lap: 0, emptyLaps: 0, lapEnded: false, finishLap: false, checksPassedOnce: false, passing: [], lapPoint: 0, notes: '', undone: [], hunting: false, asks: [], pausedMs: 0, stepMs: [] };
  // Laps are the limit (decision 1): steps and reviews are worked out from them, past /mission's 300 if need be.
  // No lap limit: sized for LAPS_AUTO laps. A steps limit set by the user wins.
  const laps = own.laps || LAPS_AUTO;
  run.limits = { ...run.limits, maxReviews: laps + 1, maxSteps: own.steps || 1 + laps * (run.limits.maxItems * 2 + 2), itemCap: run.limits.maxItems * 2 + laps * 4 };
  return run;
}

const openItems = (run) => run.items.filter((item) => item.status === 'open');

/**
 * What the run does next.
 * @param {object} run - the run.
 * @returns {{kind: 'plan' | 'work' | 'checks' | 'review' | 'finish' | 'done', item?: object}} the step.
 */
export function nextStep(run, now = Date.now(), pool = undefined) {
  if (run.status !== 'running') return { kind: 'done' };
  if (isLong(run)) return pool ? nextPoolStep(run, now, pool) : nextLongStep(run, now);
  if (run.steps >= run.limits.maxSteps) return { kind: 'finish' };
  if (run.phase === 'plan') return { kind: 'plan' };
  const item = openItems(run)[0];
  if (item) return { kind: 'work', item };
  if (run.phase === 'work') return { kind: run.checks.length > 0 ? 'checks' : run.limits.maxReviews > 0 ? 'review' : 'finish' };
  if (run.phase === 'checks') return { kind: run.reviews < run.limits.maxReviews ? 'review' : 'finish' };
  return { kind: 'finish' };
}

/**
 * A Long run's next step. The clock and the lap limit are read only between steps, so a run can go
 * over its time by the step under way (said on the card). Every lap ends with a review; once nothing is
 * open, a review that hunts for weak spots starts the next lap.
 */
function nextLongStep(run, now) {
  const L = run.long;
  // Stage E: while it waits for its model server nothing starts (the sweep tries the server).
  if (L.down) return { kind: 'drain' };
  if (run.steps >= run.limits.maxSteps) return { kind: 'finish' };
  // Point 17: Wait for me ran out; the round that follows gives the report.
  if (L.waitOver) return { kind: 'finish', why: 'waited' };
  // A pause or a wait for the user stops the clock.
  const clock = clockAt(run, now);
  // No time limit (deadline 0): the clock never ends it.
  if (L.deadline > 0) {
    if (clock >= L.deadline) return { kind: 'finish', why: 'time' };
    // No new step when less time is left than a step of this run usually takes (once three are measured):
    // the run finishes with its report instead of running far past its time.
    const typical = medianStep(run);
    if (typical > 0 && L.deadline - clock < typical) return { kind: 'finish', why: 'short' };
  }
  // An optional token allowance (step 58), off unless set on the card: the run ends with its report.
  if (L.tokenCap > 0 && (run.tokens ?? 0) >= L.tokenCap) return { kind: 'finish', why: 'allowance' };
  // Stage E: a repair asked for comes first (before the plan, so a failing planner can be repaired).
  if (L.repair?.pending) return { kind: 'repair' };
  if (run.phase === 'plan') return { kind: 'plan' };
  // Between laps: Finish this lap and the lap limit end the run, also with items reopened by the review.
  if (L.lapEnded) {
    // A Mission continued after its end (stage C) does what your answers called for, its checks and a review, then
    // ends: it never hunts for extra laps. Items its review reopened go on within its time and lap limit.
    if (L.continueLap && openItems(run).length === 0) return { kind: 'finish', why: 'continued' };
    if (L.finishLap) return { kind: 'finish', why: 'asked' };
    if (L.laps > 0 && L.lap >= L.laps) return { kind: 'finish', why: 'laps' };
  }
  const item = openItems(run)[0];
  if (item) return { kind: 'work', item };
  if (run.phase === 'work') return { kind: run.checks.length > 0 ? 'checks' : 'review' };
  if (run.phase === 'checks') return { kind: 'review' };
  // A lap has ended with nothing open: hunt for weak spots, unless laps keep finding nothing.
  if (!L.fullTime && L.emptyLaps >= EMPTY_LAPS) return { kind: 'finish', why: 'empty' };
  return { kind: 'review', hunt: true };
}

/**
 * How an open item stands for the helper pool (stage D): 'ready' (a helper may take it now), 'working' (a helper has
 * it), 'later' (it waits for something that moves by itself: an earlier item, its retry time, a stopped helper that is
 * still closing, a file a working helper holds), 'parked' (it waits, directly or through what it needs, for the user),
 * 'recheck' (its check is run again once the pool drains), 'after-recheck' (it needs an item that waits for its recheck)
 * or 'done' (not open).
 * @param {object} run - the run.
 * @param {object} item - the item.
 * @param {{busy?: Iterable<string>, hold?: (item: object) => '' | 'later' | 'parked'}} pool - what the runner knows.
 * @param {Map<string, string>} [seen] - classified so far (loops in `after` count as 'later').
 * @returns {'ready' | 'working' | 'later' | 'parked' | 'recheck' | 'after-recheck' | 'done'}
 */
export function itemState(run, item, pool = {}, seen = new Map()) {
  if (!item) return 'done';
  if (seen.has(item.id)) return seen.get(item.id) || 'later';
  const busy = pool.busy instanceof Set ? pool.busy : new Set(pool.busy ?? []);
  if (busy.has(String(item.id))) return 'working';
  if (item.status === 'parked') return 'parked';
  if (item.status !== 'open') return 'done';
  if (item.recheck) return 'recheck';
  seen.set(item.id, '');
  let state = 'ready';
  const held = typeof pool.hold === 'function' ? pool.hold(item) : '';
  if (held === 'later') state = 'later';
  else if (held === 'parked') state = 'parked';
  for (const id of Array.isArray(item.after) ? item.after : []) {
    const before = run.items.find((entry) => entry.id === String(id));
    // A stuck item counts as finished; one waiting for the user holds this one up too.
    const was = itemState(run, before, pool, seen);
    if (was === 'ready' || was === 'working' || was === 'later') state = 'later';
    // Waiting for a check that is run again once the pool drains: not a reason to keep draining.
    else if (was === 'recheck' || was === 'after-recheck') state = state === 'later' ? 'later' : 'after-recheck';
    else if (was === 'parked' && state === 'ready') state = 'parked';
  }
  seen.set(item.id, state);
  return state;
}

/**
 * The next step of a Mission with its helper pool (stage D, scheduling model C). The same rules as nextLongStep, read
 * with what is in flight: with nothing parked, blocked or in flight it answers exactly as nextLongStep does.
 *   drain     wait: something is in flight (or moves by itself soon); the pump looks again when it settles
 *   wait-you  only the user's answers can move it on (items parked, the lap's checks and review done)
 *   recheck   an item's check that failed while other helpers worked is run again on its own
 * @param {object} run - a running Mission.
 * @param {number} now - now.
 * @param {{busy?: Iterable<string>, inflight?: number, exclusive?: boolean, hold?: Function}} pool - the live lanes.
 * @returns {{kind: string, item?: object, why?: string, hunt?: boolean}}
 */
function nextPoolStep(run, now, pool) {
  const L = run.long;
  const inflight = Math.max(0, Number(pool.inflight) || 0);
  // Stage E: while it waits for its model server nothing starts (the sweep tries the server).
  if (L.down) return { kind: 'drain' };
  const drainOr = (step) => (inflight > 0 ? { kind: 'drain', ...(step.why ? { why: step.why } : {}) } : step);
  if (run.steps + inflight >= run.limits.maxSteps) return drainOr({ kind: 'finish' });
  // Point 17: Wait for me ran out with nothing answered; this round gives the report.
  if (L.waitOver) return drainOr({ kind: 'finish', why: 'waited' });
  // A pause or a wait for the user stops the clock (its time is added to the deadline when it ends).
  const clock = clockAt(run, now);
  if (L.deadline > 0) {
    if (clock >= L.deadline) return drainOr({ kind: 'finish', why: 'time' });
    const typical = medianStep(run);
    if (typical > 0 && L.deadline - clock < typical) return drainOr({ kind: 'finish', why: 'short' });
  }
  if (L.tokenCap > 0 && (run.tokens ?? 0) >= L.tokenCap) return drainOr({ kind: 'finish', why: 'allowance' });
  // Stage E: a repair asked for runs alone, once the helpers at work have settled (before the plan too).
  if (L.repair?.pending) return inflight > 0 ? { kind: 'drain' } : { kind: 'repair' };
  if (run.phase === 'plan') return inflight > 0 ? { kind: 'drain' } : { kind: 'plan' };
  const needs = needsOf(run);
  // Ask and wait: while the first-minute question pass runs and nothing was started yet, nothing starts (its questions
  // may hold items). It works at most 90 seconds.
  if (pool.asking && needs === 'wait' && !run.items.some(tried)) return { kind: 'drain' };
  const seen = new Map();
  const states = run.items.map((item) => [item, itemState(run, item, pool, seen)]);
  // Only the user's answers can move it on (point 17): items wait for them, or (Ask and wait) a question or an approval
  // no item waits for keeps it from ending. Never with Full auto, never with Use the full time.
  const mayWait = !L.fullTime && needs !== 'decide';
  const parkedAny = states.some(([, state]) => state === 'parked');
  const holdsEnd = () => mayWait && (parkedAny || endGate(run).length > 0);
  if (L.lapEnded) {
    if (L.finishLap) return drainOr({ kind: 'finish', why: 'asked' });
    // A continued Mission with only waiting items left, or at its lap limit: it waits for the user (Wait for me), then
    // ends with its report. Nothing waits: it ends.
    if (L.continueLap && openItems(run).length === 0) return holdsEnd() ? drainOr({ kind: 'wait-you' }) : drainOr({ kind: 'finish', why: 'continued' });
    if (L.laps > 0 && L.lap >= L.laps) return holdsEnd() ? drainOr({ kind: 'wait-you' }) : drainOr({ kind: 'finish', why: 'laps' });
  }
  if (pool.exclusive) return { kind: 'drain' };
  // Items taken up again after an answer go first, in the order they were let go; then the plan's order.
  const ready = states.filter(([, state]) => state === 'ready').map(([item]) => item)
    .sort((a, b) => (Number(a.resumeAt) > 0 ? 0 : 1) - (Number(b.resumeAt) > 0 ? 0 : 1) || (Number(a.resumeAt) || 0) - (Number(b.resumeAt) || 0) || run.items.indexOf(a) - run.items.indexOf(b));
  if (ready.length > 0) return { kind: 'work', item: ready[0] };
  if (inflight > 0 || states.some(([, state]) => state === 'later')) return { kind: 'drain' };
  const again = states.find(([, state]) => state === 'recheck');
  if (again) return { kind: 'recheck', item: again[0] };
  if (run.phase === 'work') return { kind: run.checks.length > 0 ? 'checks' : 'review' };
  if (run.phase === 'checks') return { kind: 'review' };
  if (holdsEnd()) return { kind: 'wait-you' };
  // Full auto never waits (nothing of it should wait; said so if something does).
  if (needs === 'decide' && !L.fullTime && parkedAny) return { kind: 'finish', why: 'noWait' };
  if (!L.fullTime && L.emptyLaps >= EMPTY_LAPS) return { kind: 'finish', why: 'empty' };
  return { kind: 'review', hunt: true };
}

/**
 * Ask and wait's end gate (point 17): open questions (not the time question) and open approvals that no item waits for.
 * They keep the Mission from ending until the user answers; the time question never holds anything.
 * @returns {string[]} their ids ([] for the other choices).
 */
export function endGate(run) {
  if (needsOf(run) !== 'wait') return [];
  const waitedFor = new Set((run.items ?? []).filter((item) => item.status === 'parked').flatMap((item) => (item.parkedOn ?? []).map(String)));
  return [
    ...openQuestions(run).filter((question) => !waitedFor.has(String(question.id))).map((question) => String(question.id)),
    ...openApprovals(run).filter((entry) => !(entry.items ?? []).length && !waitedFor.has(String(entry.id))).map((entry) => String(entry.id)),
  ];
}

/** Steps kept for a Long run's typical step time, and how many must be measured before it counts. */
export const STEP_TIMES_KEPT = 20;
export const STEP_TIMES_NEEDED = 3;

/** @returns {number} the median time of a Long run's measured steps, in ms (0 until three are measured). */
export function medianStep(run) {
  const times = Array.isArray(run?.long?.stepMs) ? run.long.stepMs.filter((ms) => Number.isFinite(ms) && ms >= 0) : [];
  if (times.length < STEP_TIMES_NEEDED) return 0;
  const sorted = [...times].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** Record how long a step of a Long run took (the last STEP_TIMES_KEPT are kept). */
export function noteStepTime(run, ms) {
  if (!isLong(run) || !Number.isFinite(ms) || ms < 0) return;
  run.long.stepMs = [...(Array.isArray(run.long.stepMs) ? run.long.stepMs : []), Math.round(ms)].slice(-STEP_TIMES_KEPT);
}

/** The commands that print but never fail: a pipeline that ends in one of them always exits 0. */
const ALWAYS_PASS = new Set(['wc', 'sort', 'head', 'tail', 'tee', 'uniq', 'cut', 'tr', 'nl', 'less', 'more', 'echo', 'cat', 'true']);

/**
 * Whether a check command always passes and so proves nothing: its last command is a pipeline that ends in
 * wc, sort, head, tail, tee, uniq, cut, tr, nl, less, more, echo, cat or true (a pipeline exits as its last
 * command does), or the list ends in `|| true` (or `; true`, `|| :`). What is inside `$( … )` or
 * backticks is left out, so `test $(grep -c x f | wc -l) -ge 1` is a real check.
 * @param {string} command - the check.
 * @returns {boolean} true when it proves nothing.
 */
export function alwaysPasses(command) {
  let text = String(command ?? '');
  for (let i = 0; i < 5 && /\$\([^()]*\)|`[^`]*`/.test(text); i += 1) text = text.replace(/\$\([^()]*\)|`[^`]*`/g, 'X');
  // The last command of the list (after ;, && or ||) decides the exit.
  const parts = text.split(/;|&&|\|\|/);
  const last = parts[parts.length - 1] ?? '';
  if (parts.length > 1 && /^\s*(true|:)\s*$/.test(last)) return true;
  const pipes = last.split('|');
  if (pipes.length < 2) return false;
  const word = (pipes[pipes.length - 1].trim().split(/\s+/)[0] ?? '').split('/').pop();
  return ALWAYS_PASS.has(word);
}

export const addItem = (run, source, by) => {
  const title = line(source?.title, 120);
  if (!title || run.items.length >= (run.limits.itemCap ?? run.limits.maxItems * 2)) return undefined;
  // A check that always passes is no check: the reviewer judges the item instead.
  const given = line(source?.check, 400);
  const check = alwaysPasses(given) ? '' : given;
  const item = { id: String(run.items.length + 1), title, detail: clip(source?.detail), doneWhen: clip(source?.done_when ?? source?.doneWhen, 300), check, status: 'open', tries: 0, by, report: '', evidence: '', note: given && !check ? 'Its check always passed whatever was done, so it was dropped; the reviewer judges this item.' : '' };
  // The planner's estimate of a worker's minutes for it (stage C): only the fit warning reads it, never the clock.
  const estimate = Math.round(Number(source?.minutes));
  if (Number.isFinite(estimate) && estimate > 0) item.minutes = Math.min(120, estimate);
  run.items.push(item);
  return item;
};

/**
 * Keep a question for the user, with the default the run goes on with. Later stages show them as a card;
 * the report always lists the open ones.
 * @param {object} run - the run; changed in place.
 * @param {{text: string, assume?: string, items?: string[], kind?: string, recommend?: number}} question - what is asked.
 * A question you already answered or skipped (the same words: see `sameQuestion`) is never asked again: the earlier
 * one is given back, with the asking item added to it. Skipped earlier, the helper's default counts as the Mission's
 * judgement (when none was chosen yet). Answered earlier, the runner has the item follow your answer (followAnswer).
 * The time question is never matched.
 * @param {number} [at] - now.
 * @returns {object | undefined} the question kept (undefined when empty); the same open one, or the earlier answered
 *   or skipped one (its status is then not 'open').
 */
export function addQuestion(run, { text, assume = '', items = [], kind = '', recommend, from = '', needed, left, extra } = {}, at = Date.now()) {
  if (!Array.isArray(run.questions)) run.questions = [];
  const said = clip(text, 600);
  if (!said) return undefined;
  const earlier = kind === 'time' ? undefined : decidedBefore(run, said);
  if (earlier) {
    if (!Array.isArray(earlier.items)) earlier.items = [];
    for (const id of items) if (!earlier.items.includes(String(id)) && earlier.items.length < 20) earlier.items.push(String(id));
    if (earlier.status === 'skipped' && !earlier.chosen) {
      // You left it to the Mission: the helper's own default is that judgement (an item's worker always has one).
      const chosen = clip(assume, 400) || (items.length > 0 ? 'its own judgement (the helper named no default)' : '');
      if (chosen) {
        earlier.chosen = chosen;
        earlier.chosenBy = items.length > 0 ? String(items[0]) : (QUESTION_FROM.includes(from) ? from : 'plan');
      }
    }
    return earlier;
  }
  // An open question with the same words (only case, spaces and end punctuation differ) takes the asker (stage D).
  const same = run.questions.find((question) => question.status === 'open' && question.kind !== 'time' && kind !== 'time' && sameQuestion(question.text, said));
  if (same) {
    for (const id of items) if (!same.items.includes(String(id))) same.items.push(String(id));
    return same;
  }
  if (run.questions.length >= 40) return undefined;
  const whole = (value) => (Number.isFinite(value) && value > 0 ? Math.round(value) : undefined);
  const numbers = Object.fromEntries(Object.entries({ recommend: whole(recommend), needed: whole(needed), left: Number.isFinite(left) && left >= 0 ? Math.round(left) : undefined, extra: whole(extra) }).filter(([, value]) => value !== undefined));
  const question = { id: `q${run.questions.length + 1}`, text: said, assume: clip(assume, 400), items: items.map(String).slice(0, 20), status: 'open', askedAt: at, ...(kind ? { kind } : {}), ...(QUESTION_FROM.includes(from) ? { from } : {}), ...numbers };
  // Full auto (point 17): nobody is asked. The question is decided at once, on the helper's own default (the time
  // question: keep the limit), noted as decided by the Mission; Finish it lets the user change it after the end.
  if (needsOf(run) === 'decide') {
    question.status = 'skipped';
    question.self = true;
    question.skippedAt = at;
    question.chosen = kind === 'time' ? TIME_ANSWERS.keep : clip(assume, 400) || 'its own judgement (the helper named no default)';
    question.chosenBy = items.length > 0 ? String(items[0]) : (QUESTION_FROM.includes(from) ? from : 'plan');
  }
  run.questions.push(question);
  return question;
}

/**
 * Full auto (review of point 17): the planner's and the reviewer's decisions, which every worker is told to keep to
 * (DECIDED_FOR_AUTO), are noted on the item whose worker was told them, so Finish it can redo exactly those items when
 * you change such a decision. A worker's own decisions are tied to its item already (chosenBy).
 * @param {object} run - the run.
 * @param {object} item - the item a worker starts on; changed in place.
 */
export function noteDecidedSeen(run, item) {
  if (!item || needsOf(run) !== 'decide') return;
  const ids = decidedQuestions(run).filter((question) => question.self === true && ['plan', 'review'].includes(String(question.chosenBy))).map((question) => String(question.id));
  if (ids.length === 0) return;
  item.decidedSeen = [...new Set([...(Array.isArray(item.decidedSeen) ? item.decidedSeen : []), ...ids])].slice(-40);
}

/** @returns {boolean} whether a question was decided without the user: by Full auto, or left to the Mission by them (not the time question). */
export const decidedQuestion = (question) => question?.status === 'skipped' && question.kind !== 'time' && (question.self === true || Boolean(question.chosen));
/** @returns {object[]} a run's questions decided without the user, which Finish it lets them change. */
export const decidedQuestions = (run) => (Array.isArray(run?.questions) ? run.questions : []).filter(decidedQuestion);

/**
 * Ask and wait: the open question a worker's NEEDS ANSWER names by its id ("q3", "q3: …") as listed to it.
 * @returns {object | undefined}
 */
export function openQuestionRef(run, text) {
  const found = /^\s*\(?\s*(q\d{1,3})\b\s*\)?\s*[:.\-–]?/i.exec(String(text ?? ''));
  if (!found) return undefined;
  return openQuestions(run).find((question) => String(question.id).toLowerCase() === found[1].toLowerCase());
}

/** A question's words made comparable: trimmed, spaces collapsed, any case, without punctuation at its end. */
const questionKey = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/[\s.?!:;,…]+$/u, '');

/** @returns {boolean} whether two questions say the same (no fuzzy matching: only case, spaces and end punctuation differ). */
export const sameQuestion = (a, b) => {
  const key = questionKey(a);
  return key !== '' && key === questionKey(b);
};

/**
 * The question with these words that you already answered (also too late) or skipped, newest first; never the time
 * question, never one still open or closed.
 * @returns {object | undefined}
 */
export function decidedBefore(run, text) {
  const list = Array.isArray(run?.questions) ? run.questions : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const question = list[index];
    if (question?.kind === 'time' || (question?.status !== 'answered' && question?.status !== 'skipped')) continue;
    if (sameQuestion(question.text, text)) return question;
  }
  return undefined;
}

/** A note made a whole sentence (a full stop added when it has none), with a space after it; '' for none. */
const ended = (note) => {
  const text = String(note ?? '').trim();
  return text ? `${/[.!?…]$/u.test(text) ? text : `${text}.`} ` : '';
};

/** What a worker is told when it asked a question you had already answered (its next try reads it). */
export const alreadyAnswered = (answer) => `This was already answered by the user: ${line(answer, 300)}. Use that answer; do not ask it again.`;

/**
 * An item's worker asked again a question you had already answered and finished on its own default (the owner's rule
 * of 20 November: a helper asking a question already answered gets the earlier answer). The item is tried again with
 * your answer told plainly, but only within its tries (the try just made counts): never a try more, never a card.
 * With no try left it keeps its result, and its note and the report say so. With no step left to do it again (its
 * time, its steps or its last lap are used up: the next step would not be its work) it keeps its result too, like an
 * answer that came too late (`lateAnswer`, `lateItems`): the note and the report say so, and a continue does it again.
 * @param {object} run - the run, after applyWork for the item; changed in place.
 * @param {string} id - the item.
 * @param {object} question - the earlier answered question (from addQuestion).
 * @param {string} [assumed] - what the worker assumed instead.
 * @param {number} [at] - now.
 * @returns {'' | 'redo' | 'again' | 'kept' | 'late'} redo: reopened for your answer; again: tried again anyway (open),
 *   now told your answer; kept: no try left; late: no step left to redo it; '' when nothing applies.
 */
export function followAnswer(run, id, question, assumed = '', at = Date.now(), under = undefined) {
  if (!question || question.status !== 'answered' || question.kind === 'time') return '';
  const item = run.items.find((entry) => entry.id === String(id));
  if (!item || item.status === 'aside') return '';
  const told = alreadyAnswered(question.answer);
  const by = assumed || 'its own judgement';
  if (item.status === 'open') {
    item.note = clip(`${told} ${item.note ?? ''}`.trim(), 400);
    return 'again';
  }
  if (['verified', 'reviewed', 'unverified'].includes(item.status) && (item.tries ?? 0) < run.limits.maxTries) {
    const was = { status: item.status, note: item.note };
    item.status = 'open';
    // Would the run come back to it? Not when its time, steps or last lap are used up (a paused run judged as paused).
    const now = clockAt(run, at);
    // Stage D: other work lanes still running mean another work step comes (`under`: their kinds).
    const live = Array.isArray(under) ? under : [];
    if (live.includes('work') || nextStep(run, now).kind === 'work') {
      item.note = clip(told, 400);
      return 'redo';
    }
    // Too late to redo it: it keeps its result, says so, and is marked for a continue (as a late answer is).
    item.status = was.status;
    item.lateAnswer = question.id;
    item.note = clip(`${ended(was.note)}Its worker asked again a question you had already answered and went with ${line(by, 200)}. Your answer: ${line(question.answer, 300)}. There was no time or step left to do it again with your answer, so it keeps this result.`, 600);
    question.lateItems = [...new Set([...(Array.isArray(question.lateItems) ? question.lateItems : []), item.id])];
    const others = Array.isArray(question.askedAgain) ? question.askedAgain.filter((entry) => entry?.item !== item.id) : [];
    question.askedAgain = [...others, { item: item.id, assumed: clip(by, 300), late: true }].slice(-20);
    return 'late';
  }
  // No try left (or stuck): it ends as the rules say; the report tells you the worker kept its own default.
  item.note = clip(`${ended(item.note)}Its worker asked again a question you had already answered and went with ${line(by, 200)}; it had no tries left to do it with your answer.`, 600);
  const kept = Array.isArray(question.askedAgain) ? question.askedAgain.filter((entry) => entry?.item !== item.id) : [];
  question.askedAgain = [...kept, { item: item.id, assumed: clip(by, 300) }].slice(-20);
  return 'kept';
}

/** Who asked a question (stage C): the plan, the review, an item's worker, or the time sizing. */
export const QUESTION_FROM = ['plan', 'review', 'item', 'time', 'repair'];

/** @returns {'plan' | 'review' | 'item' | 'time'} who asked; questions saved before stage C are read from their kind and items. */
export const questionFrom = (question) => (QUESTION_FROM.includes(question?.from) ? question.from : question?.kind === 'time' ? 'time' : (question?.items?.length ?? 0) > 0 ? 'item' : 'plan');

/** Questions a planner or reviewer gave in its JSON: `[{question, default}]` (also `text`/`assume`). */
const takeQuestions = (run, list, from = '') => {
  const out = [];
  for (const entry of (Array.isArray(list) ? list : []).slice(0, 6)) {
    if (typeof entry === 'string') out.push([entry, addQuestion(run, { text: entry, from })]);
    else if (entry && typeof entry === 'object') out.push([entry, addQuestion(run, { text: entry.question ?? entry.text, assume: entry.default ?? entry.assume ?? '', from })]);
  }
  return out;
};

/** What an item that waits for the user's answer before it starts says (Ask and wait). */
export const WAITS_BEFORE_START = 'It waits for your answer before it starts.';

/** Said in the plan step, the log and the report when the plan had no usable item. */
export const PLAN_FALLBACK = 'The planner gave no usable plan, so the whole goal became one item.';

/**
 * Take the planner's checklist. A plan without a usable item becomes one item: the goal itself.
 * @param {object} run - the run; changed in place.
 * @param {{summary?: string, items?: object[], checks?: string[]} | undefined} plan - the parsed plan.
 * @returns {object} the run.
 */
export function applyPlan(run, plan, { needs = needsOf(run) } = {}) {
  run.steps += 1;
  run.summary = clip(plan?.summary, 800);
  // The plan's own items by their number (Ask and wait: a question names the items that wait for it).
  const byNumber = [];
  for (const [index, source] of (Array.isArray(plan?.items) ? plan.items : []).slice(0, run.limits.maxItems).entries()) {
    const item = addItem(run, source, 'plan');
    // Stage D: the items it needs done first, by their number in the plan; only earlier ones count.
    const after = (Array.isArray(source?.after) ? source.after : []).map((value) => Math.round(Number(value))).filter((value) => Number.isFinite(value) && value >= 1 && value <= index);
    const ids = [...new Set(after.map((value) => run.items[value - 1]?.id).filter((id) => id && id !== item?.id))];
    if (item && ids.length > 0) item.after = ids.slice(0, 12);
    byNumber[index + 1] = item;
  }
  // No usable item: the goal itself is the one item, and the run says so in its log and its report.
  run.planNote = '';
  if (run.items.length === 0) {
    addItem(run, { title: line(run.goal, 120), detail: run.goal, done_when: 'The goal is met.' }, 'plan');
    run.planNote = PLAN_FALLBACK;
  }
  run.checks = [...new Set((Array.isArray(plan?.checks) ? plan.checks : []).map((command) => line(command, 400)).filter((command) => command && !alwaysPasses(command)))].slice(0, 6);
  // What only the user can give (their answers, their yes) comes as questions with a default, never as items.
  const asked = takeQuestions(run, plan?.questions, 'plan');
  // Ask and wait (point 17): the items a question names wait for its answer before they start; the others go on.
  run.waitingBefore = [];
  // Full auto (review of point 17): a decision names the items that depend on it, so Finish it redoes those when you
  // change it.
  if (needs === 'decide') {
    for (const [entry, question] of asked) {
      if (!question || question.self !== true || !entry || typeof entry !== 'object') continue;
      const numbers = (Array.isArray(entry.items) ? entry.items : []).map((value) => Math.round(Number(value))).filter((value) => Number.isFinite(value) && value >= 1);
      for (const number of numbers) {
        const item = byNumber[number];
        if (item && !question.items.includes(item.id) && question.items.length < 20) question.items.push(item.id);
      }
    }
  }
  if (needs === 'wait') {
    for (const [entry, question] of asked) {
      if (!question || question.status !== 'open' || question.kind === 'time' || !entry || typeof entry !== 'object') continue;
      const numbers = (Array.isArray(entry.items) ? entry.items : []).map((value) => Math.round(Number(value))).filter((value) => Number.isFinite(value) && value >= 1);
      for (const number of numbers) {
        const item = byNumber[number];
        if (!item || !['open', 'parked'].includes(item.status)) continue;
        item.status = 'parked';
        item.parkedOn = [...new Set([...(item.parkedOn ?? []), question.id])];
        item.parks = item.parks ?? 0;
        item.parkedAt = Date.now();
        item.note = WAITS_BEFORE_START;
        item.resume = { before: true, report: '', answers: [] };
        question.parks = [...new Set([...(Array.isArray(question.parks) ? question.parks : []), item.id])];
        if (!question.items.includes(item.id) && question.items.length < 20) question.items.push(item.id);
        if (!run.waitingBefore.includes(item.id)) run.waitingBefore.push(item.id);
      }
    }
  }
  run.phase = 'work';
  return run;
}

/**
 * Record what a worker did with an item and what its command said.
 * @param {object} run - the run; changed in place.
 * @param {string} id - the item.
 * @param {object} result - the outcome.
 * @param {string} [result.report] - the worker's own report.
 * @param {{ok: boolean, output: string} | undefined} [result.check] - the item's command, run for real; undefined when it has none.
 * @param {string} [result.aside] - set when the user's yes was needed and did not come: what was asked.
 * @param {string} [result.failed] - set when the worker itself could not run.
 * @returns {object} the item.
 */
export function applyWork(run, id, { report = '', check, aside = '', asideOn = [], failed = '', loopFail = '', loopFailBy = 'app', free = false, assumed = '', inverted = false, parked, waitFile = '', recheck = false, touched = [], at = Date.now() } = {}) {
  run.steps += 1;
  if (isLong(run)) run.long.lapEnded = false;
  const item = run.items.find((entry) => entry.id === id);
  if (!item) return undefined;
  // Every attempt is counted, also one that does not use up a try: an item that was tried is never "not started".
  item.attempts = (item.attempts ?? 0) + 1;
  // Stage D: the files its helpers changed (for the next helper of a parked item), its stop or end, and a recheck.
  const changed = (Array.isArray(touched) ? touched : []).map(String).filter(Boolean);
  if (changed.length > 0) item.touched = [...new Set([...(Array.isArray(item.touched) ? item.touched : []), ...changed])].slice(-200);
  delete item.interrupted;
  delete item.recheck;
  delete item.undone;
  delete item.asideOn;
  const on = Array.isArray(parked?.on) ? [...new Set(parked.on.map(String).filter(Boolean))] : [];
  if (on.length > 0 && !free) {
    if ((item.parks ?? 0) < parksMaxOf(run)) {
      // It stopped to wait for the user: its work so far is kept, no try is used, and it goes on when they answer.
      item.status = 'parked';
      item.parkedOn = on;
      item.parks = (item.parks ?? 0) + 1;
      item.parkedAt = at;
      item.report = clip(report, 1500);
      item.note = clip(parked.note || (parked.kind === 'approval' ? 'It waits for your yes; its work so far is kept.' : 'It waits for your answer; its work so far is kept.'), 400);
      delete item.resume;
      delete item.resumeAt;
      delete item.waitFile;
      return item;
    }
    // The third stop of the same item (the seventh with Ask and wait): counted as blocked (a try used), so it cannot go
    // round for ever.
    failed = failed || `It stopped to wait for you ${parksMaxOf(run) === PARKS_MAX ? 'a third time' : `${parksMaxOf(run) + 1} times`} (${on.join(', ')}), so this counts as a try.`;
    // It no longer waits for those questions: the card stops saying so (it goes on with its defaults).
    for (const question of Array.isArray(run.questions) ? run.questions : []) {
      if (on.includes(String(question.id)) && Array.isArray(question.parks)) question.parks = question.parks.filter((each) => String(each) !== String(item.id));
    }
  }
  // It went on (or was let go): it waits for nothing any more.
  if (item.status === 'parked') {
    item.status = 'open';
    delete item.parkedOn;
  }
  if (recheck && !failed) {
    // Its check failed while other helpers were working: checked again on its own when they are done (no try used).
    item.recheck = true;
    item.report = clip(report, 1500);
    item.note = 'Its check failed while other helpers were working; it is checked again when they are done.';
    return item;
  }
  const file = String(waitFile ?? '').trim().slice(0, 400);
  if (file && !free) {
    item.fileWaits = (item.fileWaits ?? 0) + 1;
    if (item.fileWaits < FILE_WAITS_MAX) {
      // Another item's helper was changing a file it needs: it goes on when that file is free (no try used).
      item.status = 'open';
      item.waitFile = file;
      item.report = clip(report, 1500);
      item.note = clip(`It waits for ${file}, which another item is changing.`, 400);
      return item;
    }
    failed = failed || `It kept waiting for ${file}, which other items were changing.`;
  }
  delete item.waitFile;
  // A helper that never did anything (an empty answer, or one the app stopped before it reached the model)
  // does not use up a try of the item: the cause is the app or the route, not the item.
  if (free && failed) {
    // Its own check still ran: when it passes, the item is done already (another item's worker did it).
    if (check?.ok) {
      item.evidence = `${item.check}\n${tail(check.output) || '(passed, no output)'}`;
      item.status = 'verified';
      item.note = '';
      return item;
    }
    item.note = clip(failed, 400);
    return item;
  }
  item.tries += 1;
  item.report = clip(report, 1500);
  // It went on with what the user said: that is done now (a free failure keeps it for the next helper).
  delete item.resume;
  delete item.resumeAt;
  if (aside) {
    item.status = 'aside';
    item.note = clip(aside, 400);
    // Full auto: the approvals it was not done without (Finish it lets the user allow them; the item is then taken up).
    const ids = (Array.isArray(asideOn) ? asideOn : []).map(String).filter(Boolean);
    if (ids.length > 0) item.asideOn = [...new Set(ids)];
    else delete item.asideOn;
  } else if (failed) {
    item.note = clip(failed, 400);
    if (item.tries >= run.limits.maxTries) item.status = 'stuck';
  } else if (check) {
    item.evidence = `${item.check}\n${tail(check.output) || (check.ok ? '(passed, no output)' : '(failed, no output)')}`;
    if (check.ok) {
      item.status = 'verified';
      item.note = '';
    } else if (inverted) {
      // The worker says it is done, but the check failed without printing anything: a grep that proves
      // "removed" the wrong way round. The reviewer may give the item a corrected check.
      item.maybeInverted = true;
      item.note = 'Its check may be inverted: the worker says the item is done, but the check failed without any output. The reviewer may replace the check.';
      if (item.tries >= run.limits.maxTries) item.status = 'stuck';
    } else {
      item.note = 'Its command did not pass.';
      if (item.tries >= run.limits.maxTries) item.status = 'stuck';
    }
  } else {
    // No command proves it: the reviewer decides.
    item.status = 'unverified';
    item.note = '';
  }
  // A worker that needed the user's answer finished the item on a default; that default is noted.
  if (assumed && item.status !== 'aside') item.note = clip(`${item.note ? `${item.note} ` : ''}Assumed: ${assumed}`, 400);
  // The work loop's checker (only when the loop is on): its no sends the item back with its words, as
  // often as the Depth allows (Quick never, Standard once). Its yes marks nothing done. A model's no never
  // reopens an item whose command passed: only the app's own checks may. A failed shape alone ('format')
  // never reopens an item whose own command passed: it is noted, nothing more.
  const mayReopen = item.status === 'unverified' || (item.status === 'verified' && loopFailBy === 'app');
  if (loopFail && item.status === 'verified' && loopFailBy === 'format') {
    item.note = clip(`Format (advice only, the item's own command passed): ${loopFail}`, 400);
  } else if (loopFail && mayReopen) {
    const used = item.loopRetries ?? 0;
    if (used < (run.loop?.retries ?? 1)) {
      item.loopRetries = used + 1;
      item.status = item.tries >= run.limits.maxTries ? 'stuck' : 'open';
      item.note = clip(`Checker: ${loopFail}`, 400);
    } else {
      item.note = clip(`Checker (no more tries at this Depth): ${loopFail}`, 400);
    }
  }
  return item;
}

/**
 * Record the overall commands. Each one that fails becomes a new item, while there is room.
 * @param {object} run - the run; changed in place.
 * @param {{command: string, ok: boolean, output: string}[]} results - each command, run for real.
 * @returns {object} the run.
 */
export function applyChecks(run, results) {
  run.steps += 1;
  run.checkResults = results.map((result) => ({ command: line(result.command, 400), ok: result.ok === true, output: tail(result.output) }));
  run.phase = 'checks';
  if (isLong(run) && run.checkResults.length > 0 && run.checkResults.every((result) => result.ok)) {
    run.long.checksPassedOnce = true;
    run.long.passing = run.checkResults.map((result) => result.command);
  }
  for (const result of run.checkResults.filter((entry) => !entry.ok)) {
    const fixes = run.items.filter((item) => item.by === 'checks' && item.check === result.command);
    if (fixes.length >= run.limits.maxTries) continue;
    const item = addItem(run, { title: `Make "${line(result.command, 80)}" pass`, detail: `This command fails:\n${result.output}`, done_when: 'The command exits without an error.', check: result.command }, 'checks');
    if (item) run.phase = 'work';
  }
  return run;
}

/** A Long run's review that gave no usable answer, in plain words. */
export const REVIEW_UNUSABLE = 'The reviewer gave no usable answer, so the review will be taken again.';

/**
 * Take the reviewer's verdict.
 * @param {object} run - the run; changed in place.
 * @param {{verdict?: string, note?: string, items?: {id: string, ok: boolean, note?: string}[], new_items?: object[]} | undefined} review - the parsed review; undefined when the reviewer gave nothing usable.
 * @returns {object} the run.
 */
export function applyReview(run, review) {
  run.steps += 1;
  run.reviews += 1;
  const phaseBefore = run.phase;
  run.phase = 'review';
  const before = run.items.length;
  const openBefore = openItems(run).length;
  const lapEnds = () => {
    if (!isLong(run)) return;
    // A lap that finds nothing to do counts toward stopping early (decision 2).
    const found = run.items.length > before || openItems(run).length > openBefore;
    run.long.lap += 1;
    run.long.emptyLaps = found ? 0 : run.long.emptyLaps + 1;
    run.long.hunting = false;
    run.long.lapPoint = 0;
    run.long.lapEnded = true;
  };
  // A Long run's reviewer that gave no usable answer (empty, unreadable or failed) is a helper failure, not
  // a lap that found nothing: the lap does not end, no review is used up, and the review is taken again.
  // The runner counts it toward the helper failures that pause the run.
  if (!review && isLong(run)) {
    run.reviews -= 1;
    run.phase = phaseBefore;
    // Kept apart from the reviewer's note: the last usable note stays for the report and the next lap, and a
    // run that ends before the next review never says the review "will be taken again".
    run.reviewRetry = REVIEW_UNUSABLE;
    return run;
  }
  run.reviewRetry = '';
  if (!review) {
    run.reviewNote = 'The reviewer gave no usable answer. Items without a command stay unverified.';
    lapEnds();
    return run;
  }
  run.reviewNote = clip(review.note, 800);
  takeQuestions(run, review.questions, 'review');
  let reopened = 0;
  for (const verdict of Array.isArray(review.items) ? review.items : []) {
    const item = run.items.find((entry) => entry.id === String(verdict?.id));
    if (!item || item.status === 'aside') continue;
    // A check that may be inverted: the reviewer's corrected one replaces it, and the item is tried again
    // with it, without that failed try counting against it.
    const better = line(verdict?.check, 400);
    if (item.maybeInverted && better && better !== item.check && !alwaysPasses(better) && item.status !== 'verified') {
      item.check = better;
      item.maybeInverted = false;
      item.tries = Math.max(0, item.tries - 1);
      item.status = 'open';
      item.note = clip(`Reviewer replaced its check: ${better}`, 400);
      reopened += 1;
      continue;
    }
    if (verdict.ok === true) {
      // A reviewer's yes counts only where no command spoke; a failing command is not overruled.
      if (item.status === 'unverified') {
        item.status = 'reviewed';
        item.evidence = `Reviewer: ${clip(verdict.note, 300) || 'meets its done-when.'}`;
      }
    } else if (verdict.ok === false && ['unverified', 'reviewed', 'verified'].includes(item.status)) {
      item.note = `Reviewer: ${clip(verdict.note, 400) || 'not done.'}`;
      if (item.tries < run.limits.maxTries && run.reviews <= run.limits.maxReviews) {
        item.status = 'open';
        reopened += 1;
      } else if (item.status !== 'verified') {
        item.status = 'stuck';
      }
    }
  }
  if (run.reviews <= run.limits.maxReviews) for (const source of (Array.isArray(review.new_items) ? review.new_items : []).slice(0, 4)) if (addItem(run, source, 'review')) reopened += 1;
  if (reopened > 0) run.phase = 'work';
  lapEnds();
  return run;
}

/**
 * The keep-or-roll-back gate (Long run, step 52): once the overall commands have all passed, a lap whose
 * commands then fail where they passed is undone. Decided after a failing command was run a second time.
 * @returns {string[]} the commands that passed before and fail now ('' none: keep the lap).
 */
export function brokenChecks(run, results) {
  if (!isLong(run) || !run.long.checksPassedOnce) return [];
  const before = new Set(run.long.passing);
  return results.filter((result) => !result.ok && before.has(line(result.command, 400))).map((result) => line(result.command, 400));
}

/**
 * Record that the gate undid a lap: the folder went back to the lap's start, so the work of that lap is
 * open again (its tries still count), and the undone state is kept as a checkpoint the report names.
 * @param {object} run - the run; changed in place.
 * @param {{lap: number, kept: number, back: number, broke: string[]}} undo - what happened.
 */
export function applyUndo(run, { kept, back, broke, touched = [] }) {
  run.steps += 1;
  run.long.undone.push({ lap: run.long.lap + 1, kept, back, broke: broke.slice(0, 4) });
  for (const item of run.items) {
    if (!touched.includes(item.id)) continue;
    if (item.status === 'stuck' || item.status === 'aside') continue;
    // Stage D: an item that waits for the user keeps waiting; its helper is told the work may be gone when it goes on.
    if (item.status === 'parked') {
      item.undone = true;
      continue;
    }
    item.status = item.tries >= run.limits.maxTries ? 'stuck' : 'open';
    item.note = clip(`Undone: this lap broke ${broke.join(', ')}, so its work was rolled back (kept as checkpoint ${kept}).`, 400);
  }
  run.checkResults = run.long.passing.map((command) => ({ command, ok: true, output: '(as before the undone lap)' }));
  // Its items go back to work, and the overall commands run again after them.
  run.phase = run.items.some((item) => item.status === 'open') ? 'work' : 'checks';
  return run;
}

/** "Lap N." for a Mission with no lap limit, else "Lap N of at most M.". */
export const lapLine = (run) => (run.long.laps > 0 ? `Lap ${run.long.lap} of at most ${run.long.laps}.` : `Lap ${run.long.lap}.`);

/**
 * The notes the add-on keeps between laps (step 53): short, replaced each lap, given to every helper. The user's
 * own notes and answers are not in them: they have their own block (userNotes), so they are never cut here.
 * @returns {string} the notes ('' for runs from before stage B of kind 'mission').
 */
export function lapNotes(run) {
  if (!isLong(run)) return '';
  const passed = run.items.filter((item) => item.status === 'verified' || item.status === 'reviewed').map((item) => `${item.id}`);
  const failing = run.items.filter((item) => item.status === 'open' || item.status === 'stuck').map((item) => `${item.id} (${line(item.note, 120) || 'not done'})`);
  const checks = run.checkResults.filter((result) => !result.ok).map((result) => result.command);
  const undone = run.long.undone.map((entry) => `lap ${entry.lap} broke ${entry.broke.join(', ')} and was undone`);
  const text = [
    lapLine(run),
    passed.length > 0 ? `Done: items ${passed.join(', ')}.` : '',
    failing.length > 0 ? `Still open or stuck: ${failing.join('; ')}.` : '',
    checks.length > 0 ? `Failing commands: ${checks.join('; ')}.` : '',
    undone.length > 0 ? `Avoid repeating: ${undone.join('; ')}.` : '',
    run.reviewNote ? `Last review: ${line(run.reviewNote, 300)}` : '',
  ].filter(Boolean).join('\n');
  return text.slice(0, NOTES_MAX);
}

/** @returns {{verified: number, reviewed: number, unverified: number, stuck: number, aside: number, open: number, total: number}} how the items stand. */
export function tally(run) {
  const count = (status) => run.items.filter((item) => item.status === status).length;
  return { verified: count('verified'), reviewed: count('reviewed'), unverified: count('unverified'), stuck: count('stuck'), aside: count('aside'), parked: count('parked'), open: count('open'), total: run.items.length };
}

/**
 * End the run and say how it ended.
 * @param {object} run - the run; changed in place.
 * @param {string} [reason] - why it ends early: 'stopped' or an error.
 * @param {number} [at] - now.
 * @returns {object} the run.
 */
export function finish(run, reason = '', at = Date.now()) {
  const now = tally(run);
  const checksOk = run.checkResults.every((result) => result.ok);
  run.endedAt = at;
  run.phase = 'finish';
  if (reason) {
    run.status = 'stopped';
    run.stopReason = line(reason, 300);
  } else if (isLong(run) && now.total > 0 && now.verified + now.reviewed === now.total && checksOk) {
    run.status = 'complete';
  } else if (run.steps >= run.limits.maxSteps && now.open > 0) {
    run.status = 'incomplete';
    run.stopReason = `It reached its limit of ${run.limits.maxSteps} steps.`;
  } else if (now.total > 0 && now.verified + now.reviewed === now.total && checksOk) {
    run.status = 'complete';
  } else {
    run.status = 'incomplete';
    run.stopReason = [now.stuck ? `${now.stuck} item${now.stuck === 1 ? '' : 's'} could not be finished` : '', now.aside ? `${now.aside} need${now.aside === 1 ? 's' : ''} your yes` : '', now.parked ? `${now.parked} wait${now.parked === 1 ? 's' : ''} for you` : '', now.unverified ? `${now.unverified} could not be verified` : '', notDone(run) ? `${notDone(run)} tried but not done` : '', notStarted(run) ? `${notStarted(run)} not started` : '', checksOk ? '' : 'an overall command still fails'].filter(Boolean).join('; ');
    run.stopReason = run.stopReason ? `${run.stopReason.charAt(0).toUpperCase()}${run.stopReason.slice(1)}.` : '';
  }
  return run;
}

/**
 * Take up an ended run again: what waited for the user's yes, and what was never started, is
 * open once more. Items that used up their tries stay as they are.
 * @param {object} run - an ended run; changed in place.
 * @returns {number} how many items are open again; 0 leaves the run ended.
 */
export function reopen(run) {
  if (run.status === 'running' || run.status === 'complete') return 0;
  let count = 0;
  for (const item of run.items) {
    if (item.status === 'aside') {
      item.status = 'open';
      // The try that waited for the user does not count against the item.
      item.tries = Math.max(0, item.tries - 1);
      count += 1;
    } else if (item.status === 'open') count += 1;
  }
  if (count === 0) return 0;
  run.status = 'running';
  run.phase = 'work';
  run.stopReason = '';
  run.endedAt = 0;
  // Room for the reopened items, their checks and a review, whatever was used before.
  run.limits = { ...run.limits, maxSteps: Math.max(run.limits.maxSteps, run.steps + count * run.limits.maxTries + 4) };
  if (run.reviews >= run.limits.maxReviews) run.reviews = Math.max(0, run.limits.maxReviews - 1);
  return count;
}

/** The report's time limit: the first one, then each continue's own after the end (review of stage C). */
function limitWords(L) {
  const continues = Array.isArray(L.continues) ? L.continues : [];
  if (continues.length === 0) return L.minutes > 0 && L.deadline > 0 ? `${L.minutes} minutes` : 'none';
  const first = L.minutes > 0 ? `${L.minutes} minutes` : 'none';
  return [first, ...continues.map((entry) => (Number(entry.minutes) > 0 ? `then ${entry.minutes} more minutes after the end` : 'then no time limit after the end'))].join(', ');
}

/** What the report says about items waiting for your yes: how (and whether) they are taken up again. */
function asideAdvice(run) {
  const said = 'Type /mission resume while you are here: those items are taken up again and you can answer the question.';
  if (!isLong(run) || run.status === 'running') return said;
  if (continueBlock(run) === '') return 'Press Finish it above the chat box to allow them; those items are taken up again.';
  if (asideWaiting(run) > 0) return 'Type /mission resume while you are here: it asks how much more time to give, then those items are taken up again and you can answer the question.';
  return run.stopReason === ENDED_BY_YOU ? 'It was ended with End, so they are not taken up again. Start Mission starts a new one.' : 'It cannot be continued, so they are not taken up again. Start Mission starts a new one.';
}

const MARK = { verified: 'PASSED', reviewed: 'REVIEWED', unverified: 'NOT VERIFIED', stuck: 'NOT FINISHED', aside: 'NEEDS YOU', parked: 'WAITS FOR YOU', open: 'NOT STARTED' };

/** @returns {boolean} whether an item was worked on at least once (also by a helper whose try did not count). */
const tried = (item) => (item.attempts ?? 0) > 0 || (item.tries ?? 0) > 0;
const notDone = (run) => run.items.filter((item) => item.status === 'open' && tried(item)).length;
const notStarted = (run) => run.items.filter((item) => item.status === 'open' && !tried(item)).length;

/** An item's mark: an open item that was tried is NOT DONE (with its reason below it), never NOT STARTED. */
const markOf = (item) => (item.status === 'open' && tried(item) ? 'NOT DONE' : MARK[item.status] ?? item.status);

/** Reasons said for an item with no note of its own once the Mission has ended (point 17: every undone item says why). */
export const NOT_STARTED_WHY = 'Not started before the Mission ended.';
export const UNCONFIRMED_WHY = 'Done, but no command or review could confirm it.';

/** The line under an item: its note; for an item tried but not done without one, how often it was tried. */
const noteOf = (item, ended = false) => {
  if (item.note) return item.note;
  if (ended && item.status === 'open' && !tried(item)) return NOT_STARTED_WHY;
  if (ended && item.status === 'unverified') return UNCONFIRMED_WHY;
  if (item.status !== 'open' || !tried(item)) return '';
  const count = Math.max(item.attempts ?? 0, item.tries ?? 0);
  return `Tried ${count} time${count === 1 ? '' : 's'}; not done yet.`;
};

/** @returns {{id: string, title: string, mark: 'NOT DONE' | 'NOT STARTED', why: string}[]} an ended Mission's items not done yet (open), with why. */
export function undoneItems(run) {
  return (run?.items ?? []).filter((item) => item.status === 'open').map((item) => ({ id: item.id, title: item.title, mark: tried(item) ? 'NOT DONE' : 'NOT STARTED', why: noteOf(item, true) }));
}

/**
 * The checklist as text, for the conversation and for the report.
 * @param {object} run - the run.
 * @returns {string} one line per item.
 */
export function checklist(run) {
  const ended = run.status !== 'running';
  return run.items.map((item) => `${item.id}. [${markOf(item)}] ${item.title}${item.check ? `  (proved by: ${item.check})` : ''}${noteOf(item, ended) ? `\n   ${noteOf(item, ended)}` : ''}`).join('\n');
}

/**
 * The final report, in plain words. The first line stands on its own.
 * @param {object} run - a finished run.
 * @returns {string} the report.
 */
export function report(run) {
  const now = tally(run);
  // The time between an end and a continue is not working time (stage C).
  // Nor is the time it waited for the user (point 17).
  const minutes = tookMinutes(run);
  // Owner point 19: a run closed because its conversation is gone: its /mission back lines cannot work any more.
  const gone = goneReason(run.stopReason);
  const name = 'Mission';
  const head = run.status === 'complete'
    ? `${name} complete: all ${now.total} item${now.total === 1 ? '' : 's'} done and checked.`
    : run.status === 'stopped'
      ? `${name} stopped: ${now.verified + now.reviewed} of ${now.total} items done. ${run.stopReason}`
      : `${name} not complete: ${now.verified + now.reviewed} of ${now.total} items done. ${run.stopReason}`;
  const lines = [head.trim(), '', `Goal: ${run.goal}`, `Took ${minutes} minute${minutes === 1 ? '' : 's'} and ${run.steps} step${run.steps === 1 ? '' : 's'}. Mission access: ${shownAccess(run.mode)}.`];
  if (gone && Number(run.closedAt) - (Number(run.endedAt) || 0) >= SAT_UNUSED_MS) lines.push(`It worked until ${dateWords(run.endedAt)}; it then sat unused until ${dateWords(run.closedAt)}, when it was closed. That time did not count.`);
  if (isLong(run)) {
    const L = run.long;
    const pausedMinutes = Math.round((Number(L.pausedMs) || 0) / 60000);
    lines.push(`Laps: ${L.lap}${L.laps > 0 ? ` of at most ${L.laps}` : ''}. Time limit: ${limitWords(L)}${L.fullTime ? ', full time used on purpose' : ''}.${pausedMinutes > 0 ? ` It was paused for ${pausedMinutes} minute${pausedMinutes === 1 ? '' : 's'}; that time did not count.` : ''}${run.longEnd ? ` It ended because ${run.longEnd}.` : ''}`);
    // Stage D: how many helpers worked at once, and why fewer than asked.
    if (Number(L.helpers) > 1 || Number(L.helpersAsked) > 1) lines.push(`Helpers at once: ${L.helpers}${L.helpersWhy === 'no-checkpoints' ? ' (no checkpoints in this folder)' : L.helpersWhy === 'server' ? ' (Calls at once for your model server)' : ''}.`);
    // Point 17: when it needs you, and the time it waited for you (which did not count).
    lines.push(needsLine(run));
    const waited = Math.round(waitedOf(run) / 60000);
    if (waited > 0) lines.push(`It waited for you for ${waited} minute${waited === 1 ? '' : 's'}; that time did not count.`);
    // Stage E: the time it waited for its model server.
    const down = Math.round((Number(L.downMs) || 0) / 60000);
    if (down > 0) lines.push(`It waited ${down} minute${down === 1 ? '' : 's'} for your model server; that time did not count.`);
    if (Array.isArray(run.cutItems) && run.cutItems.length > 0) lines.push(`The last steps (items ${run.cutItems.join(', ')}) were cut short by the time limit. They keep their tries.`);
    else if (run.cutByTime) lines.push(`The last step (${run.cutByTime}) was cut short by the time limit. It keeps its try.`);
    if (L.undone.length > 0) lines.push(...L.undone.map((entry) => `Lap ${entry.lap} broke ${entry.broke.join(', ')} and was undone. Its work is kept as checkpoint ${entry.kept}${gone ? '' : ` (/mission back ${entry.kept} to look at it)`}.`));
    for (const entry of Array.isArray(L.continues) ? L.continues : []) {
      const count = (Number(entry.answered) || 0) + (Number(entry.skipped) || 0);
      const allowed = Number(entry.allowed) || 0;
      const gave = [count > 0 ? `${count} answer${count === 1 ? '' : 's'}` : '', allowed > 0 ? `${allowed} step${allowed === 1 ? '' : 's'} you allowed` : ''].filter(Boolean).join(' and ');
      lines.push(`Continued after the end${gave ? ` with ${gave}` : ''}, ${Number(entry.minutes) > 0 ? `for up to ${entry.minutes} more minutes` : 'with no time limit'}.`);
      if (Number(entry.checkpoint) > 0 && !gone) lines.push(`To undo only what this continue changed: /mission back ${entry.checkpoint}`);
    }
  }
  if (run.planNote) lines.push('', run.planNote);
  if (run.stepsNote) lines.push('', run.stepsNote);
  lines.push('', 'Checklist:', checklist(run));
  lines.push('', `What the marks mean: PASSED = its command was run and passed. REVIEWED = no command could prove it; the reviewer model judged it done. NOT DONE = it was tried and is not done; the line under it says why.${now.parked > 0 ? ' WAITS FOR YOU = it stopped to wait for your answer or your yes; its work so far is kept.' : ''} The rest is not done.`);
  if (run.checkResults.length > 0) lines.push('', 'Overall commands, run at the end:', ...run.checkResults.map((result) => `- ${result.ok ? 'passed' : 'FAILED'}: ${result.command}`));
  if (run.reviewNote) lines.push('', `Reviewer's note: ${run.reviewNote}`);
  if (run.loop) lines.push('', loopLine(run));
  // Stage D: items that wait for your answer, with the helper's suggestion.
  const parkedQuestions = (Array.isArray(run.questions) ? run.questions : []).filter((question) => question.status === 'open' && run.items.some((item) => item.status === 'parked' && (item.parkedOn ?? []).includes(question.id)));
  if (parkedQuestions.length > 0) {
    lines.push('', 'Waiting for your answer:', ...parkedQuestions.flatMap((question) => run.items.filter((item) => item.status === 'parked' && (item.parkedOn ?? []).includes(question.id)).map((item) => `- Item ${item.id}, "${item.title}": ${question.text}${question.assume ? ` (its suggestion: ${question.assume})` : ''}. ${run.status === 'running' ? 'Answer it, or Skip, in the card to continue.' : 'To answer it: press Finish it above the chat box.'}`)));
  }
  // Full auto's items not done without a yes are listed under "Not asked" below, not here.
  const waiting = run.items.filter((item) => item.status === 'aside' && !(item.asideOn ?? []).length);
  // Owner point 19: an ended Mission that has nothing to finish lists the repair helper's asks as suggestions, not as
  // something it waits for.
  const suggesting = isLong(run) && run.status !== 'running' && continueBlock(run) !== '';
  // Lab check of point 19: after the end the repair helper's changes of a setting, Calls at once or the Budget guard wait
  // for your OK (Allow or Deny on the strip); the rest of its asks (a fallback model) are no longer needed.
  const oks = pendingOks(run);
  const ended = isLong(run) && run.status !== 'running';
  const staleLate = ended ? approvalsOf(run).filter((entry) => entry.status === 'lapsed' && entry.afterEnd === true) : [];
  const lapsed = ended ? approvalsOf(run).filter((entry) => !staleLate.includes(entry) && (entry.status === 'lapsed' || (repairAsk(entry) && !oks.includes(entry)))) : [];
  const suggested = [...oks, ...lapsed, ...staleLate];
  const asking = openApprovals(run).filter((entry) => !suggested.includes(entry));
  const askedBy = (entry) => ((entry.items ?? []).length > 0 ? `item ${entry.items.map((id) => `${id}: ${run.items.find((item) => item.id === String(id))?.title ?? ''}`).join('; ')}` : entry.by === 'review' || entry.by === 'hunt' ? 'asked by the review' : 'asked by the plan');
  if (waiting.length > 0 || asking.length > 0) lines.push('', 'Waiting for your yes:', ...waiting.map((item) => `- Item ${item.id}: ${item.note}`), ...asking.map((entry) => `- ${entry.what} (${askedBy(entry)}).`), ...(waiting.length > 0 ? [asideAdvice(run)] : []));
  // Point 17: what Full auto did not ask (it never gives itself permission), with what became of the items.
  const unasked = approvalsOf(run).filter((entry) => entry.status === 'unasked' && !suggested.includes(entry));
  if (unasked.length > 0) {
    lines.push('', 'Not asked, because it needs your yes (Full auto never asks; Finish it lets you allow them):', ...unasked.map((entry) => {
      const ids = (entry.items ?? []).map(String);
      const left = ids.filter((id) => run.items.some((item) => item.id === id && item.status === 'aside' && (item.asideOn ?? []).includes(entry.id)));
      const outcome = ids.length === 0 ? 'It went on without it.' : left.length === 0 ? `It finished the item${ids.length === 1 ? '' : 's'} without it.` : `${left.length === 1 ? `Item ${left[0]} is` : `Items ${left.join(', ')} are`} not done without it.`;
      return `- ${entry.what} (${askedBy(entry)}). ${outcome}${entry.reason ? ` The helper said: "${line(entry.reason, 300)}"` : ''}`;
    }));
  }
  const said = approvalsOf(run).filter((entry) => entry.status === 'denied' && entry.afterEnd !== true);
  if (said.length > 0) lines.push('', 'You said no (it went on without these):', ...said.map((entry) => `- ${entry.what}${(entry.items ?? []).length > 0 ? ` (item ${entry.items.join(', ')})` : ''}.`));
  // Lab check of point 19: a change you said no to after the end was not made.
  const saidLate = approvalsOf(run).filter((entry) => entry.status === 'denied' && entry.afterEnd === true);
  if (saidLate.length > 0) lines.push('', 'You said no after the end; not changed:', ...saidLate.map((entry) => `- ${line(entry.what, 300).replace(/\.?$/, '.')}`));
  const cannot = approvalsOf(run).filter((entry) => entry.status === 'cannot');
  if (cannot.length > 0) lines.push('', 'Not possible for a Mission\'s helper (do it yourself if it is needed):', ...cannot.map((entry) => `- ${(entry.items ?? []).length > 0 ? `Item ${entry.items.join(', ')}: ` : ''}${entry.what}${entry.addonName ? ` (${entry.addonName})` : ''}.`));
  // Stage E: the repair helper's work, each after a save point.
  const repairs = isLong(run) && Array.isArray(run.long?.repair?.list) ? run.long.repair.list.filter((entry) => entry && entry.status !== 'asked-only') : [];
  if (repairs.length > 0) {
    lines.push('', gone ? 'Repairs (each after a save point):' : 'Repairs (each after a save point; /mission back undoes it):', ...repairs.map((entry) => {
      const at = new Date(Number(entry.at) || 0);
      const time = Number(entry.at) > 0 ? `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}` : '';
      const said = line(entry.text, 600);
      return `- ${time ? `${time}: ` : ''}${line(entry.cause, 200)}.${said ? ` ${said}` : ''}${Number(entry.point) > 0 && !gone ? ` Undo: /mission back ${entry.point}.` : ''}`;
    }));
  }
  // Owner point 19: settings the repair helper changed after your Allow.
  const changedSettings = approvalsOf(run).filter((entry) => entry.kind === 'repair' && entry.status === 'allowed' && entry.changedText);
  if (changedSettings.length > 0) lines.push('', ...changedSettings.map((entry) => line(entry.changedText, 300)));
  // Lab check of point 19: what waits for your OK after the end (Allow makes it; nothing runs again).
  if (oks.length > 0) {
    lines.push('', `Waits for your OK (press "${okButtonWords(oks.length)}" above the chat box; Allow makes the change, nothing runs again):`,
      ...oks.map((entry) => `- ${line(entry.what, 300).replace(/\.?$/, '.')}${entry.status === 'unasked' ? ' (Full auto did not ask it while it ran.)' : ''}${entry.reason ? ` The repair helper said: "${line(entry.reason, 300)}"` : ''}`));
  }
  if (lapsed.length > 0) lines.push('', 'No longer needed (the Mission ended):', ...lapsed.map((entry) => `- ${line(entry.what, 300).replace(/\.?$/, '.')}`));
  // An Allow after the end that came when the setting had already changed since it asked: nothing was changed.
  if (staleLate.length > 0) lines.push('', 'Not changed after your Allow, because the setting had changed since the repair helper asked:', ...staleLate.map((entry) => `- ${line(entry.what, 300).replace(/\.?$/, '.')} It is ${entry.staleNow ?? 'not set'} now.`));
  const suggestedQuestions = suggesting ? (Array.isArray(run.questions) ? run.questions : []).filter((question) => repairQuestion(run, question)) : [];
  if (suggestedQuestions.length > 0) {
    lines.push('', 'The repair helper suggests (nothing waits for these; change them yourself if you agree):',
      ...suggestedQuestions.map((question) => `- ${line(String(question.text ?? '').replace(/ Mission does not change that setting itself\..*$/, ''), 400).replace(/\.?$/, '.')}`));
  }
  const open = (Array.isArray(run.questions) ? run.questions : []).filter((question) => question.status === 'open' && !parkedQuestions.includes(question) && !suggestedQuestions.includes(question));
  if (open.length > 0) lines.push('', needsOf(run) === 'wait' ? 'Questions still open (nothing was decided on them):' : 'Questions still open (the run went on with the default):', ...open.map((question) => `- ${question.text}${question.items?.length ? ` (item ${question.items.join(', ')})` : ''}${question.assume ? `\n  ${needsOf(run) === 'wait' ? 'Its suggestion' : 'Default used'}: ${question.assume}` : ''}`));
  const notes = asksOf(run);
  if (notes.length > 0) lines.push('', 'Your notes to the Mission:', ...notes.map((ask) => `- ${line(ask.text, ASK_MAX)}`));
  const answered = (Array.isArray(run.questions) ? run.questions : []).filter((question) => question.status === 'answered');
  if (answered.length > 0) lines.push('', 'Questions you answered:', ...answered.map((question) => `- ${question.text}\n  Your answer: ${line(question.answer, ASK_MAX)}${askedAgainOf(question, run)}`));
  // Point 17: what Full auto decided itself (the time question too), then what the user left to its judgement.
  const self = (Array.isArray(run.questions) ? run.questions : []).filter((question) => question.status === 'skipped' && question.self === true);
  if (self.length > 0) lines.push('', 'Questions it decided itself (Full auto; Finish it lets you change them):', ...self.map((question) => `- ${question.text}\n  It chose: ${line(question.chosen || question.assume || 'its own judgement', 400)}`));
  const judged = (Array.isArray(run.questions) ? run.questions : []).filter((question) => question.status === 'skipped' && question.self !== true);
  if (judged.length > 0) lines.push('', 'Left to the Mission\'s judgement:', ...judged.map((question) => `- ${question.text}\n  ${question.chosen ? `It chose: ${line(question.chosen, 400)}` : `It went with the default offered: ${question.assume || 'none was given'}`}`));
  if (run.checkpoint && gone) lines.push('', GONE_UNDO_LINE);
  else if (run.checkpoint) lines.push('', `To undo everything this run changed: /mission back ${run.checkpoint}`);
  if (isLong(run) && run.status !== 'running' && continueBlock(run) === '') lines.push('', FINISH_LINE);
  return lines.join('\n');
}

/** Owner point 19: the report's undo line for a run closed because its conversation is gone. */
export const GONE_UNDO_LINE = 'Undo is no longer possible: its thread is gone, and /mission back works only inside it.';
/** A gap at least this long between a gone run's last step and its closing is said in its report. */
export const SAT_UNUSED_MS = 60 * 60_000;

/** @returns {string} a date and time in plain words, as "20 November 2026, 14:05". */
export function dateWords(at) {
  const date = new Date(Number(at) || 0);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}, ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * The minutes the report says a run took: from its start to its end, without the time between an end and a continue,
 * the time it waited for you and the time it waited for its model server. A run closed because its conversation is gone
 * ends at its last logged step (the runner sets endedAt so).
 * @returns {number} at least 1.
 */
export function tookMinutes(run) {
  return Math.max(1, Math.round(((run.endedAt || Date.now()) - run.startedAt - afterEndOf(run) - waitedOf(run) - downOf(run)) / 60000));
}

/** The report's last line when the Mission can be finished (point 17). */
export const FINISH_LINE = 'To finish it: press Finish it above the chat box. It brings back what is still open and what it decided itself; the same Mission then does the rest.';

/** @returns {number} how long a Mission waited for the user, in ms (none of it counts as working time). */
export const waitedOf = (run) => (isLong(run) ? Math.max(0, Number(run.long?.waitedMs) || 0) : 0);
/** @returns {number} how long a Mission waited for its model server, in ms (stage E; none of it counts as working time). */
export const downOf = (run) => (isLong(run) ? Math.max(0, Number(run.long?.downMs) || 0) : 0);

/** @returns {string} the report's line about when it needs you, and Wait for me. */
export function needsLine(run) {
  const needs = needsOf(run);
  if (needs === 'decide') return `When it needs you: ${NEEDS_LABELS.decide}.`;
  const minutes = waitOf(run);
  return `When it needs you: ${NEEDS_LABELS[needs]}; Wait for me: ${minutes > 0 ? `${minutes} minute${minutes === 1 ? '' : 's'}` : 'until you answer'}.`;
}

/**
 * The report's lines for items whose worker asked an answered question again and had no try, or no time or step, left
 * to follow it. A late one is shown while its item still waits to be done again (a continue clears it).
 */
const askedAgainOf = (question, run) => (Array.isArray(question.askedAgain) ? question.askedAgain : [])
  .filter((entry) => entry && entry.item && (!entry.late || run.items.some((item) => item.id === String(entry.item) && item.lateAnswer === question.id)))
  .map((entry) => `\n  Item ${entry.item}: its worker kept asking this after your answer and went with ${line(entry.assumed, 300) || 'its own judgement'} instead. ${entry.late ? 'There was no time or step left to do it your way; Continue the Mission does it again.' : 'It had no tries left to do it your way.'}`)
  .join('');

/** @returns {{at: number, text: string}[]} a run's notes from the user (a Mission's in run.long.asks, an older run's in run.asks). */
const asksOf = (run) => {
  const list = isLong(run) ? run.long?.asks : run?.asks;
  return Array.isArray(list) ? list : [];
};

/**
 * A note you gave a Mission while it works (Add note, or a chat message to a running Mission): kept for its helpers,
 * newest last. Any kind of run that is still on, paused or not.
 * @param {object} run - the run.
 * @param {string} text - what you wrote (at most ASK_MAX characters are kept).
 * @returns {boolean} whether it was kept.
 */
export function addAsk(run, text, at = Date.now()) {
  if (!run || run.status !== 'running') return false;
  const said = clip(text, ASK_MAX);
  if (!said) return false;
  const list = [...asksOf(run), { at, text: said }].slice(-ASKS_KEPT);
  if (isLong(run)) run.long.asks = list;
  else run.asks = list;
  return true;
}

/**
 * The user's notes and answers, for the helpers: answers first, then notes, each newest last; the oldest go first
 * when it is too long (at most USER_NOTES_MAX characters). Both kinds of run.
 * @param {object} run - the run.
 * @returns {string} the block ('' when the user gave none).
 */
export function userNotes(run) {
  if (!run) return '';
  const answers = (Array.isArray(run.questions) ? run.questions : []).filter((question) => question.status === 'answered' && question.answer)
    .sort((a, b) => (a.answeredAt ?? 0) - (b.answeredAt ?? 0))
    .map((question) => `- Question: ${line(question.text, 300)}\n  Answer: ${line(question.answer, ASK_MAX)}`);
  const notes = asksOf(run).map((ask) => `- ${line(ask.text, ASK_MAX)}`);
  // Skipped questions nobody has decided yet (stage C): the helpers decide, and say what they chose.
  const judged = (Array.isArray(run.questions) ? run.questions : []).filter((question) => question.status === 'skipped' && !question.chosen)
    .map((question) => `- ${question.id}: ${line(question.text, 300)}${question.assume ? ` (the default offered: ${line(question.assume, 200)})` : ''}`);
  // Point 17: Full auto's own decisions (so the items agree), and Ask and wait's open questions (a worker whose item
  // depends on one stops and names it).
  const needs = needsOf(run);
  const decided = needs === 'decide' ? (Array.isArray(run.questions) ? run.questions : []).filter((question) => question.status === 'skipped' && question.self === true && question.kind !== 'time')
    .map((question) => `- ${question.id}: ${line(question.text, 300)} Decided: ${line(question.chosen, 200)}`) : [];
  const waitingOn = needs === 'wait' ? openQuestions(run).map((question) => `- ${question.id}: ${line(question.text, 300)}${question.assume ? ` (suggestion: ${line(question.assume, 200)})` : ''}`) : [];
  const build = () => [
    answers.length > 0 ? `Your answers to its questions:\n${answers.join('\n')}` : '',
    judged.length > 0 ? `Left to your judgement by the user (decide what fits the goal best; when your item decides one, add a line "CHOSE <id>: <what you chose>"):\n${judged.join('\n')}` : '',
    decided.length > 0 ? `${DECIDED_FOR_AUTO}\n${decided.join('\n')}` : '',
    waitingOn.length > 0 ? `${OPEN_FOR_WAIT}\n${waitingOn.join('\n')}` : '',
    notes.length > 0 ? `Your notes (newest last):\n${notes.join('\n')}` : '',
    // Stage E: the repair helper's note to every helper.
    isLong(run) && run.long?.repairNote ? `From the Mission's repair helper:\n- ${line(run.long.repairNote, 400)}` : '',
  ].filter(Boolean).join('\n');
  let text = build();
  while (text.length > USER_NOTES_MAX && notes.length + answers.length > 1) {
    if (notes.length > 0) notes.shift();
    else answers.shift();
    text = build();
  }
  return text.slice(0, USER_NOTES_MAX);
}

/**
 * The end of a Mission's brief, for its workers: only when it started from the conversation (Start Mission with little
 * or nothing typed, or a short typed /mission), where the goal alone does not say what to do.
 * @returns {string} at most BRIEF_MAX characters ('' otherwise).
 */
export function briefOf(run) {
  if (!isLong(run) || run.long?.fromThread !== true) return '';
  return clipNewest(run.long.context, BRIEF_MAX);
}

/** @returns {object[]} a run's open questions the user can answer (not the time question), in asking order. */
export const openQuestions = (run) => (Array.isArray(run?.questions) ? run.questions : []).filter((question) => question.status === 'open' && question.kind !== 'time');

/**
 * Your answers to a run's open questions (Answer and continue). Numbered lines ("1." or "1)" followed by a space or
 * the end of the line) go to the open questions in asking order; text without numbers answers every open question,
 * so "18.2" or "2.5 seconds" is a plain answer, never question 18 or 2. The time question is never touched.
 * Items finished on a question's default ("Assumed: …" in their note) are done again with your answer, without
 * using up a try. When there is no step left to do them again (see `answerTooLate`) they keep their result and
 * your answer goes in their note, so the report shows both.
 * @param {object} run - a running run; changed in place.
 * @param {string} text - what you typed.
 * @param {number} [at] - now.
 * @param {{under?: string}} [options] - the kind of the step under way, if any (work, checks, review, hunt).
 * @returns {{answered: string[], reopened: string[], late: string[]}} the questions answered, the items reopened, and
 *   the items an answer came too late for (kept as they were, not reopened).
 */
export function answerQuestions(run, text, at = Date.now(), { under = '' } = {}) {
  const out = { answered: [], reopened: [], late: [] };
  const open = openQuestions(run);
  const said = String(text ?? '').replace(/\r/g, '').trim();
  if (!run || run.status !== 'running' || open.length === 0 || !said) return out;
  const numbered = new Map();
  let current = 0;
  for (const row of said.split('\n')) {
    const found = /^\s*(\d{1,2})[.)](?:\s+|$)(.*)$/.exec(row);
    if (found) {
      current = Number(found[1]);
      numbered.set(current, [...(numbered.get(current) ?? []), found[2]]);
    } else if (current > 0) numbered.set(current, [...numbered.get(current), row]);
  }
  const answers = numbered.size > 0
    ? [...numbered].filter(([n]) => n >= 1 && n <= open.length).map(([n, rows]) => [open[n - 1], rows.join('\n').trim()])
    : open.map((question) => [question, said]);
  const tooLate = answerTooLate(run, at, under);
  for (const [question, answer] of answers) {
    if (!answer) continue;
    answerOne(run, question, answer, { tooLate, at, out });
  }
  // Stage D: items that waited for these answers go on (or keep waiting when no step is left).
  const parked = takeUpParked(run, at, { under });
  if (parked.reopened.length > 0) out.goesOn = parked.reopened;
  if (parked.kept.length > 0) out.keepsWaiting = parked.kept;
  roomFor(run, out.reopened.length);
  return out;
}

/** Room for reopened items, their checks and a review, as reopen() gives (also sends the run back to work). */
const roomFor = (run, count) => {
  if (!(count > 0)) return;
  run.phase = 'work';
  run.limits = { ...run.limits, maxSteps: Math.max(run.limits.maxSteps, run.steps + count * run.limits.maxTries + 4) };
  if (run.reviews >= run.limits.maxReviews) run.reviews = Math.max(0, run.limits.maxReviews - 1);
};

/** The words an item's note gets when an answer came too late to redo it (lateRedo looks for them). */
const TOO_LATE = 'It came too late to do the item again, so it keeps its result with the default.';

/**
 * One answer to one open question (stage B's logic, shared by the typed answers and the questions card). Items finished
 * on the question's default are done again with it, without using up a try; too late, they keep their result, your
 * answer goes in their note, and the question remembers them (`lateItems`) so a continue after the end does them again.
 */
function answerOne(run, question, answer, { tooLate = false, at = Date.now(), out, stuckToo = false }) {
  // Point 17: a question the Mission decided itself (Full auto, or left to it) may be answered after the end (Finish it).
  const wasDecided = decidedQuestion(question);
  const prior = String(question.chosen || question.assume || '');
  question.status = 'answered';
  question.answer = clip(answer, ASK_MAX);
  question.answeredAt = at;
  out.answered.push(question.id);
  // Stage D: items that stopped to wait for this answer get it (they go on once all they wait for is settled).
  noteSettled(run, question.id, { kind: 'answer', ref: question.id, text: line(answer, ASK_MAX), question: line(question.text, 300) });
  const key = questionKey(answer);
  let ids = [...new Set([...(question.items ?? []).map(String), ...(run.items.some((entry) => entry.id === String(question.chosenBy ?? '')) ? [String(question.chosenBy)] : [])])];
  // Full auto's planner or reviewer decided it and named no item: the items whose workers were told to keep to it
  // (review of point 17).
  if (ids.length === 0 && wasDecided && ['plan', 'review'].includes(String(question.chosenBy))) ids = run.items.filter((entry) => (entry.decidedSeen ?? []).includes(String(question.id))).map((entry) => entry.id);
  let matched = 0;
  let changed = 0;
  let relevant = 0;
  for (const id of ids) {
    const item = run.items.find((entry) => entry.id === String(id));
    // A continue after the end (stuckToo) also tries an item that ended NOT FINISHED once more: your answer may be what
    // it lacked (review of stage C). It gets one try again.
    if (item && stuckToo && item.status === 'stuck') {
      item.status = 'open';
      item.tries = Math.max(0, Math.min(item.tries ?? 0, (run.limits?.maxTries ?? 1) - 1));
      item.note = clip(`Your answer: ${line(answer, 300)}`, 400);
      out.reopened.push(item.id);
      changed += 1;
      continue;
    }
    if (!item || !['verified', 'reviewed', 'unverified'].includes(item.status)) continue;
    const own = item.assumedBy && typeof item.assumedBy === 'object' ? item.assumedBy[question.id] : undefined;
    const qualifies = wasDecided || own !== undefined || /(^|\s)Assumed:/.test(item.note ?? '');
    if (!qualifies) continue;
    relevant += 1;
    // Point 17: an answer that says what the item was done on redoes nothing (words compared as questions are).
    const was = typeof own === 'string' && own.trim() ? own : prior;
    if (was && questionKey(was) === key) {
      matched += 1;
      continue;
    }
    changed += 1;
    if (tooLate) {
      // No step is left to do it again: it keeps its result with the default, and the report shows your answer.
      // Kept in a field of its own too, so a review or an undo that rewrites the note does not lose the redo.
      item.lateAnswer = question.id;
      item.note = clip(`${item.note ?? ''} Your answer: ${line(answer, 300)} ${TOO_LATE}`.trim(), 600);
      question.lateItems = [...new Set([...(Array.isArray(question.lateItems) ? question.lateItems : []), item.id])];
      out.late.push(item.id);
      continue;
    }
    item.status = 'open';
    // The redo does not use up a try: the item was done, on a default only you could replace.
    item.tries = Math.max(0, (item.tries ?? 0) - 1);
    item.note = clip(`Your answer: ${line(answer, 300)}`, 400);
    out.reopened.push(item.id);
  }
  // Nothing done again for it: every item was done on what you answered (or, with no item, it decided the same).
  const waitedFor = run.items.some((item) => item.status === 'parked' && (item.parkedOn ?? []).includes(String(question.id)));
  if (changed === 0 && !waitedFor && (matched > 0 || (wasDecided && relevant === 0 && prior && questionKey(prior) === key))) {
    question.sameAsChosen = true;
    // Only when there is one (older callers compare the whole result).
    out.same = [...(Array.isArray(out.same) ? out.same : []), question.id];
  } else delete question.sameAsChosen;
}

// ---- Stage D: items that wait for the user (parked), and approvals parked in the Mission's card ----------------

/** The most approvals that wait for the user at once (answered ones do not count). */
export const APPROVALS_MAX = 40;
/** The most approvals a run keeps in all: past it, the oldest answered ones that nothing needs any more are let go. */
export const APPROVALS_KEEP = 400;
/** The choices of a parked approval, by its kind. */
export const APPROVAL_CHOICES = Object.freeze({
  tool: [{ id: 'item', label: 'Allow for this item' }, { id: 'mission', label: 'Allow for this Mission' }, { id: 'deny', label: 'Deny' }],
  other: [{ id: 'allow', label: 'Allow' }, { id: 'deny', label: 'Deny' }],
});
/** The route's errors for approvals (plain words, shown on the card). */
export const APPROVAL_ERRORS = Object.freeze({
  ended: 'This Mission has ended. Choose in the card and press Answer and continue.',
  gone: 'That approval is not open any more.',
  choice: 'Pick one of the choices on the card.',
  off: 'Tool access is switched off, so this tool cannot be allowed here. Switch it on in Settings → Modes → Tool access.',
  notAsked: 'That step was not asked: Full auto never asks. Allow it with Finish it after the Mission ends.',
  // Stage E.
  addonOff: (name) => `${name} is switched off or not installed, so this cannot be done from here. Nothing was changed.`,
  fixFailed: (reason) => `That change could not be made: ${String(reason ?? '').replace(/\s+/g, ' ').trim().replace(/\.?$/, '.')} Nothing was changed.`,
  busy: 'This is being done already. Look again in a moment.',
  modelGone: 'That model is not in your tier\'s fallback list any more (Settings → Model tiers). Nothing was changed.',
});
/** Stage E: the add-ons whose yes a Mission's helper may need, by their id, and their names as the card says them. */
export const ADDON_NAMES = Object.freeze({ bench: 'Devices', recon: 'Recon', creatorPlus: 'Creator Plus', tuning: 'Tuner Plus' });

/** @returns {object[]} a run's approvals (stage D), as kept. */
const approvalsOf = (run) => (Array.isArray(run?.approvals) ? run.approvals : []);
/** @returns {object[]} the approvals that still wait for the user's answer. */
export const openApprovals = (run) => approvalsOf(run).filter((entry) => entry.status === 'open');
/** @returns {object[]} what Full auto did not ask (point 17): the user may allow it with Finish it after the end. */
export const unaskedApprovals = (run) => approvalsOf(run).filter((entry) => entry.status === 'unasked');

/**
 * Keep an approval a Mission's helper needs (stage D): the same thing asked again while open is the same entry (the
 * asking item added); asked again after a no it is refused (SAID_NO); one that cannot be given to a helper is listed.
 * @param {object} run - the run; changed in place.
 * @param {{kind: string, key: string, what: string, item?: string, by?: string, tool?: string, plain?: string, reason?: string, files?: string[], paths?: string[], outside?: string[], command?: string, cannot?: boolean}} given - what is asked.
 * @param {number} [at] - now.
 * @returns {{entry?: object, how: 'new' | 'same' | 'no' | 'full'}}
 */
export function addApproval(run, given, at = Date.now()) {
  if (!Array.isArray(run.approvals)) run.approvals = [];
  const key = clip(given?.key, 600);
  const item = given?.item ? String(given.item) : '';
  const add = (entry) => {
    if (item && !entry.items.includes(item) && entry.items.length < 20) entry.items.push(item);
    if (!item && given?.by && !entry.by) entry.by = String(given.by);
    // Asked by the plan, the question pass or the review too: there is no item to allow it for.
    if (entry.by) entry.choices = (entry.choices ?? []).filter((choice) => choice.id !== 'item');
  };
  const cannot = given?.cannot === true;
  // Point 17: Full auto keeps what it did not ask as 'unasked' (never open: nobody is asked during the run).
  const unasked = !cannot && given?.unasked === true;
  const same = run.approvals.find((entry) => entry.key === key && entry.status === (cannot ? 'cannot' : unasked ? 'unasked' : 'open'));
  if (same) {
    add(same);
    // A later ask of the same thing may come with a warning the first did not have (outside material read since).
    if (given?.warnings && typeof given.warnings === 'object') {
      for (const name of ['risk', 'recon', 'outside']) {
        const text = line(given.warnings[name], 300);
        if (text) same.warnings = { ...(same.warnings ?? {}), [name]: text };
      }
    }
    return { entry: same, how: 'same' };
  }
  if (!cannot) {
    const last = [...run.approvals].reverse().find((entry) => entry.key === key && entry.status !== 'cannot');
    if (last?.status === 'denied') return { entry: last, how: 'no' };
  }
  // What Full auto did not ask never shows a card during the run: every such step is kept for the report and Finish it
  // (up to APPROVALS_KEEP in all, review of point 17); open ones wait in the card, at most APPROVALS_MAX at once.
  if (unasked ? unaskedApprovals(run).length >= APPROVALS_KEEP : openApprovals(run).length >= APPROVALS_MAX) return { how: 'full' };
  if (run.approvals.length >= APPROVALS_KEEP) compactApprovals(run);
  const kind = ['files', 'outside', 'command', 'tool', 'outside-change', 'repair', 'addon'].includes(given?.kind) ? given.kind : 'command';
  // Ids are never given twice, also after old entries were let go.
  run.approvalSeq = Math.max(Number(run.approvalSeq) || 0, ...run.approvals.map((each) => Number(String(each.id ?? '').slice(1)) || 0)) + 1;
  const entry = {
    id: `a${run.approvalSeq}`, kind, what: line(given?.what, 300), key, items: item ? [item] : [], by: item ? '' : String(given?.by ?? ''),
    status: cannot ? 'cannot' : unasked ? 'unasked' : 'open', choices: cannot ? [] : (kind === 'tool' ? APPROVAL_CHOICES.tool.filter((choice) => item || choice.id !== 'item') : APPROVAL_CHOICES.other).map((choice) => ({ ...choice })),
    // Not asked: an Allow after the end does that step again in the items that finished without it.
    after: unasked ? 'redo' : 'park', askedAt: at, answeredAt: 0, choice: '',
  };
  if (given?.tool) entry.tool = line(given.tool, 128);
  if (given?.plain) entry.plain = line(given.plain, 200);
  if (given?.reason) entry.reason = line(given.reason, 400);
  if (Array.isArray(given?.files)) entry.files = given.files.map((file) => line(file, 400)).slice(0, 40);
  if (Array.isArray(given?.paths)) entry.paths = given.paths.map(String).slice(0, 40);
  if (Array.isArray(given?.outside)) entry.outside = given.outside.map(String).slice(0, 20);
  if (given?.command) entry.command = clip(given.command, 2000);
  // Stage E: a change the repair helper asks for (fix), and a yes another add-on asks for (addon).
  if (kind === 'repair' && given?.fix && typeof given.fix === 'object') entry.fix = JSON.parse(JSON.stringify(given.fix));
  if (kind === 'addon') {
    entry.addon = Object.hasOwn(ADDON_NAMES, given?.addon) ? given.addon : '';
    entry.addonName = ADDON_NAMES[entry.addon] ?? '';
    entry.act = given?.act === true;
    entry.needed = given?.needed !== false;
    entry.used = false;
    if (given?.ref && typeof given.ref === 'object') {
      try {
        const text = JSON.stringify(given.ref);
        if (text.length <= 2000) entry.ref = JSON.parse(text);
      } catch { /* no ref */ }
    }
  }
  if (given?.warnings && typeof given.warnings === 'object') {
    const warnings = Object.fromEntries(['risk', 'recon', 'outside'].map((name) => [name, line(given.warnings[name], 300)]).filter(([, text]) => text));
    if (Object.keys(warnings).length > 0) entry.warnings = warnings;
  }
  run.approvals.push(entry);
  return { entry, how: 'new' };
}

/**
 * Let go of the oldest answered approvals nothing needs any more (no permission to take back, no item waiting for them),
 * allowed and listed ones before refusals (a refusal keeps "asked again after a no" refused), until there is room.
 * @param {object} run - the run; changed in place.
 */
function compactApprovals(run) {
  const waitedFor = new Set(run.items.flatMap((item) => (Array.isArray(item.parkedOn) ? item.parkedOn.map(String) : [])));
  const needed = (entry) => entry.status === 'open' || entry.status === 'unasked' || Boolean(entry.grantId) || (entry.choice === 'item' && !entry.spent) || waitedFor.has(String(entry.id));
  for (const status of ['allowed', 'cannot', 'denied']) {
    while (run.approvals.length >= APPROVALS_KEEP) {
      const at = run.approvals.findIndex((entry) => entry.status === status && !needed(entry));
      if (at < 0) break;
      run.approvals.splice(at, 1);
    }
  }
}

/** @returns {boolean} whether something an item waits for is settled: a question no longer open, an approval answered. */
function settled(run, ref) {
  const id = String(ref ?? '');
  if (/^a\d+$/.test(id)) return approvalsOf(run).find((entry) => entry.id === id)?.status !== 'open';
  const question = (Array.isArray(run.questions) ? run.questions : []).find((entry) => entry.id === id);
  return !question || question.status !== 'open';
}

/** What an item that waits for `ref` is told when it goes on (kept in item.resume until it settles). */
function noteSettled(run, ref, answer) {
  for (const item of run.items) {
    if (item.status !== 'parked' || !(item.parkedOn ?? []).includes(String(ref))) continue;
    if (!item.resume || typeof item.resume !== 'object') item.resume = { report: item.report ?? '', answers: [] };
    item.resume.answers = [...(item.resume.answers ?? []).filter((entry) => entry.ref !== String(ref)), { ...answer }].slice(-20);
  }
}

/** @returns {object[]} parked items whose questions and approvals are all settled (they go on at the next chance). */
export function settledParked(run) {
  return (run?.items ?? []).filter((item) => item.status === 'parked' && (item.parkedOn ?? []).every((ref) => settled(run, ref)));
}

/**
 * Parked items whose questions and approvals are all settled go on: open again, first in the queue, with what the
 * user said. With no step left to do them (answerTooLate), they stay parked; a continue does them.
 * @param {object} run - the run; changed in place.
 * @param {number} [at] - now.
 * @param {{under?: string | string[], force?: boolean}} [options] - the live lanes' kinds; force: a continue (never too late).
 * @returns {{reopened: string[], kept: string[]}}
 */
export function takeUpParked(run, at = Date.now(), { under = '', force = false } = {}) {
  const out = { reopened: [], kept: [] };
  for (const item of settledParked(run)) {
    item.status = 'open';
    if (!force && run.status === 'running' && answerTooLate(run, at, under)) {
      item.status = 'parked';
      out.kept.push(item.id);
      continue;
    }
    if (!item.resume || typeof item.resume !== 'object') item.resume = { report: item.report ?? '', answers: [] };
    delete item.parkedOn;
    item.resumeAt = at;
    item.note = 'It goes on with what you said, from where it stopped.';
    out.reopened.push(item.id);
  }
  if (out.reopened.length > 0) roomFor(run, out.reopened.length);
  return out;
}

/**
 * The user's answer to a parked approval (stage D). Allow: items that stopped for it go on; an item that was done
 * except this step is opened again (no try used) to do only that. Deny: they go on without it.
 * @param {object} run - the run; changed in place.
 * @param {string} id - the approval.
 * @param {string} choice - one of its choices' ids.
 * @param {{at?: number, grantId?: string, under?: string | string[], force?: boolean}} [options]
 * @returns {{entry: object, already?: boolean, reopened: string[], kept: string[]}} throws APPROVAL_ERRORS.gone or .choice.
 */
export function decideApproval(run, id, choice, { at = Date.now(), grantId = '', under = '', force = false } = {}) {
  const entry = approvalsOf(run).find((each) => each.id === String(id ?? ''));
  if (!entry || entry.status === 'cannot') throw new Error(APPROVAL_ERRORS.gone);
  // Point 17: what Full auto did not ask is answered only with Finish it, after the end (force).
  const notAsked = entry.status === 'unasked';
  if (notAsked && !force) throw new Error(APPROVAL_ERRORS.notAsked);
  if (entry.status !== 'open' && !notAsked) return { entry, already: true, reopened: [], kept: [] };
  if (!(entry.choices ?? []).some((each) => each.id === choice)) throw new Error(APPROVAL_ERRORS.choice);
  // "For this item" needs an item that asked, and only items asked (never the plan or the review).
  if (choice === 'item' && (!(entry.items ?? []).length || entry.by)) throw new Error(APPROVAL_ERRORS.choice);
  const allowed = choice !== 'deny';
  entry.status = allowed ? 'allowed' : 'denied';
  entry.choice = choice;
  entry.answeredAt = at;
  if (grantId) entry.grantId = String(grantId);
  const what = entry.kind === 'tool' ? entry.plain || entry.tool || entry.what : entry.what;
  noteSettled(run, entry.id, { kind: allowed ? 'allowed' : 'denied', ref: entry.id, text: what, ...(entry.kind === 'tool' && allowed ? { tool: entry.tool ?? '', scope: choice } : {}), ...(entry.kind === 'command' && allowed && entry.command ? { command: entry.command } : {}) });
  const out = takeUpParked(run, at, { under, force });
  if (allowed && entry.after === 'redo') {
    for (const itemId of entry.items ?? []) {
      const item = run.items.find((each) => each.id === String(itemId));
      if (item && redoAllowed(run, item, [entry], at)) out.reopened.push(item.id);
    }
    roomFor(run, out.reopened.length);
  }
  // Point 17: items Full auto set aside without this yes. Allow: taken up again (the try that stopped does not count).
  // Deny: they cannot be done without it.
  if (notAsked) {
    for (const item of run.items) {
      if (item.status !== 'aside' || !(item.asideOn ?? []).includes(entry.id)) continue;
      if (allowed) {
        item.status = 'open';
        item.tries = Math.max(0, (item.tries ?? 0) - 1);
        item.resume = { report: item.report ?? '', answers: [{ kind: 'allowed', ref: entry.id, text: what, ...(entry.kind === 'tool' ? { tool: entry.tool ?? '', scope: choice } : {}), ...(entry.kind === 'command' && entry.command ? { command: entry.command } : {}) }] };
        item.resumeAt = at;
        item.note = clip(`You allowed: ${what}. It is taken up again.`, 400);
        delete item.asideOn;
        out.reopened.push(item.id);
      } else {
        item.status = 'stuck';
        item.note = clip(`You said no to: ${what}; it could not be done without it.`, 400);
      }
    }
    roomFor(run, out.reopened.length);
  }
  return { entry, ...out };
}

/**
 * An item that was done except steps you allowed (stage D): opened again to do only those steps; the try it takes is not
 * counted. Used for a late Allow (after its helper finished) and for an Allow that came while its helper still worked.
 * @param {object} run - the run; changed in place.
 * @param {object} item - the item (verified, reviewed or unverified; anything else is left alone).
 * @param {object[]} entries - the allowed approvals.
 * @param {number} [at] - now.
 * @returns {boolean} whether it was opened again.
 */
export function redoAllowed(run, item, entries, at = Date.now()) {
  const list = (entries ?? []).filter((entry) => entry && entry.status === 'allowed');
  if (!item || list.length === 0 || !['verified', 'reviewed', 'unverified'].includes(item.status)) return false;
  const whatOf = (entry) => (entry.kind === 'tool' ? entry.plain || entry.tool || entry.what : entry.what);
  item.status = 'open';
  item.tries = Math.max(0, (item.tries ?? 0) - 1);
  item.resume = { report: item.report ?? '', answers: list.map((entry) => ({ kind: 'redo', ref: entry.id, text: whatOf(entry), ...(entry.kind === 'command' && entry.command ? { command: entry.command } : {}) })) };
  item.resumeAt = at;
  item.note = clip(`You allowed: ${list.map(whatOf).join('; ')}. It does that step now.`, 400);
  roomFor(run, 1);
  return true;
}

/** The most answers the questions card sends at once, and the error texts of a card answer. */
export const ANSWERS_MAX = 40;
export const ANSWER_ERRORS = Object.freeze({
  empty: 'Fill in an answer, press Skip or pick a time first. Empty fields keep their default.',
  noLimit: 'This Mission has no time limit any more, so there is no time to choose.',
  stale: 'Those questions were already answered or are no longer open.',
});

/**
 * The questions card's answers, read and checked (stage C): at most ANSWERS_MAX, text clipped to ASK_MAX, skip wins over
 * text, a time choice only for the open time question, an empty entry ignored. Throws a plain Error (ANSWER_ERRORS) when
 * nothing can be taken; changes nothing.
 * @param {object} run - the run.
 * @param {unknown} answers - `[{id, text?, skip?, time?}]`.
 * @param {{times?: boolean}} [options] - whether time choices count (not after the end).
 * @returns {{question: object, text?: string, skip?: true, time?: string}[]} what will be taken, in order.
 */
export function readAnswers(run, answers, { times = true, decided = false } = {}) {
  const list = (Array.isArray(answers) ? answers : []).slice(0, ANSWERS_MAX).filter((entry) => entry && typeof entry === 'object');
  const filled = [];
  let any = false;
  let timeWithoutLimit = false;
  for (const entry of list) {
    const text = clip(entry.text, ASK_MAX);
    const skip = entry.skip === true;
    const time = times && ['keep', 'more', 'none'].includes(entry.time) ? entry.time : '';
    if (!text && !skip && !time) continue;
    any = true;
    const all = Array.isArray(run?.questions) ? run.questions : [];
    // Point 17 (Finish it): a question the Mission decided itself may be answered too, with text only.
    const own = decided ? all.find((each) => each.id === String(entry.id ?? '') && decidedQuestion(each)) : undefined;
    if (own) {
      if (text && !filled.some((each) => each.question === own)) filled.push({ question: own, text, decided: true });
      continue;
    }
    const question = all.find((each) => each.id === String(entry.id ?? '') && each.status === 'open');
    if (!question) continue;
    if (question.kind === 'time') {
      if (!time) continue;
      if (!(isLong(run) && run.long.deadline > 0)) {
        timeWithoutLimit = true;
        continue;
      }
      if (!filled.some((each) => each.question === question)) filled.push({ question, time });
      continue;
    }
    if (filled.some((each) => each.question === question)) continue;
    if (skip) filled.push({ question, skip: true });
    else if (text) filled.push({ question, text });
  }
  if (!any) throw new Error(ANSWER_ERRORS.empty);
  if (filled.length === 0) throw new Error(timeWithoutLimit ? ANSWER_ERRORS.noLimit : ANSWER_ERRORS.stale);
  return filled;
}

/**
 * The questions card's answers, by question id (stage C). Text answers work as typed ones do (answerOne); a skip
 * leaves the question to the Mission's judgement (for a question an item asked, the item's own assumption already was
 * that judgement, so nothing is redone); a time choice goes to chooseTime.
 * @param {object} run - the run; changed in place.
 * @param {unknown} answers - `[{id, text?, skip?, time?}]`.
 * @param {number} [at] - now.
 * @param {{under?: string, force?: boolean}} [options] - the step under way; `force` (a continue after the end) never
 *   counts an answer as too late and takes no time choice.
 * @returns {{answered: string[], skipped: string[], timeChoice: string, timeAdded: number, reopened: string[], late: string[]}}
 */
export function answerMany(run, answers, at = Date.now(), { under = '', force = false } = {}) {
  const taken = readAnswers(run, answers, { times: !force, decided: force });
  const out = { answered: [], skipped: [], timeChoice: '', timeAdded: 0, reopened: [], late: [] };
  const tooLate = !force && answerTooLate(run, at, under);
  for (const entry of taken) {
    const { question } = entry;
    if (entry.time) {
      out.timeAdded = chooseTime(run, question, entry.time, at);
      out.timeChoice = entry.time;
    } else if (entry.skip) {
      question.status = 'skipped';
      question.skippedAt = at;
      if ((question.items ?? []).length > 0 && !(question.parks ?? []).length) {
        // The item already finished on its helper's own assumption: that was the Mission's judgement.
        question.chosen = question.assume || 'its own judgement (the helper named no default)';
        question.chosenBy = String(question.items[0]);
      }
      // Stage D: an item that stopped for it goes on and decides it itself.
      noteSettled(run, question.id, { kind: 'skip', ref: question.id, text: '', question: line(question.text, 300) });
      out.skipped.push(question.id);
    } else answerOne(run, question, entry.text, { tooLate, at, out, stuckToo: force });
  }
  // Stage D: items that waited for these answers go on (or keep waiting when no step is left).
  const parked = takeUpParked(run, at, { under, force });
  if (parked.reopened.length > 0) out.goesOn = parked.reopened;
  if (parked.kept.length > 0) out.keepsWaiting = parked.kept;
  roomFor(run, out.reopened.length);
  return out;
}

/** The answers the time question records. */
export const TIME_ANSWERS = Object.freeze({ keep: 'Keep the time limit; do the most important items first and list the rest.', none: 'No time limit.' });

/**
 * The owner's choice on the too-little-time question (stage C): keep the limit, give it the extra minutes it
 * recommends (moved on from the deadline), or no time limit.
 * @param {object} run - a running Mission with a time limit; changed in place.
 * @param {object} question - the open time question.
 * @param {'keep' | 'more' | 'none'} choice - what was picked.
 * @param {number} [at] - now.
 * @returns {number} the minutes added (0 for keep and none).
 */
export function chooseTime(run, question, choice, at = Date.now()) {
  if (!(isLong(run) && run.long.deadline > 0)) throw new Error(ANSWER_ERRORS.noLimit);
  const L = run.long;
  let added = 0;
  let answer = TIME_ANSWERS.keep;
  if (choice === 'more') {
    added = Number(question.extra) > 0 ? Math.round(question.extra) : Math.max(10, Math.round(Number(question.recommend) || 10));
    L.deadline += added * 60000;
    L.minutes = (Number(L.minutes) || 0) + added;
    answer = `Give it about ${added} more minutes.`;
  } else if (choice === 'none') {
    L.deadline = 0;
    L.fullTime = false;
    answer = TIME_ANSWERS.none;
  }
  question.status = 'answered';
  question.answer = answer;
  question.answeredAt = at;
  question.choice = choice;
  return added;
}

/** @returns {number} ms between an end and a continue, which is not working time. */
export const afterEndOf = (run) => (isLong(run) ? Math.max(0, Number(run.long?.afterEndMs) || 0) : 0);

/** @returns {number} how long a run worked, in ms: without paused time and without the time between an end and a continue. */
export function workedMs(run, now = Date.now()) {
  const paused = isLong(run) ? Math.max(0, Number(run.long?.pausedMs) || 0) : 0;
  return Math.max(0, (run.endedAt || now) - run.startedAt - paused - afterEndOf(run) - waitedOf(run));
}

/**
 * Answers that came too late and whose items still keep the default's result (stage C): a continue does them again.
 * @returns {{item: object, question: object}[]}
 */
function lateEntries(run) {
  const out = [];
  for (const question of Array.isArray(run?.questions) ? run.questions : []) {
    if (question.status !== 'answered' || !Array.isArray(question.lateItems)) continue;
    for (const id of question.lateItems) {
      const item = (run.items ?? []).find((entry) => entry.id === String(id));
      if (!item) continue;
      // Marked by its field (a review or an undo may have rewritten its note since), or by its note (before the field).
      const marked = item.lateAnswer === question.id ? ['verified', 'reviewed', 'unverified', 'open', 'stuck'].includes(item.status) : ['verified', 'reviewed', 'unverified'].includes(item.status) && String(item.note ?? '').includes('came too late');
      if (!marked) continue;
      if (!out.some((entry) => entry.item === item)) out.push({ item, question });
    }
  }
  return out;
}

/** @returns {string[]} the items an answer came too late for, still to be done again. */
export const lateRedo = (run) => lateEntries(run).map((entry) => entry.item.id);

/** @returns {{id: string, text: string, answer: string, items: string[]}[]} the answers that came too late, with their items still to redo. */
export function lateAnswers(run) {
  const left = new Set(lateRedo(run));
  return (Array.isArray(run?.questions) ? run.questions : [])
    .filter((question) => question.status === 'answered' && Array.isArray(question.lateItems) && question.lateItems.some((id) => left.has(String(id))))
    .map((question) => ({ id: question.id, text: question.text, answer: question.answer ?? '', items: question.lateItems.filter((id) => left.has(String(id))).map(String) }));
}

/** The reason a run ended with End (stage C: End stays final unless it still has questions for you). */
export const ENDED_BY_YOU = 'You ended it.';

/**
 * Items of an ended Mission that wait for your yes and may be taken up again by a continue (typed /mission resume
 * <minutes>): not after End, not when its conversation is gone or its allowance is used up.
 * @returns {number} how many items wait (0: none may be taken up).
 */
export function asideWaiting(run) {
  if (!run || run.status === 'running' || !isLong(run) || run.stopReason === ENDED_BY_YOU) return 0;
  const block = continueBlock(run);
  if (block === 'gone' || block === 'allowance' || block === 'not-long') return 0;
  return run.items.filter((item) => item.status === 'aside').length;
}

/** The reason a run that ended was closed because its conversation was deleted (runner reconcile). */
export const CONVERSATION_GONE = 'Its thread is gone.';
/** Stage 7: runs saved before keep the old words as their stop reason; both mean the thread is gone. */
const goneReason = (reason) => reason === CONVERSATION_GONE || reason === 'Its conversation is gone.';

/**
 * Why an ended run cannot be continued (stage C), '' when it can: a Mission of this version, ended, with open questions
 * or answers that came too late, not closed because its conversation is gone, and not out of its token allowance.
 * Whether its record is still there is the runner's to check.
 * @returns {'' | 'running' | 'not-long' | 'gone' | 'allowance' | 'nothing'}
 */
export function continueBlock(run) {
  if (!run) return 'nothing';
  if (run.status === 'running') return 'running';
  if (!isLong(run)) return 'not-long';
  if (goneReason(run.stopReason)) return 'gone';
  if (Number(run.long?.tokenCap) > 0 && (run.tokens ?? 0) >= run.long.tokenCap) return 'allowance';
  // Stage C's rule (End stays final: only questions, late answers and approvals still open for you continue it).
  // Owner point 19: the repair helper's suggestions (a setting it asks you to change, with no item waiting on it) change
  // no work, so they alone never make an ended Mission one to finish; they are listed in its report.
  const questions = openQuestions(run).filter((question) => !repairQuestion(run, question));
  const approvals = openApprovals(run).filter((entry) => !repairAsk(entry));
  if (questions.length > 0 || lateRedo(run).length > 0 || approvals.length > 0 || settledParked(run).length > 0) return '';
  if (run.stopReason === ENDED_BY_YOU) return 'nothing';
  // Point 17 (Finish it): also what it decided itself, what Full auto did not ask, and items not done yet.
  if (decidedQuestions(run).some((question) => !(question.from === 'repair' && !((question.items ?? []).length > 0))) || unaskedApprovals(run).some((entry) => !repairAsk(entry)) || run.items.some((item) => item.status === 'open')) return '';
  return 'nothing';
}

/**
 * Owner point 19: a question of the repair helper that no item waits on (it suggests a change you make yourself).
 * @returns {boolean}
 */
export const repairQuestion = (run, question) => question?.from === 'repair' && question.status === 'open' && !((question.items ?? []).length > 0)
  && !(run?.items ?? []).some((item) => (item.parkedOn ?? []).map(String).includes(String(question.id)));
/**
 * Owner point 19: a change the repair helper asks your yes for (Calls at once, a fallback model, a setting, a Budget raise)
 * that no item waits on, still open or not asked.
 * @returns {boolean}
 */
export const repairAsk = (entry) => entry?.kind === 'repair' && entry.by === 'repair' && !((entry.items ?? []).length > 0) && ['open', 'unasked'].includes(entry.status);

/**
 * Lab check of point 19 (20 November 2026): the repair helper's changes that still mean something after the Mission
 * ended: a setting, Calls at once and the Budget guard's Mission allowance are settings of the app, so they stay
 * answerable with Allow / Deny after the end. A fallback model is only for this Mission's helpers until it ends, so it
 * lapses at the end ("No longer needed").
 */
export const OK_AFTER_END = Object.freeze(['setting', 'calls', 'budget']);
/** The strip's button for them, and the words the report points to. */
export const okButtonWords = (count) => (count === 1 ? '1 change waits for your OK' : `${count} changes wait for your OK`);

/**
 * The repair helper's changes that wait for your OK after the end (owner point 19): asked (open) or, in Full auto,
 * not asked (unasked), with no item waiting on them, of a kind that still means something now. Never while it runs (the
 * card answers them then) and never once its conversation is gone. They never make a Mission one to finish.
 * @returns {object[]} the approvals.
 */
export function pendingOks(run) {
  if (!run || run.status === 'running' || !isLong(run) || goneReason(run.stopReason)) return [];
  const held = new Set((run.items ?? []).flatMap((item) => [...(item.parkedOn ?? []), ...(item.asideOn ?? [])].map(String)));
  return approvalsOf(run).filter((entry) => repairAsk(entry) && OK_AFTER_END.includes(entry.fix?.kind) && !held.has(String(entry.id)));
}

/**
 * At the end: the repair helper's asks that mean nothing once the Mission has ended (a fallback model for its helpers)
 * lapse; the report lists them as no longer needed. @returns {number} how many lapsed.
 */
export function lapseAtEnd(run, at = Date.now()) {
  let count = 0;
  for (const entry of approvalsOf(run)) {
    if (!repairAsk(entry) || OK_AFTER_END.includes(entry.fix?.kind)) continue;
    entry.status = 'lapsed';
    entry.answeredAt = at;
    count += 1;
  }
  return count;
}

/** The report's line for a change made after your Allow (Calls at once and the Budget guard; a setting has its own). */
export function okChangedText(entry) {
  const fix = entry?.fix ?? {};
  const count = (value) => Number(value).toLocaleString('en-US');
  if (fix.kind === 'calls') return `Changed after your Allow: Mission → Calls at once for ${fix.provider}: ${fix.from ?? 'not set'} → ${fix.to}.`;
  if (fix.kind === 'budget') return `Changed after your Allow: Budget guard → Mission ${fix.limit}: ${count(fix.from)} → ${count(fix.to)}.`;
  return `Changed after your Allow: ${String(entry?.what ?? '').replace(/\.?$/, '.')}`;
}

/**
 * Your Allow or Deny for a change that waits for your OK after the end: only its own status changes. No item is taken
 * up again and the Mission stays as it ended (complete stays complete).
 * @returns {{entry: object, already?: boolean}} throws APPROVAL_ERRORS.gone or .choice.
 */
export function decideOk(run, id, choice, at = Date.now(), { now } = {}) {
  const entry = approvalsOf(run).find((each) => each.id === String(id ?? ''));
  if (entry && ['allowed', 'denied'].includes(entry.status)) return { entry, already: true };
  if (!entry || !pendingOks(run).includes(entry)) throw new Error(APPROVAL_ERRORS.gone);
  // An Allow that came after the setting had changed since the repair helper asked ('stale'): nothing is changed, and
  // the entry is no longer needed (the report says what the setting is now).
  if (choice === 'stale') {
    entry.status = 'lapsed';
    entry.choice = 'allow';
    entry.answeredAt = at;
    entry.afterEnd = true;
    entry.staleNow = now === undefined || now === null ? 'not set' : String(now).slice(0, 40);
    return { entry };
  }
  if (!(entry.choices ?? []).some((each) => each.id === choice)) throw new Error(APPROVAL_ERRORS.choice);
  entry.status = choice === 'deny' ? 'denied' : 'allowed';
  entry.choice = choice;
  entry.answeredAt = at;
  entry.afterEnd = true;
  return { entry };
}

/** The least and most minutes a continue may be given (0 is no time limit). */
export const CONTINUE_RANGE = [10, 720];
/** Minutes per item to do when a run could not measure its own time. */
export const UNMEASURED_ITEM_MINUTES = 10;

/**
 * How much more time a continue needs, worked out before it starts (stage C), from a dry run of the answers.
 *   measured (an item was tried and it worked a minute or more): its own minutes per item tried, times the items
 *     to do (reopened by the answers, answered too late, not done yet); at least 10;
 *   not measured: 10 for each item of the answered questions and each late one (10 for an answered question without
 *     items), plus 10 for each item not done yet;
 *   capped at a quarter of its first time limit, at least 10 and at most 30 (30 with no first limit); at least one of
 *     its steps (then `raised`).
 * @param {object} run - an ended Mission.
 * @param {unknown} answers - the card's answers.
 * @param {number} [now] - now.
 * @returns {{run: boolean, minutes: number, needed: number, noLimit: boolean, perItem: number, measured: boolean, units: number, cap: number, capped: boolean, stepMinutes: number, raised: boolean, late: number}}
 */
export function extraTime(run, answers, now = Date.now(), approvals = []) {
  const L = run.long ?? {};
  const worked = workedMs(run, now);
  const triedItems = run.items.filter(tried);
  const measured = triedItems.length > 0 && worked >= 60000;
  const perItem = measured ? worked / 60000 / triedItems.length : 0;
  // A dry run of the answers on a copy: which items they would reopen.
  const copy = structuredClone(run);
  copy.status = 'running';
  let dry = { answered: [], skipped: [], reopened: [], same: [] };
  try {
    dry = answerMany(copy, answers, now, { force: true });
  } catch {
    /* nothing taken: only the late answers and the left items count */
  }
  // Stage D: approvals answered with the continue take their items up again too, and parked items already settled.
  for (const choice of Array.isArray(approvals) ? approvals.slice(0, APPROVALS_MAX) : []) {
    try {
      const done = decideApproval(copy, String(choice?.id ?? ''), String(choice?.choice ?? ''), { at: now, force: true });
      dry.reopened = [...new Set([...dry.reopened, ...done.reopened])];
    } catch {
      /* not an open approval: nothing to do for it */
    }
  }
  dry.reopened = [...new Set([...dry.reopened, ...(dry.goesOn ?? []), ...takeUpParked(copy, now, { force: true }).reopened])];
  const late = lateRedo(run);
  // Point 17: an item Full auto set aside counts only when it would be taken up (its yes given, or none needed).
  const left = run.items.filter((item) => item.status === 'open' || (item.status === 'aside' && asideReopens(copy, copy.items.find((each) => each.id === item.id) ?? item))).map((item) => item.id);
  const redo = new Set([...dry.reopened, ...late, ...left]);
  // Answers that say what was done (point 17) need no time.
  const counted = dry.answered.filter((id) => !(dry.same ?? []).includes(id));
  const units = redo.size > 0 ? redo.size : counted.length > 0 ? 1 : 0;
  const firstMinutes = Number.isFinite(Number(L.firstMinutes)) ? Number(L.firstMinutes) : Number(L.minutes) || 0;
  const cap = firstMinutes > 0 ? Math.max(10, Math.min(30, Math.ceil(firstMinutes / 4))) : 30;
  const typical = medianStep(run);
  const stepMinutes = typical > 0 ? Math.ceil(typical / 60000) : 0;
  const base = { measured, perItem: Math.round(perItem * 10) / 10, units, cap, stepMinutes, late: late.length, noLimit: firstMinutes === 0 };
  if (units === 0) return { ...base, run: false, minutes: 0, needed: 0, capped: false, raised: false };
  let needed;
  if (measured) needed = Math.max(10, Math.ceil(perItem * units));
  else {
    const answeredQuestions = copy.questions.filter((question) => dry.answered.includes(question.id));
    const asked = new Set([...answeredQuestions.flatMap((question) => (question.items ?? []).map(String)), ...late]);
    const bare = answeredQuestions.filter((question) => (question.items ?? []).length === 0).length;
    const others = left.filter((id) => !asked.has(id)).length;
    needed = Math.max(10, UNMEASURED_ITEM_MINUTES * (asked.size + bare) + UNMEASURED_ITEM_MINUTES * others);
  }
  let minutes = Math.min(needed, cap);
  let raised = false;
  if (stepMinutes > 0 && minutes <= stepMinutes) {
    minutes = stepMinutes + 1;
    raised = true;
  }
  return { ...base, run: true, minutes, needed, capped: needed > cap, raised };
}

/**
 * Take an ended Mission up again (stage C, a continue after the end): the same run, running, with the time given (0:
 * no time limit). Items that waited for your yes and items whose answer came too late are open again (no try used);
 * room is made for the work; the time between the end and now does not count; it does that work, its checks and one
 * review, then ends. The answers themselves are given after it (answerMany with force).
 * @param {object} run - an ended Mission; changed in place.
 * @param {{minutes: number, at?: number, answered?: number, skipped?: number, checkpoint?: number, units?: number}} given - what the continue gives it.
 * @returns {object} the run.
 */
/**
 * Whether a continue takes up an item that waited for the user's yes: one from before point 17 (no asideOn) always; one
 * Full auto set aside only once a yes it lacked was given (decideApproval may have opened it already).
 */
export function asideReopens(run, item) {
  if (!item || item.status !== 'aside') return item?.status === 'open';
  const ids = Array.isArray(item.asideOn) ? item.asideOn.map(String) : [];
  if (ids.length === 0) return true;
  return approvalsOf(run).some((entry) => ids.includes(String(entry.id)) && entry.status === 'allowed');
}

export function reviveRun(run, { minutes = 0, at = Date.now(), answered = 0, skipped = 0, allowed = 0, checkpoint = 0, units = 1 } = {}) {
  const L = run.long;
  // Point 17: a wait that was on when it ended is over, and the end's kind goes (the same choice and wait go on).
  delete L.waitOver;
  delete L.quietGoal;
  delete L.waitingSince;
  run.longEndKind = '';
  // Stage E: a continue starts a fresh count of the wait for the model server.
  delete L.down;
  delete L.downFirst;
  delete L.downTries;
  delete L.probing;
  delete L.fallbackAsked;
  delete run.carryPending;
  L.afterEndMs = afterEndOf(run) + Math.max(0, at - (run.endedAt || at));
  // A restart before its first step pauses it from its last step: that is now, never a time before the end (which
  // afterEndMs already leaves out, review of stage C).
  run.lastStepAt = at;
  run.status = 'running';
  run.phase = 'work';
  run.endedAt = 0;
  run.stopReason = '';
  run.longEnd = '';
  run.cutByTime = '';
  run.reviewRetry = '';
  run.goalClosePending = false;
  run.pausedAt = 0;
  run.pausedBy = '';
  run.stalled = '';
  run.stalledDetails = '';
  run.errors = 0;
  run.failStreak = 0;
  run.selfStops = 0;
  for (const item of run.items) {
    if (item.status !== 'aside' || !asideReopens(run, item)) continue;
    item.status = 'open';
    item.tries = Math.max(0, (item.tries ?? 0) - 1);
    delete item.asideOn;
  }
  for (const { item, question } of lateEntries(run)) {
    item.status = 'open';
    item.tries = Math.max(0, Math.min((item.tries ?? 0) - 1, (run.limits?.maxTries ?? 1) - 1));
    delete item.lateAnswer;
    item.note = clip(`Your answer: ${line(question.answer, 300)} (given too late before; done again now)`, 400);
  }
  L.deadline = minutes > 0 ? at + minutes * 60000 : 0;
  if (!(minutes > 0)) L.fullTime = false;
  L.finishLap = false;
  L.lapEnded = false;
  L.emptyLaps = 0;
  L.hunting = false;
  L.lapPoint = 0;
  L.continueLap = true;
  if (L.laps > 0 && L.lap >= L.laps) L.laps = L.lap + 1;
  run.limits = { ...run.limits, maxSteps: Math.max(run.limits.maxSteps, run.steps + Math.max(1, units) * run.limits.maxTries + 4) };
  if (run.reviews >= run.limits.maxReviews) run.reviews = Math.max(0, run.limits.maxReviews - 1);
  L.continues = [...(Array.isArray(L.continues) ? L.continues : []), { at, minutes: minutes > 0 ? minutes : 0, answered, skipped, allowed: Number(allowed) || 0, checkpoint: Number(checkpoint) || 0 }];
  for (const question of Array.isArray(run.questions) ? run.questions : []) {
    if (question.kind === 'time' && question.status === 'open') {
      question.status = 'closed';
      question.closedWhy = 'time given after the end';
    }
  }
  // Stage D: items that waited for answers given since (too late before, or with this continue) go on; the rest wait.
  takeUpParked(run, at, { force: true });
  return run;
}

/**
 * Whether an answer comes too late to do an item again: no work step will come before the run ends. That is when the
 * last lap already ended; when the step under way (or the next one) is the last lap's checks or review, or the end;
 * or when its time is up, or less is left than one of its steps usually takes.
 * @param {object} run - a running run.
 * @param {number} at - now.
 * @param {string} [under] - the kind of the step under way, if any.
 * @returns {boolean}
 */
export function answerTooLate(run, at, under = '') {
  if (!isLong(run)) return false;
  const L = run.long;
  // Point 17: an answer that comes while the Mission waits for it is never too late: what it frees starts a new pass
  // (otherwise the items would stay parked and it would wait for ever).
  // So is one that comes after Wait for me ran out, before its report round (review of point 17).
  if (Number(L.waitingSince) > 0 || L.waitOver === true) return false;
  // A paused run's time stands still (its deadline moves on when it resumes): judged at the moment it was paused.
  at = clockAt(run, at);
  const lastLap = Boolean(L.finishLap) || (L.laps > 0 && L.lap + 1 >= L.laps);
  if (L.lapEnded && (L.finishLap || (L.laps > 0 && L.lap >= L.laps))) return true;
  if (L.deadline > 0) {
    if (at >= L.deadline) return true;
    const typical = medianStep(run);
    if (typical > 0 && L.deadline - at < typical) return true;
  }
  // Stage D: the kinds of every live lane (work lanes still running mean another work step comes).
  const live = Array.isArray(under) ? under.map(String).filter(Boolean) : [];
  if (Array.isArray(under) && live.length > 0) return lastLap && live.some((kind) => kind === 'checks' || kind === 'review' || kind === 'hunt');
  const ahead = (typeof under === 'string' && under) || nextStep(run, at).kind;
  if (ahead === 'finish' || ahead === 'done') return true;
  return lastLap && (ahead === 'checks' || ahead === 'review' || ahead === 'hunt');
}

/**
 * A run was paused (by you, by a problem, or by a restart): from now on its time does not count.
 * @param {object} run - the run; changed in place.
 * @param {number} [at] - when it was paused; an earlier pause is kept.
 */
export function pauseRun(run, at = Date.now()) {
  // A wait for the user ends where the pause begins (each span counted once).
  if (isLong(run) && Number(run.long?.waitingSince) > 0) closeWait(run, Math.max(Number(run.long.waitingSince), at));
  // Stage E: so does a wait for the model server (Resume tries again; the time waited never counts).
  if (isLong(run) && run.long?.down) closeDown(run, Math.max(Number(run.long.down.since) || 0, at));
  if (run && !run.pausedAt) run.pausedAt = at;
}

/**
 * A paused run carries on: the time it was paused is added to a Long run's deadline and to its paused total.
 * @param {object} run - the run; changed in place.
 * @param {number} [at] - now.
 * @returns {number} the paused span in ms (0 when it was not paused).
 */
export function unpauseRun(run, at = Date.now()) {
  if (run && run.pausedBy) run.pausedBy = '';
  if (!run?.pausedAt) return 0;
  const span = Math.max(0, at - run.pausedAt);
  run.pausedAt = 0;
  if (isLong(run) && span > 0) {
    // A Mission with no time limit keeps deadline 0: only the paused total grows.
    if (run.long.deadline > 0) run.long.deadline += span;
    run.long.pausedMs = (Number(run.long.pausedMs) || 0) + span;
  }
  return span;
}

/** Minutes one item is taken to need until the run has measured its own (a worker, its check, a share of the review). */
export const ITEM_MINUTES = 5;

/**
 * Whether a Long run's plan fits its time: open items times the measured (or the default) minutes per item.
 * @param {object} run - a Long run just planned.
 * @param {number} [now] - now.
 * @returns {{needed: number, left: number, fits: boolean, recommend: number, perItem: number} | undefined} undefined for a /mission run.
 */
export function planFit(run, now = Date.now()) {
  // No time limit: nothing to fit, and no time question.
  if (!isLong(run) || !(run.long.deadline > 0)) return undefined;
  const open = run.items.filter((item) => item.status === 'open');
  const measured = medianStep(run);
  const perItem = measured > 0 ? measured / 60000 : ITEM_MINUTES;
  // The items (each at the planner's own estimate when it gave one, stage C), plus one unit for the overall commands
  // and the review at the end of the lap.
  // Stage D: several helpers at once work the items in waves of `helpers`.
  const size = helpersOf(run);
  const sum = open.reduce((total, item) => total + (Number(item.minutes) > 0 ? Number(item.minutes) : perItem), 0);
  const work = size > 1 && open.length > 0 ? Math.ceil(open.length / size) * (sum / open.length) : sum;
  const needed = Math.ceil(work + perItem);
  const left = Math.max(0, Math.floor((run.long.deadline - now) / 60000));
  // recommend is a span from now; extra is what to add to the time limit for it.
  const recommend = Math.max(10, Math.ceil((needed * 1.2) / 5) * 5);
  const extra = Math.max(10, recommend - left);
  return { needed, left, fits: needed <= left, recommend, perItem, extra };
}

/** @returns {boolean} whether a run may run no commands (a Recon conversation's Long run). */
export const noCommands = (run) => isLong(run) && run.long?.isolated === true;

/** @returns {boolean} whether a run runs no check commands: a Recon run (unless its checks are switched on), or a Bench run with its checks switched off. */
export const noChecks = (run) => (noCommands(run) && run.long?.offlineChecks !== true) || (isLong(run) && run.long?.bench?.checks === false);

/**
 * Item 4A, stage 6a: whether a run's checks run in the Devices fence (a guest's run in the Devices space: Bench's
 * rules): offline, no hidden files written, the app's data never read, no keys in their environment. The Devices mode's
 * own run (`long.bench.home === true`, owner's answer after review) keeps its checks as before 6a: network on, device
 * ports closed. Fail closed: a run without the mark (a guest, an older run, a space Mission could not read) is fenced.
 * @returns {boolean} a guest's Devices run.
 */
export const devicesChecks = (run) => isLong(run) && Boolean(run.long?.bench) && run.long.bench.home !== true;

/** @returns {boolean} whether a run's checks run without the internet and see only its folder (a Recon run with checks switched on, a Creator Plus or a Devices run). */
export const offlineChecks = (run) => (noCommands(run) && run.long?.offlineChecks === true) || (isLong(run) && Boolean(run.long?.creator)) || devicesChecks(run);

/** @returns {boolean} whether a run's checks get no keys: a short environment of their own (a Creator Plus or a Devices run). */
export const cleanEnv = (run) => (isLong(run) && run.long?.creator?.cleanEnv === true) || devicesChecks(run);

/** @returns {boolean} whether a run's workers have no commands: a Recon run, or any Bench run. */
export const workersWithoutCommands = (run) => noCommands(run) || (isLong(run) && (Boolean(run.long?.bench) || Boolean(run.long?.creator)));

/** @returns {boolean} whether a run's checks run with the Mac's device ports closed (a Bench run). */
export const portsClosed = (run) => isLong(run) && run.long?.bench?.closedPorts === true;

/** Take the commands out of a run that may run none: the reviewer judges every item instead. */
export function dropCommands(run) {
  if (!noChecks(run)) return run;
  run.checks = [];
  for (const item of run.items) item.check = '';
  return run;
}
