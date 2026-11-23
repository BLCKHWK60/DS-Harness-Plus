// The Budget guard in a stand-in app: the Long run's allowance applies only while Mission says a Long run is working.
import assert from 'node:assert/strict';
import test from 'node:test';
import { apply } from '../index.js';

function running(settings, mission) {
  const handlers = new Map();
  const services = { mission, dshHomePath: undefined };
  const ctx = {
    logger: { warn: () => {}, info: () => {} },
    get: (name) => services[name],
    effect: () => {},
    on: (name, handler) => { handlers.set(name, handler); return () => {}; },
    inject: () => {},
    tools: { guard: () => () => {} },
  };
  apply(ctx, settings);
  const session = { id: 's1', header: { id: 's1' } };
  const event = (type, data) => handlers.get('session/event')(session, { type, data, time: new Date().toISOString() });
  const preStep = async () => (await handlers.get('agent/pre-step')({ agent: { session } }, async () => ({ kind: 'go' })))?.kind;
  return { event, preStep };
}
const defaults = { enabled: true, maxSteps: 300, maxHelperSteps: 1500, maxLongSteps: 5000, maxLongTokens: 60000000, maxTokens: 20000000, maxMinutes: 0, maxRepeats: 8, dayTokens: 0 };

test('an ordinary or paused Mission run gets no Long run allowance; a Long run that is working does, across all its rounds', async () => {
  let key = '';
  const app = running(defaults, { longRunId: () => key });
  // Not a Long run (an ordinary /mission run, or a paused Long run): 300 steps and no more.
  app.event('turn/start');
  for (let i = 0; i < 300; i += 1) app.event('step/start');
  assert.equal(await app.preStep(), 'reject');
  app.event('turn/end');
  // A Long run working: 40 rounds of 100 steps is 4,000 steps in all, inside the 5,000; no round is cut by the 300.
  key = 'run-1';
  for (let round = 0; round < 40; round += 1) {
    app.event('turn/start');
    for (let i = 0; i < 100; i += 1) {
      assert.equal(await app.preStep(), 'go', `round ${round}, step ${i}`);
      app.event('step/start');
    }
    app.event('turn/end');
  }
  // Another 1,000 take it to the whole run's 5,000: now it stops, although each round is small.
  app.event('turn/start');
  let stopped = false;
  for (let i = 0; i < 1100 && !stopped; i += 1) {
    if ((await app.preStep()) === 'reject') stopped = true;
    else app.event('step/start');
  }
  assert.ok(stopped, 'the whole run has an end');
  // Paused: the allowance is gone at once.
  key = '';
  assert.equal(await app.preStep(), 'reject');
});

test('a step limit the user saved holds for ordinary chats, but a Long run has its own allowance (the owner\'s decision, 19 November 2026)', async () => {
  // Like the owner's saved 538 per task: it capped a whole Long run before (run 6j85).
  let key = '';
  const app = running({ ...defaults, maxSteps: 538 }, { longRunId: () => key });
  app.event('turn/start');
  for (let i = 0; i < 538; i += 1) app.event('step/start');
  assert.equal(await app.preStep(), 'reject', 'an ordinary chat stops at the saved 538');
  app.event('turn/end');
  key = 'run-1';
  app.event('turn/start');
  for (let i = 0; i < 2000; i += 1) app.event('step/start');
  assert.equal(await app.preStep(), 'go', 'a working Long run goes past 538, up to its own 5,000');
  for (let i = 0; i < 3000; i += 1) app.event('step/start');
  assert.equal(await app.preStep(), 'reject', 'and stops at 5,000');
});

test('a Budget stop of a conversation with a Mission run pauses the run with the limit in plain words; a finished run, and a run resumed after its limit was raised, start a fresh allowance', async () => {
  const told = [];
  let listener;
  const mission = { longRunId: () => 'run-1', isRunning: () => true, budgetStopped: (id, text) => told.push([id, text]), onEvent: (fn) => { listener = fn; return () => {}; } };
  const handlers = new Map();
  const ctx = {
    logger: { warn: () => {}, info: () => {} },
    get: (name) => ({ mission })[name],
    effect: (fn) => { fn(); },
    provide: () => () => {},
    on: (name, handler) => { handlers.set(name, handler); return () => {}; },
    inject: (names, fn) => { if (names.includes('mission')) fn({ mission, effect: (inner) => inner() }); },
    tools: { guard: () => () => {} },
  };
  const settings = { ...defaults, maxLongSteps: 10 };
  apply(ctx, settings);
  const session = { id: 's1', header: { id: 's1' } };
  const event = (type) => handlers.get('session/event')(session, { type, time: new Date().toISOString() });
  const preStep = async () => (await handlers.get('agent/pre-step')({ agent: { session } }, async () => ({ kind: 'go' })))?.kind;
  event('turn/start');
  for (let i = 0; i < 300; i += 1) event('step/start');
  assert.equal(await preStep(), 'reject');
  assert.deepEqual(told, [['s1', 'This Mission reached its own limit of 300 steps.']]);
  // Resumed without raising the limit: the count is kept, so it stops again.
  listener({ type: 'resumed', conversation: 's1' });
  event('turn/start');
  assert.equal(await preStep(), 'reject');
  // The limit raised, then Resume: the whole-run count starts again.
  settings.maxSteps = 400;
  listener({ type: 'resumed', conversation: 's1' });
  event('turn/start');
  assert.equal(await preStep(), 'go');
});

test('a Resume after a pause that was not the Budget guard\'s keeps the whole-run count', async () => {
  let listener;
  const mission = { longRunId: () => 'run-1', isRunning: () => true, budgetStopped: () => {}, onEvent: (fn) => { listener = fn; return () => {}; } };
  const handlers = new Map();
  const ctx = {
    logger: { warn: () => {}, info: () => {} },
    get: (name) => ({ mission })[name],
    effect: (fn) => { fn(); },
    provide: () => () => {},
    on: (name, handler) => { handlers.set(name, handler); return () => {}; },
    inject: (names, fn) => { if (names.includes('mission')) fn({ mission, effect: (inner) => inner() }); },
    tools: { guard: () => () => {} },
  };
  apply(ctx, { ...defaults, maxSteps: 300, maxLongSteps: 1000 });
  const session = { id: 's1', header: { id: 's1' } };
  const event = (type) => handlers.get('session/event')(session, { type, time: new Date().toISOString() });
  const preStep = async () => (await handlers.get('agent/pre-step')({ agent: { session } }, async () => ({ kind: 'go' })))?.kind;
  for (let round = 0; round < 9; round += 1) {
    event('turn/start');
    for (let i = 0; i < 100; i += 1) event('step/start');
    event('turn/end');
    // You paused and resumed between rounds (or the run stalled, or the app restarted).
    listener({ type: 'resumed', conversation: 's1' });
  }
  event('turn/start');
  for (let i = 0; i < 100; i += 1) event('step/start');
  assert.equal(await preStep(), 'reject', '1,000 steps over the whole run, however often it was resumed');
  // A finished run's count is forgotten.
  listener({ type: 'finished', conversation: 's1' });
  event('turn/end');
  event('turn/start');
  assert.equal(await preStep(), 'go');
});

test('an old Mission without longRunId gives no allowance (and never breaks the guard)', async () => {
  const app = running(defaults, { isRunning: () => true });
  app.event('turn/start');
  for (let i = 0; i < 300; i += 1) app.event('step/start');
  assert.equal(await app.preStep(), 'reject');
});

// Mission stage C: a run that ended with questions left can be continued (the same run id). Its whole-run count
// counts across the continue, as across a Resume.
function continuable(settings) {
  let listener;
  let key = 'run-1';
  const told = [];
  const mission = { longRunId: () => key, isRunning: () => true, budgetStopped: (id, text) => told.push([id, text]), onEvent: (fn) => { listener = fn; return () => {}; } };
  const handlers = new Map();
  const ctx = {
    logger: { warn: () => {}, info: () => {} },
    get: (name) => ({ mission })[name],
    effect: (fn) => { fn(); },
    provide: () => () => {},
    on: (name, handler) => { handlers.set(name, handler); return () => {}; },
    inject: (names, fn) => { if (names.includes('mission')) fn({ mission, effect: (inner) => inner() }); },
    tools: { guard: () => () => {} },
  };
  apply(ctx, settings);
  const session = { id: 's1', header: { id: 's1' } };
  const event = (type) => handlers.get('session/event')(session, { type, time: new Date().toISOString() });
  const preStep = async () => (await handlers.get('agent/pre-step')({ agent: { session } }, async () => ({ kind: 'go' })))?.kind;
  const steps = (n) => { for (let i = 0; i < n; i += 1) event('step/start'); };
  return { send: (e) => listener(e), event, preStep, steps, told, setKey: (k) => { key = k; } };
}

test('stage C: a continued run keeps its whole-run count, so it stops at its allowance as before the end', async () => {
  const app = continuable({ ...defaults, maxSteps: 300, maxLongSteps: 1000 });
  app.event('turn/start');
  app.steps(900);
  assert.equal(await app.preStep(), 'go');
  app.send({ type: 'finished', conversation: 's1', runId: 'run-1' });
  app.event('turn/end');
  // The owner answers the leftover questions: the same run continues.
  app.send({ type: 'resumed', conversation: 's1', runId: 'run-1', continued: true, by: 'continue' });
  app.event('turn/start');
  app.steps(100);
  assert.equal(await app.preStep(), 'reject', '900 before the end plus 100 after the continue reach the 1,000 of the whole run');
});

test('stage C: a run stopped by its allowance and continued after the limit was raised starts a fresh allowance', async () => {
  const settings = { ...defaults, maxSteps: 300, maxLongSteps: 10 };
  const app = continuable(settings);
  app.event('turn/start');
  app.steps(300);
  assert.equal(await app.preStep(), 'reject');
  app.send({ type: 'finished', conversation: 's1', runId: 'run-1' });
  app.event('turn/end');
  settings.maxSteps = 400;
  app.send({ type: 'resumed', conversation: 's1', runId: 'run-1', continued: true });
  app.event('turn/start');
  app.steps(10);
  assert.equal(await app.preStep(), 'go');
});

test('stage C: a stopped run continued without raising the limit stops again', async () => {
  const app = continuable({ ...defaults, maxSteps: 300, maxLongSteps: 10 });
  app.event('turn/start');
  app.steps(300);
  assert.equal(await app.preStep(), 'reject');
  app.send({ type: 'finished', conversation: 's1', runId: 'run-1' });
  app.event('turn/end');
  app.send({ type: 'resumed', conversation: 's1', runId: 'run-1', continued: true });
  app.event('turn/start');
  app.steps(1);
  assert.equal(await app.preStep(), 'reject');
});

test('stage C: a continued event for another run id starts a fresh allowance', async () => {
  const app = continuable({ ...defaults, maxSteps: 300, maxLongSteps: 1000 });
  app.event('turn/start');
  app.steps(900);
  app.send({ type: 'finished', conversation: 's1', runId: 'run-1' });
  app.event('turn/end');
  app.setKey('run-2');
  app.send({ type: 'resumed', conversation: 's1', runId: 'run-2', continued: true });
  app.event('turn/start');
  app.steps(100);
  assert.equal(await app.preStep(), 'go');
});

test('stage C: steps counted between the continue and its late event are added, not lost', async () => {
  const app = continuable({ ...defaults, maxSteps: 300, maxLongSteps: 1000 });
  app.event('turn/start');
  app.steps(600);
  app.send({ type: 'finished', conversation: 's1', runId: 'run-1' });
  app.event('turn/end');
  // The continued run's first steps come before Budget hears 'resumed' (it is sent on a timer).
  app.event('turn/start');
  app.steps(300);
  app.send({ type: 'resumed', conversation: 's1', runId: 'run-1', continued: true });
  app.steps(100);
  assert.equal(await app.preStep(), 'reject', '600 + 300 + 100 = 1,000');
});

// Mission stage E: Budget tells Mission which limit stopped it, marks the stop, shows old "Long run" stops with the
// name Mission, and raises a Mission's allowance only on Mission's call after the owner's Allow.
function stageE(settings, mutate) {
  const handlers = new Map();
  const told = [];
  const services = {
    mission: { longRunId: () => 'run-1', isRunning: () => true, budgetStopped: (...args) => told.push(args) },
    settings: { mutate: async (ns, ops) => { mutate.push([ns, ops]); for (const op of ops) settings[op.path[0]] = op.value; } },
  };
  let provided;
  let route;
  const ctx = {
    logger: { warn: () => {}, info: () => {} },
    get: (name) => services[name],
    effect: (fn) => { fn(); },
    provide: (name, value) => { if (name === 'budgetGuard') provided = value; return () => {}; },
    on: (name, handler) => { handlers.set(name, handler); return () => {}; },
    inject: (names, fn) => {
      if (names.includes('webServer')) fn({ effect: (inner) => inner(), connection: { requestRejection: () => undefined }, webServer: { register: (r) => { route = r; return () => {}; } } });
    },
    tools: { guard: () => () => {} },
  };
  apply(ctx, settings);
  const session = { id: 's1', header: { id: 's1' } };
  const event = (type) => handlers.get('session/event')(session, { type, time: new Date().toISOString() });
  const preStep = async () => (await handlers.get('agent/pre-step')({ agent: { session } }, async () => ({ kind: 'go' })))?.kind;
  const read = () => new Promise((resolve) => {
    let body = '';
    route.handler({ method: 'GET' }, { setHeader: () => {}, end: (text) => { body = text; resolve(JSON.parse(body)); } });
  });
  return { event, preStep, told, service: () => provided, read };
}

test('stage E: a stop by a Mission\'s allowance tells Mission which limit and its value, and is marked as a Mission stop', async () => {
  const mutate = [];
  const app = stageE({ ...defaults, maxLongSteps: 400 }, mutate);
  app.event('turn/start');
  for (let i = 0; i < 400; i += 1) app.event('step/start');
  assert.equal(await app.preStep(), 'reject');
  assert.deepEqual(app.told, [['s1', 'This Mission reached its own limit of 400 steps.', { limit: 'steps', max: 400 }]]);
  const data = await app.read();
  assert.equal(data.stops[0].mission, true);
});

test('stage E: raiseMission writes the higher allowance through the app\'s settings and refuses a lower or too high one', async () => {
  const mutate = [];
  const settings = { ...defaults };
  const app = stageE(settings, mutate);
  const raise = app.service().raiseMission;
  assert.deepEqual(await raise({ limit: 'steps', to: 7500 }), { ok: true, from: 5000, to: 7500 });
  assert.deepEqual(mutate, [['budget', [{ op: 'set', path: ['maxLongSteps'], value: 7500 }]]]);
  assert.equal(app.service().longAllowance().steps, 7500, 'the new allowance holds at once');
  assert.equal((await raise({ limit: 'steps', to: 7000 })).ok, false);
  assert.equal((await raise({ limit: 'steps', to: 60000 })).ok, false);
  assert.equal(mutate.length, 1, 'a refused raise writes nothing');
  settings.enabled = false;
  assert.match((await raise({ limit: 'steps', to: 9000 })).text, /switched off/);
});

test('stage E: a raise that the app cannot save reports it and changes nothing', async () => {
  const failing = { mutate: async () => { throw new Error('settings/conflict'); } };
  const result = await (async () => {
    let provided;
    apply({
      logger: { warn: () => {}, info: () => {} },
      get: (name) => ({ settings: failing })[name],
      effect: (fn) => { fn(); },
      provide: (name, value) => { provided = value; return () => {}; },
      on: () => () => {},
      inject: () => {},
      tools: { guard: () => () => {} },
    }, { ...defaults });
    return provided.raiseMission({ limit: 'tokens', to: 90000000 });
  })();
  assert.equal(result.ok, false);
  assert.match(result.text, /could not be saved/);
});

test('stage E: a stop saved as "This Long run reached …" is shown as "This Mission reached …"', async () => {
  const { mkdtempSync, rmSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const home = mkdtempSync(join(tmpdir(), 'dsh-budget-'));
  try {
    mkdirSync(join(home, 'budget'), { recursive: true });
    writeFileSync(join(home, 'budget', 'budget.json'), JSON.stringify({ stops: [{ sessionId: 'old', at: 1, limit: 'steps', used: 5000, max: 5000, text: 'This Long run reached its own limit of 5,000 steps.' }] }));
    let route;
    apply({
      logger: { warn: () => {}, info: () => {} },
      get: (name) => ({ dshHomePath: (sub) => join(home, sub) })[name],
      effect: (fn) => { const undo = fn(); if (typeof undo === 'function') setTimeout(undo, 0); },
      provide: () => () => {},
      on: () => () => {},
      inject: (names, fn) => { if (names.includes('webServer')) fn({ effect: (inner) => inner(), connection: { requestRejection: () => undefined }, webServer: { register: (r) => { route = r; return () => {}; } } }); },
      tools: { guard: () => () => {} },
    }, { ...defaults });
    const data = await new Promise((resolve) => route.handler({ method: 'GET' }, { setHeader: () => {}, end: (text) => resolve(JSON.parse(text)) }));
    assert.equal(data.stops[0].text, 'This Mission reached its own limit of 5,000 steps.');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
