/**
 * Stage E, point 6: a model server that does not answer. The Mission waits and tries again by itself (no tries or laps
 * used, the wait does not count against its time limit), and ends with its report 2 hours after the first failure.
 * Each test fails on the code before stage E.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GIT_CANDIDATES } from '../lib/checkpoints.js';
import { DOWN_MAX_MS, DOWN_WAITS, FALLBACK_ASK_MS, isServerDown, nextTryAt } from '../lib/down.js';
import { continueBlock, report } from '../lib/run.js';
import { stripOf } from '../lib/strip.js';
import { DOWN_OFF_TEXT, NOT_DOWN_TEXT, TRY_NOW_TEXT, createRunner } from '../runner.js';
import { DISARM_SETTLE_MS, wantsAwake } from '../index.js';
import { problemText } from '../lib/strip.js';
import { appHarness } from './app-harness.mjs';
import { APPROVE, PLAN, bench, fresh, tick } from './stage-e-bench.mjs';

const hasGit = GIT_CANDIDATES.some((path) => existsSync(path));
const DOWN = { text: '', stopReason: 'error', diagnostic: 'connect ECONNREFUSED 127.0.0.1:8080' };

test('what counts as the server not answering: the app\'s failure codes, the words of a refused connection, Route health', () => {
  assert.equal(isServerDown({ code: 'TRANSPORT' }), true);
  assert.equal(isServerDown({ code: 'SERVER', status: 503 }), true);
  assert.equal(isServerDown({ code: 'SERVER', status: 500 }), false);
  assert.equal(isServerDown({ text: 'fetch failed' }), true);
  assert.equal(isServerDown({ text: 'Cannot reach local-route: connection refused' }), true);
  assert.equal(isServerDown({ text: 'The helper\'s model refused the task' }), false);
  assert.equal(isServerDown({ text: 'model_not_found' }), false);
  assert.equal(isServerDown({ health: 'down' }), true);
  const now = 1_000_000;
  assert.deepEqual([0, 1, 2, 3, 4, 9].map((tries) => (nextTryAt(now, tries) - now) / 60000), [1, 2, 5, 10, 15, 15]);
  assert.deepEqual(DOWN_WAITS, [1, 2, 5, 10, 15]);
});

test('one helper: the server does not answer; no try is used, the goal is paused by Mission itself, the time limit stands still; a try that works ends the wait', async () => {
  let down = true;
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : /^Mission: item/.test(spec.label) && down ? DOWN : undefined) });
  try {
    await app.start({ retry: true, minutes: 60 });
    await app.step(); // plan
    const deadline = app.run().long.deadline;
    const said = await app.step();
    assert.match(said, /^Your model server does not answer\. The Mission waits and tries again by itself \(next try at \d\d:\d\d\); this wait does not count against its time limit\. If the server is not back by \d\d:\d\d, the Mission ends with its report\./);
    const run = app.run();
    assert.deepEqual([run.items[0].status, run.items[0].tries, run.items[0].interrupted, run.steps, run.long.lap], ['open', 0, true, 1, 0], 'no try, no lap, no step used');
    assert.ok(run.long.down && run.long.downFirst > 0);
    await tick();
    assert.equal(app.goal.phase, 'paused', 'its goal paused by Mission (no rounds spent)');
    assert.equal(app.runner.waitingQuietly('conv'), true);
    assert.equal(app.runner.pausedOutside(app.agent), false, 'Mission\'s own pause is not yours');
    assert.match(await app.step(), /^Your model server does not answer\./, 'mission_step keeps saying it waits');
    assert.equal(app.fired.filter((event) => event.type === 'stopped-by-itself' && event.why === 'down').length, 1);
    const view = app.runner.view('conv');
    const strip = stripOf({ run: { ...view, goalPhase: 'paused' } });
    assert.equal(strip.state, 'down');
    assert.equal(strip.down.endsAt, view.down.first + DOWN_MAX_MS);
    assert.equal(strip.canFinishLap, true);
    // The sweep tries again on time; the wait goes to the deadline.
    const since = run.long.down.since;
    assert.deepEqual(app.runner.sweep(since + 30_000), []);
    assert.ok(run.long.down, 'not yet');
    down = false;
    app.runner.sweep(since + 61_000);
    assert.equal(run.long.down, undefined);
    assert.equal(run.long.deadline, deadline + 61_000, 'the wait does not count against the time limit');
    assert.equal(run.long.probing, true);
    assert.equal(app.goal.phase, 'active', 'the try gives the goal its rounds again');
    const next = await app.step();
    assert.match(next, /item 1 of 2/);
    assert.equal(run.long.downFirst, undefined, 'the outage is over');
    await tick();
    assert.ok(app.fired.some((event) => event.type === 'resumed' && event.by === 'down'));
    assert.match(report(run), /It waited 1 minute for your model server; that time did not count\./);
  } finally {
    app.done();
  }
});

test('the tries: Route health\'s probe says down: 1, 2, 5, 10, 15, 15 minutes apart; a failure 2 hours after the first ends it at once with its report (Finish it shows)', async () => {
  const health = { state: () => ({ state: 'down' }), probeNow: async () => ({ state: 'down' }) };
  const app = bench({ services: { routeHealth: health }, answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : { text: '', stopReason: 'error', diagnostic: 'the request failed' }) });
  try {
    await app.start({ retry: true });
    await app.step(); // plan (the probe does not matter until a helper fails)
    // Route health calls the helper's server down: the worker's failure is a server one.
    const said = await app.step();
    assert.match(said, /Your model server does not answer/);
    const run = app.run();
    const gaps = [];
    for (let i = 0; i < 6; i += 1) {
      const before = run.long.down.nextAt;
      app.runner.sweep(before);
      await tick();
      gaps.push(Math.round((run.long.down.nextAt - before) / 60000));
    }
    assert.deepEqual(gaps, [2, 5, 10, 15, 15, 15]);
    assert.equal(run.long.down.tries, 6);
    app.runner.sweep(run.long.downFirst + DOWN_MAX_MS);
    await tick();
    assert.notEqual(run.status, 'running');
    assert.equal(run.longEndKind, 'down');
    assert.match(report(run), /It ended because your model server did not answer for 2 hours\./);
    assert.equal(continueBlock(run), '', 'Finish it shows (only End blocks it)');
    assert.match(await app.step(), /Your model server did not answer for 2 hours, so the Mission ended\. This is the final report/);
    // Run events are told on a later timer: under a loaded machine one tick may not be enough (waits at most 2 s).
    for (let i = 0; i < 200 && !app.fired.some((event) => event.type === 'finished' && event.endKind === 'down'); i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(app.fired.some((event) => event.type === 'finished' && event.endKind === 'down'));
  } finally {
    app.done();
  }
});

test('several helpers: one finds the server down, the others stop (their items keep their tries); one try uses one helper until it worked', async () => {
  let down = false;
  const app = bench({
    answer: (spec) => {
      if (spec.label === 'Mission: planner') return { text: PLAN([{ title: 'one' }, { title: 'two' }, { title: 'three' }]) };
      if (spec.label === 'Mission: questions') return { text: '{"questions": []}' };
      if (/^Mission: item/.test(spec.label)) return down ? DOWN : { text: 'DONE: ok' };
      return undefined;
    },
  });
  try {
    await app.start({ retry: true, helpers: 3 });
    await app.step();
    down = true;
    for (let i = 0; i < 5 && !app.run().long.down; i += 1) await app.step();
    const run = app.run();
    assert.ok(run.long.down, 'waiting for the server');
    assert.ok(run.items.every((item) => item.tries === 0), 'no item used a try');
    down = false;
    app.runner.sweep(run.long.down.nextAt);
    assert.equal(run.long.probing, true);
    assert.ok(app.runner.view('conv').workingLanes.filter((lane) => lane.kind === 'work').length <= 1, 'one helper while it tries');
  } finally {
    app.done();
  }
});

test('Try again by itself off: no automatic wait; it pauses and says to start the server', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : DOWN) });
  try {
    await app.start({ retry: false });
    await app.step();
    const said = await app.step();
    assert.match(said, /Try again by itself is off for this Mission\. Start the server, then press Resume\./);
    await tick();
    assert.equal(app.run().stalled, `Paused: ${DOWN_OFF_TEXT}`);
    assert.equal(app.run().long.down, undefined);
  } finally {
    app.done();
  }
});

test('Pause, Resume and Try now: a pause closes the wait; Resume starts a fresh 2-hour count; Try now tries at once; Finish this lap ends it now', async () => {
  let down = true;
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : /^Mission: item/.test(spec.label) && down ? DOWN : undefined) });
  try {
    await app.start({ retry: true });
    await app.step();
    await app.step();
    const run = app.run();
    assert.throws(() => app.runner.tryNow('other'), new RegExp(NOT_DOWN_TEXT));
    app.runner.stop(app.agent);
    assert.equal(run.long.down, undefined, 'a pause ends the wait');
    assert.ok(run.long.downFirst > 0);
    app.runner.resume(app.agent);
    assert.equal(run.long.downFirst, undefined, 'your Resume starts a fresh count');
    await app.step();
    assert.ok(run.long.down);
    assert.equal(app.runner.resume(app.agent), TRY_NOW_TEXT, 'Resume while it waits tries now');
    assert.equal(run.long.down, undefined);
    await app.step();
    assert.ok(run.long.down);
    assert.match(app.runner.finishLap(app.agent), /stops waiting for your model server and writes its report now/);
    assert.notEqual(run.status, 'running');
    assert.equal(run.longEndKind, 'asked');
  } finally {
    app.done();
  }
});

test('after 10 minutes the tier\'s next fallback model is asked for (once; never in Recon); Allow lets the helpers use it', async () => {
  const tiers = { resolveTier: () => ({ id: 't1' }), roleRoute: () => undefined, fallbackChain: () => [{ provider: 'p', model: 'same-server' }, { provider: 'p2', model: 'm2' }] };
  const app = bench({ services: { modelTiers: tiers }, answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : /^Mission: item/.test(spec.label) && spec.agentOptions?.provider !== 'p2' ? DOWN : undefined) });
  try {
    await app.start({ retry: true, helpers: 2 });
    await app.step();
    await app.step();
    const run = app.run();
    app.runner.sweep(run.long.downFirst + FALLBACK_ASK_MS - 1000);
    assert.equal((run.approvals ?? []).length, 0, 'not before 10 minutes');
    // The sweep tried once meanwhile (still down): the outage goes on.
    for (let i = 0; i < 3 && !run.long.down; i += 1) await app.step();
    app.runner.sweep(run.long.downFirst + FALLBACK_ASK_MS);
    const ask = run.approvals.find((entry) => entry.fix?.kind === 'model');
    assert.equal(ask.what, 'Let this Mission\'s helpers use m2, the next model in your tier\'s fallback list (Settings → Model tiers)');
    assert.equal(ask.status, 'open');
    app.runner.sweep(run.long.downFirst + FALLBACK_ASK_MS + 60_000);
    assert.equal(run.approvals.filter((entry) => entry.fix?.kind === 'model').length, 1, 'once per outage');
    assert.equal(app.runner.setFallback('conv', { provider: 'p2', model: 'm2' }), true);
    if (run.long.down) app.runner.tryNow('conv');
    const worked = await app.step();
    assert.match(worked, /item 1 of 1.*worker on m2 \(the fallback model you allowed\)/);
    assert.deepEqual(app.runner.view('conv').fallback, { provider: 'p2', model: 'm2' });
  } finally {
    app.done();
  }
});

test('review of stage E: an allowed fallback is tried on its own server (not the one that is down); a conversation round that fails on the old server leaves the helpers on the fallback at work; with one helper on the conversation\'s own server no fallback is asked', async () => {
  const tiers = { resolveTier: () => ({ id: 't1' }), roleRoute: () => undefined, fallbackChain: () => [{ provider: 'p2', model: 'm2' }] };
  const probes = [];
  const routeHealth = { state: (provider) => ({ state: provider === 'p' ? 'down' : 'up' }), probeNow: async (provider) => { probes.push(provider); return { state: provider === 'p' ? 'down' : 'up' }; } };
  const answer = (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : /^Mission: item/.test(spec.label) && spec.agentOptions?.provider !== 'p2' ? DOWN : undefined);
  const app = bench({ services: { modelTiers: tiers, routeHealth }, answer: (spec) => (/^Mission: review/.test(spec.label) ? { text: APPROVE } : answer(spec)) });
  try {
    await app.start({ retry: true, helpers: 2 });
    await app.step();
    for (let i = 0; i < 3 && !app.run().long.down; i += 1) await app.step();
    const run = app.run();
    assert.ok(run.long.down, 'waits for its server');
    app.runner.sweep(run.long.downFirst + FALLBACK_ASK_MS);
    await tick(20);
    const ask = run.approvals.find((entry) => entry.fix?.kind === 'model');
    assert.equal(ask?.status, 'open');
    probes.length = 0;
    assert.equal(app.runner.setFallback('conv', { provider: 'p2', model: 'm2' }), true);
    if (run.long.down) app.runner.tryNow('conv');
    await tick(40);
    assert.deepEqual([...new Set(probes)], ['p2'], 'the fallback\'s server is tried, not the one that is down');
    assert.equal(run.long.down, undefined, 'the wait is over');
    await tick(40);
    assert.ok(app.seen.some((entry) => /^Mission: item/.test(entry.label) && entry.model === 'm2'), 'a helper works on the fallback');
  } finally {
    app.done();
  }
  // The conversation's own round fails on the old server (the watchdog): the helpers on the fallback keep working.
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const busy = bench({ services: { modelTiers: tiers, routeHealth }, answer: async (spec) => {
    if (spec.label === 'Mission: planner') return { text: PLAN([{ title: 'one' }, { title: 'two' }]) };
    if (/^Mission: item/.test(spec.label)) await held;
    return /^Mission: review/.test(spec.label) ? { text: APPROVE } : undefined;
  } });
  try {
    await busy.start({ retry: true, helpers: 2 });
    busy.runner.setFallback('conv', { provider: 'p2', model: 'm2' });
    await busy.step();
    await tick(20);
    assert.ok(busy.runner.busy('conv') > 0, 'helpers at work on the fallback');
    assert.equal(busy.runner.serverDown(busy.agent, { provider: 'p', last: 'connection refused' }), true);
    assert.equal(busy.run().long.down, undefined, 'no wait: its helpers do not use that server');
    assert.ok(busy.runner.busy('conv') > 0, 'its helpers were not stopped');
    // A failure on the fallback's own server is a real wait.
    assert.equal(busy.runner.serverDown(busy.agent, { provider: 'p2', last: 'connection refused' }), true);
    assert.ok(busy.run().long.down);
  } finally {
    release();
    await tick(20);
    busy.done();
  }
  // One helper, on the conversation's own server: a fallback for the helpers alone cannot help, so it is not asked.
  const one = bench({ services: { modelTiers: tiers, routeHealth }, answer });
  try {
    await one.start({ retry: true });
    await one.step();
    for (let i = 0; i < 3 && !one.run().long.down; i += 1) await one.step();
    const run = one.run();
    assert.ok(run.long.down);
    one.runner.sweep(run.long.downFirst + FALLBACK_ASK_MS);
    await tick(20);
    assert.equal((run.approvals ?? []).filter((entry) => entry.fix?.kind === 'model').length, 0);
  } finally {
    one.done();
  }
});

test('a planner\'s prose whose format ask meets a dead server makes the Mission wait (never a one-item plan)', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' || spec.label === 'Mission: planner (again)' ? { text: 'I would do it in steps.' } : spec.label === 'Mission: planner (format)' ? DOWN : undefined) });
  try {
    await app.start({ retry: true });
    const said = await app.step();
    assert.match(said, /Your model server does not answer/);
    assert.equal(app.run().items.length, 0, 'no plan made of the failure');
  } finally {
    app.done();
  }
});

test('a restart after a night: it tries once before ending (the 2 hours count from the first failure)', async () => {
  const homeDir = fresh('mission-e-home-');
  const home = (sub) => join(homeDir, sub);
  const root = fresh();
  const app = bench({ home, root, answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : DOWN) });
  try {
    await app.start({ retry: true });
    await app.step();
    await app.step();
    assert.ok(app.run().long.down);
    // The app closes; it starts again ten hours later and reads the run from its folder.
    const again = bench({ home, root, answer: () => DOWN });
    const run = again.runner.runOf('conv');
    assert.ok(run.long.down.nextAt <= Date.now(), 'its next try is at once');
    const night = 10 * 60 * 60_000;
    run.long.downFirst -= night;
    run.long.down.first -= night;
    run.long.down.since -= night;
    again.runner.sweep(Date.now());
    assert.equal(run.status, 'running', 'it tries first');
    assert.equal(run.long.probing, true);
    const said = await again.step();
    assert.match(said, /Your model server did not answer for 2 hours|This is the final report/);
    assert.equal(run.longEndKind, 'down');
  } finally {
    app.done();
  }
});

test('the watchdog: the app stopped giving rounds after a failed turn whose error says the server is down: the Mission waits for it instead of the 2, 5, 10-minute tries', { skip: !hasGit }, async () => {
  const app = appHarness();
  try {
    const agent = app.open('c');
    await app.card({ sessionId: 'c', action: 'start', goal: 'make two small things for me', mode: 'auto' });
    await app.step(agent);
    // The app's real order (lab, 20 November 2026): the goal is disarmed first, the failed turn's error comes 1 ms later.
    app.goals.get('c').activation = 'disarmed';
    app.emit('goal/activation-changed', { sessionId: 'c', goal: { activation: 'disarmed' } });
    app.emit('session/event', { id: 'c' }, { type: 'turn/end', data: { reason: { kind: 'error', error: { message: 'Connection error.', code: 'TRANSPORT' } } } });
    await tick(DISARM_SETTLE_MS + 50);
    const view = app.runner().view('c');
    assert.ok(view.down, 'it waits for the server');
    assert.equal(view.stalled, '', 'not "stopped by itself"');
    const card = await app.get('c');
    assert.equal(card.json.strip.state, 'down');
    const tried = await app.card({ sessionId: 'c', action: 'try-now' });
    assert.equal(tried.json.said, TRY_NOW_TEXT);
    const again = await app.card({ sessionId: 'c', action: 'try-now' });
    assert.deepEqual([again.status, again.json.error], [400, NOT_DOWN_TEXT]);
  } finally {
    app.done();
  }
});

test('a runner without the stage E fields reads runs from before (no down, no repair)', () => {
  const runner = createRunner({ get: () => undefined }, { settings: () => ({ limits: {}, roles: {}, projects: {} }), pointsOf: () => ({}), afterCommand: async () => [], warn: () => {} });
  assert.equal(runner.downActive('x'), false);
  assert.equal(runner.serverDown({ id: 'x' }), false);
});

test('keep-awake stays on while it waits for its model server (its goal paused by Mission, it still tries); not while you paused it', () => {
  const run = { kind: 'long', status: 'running', stalled: '', pausedAt: 0, long: { keepAwake: true, down: { since: 1 } } };
  assert.equal(wantsAwake(run, true), true);
  assert.equal(wantsAwake({ ...run, long: { keepAwake: true } }, true), false, 'a goal paused for another reason');
  assert.equal(wantsAwake({ ...run, pausedAt: 5 }, true), false);
  assert.equal(problemText('Paused by the Budget guard: this Long run reached its own limit of 5,000 steps.'), 'The Budget guard: this Mission reached its own limit of 5,000 steps.', 'old words shown with Mission');
});
