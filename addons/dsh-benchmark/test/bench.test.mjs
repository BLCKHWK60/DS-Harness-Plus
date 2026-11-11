import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { apply, gradeLocal, stats, costOf, summarize, recommend, readSetup, planSize, promptProblem, readJsonBody } from '../index.js';

const TARGETS = [
  { id: 'one', provider: 'prov-a', model: 'model-x' },
  { id: 'two', provider: 'prov-b', model: 'model-y' },
];
const SUITES = {
  basics: {
    category: 'general',
    prompts: [
      { id: 'cap', prompt: 'Capital of France?', grader: { type: 'contains', expect: 'Paris' } },
      { id: 'sum', prompt: '2 + 2?', grader: { type: 'exact', expect: '4' } },
    ],
  },
};

/** Build a fake ctx; the default model answers "Paris" to everything. */
function harness(config, { llm } = {}) {
  const commands = {};
  const routes = {};
  const fence = { rejection: undefined };
  const provided = {};
  const warnings = [];
  const defaultLlm = {
    async *stream() {
      yield { type: 'text-delta', text: 'Paris' };
      yield { type: 'usage', usage: { inputTokens: 5, outputTokens: 1 } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
  const ctx = {
    logger: { warn: (text) => warnings.push(text), info() {} },
    get: (key) => ({ llm: llm ?? defaultLlm, ...provided })[key],
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
  const run = async (text) => commands.bench.handler({ rawInput: text });
  const get = (path, { method = 'GET' } = {}) => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
    routes[path.split('?')[0]]({ method, url: path }, res);
    return { status: res.statusCode, headers: res.headers, raw: res.body ?? '', json: res.body ? JSON.parse(res.body) : null };
  };
  const post = async (body, { method = 'POST', raw } = {}) => {
    const req = Readable.from([Buffer.from(raw ?? JSON.stringify(body))]);
    req.method = method;
    req.url = '/dsh-benchmark/action';
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(text) { this.body = text; } };
    await routes['/dsh-benchmark/action'](req, res);
    return { status: res.statusCode, headers: res.headers, raw: res.body ?? '', json: res.body ? JSON.parse(res.body) : null };
  };
  /** Wait until a job is no longer running. */
  const settle = async (id) => {
    for (let i = 0; i < 200 && provided.benchmark.status(id).state === 'running'; i += 1) await new Promise((r) => setTimeout(r, 5));
    return provided.benchmark.status(id);
  };
  return { provided, commands, routes, fence, warnings, run, get, post, settle };
}

const base = (extra = {}) => ({ dataDir: mkdtempSync(join(tmpdir(), 'bench-')), targets: TARGETS, suites: SUITES, grid: { temperature: [], maxTokens: [], seeds: 2 }, ...extra });

test('local graders', () => {
  assert.equal(gradeLocal({ type: 'contains', expect: 'paris' }, 'It is Paris.'), 1);
  assert.equal(gradeLocal({ type: 'exact', expect: '4' }, ' 4 '), 1);
  assert.equal(gradeLocal({ type: 'exact', expect: '4' }, 'four'), 0);
  assert.equal(gradeLocal({ type: 'regex', expect: '^\\d+$' }, '42'), 1);
  assert.throws(() => gradeLocal({ type: 'judge' }, 'x'));
});

test('stats, cost, summary and recommendation', () => {
  assert.deepEqual(stats([]), { mean: 0, stdev: 0 });
  assert.equal(stats([1, 0]).mean, 0.5);
  assert.equal(costOf({ 'p/m': { inputPerMTok: 1, outputPerMTok: 2 } }, 'p/m', { input: 1e6, output: 1e6 }), 3);
  assert.equal(costOf({}, 'p/m', { input: 5, output: 5 }), 0);
  const cells = summarize([
    { category: 'c', target: 't', seed: 1, score: 1, latencyMs: 10 },
    { category: 'c', target: 't', seed: 2, score: 0, latencyMs: 30 },
    { category: 'c', target: 't', seed: 3, error: 'timed out' },
  ]);
  assert.equal(cells.length, 1);
  assert.equal(cells[0].n, 2);
  assert.equal(cells[0].errors, 1);
  assert.equal(cells[0].meanScore, 0.5);
  const picks = recommend(cells, { minSeeds: 3, scoreTolerance: 0.02 });
  assert.equal(picks[0].confidence, 'low');
});

test('promptProblem explains what is missing, in plain words', () => {
  assert.equal(promptProblem({ prompt: 'q', grader: { type: 'contains', expect: 'a' } }, false), '');
  assert.match(promptProblem({ prompt: ' ', grader: { type: 'contains', expect: 'a' } }, false), /no text/);
  assert.match(promptProblem({ prompt: 'q', grader: { type: 'contains' } }, false), /text to look for/);
  assert.match(promptProblem({ prompt: 'q', grader: { type: 'regex', expect: '(' } }, false), /not valid/);
  assert.match(promptProblem({ prompt: 'q', grader: { type: 'judge' } }, true), /good answer/);
  assert.match(promptProblem({ prompt: 'q', grader: { type: 'judge', rubric: 'r' } }, false), /no judge model/);
  assert.equal(promptProblem({ prompt: 'q', grader: { type: 'judge', rubric: 'r' } }, true), '');
  assert.match(promptProblem({ prompt: 'q', grader: {} }, true), /no way to grade/);
});

test('readSetup drops unusable entries, clamps numbers and never throws', () => {
  const setup = readSetup({
    targets: [TARGETS[0], { ...TARGETS[0] }, { id: 'x', provider: 'p' }],
    suites: { ok: SUITES.basics, empty: { prompts: [] }, bad: { prompts: [{ id: 'p', prompt: 'q', grader: { type: 'regex', expect: '(' } }] } },
    grid: { temperature: [0.2, 5, 'x', 0.2], maxTokens: [0, 1024.7], seeds: 99 },
    limits: { maxParallel: 99, timeoutMs: 1 },
    judge: { provider: 'p' },
  });
  assert.deepEqual(setup.targets.map((t) => t.id), ['one']);
  assert.equal(setup.suites.ok.problem, '');
  assert.match(setup.suites.empty.problem, /no prompts/);
  assert.match(setup.suites.bad.problem, /prompt "p"/);
  assert.deepEqual(setup.grid, { temperature: [0.2], maxTokens: [1024], seeds: 50 });
  assert.equal(setup.limits.maxParallel, 16);
  assert.equal(setup.limits.timeoutMs, 1000);
  assert.equal(setup.judge, null);
  assert.equal(planSize(readSetup(base()), 'basics'), 2 * 1 * 1 * 2 * 2);
  assert.equal(planSize(readSetup(base()), 'nope'), 0);
  assert.deepEqual(readSetup({}).targets, []);
});

test('loads with nothing configured, and a mistake in the file does not stop it', async () => {
  const empty = harness({});
  assert.ok(empty.provided.benchmark);
  assert.equal((await empty.run('run basics')).kind, 'error');
  assert.equal(empty.get('/dsh-benchmark/jobs').json.targets, 0);
  const broken = harness({ dataDir: mkdtempSync(join(tmpdir(), 'bench-')), targets: TARGETS, suites: { hollow: { prompts: [] } } });
  assert.ok(broken.warnings.some((line) => /hollow/.test(line)));
  assert.match((await broken.run('run hollow')).text, /cannot run/);
  assert.throws(() => harness({ dataDir: 'relative', targets: TARGETS, suites: SUITES }), /absolute/);
});

test('settings are read live: the page can add models and suites while the app runs', async () => {
  const config = { dataDir: mkdtempSync(join(tmpdir(), 'bench-')), targets: [], suites: {} };
  const h = harness(config);
  assert.match((await h.run('run basics')).text, /no models/);
  config.targets = TARGETS;
  assert.match((await h.run('run basics')).text, /no suites/);
  config.suites = SUITES;
  config.grid = { seeds: 1 };
  const started = await h.run('run basics');
  assert.equal(started.kind, 'success');
  const listed = h.get('/dsh-benchmark/jobs').json;
  assert.equal(listed.targets, 2);
  assert.deepEqual(listed.suites.map((s) => [s.name, s.prompts, s.problem, s.calls]), [['basics', 2, '', 4]]);
});

test('a job runs, grades and reports; errors are never scored', async () => {
  const llm = {
    async *stream({ model }) {
      if (model === 'model-y') {
        yield { type: 'finish', reason: { kind: 'error', failure: { message: 'boom' } } };
        return;
      }
      yield { type: 'text-delta', text: 'Paris' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
  const h = harness(base(), { llm });
  const id = h.provided.benchmark.start('basics');
  const done = await h.settle(id);
  assert.equal(done.state, 'finished');
  assert.equal(done.total, 8);
  assert.equal(done.errors, 4);
  const report = h.provided.benchmark.report(id);
  const one = report.cells.find((cell) => cell.target === 'one');
  const two = report.cells.find((cell) => cell.target === 'two');
  assert.equal(one.meanScore, 0.5);
  assert.equal(two.n, 0);
  assert.equal(two.errors, 4);
});

test('read routes: fence, GET only, id check; no prompts or answers', async () => {
  const h = harness(base());
  const id = h.provided.benchmark.start('basics');
  await h.settle(id);
  h.fence.rejection = 401;
  assert.equal(h.get('/dsh-benchmark/jobs').status, 401);
  h.fence.rejection = undefined;
  assert.equal(h.get('/dsh-benchmark/jobs', { method: 'POST' }).status, 405);
  assert.equal(h.get('/dsh-benchmark/report?job=../../x').status, 400);
  assert.equal(h.get('/dsh-benchmark/report?job=20990101000000-1').status, 404);
  const jobs = h.get('/dsh-benchmark/jobs');
  const report = h.get('/dsh-benchmark/report?job=' + id);
  assert.equal(report.status, 200);
  assert.equal(report.headers['cache-control'], 'no-store');
  for (const raw of [jobs.raw, report.raw]) {
    assert.ok(!raw.includes('Capital of France'), 'a prompt reached the page');
    assert.ok(!raw.includes('Paris'), 'an answer reached the page');
  }
});

test('write route: fence, POST only, known actions, checked names and ids, size cap', async () => {
  const h = harness(base());
  h.fence.rejection = 403;
  assert.equal((await h.post({ action: 'run', suite: 'basics' })).status, 403);
  assert.equal(h.get('/dsh-benchmark/jobs').status, 403);
  h.fence.rejection = undefined;
  assert.equal(h.get('/dsh-benchmark/jobs').json.jobs.length, 0, 'a refused request must not start a job');
  const wrong = await h.post({ action: 'run', suite: 'basics' }, { method: 'GET' });
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.allow, 'POST');
  assert.equal((await h.post({ action: 'wipe' })).status, 400);
  assert.equal((await h.post({ action: 'run', suite: '../etc' })).status, 400);
  assert.equal((await h.post({ action: 'run' })).status, 400);
  assert.equal((await h.post({ action: 'cancel', id: 'nope' })).status, 400);
  assert.equal((await h.post({ action: 'cancel', id: '20990101000000-1' })).status, 404);
  assert.equal((await h.post(null, { raw: 'not json' })).status, 400);
  assert.equal((await h.post(null, { raw: JSON.stringify({ action: 'run', suite: 'x'.repeat(20 * 1024) }) })).status, 413);
  const unknown = await h.post({ action: 'run', suite: 'missing' });
  assert.equal(unknown.status, 409);
  assert.match(unknown.json.error, /unknown suite/);
});

test('write route: run starts a job and cancel stops it', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const llm = {
    async *stream({ signal }) {
      await Promise.race([gate, new Promise((resolve) => signal?.addEventListener('abort', resolve, { once: true }))]);
      yield { type: 'text-delta', text: 'Paris' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
  const h = harness(base(), { llm });
  const started = await h.post({ action: 'run', suite: 'basics' });
  assert.equal(started.status, 200);
  assert.match(started.json.id, /^\d{14}-\d+$/);
  assert.equal(h.provided.benchmark.status(started.json.id).state, 'running');
  assert.equal((await h.post({ action: 'cancel', id: started.json.id })).status, 200);
  release();
  const done = await h.settle(started.json.id);
  assert.equal(done.state, 'cancelled');
});

test('readJsonBody refuses oversize, broken and non-object bodies', async () => {
  assert.deepEqual(await readJsonBody(Readable.from([Buffer.from('{"a":1}')])), { ok: true, value: { a: 1 } });
  assert.equal((await readJsonBody(Readable.from([Buffer.from('[]')]))).status, 400);
  assert.equal((await readJsonBody(Readable.from([Buffer.alloc(17 * 1024, 97)]))).status, 413);
});

test('no model names, hosts or keys are shipped in the bundle patch', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8').split('\n').filter((line) => !line.trim().startsWith('#')).join('\n');
  assert.doesNotMatch(patch, /provider:|model:|apiKey|http/);
});
