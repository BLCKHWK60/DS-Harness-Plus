/**
 * Point 17 (owner, 20 November 2026): Wait for me. When only the user's answers can move a Mission on, it waits (minutes,
 * or until they answer): the app's goal is paused by Mission itself (a quiet wait: no rounds, no model calls), its time
 * limit does not run, the Mac may sleep, one alert fires. An answer that frees work gives the rounds back; when Wait for
 * me runs out, one last round gives the report. Each test fails on the code before point 17.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { GIT_CANDIDATES } from '../lib/checkpoints.js';
import { applyPlan, applyReview, applyWork, closeWait, newRun, nextStep, pauseRun, report, answerTooLate, workedMs } from '../lib/run.js';
import { stripOf } from '../lib/strip.js';
import { createRunner, WAIT_RESUME_TEXT } from '../runner.js';
import { APPROVE, PLAN, bench, tick } from './bench-pool.mjs';
import { appHarness } from './app-harness.mjs';

const hasGit = GIT_CANDIDATES.some((path) => existsSync(path));
const T0 = Date.parse('2026-11-20T10:00:00Z');
/** One item that needs an answer, one helper: it waits after its lap's review. */
const waiting = (long = {}, extra = {}) => bench({
  ...extra,
  answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'pick the colour' }]) } : spec.label === 'Mission: item 1' ? (extra.item ?? { text: 'NEEDS ANSWER: Which colour? | IF NO ANSWER: blue' }) : { text: APPROVE }),
});
const untilWaiting = async (app) => {
  let text = '';
  for (let i = 0; i < 8 && !/now waits for the user|^Waiting for the user:/.test(text); i += 1) text = await app.step(300);
  await tick(10);
  return text;
};

test('the quiet wait: marked first, then the goal is paused once; one alert with its end; the conductor is told not to call; the idle brake and pausedOutside leave it alone', async () => {
  const app = waiting();
  let quietAtPause;
  try {
    await app.runner.start(app.agent, 'paint the page', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 3, helpers: 1, waitFor: 30 } });
    const goals = { pauses: 0 };
    const run = app.runner.runOf('conv');
    const original = app.goal;
    Object.defineProperty(original, 'phase', { configurable: true, enumerable: true, get() { return this._phase ?? 'active'; }, set(value) { if (value === 'paused') { goals.pauses += 1; quietAtPause = run.long.quietGoal; } this._phase = value; } });
    const text = await untilWaiting(app);
    assert.match(text, /^The Mission now waits for the user: only their answers can move it on \(1 question, 0 approvals\), in the card above the chat box\. With no answer it ends at \d\d:\d\d with its report\. Its time limit does not run while it waits\. Tell the user this in one line and do not call mission_step again/);
    assert.equal(goals.pauses, 1, 'paused once');
    assert.equal(quietAtPause, true, 'marked as Mission\'s own before the pause');
    assert.equal(app.runner.waitingQuietly('conv'), true);
    assert.equal(app.runner.pausedOutside(app.agent), false, 'not a pause of the user\'s');
    assert.equal(run.pausedAt ?? 0, 0);
    assert.match(await app.step(), /waits for the user/, 'a call gets the waiting words, never "paused"');
    assert.match(await app.step(), /waits for the user/);
    await tick();
    const you = app.fired.filter((event) => event.type === 'needs-you' && event.waiting === 'you');
    assert.equal(you.length, 1, 'one alert per wait');
    assert.deepEqual([you[0].until, you[0].needs], [run.long.waitingSince + 30 * 60_000, 'ask']);
    assert.equal(app.runner.round(app.agent), false);
    assert.equal(app.runner.resume(app.agent), WAIT_RESUME_TEXT, 'Resume changes nothing: it is not paused');
    assert.equal(app.goal.phase, 'paused');
    const view = app.runner.view('conv');
    assert.deepEqual([view.waitingForYou.quiet, view.waitingForYou.until], [true, run.long.waitingSince + 30 * 60_000]);
    const strip = stripOf({ run: { ...view, goalPhase: 'paused' } });
    assert.deepEqual([strip.state, strip.main], ['waiting', 'note'], 'waiting, not paused, although the goal is paused');
  } finally {
    app.done();
  }
});

test('the clock stands still while it waits: no time end, the deadline moves on by the wait, the waited time never counts as work', () => {
  const run = newRun({ id: 'r', goal: 'g', mode: 'Full Auto', root: '/x', limits: {}, at: T0, kind: 'long', long: { minutes: 60, laps: 3, waitFor: 0 } });
  applyPlan(run, { items: [{ title: 'a' }] });
  run.questions.push({ id: 'q1', text: 'A?', status: 'open', items: ['1'] });
  applyWork(run, '1', { parked: { on: ['q1'] } });
  applyReview(run, { verdict: 'approve', items: [] });
  run.long.waitingSince = T0 + 10 * 60_000;
  assert.equal(nextStep(run, T0 + 5 * 3600_000, {}).kind, 'wait-you', 'five hours later: still waiting, never "time"');
  assert.equal(answerTooLate(run, T0 + 5 * 3600_000), false, 'an answer while it waits is never too late');
  const deadline = run.long.deadline;
  closeWait(run, T0 + 130 * 60_000);
  assert.equal(run.long.deadline, deadline + 120 * 60_000);
  assert.equal(run.long.waitedMs, 120 * 60_000);
  assert.equal(run.long.waitingSince, undefined);
  run.endedAt = T0 + 140 * 60_000;
  assert.equal(workedMs(run), 20 * 60_000);
  run.status = 'incomplete';
  assert.match(report(run), /Took 20 minutes .*\n[\s\S]*It waited for you for 120 minutes; that time did not count\./);
  // A pause ends a wait where it begins (each span counted once).
  const other = newRun({ id: 'r', goal: 'g', mode: 'Full Auto', root: '/x', limits: {}, at: T0, kind: 'long', long: { minutes: 60, waitFor: 0 } });
  other.long.waitingSince = T0 + 60_000;
  pauseRun(other, T0 + 3 * 60_000);
  assert.deepEqual([other.long.waitedMs, other.pausedAt, other.long.waitingSince], [120_000, T0 + 3 * 60_000, undefined]);
});

test('Until I answer never ends by itself, and the sweep never ends or cuts a waiting run by its time limit', async () => {
  const app = waiting();
  try {
    await app.runner.start(app.agent, 'paint the page', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 10, laps: 3, helpers: 1, waitFor: 0 } });
    await untilWaiting(app);
    const run = app.runner.runOf('conv');
    assert.ok(run.long.waitingSince > 0);
    assert.deepEqual(app.runner.sweep(Date.now() + 1e9, () => app.agent), [], 'never by itself; never "time up" while it waits');
    assert.equal(run.status, 'running');
    assert.equal(app.runner.view('conv').waitingForYou.until, 0);
  } finally {
    app.done();
  }
});

test('an answer that frees nothing yet keeps it waiting (no new alert); one that frees the item gives the goal its rounds back and the wait time is added', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }], { questions: [{ question: 'Which city?', default: 'Berlin', items: [1] }, { question: 'Which year?', default: '2026', items: [1] }] }) } : spec.label === 'Mission: item 1' ? { text: 'DONE: done' } : { text: APPROVE }) });
  try {
    await app.runner.start(app.agent, 'list the cities', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 3, helpers: 1, needs: 'wait', waitFor: 0 } });
    const text = await untilWaiting(app);
    assert.match(text, /waits for the user/);
    const run = app.runner.runOf('conv');
    const deadline = run.long.deadline;
    app.runner.answerMany('conv', [{ id: 'q1', text: 'Paris' }]);
    assert.ok(run.long.waitingSince > 0, 'item 1 still waits for q2');
    assert.equal(app.goal.phase, 'paused');
    await tick();
    assert.equal(app.fired.filter((event) => event.type === 'needs-you' && event.waiting === 'you').length, 1, 'no new alert');
    await tick(20);
    app.runner.answerMany('conv', [{ id: 'q2', text: '2025' }]);
    assert.equal(run.long.waitingSince, undefined);
    assert.equal(app.goal.phase, 'active', 'rounds again');
    assert.ok(run.long.deadline >= deadline + 20, 'the wait is added to the deadline');
    assert.ok(run.long.waitedMs >= 20);
    assert.match(await app.step(), /item 1 of 1/);
  } finally {
    app.done();
  }
});

test('Pause and End while it waits: the wait is over (never given rounds again by it); End gives the report', async () => {
  const app = waiting();
  try {
    await app.runner.start(app.agent, 'paint the page', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 3, helpers: 1, waitFor: 30 } });
    await untilWaiting(app);
    const run = app.runner.runOf('conv');
    assert.match(app.runner.stop(app.agent), /^Mission paused/);
    assert.deepEqual([run.long.waitingSince, run.long.quietGoal, run.pausedBy, app.goal.phase], [undefined, undefined, 'you', 'paused']);
    assert.ok(run.pausedAt > 0);
    assert.match(app.runner.resume(app.agent), /^Mission carries on/);
    assert.equal(app.goal.phase, 'active');
    await untilWaiting(app);
    assert.ok(run.long.waitingSince > 0, 'it waits again');
    const text = app.runner.end(app.agent);
    assert.match(text, /When it needs you: Ask, keep working; Wait for me: 30 minutes\./);
    assert.deepEqual([run.long.waitingSince, run.long.quietGoal, run.longEndKind], [undefined, undefined, 'ended']);
  } finally {
    app.done();
  }
});

test('the goal could not be paused: it waits stage D\'s way (rounds go on, the conductor calls again)', async () => {
  const app = waiting();
  try {
    await app.runner.start(app.agent, 'paint the page', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 3, helpers: 1, waitFor: 30 } });
    app.goal.phase = 'active';
    // The stand-in app refuses the pause.
    const before = Object.getOwnPropertyDescriptor(app.goal, 'phase');
    Object.defineProperty(app.goal, 'phase', { configurable: true, enumerable: true, get() { return 'active'; }, set(value) { if (value === 'paused') throw new Error('GOAL_INVALID_TRANSITION'); } });
    const text = await untilWaiting(app);
    assert.match(text, /^Waiting for the user: .*call mission_step again in the next round\. Its time limit does not run while it waits\./);
    const run = app.runner.runOf('conv');
    assert.deepEqual([run.long.waitingSince > 0, run.long.quietGoal, app.runner.waitingQuietly('conv')], [true, undefined, false]);
    Object.defineProperty(app.goal, 'phase', before ?? { value: 'active', writable: true, configurable: true, enumerable: true });
  } finally {
    app.done();
  }
});

test('restart: a quiet wait goes on (no restart pause, no alert) and ends at the first sweep once Wait for me is over; a stage D wait is paused for the restart', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'mission-wait-home-')));
  const app = waiting({}, { home });
  try {
    await app.runner.start(app.agent, 'paint the page', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 3, helpers: 1, waitFor: 10 } });
    await untilWaiting(app);
    const since = app.runner.runOf('conv').long.waitingSince;
    // The app closes and starts again: a new runner reads the run from its folder.
    const fired = [];
    const fresh = () => createRunner({ get: () => undefined }, { settings: () => ({ limits: { waitMinutes: 3 }, roles: {}, projects: {} }), pointsOf: () => ({}), afterCommand: async () => [], warn: () => {}, home: (sub) => join(home, sub) });
    const again = fresh();
    again.onEvent((event) => fired.push(event));
    const run = again.runOf('conv');
    assert.deepEqual([run.long.waitingSince, run.long.quietGoal], [since, true], 'kept');
    again.announceInterrupted('conv', run);
    await tick();
    assert.deepEqual([run.pausedAt ?? 0, run.stalled ?? '', fired.length], [0, '', 0], 'no restart pause, no alert');
    assert.deepEqual(again.sweep(since + 9 * 60_000, () => undefined), []);
    assert.deepEqual(again.sweep(since + 10 * 60_000 + 1, () => undefined), ['conv'], 'its conversation is not open: it ends at once');
    assert.notEqual(run.status, 'running');
    assert.match(report(run), /It ended because only your answers could move it on, and none came within 10 minutes\./);
    assert.equal(run.longEndKind, 'waited');
    // A run saved in the middle of a stage D wait (no quiet goal): the wait is over, and the restart pauses it.
    const old = newRun({ id: 'old', goal: 'g', mode: 'Full Auto', root: app.root, limits: {}, kind: 'long', long: { minutes: 60 } });
    old.long.waitingSince = Date.now();
    const third = fresh();
    third.announceInterrupted('x', old);
    assert.equal(old.pausedBy, 'restart');
  } finally {
    app.done();
    rmSync(home, { recursive: true, force: true });
  }
});

test('the lap limit and a continued lap wait for the user instead of ending; an answer then opens a new pass; Finish this lap still ends at once', async () => {
  const run = newRun({ id: 'r', goal: 'g', mode: 'Full Auto', root: '/x', limits: {}, kind: 'long', long: { minutes: 60, laps: 1, waitFor: 30 } });
  applyPlan(run, { items: [{ title: 'a' }] });
  run.questions.push({ id: 'q1', text: 'A?', status: 'open', items: ['1'] });
  applyWork(run, '1', { parked: { on: ['q1'] } });
  applyReview(run, { verdict: 'approve', items: [] });
  assert.equal(run.long.lap, 1);
  assert.equal(nextStep(run, Date.now(), {}).kind, 'wait-you', 'at its lap limit with an item waiting');
  run.long.continueLap = true;
  assert.equal(nextStep(run, Date.now(), {}).kind, 'wait-you', 'a continued lap too');
  run.long.finishLap = true;
  assert.deepEqual(nextStep(run, Date.now(), {}), { kind: 'finish', why: 'asked' });
  run.long.finishLap = false;
  run.items[0].status = 'verified';
  assert.deepEqual(nextStep(run, Date.now(), {}), { kind: 'finish', why: 'continued' }, 'nothing waits: it ends');
  // Through the runner, at the lap limit.
  const app = waiting();
  try {
    await app.runner.start(app.agent, 'paint the page', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 1, waitFor: 30 } });
    await untilWaiting(app);
    const live = app.runner.runOf('conv');
    assert.equal(live.status, 'running', 'not ended at its lap limit');
    app.runner.answerMany('conv', [{ id: 'q1', text: 'green' }]);
    assert.equal(live.long.lapEnded, false, 'a new pass');
    assert.match(await app.step(), /item 1 of 1/);
  } finally {
    app.done();
  }
});

test('review: Finish this lap while it waits quietly ends it at once with its report (also Until I answer, at the lap limit, past the first deadline and with several helpers)', async () => {
  // Several helpers (4 by default): the pump must not end it before the round it gets back, or the report is never said.
  for (const long of [{ minutes: 60, laps: 3, waitFor: 0 }, { minutes: 60, laps: 1, waitFor: 0 }, { minutes: 10, laps: 3, waitFor: 30 }, { minutes: 60, laps: 3, waitFor: 0, helpers: 2 }, { minutes: 10, laps: 1, waitFor: 30, helpers: 4 }]) {
    const app = waiting();
    try {
      await app.runner.start(app.agent, 'paint the page', { mode: 'auto', root: app.root }, { kind: 'long', long: { helpers: 1, ...long } });
      await untilWaiting(app);
      const run = app.runner.runOf('conv');
      assert.equal(app.goal.phase, 'paused', 'a quiet wait');
      // Past the first deadline: the wait stopped its clock, so its time is not up.
      const said = app.runner.finishLap(app.agent, run.long.deadline + 60_000);
      assert.match(said, /stops waiting and writes its report now/, JSON.stringify(long));
      assert.equal(run.long.waitingSince, undefined);
      assert.equal(app.goal.phase, 'active', 'one round back for the report');
      assert.equal(run.status, 'running', `the round gives the report, not the pump (${JSON.stringify(long)})`);
      const text = await app.step();
      assert.notEqual(run.status, 'running', JSON.stringify(long));
      assert.match(report(run), /you asked it to finish the lap/i);
      assert.match(text, /report/i);
    } finally {
      app.done();
    }
  }
});

test('through the add-on: the conductor guard stays on while it waits quietly, and mission_step answers with the waiting words', { skip: !hasGit }, async () => {
  const app = appHarness({ config: { longHelpers: 1 }, answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : spec.label === 'Mission: item 1' ? { text: 'NEEDS ANSWER: Which one? | IF NO ANSWER: the first' } : undefined) });
  try {
    const chat = app.open('c');
    assert.equal((await app.mission(chat, 'auto do one small thing in this folder please')).kind, 'success');
    let text = '';
    for (let i = 0; i < 6 && !/now waits for the user/.test(text); i += 1) text = (await app.step(chat)).text;
    await tick(10);
    assert.match(text, /waits for the user/);
    assert.equal(app.goals.get('c').phase, 'paused');
    assert.equal(app.runner().view('c').waitingForYou.quiet, true);
    const refused = await app.chain('tools/pre-execute', { agent: chat, name: 'bash', arguments: { command: 'ls' }, callId: 'x1', signal: new AbortController().signal });
    assert.equal(refused.kind, 'deny', 'the conversation\'s own model still only conducts');
    assert.match((await app.step(chat)).text, /waits for the user/, 'never the paused words');
    const strip = (await app.get('c')).json.strip;
    assert.deepEqual([strip.state, strip.main, strip.needs], ['waiting', 'note', 'ask']);
    const note = await app.card({ sessionId: 'c', action: 'note', text: 'use green' });
    assert.equal(note.json.said, 'Your note reaches the Mission when it goes on. It still waits for your answers in the card.');
    const answered = await app.card({ sessionId: 'c', action: 'answer', answers: [{ id: 'q1', text: 'the second' }] });
    assert.equal(answered.status, 200, JSON.stringify(answered.json));
    assert.equal(app.goals.get('c').phase, 'active', 'the answer gives it its rounds back');
  } finally {
    app.done();
  }
});

test('through the add-on: /mission back while it waits quietly pauses it first, so Resume carries it on from the folder as it is', { skip: !hasGit }, async () => {
  const app = appHarness({ config: { longHelpers: 1 }, answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : spec.label === 'Mission: item 1' ? { text: 'NEEDS ANSWER: Which one? | IF NO ANSWER: the first' } : undefined) });
  try {
    const chat = app.open('c');
    assert.equal((await app.mission(chat, 'auto do one small thing in this folder please')).kind, 'success');
    let text = '';
    for (let i = 0; i < 6 && !/now waits for the user/.test(text); i += 1) text = (await app.step(chat)).text;
    await tick(10);
    assert.equal(app.runner().view('c').waitingForYou?.quiet, true);
    const back = await app.mission(chat, 'back 1');
    assert.equal(back.kind, 'success', back.text);
    assert.match(back.text, /^The Mission was paused first, so no helper was changing files\./);
    const view = app.runner().view('c');
    assert.deepEqual([view.waitingForYou, view.pausedBy], [null, 'you']);
    assert.ok(view.pausedAt > 0);
  } finally {
    app.done();
  }
});

// ---- Review of point 17: the quiet pause never ends the conductor's turn as your Stop --------------------------------
const quietApp = (options) => appHarness({ config: { longHelpers: 1 }, answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : spec.label === 'Mission: item 1' ? { text: 'NEEDS ANSWER: Which one? | IF NO ANSWER: the first' } : undefined), driver: true, ...options });
const toWait = async (app, chat) => {
  let text = '';
  for (let i = 0; i < 8 && !/now waits for the user|^Waiting for the user:/.test(text); i += 1) text = (await app.step(chat)).text;
  await tick(10);
  return text;
};

test('review: the quiet pause, made from a chain that is not the conversation\'s own while its turn runs, is made on its behalf: the turn goes on, it stays waiting', { skip: !hasGit }, async () => {
  const app = quietApp();
  try {
    const chat = app.open('c');
    assert.equal((await app.mission(chat, 'auto do one small thing in this folder please')).kind, 'success');
    chat.status = 'running';
    await toWait(app, chat);
    await tick(10);
    assert.deepEqual(app.cancels, [], 'the conductor\'s turn was not ended');
    assert.equal(app.goals.get('c').phase, 'paused');
    const view = app.runner().view('c');
    assert.deepEqual([view.waitingForYou?.quiet, view.pausedAt || 0, view.pausedBy || ''], [true, 0, '']);
    assert.equal((await app.get('c')).json.strip.state, 'waiting');
  } finally {
    app.done();
  }
});

test('review: an app that cannot pause on the conversation\'s behalf: the quiet pause waits until the conversation is idle', { skip: !hasGit }, async () => {
  const app = quietApp({ initiators: false });
  try {
    const chat = app.open('c');
    assert.equal((await app.mission(chat, 'auto do one small thing in this folder please')).kind, 'success');
    let idle;
    chat.status = 'running';
    chat.whenIdle = () => new Promise((resolve) => { idle = resolve; });
    const text = await toWait(app, chat);
    assert.match(text, /now waits for the user/, 'told not to call again');
    assert.equal(app.goals.get('c').phase, 'active', 'not paused while its turn runs');
    chat.status = 'idle';
    idle();
    await tick(10);
    assert.deepEqual(app.cancels, []);
    assert.equal(app.goals.get('c').phase, 'paused', 'paused once idle');
    assert.equal(app.runner().view('c').waitingForYou?.quiet, true);
  } finally {
    app.done();
  }
});

test('review: a turn the app ends for Mission\'s own quiet pause is not your Stop: it keeps waiting, and an answer moves it on', { skip: !hasGit }, async () => {
  const app = quietApp({ initiators: false });
  try {
    const chat = app.open('c');
    assert.equal((await app.mission(chat, 'auto do one small thing in this folder please')).kind, 'success');
    chat.status = 'running';
    await toWait(app, chat);
    await tick(10);
    assert.deepEqual(app.cancels, ['c'], 'the stand-in app ended the turn');
    const view = app.runner().view('c');
    assert.deepEqual([view.waitingForYou?.quiet, view.pausedAt || 0, view.pausedBy || ''], [true, 0, ''], 'still waiting, never "Paused (by you)"');
    const answered = await app.card({ sessionId: 'c', action: 'answer', answers: [{ id: 'q1', text: 'the second' }] });
    assert.equal(answered.status, 200, JSON.stringify(answered.json));
    assert.equal(app.goals.get('c').phase, 'active', 'the answer gives it its rounds back');
  } finally {
    app.done();
  }
});

test('review: the route gives a chat that is not open yet the Settings defaults (When it needs you, Wait for me, mode)', async () => {
  const app = appHarness({ config: { longNeeds: 'decide', longWaitAsk: 45, defaultMode: 'auto' } });
  try {
    const got = await app.defaults();
    assert.equal(got.status, 200);
    assert.deepEqual([got.json.defaults.needs, got.json.defaults.waitAsk, got.json.defaults.waitHold, got.json.mode], ['decide', 45, 0, 'auto']);
  } finally {
    app.done();
  }
});

test('review: Finish it gives back the tool permissions you gave (Allow for this Mission; Allow for this item for an item still to do), so nothing is asked twice', async () => {
  const granted = [];
  const revoked = [];
  const app = waiting({}, { grants: { grant: async (id, tool) => { granted.push(tool); return { ok: true, id: `g-${tool}-${granted.length}` }; }, revoke: async (grant) => { revoked.push(grant); } } });
  try {
    await app.runner.start(app.agent, 'paint the page', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 3, helpers: 1, waitFor: 30 } });
    await untilWaiting(app);
    const run = app.runner.runOf('conv');
    const choices = [{ id: 'item', label: 'Allow for this item' }, { id: 'mission', label: 'Allow for this Mission' }, { id: 'deny', label: 'Deny' }];
    run.approvals = run.approvals ?? [];
    run.approvals.push(
      { id: 'a8', kind: 'tool', what: 'Use Search', key: 'tool:search', tool: 'search', plain: 'Search', items: ['1'], by: '', status: 'allowed', choice: 'mission', grantId: 'g-search', choices, after: 'park', askedAt: 1 },
      { id: 'a9', kind: 'tool', what: 'Use Web fetch', key: 'tool:web_fetch', tool: 'web_fetch', plain: 'Web fetch', items: ['1'], by: '', status: 'allowed', choice: 'item', grantId: 'g-web', choices, after: 'park', askedAt: 1 },
    );
    // Wait for me runs out: one more round gives the report, and the permissions are taken back.
    assert.deepEqual(app.runner.sweep(run.long.waitingSince + 30 * 60_000 + 1, () => app.agent), ['conv']);
    await app.step();
    assert.notEqual(run.status, 'running');
    assert.deepEqual(revoked.sort(), ['g-search', 'g-web']);
    assert.notEqual(run.approvals.find((entry) => entry.id === 'a9').spent, true, 'item 1 is still to do: not used up');
    const out = await app.runner.continueRun(app.agent, { answers: [{ id: 'q1', text: 'green' }], minutes: 30 });
    assert.equal(out.ran, true, out.said);
    assert.ok(granted.includes('search'), 'Allow for this Mission is given again');
    assert.match(run.approvals.find((entry) => entry.id === 'a8').grantId, /^g-search-/);
    for (let i = 0; i < 4 && !granted.includes('web_fetch'); i += 1) { await app.step(300); await tick(10); }
    assert.ok(granted.includes('web_fetch'), 'Allow for this item is given again when item 1\'s helper starts');
    assert.equal(run.approvals.filter((entry) => entry.status === 'open').length, 0, 'nothing asked again');
  } finally {
    app.done();
  }
});

test('review: Wait for me ran out and its report round has not come: an answer that frees work goes on; Pause then Resume never ends it as "no answer came"', async () => {
  for (const how of ['answer', 'pause']) {
    const app = waiting();
    try {
      await app.runner.start(app.agent, 'paint the page', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 3, helpers: 1, waitFor: 30 } });
      await untilWaiting(app);
      const run = app.runner.runOf('conv');
      assert.deepEqual(app.runner.sweep(run.long.waitingSince + 30 * 60_000 + 1, () => app.agent), ['conv']);
      assert.deepEqual([run.long.waitOver, app.goal.phase], [true, 'active'], 'one round for the report');
      if (how === 'answer') {
        app.runner.answerMany('conv', [{ id: 'q1', text: 'green' }]);
        assert.equal(run.long.waitOver, undefined);
        assert.match(await app.step(), /item 1 of 1/, 'the answer moves it on');
      } else {
        app.runner.stop(app.agent);
        assert.equal(run.long.waitOver, undefined);
        app.runner.resume(app.agent);
        await app.step(300);
      }
      assert.equal(run.status, 'running', how);
      assert.notEqual(run.longEndKind, 'waited', how);
    } finally {
      app.done();
    }
  }
});

test('review: a restart between "Wait for me ran out" and the report round: the first sweep ends it with that report (no new wait, no restart pause)', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'mission-wait-home-')));
  const app = waiting({}, { home });
  try {
    await app.runner.start(app.agent, 'paint the page', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 3, helpers: 1, waitFor: 30 } });
    await untilWaiting(app);
    const since = app.runner.runOf('conv').long.waitingSince;
    assert.deepEqual(app.runner.sweep(since + 30 * 60_000 + 1, () => app.agent), ['conv']);
    // The app closes before the report round.
    const again = createRunner({ get: () => undefined }, { settings: () => ({ limits: { waitMinutes: 3 }, roles: {}, projects: {} }), pointsOf: () => ({}), afterCommand: async () => [], warn: () => {}, home: (sub) => join(home, sub) });
    const fired = [];
    again.onEvent((event) => fired.push(event));
    const run = again.runOf('conv');
    assert.equal(run.long.waitOver, true, 'kept');
    again.announceInterrupted('conv', run);
    assert.deepEqual([run.pausedAt ?? 0, fired.length], [0, 0], 'no restart pause, no alert');
    assert.deepEqual(again.sweep(Date.now(), () => undefined), ['conv']);
    assert.notEqual(run.status, 'running');
    assert.equal(run.longEndKind, 'waited');
    assert.match(report(run), /none came within 30 minutes/);
  } finally {
    app.done();
    rmSync(home, { recursive: true, force: true });
  }
});

test('a one-minute Wait for me says "1 minute", not "1 minutes" (point 17 lab check)', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'mission-wait-home-')));
  const app = waiting({}, { home });
  try {
    await app.runner.start(app.agent, 'paint the page', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 3, helpers: 1, waitFor: 1 } });
    await untilWaiting(app);
    const run = app.runner.runOf('conv');
    const since = run.long.waitingSince;
    app.runner.sweep(since + 60_000 + 1, () => app.agent);
    assert.match(await app.step(), /last step\. Give the user this report/);
    assert.notEqual(run.status, 'running');
    const said = report(run);
    assert.match(said, /and none came within 1 minute\./);
    assert.doesNotMatch(said, /1 minutes/);
    assert.doesNotMatch(said, /in the card to continue/, 'after the end the report points to Finish it');
  } finally {
    app.done();
  }
});
