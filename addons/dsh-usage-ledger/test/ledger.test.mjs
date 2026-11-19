// Usage ledger: counting, days and retention, free-model labels, aliases, damaged files, the summary page,
// and the /usage command, including that "/usage reset" asks before it erases anything.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Config, apply } from '../index.js';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** A request event for `provider/model` with some usage. */
const request = (provider, model, usage = {}, time) => ({ type: 'assistant/message', ...(time ? { time } : {}), data: { message: { source: { provider, model } }, usage } });

function fakeApp(dir, options = {}) {
  const handlers = {};
  const provided = {};
  const disposers = [];
  const commands = {};
  const pages = [];
  const warnings = [];
  const config = { enabled: true, retentionDays: 365, freeModels: [], modelAliases: {}, dataDir: dir, commandName: 'usage', ...options };
  const ctx = {
    get: () => undefined,
    on: (event, handler) => { handlers[event] = handler; },
    logger: { warn: (m) => warnings.push(m), info: () => {} },
    effect: (fn) => { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); },
    provide: (key, value) => { provided[key] = value; },
    inject: (_names, callback) => callback({
      effect: (fn) => fn(),
      commands: { register: (command) => { commands[command.name] = command; } },
      webServer: { register: (route) => pages.push(route) },
      connection: { requestRejection: (req) => req.rejected },
    }),
  };
  apply(ctx, config);
  return {
    ledger: provided.usageLedger,
    commands,
    pages,
    warnings,
    emit: (event) => handlers['session/event']({}, event),
    /** Stop: writes what is waiting, like the app closing. */
    stop: () => disposers.forEach((d) => d()),
    file: join(dir, 'usage-ledger.json'),
  };
}
const tmp = () => mkdtempSync(join(tmpdir(), 'usage-ledger-test-'));
const run = (app, rawInput) => app.commands.usage.handler({ rawInput });

test('the settings keep their keys and defaults', () => {
  const config = Config({ dataDir: '/x' });
  assert.deepEqual([config.enabled, config.retentionDays, [...config.freeModels], { ...config.modelAliases }, config.commandName], [true, 365, [], {}, 'usage']);
});

test('off: nothing is registered, and a relative data folder is refused', () => {
  const dir = tmp();
  assert.deepEqual(Object.keys(fakeApp(dir, { enabled: false }).commands), []);
  assert.throws(() => fakeApp('relative/folder'), /dataDir/);
  rmSync(dir, { recursive: true });
});

test('every assistant message counts one request with its token numbers; other events and unnamed models do not count', () => {
  const dir = tmp();
  const app = fakeApp(dir);
  app.emit(request('cloud', 'big', { inputTokens: 100, outputTokens: 20, cacheReadTokens: 5, cacheWriteTokens: 1, reasoningTokens: 7 }));
  app.emit(request('cloud', 'big', { inputTokens: 50, outputTokens: 10 }));
  app.emit(request('cloud', 'big')); // no usage reported: still a request
  app.emit({ type: 'user/message', data: {} });
  app.emit({ type: 'assistant/message', data: { message: { source: {} } } });
  const row = app.ledger.summary().models.find((m) => m.model === 'cloud/big');
  assert.deepEqual({ ...row }, { model: 'cloud/big', free: false, requests: 3, input: 150, output: 30, cacheRead: 5, cacheWrite: 1, reasoning: 7 });
  assert.equal(app.ledger.summary().models.length, 1);
  assert.equal(app.ledger.summary().days[0].date, today());
  assert.equal(app.ledger.summary().totals.requests, 3);
  app.stop(); rmSync(dir, { recursive: true });
});

test('history that is replayed on start is not counted, a fresh event is; the file holds numbers only', () => {
  const dir = tmp();
  const app = fakeApp(dir);
  app.emit(request('cloud', 'big', { inputTokens: 1 }, new Date(Date.now() - 3600_000).toISOString()));
  assert.equal(app.ledger.summary().totals.requests, 0);
  app.emit(request('cloud', 'big', { inputTokens: 1 }, new Date().toISOString()));
  assert.equal(app.ledger.summary().totals.requests, 1);
  app.stop();
  const saved = readFileSync(app.file, 'utf8');
  assert.deepEqual(Object.keys(JSON.parse(saved)), ['version', 'days']);
  assert.ok(!/prompt|session|text/i.test(saved));
  rmSync(dir, { recursive: true });
});

test('what was counted is written on stop and read again by the next start', () => {
  const dir = tmp();
  const first = fakeApp(dir);
  first.emit(request('cloud', 'big', { inputTokens: 10 }));
  first.stop();
  const second = fakeApp(dir);
  assert.equal(second.ledger.summary().totals.input, 10);
  assert.deepEqual(readdirSync(dir), ['usage-ledger.json'], 'no temporary file is left');
  rmSync(dir, { recursive: true });
});

test('aliases rename a model; free-model patterns label rows when read, so changing the list re-labels history', () => {
  const dir = tmp();
  const app = fakeApp(dir, { modelAliases: { 'long-model-id-2026': 'short' }, freeModels: ['local/*', 'cloud/exact'] });
  app.emit(request('cloud', 'long-model-id-2026'));
  app.emit(request('local', 'anything'));
  app.emit(request('cloud', 'exact'));
  app.emit(request('cloud', 'exactly-not'));
  const free = Object.fromEntries(app.ledger.summary().models.map((m) => [m.model, m.free]));
  assert.deepEqual(free, { 'cloud/short': false, 'local/anything': true, 'cloud/exact': true, 'cloud/exactly-not': false });
  app.stop();
  const relabelled = fakeApp(dir, { freeModels: ['cloud/short'] });
  assert.equal(relabelled.ledger.summary().models.find((m) => m.model === 'cloud/short').free, true);
  assert.equal(relabelled.ledger.summary().models.find((m) => m.model === 'local/anything').free, false);
  rmSync(dir, { recursive: true });
});

test('days older than the retention window are dropped on start; the summary period picks days', () => {
  const dir = tmp();
  const row = { requests: 1, input: 1, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 };
  writeFileSync(join(dir, 'usage-ledger.json'), JSON.stringify({ version: 1, days: { [daysAgo(400)]: { 'a/old': row }, [daysAgo(10)]: { 'a/mid': row }, [today()]: { 'a/new': row } } }));
  const app = fakeApp(dir);
  assert.deepEqual(app.ledger.summary({ days: 3650 }).models.map((m) => m.model).sort(), ['a/mid', 'a/new']);
  assert.deepEqual(app.ledger.summary({ days: 5 }).models.map((m) => m.model), ['a/new']);
  assert.equal(app.ledger.summary({ days: 11 }).totals.requests, 2);
  rmSync(dir, { recursive: true });
});

test('a damaged file is kept aside and never overwritten, and counting starts fresh', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'usage-ledger.json'), '{ this is not json');
  const app = fakeApp(dir);
  assert.equal(app.ledger.summary().totals.requests, 0);
  const aside = readdirSync(dir).find((name) => name.includes('.damaged-'));
  assert.ok(aside, 'the damaged file is still there under a new name');
  assert.equal(readFileSync(join(dir, aside), 'utf8'), '{ this is not json');
  assert.ok(app.warnings.some((line) => /kept it as/.test(line)));
  rmSync(dir, { recursive: true });
});

test('/usage shows the models and a total, accepts a number of days, and refuses other words', async () => {
  const dir = tmp();
  const app = fakeApp(dir, { freeModels: ['local/*'] });
  assert.match((await run(app, '')).text, /No requests recorded in the last 30 days/);
  app.emit(request('cloud', 'big', { inputTokens: 100, outputTokens: 20, cacheReadTokens: 3, cacheWriteTokens: 4 }));
  app.emit(request('local', 'small', { inputTokens: 1, outputTokens: 1 }));
  const text = (await run(app, '7')).text;
  assert.match(text, /cloud\/big: 1 requests, in 100, out 20, cache 3\/4/);
  assert.match(text, /local\/small \(free\): 1 requests/);
  assert.match(text, /Total, last 7 days: 2 requests, in 101, out 21/);
  for (const bad of ['0', '-3', '2.5', 'banana']) assert.equal((await run(app, bad)).kind, 'error', bad);
  app.stop(); rmSync(dir, { recursive: true });
});

test('/usage reset asks first and erases nothing; only "/usage reset confirm" clears the counts', async () => {
  const dir = tmp();
  const app = fakeApp(dir);
  app.emit(request('cloud', 'big', { inputTokens: 100 }));
  app.emit(request('cloud', 'big', { inputTokens: 100 }));
  const asked = await run(app, 'reset');
  assert.equal(asked.kind, 'error', 'nothing happened, so it is not a success');
  assert.match(asked.text, /Nothing was cleared/);
  assert.match(asked.text, /\/usage reset confirm/);
  assert.match(asked.text, /2 requests/, 'it says what would be lost');
  assert.equal(app.ledger.summary().totals.requests, 2);
  assert.equal((await run(app, 'reset now')).kind, 'error', 'only the exact word confirms');
  assert.equal(app.ledger.summary().totals.requests, 2);
  const done = await run(app, 'reset confirm');
  assert.equal(done.kind, 'success');
  assert.match(done.text, /cleared/i);
  assert.equal(app.ledger.summary().totals.requests, 0);
  assert.deepEqual(JSON.parse(readFileSync(app.file, 'utf8')).days, {});
  app.stop(); rmSync(dir, { recursive: true });
});

test('the summary page: refused by the connection check, GET only, a period of 1 to 365 days (30 otherwise), numbers only', () => {
  const dir = tmp();
  const app = fakeApp(dir);
  app.emit(request('cloud', 'big', { inputTokens: 5 }));
  const page = app.pages.find((p) => p.path === '/dsh-usage-ledger/summary');
  const call = (req) => { const res = { setHeader() {}, end(body) { this.body = body; } }; page.handler(req, res); return res; };
  assert.equal(call({ rejected: 401, method: 'GET', url: '/' }).statusCode, 401);
  assert.equal(call({ method: 'POST', url: '/' }).statusCode, 405);
  assert.equal(JSON.parse(call({ method: 'GET', url: '/x?days=7' }).body).period, 7);
  for (const bad of ['0', '366', 'x', '2.5']) assert.equal(JSON.parse(call({ method: 'GET', url: `/x?days=${bad}` }).body).period, 30, bad);
  assert.equal(JSON.parse(call({ method: 'GET', url: '/x' }).body).totals.input, 5);
  app.stop(); rmSync(dir, { recursive: true });
});
