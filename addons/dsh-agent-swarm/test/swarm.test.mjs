import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, validateSwarms, costOf, STATE_PATH } from '../index.js';

const SECRET_TASK = 'TASK-TEXT-should-never-be-served';
const SECRET_ANSWER = 'ANSWER-TEXT-should-never-be-served';

const swarm = (over = {}) => ({
  description: 'two viewpoints',
  strategy: 'fanout',
  rounds: 2,
  maxActive: 1,
  maxMinutes: 5,
  budget: { tokens: 0, usd: 0 },
  members: [
    { id: 'a', provider: 'prov-a', model: 'model-a', instructions: 'be careful' },
    { id: 'b', provider: 'prov-b', model: 'model-b', instructions: '' },
  ],
  ...over,
});

/** A fake ctx: a sub-agent service whose children finish when the test releases them. */
function harness(config, { down = [] } = {}) {
  const routes = {};
  const fence = { rejection: undefined };
  const listeners = {};
  const tools = {};
  const children = [];
  const subagents = {
    async startActivation(spec) {
      let resolve;
      const result = new Promise((r) => { resolve = r; });
      const child = { childId: `child-${children.length + 1}`, route: spec.request.agentOptions, label: spec.label, resolve, spec };
      children.push(child);
      return { childId: child.childId, result };
    },
  };
  const ctx = {
    get: (key) => ({
      subagents,
      routeHealth: { state: (provider) => ({ state: down.includes(provider) ? 'down' : 'up' }) },
    })[key],
    on: (event, fn) => { (listeners[event] ??= []).push(fn); },
    effect: (fn) => fn(),
    tools: { register: (tool) => { tools[tool.name] = tool; } },
    inject: (_keys, fn) => fn({
      effect: (f) => f(),
      modelTiers: { registerSubagentTool: () => {} },
      webServer: { register: (spec) => { routes[spec.path] = spec.handler; } },
      connection: { requestRejection: () => fence.rejection },
    }),
  };
  apply(ctx, config);
  const get = (method = 'GET') => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
    routes[STATE_PATH]({ method, url: STATE_PATH }, res);
    return { status: res.statusCode, headers: res.headers, raw: res.body ?? '', json: res.body ? JSON.parse(res.body) : null };
  };
  const emit = (childId, input, output, provider = 'prov-a', model = 'model-a') => {
    for (const fn of listeners['session/event'] ?? []) {
      fn({ id: childId }, { type: 'assistant/message', data: { usage: { inputTokens: input, outputTokens: output }, message: { source: { provider, model } } } });
    }
  };
  const execute = (args, signal = new AbortController().signal) =>
    tools.run_swarm.execute(args, { agent: { id: 'parent', model: { current: () => ({ provider: 'p', model: 'm' }) } }, signal });
  const finish = (index, text = SECRET_ANSWER) => children[index].resolve({ output: [{ type: 'text', text }], stopReason: 'end' });
  const tick = () => new Promise((r) => setTimeout(r, 5));
  return { routes, fence, get, emit, execute, finish, children, tools, tick };
}

const cfg = (swarms, extra = {}) => ({ enabled: true, toolName: 'run_swarm', swarms, pricing: {}, defaultSwarmByMode: {}, onRouteDown: 'rebind', ...extra });

test('validation and cost helpers still hold', () => {
  assert.throws(() => validateSwarms({ swarms: { x: swarm({ members: [] }) } }), /at least 1/);
  assert.equal(costOf({ 'p/m': { inputPerMTok: 1, outputPerMTok: 2 } }, 'p/m', { input: 1e6, output: 1e6 }), 3);
});

test('inert with no swarm, but the state route answers with empty lists', () => {
  const h = harness(cfg({}));
  assert.equal(Object.keys(h.tools).length, 0);
  const { status, json } = h.get();
  assert.equal(status, 200);
  assert.deepEqual(json.swarms, []);
  assert.deepEqual(json.runs, []);
});

test('disabled plugin registers nothing', () => {
  const h = harness({ ...cfg({ s: swarm() }), enabled: false });
  assert.equal(h.routes[STATE_PATH], undefined);
});

test('the route is fenced, GET-only and not cached', () => {
  const h = harness(cfg({ s: swarm() }));
  h.fence.rejection = 401;
  assert.equal(h.get().status, 401);
  h.fence.rejection = 403;
  assert.equal(h.get().status, 403);
  h.fence.rejection = undefined;
  assert.equal(h.get('POST').status, 405);
  const ok = h.get();
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['cache-control'], 'no-store');
  assert.match(ok.headers['content-type'], /json/);
});

test('configured swarms are listed with members, routes and caps', () => {
  const h = harness(cfg({ duo: swarm({ budget: { tokens: 5000, usd: 0 }, members: [{ id: 'p', role: 'plan', instructions: 'plan it' }, { id: 'q', provider: 'x', model: 'y' }] }) }));
  const { json } = h.get();
  assert.equal(json.toolName, 'run_swarm');
  assert.equal(json.swarms.length, 1);
  const s = json.swarms[0];
  assert.equal(s.name, 'duo');
  assert.equal(s.budget.tokens, 5000);
  assert.deepEqual(s.members.map((m) => [m.id, m.role, m.route]), [['p', 'plan', null], ['q', null, 'x/y']]);
});

test('a live run shows member states, and finished runs keep numbers but no text', async () => {
  const h = harness(cfg({ duo: swarm() }));
  const run = h.execute({ swarm: 'duo', task: SECRET_TASK });
  await h.tick();
  let r = h.get().json.runs[0];
  assert.equal(r.status, 'running');
  assert.equal(r.swarm, 'duo');
  assert.deepEqual(r.members.map((m) => [m.id, m.state]), [['a', 'running'], ['b', 'waiting']], 'cap 1: the second member waits');
  assert.equal(r.members[0].route, 'prov-a/model-a');
  h.emit('child-1', 100, 20);
  h.finish(0);
  await h.tick();
  r = h.get().json.runs[0];
  assert.deepEqual(r.members.map((m) => m.state), ['done', 'running']);
  assert.equal(r.members[0].tokens, 120);
  h.emit('child-2', 50, 5, 'prov-b', 'model-b');
  h.finish(1);
  await run;
  r = h.get().json.runs[0];
  assert.equal(r.status, 'done');
  assert.ok(r.endedAt >= r.startedAt);
  assert.equal(r.tokens, 175);
  assert.equal(r.maxObservedActive, 1);
  const raw = h.get().raw;
  assert.ok(!raw.includes(SECRET_TASK), 'task text must not be served');
  assert.ok(!raw.includes(SECRET_ANSWER), 'answers must not be served');
});

test('a token budget stops the run: status stopped, unanswered members cancelled', async () => {
  const h = harness(cfg({ duo: swarm({ budget: { tokens: 30, usd: 0 } }) }));
  const run = h.execute({ swarm: 'duo', task: 'x task' });
  await h.tick();
  h.emit('child-1', 40, 5);
  h.finish(0);
  await run;
  const r = h.get().json.runs[0];
  assert.equal(r.status, 'stopped');
  assert.match(r.stopped, /token budget/);
  assert.deepEqual(r.members.map((m) => m.state), ['done', 'cancelled']);
});

test('dollar spend uses the pricing map', async () => {
  const h = harness(cfg({ duo: swarm({ members: [{ id: 'a', provider: 'prov-a', model: 'model-a' }] }) }, { pricing: { 'prov-a/model-a': { inputPerMTok: 2, outputPerMTok: 10 } } }));
  const run = h.execute({ swarm: 'duo', task: 'x task' });
  await h.tick();
  h.emit('child-1', 1e6, 1e6);
  h.finish(0);
  await run;
  const state = h.get().json;
  assert.equal(state.pricing, true);
  assert.equal(state.runs[0].usd, 12);
  assert.equal(state.runs[0].members[0].usd, 12);
});

test('a failing member is marked failed with a short error', async () => {
  const h = harness(cfg({ duo: swarm({ maxActive: 2 }) }));
  const run = h.execute({ swarm: 'duo', task: 'x task' });
  await h.tick();
  h.children[0].resolve(Promise.reject(new Error('x'.repeat(400))));
  await h.tick();
  h.finish(1);
  await run;
  const r = h.get().json.runs[0];
  assert.deepEqual(r.members.map((m) => m.state), ['failed', 'done']);
  assert.equal(r.members[0].error.length, 160);
  assert.equal(r.status, 'done');
});

test('a down route is skipped (policy skip) and listed as skipped', async () => {
  const h = harness(cfg({ duo: swarm() }, { onRouteDown: 'skip' }), { down: ['prov-b'] });
  const run = h.execute({ swarm: 'duo', task: 'x task' });
  await h.tick();
  h.finish(0);
  await run;
  const r = h.get().json.runs[0];
  assert.deepEqual(r.members.map((m) => [m.id, m.state]), [['a', 'done'], ['b', 'skipped']]);
  assert.match(r.members[1].note, /down/);
});

test('debate tracks the round', async () => {
  const h = harness(cfg({ talk: swarm({ strategy: 'debate', rounds: 2, maxActive: 2 }) }));
  const run = h.execute({ swarm: 'talk', task: 'x task' });
  await h.tick();
  let r = h.get().json.runs[0];
  assert.equal(r.rounds, 2);
  assert.equal(r.round, 1);
  h.finish(0); h.finish(1);
  await h.tick();
  r = h.get().json.runs[0];
  assert.equal(r.round, 2);
  assert.deepEqual(r.members.map((m) => [m.state, m.round]), [['running', 2], ['running', 2]]);
  h.finish(2); h.finish(3);
  await run;
  assert.equal(h.get().json.runs[0].status, 'done');
});

test('history keeps at most 20 runs, newest first', async () => {
  const h = harness(cfg({ one: swarm({ members: [{ id: 'a', provider: 'prov-a', model: 'model-a' }] }) }));
  for (let i = 0; i < 23; i += 1) {
    const run = h.execute({ swarm: 'one', task: 'x task' });
    await h.tick();
    h.finish(i);
    await run;
  }
  const { runs } = h.get().json;
  assert.equal(runs.length, 20);
  assert.ok(runs[0].startedAt >= runs[19].startedAt);
});
