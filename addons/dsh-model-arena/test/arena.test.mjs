import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { apply, shuffle, redact, genericFailure, parseAsk, readSettings, readJsonBody } from '../index.js';

const CANDS = [
  { id: 'alpha', provider: 'prov-one', model: 'model-aaa' },
  { id: 'beta', provider: 'prov-two', model: 'model-bbb' },
  { id: 'gamma', provider: 'prov-three', model: 'model-ccc' },
];

/** Build a fake ctx; `llm` answers by model, `services` extends ctx.get. */
function harness(config, { llm, services = {} } = {}) {
  const commands = {};
  const routes = {};
  const fence = { rejection: undefined };
  const provided = {};
  const defaultLlm = {
    async *stream({ model }) {
      yield { type: 'text-delta', text: `answer from ${model} that mentions model-aaa` };
      yield { type: 'usage', usage: { inputTokens: 3, outputTokens: 4 } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
  const ctx = {
    get: (key) => ({ llm: llm ?? defaultLlm, ...services, ...provided })[key],
    effect: (fn) => fn(),
    provide: (key, value) => { provided[key] = value; },
    inject: (_keys, fn) => fn({
      effect: (f) => f(),
      commands: { register: (spec) => { commands[spec.name] = spec; } },
      webServer: { register: (spec) => { routes[spec.path] = spec.handler; } },
      connection: { requestRejection: () => fence.rejection },
    }),
  };
  apply(ctx, config);
  const run = async (text) => (await commands.arena.handler({ rawInput: text }));
  /** Call a registered route with a fake request; returns status and parsed body. */
  const get = (path, { method = 'GET' } = {}) => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
    routes[path]({ method, url: path }, res);
    return { status: res.statusCode, headers: res.headers, raw: res.body ?? '', json: res.body ? JSON.parse(res.body) : null };
  };
  /** POST a JSON body (or raw text) to the write route; returns status and parsed body. */
  const post = async (body, { method = 'POST', raw } = {}) => {
    const req = Readable.from([Buffer.from(raw ?? JSON.stringify(body))]);
    req.method = method;
    req.url = '/dsh-model-arena/action';
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(text) { this.body = text; } };
    await routes['/dsh-model-arena/action'](req, res);
    return { status: res.statusCode, headers: res.headers, raw: res.body ?? '', json: res.body ? JSON.parse(res.body) : null };
  };
  return { ctx, provided, commands, run, routes, fence, get, post };
}

const base = () => ({ dataDir: mkdtempSync(join(tmpdir(), 'arena-')), candidates: CANDS });

test('shuffle returns a permutation and is driven by the picker', () => {
  const items = [1, 2, 3, 4];
  assert.deepEqual([...shuffle(items)].sort(), items);
  assert.deepEqual(shuffle(items, () => 0), [2, 3, 4, 1]);
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) seen.add(shuffle(items).join(''));
  assert.ok(seen.size > 10);
});

test('redact hides ids and model names, whole words only', () => {
  const text = 'I am Model-AAA, aka alpha. alphabet stays; so does x.';
  const out = redact(text, [{ id: 'alpha', model: 'model-aaa' }]);
  assert.equal(out, 'I am [model], aka [model]. alphabet stays; so does x.');
});

test('genericFailure never echoes the message', () => {
  assert.equal(genericFailure(new Error('timed out')), 'timed out');
  assert.equal(genericFailure(new Error('route is down')), 'route unavailable');
  assert.equal(genericFailure(new Error('401 from api.secret-vendor.com for model-x')), 'request failed');
});

test('parseAsk reads flags then the prompt', () => {
  assert.deepEqual(parseAsk('--with a,b --open why is the sky blue'), { prompt: 'why is the sky blue', open: true, with: ['a', 'b'] });
  assert.deepEqual(parseAsk('plain prompt --open stays'), { prompt: 'plain prompt --open stays', open: undefined, with: [] });
  assert.equal(parseAsk('--blind hi').open, false);
});

test('config checks', () => {
  // One contestant is a setup in progress (the Settings page saves as you pick), not a broken file.
  assert.ok(harness({ dataDir: '/tmp/x', candidates: [CANDS[0]] }).provided.modelArena);
  assert.throws(() => harness({ dataDir: '/tmp/x', candidates: [CANDS[0], CANDS[0]] }), /duplicate/);
  assert.throws(() => harness({ dataDir: 'relative', candidates: CANDS }), /absolute/);
  const off = harness({});
  assert.ok(off.provided.modelArena);
});

test('inert with no candidates', async () => {
  const h = harness({});
  assert.match((await h.run('list')).text, /no candidates/);
  assert.equal((await h.run('ask hi')).kind, 'error');
});

test('ask is blind: no ids, models or providers before reveal', async () => {
  const h = harness(base());
  const out = (await h.run('ask what is two plus two')).text;
  for (const secret of ['alpha', 'beta', 'gamma', 'model-aaa', 'model-bbb', 'model-ccc', 'prov-one', 'prov-two', 'prov-three']) {
    assert.ok(!out.includes(secret), `leaked ${secret}`);
  }
  assert.match(out, /=== Answer A ===/);
  assert.match(out, /=== Answer C ===/);
  assert.match(out, /\[model\]/, 'the answer that named a model was redacted');
});

test('labels map to candidates through reveal, and the mapping varies', async () => {
  const orders = new Set();
  for (let i = 0; i < 12; i += 1) {
    const h = harness(base());
    await h.run('ask q');
    const text = h.provided.modelArena.reveal();
    assert.match(text, /Answer A: \w+ \(/);
    orders.add(text.split('\n').filter((l) => l.startsWith('Answer ')).map((l) => l.split(' ')[2]).join(','));
  }
  assert.ok(orders.size > 1, 'label order is shuffled');
});

test('one failing contestant does not stop the others and shows no name', async () => {
  const llm = {
    async *stream({ model }) {
      if (model === 'model-bbb') throw new Error('401 from vendor for model-bbb');
      yield { type: 'text-delta', text: `fine ${model}` };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
  const h = harness(base(), { llm });
  const out = (await h.run('ask q')).text;
  assert.match(out, /\(no answer: request failed\)/);
  assert.equal((out.match(/=== Answer/g) ?? []).length, 3);
  assert.ok(!out.includes('model-bbb') && !out.includes('vendor'));
  assert.equal((out.match(/fine/g) ?? []).length, 2);
});

test('timeouts are enforced per contestant', async () => {
  const llm = {
    async *stream({ signal }) {
      await new Promise((resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); });
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
  const h = harness({ ...base(), limits: { timeoutMs: 1000 } }, { llm });
  const out = (await h.run('ask q')).text;
  assert.equal((out.match(/no answer: timed out/g) ?? []).length, 3);
});

test('contestants run in parallel', async () => {
  let active = 0;
  let peak = 0;
  const llm = {
    async *stream() {
      active += 1; peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 40));
      active -= 1;
      yield { type: 'text-delta', text: 'ok' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
  await harness(base(), { llm }).run('ask q');
  assert.equal(peak, 3);
});

test('maxContestants samples the pool; --with picks exactly', async () => {
  const four = [...CANDS, { id: 'delta', provider: 'prov-four', model: 'model-ddd' }];
  const h = harness({ ...base(), candidates: four, maxContestants: 2 });
  assert.equal(((await h.run('ask q')).text.match(/=== Answer/g) ?? []).length, 2);
  assert.equal((await h.run('ask --with alpha,beta,gamma q')).kind, 'error');
  const chosen = await h.run('ask --with alpha,delta q');
  assert.equal((chosen.text.match(/=== Answer/g) ?? []).length, 2);
  assert.match(h.provided.modelArena.reveal(), /alpha[\s\S]*delta|delta[\s\S]*alpha/);
  assert.equal((await h.run('ask --with alpha q')).kind, 'error');
});

test('routes reported down are skipped, not asked', async () => {
  const asked = [];
  const llm = { async *stream({ provider }) { asked.push(provider); yield { type: 'text-delta', text: 'ok' }; yield { type: 'finish', reason: { kind: 'stop' } }; } };
  const h = harness(base(), { llm, services: { routeHealth: { state: (provider) => ({ state: provider === 'prov-two' ? 'down' : 'up' }) } } });
  const out = (await h.run('ask q')).text;
  assert.ok(!asked.includes('prov-two'));
  assert.match(out, /no answer: route unavailable/);
});

test('judge: needs config and the shared judge service; labels only; same-family note', async () => {
  const h0 = harness(base());
  await h0.run('ask q');
  assert.match((await h0.run('judge')).text, /judge\.provider/);

  const calls = [];
  const judgeService = {
    compare: async (spec) => {
      calls.push(spec);
      assert.equal(typeof spec.ask, 'function');
      assert.equal(spec.texts.length, 3);
      return { winner: 1, consistent: true, average: [3, 5, 2], verdicts: [{}, {}] };
    },
  };
  const h1 = harness({ ...base(), judge: { provider: 'prov-judge', model: 'model-judge' } }, { services: { candidateJudge: judgeService } });
  await h1.run('ask q');
  const text = (await h1.run('judge')).text;
  assert.match(text, /Answer [ABC] wins, in both rounds/);
  assert.ok(!/prov-judge|alpha|beta|gamma/.test(text));
  assert.ok(!/favour/.test(text), 'no family note for an unrelated judge');
  assert.equal(calls[0].criteria.length, 4);

  const h2 = harness({ ...base(), judge: { provider: 'prov-one', model: 'model-judge' } }, { services: { candidateJudge: judgeService } });
  await h2.run('ask q');
  assert.match((await h2.run('judge')).text, /shares a provider or model with at least one contestant/);
});

test('judge asks through the llm with the judge route', async () => {
  const seen = [];
  const llm = { async *stream({ provider, model, temperature }) { seen.push([provider, model, temperature]); yield { type: 'text-delta', text: 'verdict' }; yield { type: 'finish', reason: { kind: 'stop' } }; } };
  const judgeService = { compare: async (spec) => { await spec.ask('PROMPT', undefined); return { winner: 'tie', consistent: false, average: [1, 1, 1], verdicts: [{}, {}] }; } };
  const h = harness({ ...base(), judge: { provider: 'prov-judge', model: 'model-judge' } }, { llm, services: { candidateJudge: judgeService } });
  await h.run('ask q');
  seen.length = 0;
  const out = (await h.run('judge')).text;
  assert.deepEqual(seen, [['prov-judge', 'model-judge', 0]]);
  assert.match(out, /tie \(the two rounds disagreed/);
});

test('fewer than two answers cannot be judged', async () => {
  const llm = { async *stream({ model }) { if (model !== 'model-aaa') throw new Error('x'); yield { type: 'text-delta', text: 'ok' }; yield { type: 'finish', reason: { kind: 'stop' } }; } };
  const h = harness({ ...base(), judge: { provider: 'j', model: 'j' } }, { llm, services: { candidateJudge: { compare: async () => ({}) } } });
  await h.run('ask q');
  assert.match((await h.run('judge')).text, /fewer than two/);
});

test('pick validates labels; reveal shows agreement', async () => {
  const judgeService = { compare: async () => ({ winner: 0, consistent: true, average: [5, 2, 2], verdicts: [{}] }) };
  const h = harness({ ...base(), judge: { provider: 'j', model: 'j' } }, { services: { candidateJudge: judgeService } });
  await h.run('ask q');
  assert.equal((await h.run('pick Z')).kind, 'error');
  await h.run('judge');
  await h.run('pick a');
  const text = (await h.run('reveal')).text;
  assert.match(text, /You and the judge agree/);
});

test('blindByDefault false (or --open) shows names at once; --blind overrides', async () => {
  const open = harness({ ...base(), blindByDefault: false });
  assert.match((await open.run('ask q')).text, /\(revealed\)/);
  const blind = harness(base());
  assert.match((await blind.run('ask --open q')).text, /\(revealed\)/);
  const forced = harness({ ...base(), blindByDefault: false });
  assert.ok(!/\(revealed\)/.test((await forced.run('ask --blind q')).text));
});

test('rounds persist, reload, list and delete; old rounds are pruned', async () => {
  const config = base();
  const h = harness(config);
  await h.run('ask first');
  const id = h.provided.modelArena.list()[0].id;
  assert.ok(existsSync(join(config.dataDir, `arena-${id}.json`)));
  const mode = (await import('node:fs')).statSync(join(config.dataDir, `arena-${id}.json`)).mode & 0o777;
  assert.equal(mode, 0o600);

  writeFileSync(join(config.dataDir, 'arena-20000101000000-old.json'), JSON.stringify({ id: '20000101000000-old', createdAt: Date.UTC(2000, 0, 1), prompt: 'old', slots: [] }));
  const h2 = harness(config);
  const rows = h2.provided.modelArena.list();
  assert.deepEqual(rows.map((row) => row.id), [id], 'old round pruned, recent one reloaded');
  assert.ok(!readdirSync(config.dataDir).some((file) => file.includes('old')));
  assert.match((await h2.run('show')).text, /=== Answer A ===/);
  assert.equal((await h2.run(`delete ${id}`)).kind, 'success');
  assert.match((await h2.run('list')).text, /No rounds yet/);
  assert.equal((await h2.run('show')).kind, 'error');
});

test('stored files hold prompts and answers only: no keys or settings', async () => {
  const config = base();
  const h = harness(config);
  await h.run('ask q');
  const file = readdirSync(config.dataDir).find((f) => f.startsWith('arena-'));
  const raw = (await import('node:fs')).readFileSync(join(config.dataDir, file), 'utf8');
  assert.ok(!/key|token|secret|password/i.test(raw.replace(/"prompt":"[^"]*"/, '')));
});

test('unknown verbs print usage', async () => {
  const h = harness(base());
  assert.match((await h.run('frobnicate')).text, /Usage: \/arena/);
});

test('browser routes: fence, GET only, id check, no store', async () => {
  const h = harness(base());
  assert.ok(h.routes['/dsh-model-arena/rounds'] && h.routes['/dsh-model-arena/round']);
  h.fence.rejection = 401;
  assert.equal(h.get('/dsh-model-arena/rounds').status, 401);
  h.fence.rejection = 403;
  assert.equal(h.get('/dsh-model-arena/round').status, 403);
  h.fence.rejection = undefined;
  assert.equal(h.get('/dsh-model-arena/rounds', { method: 'POST' }).status, 405);
  const ok = h.get('/dsh-model-arena/rounds');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['cache-control'], 'no-store');
  assert.equal(ok.json.candidates, 3);
  // The round route is called without ?id here, so the id check refuses it.
  assert.equal(h.get('/dsh-model-arena/round').status, 400);
});

test('browser round view is blind until reveal: no names, providers, timings or tokens', async () => {
  const h = harness(base());
  await h.run('ask what is two plus two');
  const id = h.provided.modelArena.list()[0].id;
  const call = (path) => {
    // Route handlers read the query from req.url, so build it here.
    const res = { statusCode: 0, headers: {}, setHeader() {}, end(body) { this.body = body; } };
    h.routes['/dsh-model-arena/round']({ method: 'GET', url: `${path}?id=${id}` }, res);
    return { status: res.statusCode, raw: res.body, json: JSON.parse(res.body) };
  };
  const blind = call('/dsh-model-arena/round');
  assert.equal(blind.status, 200);
  assert.equal(blind.json.round.revealed, false);
  for (const secret of ['alpha', 'beta', 'gamma', 'prov-', 'model-aaa', 'model-bbb', 'model-ccc', 'latencyMs', 'inputTokens', 'candidateId', 'provider']) {
    assert.ok(!blind.raw.includes(secret), `blind view leaked ${secret}`);
  }
  assert.equal(blind.json.round.names, undefined);
  assert.equal(blind.json.round.slots.length, 3);
  assert.ok(blind.json.round.slots.some((slot) => slot.text.includes('[model]')), 'a self-naming answer is redacted');
  h.provided.modelArena.reveal(id);
  const open = call('/dsh-model-arena/round');
  assert.equal(open.json.round.revealed, true);
  assert.equal(open.json.round.names.length, 3);
  assert.ok(open.json.round.names.every((n) => n.candidateId && n.provider && n.model));
  // Unknown and malformed ids.
  const bad = { statusCode: 0, setHeader() {}, end() {} };
  h.routes['/dsh-model-arena/round']({ method: 'GET', url: '/dsh-model-arena/round?id=../../etc/passwd' }, bad);
  assert.equal(bad.statusCode, 400);
  const none = { statusCode: 0, setHeader() {}, end() {} };
  h.routes['/dsh-model-arena/round']({ method: 'GET', url: '/dsh-model-arena/round?id=20990101000000-abc' }, none);
  assert.equal(none.statusCode, 404);
});

test('a running round shows only how many answered, never which', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const llm = {
    async *stream({ model }) {
      if (model === 'model-ccc') await gate;
      yield { type: 'text-delta', text: `hello from ${model}` };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
  const h = harness(base(), { llm });
  const pending = h.run('ask slow one');
  await new Promise((resolve) => setTimeout(resolve, 30));
  const list = h.get('/dsh-model-arena/rounds').json;
  assert.equal(list.running.length, 1);
  assert.equal(list.running[0].total, 3);
  assert.equal(list.running[0].answered, 2);
  assert.deepEqual(Object.keys(list.running[0]).sort(), ['answered', 'createdAt', 'id', 'prompt', 'total']);
  const res = { statusCode: 0, setHeader() {}, end(body) { this.body = body; } };
  h.routes['/dsh-model-arena/round']({ method: 'GET', url: `/dsh-model-arena/round?id=${list.running[0].id}` }, res);
  const running = JSON.parse(res.body);
  assert.equal(running.running.answered, 2);
  assert.equal(running.round, undefined);
  release();
  await pending;
  assert.equal(h.get('/dsh-model-arena/rounds').json.running.length, 0);
});

test('settings are read live: the page can add contestants while the app runs', async () => {
  const config = { dataDir: mkdtempSync(join(tmpdir(), 'arena-')), candidates: [] };
  const h = harness(config);
  assert.equal((await h.run('ask hi')).kind, 'error');
  config.candidates = [CANDS[0]];
  assert.match((await h.run('ask hi')).text, /at least two/);
  config.candidates = [CANDS[0], CANDS[1]];
  assert.equal((await h.run('ask hi')).kind, 'success');
  assert.equal(h.get('/dsh-model-arena/rounds').json.candidates, 2);
  config.judge = { provider: 'p', model: 'm' };
  assert.equal(h.get('/dsh-model-arena/rounds').json.judge, true);
});

test('readSettings drops unusable entries and clamps numbers', () => {
  const s = readSettings({
    candidates: [CANDS[0], { id: 'alpha', provider: 'x', model: 'y' }, { id: '', provider: 'x', model: 'y' }, { id: 'nomodel', provider: 'x' }, { ...CANDS[1], reasoningEffort: ' high ' }],
    maxContestants: 9,
    limits: { timeoutMs: 5, maxTokens: -3 },
    criteria: ['  ', 'tone'],
    judge: { provider: 'p' },
  });
  assert.deepEqual(s.candidates.map((c) => c.id), ['alpha', 'beta']);
  assert.equal(s.candidates[1].reasoningEffort, 'high');
  assert.equal(s.maxContestants, 4);
  assert.equal(s.timeoutMs, 1000);
  assert.equal(s.maxTokens, 0);
  assert.deepEqual(s.criteria, ['tone']);
  assert.equal(s.judge, null);
  assert.equal(readSettings({}).criteria.length, 4);
});

test('readJsonBody refuses oversize, broken and non-object bodies', async () => {
  assert.deepEqual(await readJsonBody(Readable.from([Buffer.from('{"a":1}')])), { ok: true, value: { a: 1 } });
  assert.equal((await readJsonBody(Readable.from([Buffer.from('nope')]))).status, 400);
  assert.equal((await readJsonBody(Readable.from([Buffer.from('[1]')]))).status, 400);
  assert.equal((await readJsonBody(Readable.from([Buffer.alloc(70 * 1024, 97)]))).status, 413);
});

test('write route: fence, POST only, known actions, checked ids, size cap', async () => {
  const h = harness(base());
  h.fence.rejection = 401;
  assert.equal((await h.post({ action: 'ask', prompt: 'hi' })).status, 401);
  assert.equal(h.provided.modelArena.list().length, 0, 'a refused request must not start a round');
  h.fence.rejection = undefined;
  const wrong = await h.post({ action: 'ask', prompt: 'hi' }, { method: 'GET' });
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.allow, 'POST');
  assert.equal((await h.post({ action: 'drop-everything' })).status, 400);
  assert.equal((await h.post({ action: 'reveal', id: '../../etc/passwd' })).status, 400);
  assert.equal((await h.post({ action: 'reveal' })).status, 400);
  assert.equal((await h.post({ action: 'reveal', id: '20990101000000-abc' })).status, 404);
  assert.equal((await h.post(null, { raw: 'not json' })).status, 400);
  assert.equal((await h.post(null, { raw: JSON.stringify({ action: 'ask', prompt: 'x'.repeat(70 * 1024) }) })).status, 413);
  assert.equal((await h.post({ action: 'ask', prompt: '   ' })).status, 400);
  assert.equal(h.provided.modelArena.list().length, 0);
});

test('write route: ask, pick, reveal and delete, and it stays blind until reveal', async () => {
  const h = harness(base());
  const asked = await h.post({ action: 'ask', prompt: 'what is two plus two' });
  assert.equal(asked.status, 200);
  assert.match(asked.json.id, /^\d{14}-[a-z0-9]{1,3}$/);
  for (let i = 0; i < 50 && h.provided.modelArena.list().length === 0; i += 1) await new Promise((r) => setTimeout(r, 10));
  const id = asked.json.id;
  assert.equal(h.provided.modelArena.list()[0].id, id);
  const leaks = (raw) => ['alpha', 'beta', 'gamma', 'prov-', 'model-aaa', 'model-bbb', 'model-ccc', 'latencyMs', 'candidateId', 'provider'].filter((word) => raw.includes(word));
  assert.deepEqual(leaks(asked.raw), []);
  assert.equal((await h.post({ action: 'pick', id, label: 'Z' })).status, 400);
  const picked = await h.post({ action: 'pick', id, label: 'b' });
  assert.equal(picked.status, 200);
  assert.deepEqual(leaks(picked.raw), []);
  // No judge is set: refused with a plain reason, and nothing identifying in it.
  const judged = await h.post({ action: 'judge', id });
  assert.equal(judged.status, 409);
  assert.match(judged.json.error, /judge/);
  // The reason names the setting (`judge.provider`), never a contestant.
  assert.deepEqual(leaks(judged.raw).filter((word) => word !== "provider"), []);
  const revealed = await h.post({ action: 'reveal', id });
  assert.equal(revealed.status, 200);
  assert.deepEqual(leaks(revealed.raw), [], 'the write route never carries names; the read route does after reveal');
  assert.equal(h.provided.modelArena.list()[0].revealed, true);
  assert.equal(h.provided.modelArena.list()[0].picked, true);
  assert.equal((await h.post({ action: 'delete', id })).status, 200);
  assert.equal(h.provided.modelArena.list().length, 0);
});

test('write route: asking with fewer than two contestants is refused', async () => {
  const h = harness({ dataDir: mkdtempSync(join(tmpdir(), 'arena-')), candidates: [CANDS[0]] });
  const asked = await h.post({ action: 'ask', prompt: 'hi' });
  assert.equal(asked.status, 409);
  assert.match(asked.json.error, /at least two/);
});

test('write route: judge runs the shared judge and answers in labels only', async () => {
  const judgeService = {
    compare: async (spec) => ({ winner: 1, consistent: true, average: spec.texts.map((_, i) => i + 1), verdicts: [{}, {}] }),
  };
  const h = harness({ ...base(), judge: { provider: 'prov-j', model: 'model-j' } }, { services: { candidateJudge: judgeService } });
  await h.run('ask q');
  const id = h.provided.modelArena.list()[0].id;
  const judged = await h.post({ action: 'judge', id });
  assert.equal(judged.status, 200);
  for (const word of ['alpha', 'beta', 'gamma', 'prov-', 'model-']) assert.ok(!judged.raw.includes(word), `judge answer leaked ${word}`);
  assert.equal(h.provided.modelArena.list()[0].judged, true);
  assert.equal(h.get('/dsh-model-arena/rounds').json.judgeService, true);
  // A judge that fails is reported in plain words, without the contestants.
  const failing = harness({ ...base(), judge: { provider: 'prov-j', model: 'model-j' } }, { services: { candidateJudge: { compare: async () => { throw new Error('no json'); } } } });
  await failing.run('ask q');
  const bad = await failing.post({ action: 'judge', id: failing.provided.modelArena.list()[0].id });
  assert.equal(bad.status, 409);
  assert.match(bad.json.error, /could not give a verdict/);
});
