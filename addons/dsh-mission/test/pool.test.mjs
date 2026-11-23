/**
 * Mission stage D (20 November 2026): the helper pool. Several helpers work on checklist items at once; checks and the
 * review run when the pool has drained; Pause, End, the clock and the Budget guard stop every helper; one helper at once
 * is stage C. Runner tests on stand-in helpers that the test lets finish in any order.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { applyPlan, itemState, newRun, nextStep, report } from '../lib/run.js';
import { joinTold, poolLine, stillWorking, waitingText } from '../lib/pool.js';
import { graceMs } from '../runner.js';
import { APPROVE, PLAN, bench, holdItems, tick } from './bench-pool.mjs';


test('the next step with a pool: with nothing parked, blocked or in flight it is exactly the next step without one', () => {
  const now = 1_000_000;
  const states = [];
  const base = () => newRun({ id: 'r', goal: 'g', mode: 'Full Auto', root: '/x', limits: {}, checkpoint: 1, kind: 'long', long: { minutes: 60, laps: 3 }, at: now });
  const run = base();
  states.push(structuredClone(run));
  applyPlan(run, { items: [{ title: 'one' }, { title: 'two', after: [1] }], checks: ['true'] });
  states.push(structuredClone(run));
  run.items[0].status = 'verified';
  states.push(structuredClone(run));
  run.items[1].status = 'stuck';
  states.push(structuredClone(run));
  run.phase = 'checks';
  states.push(structuredClone(run));
  run.phase = 'review';
  run.long.lapEnded = true;
  states.push(structuredClone(run));
  run.long.emptyLaps = 2;
  states.push(structuredClone(run));
  run.long.lap = 3;
  states.push(structuredClone(run));
  const late = base();
  states.push({ ...structuredClone(late), long: { ...late.long, deadline: now - 1 } });
  states.push({ ...structuredClone(late), steps: 999 });
  for (const state of states) {
    const pool = { busy: new Set(), inflight: 0, exclusive: false, hold: () => '' };
    assert.deepEqual(nextStep(state, now, pool), nextStep(state, now), JSON.stringify({ phase: state.phase, items: state.items.map((item) => item.status) }));
  }
});

test('the next step with a pool: busy items are skipped, items wait for what they need, drain while in flight, wait for you only when nothing else can move', () => {
  const now = 1_000_000;
  const run = newRun({ id: 'r', goal: 'g', mode: 'Full Auto', root: '/x', limits: {}, checkpoint: 1, kind: 'long', long: { minutes: 60, laps: 3 }, at: now });
  applyPlan(run, { items: [{ title: 'one' }, { title: 'two', after: [1] }, { title: 'three' }], checks: [] });
  assert.deepEqual(run.items.map((item) => item.after ?? []), [[], ['1'], []], 'the planner\'s "after": only earlier items, as ids');
  const pool = (busy = [], extra = {}) => ({ busy: new Set(busy), inflight: busy.length, exclusive: false, hold: () => '', ...extra });
  assert.equal(nextStep(run, now, pool(['1'])).item.id, '3', 'item 2 waits for item 1; item 3 is free');
  assert.equal(nextStep(run, now, pool(['1', '3'])).kind, 'drain');
  assert.equal(nextStep(run, now, pool(['1'], { exclusive: true })).kind, 'drain', 'nothing starts beside the checks or the review');
  run.items[0].status = 'parked';
  run.items[2].status = 'verified';
  assert.equal(itemState(run, run.items[1], pool()), 'parked', 'held up only by a parked item');
  assert.equal(nextStep(run, now, pool()).kind, 'review', 'the lap\'s checks and review come first');
  run.phase = 'review';
  run.long.lapEnded = true;
  assert.equal(nextStep(run, now, pool()).kind, 'wait-you');
  assert.equal(nextStep(run, now, pool(['3'])).kind, 'drain');
  run.items[0].status = 'open';
  run.items[0].recheck = true;
  assert.equal(nextStep(run, now, pool()).kind, 'recheck', 'an item that needs it waits for the recheck, which runs once nothing is in flight');
  assert.equal(nextStep(run, now, pool(['3'])).kind, 'drain');
  run.long.deadline = now - 1;
  assert.deepEqual(nextStep(run, now, pool(['3'])), { kind: 'drain', why: 'time' }, 'time up with helpers at work: they finish first');
  assert.deepEqual(nextStep(run, now, pool()), { kind: 'finish', why: 'time' });
});

test('three helpers at once: the plan, then three items worked at the same time, finishing out of order; checks and the review only once the pool drained', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }, { title: 'three' }, { title: 'four' }]) } : holdItems(spec)) });
  try {
    const said = await app.runner.start(app.agent, 'do four small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 3 } });
    assert.match(said, /Up to 3 helpers work at once\./);
    const run = app.runner.runOf('conv');
    assert.deepEqual([run.long.helpers, run.long.helpersAsked, run.long.helpersWhy], [3, 3, '']);
    const first = await app.step();
    assert.match(first, /plan/);
    await tick(20);
    assert.deepEqual(app.working(), ['Mission: item 1', 'Mission: item 2', 'Mission: item 3'], 'the pool is full');
    assert.ok(app.seen.some((entry) => entry.label === 'Mission: questions'), 'the question pass ran beside the planner');
    // Item 2 finishes first: item 4 takes its place at once, without waiting for a mission_step call.
    await app.release('Mission: item 2');
    assert.deepEqual(app.working(), ['Mission: item 1', 'Mission: item 3', 'Mission: item 4']);
    const view = app.runner.view('conv');
    assert.equal(view.helpers, 3);
    assert.deepEqual(view.workingLanes.filter((lane) => lane.kind === 'work').map((lane) => lane.item).sort(), ['1', '3', '4']);
    assert.equal(view.items.find((item) => item.id === '1').working, true);
    const told = await app.step();
    assert.match(told, /item 2 of 4, "two"/);
    assert.match(told, /Now: items 1, 3, 4 are being worked on \(3 of 3 helpers\)\./);
    await app.release('Mission: item 4');
    await app.release('Mission: item 1');
    assert.ok(!app.seen.some((entry) => entry.label === 'Mission: reviewer'), 'no review while a helper works');
    await app.release('Mission: item 3');
    await tick(30);
    assert.ok(app.seen.some((entry) => entry.label === 'Mission: reviewer'), 'the review once the pool drained');
    let text = '';
    for (let i = 0; i < 6 && run.status === 'running'; i += 1) text += `\n${await app.step(200)}`;
    assert.notEqual(run.status, 'running', text);
    assert.match(report(run), /Helpers at once: 3\./);
    assert.ok(app.fired.some((event) => event.type === 'step' && event.lane && event.item === '2'), 'step events name the lane and the item');
    assert.equal(app.claims.list('conv').length, 0, 'nothing is held after the end');
  } finally {
    app.done();
  }
});

test('one helper at once is stage C: the same helpers in the same order and the same step texts as a Mission from before stage D', async () => {
  const answer = (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : /^Mission: item/.test(spec.label) ? { text: 'DONE: done it' } : { text: APPROVE });
  const runs = [];
  for (const long of [{ minutes: 0, laps: 1 }, { minutes: 0, laps: 1, helpers: 1 }]) {
    const app = bench({ answer });
    try {
      await app.runner.start(app.agent, 'do two small things', { mode: 'auto', root: app.root }, { kind: 'long', long });
      const texts = [];
      for (let i = 0; i < 8 && app.runner.runOf('conv').status === 'running'; i += 1) texts.push((await app.step()).replace(/\d+ minutes?/g, 'N minutes').replace(/\/mission back \d+/g, ''));
      runs.push({ labels: app.seen.map((entry) => entry.label), texts });
    } finally {
      app.done();
    }
  }
  assert.deepEqual(runs[1].labels, runs[0].labels, 'no question pass, the same helpers');
  assert.deepEqual(runs[1].texts, runs[0].texts);
});

test('Calls at once caps the pool, and a folder without checkpoints runs one helper; the app\'s helper limit is waited out', async () => {
  const capped = bench({ callsAtOnce: 2, answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'a' }, { title: 'b' }, { title: 'c' }]) } : holdItems(spec)) });
  try {
    const said = await capped.runner.start(capped.agent, 'do three small things', { mode: 'auto', root: capped.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 4 } });
    assert.match(said, /2 helpers at once: your model server takes 2 requests at a time \(Settings → Mission → Calls at once\)\./);
    assert.deepEqual([capped.runner.runOf('conv').long.helpers, capped.runner.runOf('conv').long.helpersWhy], [2, 'server']);
    await capped.step();
    await tick(20);
    assert.equal(capped.working().length, 2);
    assert.ok(capped.most() <= 2, 'never more requests to the server than Calls at once');
  } finally {
    capped.done();
  }
  const noGit = { take: async () => ({ id: '', number: 0, skipped: true, reason: 'No git.' }), files: async () => ({ files: [], more: false }), idOf: async () => '', changes: async () => '' };
  const plain = bench({ points: noGit });
  try {
    const said = await plain.runner.start(plain.agent, 'do three small things', { mode: 'auto', root: plain.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 4 } });
    assert.match(said, /One helper at a time: no checkpoints are kept of this folder/);
    assert.deepEqual([plain.runner.runOf('conv').long.helpers, plain.runner.runOf('conv').long.helpersWhy], [1, 'no-checkpoints']);
  } finally {
    plain.done();
  }
  // The app refuses a helper when its tree is full: tried again a moment later, and given up as a free failure.
  let full = 2;
  const busy = bench({ activation: (spec) => (spec.label === 'Mission: planner' && full-- > 0 ? 'full' : ''), answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'a' }]) } : { text: APPROVE }) });
  try {
    await busy.runner.start(busy.agent, 'do one small thing', { mode: 'auto', root: busy.root }, { kind: 'long', long: { minutes: 60, laps: 1 } });
    assert.match(await busy.step(), /plan/, 'the planner started after two refusals');
  } finally {
    busy.done();
  }
});

test('Pause stops every helper; their items go on from where they stopped (the next helper is told); Resume fills the pool again', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }, { title: 'three' }]) } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'do three small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2 } });
    await app.step();
    await tick(20);
    assert.equal(app.working().length, 2);
    const run = app.runner.runOf('conv');
    const said = app.runner.stop(app.agent);
    assert.match(said, /2 helpers were stopped; their items go on from where they left off when you resume\./);
    await tick(20);
    assert.equal(app.working().length, 0, 'every helper was stopped');
    assert.deepEqual(run.items.map((item) => [item.status, item.tries, item.interrupted === true]), [['open', 0, true], ['open', 0, true], ['open', 0, false]], 'no try used; marked as stopped part way');
    const before = app.seen.length;
    app.runner.resume(app.agent);
    await tick(20);
    assert.equal(app.working().length, 2, 'the pool fills again');
    const again = app.seen.slice(before).find((entry) => entry.label === 'Mission: item 1');
    assert.match(again.prompt, /was stopped part way/);
    assert.equal(app.claims.list('conv').length, 0);
  } finally {
    app.done();
  }
});

test('End with several helpers at work: the report at once; helpers that settle later change nothing; a continue waits for them', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'do two small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2 } });
    await app.step();
    await tick(20);
    const run = app.runner.runOf('conv');
    const steps = run.steps;
    const text = app.runner.end(app.agent);
    assert.match(text, /^Mission stopped/);
    await tick(20);
    assert.equal(run.steps, steps, 'nothing written after End');
    assert.equal(app.runner.busy('conv'), 0);
    assert.match(await app.step(), /^The mission run has ended\./);
  } finally {
    app.done();
  }
});

test('a lane that fails keeps its item out for a moment; a failure while the Budget guard stops the run uses no try', async () => {
  let fail = true;
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : /item 1/.test(spec.label) && fail ? { hold: true } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'do two small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2 } });
    await app.step();
    await tick(20);
    const run = app.runner.runOf('conv');
    app.runner.stopping('conv');
    fail = false;
    await app.release('Mission: item 1', '');
    assert.equal(run.items[0].tries, 0, 'interrupted, not failed');
    assert.equal(run.items[0].status, 'open');
    assert.equal(app.working().length, 1, 'no new helper starts while it stops');
  } finally {
    app.done();
  }
});

test('the clock cuts every helper past the deadline and grace; the run ends when the last one settles, and the report names them', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'do two small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 30, laps: 1, helpers: 2 } });
    await app.step();
    await tick(20);
    const run = app.runner.runOf('conv');
    run.long.deadline = Date.now() - graceMs(run) - 1000;
    assert.deepEqual(app.runner.sweep(Date.now(), () => app.agent), ['conv']);
    await tick(30);
    assert.notEqual(run.status, 'running');
    assert.deepEqual([...run.cutItems].sort(), ['1', '2']);
    assert.match(report(run), /The last steps \(items 1, 2\) were cut short by the time limit\. They keep their tries\./);
    assert.deepEqual(run.items.map((item) => item.tries), [0, 0]);
    assert.match(await app.step(), /final report/);
  } finally {
    app.done();
  }
});

test('the planner is told about the helpers, and the conductor\'s words for the pool', () => {
  assert.equal(poolLine({ working: ['2', '4'], size: 3, waiting: ['1'] }), 'Now: items 2, 4 are being worked on (2 of 3 helpers). Item 1 waits for the user.');
  assert.match(stillWorking({ working: ['2'], minutes: 3 }), /^Still working: item 2 \(1 helper\), 3 minutes so far\. This is normal\./);
  assert.match(waitingText({ questions: 2, approvals: 1, until: new Date(2026, 10, 20, 14, 5).getTime() }), /\(2 questions, 1 approval\).*ends at 14:05/);
  assert.match(waitingText({ questions: 1, approvals: 0, until: 0 }), /It waits until they answer\. .*Its time limit does not run while it waits\./, 'point 17: its time does not run while it waits');
  assert.match(waitingText({ questions: 1, approvals: 0, until: 0, quiet: true }), /^The Mission now waits for the user: .*It waits until they answer\. Its time limit does not run while it waits\. Tell the user this in one line and do not call mission_step again/);
  const many = joinTold(['a\n'.repeat(20).trim(), 'b']);
  assert.equal(many.split('\n').filter((row) => row === 'a').length, 12, 'several texts: each cut to 12 lines');
});

test('the run log has the question pass with how soon its questions were there (questionsMs)', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : spec.label === 'Mission: questions' ? { text: '{"questions": [{"question": "Which colour?", "default": "blue"}]}' } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'do one small thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2 } });
    let told = await app.step();
    for (let i = 0; i < 3 && !/Which colour/.test(told); i += 1) told += await app.step(100);
    assert.match(told, /Which colour\? \(default: blue\)/);
    const run = app.runner.runOf('conv');
    assert.equal(run.long.askedEarly, true);
    assert.equal(run.questions[0].from, 'plan');
    const dir = join(app.root, '.dsh-mission', 'runs', run.id);
    const log = readFileSync(join(dir, 'log.jsonl'), 'utf8').trim().split('\n').map((row) => JSON.parse(row));
    const pass = log.find((row) => row.kind === 'questions');
    assert.equal(pass.count, 1);
    assert.ok(pass.questionsMs >= 0 && pass.questionsMs < 60000, 'within the first minute');
    assert.ok(readdirSync(join(dir, 'steps')).some((name) => name.includes('questions')));
    const prompt = app.seen.find((entry) => entry.label === 'Mission: questions').prompt;
    assert.match(prompt, /^MISSION_ASK/);
    assert.match(prompt, /do not explore/);
    const plan = app.seen.find((entry) => entry.label === 'Mission: planner').prompt;
    assert.match(plan, /Up to 2 helpers work at once, each on its own item\./);
  } finally {
    app.done();
  }
});

test('an item\'s check that fails while other helpers work is run again on its own once they are done; only that result counts', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one', check: 'test -f one.txt' }, { title: 'two' }]) } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'do two small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2 } });
    await app.step();
    await tick(20);
    const run = app.runner.runOf('conv');
    await app.release('Mission: item 1');
    for (let i = 0; i < 100 && !run.items[0].recheck; i += 1) await tick(10);
    assert.deepEqual([run.items[0].status, run.items[0].recheck, run.items[0].tries], ['open', true, 0], 'no try used yet');
    assert.match(await app.step(), /item 1's check failed while other helpers were working, so it is checked again when they are done/);
    // Meanwhile item 2's helper made what item 1's check looks for.
    writeFileSync(join(app.root, 'one.txt'), 'x');
    await app.release('Mission: item 2');
    for (let i = 0; i < 100 && run.items[0].status !== 'verified'; i += 1) await tick(10);
    assert.deepEqual([run.items[0].status, run.items[0].tries], ['verified', 1]);
    let told = '';
    for (let i = 0; i < 3 && !/run again on its own/.test(told); i += 1) told += await app.step(200);
    assert.match(told, /item 1's check, run again on its own: passed\./);
  } finally {
    app.done();
  }
});

test('after a restart an item a helper was working on is marked as stopped part way, and a wait for you is over', async () => {
  const home = mkdtempSync(join(tmpdir(), 'mission-pool-home-'));
  const app = bench({ home, answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'do two small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2 } });
    await app.step();
    await tick(20);
    const run = app.runner.runOf('conv');
    assert.match(run.items[0].lane, /^L\d+$/, 'written down while a helper works on it');
    const disk = JSON.parse(readFileSync(join(app.root, '.dsh-mission', 'runs', run.id, 'run.json'), 'utf8'));
    assert.ok(disk.items[0].lane);
    disk.long.waitingSince = 5;
    writeFileSync(join(app.root, '.dsh-mission', 'runs', run.id, 'run.json'), JSON.stringify(disk));
    const again = bench({ home });
    const loaded = again.runner.runOf('conv');
    assert.deepEqual(loaded.items.map((item) => [item.lane, item.interrupted]), [[undefined, true], [undefined, true]]);
    assert.equal(loaded.long.waitingSince, undefined);
  } finally {
    app.done();
    rmSync(home, { recursive: true, force: true });
  }
});
