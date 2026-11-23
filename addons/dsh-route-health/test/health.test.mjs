// Route health: probing and the up / slow / down states, the refusal of a step on a down route (and the switch
// that turns it off), moving a conversation to its fallback and back, and the /routes command.
// Probes go to a tiny local server on 127.0.0.1 whose answer the test controls; nothing leaves the machine.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Config, apply } from '../index.js';

/** A probe target whose status and delay the test sets. */
async function probeServer() {
  const control = { status: 200, delayMs: 0, hits: 0 };
  const server = http.createServer((req, res) => {
    control.hits += 1;
    setTimeout(() => { res.statusCode = control.status; res.end('x'); }, control.delayMs);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  control.url = `http://127.0.0.1:${server.address().port}/models`;
  control.close = () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); });
  return control;
}

const routeSettings = (url, extra = {}) => ({ probeUrl: url, label: 'Cloud', timeoutMs: 500, slowMs: 1000, failureThreshold: 2, reprobeSeconds: 20, intervalSeconds: 30, ...extra });

/** The app as far as Route health looks at it. Call `stop()` at the end: it clears the plugin's timers. */
function fakeApp({ routes, options = {}, agents = [], tiers } = {}) {
  const handlers = {};
  const provided = {};
  const disposers = [];
  const logs = { warn: [], info: [] };
  const commands = {};
  const routesRegistered = [];
  const config = { routes, preemptiveFallback: true, autoReturn: true, onlyWhenTierUsesRoute: true, blockWhenDown: true, commandName: 'routes', ...options };
  const ctx = {
    get: (name) => ({ agents: { list: () => agents }, ...(tiers ? { modelTiers: tiers } : {}) })[name],
    on: (event, handler) => { handlers[event] = handler; },
    logger: { warn: (m) => logs.warn.push(m), info: (m) => logs.info.push(m) },
    effect: (fn) => { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); },
    provide: (key, value) => { provided[key] = value; },
    inject: (_names, callback) => callback({
      effect: (fn) => fn(),
      commands: { register: (command) => { commands[command.name] = command; } },
      webServer: { register: (route) => routesRegistered.push(route) },
      connection: { requestRejection: (req) => req.rejected },
    }),
  };
  apply(ctx, config);
  return { handlers, health: provided.routeHealth, logs, commands, routesRegistered, stop: () => disposers.forEach((d) => d()) };
}

const step = (app, provider, agent = { id: 'a1' }) => app.handlers['agent/pre-step']({ agent, modelSelection: { provider, model: 'm' } }, async () => 'loop');

test('the settings keep their keys and defaults', () => {
  const config = Config({});
  assert.deepEqual({ ...config.routes }, {});
  assert.equal(config.preemptiveFallback, true);
  assert.equal(config.autoReturn, true);
  assert.equal(config.onlyWhenTierUsesRoute, true);
  assert.equal(config.blockWhenDown, true);
  assert.equal(config.commandName, 'routes');
  const route = Config({ routes: { r: { probeUrl: 'http://x' } } }).routes.r;
  assert.deepEqual([route.timeoutMs, route.slowMs, route.failureThreshold, route.reprobeSeconds, route.intervalSeconds], [2500, 1000, 2, 20, 30]);
});

test('nothing configured: no routes, and a step on any route passes', async () => {
  const app = fakeApp({ routes: {} });
  assert.deepEqual(app.health.list(), []);
  assert.equal(app.health.state('whatever'), null);
  assert.equal(await step(app, 'whatever'), 'loop');
  assert.equal((await app.commands.routes.handler()).text, 'No models are set up for health checks yet.');
  app.stop();
});

test('probing: up, reachable on a 4xx, slow, and down only after the set number of failures in a row', async (t) => {
  const server = await probeServer();
  t.after(() => server.close());
  const app = fakeApp({ routes: { cloud: routeSettings(server.url, { slowMs: 400, timeoutMs: 3000 }) } });
  t.after(app.stop);
  assert.equal(app.health.state('cloud').state, 'unknown');
  assert.equal((await app.health.probeNow('cloud')).state, 'up');
  server.status = 404; // any answer below 500 means the server is there
  assert.equal((await app.health.probeNow('cloud')).state, 'up');
  server.status = 200; server.delayMs = 450;
  assert.equal((await app.health.probeNow('cloud')).state, 'slow');
  server.delayMs = 0; server.status = 503;
  const first = await app.health.probeNow('cloud');
  assert.equal(first.state, 'slow', 'one failure is not enough to call it down');
  assert.equal(first.failures, 1);
  const second = await app.health.probeNow('cloud');
  assert.equal(second.state, 'down');
  assert.equal(second.error, 'HTTP 503');
  server.status = 200;
  const back = await app.health.probeNow('cloud');
  assert.equal(back.state, 'up');
  assert.equal(back.failures, 0);
  assert.equal(back.error, null);
  assert.equal(await app.health.probeNow('nope'), null);
});

test('a server that is not there counts as a failure with a readable code, and a timeout says so', async (t) => {
  const server = await probeServer();
  const dead = server.url;
  await server.close();
  const app = fakeApp({ routes: { gone: routeSettings(dead, { failureThreshold: 1 }) } });
  t.after(app.stop);
  const gone = await app.health.probeNow('gone');
  assert.equal(gone.state, 'down');
  assert.match(gone.error, /ECONNREFUSED/);
  const slow = await probeServer();
  t.after(() => slow.close());
  slow.delayMs = 400;
  const app2 = fakeApp({ routes: { late: routeSettings(slow.url, { failureThreshold: 1, timeoutMs: 100 }) } });
  t.after(app2.stop);
  assert.match((await app2.health.probeNow('late')).error, /no answer within 100 ms/);
});

test('a step on a route whose check failed is refused with a plain message; the same step passes once the server answers again', async (t) => {
  const server = await probeServer();
  t.after(() => server.close());
  const app = fakeApp({ routes: { cloud: routeSettings(server.url, { failureThreshold: 1 }) } });
  t.after(app.stop);
  server.status = 503;
  await app.health.probeNow('cloud');
  await assert.rejects(step(app, 'cloud'), (error) => {
    assert.match(error.message, /Cannot reach Cloud\. The server had a problem on its side\./);
    assert.match(error.message, /No other model is set up to take over/);
    assert.match(error.message, /Details: HTTP 503/);
    return true;
  });
  server.status = 200; // the server is fine again, and the last check is still fresh: the refusal stands until the next check
  await assert.rejects(step(app, 'cloud'), /Cannot reach/);
  // Once the last check is older than the re-check time, the step makes a new check first and then goes through.
  mock.timers.enable({ apis: ['Date'], now: Date.now() });
  try {
    mock.timers.setTime(Date.now() + 25_000);
    assert.equal(await step(app, 'cloud'), 'loop');
  } finally {
    mock.timers.reset();
  }
  assert.equal(app.health.state('cloud').state, 'up');
});

test('the refusal can be switched off, and a route that is not set up, or is up, is never refused', async (t) => {
  const server = await probeServer();
  t.after(() => server.close());
  server.status = 503;
  const off = fakeApp({ routes: { cloud: routeSettings(server.url, { failureThreshold: 1 }) }, options: { blockWhenDown: false } });
  t.after(off.stop);
  await off.health.probeNow('cloud');
  assert.equal(off.health.state('cloud').state, 'down');
  assert.equal(await step(off, 'cloud'), 'loop', 'blockWhenDown off: the model is asked anyway');
  const on = fakeApp({ routes: { cloud: routeSettings(server.url, { failureThreshold: 1 }) } });
  t.after(on.stop);
  await on.health.probeNow('cloud');
  assert.equal(await step(on, 'other-route'), 'loop');
  server.status = 200;
  const up = fakeApp({ routes: { cloud: routeSettings(server.url) } });
  t.after(up.stop);
  assert.equal(await step(up, 'cloud'), 'loop'); // an unknown state is checked first and found up
  assert.equal(server.hits >= 1, true);
});

test('with a fallback the refusal names the new model and the conversation is moved', async (t) => {
  const server = await probeServer();
  t.after(() => server.close());
  server.status = 503;
  const moves = [];
  const tiers = {
    advanceFallback: async (id, { skip }) => { moves.push({ id, skipsCloud: skip({ provider: 'cloud' }), skipsOther: skip({ provider: 'other' }) }); return { tierId: 't', from: { provider: 'cloud', model: 'm' }, to: { provider: 'local', model: 'small' } }; },
    resolveTier: () => null,
  };
  const app = fakeApp({ routes: { cloud: routeSettings(server.url, { failureThreshold: 1 }) }, tiers });
  t.after(app.stop);
  await app.health.probeNow('cloud');
  await assert.rejects(step(app, 'cloud'), /Your thread now uses local\/small; send your message again/);
  assert.deepEqual(moves, [{ id: 'a1', skipsCloud: true, skipsOther: false }]);
});

test('a route going down moves an idle conversation at once and a busy one when it becomes idle; coming back restores, unless the person chose another model', async (t) => {
  const server = await probeServer();
  t.after(() => server.close());
  const idle = { id: 'idle', status: 'idle', model: { current: () => ({ provider: 'cloud', model: 'm' }) } };
  const busy = { id: 'busy', status: 'running', model: { current: () => ({ provider: 'cloud', model: 'm' }) } };
  const chosen = { id: 'chosen', status: 'idle', model: { current: () => ({ provider: 'cloud', model: 'm' }) } };
  const advanced = []; const restored = [];
  const tiers = {
    advanceFallback: async (id) => { advanced.push(id); return { tierId: 't', from: { provider: 'cloud', model: 'm' }, to: { provider: 'local', model: 'small' } }; },
    restorePrimary: async (id) => { restored.push(id); return { from: { provider: 'local', model: 'small' }, to: { provider: 'cloud', model: 'm' } }; },
    resolveTier: () => null,
    fallbackChain: () => [],
  };
  const app = fakeApp({ routes: { cloud: routeSettings(server.url, { failureThreshold: 1 }) }, agents: [idle, busy, chosen], tiers });
  t.after(app.stop);
  const settled = () => new Promise((resolve) => setImmediate(resolve));
  server.status = 503;
  await app.health.probeNow('cloud');
  await settled();
  assert.deepEqual(advanced.sort(), ['chosen', 'idle']);
  app.handlers['agent/status']({ agent: busy, status: 'running' });
  assert.ok(!advanced.includes('busy'), 'not while the turn is running');
  app.handlers['agent/status']({ agent: busy, status: 'idle' });
  await settled();
  assert.ok(advanced.includes('busy'));
  // The person picks another model for one conversation; the other two are on the fallback.
  chosen.model.current = () => ({ provider: 'mine', model: 'own' });
  idle.model.current = () => ({ provider: 'local', model: 'small' });
  busy.model.current = () => ({ provider: 'local', model: 'small' });
  server.status = 200;
  await app.health.probeNow('cloud');
  await settled();
  assert.deepEqual(restored, ['idle'], 'the busy one waits for its turn to end; the one the person moved is left alone');
  app.handlers['agent/status']({ agent: busy, status: 'idle' });
  await settled();
  assert.deepEqual(restored.sort(), ['busy', 'idle']);
});

test('the service and /routes: events, a listener that throws, and the table the command prints', async (t) => {
  const server = await probeServer();
  t.after(() => server.close());
  const app = fakeApp({ routes: { cloud: routeSettings(server.url, { failureThreshold: 1 }) } });
  t.after(app.stop);
  const seen = [];
  app.health.on('route/health-changed', (route, before, now) => seen.push([route, before, now]));
  app.health.on('route/health-changed', () => { throw new Error('boom'); });
  assert.throws(() => app.health.on('nope', () => {}), /unknown event/);
  await app.health.probeNow('cloud');
  assert.deepEqual(seen, [['cloud', 'unknown', 'up']]);
  assert.ok(app.logs.warn.some((line) => /listener failed: boom/.test(line)));
  assert.match((await app.commands.routes.handler()).text, /^Cloud: up, \d+ ms \(\d+ s ago\)$/);
  server.status = 500;
  await app.health.probeNow('cloud');
  assert.match((await app.commands.routes.handler()).text, /^Cloud: down, HTTP 500/);
});

test('the state page: refused when the connection check says so, GET only, and it never shows the probe address', async (t) => {
  const server = await probeServer();
  t.after(() => server.close());
  const app = fakeApp({ routes: { cloud: routeSettings(server.url) } });
  t.after(app.stop);
  const page = app.routesRegistered.find((route) => route.path === '/dsh-route-health/state');
  const call = async (req) => { const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } }; await page.handler(req, res); return res; };
  assert.equal((await call({ rejected: 403, method: 'GET', url: '/' })).statusCode, 403);
  const post = await call({ method: 'POST', url: '/' });
  assert.equal(post.statusCode, 405);
  const ok = await call({ method: 'GET', url: '/dsh-route-health/state?probe=1' });
  assert.equal(ok.statusCode, 200);
  const body = JSON.parse(ok.body);
  assert.equal(body.routes[0].state, 'up');
  assert.ok(!ok.body.includes('127.0.0.1'), 'the probe address stays on the host');
});
