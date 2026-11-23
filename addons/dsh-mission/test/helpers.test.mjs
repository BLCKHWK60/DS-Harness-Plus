/**
 * Helper failures in a Long run (lab run, 19 November 2026): a reviewer with no usable answer, a planner
 * with no usable plan, and the labels of an item whose helper failed. Each test fails on the code before.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLAN_FALLBACK, REVIEW_UNUSABLE, applyPlan, applyReview, applyWork, checklist, finish, newRun, nextStep, report } from '../lib/run.js';
import { FAIL_STREAK, createRunner } from '../runner.js';

const T0 = Date.UTC(2026, 10, 19, 10, 0, 0);
const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
const longRun = (over = {}) => newRun({ id: 'r1', goal: 'Make the tool better', mode: 'Restricted', root: '/tmp/x', limits: {}, checkpoint: 1, at: T0, kind: 'long', long: { minutes: 60, laps: 4, ...over } });

/** A runner on stand-in services; `answer(spec)` gives a helper's result `{text, stopReason, delay}`. */
function bench(answer, { helperMs, maxTries = 3 } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mission-helpers-')));
  const goal = { id: 'g', revision: 1, phase: 'active' };
  let made = false;
  const goals = {
    create: () => { made = true; goal.phase = 'active'; return goal; },
    get: () => (made ? goal : undefined),
    pause: () => { goal.phase = 'paused'; },
    resume: () => { goal.phase = 'active'; },
    complete: () => { goal.phase = 'complete'; },
    clear: () => { made = false; },
  };
  let n = 0;
  const subagents = {
    startActivation: async (spec) => {
      n += 1;
      const got = (await answer(spec)) ?? { text: 'DONE: did it' };
      if (got.cannotStart) throw new Error('The app could not start the helper.');
      const value = { output: got.text ? [{ type: 'text', text: got.text }] : [], stopReason: got.stopReason ?? 'end' };
      // `never`: a helper that hangs and never answers.
      const result = got.never ? new Promise(() => {}) : got.delay ? new Promise((resolve) => setTimeout(() => resolve(value), got.delay)) : Promise.resolve(value);
      return { childId: `child-${n}`, result };
    },
  };
  const services = { goals, subagents };
  const ctx = { get: (name) => services[name] };
  const points = { take: async () => ({ id: 'p', number: 1 }), files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '' };
  const runner = createRunner(ctx, { settings: () => ({ limits: { maxItems: 12, maxTries, maxReviews: 2, maxSteps: 60, waitMinutes: 3 }, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {}, ...(helperMs ? { helperMs } : {}) });
  const agent = { id: 'conv', model: { current: () => ({ provider: 'p', model: 'stand-in-model' }) } };
  const step = () => runner.step(agent, new AbortController().signal, 60000);
  const log = () => readFileSync(join(root, '.dsh-mission', 'runs', runner.runOf('conv').id, 'log.jsonl'), 'utf8').trim().split('\n').map((entry) => JSON.parse(entry));
  return { runner, agent, root, goal, step, log, done: () => rmSync(root, { recursive: true, force: true }) };
}

const PLAN = (items) => JSON.stringify({ summary: 's', items, checks: [] });

// ---- 3. A reviewer with no usable answer is a helper failure, not a quiet lap --------------------------

test('a Long run review with no usable answer does not end the lap, is no empty lap, and is taken again', () => {
  const run = applyPlan(longRun(), { summary: 's', items: [{ title: 'A' }], checks: [] });
  applyWork(run, '1', { report: 'DONE' });
  assert.equal(nextStep(run, T0).kind, 'review');
  applyReview(run, undefined);
  applyReview(run, undefined);
  assert.equal(run.long.emptyLaps, 0, 'not a lap that found nothing');
  assert.equal(run.long.lap, 0, 'the lap did not end');
  assert.equal(run.reviews, 0, 'no review used up');
  assert.deepEqual(nextStep(run, T0), { kind: 'review' }, 'the same review again, not the end of the run');
  assert.match(run.reviewRetry, /reviewer gave no usable answer/);
  // A usable review still ends the lap as before.
  applyReview(run, { verdict: 'approve', items: [{ id: '1', ok: true }] });
  assert.equal(run.long.lap, 1);
});

test('an empty reviewer answer counts toward the helper failures: three in a row pause the run with plain words, never "nothing more to do"', async () => {
  const app = bench((spec) => {
    if (spec.label === 'Mission: planner') return { text: PLAN([{ title: 'one' }]) };
    if (spec.label === 'Mission: item 1') return { text: 'DONE: did it' };
    return { text: '', stopReason: 'end' };
  });
  try {
    await app.runner.start(app.agent, 'do a small thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 4 } });
    await app.step(); // plan
    await app.step(); // item 1
    const texts = [];
    for (let i = 0; i < FAIL_STREAK; i += 1) texts.push(await app.step());
    // Stage E: the repair helper looks at it first (here it comes back empty too), then the pause from before.
    assert.match(texts.at(-1), /The Mission's repair helper looks at why helpers came back with empty answers next/);
    texts.push(await app.step());
    const run = app.runner.runOf('conv');
    assert.equal(run.status, 'running', texts.join('\n---\n'));
    assert.doesNotMatch(texts.join('\n'), /nothing more to do/);
    assert.match(texts[0], /The reviewer gave no usable answer/);
    assert.match(texts.at(-1), /The run is paused: 3 helpers in a row failed\. The last one: The reviewer gave no usable answer.* The repair helper could not run: /);
    await tick();
    assert.equal(app.goal.phase, 'paused');
    const reviews = app.log().filter((entry) => entry.kind === 'review');
    assert.equal(reviews.length, FAIL_STREAK);
    assert.ok(reviews.every((entry) => entry.unusable === true && entry.verdict === null));
    assert.equal(run.long.emptyLaps, 0);
  } finally {
    app.done();
  }
});

test('an unreadable reviewer answer (prose, and a format ask that gives no verdict) is also a helper failure', async () => {
  const app = bench((spec) => {
    if (spec.label === 'Mission: planner') return { text: PLAN([{ title: 'one' }]) };
    if (spec.label === 'Mission: item 1') return { text: 'DONE: did it' };
    return { text: 'I looked at it and it seems fine, mostly.' };
  });
  try {
    await app.runner.start(app.agent, 'do a small thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 4 } });
    await app.step();
    await app.step();
    const first = await app.step();
    const second = await app.step();
    const run = app.runner.runOf('conv');
    assert.match(first, /could not be read as a verdict/);
    assert.equal(run.status, 'running', second);
    assert.equal(run.failStreak, 2);
    assert.equal(run.long.lap, 0);
  } finally {
    app.done();
  }
});

// ---- 3b. The planner with no usable plan -------------------------------------------------------------

test('a plan that cannot be read becomes one item, and the log line and the report say so plainly', async () => {
  const app = bench((spec) => (spec.label.startsWith('Mission: planner') ? { text: 'I would start with the tests.' } : { text: 'DONE: did it' }));
  try {
    await app.runner.start(app.agent, 'do a small thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1 } });
    const text = await app.step();
    const run = app.runner.runOf('conv');
    assert.equal(run.items.length, 1);
    assert.ok(text.includes(PLAN_FALLBACK), text);
    const planned = app.log().find((entry) => entry.kind === 'plan');
    assert.equal(planned.parsed, false);
    assert.equal(planned.note, PLAN_FALLBACK);
    finish(run, '', Date.now());
    assert.ok(report(run).includes(PLAN_FALLBACK));
  } finally {
    app.done();
  }
  // A usable plan says nothing of the kind.
  const run = applyPlan(longRun(), { summary: 's', items: [{ title: 'A' }], checks: [] });
  finish(run, '', T0);
  assert.ok(!report(run).includes(PLAN_FALLBACK));
});

// ---- 4. Labels for failed helpers ----------------------------------------------------------------------

test('a failed worker\'s log line names the model it was given and the time it took, not "?" and 0', async () => {
  const app = bench((spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : { text: '', stopReason: 'end', delay: 20 }));
  try {
    await app.runner.start(app.agent, 'do a small thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1 } });
    await app.step();
    const text = await app.step();
    const worked = app.log().find((entry) => entry.kind === 'work');
    assert.equal(worked.model, 'stand-in-model', text);
    assert.ok(worked.ms >= 15, `ms ${worked.ms}`);
  } finally {
    app.done();
  }
});

test('an item that was tried says NOT DONE with its reason, never NOT STARTED; one never tried stays NOT STARTED', () => {
  const run = applyPlan(longRun(), { summary: 's', items: [{ title: 'A' }, { title: 'B' }], checks: [] });
  for (let i = 0; i < 3; i += 1) applyWork(run, '1', { failed: 'The helper came back with an empty answer and did nothing.', free: true });
  assert.equal(run.items[0].tries, 0, 'free failures still use no try');
  finish(run, 'paused and ended', T0);
  const text = report(run);
  assert.match(text, /1\. \[NOT DONE\] A\n {3}The helper came back with an empty answer/);
  assert.match(text, /2\. \[NOT STARTED\] B/);
  // Reopened by the reviewer after a real try, with no note of its own: how often it was tried.
  const again = applyPlan(longRun(), { summary: 's', items: [{ title: 'A' }], checks: [] });
  applyWork(again, '1', { report: 'DONE' });
  again.items[0].status = 'open';
  assert.match(checklist(again), /1\. \[NOT DONE\] A\n {3}Tried 1 time; not done yet\./);
  finish(again, '', T0);
  assert.match(again.stopReason, /1 tried but not done/);
  assert.doesNotMatch(again.stopReason, /not started/);
});

// ---- Review fixes (19 November 2026, second review) ------------------------------------------------------

test('a reviewer answer that only quotes a JSON snippet (no verdict) is no review: no empty lap, counted as a failure', async () => {
  const app = bench((spec) => {
    if (spec.label === 'Mission: planner') return { text: PLAN([{ title: 'one' }]) };
    if (spec.label === 'Mission: item 1') return { text: 'DONE: did it' };
    // The reviewer and its format ask both answer prose that quotes package.json.
    return { text: 'Looked at the diff. package.json has {"name": "x"} and that seems fine.' };
  });
  try {
    await app.runner.start(app.agent, 'do a small thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 4 } });
    await app.step();
    await app.step();
    const text = await app.step();
    const run = app.runner.runOf('conv');
    assert.match(text, /could not be read as a verdict/, text);
    assert.equal(run.long.emptyLaps, 0, 'not a lap that found nothing');
    assert.equal(run.long.lap, 0);
    assert.equal(run.failStreak, 1);
    const review = app.log().find((entry) => entry.kind === 'review');
    assert.equal(review.unusable, true);
    assert.equal(review.verdict, null);
  } finally {
    app.done();
  }
});

test('a real verdict after a quoted snippet is read, with no format ask', async () => {
  const labels = [];
  const app = bench((spec) => {
    labels.push(spec.label);
    if (spec.label === 'Mission: planner') return { text: PLAN([{ title: 'one' }]) };
    if (spec.label === 'Mission: item 1') return { text: 'DONE: did it' };
    return { text: 'package.json has {"name": "x"}.\n{"verdict": "approve", "note": "all good", "items": [{"id": "1", "ok": true}]}' };
  });
  try {
    await app.runner.start(app.agent, 'do a small thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 4 } });
    await app.step();
    await app.step();
    await app.step();
    const run = app.runner.runOf('conv');
    assert.equal(run.reviewNote, 'all good');
    assert.equal(run.long.lap, 1);
    assert.ok(!labels.some((label) => label.includes('(format)')), labels.join(', '));
  } finally {
    app.done();
  }
});

test('a helper stopped by its time limit still logs the model it was given and the time it took', async () => {
  const app = bench((spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : { never: true }), { helperMs: 30 });
  try {
    await app.runner.start(app.agent, 'do a small thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1 } });
    await app.step();
    const text = await app.step();
    const worked = app.log().find((entry) => entry.kind === 'work');
    assert.equal(worked.model, 'stand-in-model', text);
    assert.ok(worked.ms >= 20, `ms ${worked.ms}`);
    assert.doesNotMatch(text, /worker on \?/);
  } finally {
    app.done();
  }
});

test('a helper the app could not start still logs the model it was given', async () => {
  const app = bench((spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : { cannotStart: true }));
  try {
    await app.runner.start(app.agent, 'do a small thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1 } });
    await app.step();
    const text = await app.step();
    const worked = app.log().find((entry) => entry.kind === 'work');
    assert.equal(worked.model, 'stand-in-model', text);
    assert.match(text, /could not start the helper/);
  } finally {
    app.done();
  }
});

test('the report keeps the last usable reviewer note and never says the review "will be taken again" once the run ended', () => {
  const run = applyPlan(longRun(), { summary: 's', items: [{ title: 'A' }, { title: 'B' }], checks: [] });
  applyWork(run, '1', { report: 'DONE' });
  applyWork(run, '2', { report: 'DONE' });
  applyReview(run, { verdict: 'revise', note: 'Item 2 needs a test.', items: [{ id: '1', ok: true }, { id: '2', ok: false, note: 'no test' }] });
  applyReview(run, undefined);
  assert.equal(run.reviewRetry, REVIEW_UNUSABLE, 'the step still says the review is taken again');
  finish(run, 'the time is up', T0);
  const text = report(run);
  assert.match(text, /Reviewer's note: Item 2 needs a test\./);
  assert.doesNotMatch(text, /will be taken again/);
});

test('a failed worker then two unusable reviews pause the run with one neutral reason, naming the last one', async () => {
  const app = bench((spec) => {
    if (spec.label === 'Mission: planner') return { text: PLAN([{ title: 'one' }]) };
    if (spec.label === 'Mission: item 1') return { text: '', stopReason: 'error' };
    return { text: '', stopReason: 'end' };
  }, { maxTries: 1 });
  try {
    await app.runner.start(app.agent, 'do a small thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 4 } });
    await app.step(); // plan
    const worked = await app.step(); // the worker fails (streak 1)
    assert.equal(app.runner.runOf('conv').failStreak, 1, worked);
    // Stage E: the item ended NOT FINISHED (one try), so its repair comes first (it fails here: no streak counted).
    assert.match(await app.step(), /the repair helper looked at why item 1 was not finished after all its tries, but it could not run/);
    await app.step(); // unusable review (2)
    assert.match(await app.step(), /The Mission's repair helper looks at why/); // unusable review (3): the repair first
    const last = await app.step(); // the repair helper fails too: paused
    assert.match(last, /The run is paused: 3 helpers in a row failed\. The last one: The reviewer gave no usable answer/, last);
    assert.doesNotMatch(last, /in a row (could not do their item|gave no usable answer)/);
  } finally {
    app.done();
  }
});
