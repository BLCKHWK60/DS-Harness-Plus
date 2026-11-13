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

export const LIMITS = { maxItems: 12, maxTries: 3, maxReviews: 2, maxSteps: 60, waitMinutes: 3 };
export const LIMIT_RANGE = { maxItems: [1, 30], maxTries: [1, 8], maxReviews: [0, 5], maxSteps: [5, 300], waitMinutes: [0, 60] };
export const ROLES = ['plan', 'implement', 'review'];
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

/**
 * @param {object} start - how the run begins.
 * @returns {object} a new run.
 */
export function newRun({ id, goal, mode, root, limits, checkpoint, at = Date.now() }) {
  return {
    id, goal: clip(goal, 4000), mode, root, limits: readLimits(limits), checkpoint: checkpoint ?? 0,
    phase: 'plan', status: 'running', summary: '', items: [], checks: [], checkResults: [], reviews: 0, reviewNote: '', steps: 0, startedAt: at, endedAt: 0, stopReason: '',
  };
}

const openItems = (run) => run.items.filter((item) => item.status === 'open');

/**
 * What the run does next.
 * @param {object} run - the run.
 * @returns {{kind: 'plan' | 'work' | 'checks' | 'review' | 'finish' | 'done', item?: object}} the step.
 */
export function nextStep(run) {
  if (run.status !== 'running') return { kind: 'done' };
  if (run.steps >= run.limits.maxSteps) return { kind: 'finish' };
  if (run.phase === 'plan') return { kind: 'plan' };
  const item = openItems(run)[0];
  if (item) return { kind: 'work', item };
  if (run.phase === 'work') return { kind: run.checks.length > 0 ? 'checks' : run.limits.maxReviews > 0 ? 'review' : 'finish' };
  if (run.phase === 'checks') return { kind: run.reviews < run.limits.maxReviews ? 'review' : 'finish' };
  return { kind: 'finish' };
}

const addItem = (run, source, by) => {
  const title = line(source?.title, 120);
  if (!title || run.items.length >= run.limits.maxItems * 2) return undefined;
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
export function applyWork(run, id, { report = '', check, aside = '', failed = '' } = {}) {
  run.steps += 1;
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
  if (!review) {
    run.reviewNote = 'The reviewer gave no usable answer. Items without a command stay unverified.';
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
  return run;
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
  const head = run.status === 'complete'
    ? `Mission complete: all ${now.total} item${now.total === 1 ? '' : 's'} done and checked.`
    : run.status === 'stopped'
      ? `Mission stopped: ${now.verified + now.reviewed} of ${now.total} items done. ${run.stopReason}`
      : `Mission not complete: ${now.verified + now.reviewed} of ${now.total} items done. ${run.stopReason}`;
  const lines = [head.trim(), '', `Goal: ${run.goal}`, `Took ${minutes} minute${minutes === 1 ? '' : 's'} and ${run.steps} step${run.steps === 1 ? '' : 's'}. Mode: ${run.mode}.`, '', 'Checklist:', checklist(run)];
  lines.push('', 'What the marks mean: PASSED = its command was run and passed. REVIEWED = no command could prove it; the reviewer model judged it done. The rest is not done.');
  if (run.checkResults.length > 0) lines.push('', 'Overall commands, run at the end:', ...run.checkResults.map((result) => `- ${result.ok ? 'passed' : 'FAILED'}: ${result.command}`));
  if (run.reviewNote) lines.push('', `Reviewer's note: ${run.reviewNote}`);
  const waiting = run.items.filter((item) => item.status === 'aside');
  if (waiting.length > 0) lines.push('', 'Waiting for your yes:', ...waiting.map((item) => `- Item ${item.id}: ${item.note}`), 'Type /mission resume while you are here: those items are taken up again and you can answer the question.');
  if (run.checkpoint) lines.push('', `To undo everything this run changed: /mission back ${run.checkpoint}`);
  return lines.join('\n');
}
