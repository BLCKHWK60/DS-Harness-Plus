/**
 * Mission engine fixes (item 1, stage A, 19 November 2026). Each test fails on the code before the fix.
 * Runner tests use stand-in helpers; the add-on tests use a small stand-in app.
 */
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { GIT_CANDIDATES } from '../lib/checkpoints.js';
import { STARTERS, loopFor, pickRecipe, readRecipe } from '../lib/loop.js';
import { OWNER_ONLY_RULE, planPrompt, reviewPrompt, statusOf, workPrompt } from '../lib/prompts.js';
import { alwaysPasses, applyPlan, applyReview, applyWork, finish, medianStep, newRun, nextStep, noteStepTime, report } from '../lib/run.js';
import { pickEffort } from '../lib/effort.js';
import { ERROR_STREAK, FAIL_STREAK, NEVER_REACHED, PAUSED_TEXT, blockedText, createRunner, graceMs } from '../runner.js';
import { apply, budgetLine, conversationFolderExists, inTrashOf } from '../index.js';

const fresh = (name = 'mission-engine-') => realpathSync(mkdtempSync(join(tmpdir(), name)));
const hasGit = GIT_CANDIDATES.some((path) => existsSync(path));
const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
const signal = () => new AbortController().signal;

/**
 * A runner on stand-in services. `answer(spec, child)` gives a helper's result: `{text, stopReason, events, hang}`;
 * `events` are session events the helper's session emits while it works (only with `events: true`).
 */
function bench({ answer, events = false, llm, modelTiers, home } = {}) {
  const root = fresh();
  const goal = { id: 'g', revision: 1, phase: 'active' };
  let made = false;
  const calls = [];
  const goals = {
    create: () => { calls.push('create'); made = true; goal.phase = 'active'; return goal; },
    get: () => (made ? goal : undefined),
    pause: () => { calls.push('pause'); goal.phase = 'paused'; },
    resume: () => { calls.push('resume'); goal.phase = 'active'; },
    complete: () => { calls.push('complete'); goal.phase = 'complete'; },
    clear: () => { made = false; },
  };
  const listeners = [];
  const seen = [];
  let n = 0;
  const subagents = {
    startActivation: async (spec) => {
      n += 1;
      const childId = `child-${n}`;
      seen.push({ label: spec.label, effort: spec.agentOptions?.reasoningEffort, prompt: spec.prompt?.[0]?.text ?? '', childId });
      const got = (await answer?.(spec, childId)) ?? { text: 'DONE: did it' };
      if (got.throws) throw new Error(got.throws);
      for (const type of got.events ?? []) for (const listener of listeners) listener({ id: childId, header: { parentSession: 'conv' } }, { type });
      if (got.during) {
        // Answered a moment later, while the helper is at work.
        return { childId, result: new Promise((resolve) => setTimeout(() => { got.during(); resolve({ output: got.text ? [{ type: 'text', text: got.text }] : [], stopReason: got.stopReason ?? 'end', ...(got.diagnostic ? { diagnostic: got.diagnostic } : {}) }); }, 5)) };
      }
      if (got.hang) {
        let settle;
        const result = new Promise((resolve) => { settle = resolve; });
        return { childId, result, dispose: () => settle({ output: [], stopReason: 'cancelled' }) };
      }
      return { childId, result: Promise.resolve({ output: got.text ? [{ type: 'text', text: got.text }] : [], stopReason: got.stopReason ?? 'end', ...(got.diagnostic ? { diagnostic: got.diagnostic } : {}) }) };
    },
  };
  const services = { goals, subagents, ...(llm ? { llm } : {}), ...(modelTiers ? { modelTiers } : {}) };
  const ctx = { get: (name) => services[name], ...(events ? { on: (name, listener) => { if (name === 'session/event') listeners.push(listener); } } : {}) };
  const points = { take: async () => ({ id: 'p', number: 1 }), files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '' };
  const runner = createRunner(ctx, { settings: () => ({ limits: { maxItems: 12, maxTries: 3, maxReviews: 2, maxSteps: 60, waitMinutes: 3 }, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {}, home });
  const agent = { id: 'conv', model: { current: () => ({ provider: 'p', model: 'm' }) } };
  const fired = [];
  runner.onEvent((event) => fired.push(event));
  const step = () => runner.step(agent, signal(), 60000);
  const done = () => rmSync(root, { recursive: true, force: true });
  return { runner, agent, root, goal, calls, seen, fired, step, done, listeners };
}

const PLAN = (items) => JSON.stringify({ summary: 's', items, checks: [] });

// ---- 1. An empty helper answer is a failure -----------------------------------------------------

test('an empty helper answer is a failure: no try used, no 0-byte step file, and three in a row pause the run', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : { text: '', stopReason: 'end' }) });
  try {
    await app.runner.start(app.agent, 'do two small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 2 } });
    await app.step(); // plan
    const first = await app.step();
    const run = app.runner.runOf('conv');
    assert.match(first, /the helper did nothing, so this try does not count/);
    assert.equal(run.items[0].status, 'open', 'not "done; no command proves it"');
    assert.equal(run.items[0].tries, 0, 'the try is not used up');
    const dir = join(app.root, '.dsh-mission', 'runs', run.id, 'steps');
    const file = readdirSync(dir).find((name) => name.startsWith('002-item-1'));
    assert.ok(readFileSync(join(dir, file), 'utf8').length > 0, 'never a 0-byte step file');
    assert.match(readFileSync(join(dir, file), 'utf8'), /empty answer.*ended with "end"/);
    const texts = [first];
    for (let i = 1; i < FAIL_STREAK; i += 1) texts.push(await app.step());
    // Stage E: the repair helper looks at it first; here it comes back empty too, so the pause from before follows.
    assert.match(texts.at(-1), /The Mission's repair helper looks at why helpers came back with empty answers next/);
    texts.push(await app.step());
    assert.match(texts.at(-1), /The run is paused: 3 helpers in a row failed\. The last one: .* The repair helper could not run: /);
    await tick();
    assert.equal(app.goal.phase, 'paused');
    assert.equal(run.status, 'running', 'paused, not ended');
  } finally {
    app.done();
  }
});

test('an empty helper answer still runs the item\'s own check: an item that is already done is verified, and no failure is counted', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one', check: 'test -f done.txt' }, { title: 'two' }]) } : { text: '', stopReason: 'end' }) });
  try {
    await app.runner.start(app.agent, 'do two small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 2 } });
    await app.step(); // plan
    // Item 1 was done already (by an earlier worker, say): its check passes.
    writeFileSync(join(app.root, 'done.txt'), 'x');
    const first = await app.step();
    const run = app.runner.runOf('conv');
    assert.equal(run.items[0].status, 'verified', first);
    assert.doesNotMatch(first, /did nothing/);
    assert.equal(run.failStreak, 0, 'no helper failure is counted');
  } finally {
    app.done();
  }
});

test('a helper the app stopped before it reached the model says so plainly; one that ran tools but wrote no text is not empty; helperOf and runOf name it while it works', async () => {
  let during;
  const app = bench({
    events: true,
    answer: (spec, childId) => {
      if (spec.label === 'Mission: planner') return { text: PLAN([{ title: 'one' }, { title: 'two' }]), events: ['step/start'] };
      if (spec.label === 'Mission: item 1') {
        return { text: '', stopReason: 'error', diagnostic: '', during: () => { during = { helper: app.runner.helperOf(childId), conducting: app.runner.conducting('conv') }; } };
      }
      // Item 2: the model ran a tool and ended without a word.
      return { text: '', stopReason: 'end', events: ['step/start', 'tool/call', 'step/start'] };
    },
  });
  try {
    await app.runner.start(app.agent, 'do two small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 2 } });
    await app.step();
    const first = await app.step();
    assert.ok(first.includes(NEVER_REACHED), first);
    assert.equal(app.runner.runOf('conv').items[0].tries, 0);
    // Stage D: helperOf names the helper's lane too.
    assert.deepEqual(during.helper, { runId: app.runner.runOf('conv').id, role: 'implement', item: '1', lane: during.helper.lane });
    assert.match(during.helper.lane, /^L\d+$/);
    assert.deepEqual(during.conducting, { runId: app.runner.runOf('conv').id, kind: 'long' });
    assert.equal(app.runner.helperOf('child-2'), undefined, 'forgotten once it is done');
    // The next step takes item 1 again (still open); its second answer comes from the same stand-in.
    const run = app.runner.runOf('conv');
    run.items[0].status = 'verified';
    const second = await app.step();
    assert.match(second, /item 2 of 2.*done; no command proves it/, 'tools ran: it is work, for the reviewer to judge');
  } finally {
    app.done();
  }
});

// ---- 2. Thinking level ------------------------------------------------------------------------------

test('the thinking level: only one the model lists (or the nearest), none when it lists none or the tier\'s effort is off', async () => {
  assert.equal(pickEffort([], 'high', 'high'), undefined);
  assert.equal(pickEffort(['low', 'high'], 'medium', 'high'), 'low', 'the nearest listed; on a tie the lower');
  assert.equal(pickEffort(['low', 'medium', 'high'], 'medium', undefined), 'medium');
  assert.equal(pickEffort(['low', 'high'], 'high', 'off'), undefined, 'the tier says off');
  assert.equal(pickEffort(undefined, 'high', undefined), 'high', 'not known: as before, the retry is the safety net');
  for (const [efforts, tierEffort, want] of [[[], 'high', [undefined, undefined]], [[{ id: 'low' }, { id: 'high' }], 'high', ['high', 'low']], [[{ id: 'high' }], 'off', [undefined, undefined]]]) {
    const app = bench({
      llm: { resolveModelInfo: async () => ({ reasoning: { efforts } }) },
      modelTiers: { resolveTier: () => ({ id: 't', effort: tierEffort }), roleRoute: () => undefined },
      answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : { text: 'DONE: ok' }),
    });
    try {
      await app.runner.start(app.agent, 'do a small thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, effort: true } });
      await app.step();
      await app.step();
      assert.deepEqual(app.seen.slice(0, 2).map((entry) => entry.effort), want, JSON.stringify(efforts));
      assert.equal(app.seen.length, 2, 'no failed first call and retry');
    } finally {
      app.done();
    }
  }
});

// ---- 3. The status line ---------------------------------------------------------------------------

test('the worker\'s status line: BLOCKED: none is done, QUESTION keeps the question with its default, the old reading only without a status', async () => {
  assert.equal(statusOf('DONE: wrote it').kind, 'done');
  assert.equal(statusOf('**BLOCKED: none.** Item 3 is done').kind, 'done');
  assert.equal(statusOf('BLOCKED: no, all fine').kind, 'done');
  assert.equal(statusOf('BLOCKED: n/a').kind, 'done');
  assert.equal(statusOf('BLOCKED: not needed').kind, 'done');
  assert.equal(statusOf('BLOCKED: the folder is read only').kind, 'blocked');
  // A reason that only starts with "no", "none" or "nothing" is a real block.
  assert.equal(statusOf('BLOCKED: no write permission for config.json').kind, 'blocked');
  assert.equal(statusOf('BLOCKED: None of the tests can run without a database').kind, 'blocked');
  assert.equal(statusOf('**BLOCKED:** no network access').kind, 'blocked');
  assert.equal(statusOf('BLOCKED: nothing works without the key').kind, 'blocked');
  assert.equal(statusOf('BLOCKED: no, but the build fails').kind, 'blocked');
  assert.equal(statusOf('BLOCKED: none').kind, 'done');
  assert.equal(statusOf('BLOCKED: none, item 3 is done').kind, 'done');
  assert.equal(statusOf('BLOCKED: nothing; everything is done').kind, 'done');
  // Without a status line, the old reading: the same rule.
  assert.equal(statusOf('BLOCKED no write permission').kind, 'blocked');
  assert.equal(statusOf('PARTLY: two of three files').kind, 'partly');
  assert.deepEqual(statusOf('QUESTION: Which colour? | ASSUMING: blue\nwrote it'), { kind: 'question', text: 'Which colour? | ASSUMING: blue', question: 'Which colour?', assume: 'blue' });
  assert.equal(statusOf('QUESTION: Which year?\nASSUMING: 2025\nrest').assume, '2025');
  assert.equal(statusOf('BLOCKED - none').kind, 'done');
  assert.equal(statusOf('Report: BLOCKED: x').kind, 'none', 'only the first line counts');
  assert.equal(statusOf('BLOCKED by the sandbox').kind, 'blocked', 'no status: the old reading');
  assert.match(workPrompt({ goal: 'g', item: { id: '1', title: 't', tries: 0 } }), /DONE: <one sentence>[\s\S]*QUESTION: <your question for the user> \| ASSUMING:/);

  const app = bench({
    answer: (spec) => {
      if (spec.label === 'Mission: planner') return { text: PLAN([{ title: 'one' }, { title: 'two' }]) };
      if (spec.label === 'Mission: item 1') return { text: 'BLOCKED: none, item 1 is done.' };
      return { text: 'QUESTION: Which colour should the button be? | ASSUMING: blue\nMade it blue.' };
    },
  });
  try {
    await app.runner.start(app.agent, 'do two small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1 } });
    await app.step();
    await app.step();
    const run = app.runner.runOf('conv');
    assert.equal(run.items[0].status, 'unverified', '"BLOCKED: none" is not a failure');
    assert.equal(run.failStreak, 0);
    const second = await app.step();
    assert.equal(run.items[1].status, 'unverified', 'finished on the default, not failed');
    assert.match(run.items[1].note, /Assumed: blue/);
    assert.equal(run.questions.length, 1);
    assert.deepEqual({ ...run.questions[0], askedAt: 0 }, { id: 'q1', text: 'Which colour should the button be?', assume: 'blue', items: ['2'], status: 'open', askedAt: 0, from: 'item' }, 'stage C: a worker\'s question says an item asked it');
    assert.match(second, /The worker has a question for the user: Which colour/);
    finish(run, '', Date.now());
    assert.match(report(run), /Questions still open \(the run went on with the default\):\n- Which colour should the button be\? \(item 2\)\n  Default used: blue/);
  } finally {
    app.done();
  }
});

// ---- 4. Three step errors pause ---------------------------------------------------------------------

test('three step errors in a row pause the run with a plain reason (the raw error kept), and do not end it', async () => {
  const app = bench({ answer: () => ({ throws: 'model_not_found: Qwen3.8-27B-oQ8e' }) });
  try {
    await app.runner.start(app.agent, 'plan something small', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1 } });
    const texts = [];
    for (let i = 0; i < ERROR_STREAK; i += 1) texts.push(await app.step());
    // Stage E: the repair helper first; it fails the same way, so the run pauses with the same plain reason.
    assert.match(texts.at(-1), /failed 3 times in a row.*The Mission's repair helper looks at why next/);
    texts.push(await app.step());
    assert.match(texts.at(-1), /the repair helper looked at why the same step failed 3 times in a row, but it could not run.*\nThe run is paused: The model named for a helper was not found/s);
    // The pause goes through two timer hops (the hold, then its event): waited for, not a fixed moment (flaky under load).
    for (let i = 0; i < 100 && !(app.goal.phase === 'paused' && app.fired.some((event) => event.type === 'paused')); i += 1) await tick();
    const run = app.runner.runOf('conv');
    assert.equal(run.status, 'running', 'not closed');
    assert.match(run.stalled, /^Paused: The model named for a helper was not found by its provider\./);
    assert.match(run.stalledDetails, /model_not_found: Qwen3\.8-27B-oQ8e/);
    assert.equal(app.goal.phase, 'paused');
    assert.ok(app.fired.some((event) => event.type === 'paused'));
    assert.equal(app.fired.some((event) => event.type === 'finished'), false);
  } finally {
    app.done();
  }
});

// ---- 5. A paused run takes no step ------------------------------------------------------------------

test('a paused run takes no step: the step tool says so and starts no helper', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : { text: 'DONE: ok' }) });
  try {
    await app.runner.start(app.agent, 'do a small thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1 } });
    app.runner.stop(app.agent);
    const said = await app.step();
    assert.ok(said.startsWith(PAUSED_TEXT), said);
    assert.equal(app.seen.length, 0, 'no helper was started');
    assert.equal(app.runner.runOf('conv').steps, 0);
  } finally {
    app.done();
  }
});

// ---- 6. Paused time does not count ------------------------------------------------------------------

test('paused time does not count: resume moves the deadline on by the pause, and says it in the report', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : { text: 'DONE: ok' }) });
  try {
    await app.runner.start(app.agent, 'do a small thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 30, laps: 1 } });
    const run = app.runner.runOf('conv');
    const deadline = run.long.deadline;
    app.runner.stop(app.agent);
    assert.ok(run.pausedAt > 0);
    run.pausedAt -= 10 * 60000; // paused ten minutes ago
    app.runner.resume(app.agent);
    assert.equal(run.pausedAt, 0);
    assert.ok(Math.abs(run.long.deadline - deadline - 10 * 60000) < 2000, 'ten minutes later');
    assert.ok(Math.abs(run.long.pausedMs - 10 * 60000) < 2000);
    await tick();
    assert.ok(app.fired.some((event) => event.type === 'resumed'), 'told (Budget guard starts a fresh allowance)');
    finish(run, '', Date.now());
    assert.match(report(run), /It was paused for 10 minutes; that time did not count\./);
    // Paused by a problem (hold) and by the app (stopped by itself) count the same way.
    const other = bench({ answer: () => ({ text: 'x' }) });
    try {
      await other.runner.start(other.agent, 'do a small thing', { mode: 'auto', root: other.root }, { kind: 'long', long: { minutes: 30, laps: 1 } });
      other.runner.hold(other.agent, 'a problem');
      assert.ok(other.runner.runOf('conv').pausedAt > 0);
    } finally {
      other.done();
    }
  } finally {
    app.done();
  }
});

// ---- 7. The clock -----------------------------------------------------------------------------------

test('the clock (a): no new step when less time is left than the run\'s median step', () => {
  const T0 = Date.parse('2026-11-19T10:00:00Z');
  const run = newRun({ id: 'r', goal: 'g g g', mode: 'Auto', root: '/x', limits: {}, at: T0, kind: 'long', long: { minutes: 60, laps: 5 } });
  applyPlan(run, { items: [{ title: 'a' }, { title: 'b' }] });
  noteStepTime(run, 10 * 60000);
  noteStepTime(run, 12 * 60000);
  assert.equal(medianStep(run), 0, 'not before three are measured');
  assert.equal(nextStep(run, T0 + 52 * 60000).kind, 'work');
  noteStepTime(run, 8 * 60000);
  assert.equal(medianStep(run), 10 * 60000);
  assert.equal(nextStep(run, T0 + 49 * 60000).kind, 'work', '11 minutes left, a step takes 10');
  assert.deepEqual(nextStep(run, T0 + 52 * 60000), { kind: 'finish', why: 'short' }, '8 minutes left: the report instead');
  assert.equal(graceMs({ long: { minutes: 30, deadline: 1 } }), 3 * 60000);
  assert.equal(graceMs({ long: { minutes: 600, deadline: 1 } }), 10 * 60000, 'at most ten minutes');
});

test('the clock (b): a run that stopped moving past its time and grace is ended with its report; a paused one is not', async () => {
  const home = fresh('mission-engine-home-');
  const app = bench({ home: (sub) => join(home, sub), answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : { text: 'DONE: ok' }) });
  try {
    await app.runner.start(app.agent, 'do a small thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 10, laps: 1 } });
    await app.step(); // plan
    const run = app.runner.runOf('conv');
    run.long.deadline = Date.now() - graceMs(run) + 60000;
    assert.deepEqual(app.runner.sweep(Date.now(), () => app.agent), [], 'inside the grace');
    run.long.deadline = Date.now() - graceMs(run) - 1000;
    app.runner.stop(app.agent);
    assert.deepEqual(app.runner.sweep(Date.now(), () => app.agent), [], 'paused: never ended by the clock');
    app.runner.resume(app.agent);
    run.long.deadline = Date.now() - graceMs(run) - 1000;
    assert.deepEqual(app.runner.sweep(Date.now(), () => app.agent), ['conv']);
    assert.notEqual(run.status, 'running');
    assert.match(report(run), /It ended because its time was up\./);
    assert.equal(app.goal.phase, 'complete');
    await tick();
    assert.ok(app.fired.some((event) => event.type === 'finished'), 'told: keep-awake lets go, alerts go out');
    assert.ok(readFileSync(join(home, 'mission', 'runs.jsonl'), 'utf8').includes(run.id));
  } finally {
    app.done();
    rmSync(home, { recursive: true, force: true });
  }
});

test('the clock (c): a step still running past the time and grace is cut; the item keeps its try and the report says so', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : { hang: true }) });
  try {
    await app.runner.start(app.agent, 'do a small thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 10, laps: 1 } });
    await app.step(); // plan
    const under = app.runner.step(app.agent, signal(), 60000);
    await tick(20);
    const run = app.runner.runOf('conv');
    run.long.deadline = Date.now() - graceMs(run) - 1000;
    assert.deepEqual(app.runner.sweep(Date.now(), () => app.agent), ['conv']);
    const said = await under;
    assert.match(said, /^The step was cut short: the run's time was up\./);
    assert.equal(run.items[0].tries, 0, 'the item keeps its try');
    assert.match(report(run), /The last step \(item 1, "one"\) was cut short by the time limit\. It keeps its try\./);
    assert.notEqual(run.status, 'running');
  } finally {
    app.done();
  }
});

// ---- 9 and 10. After a restart, and the record kept in Mission's own folder --------------------------

test('after a restart: ended runs stay in the record and missing ones leave it; a run whose conversation is gone is closed with its report, quietly; the rest wait without keeping the Mac awake', () => {
  const home = fresh('mission-engine-home-');
  const project = fresh('mission-engine-project-');
  try {
    const write = (run) => {
      const dir = join(project, '.dsh-mission', 'runs', run.id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'run.json'), JSON.stringify(run));
      writeFileSync(join(dir, 'log.jsonl'), '');
    };
    const gone = newRun({ id: '20261113140843-dc07', goal: 'an old goal', mode: 'Auto', root: project, limits: {}, kind: 'long', long: { minutes: 60, laps: 2 } });
    applyPlan(gone, { items: [{ title: 'a' }] });
    const live = newRun({ id: '20261118200324-live', goal: 'a live goal', mode: 'Auto', root: project, limits: {} });
    const ended = newRun({ id: '20261116122318-done', goal: 'done', mode: 'Auto', root: project, limits: {} });
    finish(ended, 'You ended it.');
    for (const run of [gone, live, ended]) write(run);
    mkdirSync(join(home, 'mission'), { recursive: true });
    writeFileSync(join(home, 'mission', 'active-runs.json'), JSON.stringify({
      'session-gone': { root: project, id: gone.id },
      'session-live': { root: project, id: live.id },
      'session-ended': { root: project, id: ended.id },
      'session-folder-gone': { root: join(project, 'nowhere'), id: '20261116233547-6j85' },
    }));
    const runner = createRunner({ get: () => undefined }, { settings: () => ({ limits: {}, roles: {}, projects: {} }), pointsOf: () => ({}), afterCommand: async () => [], warn: () => {}, home: (sub) => join(home, sub) });
    const fired = [];
    runner.onEvent((event) => fired.push(event));
    const out = runner.reconcile((id) => id !== 'session-gone');
    assert.deepEqual(out.closed, ['session-gone']);
    assert.deepEqual(out.dropped.sort(), ['session-folder-gone']);
    assert.deepEqual(out.kept.map((entry) => entry.conversation), ['session-live']);
    // The ended run stays: its report, card and /mission resume still find it after the restart.
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(home, 'mission', 'active-runs.json'), 'utf8'))).sort(), ['session-ended', 'session-live']);
    assert.equal(runner.runOf('session-ended')?.id, ended.id);
    const closed = JSON.parse(readFileSync(join(project, '.dsh-mission', 'runs', gone.id, 'run.json'), 'utf8'));
    assert.equal(closed.status, 'stopped');
    assert.equal(closed.stopReason, 'Its thread is gone.');
    assert.match(readFileSync(join(project, '.dsh-mission', 'runs', gone.id, 'report.md'), 'utf8'), /^Mission stopped: 0 of 1 items done\. Its thread is gone\./);
    const lines = readFileSync(join(home, 'mission', 'runs.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.ok(lines.some((line) => line.id === gone.id && line.reason === 'Its thread is gone.'));
    assert.ok(lines.some((line) => line.id === '20261116233547-6j85' && line.reason === 'Its folder is gone.'));
    assert.ok(existsSync(join(home, 'mission', 'runs', gone.id, 'report.md')), 'the copy in Mission\'s own folder');
    // A second start adds nothing twice.
    runner.reconcile((id) => id !== 'session-gone');
    assert.equal(readFileSync(join(home, 'mission', 'runs.jsonl'), 'utf8').trim().split('\n').filter((line) => line.includes(gone.id)).length, 1);
    // The live one is told once, waits, and its time stops counting.
    runner.announceInterrupted('session-live', out.kept[0].run);
    const waiting = runner.runOf('session-live');
    // Stage E: a Mission from before stage E (no Carry on setting) comes back paused and says why.
    assert.match(waiting.stalled, /^Paused: the app restarted\. This Mission started before it could carry on by itself\./);
    assert.ok(waiting.pausedAt > 0);
    return tick().then(() => {
      assert.deepEqual(fired.map((event) => [event.type, event.conversation]), [['stopped-by-itself', 'session-live']], 'no alert for the run whose thread is gone');
    });
  } finally {
    setTimeout(() => {
      rmSync(home, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }, 50);
  }
});

test('a conversation exists while its folder is in the app\'s sessions folder; unsure counts as yes', () => {
  const sessions = fresh('mission-engine-sessions-');
  try {
    mkdirSync(join(sessions, '--Users-someone-project--', 'session-abc'), { recursive: true });
    assert.equal(conversationFolderExists(sessions, 'session-abc'), true);
    assert.equal(conversationFolderExists(sessions, 'session-gone'), false);
    assert.equal(conversationFolderExists(join(sessions, 'missing'), 'session-gone'), true, 'no sessions folder to read: unsure');
    assert.equal(conversationFolderExists(sessions, '../x'), true, 'not a plain name: unsure');
  } finally {
    rmSync(sessions, { recursive: true, force: true });
  }
});

test('the run\'s record is kept in Mission\'s own folder after every step and at the end; never for a Recon run', async () => {
  const home = fresh('mission-engine-home-');
  const app = bench({ home: (sub) => join(home, sub), answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : { text: 'DONE: ok' }) });
  try {
    await app.runner.start(app.agent, 'do a small thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1 } });
    await app.step();
    const run = app.runner.runOf('conv');
    const dir = join(home, 'mission', 'runs', run.id);
    const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
    assert.equal(summary.goal, 'do a small thing');
    assert.equal(summary.items.length, 1);
    assert.ok(readFileSync(join(dir, 'log.jsonl'), 'utf8').includes('"kind":"plan"'));
    app.runner.end(app.agent);
    assert.match(readFileSync(join(dir, 'report.md'), 'utf8'), /You ended it/);
  } finally {
    app.done();
  }
  const recon = bench({ home: (sub) => join(home, sub), answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : { text: 'DONE: ok' }) });
  try {
    await recon.runner.start(recon.agent, 'a secret goal here', { mode: 'restricted', root: recon.root }, { kind: 'long', long: { minutes: 60, laps: 1, isolated: true } });
    await recon.step();
    const id = recon.runner.runOf('conv').id;
    recon.runner.end(recon.agent);
    assert.equal(existsSync(join(home, 'mission', 'runs', id)), false, 'Recon never shares');
  } finally {
    recon.done();
    rmSync(home, { recursive: true, force: true });
  }
});

// ---- 11. Checks that always pass, or that may be inverted -------------------------------------------

test('a check that always passes counts as no check; one that may be inverted is noted, and the reviewer may replace it without using a try', async () => {
  assert.equal(alwaysPasses('grep -c TODO a.js | wc -l'), true);
  assert.equal(alwaysPasses('ls src | sort'), true);
  assert.equal(alwaysPasses('cat a.txt | head -3'), true);
  assert.equal(alwaysPasses('grep -q x a | /usr/bin/cat'), true);
  assert.equal(alwaysPasses('test $(grep -c x f | wc -l) -ge 1'), false, 'the form the check rule recommends');
  assert.equal(alwaysPasses('grep -q done a.md'), false);
  assert.equal(alwaysPasses('echo fine > /dev/null && echo ok'), false, 'no pipeline');
  assert.equal(alwaysPasses('ls | wc -l && test -f a'), false, 'the last command decides');
  // tail, tee and the other printers exit 0 whatever the tests did; so does a list that ends in "|| true".
  assert.equal(alwaysPasses('npm test 2>&1 | tail -5'), true);
  assert.equal(alwaysPasses('pytest | tee out.txt'), true);
  assert.equal(alwaysPasses('make check | uniq'), true);
  assert.equal(alwaysPasses('npm test || true'), true);
  assert.equal(alwaysPasses('npm test; :'), true);
  assert.equal(alwaysPasses('npm test'), false);
  assert.equal(alwaysPasses('npm test 2>&1 | grep -q passing'), false);
  const run = newRun({ id: 'r', goal: 'g g g', mode: 'Auto', root: '/x', limits: {} });
  applyPlan(run, { items: [{ title: 'Count', check: 'grep TODO a.js | wc -l' }, { title: 'Keep', check: 'grep -q x a' }], checks: ['npm test | cat', 'npm test'] });
  assert.equal(run.items[0].check, '');
  assert.match(run.items[0].note, /always passed/);
  assert.equal(run.items[1].check, 'grep -q x a');
  assert.deepEqual(run.checks, ['npm test']);

  const app = bench({
    answer: (spec) => {
      if (spec.label === 'Mission: planner') return { text: PLAN([{ title: 'Remove the old name', check: 'grep -q oldname notes.txt' }]) };
      if (spec.label === 'Mission: reviewer') return { text: JSON.stringify({ verdict: 'changes', items: [{ id: '1', ok: false, note: 'inverted', check: '! grep -q oldname notes.txt' }] }) };
      return { text: 'DONE: removed it; the check passes now.' };
    },
  });
  try {
    writeFileSync(join(app.root, 'notes.txt'), 'the new name\n');
    await app.runner.start(app.agent, 'remove the old name', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 2 } });
    await app.step();
    const worked = await app.step();
    const item = app.runner.runOf('conv').items[0];
    assert.match(worked, /may be inverted/);
    assert.equal(item.maybeInverted, true);
    applyReview(app.runner.runOf('conv'), { verdict: 'changes', items: [{ id: '1', ok: false, check: '! grep -q oldname notes.txt' }] });
    assert.equal(item.check, '! grep -q oldname notes.txt');
    assert.equal(item.status, 'open');
    assert.equal(item.tries, 0, 'the inverted try does not count');
    assert.match(reviewPrompt({ goal: 'g', list: '', checks: '', changes: '', last: false }), /check may be inverted/);
  } finally {
    app.done();
  }
});

// ---- 12. The recipe pick and the format check ---------------------------------------------------------

test('the recipe pick needs two real hits and breaks ties by the tab; a shape alone never reopens an item whose command passed', () => {
  const recipes = STARTERS.map(readRecipe);
  assert.equal(pickRecipe('make a list of the five best options for the kitchen', recipes), undefined, '"list" alone picked the extraction recipe (run kc3j)');
  assert.equal(pickRecipe('extract the fields from the invoice as json', recipes).id, 'extraction');
  assert.equal(pickRecipe('make a csv table of the numbers', recipes).id, 'data-question');
  // A tie: one research word and one writing word, twice each.
  const tie = 'research sources and write a summary';
  assert.equal(pickRecipe(tie, recipes, 'cowork').id, 'research-question', 'the first one otherwise');
  const writingFirst = [recipes.find((recipe) => recipe.id === 'writing-piece'), recipes.find((recipe) => recipe.id === 'research-question')];
  assert.equal(pickRecipe(tie, writingFirst, 'cowork').id, 'writing-piece');
  assert.equal(pickRecipe(tie, writingFirst, 'research').id, 'research-question', 'Research favours research');
  assert.equal(pickRecipe(tie, writingFirst, 'scout').id, 'research-question', 'so does Scout');
  assert.equal(loopFor({ tabOn: true, goal: tie, recipes: writingFirst, tab: 'scout' }).kind, 'research');

  const run = newRun({ id: 'r', goal: 'g g g', mode: 'Auto', root: '/x', limits: {} });
  run.loop = { retries: 3 };
  applyPlan(run, { items: [{ title: 'A', check: 'true' }] });
  applyWork(run, '1', { check: { ok: true, output: '' }, loopFail: 'The answer does not fit the fixed shape.', loopFailBy: 'format' });
  assert.equal(run.items[0].status, 'verified', 'not reopened');
  assert.match(run.items[0].note, /^Format \(advice only/);
});

test('workers get the recipe\'s shape', async () => {
  const loop = loopFor({ tabOn: true, depth: 'quick', goal: 'extract the fields from the invoice as json', recipes: STARTERS.map(readRecipe) });
  assert.equal(loop.kind, 'extraction');
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'Pull the fields' }]) } : { text: 'DONE: ok\n{"done": true, "summary": "s", "sources": [], "answer": {"items": []}}' }) });
  try {
    await app.runner.start(app.agent, 'extract the fields from the invoice as json', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1 }, loop });
    await app.step();
    await app.step();
    const worker = app.seen.find((entry) => entry.label === 'Mission: item 1');
    assert.match(worker.prompt, /Here "answer" must be a JSON object with "items"\./);
  } finally {
    app.done();
  }
});

// ---- 13 and 14. The plan sized to the time; nothing only the owner can do ------------------------------

test('the planner is told the time and that only helpers\' work belongs in the plan; a plan that does not fit says so at once and keeps a question with a default', async () => {
  assert.ok(planPrompt({ goal: 'g', root: '/r', files: '', maxItems: 5, minutes: 10 }).includes('This run has about 10 minutes in all. Size the plan to fit that time'));
  assert.ok(!planPrompt({ goal: 'g', root: '/r', files: '', maxItems: 5 }).includes('minutes in all'), 'a /mission run has no time');
  assert.ok(planPrompt({ goal: 'g', root: '/r', files: '', maxItems: 5 }).includes(OWNER_ONLY_RULE));
  assert.ok(reviewPrompt({ goal: 'g', list: '', checks: '', changes: '', last: false }).includes(OWNER_ONLY_RULE));
  const items = Array.from({ length: 6 }, (_, index) => ({ title: `item ${index + 1}` }));
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: JSON.stringify({ items, checks: [], questions: [{ question: 'Which city is home?', default: 'Berlin' }] }) } : { text: 'DONE: ok' }) });
  try {
    await app.runner.start(app.agent, 'do six small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 10, laps: 1 } });
    const planned = await app.step();
    assert.match(app.seen[0].prompt, /This run has about 10 minutes in all/);
    assert.match(planned, /This plan needs about 35 minutes, but the run has (9|10) left\. It will do the most important items first and list the rest in its report\. About 45 minutes would fit, with some time to spare\./);
    const run = app.runner.runOf('conv');
    const time = run.questions.find((question) => question.kind === 'time');
    assert.equal(time.assume, 'I will do the most important items and list the rest.');
    assert.equal(time.recommend, 45);
    assert.ok(run.questions.some((question) => question.text === 'Which city is home?' && question.assume === 'Berlin'));
    assert.match(planned, /Questions for the user \(the run goes on with the default\):\n- Which city is home\? \(default: Berlin\)/);
  } finally {
    app.done();
  }
});

// ---- The add-on in a stand-in app: blocked goals, the paused step tool, the services, the Tool ledger ---

function standIn({ toolLedger, sessions } = {}) {
  const home = fresh('mission-engine-app-');
  const goals = new Map();
  const handlers = new Map();
  const tools = {};
  const commands = {};
  const agents = new Map();
  const provided = {};
  const helpers = [];
  const services = {
    dshHomePath: (sub) => join(home, sub),
    modes: { isolated: () => false, get: () => 'cowork', readOnly: () => false, longTools: () => ({ files: true, web: true }), refreshTools: () => {}, depthOf: () => 'standard' },
    modelTiers: { resolveTier: () => null, roleRoute: () => undefined },
    sandboxPolicy: { resolve: () => ({ mode: 'workspace-write' }) },
    permissionPresets: { current: () => 'workspace-write', set: () => {} },
    agents: { list: () => [...agents.values()], get: (id) => agents.get(id) },
    goals: {
      create: (agent) => { const goal = { id: `g-${agent.id}`, revision: 1, phase: 'active' }; goals.set(agent.id, goal); return goal; },
      get: (agent) => goals.get(agent.id),
      pause: (agent) => { goals.get(agent.id).phase = 'paused'; },
      resume: (agent) => { if (goals.get(agent.id).phase === 'blocked') throw new Error('GOAL_INVALID_TRANSITION'); goals.get(agent.id).phase = 'active'; },
      complete: (agent) => { goals.get(agent.id).phase = 'complete'; },
      clear: (agent) => { goals.delete(agent.id); },
    },
    subagents: { startActivation: async (spec) => { helpers.push(spec.label); throw new Error('no helpers in this test'); } },
    ...(toolLedger ? { toolLedger } : {}),
    ...(sessions ? { sessions } : {}),
  };
  const ctx = {
    logger: { warn: () => {}, info: () => {} },
    get: (name) => services[name],
    effect: (start) => start(),
    provide: (name, service) => { provided[name] = service; return () => {}; },
    on: (name, handler) => { handlers.set(name, [...(handlers.get(name) ?? []), handler]); return () => {}; },
    inject: (_deps, fn) => fn({
      effect: (start) => start(),
      tools: { register: (spec) => { tools[spec.name] = spec; return () => {}; } },
      commands: { register: (spec) => { commands[spec.name] = spec; return () => {}; } },
      webServer: { register: () => () => {} },
      connection: { requestRejection: () => undefined },
    }),
  };
  apply(ctx, { longKeepAwake: false });
  const folders = [home];
  const open = (id) => {
    const cwd = fresh();
    folders.push(cwd);
    const agent = { id, header: { cwd }, session: { id, header: { cwd }, append: () => {} }, model: { current: () => ({ provider: 'p', model: 'm' }) } };
    agents.set(id, agent);
    return agent;
  };
  const emit = (name, ...args) => { for (const handler of handlers.get(name) ?? []) handler(...args); };
  const preExecute = async (exec) => {
    let decision = { kind: 'allow' };
    for (const handler of handlers.get('tools/pre-execute') ?? []) decision = await handler(exec, async () => decision);
    return decision;
  };
  return {
    home, goals, helpers, provided, open, emit, preExecute,
    mission: (agent, rawInput) => commands.mission.handler({ agent, rawInput }),
    step: (agent) => tools.mission_step.execute({}, { agent, signal: new AbortController().signal }),
    done: () => { for (const folder of folders) rmSync(folder, { recursive: true, force: true }); },
  };
}

test('the step tool refuses while the run is paused, and starts no helper', { skip: !hasGit }, async () => {
  const app = standIn();
  try {
    const chat = app.open('c1');
    assert.equal((await app.mission(chat, 'auto do one small thing here')).kind, 'success');
    await app.mission(chat, 'stop');
    const said = await app.step(chat);
    assert.ok(said.text.startsWith(PAUSED_TEXT), said.text);
    assert.deepEqual(app.helpers, [], 'no helper was started');
  } finally {
    app.done();
  }
});

test('the app\'s goal of a run is blocked: the run pauses with the reason in plain words; Resume gives it a new goal', { skip: !hasGit }, async () => {
  const app = standIn();
  try {
    const chat = app.open('c2');
    assert.equal((await app.mission(chat, 'auto do one small thing here')).kind, 'success');
    const goal = app.goals.get('c2');
    goal.phase = 'blocked';
    app.emit('goal/changed', { agent: chat, change: { operation: 'block', ref: { id: goal.id, revision: 2 }, goal: { ...goal, blockedReason: { code: 'round-limit', message: 'Goal reached its configured limit of 3000 rounds.' } } } });
    await tick();
    const view = app.provided.mission.view('c2');
    assert.match(view.stalled, /^Paused: The app's limit of rounds for this run was reached\./);
    assert.match(view.stalledDetails, /round-limit/);
    assert.ok(view.pausedAt > 0);
    assert.ok((await app.step(chat)).text.startsWith(PAUSED_TEXT));
    const resumed = await app.mission(chat, 'resume');
    assert.match(resumed.text, /^Mission carries on/);
    assert.equal(app.goals.get('c2').phase, 'active', 'a blocked goal cannot be resumed: a new one');
    // The Budget guard said why first: its reason is kept when the goal is blocked after it.
    app.provided.mission.budgetStopped('c2', 'This Long run reached its own limit of 5,000 steps.');
    await tick();
    app.goals.get('c2').phase = 'blocked';
    app.emit('goal/changed', { agent: chat, change: { operation: 'block', goal: { phase: 'blocked', blockedReason: { code: 'prompt-rejected', message: 'x' } } } });
    await tick();
    // Stage E: a stop saved before the rename is shown as Mission.
    assert.match(app.provided.mission.view('c2').stalled, /^Paused by the Budget guard: this Mission reached its own limit of 5,000 steps\. Raise it in Settings → Budget, then press Resume\.$/);
    assert.match(blockedText({ code: 'prompt-rejected' }), /refused the run's next round/);
  } finally {
    app.done();
  }
});

test('the service: helperOf and runOf never throw; the Tool ledger hears what the conductor guard refused, and a broken ledger changes nothing', { skip: !hasGit }, async () => {
  const notes = [];
  let broken = false;
  const app = standIn({ toolLedger: { note: (event) => { if (broken) throw new Error('ledger down'); notes.push(event); } } });
  try {
    const chat = app.open('c3');
    assert.equal(app.provided.mission.helperOf('nobody'), undefined);
    assert.equal(app.provided.mission.runOf('c3'), undefined);
    assert.equal((await app.mission(chat, 'auto do one small thing here')).kind, 'success');
    assert.deepEqual(app.provided.mission.runOf('c3'), { runId: app.provided.mission.view('c3').id, kind: 'long' });
    assert.equal(app.provided.mission.helperOf(undefined), undefined);
    const denied = await app.preExecute({ agent: chat, name: 'bash', arguments: { command: 'ls' }, callId: 'x' });
    assert.equal(denied.kind, 'deny');
    // The note names its call (exec), so the ledger joins it to exactly that call.
    assert.deepEqual(notes.map(({ exec: _exec, ...rest }) => rest), [{ sessionId: 'c3', tool: 'bash', outcome: 'refused', rule: 'mission-conductor', by: 'dsh-mission' }]);
    assert.equal(notes[0].exec?.name, 'bash');
    broken = true;
    assert.equal((await app.preExecute({ agent: chat, name: 'bash', arguments: { command: 'ls' }, callId: 'y' })).kind, 'deny');
  } finally {
    app.done();
  }
});

// ---- 15. The Budget guard line in the pre-flight ---------------------------------------------------------

test('the pre-flight prints the Budget guard numbers that really apply to a Long run', () => {
  assert.equal(budgetLine(undefined), 'Budget guard is off.');
  assert.match(budgetLine({ maxSteps: 538, maxLongSteps: 5000, maxTokens: 20000000, maxLongTokens: 60000000 }), /5,000 requests and 60,000,000 tokens/);
  assert.match(budgetLine({ maxSteps: 538, maxLongSteps: 0, maxTokens: 5000000, maxLongTokens: 60000000 }), /538 requests and 5,000,000 tokens/, 'no allowance set: the ordinary limits; a saved token limit wins');
  assert.match(budgetLine({ maxSteps: 0, maxLongSteps: 5000, maxTokens: 0 }), /no limit on requests and no limit on tokens/);
  assert.equal(budgetLine({ enabled: false }), 'Budget guard is off.');
  assert.match(budgetLine({}, { enabled: true, steps: 7000, tokens: 1000, dayTokens: 50 }), /7,000 requests and 1,000 tokens, and still stops at 50 tokens a day/, 'Budget guard\'s own answer first');
});


// ---- Review fixes of 19 November 2026 ------------------------------------------------------------------

/** A runner on a home and a project folder, with a stand-in goal service; `index` is active-runs.json. */
function restarted(home, index) {
  mkdirSync(join(home, 'mission'), { recursive: true });
  writeFileSync(join(home, 'mission', 'active-runs.json'), JSON.stringify(index));
  const goals = new Map();
  const service = {
    create: (agent) => { const goal = { id: `g-${agent.id}`, revision: 1, phase: 'active' }; goals.set(agent.id, goal); return goal; },
    get: (agent) => goals.get(agent.id),
    pause: (agent) => { goals.get(agent.id).phase = 'paused'; },
    resume: (agent) => { goals.get(agent.id).phase = 'active'; },
    complete: (agent) => { goals.get(agent.id).phase = 'complete'; },
    clear: (agent) => { goals.delete(agent.id); },
  };
  return createRunner({ get: (name) => (name === 'goals' ? service : undefined) }, { settings: () => ({ limits: {}, roles: {}, projects: {} }), pointsOf: () => ({}), afterCommand: async () => [], warn: () => {}, home: (sub) => join(home, sub) });
}
const writeRun = (project, run) => {
  const dir = join(project, '.dsh-mission', 'runs', run.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'run.json'), JSON.stringify(run));
  writeFileSync(join(dir, 'log.jsonl'), '');
  return dir;
};

test('after a restart, an ended run with an item that waits for your yes is still found, and /mission resume takes it up again', () => {
  const home = fresh('mission-engine-home-');
  const project = fresh('mission-engine-project-');
  try {
    const run = newRun({ id: '20261119100000-asid', goal: 'a goal', mode: 'Auto', root: project, limits: {} });
    applyPlan(run, { items: [{ title: 'a' }, { title: 'b' }] });
    run.items[0].status = 'verified';
    run.items[1].status = 'aside';
    run.items[1].tries = 1;
    finish(run, 'Waiting for your yes.');
    writeRun(project, run);
    const runner = restarted(home, { 'session-aside': { root: project, id: run.id } });
    const out = runner.reconcile(() => true);
    assert.deepEqual(out.dropped, []);
    assert.ok(JSON.parse(readFileSync(join(home, 'mission', 'active-runs.json'), 'utf8'))['session-aside'], 'the entry stays');
    assert.equal(runner.runOf('session-aside')?.id, run.id, 'its card and /mission report still find it');
    assert.match(runner.status({ id: 'session-aside' }), /\S/);
    const said = runner.resume({ id: 'session-aside' });
    assert.match(said, /Mission carries on from step \d+, with 1 item taken up again/);
    assert.equal(runner.runOf('session-aside').status, 'running');
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test('after a restart, a run that cannot be read just now is kept: a half-written file, no permission, a disk not mounted, a folder in the Cowork trash', () => {
  const home = fresh('mission-engine-home-');
  const project = fresh('mission-engine-project-');
  try {
    const half = newRun({ id: '20261119100000-half', goal: 'g', mode: 'Auto', root: project, limits: {} });
    writeFileSync(join(writeRun(project, half), 'run.json'), '{"id":"20261119100000-ha');
    const locked = newRun({ id: '20261119100000-lock', goal: 'g', mode: 'Auto', root: project, limits: {} });
    const lockedFile = join(writeRun(project, locked), 'run.json');
    chmodSync(lockedFile, 0o000);
    // The run folder is there but its run.json is not (a folder still syncing).
    mkdirSync(join(project, '.dsh-mission', 'runs', '20261119100000-sync'), { recursive: true });
    const index = {
      'session-half': { root: project, id: half.id },
      'session-locked': { root: project, id: locked.id },
      'session-sync': { root: project, id: '20261119100000-sync' },
      'session-unmounted': { root: '/Volumes/no-such-disk-for-this-test/project', id: '20261119100000-disk' },
      'session-trashed': { root: join(project, 'scratch-moved-to-trash'), id: '20261119100000-tras' },
      'session-gone': { root: join(project, 'deleted'), id: '20261119100000-gone' },
    };
    const runner = restarted(home, index);
    const out = runner.reconcile(() => true, (id) => id === 'session-trashed');
    chmodSync(lockedFile, 0o600);
    assert.deepEqual(out.dropped, ['session-gone'], 'only the folder that is surely gone');
    assert.deepEqual(out.kept, []);
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(home, 'mission', 'active-runs.json'), 'utf8'))).sort(), Object.keys(index).filter((id) => id !== 'session-gone').sort());
    const lines = existsSync(join(home, 'mission', 'runs.jsonl')) ? readFileSync(join(home, 'mission', 'runs.jsonl'), 'utf8') : '';
    assert.ok(lines.includes('20261119100000-gone'));
    for (const id of ['half', 'lock', 'sync', 'disk', 'tras']) assert.ok(!lines.includes(`20261119100000-${id}`), `no "folder is gone" line for ${id}`);
    // Readable again on the next start: found as before.
    assert.equal(runner.runOf('session-locked')?.id, locked.id);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test('a conversation in the Cowork trash counts as there: Put back can still bring it back', () => {
  const trash = { ready: () => true, find: (id) => (id === 'in-trash' ? { row: 'in-trash', state: 'moved', erasing: false } : id === 'erasing' ? { row: 'erasing', state: 'moved', erasing: true } : undefined) };
  assert.equal(inTrashOf(trash, 'in-trash'), true);
  assert.equal(inTrashOf(trash, 'erasing'), false, 'being deleted for good');
  assert.equal(inTrashOf(trash, 'other'), false);
  assert.equal(inTrashOf(undefined, 'in-trash'), false, 'no Cowork sidebar');
  assert.equal(inTrashOf({ ready: () => false, find: () => undefined }, 'x'), undefined, 'not read yet: unsure');
  assert.equal(inTrashOf({ find: () => { throw new Error('x'); } }, 'x'), undefined);
  // In reconcile, a run whose conversation is in the trash is kept, not closed.
  const home = fresh('mission-engine-home-');
  const project = fresh('mission-engine-project-');
  try {
    const run = newRun({ id: '20261119100000-keep', goal: 'g', mode: 'Auto', root: project, limits: {} });
    writeRun(project, run);
    const runner = restarted(home, { 'in-trash': { root: project, id: run.id } });
    const exists = (id) => inTrashOf(trash, id) !== false;
    const out = runner.reconcile(exists, (id) => inTrashOf(trash, id));
    assert.deepEqual(out.closed, []);
    assert.deepEqual(out.kept.map((entry) => entry.conversation), ['in-trash']);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test('a goal resumed outside Mission (the app\'s own Resume) ends the pause: the clock watches the run again, and the pause is added to the deadline once', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : { text: 'DONE: ok' }) });
  try {
    await app.runner.start(app.agent, 'do two things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 30, laps: 1 } });
    const run = app.runner.runOf('conv');
    const deadline = run.long.deadline;
    app.runner.stop(app.agent);
    run.pausedAt -= 10 * 60000; // paused ten minutes ago
    // Resumed through the app's goal (Web's Resume, /goal resume), not through Mission.
    app.goal.phase = 'active';
    await app.step();
    assert.equal(run.pausedAt, 0, 'no longer marked paused');
    assert.ok(Math.abs(run.long.deadline - deadline - 10 * 60000) < 2000, 'moved on by the pause');
    assert.equal(run.stalled, '');
    // A second pause and a Mission Resume add only the second pause.
    app.runner.stop(app.agent);
    run.pausedAt -= 5 * 60000;
    app.runner.resume(app.agent);
    assert.ok(Math.abs(run.long.deadline - deadline - 15 * 60000) < 4000, 'ten and five minutes, never the working time between');
    // And the wall clock sees it again.
    run.long.deadline = Date.now() - graceMs(run) - 1000;
    assert.deepEqual(app.runner.sweep(Date.now(), () => app.agent), ['conv']);
  } finally {
    app.done();
  }
});

test('the clock (d): a step that finished with nobody waiting for it does not keep a run that stopped moving from being ended', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : { text: 'DONE: ok', during: () => {} }) });
  try {
    await app.runner.start(app.agent, 'do two things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 30, laps: 1 } });
    await app.step(); // plan
    // A PTC call waits only a moment: "still working". The step then finishes, and no call comes for it.
    const said = await app.runner.step(app.agent, signal(), 1);
    assert.match(said, /^Still working/);
    await tick(60);
    assert.equal(app.runner.stepOf('conv')?.done, true);
    const run = app.runner.runOf('conv');
    run.long.deadline = Date.now() - graceMs(run) - 1000;
    assert.deepEqual(app.runner.sweep(Date.now(), () => app.agent), ['conv']);
    assert.notEqual(run.status, 'running');
    assert.match(report(run), /It ended because its time was up\./);
  } finally {
    app.done();
  }
});

test('a run that pauses itself (a problem, Budget guard, a blocked goal) also says it stopped by itself, so its alerts go out', async () => {
  const app = bench({ answer: () => ({ text: 'x' }) });
  try {
    await app.runner.start(app.agent, 'do a small thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 30, laps: 1 } });
    app.runner.hold(app.agent, 'the model server did not answer');
    await tick();
    assert.ok(app.fired.some((event) => event.type === 'paused'));
    const stopped = app.fired.find((event) => event.type === 'stopped-by-itself');
    assert.equal(stopped?.why, 'problem');
    // Your own pause is not "by itself".
    const mine = bench({ answer: () => ({ text: 'x' }) });
    try {
      await mine.runner.start(mine.agent, 'do a small thing', { mode: 'auto', root: mine.root }, { kind: 'long', long: { minutes: 30, laps: 1 } });
      mine.runner.stop(mine.agent);
      await tick();
      assert.ok(!mine.fired.some((event) => event.type === 'stopped-by-itself'));
    } finally {
      mine.done();
    }
  } finally {
    app.done();
  }
});

test('a run ended while paused counts its last pause as paused in the report', async () => {
  const app = bench({ answer: () => ({ text: 'x' }) });
  try {
    await app.runner.start(app.agent, 'do a small thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 90, laps: 1 } });
    const run = app.runner.runOf('conv');
    app.runner.stop(app.agent);
    run.pausedAt -= 40 * 60000;
    app.runner.end(app.agent);
    assert.ok(Math.abs(run.long.pausedMs - 40 * 60000) < 2000);
    assert.match(report(run), /It was paused for 40 minutes; that time did not count\./);
  } finally {
    app.done();
  }
});

// ---- Stage B review (19 November): a pause made outside Mission stops the run's clock too ------------------

test('a goal paused outside Mission (the app\'s Stop, /goal pause): the run is marked paused, the wall clock leaves it alone, and Resume moves the deadline on', async () => {
  const home = fresh('mission-engine-home-');
  const app = bench({ home: (sub) => join(home, sub), answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : { text: 'DONE: ok' }) });
  try {
    await app.runner.start(app.agent, 'do a small thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 120, laps: 2 } });
    await app.step(); // plan
    const run = app.runner.runOf('conv');
    const deadline = run.long.deadline;
    // The app paused the goal by itself, three hours ago.
    app.goal.phase = 'paused';
    const at = Date.now() - 3 * 3600000;
    assert.equal(app.runner.pausedOutside(app.agent, at), true);
    assert.equal(run.pausedAt, at);
    assert.equal(run.pausedBy, 'app');
    assert.equal(app.runner.pausedOutside(app.agent), false, 'once');
    // The conversation is closed meanwhile (no agent): the clock still leaves a paused run alone.
    assert.deepEqual(app.runner.sweep(Date.now(), () => undefined), [], 'paused: never ended as time up');
    assert.equal(run.status, 'running');
    app.runner.resume(app.agent);
    assert.ok(run.long.deadline - deadline >= 3 * 3600000 - 1000, 'the three hours are added to the deadline');
    assert.deepEqual(app.runner.sweep(Date.now(), () => app.agent), [], 'after Resume it is not ended at once');
    // Mission's own Pause is not counted again.
    app.runner.stop(app.agent);
    assert.equal(run.pausedBy, 'you');
    assert.equal(app.runner.pausedOutside(app.agent), false);
  } finally {
    app.done();
    rmSync(home, { recursive: true, force: true });
  }
});

test('the add-on: a goal/changed "pause" from outside marks a running run paused by the app', { skip: !hasGit }, async () => {
  const app = standIn();
  try {
    const chat = app.open('c9');
    assert.equal((await app.mission(chat, 'auto do one small thing here')).kind, 'success');
    app.goals.get('c9').phase = 'paused';
    app.emit('goal/changed', { agent: chat, change: { operation: 'pause', goal: { phase: 'paused' } } });
    await tick(20);
    const view = app.provided.mission.view('c9');
    assert.ok(view.pausedAt > 0, 'the clock stopped');
    assert.equal(view.pausedBy, 'app');
  } finally {
    app.done();
  }
});
