/**
 * Stage E, point 6: the repair helper (by itself, asking, bounded). Each test fails on the code before stage E.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GIT_CANDIDATES } from '../lib/checkpoints.js';
import { REPAIRS_MAX, TOOL_FAILS, applyOwn, cannotRun, causeKey, causeWords, readRepair, repairOf, requestRepair, widensAccess } from '../lib/repair.js';
import { REPAIR_GUARD, repairRefusal } from '../lib/guard.js';
import { ALONE_KINDS, STEP_KINDS } from '../lib/pool.js';
import { addApproval, applyPlan, newRun, nextStep, report } from '../lib/run.js';
import { raisedLimit } from '../runner.js';
import { stripOf } from '../lib/strip.js';
import { appHarness } from './app-harness.mjs';
import { PLAN, REPAIR, bench, tick } from './stage-e-bench.mjs';

const hasGit = GIT_CANDIDATES.some((path) => existsSync(path));
const longRun = (long = {}) => {
  const run = newRun({ id: 'r', goal: 'g', mode: 'Full Auto', root: '/w', limits: {}, kind: 'long', long: { minutes: 60, laps: 2, ...long } });
  applyPlan(run, { items: [{ title: 'one' }, { title: 'two', check: 'test -f two' }] });
  return run;
};

test('the bounds: twice per cause, once per item, six in a Mission, busy while one is pending; a continue starts the count again', () => {
  const run = longRun();
  assert.equal(requestRepair(run, { kind: 'errors' }), 'asked');
  assert.equal(requestRepair(run, { kind: 'failing' }), 'busy', 'one at a time');
  const R = repairOf(run, 0);
  const finishOne = () => {
    R.tries[R.pending.key] = (R.tries[R.pending.key] ?? 0) + 1;
    R.count += 1;
    R.pending = null;
  };
  finishOne();
  assert.equal(requestRepair(run, { kind: 'errors' }), 'asked');
  finishOne();
  assert.equal(requestRepair(run, { kind: 'errors' }), 'spent', 'at most twice for the same cause');
  assert.equal(requestRepair(run, { kind: 'stuck', item: '1' }), 'asked');
  finishOne();
  assert.equal(requestRepair(run, { kind: 'stuck', item: '1' }), 'spent', 'once for one item');
  assert.equal(requestRepair(run, { kind: 'check', item: '2' }), 'asked');
  finishOne();
  assert.equal(requestRepair(run, { kind: 'check', item: '2' }), 'spent');
  for (const kind of ['empty', 'tool']) {
    assert.equal(requestRepair(run, { kind, tool: 'web_fetch' }), 'asked');
    finishOne();
  }
  assert.equal(R.count, REPAIRS_MAX);
  assert.equal(requestRepair(run, { kind: 'failing' }), 'spent', `at most ${REPAIRS_MAX} in one Mission`);
  assert.equal(requestRepair(run, { kind: 'failing' }, 1), 'asked', 'a continue (a new epoch) starts the count again');
  assert.equal(repairOf(run, 1).list.length, 0, 'the list is kept (nothing was listed here)');
  assert.equal(causeKey({ kind: 'stuck', item: '3' }), 'stuck:item:3');
  assert.equal(causeWords({ kind: 'check', item: '3' }), 'the check of item 3 could not run');
  assert.equal(causeWords({ kind: 'check', command: 'x' }), 'an overall check could not run');
  assert.equal(causeWords({ kind: 'tool', tool: 'web_fetch' }), 'the tool web_fetch kept failing');
});

test('a check that cannot run (a program not there, or not runnable) is told from one that ran and failed; Devices\' closed ports never count', () => {
  assert.equal(cannotRun({ ok: false, code: 127, output: 'zsh: command not found: pytestx' }), true);
  assert.equal(cannotRun({ ok: false, code: 126, output: '' }), true);
  assert.equal(cannotRun({ ok: false, code: 1, output: 'sh: foo: not found' }), true);
  assert.equal(cannotRun({ ok: false, code: 1, output: 'FAILED: 2 tests' }), false);
  assert.equal(cannotRun({ ok: true, code: 0, output: '' }), false);
  assert.equal(cannotRun({ ok: false, code: 127, output: "Devices keeps the Mac's device ports closed to a Mission's checks" }), false);
});

test('its own fixes: split, a check that must really run (a failing one gives the try back), retry, fewer helpers, a note, a recipe, the thinking level; the same fix twice counts as nothing', () => {
  const run = longRun({ helpers: 4, effort: true });
  run.items[0].status = 'stuck';
  run.items[0].tries = 3;
  run.items[1].tries = 2;
  const checked = new Map([['test -f ok', { ok: true, code: 0, output: '' }], ['test -f later', { ok: false, code: 1, output: '' }], ['nope-x', { ok: false, code: 127, output: 'command not found' }]]);
  const out = applyOwn(run, [
    { kind: 'split', item: '1', into: [{ title: 'one a', check: 'test -f a' }, { title: 'one b' }] },
    { kind: 'check', item: '2', check: 'test -f later' },
    { kind: 'retry', minutes: 5 },
    { kind: 'fewer', helpers: 2 },
    { kind: 'note', text: 'use the src folder' },
    { kind: 'effort', to: 'off' },
    { kind: 'recipe', to: 'code' },
  ], { cause: { kind: 'stuck', item: '1' }, checked, id: 'r1' });
  assert.deepEqual(out.said, [
    'Item 1 is split into items 1, 3.',
    'Item 2\'s check is now: test -f later',
    'Items wait 5 minutes before they are tried again.',
    'It works with 2 helpers at once now (it was 4).',
    'Told the helpers: use the src folder',
    'Think by role is off for this Mission now: its helpers use the tier\'s thinking level.',
  ]);
  assert.match(out.refused.join(' '), /work loop is on/, 'no recipe without the work loop');
  assert.deepEqual([run.items[0].title, run.items[0].status, run.items[0].tries, run.items[0].repaired], ['one a', 'open', 2, 'r1'], 'the first part takes the item\'s place, with one more try');
  assert.deepEqual([run.items[2].title, run.items[2].after], ['one b', ['1']]);
  assert.deepEqual([run.items[1].check, run.items[1].status, run.items[1].tries], ['test -f later', 'open', 1], 'the try the broken check cost is given back');
  assert.deepEqual([run.long.retryAfterMs, run.long.helpersCap, run.long.repairNote, run.long.effort], [300000, 2, 'use the src folder', false]);
  // A check that passes verifies the item; one that cannot run (or was not run) is refused.
  run.items[1].status = 'open';
  const again = applyOwn(run, [{ kind: 'check', item: '2', check: 'test -f ok' }, { kind: 'check', item: '3', check: 'nope-x' }, { kind: 'check', item: '3', check: 'never-run' }], { cause: {}, checked });
  assert.equal(run.items[1].status, 'verified');
  assert.equal(again.refused.length, 2);
  assert.equal(run.items[2].check, '', 'unchanged');
  // The same fix as last time for the same cause is nothing.
  const same = applyOwn(run, [{ kind: 'note', text: 'use the src folder' }], { last: new Set([JSON.stringify({ kind: 'note', text: 'use the src folder' })]) });
  assert.deepEqual(same.said, []);
  // An overall check is replaced or taken out (only one that ran).
  run.checks = ['npm tset'];
  applyOwn(run, [{ kind: 'check', overall: 'npm tset', check: 'test -f ok' }], { cause: { kind: 'check', command: 'npm tset' }, checked });
  assert.deepEqual(run.checks, ['test -f ok']);
  applyOwn(run, [{ kind: 'check', overall: 'test -f ok', check: '' }], {});
  assert.deepEqual(run.checks, []);
  // A Recon Mission runs no checks: no check fix.
  const recon = longRun({ isolated: true });
  assert.match(applyOwn(recon, [{ kind: 'check', item: '1', check: 'test -f ok' }], { checked }).refused[0], /runs no checks/);
  assert.equal(readRepair({ cause: 'c', fixed: true, own: [{ kind: 'note', text: 'x' }, { kind: 'grant', what: 'all' }], ask: [{ kind: 'calls', to: 1 }, { kind: 'permission' }] }).own.length, 1);
  assert.equal(readRepair('prose'), null);
});

test('asks that would give the Mission more access are refused and listed, never asked', () => {
  assert.equal(widensAccess({ kind: 'setting', where: 'Settings → Modes → Tool access', change: 'allow bash' }), true);
  assert.equal(widensAccess({ kind: 'setting', where: 'Settings → Model Tiers', change: 'switch the sandbox to full access' }), true);
  assert.equal(widensAccess({ kind: 'setting', where: 'Settings → Model Tiers', change: 'raise the context window to 64k' }), false);
});

test('the repair helper runs alone, before the plan: nothing else starts while one is asked for', () => {
  assert.ok(STEP_KINDS.has('repair') && ALONE_KINDS.has('repair'));
  const run = newRun({ id: 'r', goal: 'g', mode: 'Full Auto', root: '/w', limits: {}, kind: 'long', long: { minutes: 60, laps: 2, helpers: 3 } });
  requestRepair(run, { kind: 'errors' });
  assert.equal(nextStep(run, Date.now(), { inflight: 0 }).kind, 'repair', 'before the plan');
  assert.equal(nextStep(run, Date.now(), { inflight: 2 }).kind, 'drain', 'the helpers at work finish first');
  assert.equal(nextStep(run, Date.now()).kind, 'repair', 'one helper at once too');
});

test('three step errors ask the repair helper first; it runs before the plan after a save point, makes its own fixes, and the Mission goes on (no pause)', async () => {
  let plannerFails = 3;
  const app = bench({
    answer: (spec) => {
      if (spec.label === 'Mission: planner') return plannerFails-- > 0 ? { throws: 'the planner crashed on its prompt' } : { text: PLAN([{ title: 'one' }]) };
      if (spec.label === 'Mission: repair helper') return { text: REPAIR([{ kind: 'effort', to: 'off' }, { kind: 'note', text: 'keep answers short' }], [], 'the planner does not take the thinking level') };
      return undefined;
    },
  });
  try {
    await app.start({ effort: true });
    const texts = [];
    for (let i = 0; i < 3; i += 1) texts.push(await app.step());
    assert.match(texts.at(-1), /failed 3 times in a row.*The Mission's repair helper looks at why next\./);
    const repaired = await app.step();
    assert.match(repaired, /the repair helper looked at why the same step failed 3 times in a row\. Think by role is off for this Mission now.* Told the helpers: keep answers short/);
    assert.match(repaired, /Save point before it: \/mission back \d+\./);
    assert.ok(app.labels.includes('Before the repair helper: the same step failed 3 times in a row'), 'a save point first');
    await tick();
    assert.equal(app.goal.phase, 'active', 'not paused: it fixed something');
    assert.equal(app.run().long.effort, false);
    const plan = await app.step();
    assert.match(plan, /Step 1: plan/);
    assert.match(app.seen.filter((entry) => entry.label === 'Mission: planner').at(-1).prompt, /From the Mission's repair helper:\n- keep answers short/);
    const view = app.runner.view('conv');
    assert.deepEqual(view.repairs.map((entry) => entry.status), ['fixed']);
    assert.match(report(app.run()), /Repairs \(each after a save point; \/mission back undoes it\):\n- \d\d:\d\d: the same step failed 3 times in a row\. Think by role is off/);
    assert.ok(app.fired.some((event) => event.type === 'step' && event.what === 'repair'));
  } finally {
    app.done();
  }
});

test('nothing fixed: the pause from before, with its tail; after two repairs for the same cause it pauses at once, saying the repair helper already tried', async () => {
  let fail = true;
  const app = bench({
    answer: (spec) => {
      if (spec.label === 'Mission: planner') return { text: PLAN([{ title: 'one' }, { title: 'two' }]) };
      if (spec.label === 'Mission: repair helper') return { text: REPAIR([], [], 'the model is too small') };
      if (/^Mission: item/.test(spec.label) && fail) return { text: '', stopReason: 'error', diagnostic: 'model crashed' };
      return undefined;
    },
  });
  try {
    await app.start({ laps: 3 });
    await app.step();
    const round = async () => {
      const texts = [];
      for (let i = 0; i < 6 && !/The run is paused/.test(texts.at(-1) ?? ''); i += 1) texts.push(await app.step());
      return texts;
    };
    let texts = await round();
    assert.ok(texts.some((text) => /repair helper looks at why 3 helpers in a row could not do their work next/.test(text)));
    assert.match(texts.at(-1), /The run is paused: 3 helpers in a row failed\. The last one: The helper's model failed: model crashed The repair helper could not fix it by itself\./);
    await tick();
    assert.equal(app.run().pausedBy, 'problem');
    assert.equal(app.runner.view('conv').repairs[0].status, 'nothing');
    for (let round2 = 0; round2 < 2; round2 += 1) {
      app.runner.resume(app.agent);
      texts = await round();
      await tick();
    }
    assert.match(texts.at(-1), /The run is paused: .* The repair helper already tried for this\./);
    assert.equal(app.seen.filter((entry) => entry.label === 'Mission: repair helper').length, 2, 'never more than twice for one cause');
  } finally {
    app.done();
  }
});

test('an item that ends NOT FINISHED gets one repair: a split opens it again (no pause); a check that cannot run gets a check that runs', { skip: !hasGit && 'runs a shell' }, async () => {
  const app = bench({
    answer: (spec) => {
      if (spec.label === 'Mission: planner') return { text: PLAN([{ title: 'one', check: 'false' }, { title: 'two', check: 'no-such-program-xyz --check' }]) };
      if (spec.label === 'Mission: repair helper') {
        if (/item 1 was not finished/.test(spec.prompt?.[0]?.text ?? '')) return { text: REPAIR([{ kind: 'split', item: '1', into: [{ title: 'one, first half' }, { title: 'one, second half' }] }]) };
        return { text: REPAIR([{ kind: 'check', item: '2', check: 'test -f two.txt' }], [{ kind: 'setting', where: 'Settings → Mission', change: 'use 2 helpers at once', why: 'faster' }]) };
      }
      return undefined;
    },
  });
  try {
    writeFileSync(join(app.root, 'two.txt'), 'x');
    await app.start();
    app.run().limits.maxTries = 1;
    await app.step(); // plan
    const first = await app.step();
    assert.match(first, /NOT FINISHED after all its tries[\s\S]*The Mission's repair helper looks at why item 1 was not finished after all its tries next\./);
    const split = await app.step();
    assert.match(split, /Item 1 is split into items 1, 3\./);
    assert.deepEqual(app.run().items.map((item) => [item.id, item.status]), [['1', 'open'], ['2', 'open'], ['3', 'open']]);
    const second = await app.step();
    assert.match(second, /item 1 of 3/);
    const third = await app.step(); // item 2: its check cannot run
    assert.match(third, /command not found[\s\S]*The Mission's repair helper looks at why the check of item 2 could not run next\./);
    const fixed = await app.step();
    assert.match(fixed, /Item 2's check is now: test -f two\.txt/);
    // Lab check of stage E: each fix ends as a sentence, and the asked rest reads true after the end too.
    const line = JSON.stringify(app.run().long);
    assert.match(line, /Item 2's check is now: test -f two\.txt\. It put the rest to you as a question\./);
    assert.doesNotMatch(line, /It asks you about the rest in the card above the chat box/);
    assert.equal(app.run().items[1].status, 'verified', 'the new check really ran and passed');
    await tick();
    assert.equal(app.goal.phase, 'active');
  } finally {
    app.done();
  }
});

test('its asks: Calls at once and a setting wait in the card (Ask modes) or are listed (Full auto); one that widens access is refused and listed under Not possible', async () => {
  for (const needs of ['ask', 'decide']) {
    const app = bench({
      calls: { p: 4 },
      answer: (spec) => {
        if (spec.label === 'Mission: planner') return { throws: 'socket closed by the planner' };
        if (spec.label === 'Mission: repair helper') return { text: REPAIR([], [{ kind: 'calls', to: 1, why: 'it runs one at a time' }, { kind: 'setting', where: 'Settings → Modes → Tool access', change: 'allow bash for helpers' }]) };
        return undefined;
      },
    });
    try {
      await app.start({ needs });
      for (let i = 0; i < 4; i += 1) await app.step();
      const run = app.run();
      const calls = run.approvals.find((entry) => entry.kind === 'repair' && entry.fix?.kind === 'calls');
      assert.equal(calls.what, 'Send at most 1 request at a time to your model server p (Settings → Mission → Calls at once; now 4)');
      assert.equal(calls.status, needs === 'decide' ? 'unasked' : 'open', needs);
      assert.equal(calls.by, 'repair');
      const refused = run.approvals.find((entry) => entry.status === 'cannot');
      assert.match(refused.what, /Tool access: allow bash for helpers/);
      await tick();
      assert.match(run.stalled, /The repair helper (asks you about it in the card above the chat box|could not fix it by itself)\./);
      assert.match(report(run), /Not possible for a Mission's helper[\s\S]*Tool access: allow bash for helpers/);
      const view = app.runner.view('conv');
      assert.equal(view.approvals.find((entry) => entry.id === calls.id).fix, 'calls');
      assert.equal(stripOf({ run: { ...view, goalPhase: 'paused' } }).approvals.some((entry) => entry.by === 'repair' && entry.fix === 'calls'), needs !== 'decide');
    } finally {
      app.done();
    }
  }
});

test('no save point: the repair helper changes no files (its guard), and it never asks for tools, helpers or background work', async () => {
  let during;
  const app = bench({
    points: { skip: true },
    answer: (spec, childId) => {
      if (spec.label === 'Mission: planner') return { throws: 'planner error' };
      if (spec.label === 'Mission: repair helper') {
        return { text: REPAIR([{ kind: 'note', text: 'n' }]), later: () => { during = { lane: app.runner.repairLaneOf(childId), helper: app.runner.helperOf(childId), prompt: spec.prompt?.[0]?.text ?? '' }; } };
      }
      return undefined;
    },
  });
  try {
    await app.start();
    for (let i = 0; i < 4; i += 1) await app.step();
    assert.deepEqual(during.lane, { point: 0 });
    assert.equal(during.helper.role, 'repair');
    assert.match(during.prompt, /This folder keeps no checkpoints, so the repair helper changes no files here/);
    assert.equal(repairRefusal({ name: 'write', args: { path: 'a' }, point: 0 }), REPAIR_GUARD.noPoint);
    assert.equal(repairRefusal({ name: 'bash', args: { command: 'rm a.txt' }, point: 0 }), REPAIR_GUARD.noPoint);
    assert.equal(repairRefusal({ name: 'bash', args: { command: 'ls' }, point: 0 }), '');
    assert.equal(repairRefusal({ name: 'write', args: { path: 'a' }, point: 3 }), '');
    for (const name of ['request_tool_access', 'subagent', 'run_swarm', 'mission_request_files']) assert.equal(repairRefusal({ name, point: 3 }), REPAIR_GUARD.guard, name);
    assert.equal(repairRefusal({ name: 'bash', args: { command: 'npm test', run_in_background: true }, point: 3 }), REPAIR_GUARD.guard);
    assert.equal(repairRefusal({ name: 'x_helpers', point: 3, group: 'helpers' }), REPAIR_GUARD.guard);
  } finally {
    app.done();
  }
});

test('the Budget guard stop: the raise by half waits in the card; Allow raises it through Budget and the Mission carries on; Full auto lists it; a second Allow while one acts is refused', { skip: !hasGit }, async () => {
  assert.deepEqual([raisedLimit('steps', 5000), raisedLimit('steps', 40000), raisedLimit('steps', 50000), raisedLimit('tokens', 60_000_000)], [7500, 50000, 0, 90_000_000]);
  let release;
  const raises = [];
  const app = appHarness({
    services: { budgetGuard: { raiseMission: async (request) => { raises.push(request); await new Promise((resolve) => { release = resolve; }); return { ok: true, from: 5000, to: request.to }; } } },
  });
  try {
    const agent = app.open('c');
    assert.equal((await app.card({ sessionId: 'c', action: 'start', goal: 'make two small things for me', mode: 'auto' })).status, 200);
    await app.step(agent);
    const service = app.runner();
    assert.equal(service.budgetStopped('c', 'This Mission reached its own limit of 5,000 steps.', { limit: 'steps', max: 5000 }), true);
    await tick(20);
    const view = service.view('c');
    assert.match(view.stalled, /^Paused by the Budget guard: this Mission reached its own limit of 5,000 steps\. Allow the higher limit in the card above the chat box, or raise it in Settings → Budget guard, then press Resume\.$/);
    const raise = view.approvals.find((entry) => entry.fix === 'budget');
    assert.equal(raise.what, 'Raise the Budget guard\'s Mission allowance from 5,000 to 7,500 steps (Settings → Budget guard)');
    const first = app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: raise.id, choice: 'allow' }] });
    await tick(10);
    const second = await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: raise.id, choice: 'allow' }] });
    assert.deepEqual([second.status, second.json.error], [400, 'This is being done already. Look again in a moment.']);
    release();
    const done = await first;
    assert.equal(done.status, 200, JSON.stringify(done.json));
    assert.equal(done.json.said, 'Allowed: Raise the Budget guard\'s Mission allowance from 5,000 to 7,500 steps (Settings → Budget guard). The Mission carries on.');
    assert.deepEqual(raises, [{ limit: 'steps', to: 7500 }]);
    assert.equal(service.view('c').pausedAt, 0, 'resumed');
  } finally {
    app.done();
  }
  const auto = appHarness({ services: { budgetGuard: { raiseMission: async () => ({ ok: false, text: 'Budget guard is switched off.' }) } } });
  try {
    const agent = auto.open('c');
    await auto.card({ sessionId: 'c', action: 'save', needs: 'decide' });
    await auto.card({ sessionId: 'c', action: 'start', goal: 'make two small things for me', mode: 'auto' });
    await auto.step(agent);
    auto.runner().budgetStopped('c', 'This Mission reached its own limit of 60,000,000 tokens.', { limit: 'tokens', max: 60_000_000 });
    await tick(20);
    const view = auto.runner().view('c');
    assert.match(view.stalled, /Full auto does not ask to raise it: raise it in Settings → Budget guard, then press Resume\.$/);
    assert.equal(view.approvals.find((entry) => entry.fix === 'budget').status, 'unasked');
  } finally {
    auto.done();
  }
});

test('a tool of a Mission\'s helper that keeps failing gets the repair helper; only calls the guard let through count', { skip: !hasGit }, async () => {
  const app = appHarness({ config: { longHelpers: 2 } });
  try {
    const agent = app.open('c');
    await app.card({ sessionId: 'c', action: 'start', goal: 'make two small things for me', mode: 'auto' });
    await app.step(agent);
    for (let i = 0; i < 50 && !app.holds.has('Mission: item 1'); i += 1) await tick(5);
    const helper = app.helperAgent('Mission: item 1');
    const result = async (callId, name, args, isError) => {
      const decision = await app.chain('tools/pre-execute', { agent: helper, name, callId, arguments: args, signal: new AbortController().signal });
      for (const handler of app.handlers.get('tools/result') ?? []) handler({ agent: helper, name, callId, arguments: args }, { isError, content: [{ type: 'text', text: 'failed: no route' }] });
      return decision;
    };
    // Refused calls never count (a write into Mission's own folder is always refused).
    for (let i = 0; i < TOOL_FAILS + 1; i += 1) assert.equal((await result(`w${i}`, 'write', { path: join(agent.header.cwd, '.dsh-mission', 'x') }, true)).kind, 'deny');
    assert.equal(app.runner().view('c').repairing, null);
    for (let i = 0; i < TOOL_FAILS - 1; i += 1) await result(`f${i}`, 'web_fetch', { url: 'https://example.org' }, true);
    await result('ok', 'web_fetch', { url: 'https://example.org' }, false);
    for (let i = 0; i < TOOL_FAILS - 1; i += 1) await result(`g${i}`, 'web_fetch', { url: 'https://example.org' }, true);
    assert.equal(app.runner().view('c').repairing, null, 'a success starts the count again');
    await result('last', 'web_fetch', { url: 'https://example.org' }, true);
    assert.deepEqual(app.runner().view('c').repairing, { cause: 'the tool web_fetch kept failing', working: false });
  } finally {
    app.done();
  }
});

// ---- Review of stage E (20 November 2026) ----------------------------------------------------------------------------

test('review of stage E: without a save point the repair helper runs no program and uses nothing else that can change files', () => {
  const write = "await (await import('node:fs/promises')).writeFile('config.json', '{}')";
  assert.equal(repairRefusal({ name: 'run_code', args: { code: write }, point: 0, group: 'run' }), REPAIR_GUARD.noPointProgram);
  assert.equal(repairRefusal({ name: 'run_code', args: { code: 'return 1' }, point: 0 }), REPAIR_GUARD.noPointProgram);
  assert.equal(repairRefusal({ name: 'data_python', args: { code: 'open("x","w")' }, point: 0, group: 'run' }), REPAIR_GUARD.noPointProgram);
  for (const [name, group] of [['office_make', 'change'], ['data_save_analysis', 'change'], ['some_saver', 'change'], ['some_runner', 'run']]) assert.equal(repairRefusal({ name, point: 0, group }), REPAIR_GUARD.noPoint, name);
  // Reading and a command that only reads still work; with a save point a program runs (the save point undoes it).
  assert.equal(repairRefusal({ name: 'read', point: 0, group: 'read' }), '');
  assert.equal(repairRefusal({ name: 'bash', args: { command: 'ls' }, point: 0, group: 'run' }), '');
  assert.equal(repairRefusal({ name: 'run_code', args: { code: write }, point: 2, group: 'run' }), '');
});

test('review of stage E: a split item\'s dependents wait for its last part, so none starts before every part is done', () => {
  const run = newRun({ id: 'r', goal: 'g', mode: 'Full Auto', root: '/w', limits: {}, kind: 'long', long: { minutes: 60, laps: 2, helpers: 1 } });
  applyPlan(run, { items: [{ title: 'write the parser' }, { title: 'write the parser\'s tests', after: [1] }, { title: 'docs' }] });
  run.phase = 'work';
  run.items[0].status = 'stuck';
  run.items[0].tries = 3;
  assert.deepEqual(run.items[1].after, ['1']);
  const out = applyOwn(run, [{ kind: 'split', item: '1', into: [{ title: 'part A' }, { title: 'part B' }, { title: 'part C' }] }], { cause: { kind: 'stuck', item: '1' }, id: 'r1' });
  assert.equal(out.said[0], 'Item 1 is split into items 1, 4, 5.');
  assert.deepEqual(run.items[1].after, ['5'], 'the tests wait for part C');
  assert.deepEqual(run.items.find((item) => item.id === '4').after, ['1']);
  // One helper: part A first; once it is done, never the tests before parts B and C.
  run.items[0].status = 'verified';
  const picked = [];
  for (let i = 0; i < 4; i += 1) {
    const next = nextStep(run, Date.now(), { busy: new Set(), inflight: 0 });
    if (next.kind !== 'work') break;
    picked.push(next.item.id);
    next.item.status = 'verified';
  }
  assert.ok(picked.indexOf('2') > picked.indexOf('5'), `tests after part C: ${picked.join(', ')}`);
});

test('review of stage E: the check fix never touches an item that waits for the user, was set aside or skipped; a pass on an item no helper worked on is judged by the reviewer', () => {
  const run = longRun();
  run.items.push({ id: '3', title: 'three', check: '', status: 'parked', tries: 1, parkedOn: 'a1' }, { id: '4', title: 'four', check: '', status: 'aside', tries: 1 });
  const checked = new Map([['test -f out/report.md', { ok: true, code: 0, output: '' }], ['test -f nope', { ok: false, code: 1, output: '' }]]);
  for (const id of ['3', '4']) {
    const before = run.items.find((item) => item.id === id).status;
    const out = applyOwn(run, [{ kind: 'check', item: id, check: 'test -f out/report.md' }], { cause: { kind: 'tool' }, checked, id: 'r1' });
    assert.equal(run.items.find((item) => item.id === id).status, before, `item ${id} unchanged`);
    assert.match(out.refused[0], /waits for the user or was set aside/);
    applyOwn(run, [{ kind: 'check', item: id, check: 'test -f nope' }], { cause: { kind: 'tool' }, checked, id: 'r2' });
    assert.equal(run.items.find((item) => item.id === id).status, before, `a failing check does not open item ${id}`);
    applyOwn(run, [{ kind: 'check', item: id, check: '' }], { cause: { kind: 'tool' }, checked, id: 'r3' });
    assert.equal(run.items.find((item) => item.id === id).check, '', 'nothing taken out either');
  }
  // Item 1: open, no helper worked on it yet: its check passing does not make it done by itself.
  applyOwn(run, [{ kind: 'check', item: '1', check: 'test -f out/report.md' }], { cause: { kind: 'tool' }, checked, id: 'r4' });
  assert.equal(run.items[0].status, 'unverified');
});

// ---- review of the lab check of point 19: an OK given hours later reads the setting again first ----
const okLater = async ({ allowance, from = 5000, config = {}, services = {} }) => {
  const raises = [];
  const app = appHarness({
    config,
    services: { budgetGuard: { ...(allowance ? { longAllowance: () => allowance } : {}), raiseMission: async (request) => { raises.push(request); return { ok: true, from, to: request.to }; } }, ...services },
  });
  const agent = app.open('c');
  assert.equal((await app.card({ sessionId: 'c', action: 'start', goal: 'make two small things for me', mode: 'auto' })).status, 200);
  await app.step(agent);
  assert.equal(app.runner().budgetStopped('c', 'This Mission reached its own limit of 5,000 steps.', { limit: 'steps', max: 5000 }), true);
  await tick(20);
  assert.equal((await app.card({ sessionId: 'c', action: 'end' })).status, 200);
  const card = (await app.get('c')).json;
  const raise = card.strip.oks.find((one) => one.fix === 'budget');
  assert.ok(raise, 'the raise waits for your OK after the end');
  return { app, raise, raises };
};

test('review: an Allow after the end for a Budget raise when the limit moved since it asked changes nothing and says why; the report lists it', { skip: !hasGit }, async () => {
  for (const [steps, said] of [
    [9000, 'Not changed: The Budget guard\'s Mission steps allowance is already 9,000, so the change is no longer needed. Nothing runs again because of it.'],
    [6000, 'Not changed: The Budget guard\'s Mission steps allowance is 6,000 now, not 5,000 as when the repair helper asked. To have 7,500, change it yourself in Settings → Budget guard. Nothing runs again because of it.'],
  ]) {
    const { app, raise, raises } = await okLater({ allowance: { enabled: true, steps, tokens: 0 } });
    try {
      const got = await app.card({ sessionId: 'c', action: 'ok', id: raise.id, choice: 'allow' });
      assert.equal(got.status, 200, JSON.stringify(got.json));
      assert.equal(got.json.said, said);
      assert.deepEqual(raises, [], 'nothing written');
      const card = (await app.get('c')).json;
      assert.deepEqual(card.strip.oks, [], 'no longer waits');
      assert.match(card.run.report, new RegExp(`\\nNot changed after your Allow, because the setting had changed since the repair helper asked:\\n- Raise the Budget guard's Mission allowance from 5,000 to 7,500 steps \\(Settings → Budget guard\\)\\. It is ${steps} now\\.`));
      assert.doesNotMatch(card.run.report, /Waits for your OK|No longer needed \(the Mission ended\)/);
      assert.equal((await app.card({ sessionId: 'c', action: 'ok', id: raise.id, choice: 'allow' })).json.said, 'Already answered.');
    } finally {
      app.done();
    }
  }
});

test('review: an Allow after the end says the value the setting really had before (Budget\'s answer, Calls at once read now), never the saved one', { skip: !hasGit }, async () => {
  // Budget guard that cannot say its limit now: the raise is made, and its own "from" is told.
  const budget = await okLater({ allowance: null, from: 6000 });
  try {
    const got = await budget.app.card({ sessionId: 'c', action: 'ok', id: budget.raise.id, choice: 'allow' });
    assert.equal(got.json.said, 'Changed: Budget guard → Mission steps: 6,000 → 7,500. Nothing runs again because of it.');
    assert.deepEqual(budget.raises, [{ limit: 'steps', to: 7500 }]);
  } finally {
    budget.app.done();
  }
  // Calls at once: the repair helper asked 4 → 2; set to 8 by hand since: left as it is. Still 4: changed, from 4.
  for (const [now, said, writes] of [
    [8, 'Not changed: Calls at once for p is 8 now, not 4 as when the repair helper asked. To have 2, change it yourself in Settings → Mission → Calls at once. Nothing runs again because of it.', 0],
    [4, 'Changed: Mission → Calls at once for p: 4 → 2. Nothing runs again because of it.', 1],
  ]) {
    const mutated = [];
    const settings = { mutate: async (ns, ops) => { mutated.push({ ns, ops }); } };
    const first = await okLater({ allowance: { enabled: true, steps: 5000 } });
    const cwd = first.app.agents.get('c').header.cwd;
    // The saved run gets a Calls at once change that waits for your OK (as the repair helper asks it), then the app restarts.
    const runs = join(cwd, '.dsh-mission', 'runs');
    const file = join(runs, readdirSync(runs)[0], 'run.json');
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    const budgetEntry = saved.approvals.find((one) => one.fix?.kind === 'budget');
    saved.approvals.push({ ...budgetEntry, id: 'z9', n: 99, key: 'calls:p:2', what: 'Send at most 2 requests at a time to your model server p (Settings → Mission → Calls at once; now 4)', fix: { kind: 'calls', provider: 'p', from: 4, to: 2 } });
    writeFileSync(file, JSON.stringify(saved));
    const app = appHarness({ home: first.app.home, config: { callsAtOnce: JSON.stringify({ p: now }) }, services: { settings, budgetGuard: { longAllowance: () => ({ enabled: true, steps: 5000 }), raiseMission: async () => ({ ok: false, text: 'x' }) } } });
    try {
      app.open('c', cwd);
      assert.ok((await app.get('c')).json.strip.oks.some((one) => one.id === 'z9'));
      const got = await app.card({ sessionId: 'c', action: 'ok', id: 'z9', choice: 'allow' });
      assert.equal(got.json.said, said, JSON.stringify(got.json));
      assert.equal(mutated.length, writes);
    } finally {
      app.done();
      first.app.done();
    }
  }
});

test('review: /mission resume on an ended Mission with a change that waits for your OK says how to answer it and shows the strip again', { skip: !hasGit }, async () => {
  const { app } = await okLater({ allowance: { enabled: true, steps: 5000 } });
  try {
    const before = Number((await app.get('c')).json.run.showFrom) || 0;
    await tick(5);
    const got = await app.mission(app.agents.get('c'), 'resume');
    assert.match(String(got?.text ?? ''), /1 change still waits for your OK\. Press "1 change waits for your OK" above the chat box to Allow or Deny\. Nothing runs again\./);
    assert.ok((Number((await app.get('c')).json.run.showFrom) || 0) > before, 'the strip shows again');
  } finally {
    app.done();
  }
});

test('review F3: the defaults for a conversation that is not open yet say whether it would be isolated (Recon), as Modes answers from its tab', async () => {
  for (const isolated of [false, true]) {
    const app = appHarness({ services: { modes: { isolated: (id) => isolated && id === 'new1', get: () => 'code', readOnly: () => false, longTools: () => ({ files: true, web: true }), refreshTools: () => {}, ultraCode: () => false, depthOf: () => 'standard' } } });
    try {
      const got = await app.defaults('new1');
      assert.equal(got.status, 200);
      assert.equal(got.json.isolated, isolated);
      assert.equal((await app.defaults()).json.isolated, undefined, 'without a conversation: not said');
    } finally {
      app.done();
    }
  }
});
