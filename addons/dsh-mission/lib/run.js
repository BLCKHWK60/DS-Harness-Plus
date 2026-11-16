/**
 * A mission run as plain data and pure steps, so the order of work can be tested without the app.
 *
 * The run is a fixed sequence that the add-on drives, one step per call:
 *   plan      a planner turns the goal into a checklist; each item says when it is done and,
 *             where possible, a command that proves it
 *   work      one item at a time goes to a worker; afterwards the item's command is run for real
 *   checks    the run's overall commands (tests, build) are run for real
 *   review    a reviewer reads the changes against the goal and may reopen or add items
 *   finish    the report
 * A model never decides that something passed: commands decide, and the reviewer decides only
 * what no command covers.
 */

import { loopLine } from './loop.js';

export const LIMITS = { maxItems: 12, maxTries: 3, maxReviews: 2, maxSteps: 60, waitMinutes: 3 };
export const LIMIT_RANGE = { maxItems: [1, 30], maxTries: [1, 8], maxReviews: [0, 5], maxSteps: [5, 300], waitMinutes: [0, 60] };
export const ROLES = ['plan', 'implement', 'review'];

/**
 * Long run (the owner's plan, Long run part; a run of its own kind, `kind: 'long'`, so /mission keeps
 * every rule it has): a clock, laps as the limit, extra laps that hunt for weak spots after the list is
 * done, a gate that undoes a lap that breaks a check that passed, and notes the add-on keeps between laps.
 * A lap is: work on the open items, the overall commands, then a review.
 */
export const LONG = { minutes: 120, laps: 10, fullTime: false };
export const LONG_RANGE = { minutes: [10, 720], laps: [1, 50] };
/** Laps in a row that find nothing before a Long run stops early (decision 2). */
export const EMPTY_LAPS = 2;
/** The longest the run notes may be, so a small model is not swamped. */
export const NOTES_MAX = 2000;
/** The longest one message of yours to a run under way may be, and how many of them it keeps. */
export const ASK_MAX = 500;
export const ASKS_KEPT = 6;
/** The longest the conversation before a run may be, as given to its planner and reviewer. */
export const CONTEXT_MAX = 4000;

/** @returns {{minutes: number, laps: number, fullTime: boolean}} a Long run's own settings, checked. */
export function readLong(given = {}) {
  const out = {};
  for (const key of ['minutes', 'laps']) {
    const [low, high] = LONG_RANGE[key];
    const number = Number(given?.[key]);
    out[key] = Number.isFinite(number) ? Math.min(high, Math.max(low, Math.round(number))) : LONG[key];
  }
  out.fullTime = given?.fullTime === true;
  return out;
}

/** @returns {boolean} whether this is a Long run. */
export const isLong = (run) => run?.kind === 'long';
const TEXT_MAX = 600;
const OUTPUT_MAX = 3000;

const clip = (value, max = TEXT_MAX) => String(value ?? '').replace(/\r/g, '').trim().slice(0, max);
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
  if (long?.bench && typeof long.bench === 'object') extra.bench = { checks: long.bench.checks !== false, closedPorts: long.bench.closedPorts !== false };
  // Started with the Run button: what was said in the conversation before it (for the planner and reviewer).
  const context = clip(long?.context, CONTEXT_MAX);
  if (context) extra.context = context;
  run.long = { ...own, ...extra, deadline: at + own.minutes * 60000, lap: 0, emptyLaps: 0, lapEnded: false, finishLap: false, checksPassedOnce: false, passing: [], lapPoint: 0, notes: '', undone: [], hunting: false, asks: [] };
  // Laps are the limit (decision 1): steps and reviews are worked out from them, past /mission's 300 if need be.
  run.limits = { ...run.limits, maxReviews: own.laps + 1, maxSteps: 1 + own.laps * (run.limits.maxItems * 2 + 2), itemCap: run.limits.maxItems * 2 + own.laps * 4 };
  return run;
}

const openItems = (run) => run.items.filter((item) => item.status === 'open');

/**
 * What the run does next.
 * @param {object} run - the run.
 * @returns {{kind: 'plan' | 'work' | 'checks' | 'review' | 'finish' | 'done', item?: object}} the step.
 */
export function nextStep(run, now = Date.now()) {
  if (run.status !== 'running') return { kind: 'done' };
  if (isLong(run)) return nextLongStep(run, now);
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
  if (run.steps >= run.limits.maxSteps) return { kind: 'finish' };
  if (now >= L.deadline) return { kind: 'finish', why: 'time' };
  // An optional token allowance (step 58), off unless set on the card: the run ends with its report.
  if (L.tokenCap > 0 && (run.tokens ?? 0) >= L.tokenCap) return { kind: 'finish', why: 'allowance' };
  if (run.phase === 'plan') return { kind: 'plan' };
  // Between laps: Finish this lap and the lap limit end the run, also with items reopened by the review.
  if (L.lapEnded) {
    if (L.finishLap) return { kind: 'finish', why: 'asked' };
    if (L.lap >= L.laps) return { kind: 'finish', why: 'laps' };
  }
  const item = openItems(run)[0];
  if (item) return { kind: 'work', item };
  if (run.phase === 'work') return { kind: run.checks.length > 0 ? 'checks' : 'review' };
  if (run.phase === 'checks') return { kind: 'review' };
  // A lap has ended with nothing open: hunt for weak spots, unless laps keep finding nothing.
  if (!L.fullTime && L.emptyLaps >= EMPTY_LAPS) return { kind: 'finish', why: 'empty' };
  return { kind: 'review', hunt: true };
}

const addItem = (run, source, by) => {
  const title = line(source?.title, 120);
  if (!title || run.items.length >= (run.limits.itemCap ?? run.limits.maxItems * 2)) return undefined;
  const item = { id: String(run.items.length + 1), title, detail: clip(source?.detail), doneWhen: clip(source?.done_when ?? source?.doneWhen, 300), check: line(source?.check, 400), status: 'open', tries: 0, by, report: '', evidence: '', note: '' };
  run.items.push(item);
  return item;
};

/**
 * Take the planner's checklist. A plan without a usable item becomes one item: the goal itself.
 * @param {object} run - the run; changed in place.
 * @param {{summary?: string, items?: object[], checks?: string[]} | undefined} plan - the parsed plan.
 * @returns {object} the run.
 */
export function applyPlan(run, plan) {
  run.steps += 1;
  run.summary = clip(plan?.summary, 800);
  for (const source of (Array.isArray(plan?.items) ? plan.items : []).slice(0, run.limits.maxItems)) addItem(run, source, 'plan');
  if (run.items.length === 0) addItem(run, { title: line(run.goal, 120), detail: run.goal, done_when: 'The goal is met.' }, 'plan');
  run.checks = [...new Set((Array.isArray(plan?.checks) ? plan.checks : []).map((command) => line(command, 400)).filter(Boolean))].slice(0, 6);
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
export function applyWork(run, id, { report = '', check, aside = '', failed = '', loopFail = '', loopFailBy = 'app' } = {}) {
  run.steps += 1;
  if (isLong(run)) run.long.lapEnded = false;
  const item = run.items.find((entry) => entry.id === id);
  if (!item) return undefined;
  item.tries += 1;
  item.report = clip(report, 1500);
  if (aside) {
    item.status = 'aside';
    item.note = clip(aside, 400);
  } else if (failed) {
    item.note = clip(failed, 400);
    if (item.tries >= run.limits.maxTries) item.status = 'stuck';
  } else if (check) {
    item.evidence = `${item.check}\n${tail(check.output) || (check.ok ? '(passed, no output)' : '(failed, no output)')}`;
    if (check.ok) {
      item.status = 'verified';
      item.note = '';
    } else {
      item.note = 'Its command did not pass.';
      if (item.tries >= run.limits.maxTries) item.status = 'stuck';
    }
  } else {
    // No command proves it: the reviewer decides.
    item.status = 'unverified';
    item.note = '';
  }
  // The work loop's checker (only when the loop is on): its no sends the item back with its words, as
  // often as the Depth allows (Quick never, Standard once). Its yes marks nothing done. A model's no never
  // reopens an item whose command passed: only the app's own checks may.
  const mayReopen = item.status === 'unverified' || (item.status === 'verified' && loopFailBy === 'app');
  if (loopFail && mayReopen) {
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

/**
 * Take the reviewer's verdict.
 * @param {object} run - the run; changed in place.
 * @param {{verdict?: string, note?: string, items?: {id: string, ok: boolean, note?: string}[], new_items?: object[]} | undefined} review - the parsed review; undefined when the reviewer gave nothing usable.
 * @returns {object} the run.
 */
export function applyReview(run, review) {
  run.steps += 1;
  run.reviews += 1;
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
  if (!review) {
    run.reviewNote = 'The reviewer gave no usable answer. Items without a command stay unverified.';
    lapEnds();
    return run;
  }
  run.reviewNote = clip(review.note, 800);
  let reopened = 0;
  for (const verdict of Array.isArray(review.items) ? review.items : []) {
    const item = run.items.find((entry) => entry.id === String(verdict?.id));
    if (!item || item.status === 'aside') continue;
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
    item.status = item.tries >= run.limits.maxTries ? 'stuck' : 'open';
    item.note = clip(`Undone: this lap broke ${broke.join(', ')}, so its work was rolled back (kept as checkpoint ${kept}).`, 400);
  }
  run.checkResults = run.long.passing.map((command) => ({ command, ok: true, output: '(as before the undone lap)' }));
  // Its items go back to work, and the overall commands run again after them.
  run.phase = run.items.some((item) => item.status === 'open') ? 'work' : 'checks';
  return run;
}

/**
 * The notes the add-on keeps between laps (step 53): short, replaced each lap, given to every helper.
 * @returns {string} the notes ('' for /mission runs).
 */
export function lapNotes(run) {
  if (!isLong(run)) return '';
  const asks = Array.isArray(run.long.asks) ? run.long.asks : [];
  const passed = run.items.filter((item) => item.status === 'verified' || item.status === 'reviewed').map((item) => `${item.id}`);
  const failing = run.items.filter((item) => item.status === 'open' || item.status === 'stuck').map((item) => `${item.id} (${line(item.note, 120) || 'not done'})`);
  const checks = run.checkResults.filter((result) => !result.ok).map((result) => result.command);
  const undone = run.long.undone.map((entry) => `lap ${entry.lap} broke ${entry.broke.join(', ')} and was undone`);
  const text = [
    asks.length > 0 ? `The user wrote to the run while it worked (newest last; follow it where it changes the work):\n${asks.map((ask) => `- ${line(ask.text, ASK_MAX)}`).join('\n')}` : '',
    `Lap ${run.long.lap} of at most ${run.long.laps}.`,
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
  return { verified: count('verified'), reviewed: count('reviewed'), unverified: count('unverified'), stuck: count('stuck'), aside: count('aside'), open: count('open'), total: run.items.length };
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
    run.stopReason = [now.stuck ? `${now.stuck} item${now.stuck === 1 ? '' : 's'} could not be finished` : '', now.aside ? `${now.aside} need${now.aside === 1 ? 's' : ''} your yes` : '', now.unverified ? `${now.unverified} could not be verified` : '', now.open ? `${now.open} not started` : '', checksOk ? '' : 'an overall command still fails'].filter(Boolean).join('; ');
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

const MARK = { verified: 'PASSED', reviewed: 'REVIEWED', unverified: 'NOT VERIFIED', stuck: 'NOT FINISHED', aside: 'NEEDS YOU', open: 'NOT STARTED' };

/**
 * The checklist as text, for the conversation and for the report.
 * @param {object} run - the run.
 * @returns {string} one line per item.
 */
export function checklist(run) {
  return run.items.map((item) => `${item.id}. [${MARK[item.status] ?? item.status}] ${item.title}${item.check ? `  (proved by: ${item.check})` : ''}${item.note ? `\n   ${item.note}` : ''}`).join('\n');
}

/**
 * The final report, in plain words. The first line stands on its own.
 * @param {object} run - a finished run.
 * @returns {string} the report.
 */
export function report(run) {
  const now = tally(run);
  const minutes = Math.max(1, Math.round(((run.endedAt || Date.now()) - run.startedAt) / 60000));
  const name = isLong(run) ? 'Long run' : 'Mission';
  const head = run.status === 'complete'
    ? `${name} complete: all ${now.total} item${now.total === 1 ? '' : 's'} done and checked.`
    : run.status === 'stopped'
      ? `${name} stopped: ${now.verified + now.reviewed} of ${now.total} items done. ${run.stopReason}`
      : `${name} not complete: ${now.verified + now.reviewed} of ${now.total} items done. ${run.stopReason}`;
  const lines = [head.trim(), '', `Goal: ${run.goal}`, `Took ${minutes} minute${minutes === 1 ? '' : 's'} and ${run.steps} step${run.steps === 1 ? '' : 's'}. Mode: ${run.mode}.`];
  if (isLong(run)) {
    const L = run.long;
    lines.push(`Long run: ${L.lap} lap${L.lap === 1 ? '' : 's'} of at most ${L.laps}, ${L.minutes} minutes allowed${L.fullTime ? ', full time used on purpose' : ''}.${run.longEnd ? ` It ended because ${run.longEnd}.` : ''}`);
    if (L.undone.length > 0) lines.push(...L.undone.map((entry) => `Lap ${entry.lap} broke ${entry.broke.join(', ')} and was undone. Its work is kept as checkpoint ${entry.kept} (/mission back ${entry.kept} to look at it).`));
  }
  lines.push('', 'Checklist:', checklist(run));
  lines.push('', 'What the marks mean: PASSED = its command was run and passed. REVIEWED = no command could prove it; the reviewer model judged it done. The rest is not done.');
  if (run.checkResults.length > 0) lines.push('', 'Overall commands, run at the end:', ...run.checkResults.map((result) => `- ${result.ok ? 'passed' : 'FAILED'}: ${result.command}`));
  if (run.reviewNote) lines.push('', `Reviewer's note: ${run.reviewNote}`);
  if (run.loop) lines.push('', loopLine(run));
  const waiting = run.items.filter((item) => item.status === 'aside');
  if (waiting.length > 0) lines.push('', 'Waiting for your yes:', ...waiting.map((item) => `- Item ${item.id}: ${item.note}`), 'Type /mission resume while you are here: those items are taken up again and you can answer the question.');
  if (run.checkpoint) lines.push('', `To undo everything this run changed: /mission back ${run.checkpoint}`);
  return lines.join('\n');
}

/**
 * A message you sent while a Long run works: kept for its helpers, newest last (step 64).
 * @param {object} run - a Long run.
 * @param {string} text - what you wrote.
 * @returns {boolean} whether it was kept.
 */
export function addAsk(run, text, at = Date.now()) {
  if (!isLong(run) || run.status !== 'running') return false;
  const said = clip(text, ASK_MAX);
  if (!said) return false;
  run.long.asks = [...(Array.isArray(run.long.asks) ? run.long.asks : []), { at, text: said }].slice(-ASKS_KEPT);
  return true;
}

/** @returns {boolean} whether a run may run no commands (a Recon conversation's Long run). */
export const noCommands = (run) => isLong(run) && run.long?.isolated === true;

/** @returns {boolean} whether a run runs no check commands: a Recon run (unless its checks are switched on), or a Bench run with its checks switched off. */
export const noChecks = (run) => (noCommands(run) && run.long?.offlineChecks !== true) || (isLong(run) && run.long?.bench?.checks === false);

/** @returns {boolean} whether a run's checks run without the internet and see only its folder (a Recon run with checks switched on). */
export const offlineChecks = (run) => noCommands(run) && run.long?.offlineChecks === true;

/** @returns {boolean} whether a run's workers have no commands: a Recon run, or any Bench run. */
export const workersWithoutCommands = (run) => noCommands(run) || (isLong(run) && Boolean(run.long?.bench));

/** @returns {boolean} whether a run's checks run with the Mac's device ports closed (a Bench run). */
export const portsClosed = (run) => isLong(run) && run.long?.bench?.closedPorts === true;

/** Take the commands out of a run that may run none: the reviewer judges every item instead. */
export function dropCommands(run) {
  if (!noChecks(run)) return run;
  run.checks = [];
  for (const item of run.items) item.check = '';
  return run;
}
