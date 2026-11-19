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

test('a step limit the user saved holds in a Long run too', async () => {
  const app = running({ ...defaults, maxSteps: 50 }, { longRunId: () => 'run-1' });
  app.event('turn/start');
  for (let i = 0; i < 50; i += 1) app.event('step/start');
  assert.equal(await app.preStep(), 'reject');
});

test('an old Mission without longRunId gives no allowance (and never breaks the guard)', async () => {
  const app = running(defaults, { isRunning: () => true });
  app.event('turn/start');
  for (let i = 0; i < 300; i += 1) app.event('step/start');
  assert.equal(await app.preStep(), 'reject');
});
