/**
 * Split Plus, step 1: how many panes may use a local model at once (lib/gate.js), and the server half
 * holding a pane's step until a place is free. Stand-ins only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, DATA_PATH } from '../index.js';
import { openLocalGate } from '../lib/gate.js';

const tick = () => new Promise((done) => setTimeout(done, 5));

test('panes over the limit wait, first come first served, and get in when a place is given back', async () => {
  let limit = 1;
  const gate = openLocalGate(() => limit);
  assert.equal(await gate.acquire('a'), true);
  assert.equal(await gate.acquire('a'), true, 'a pane never waits for itself (its helpers share its place)');
  const order = [];
  const b = gate.acquire('b').then((got) => order.push(['b', got]));
  const c = gate.acquire('c').then((got) => order.push(['c', got]));
  await tick();
  assert.deepEqual(gate.waiting(), ['b', 'c']);
  gate.release('a');
  await b;
  assert.deepEqual(order, [['b', true]]);
  assert.deepEqual(gate.holding(), ['b']);
  limit = 2;
  gate.recheck();
  await c;
  assert.deepEqual(order, [['b', true], ['c', true]]);
  assert.deepEqual(gate.waiting(), []);
});

test('a stopped turn stops waiting, and a pane that goes away leaves the queue', async () => {
  const gate = openLocalGate(() => 1);
  await gate.acquire('a');
  const controller = new AbortController();
  const b = gate.acquire('b', controller.signal);
  const c = gate.acquire('c');
  await tick();
  controller.abort();
  assert.equal(await b, false);
  gate.release('c');
  assert.equal(await c, false);
  assert.deepEqual(gate.waiting(), []);
  assert.equal(await gate.acquire('d', AbortSignal.abort()), false);
  const late = gate.acquire('b');
  const again = gate.acquire('b');
  gate.release('a');
  assert.deepEqual([await late, await again], [true, true]);
  assert.equal(openLocalGate(() => Number.NaN).holding().length, 0, 'a broken limit counts as 1');
});

/** A stand-in app with one local and one online provider, and the hooks Split Plus listens to. */
function standIn({ limit = 1 } = {}) {
  const routes = new Map();
  const hooks = {};
  const sessions = new Map();
  const settingsRows = [
    { ns: 'llm-pi-ai', value: { providers: { mac: { baseURL: 'http://127.0.0.1:8080/v1' }, lan: { baseURL: 'http://model-box.lan:8080/v1' }, cloud: { baseURL: 'https://api.example.com/v1' } } } },
    { ns: 'modes', value: { modes: { code: { label: 'Code' } } } },
  ];
  const ctx = {
    get: (name) => (name === 'settings' ? { describe: () => settingsRows } : name === 'sessions' ? { get: (id) => sessions.get(id) } : undefined),
    on: (name, fn) => { hooks[name] = fn; },
    effect: (fn) => fn(),
    inject(_names, fn) { fn({ effect: (register) => register(), webServer: { register: (route) => routes.set(route.path, route) }, connection: { requestRejection: () => undefined } }); },
    logger: { warn() {} },
  };
  apply(ctx, { enabled: true, localAtOnce: limit });
  const agent = (id, parent) => {
    const header = parent ? { id, origin: 'subagent', parentSession: parent } : { id };
    sessions.set(id, { header });
    return { id, session: { header } };
  };
  const step = (who, provider, signal) => hooks['agent/pre-step']({ agent: who, modelSelection: { provider }, signal }, async () => ({ kind: 'continue', who: who.id }));
  return { routes, hooks, agent, step };
}

async function hit(routes, { method = 'GET', query = '', body } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = { method, url: `${DATA_PATH}${query}`, async *[Symbol.asyncIterator]() { yield* chunks; } };
  let text = '';
  const res = { statusCode: 200, setHeader() {}, end(value) { text = value ?? ''; } };
  await routes.get(DATA_PATH).handler(req, res);
  return text ? JSON.parse(text) : {};
}

test('a second pane on a local model waits before its step, says so, and goes on when the first turn ends', async () => {
  const { routes, hooks, agent, step } = standIn({ limit: 1 });
  const one = agent('one');
  const two = agent('two');
  await hit(routes, { method: 'POST', body: { action: 'panes', panes: [{ id: 'p1', sessionId: 'one' }, { id: 'p2', sessionId: 'two' }] } });
  assert.deepEqual(await step(one, 'mac'), { kind: 'continue', who: 'one' });
  let done = false;
  const waiting = step(two, 'lan').then((value) => { done = true; return value; });
  await tick();
  assert.equal(done, false, 'a model in the owner\'s own network counts too');
  assert.deepEqual((await hit(routes, { query: '?sessions=one,two' })).waitingLocal, ['two']);
  // The first pane's helper uses its place and does not wait.
  const helper = agent('helper', 'one');
  assert.deepEqual(await step(helper, 'mac'), { kind: 'continue', who: 'helper' });
  hooks['agent/status']({ agent: one, status: 'idle' });
  await tick();
  assert.equal(done, false, 'the helper is still at work on the first pane\'s place');
  hooks['agent/status']({ agent: helper, status: 'idle' });
  assert.deepEqual(await waiting, { kind: 'continue', who: 'two' });
  assert.deepEqual((await hit(routes, { query: '?sessions=one,two' })).holdingLocal, ['two']);
  hooks['agent/disposed']({ agent: two });
  assert.deepEqual((await hit(routes, { query: '?sessions=one,two' })).holdingLocal, []);
});

test('online models, unknown providers and conversations outside the Split page never wait', async () => {
  const { routes, agent, step } = standIn({ limit: 1 });
  await hit(routes, { method: 'POST', body: { action: 'panes', panes: [{ id: 'p1', sessionId: 'one' }, { id: 'p2', sessionId: 'two' }] } });
  await step(agent('one'), 'mac');
  assert.deepEqual(await step(agent('two'), 'cloud'), { kind: 'continue', who: 'two' });
  assert.deepEqual(await step(agent('two'), 'nobody-knows'), { kind: 'continue', who: 'two' });
  assert.deepEqual(await step(agent('elsewhere'), 'mac'), { kind: 'continue', who: 'elsewhere' });
});

test('a helper that steps after its conversation went idle gives the place back when it goes idle', async () => {
  const { routes, hooks, agent, step } = standIn({ limit: 1 });
  await hit(routes, { method: 'POST', body: { action: 'panes', panes: [{ id: 'p1', sessionId: 'one' }, { id: 'p2', sessionId: 'two' }] } });
  const one = agent('one');
  await step(one, 'mac');
  hooks['agent/status']({ agent: one, status: 'idle' });
  const helper = agent('late-helper', 'one');
  await step(helper, 'mac');
  assert.deepEqual((await hit(routes, { query: '?sessions=one,two' })).holdingLocal, ['one']);
  hooks['agent/status']({ agent: helper, status: 'idle' });
  assert.deepEqual((await hit(routes, { query: '?sessions=one,two' })).holdingLocal, [], 'no place is kept by nobody');
});

test('two helpers of one pane waiting: one stopped stops only its own wait', async () => {
  const gate = openLocalGate(() => 1);
  await gate.acquire('a');
  const stop = new AbortController();
  const first = gate.acquire('b', stop.signal, 'b-helper-1');
  const second = gate.acquire('b', new AbortController().signal, 'b-helper-2');
  await tick();
  stop.abort();
  assert.equal(await first, false);
  assert.deepEqual(gate.waiting(), ['b'], 'the other helper still waits');
  gate.release('a');
  assert.equal(await second, true);
  gate.release('b-helper-2');
  assert.deepEqual(gate.holding(), []);
});
