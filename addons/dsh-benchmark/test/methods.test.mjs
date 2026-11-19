/**
 * Measuring the work loop (plan step S7): the ways, the scorecard, the advice, the owner's accept.
 * Stand-in models only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { apply } from '../index.js';
import { WAYS, advice, methodsText, runWay, scorecard, vote } from '../lib/methods.js';

const way = (id) => WAYS.find((entry) => entry.id === id);
const scripted = (answers) => {
  const calls = [];
  const ask = async (who, text) => {
    calls.push({ who, text });
    const list = answers[who] ?? [];
    const answer = typeof list === 'function' ? list(text) : list.length > 0 ? list.shift() : 'x';
    return { text: answer, input: 10, output: 5, latencyMs: 100 };
  };
  return { ask, calls };
};

test('one pass is one call; the loop at Standard checks with the judge and retries once with its words', async () => {
  const one = scripted({ small: ['Paris'] });
  const plain = await runWay({ way: way('small-one-pass'), task: { prompt: 'Capital of France?', grader: { type: 'contains', expect: 'Paris' } }, ask: one.ask, hasJudge: true });
  assert.deepEqual([plain.text, plain.calls, plain.input, plain.ms], ['Paris', 1, 10, 100]);
  const loop = scripted({ small: ['Lyon', 'Paris'], judge: ['{"ok": false, "why": "Lyon is not the capital"}'] });
  const done = await runWay({ way: way('small-loop-standard'), task: { prompt: 'Capital of France?', grader: { type: 'contains', expect: 'Paris' } }, ask: loop.ask, hasJudge: true });
  assert.equal(done.text, 'Paris');
  assert.deepEqual(loop.calls.map((call) => call.who), ['small', 'judge', 'small']);
  assert.match(loop.calls[1].text, /^BENCH_CHECK/);
  assert.match(loop.calls[2].text, /A checker said about an earlier answer: Lyon is not the capital/);
  assert.doesNotMatch(loop.calls.map((call) => call.text).join('\n'), /expect|Paris"/, 'the grader\'s answer is never shown to the loop');
  // No judge set: no check, no retry.
  const alone = scripted({ small: ['Lyon'] });
  assert.equal((await runWay({ way: way('small-loop-standard'), task: { prompt: 'q', grader: { type: 'contains', expect: 'x' } }, ask: alone.ask, hasJudge: false })).calls, 1);
});

test('Ultra Code: several attempts, a vote where answers can be compared, the judge\'s pick where they cannot; Thorough asks checking questions', async () => {
  assert.equal(vote(['4', 'four', '4.']), 0);
  assert.equal(vote(['a', 'b', 'b']), 1);
  const compared = scripted({ small: ['5', '4', '4'], judge: ['{"ok": true}'] });
  const counted = await runWay({ way: way('small-loop-thorough-ultra'), task: { prompt: '2 + 2?', grader: { type: 'exact', expect: '4' } }, ask: compared.ask, hasJudge: true });
  assert.equal(compared.calls.filter((call) => call.who === 'small').length >= 3, true);
  assert.match(compared.calls[3].text, /^BENCH_QUESTIONS/, 'Thorough: questions after the attempts');
  assert.match(compared.calls[3].text, /<answer>\n4\n<\/answer>/, 'the answer two of three tries gave goes on');
  assert.equal(counted.text.length > 0, true);
  const judged = scripted({ small: ['draft one', 'draft two'], judge: ['{"pick": 2}', '{"ok": true}'] });
  const picked = await runWay({ way: way('small-loop-standard-ultra'), task: { prompt: 'Write a haiku', grader: { type: 'judge', rubric: 'r' } }, ask: judged.ask, hasJudge: true });
  assert.equal(picked.text, 'draft two');
  assert.match(judged.calls[2].text, /^BENCH_PICK/);
});

test('the scorecard and the advice: the loop pays only above the tolerance; errors are not scored', () => {
  const rows = [
    { category: 'facts', way: 'small-one-pass', score: 0.5, ms: 100, input: 10, output: 5, calls: 1 },
    { category: 'facts', way: 'small-loop-standard', score: 0.9, ms: 300, input: 30, output: 15, calls: 3 },
    { category: 'facts', way: 'small-loop-standard', error: 'timeout' },
    { category: 'facts', way: 'large-one-pass', score: 1, ms: 200, input: 10, output: 5, calls: 1 },
    { category: 'style', way: 'small-one-pass', score: 0.8, ms: 100, input: 10, output: 5, calls: 1 },
    { category: 'style', way: 'small-loop-thorough', score: 0.81, ms: 900, input: 90, output: 45, calls: 9 },
  ];
  const cells = scorecard(rows);
  const loop = cells.find((cell) => cell.category === 'facts' && cell.way === 'small-loop-standard');
  assert.deepEqual([loop.n, loop.errors, loop.score, loop.tokens], [2, 1, 0.45, 45], 'a way that fails scores 0 for that task (review finding 9)');
  const notes = advice(cells, 0.02);
  const facts = notes.find((note) => note.category === 'facts');
  assert.equal(facts.pays, false, 'with its timeout counted, the loop no longer looks better');
  const clean = advice(scorecard(rows.filter((row) => !row.error)), 0.02);
  const paid = clean.find((note) => note.category === 'facts');
  assert.equal(paid.pays, true);
  assert.equal(paid.way, 'small-loop-standard');
  assert.match(paid.text, /facts: the loop pays\. Small model, loop at Standard scored 0\.90 against 0\.50 in one pass, for about 3\.0 times the tokens; the large model is still 0\.10 ahead\.$/);
  assert.match(advice(scorecard(rows.filter((row) => !row.error)), 0.02, { overlap: true }).find((note) => note.category === 'facts').text, /the same judge model checked inside the loop and graded the answers, which favours the loop/);
  assert.equal(notes.find((note) => note.category === 'style').pays, false, '0.01 better is not enough');
  assert.match(methodsText(cells, notes), /Advice \(you decide; nothing is switched on by itself\)/);
});

test('on a stand-in app: a methods job runs every way, the report has the scorecard and advice, and the owner\'s accept is recorded only', async () => {
  const mutated = [];
  const routes = {};
  const commands = {};
  const provided = {};
  const llm = {
    async *stream({ model, messages }) {
      const text = messages[0].content[0].text;
      const answer = model === 'judge-m' ? (text.startsWith('BENCH_CHECK') ? '{"ok": true}' : '{"pick": 1}') : model === 'big' ? 'Paris' : text.includes('A checker said') ? 'Paris' : 'Lyon';
      yield { type: 'text-delta', text: answer };
      yield { type: 'usage', usage: { inputTokens: 5, outputTokens: 1 } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
  const ctx = {
    logger: { warn() {}, info() {} },
    get: (key) => ({ llm, settings: { mutate: async (ns, ops) => { mutated.push([ns, ops]); } }, ...provided })[key],
    effect: (fn) => fn(),
    provide: (key, value) => { provided[key] = value; },
    inject: (_keys, fn) => fn({ effect: (f) => f(), commands: { register: (spec) => { commands[spec.name] = spec; } }, webServer: { register: (spec) => { routes[spec.path] = spec.handler; } }, connection: { requestRejection: () => undefined } }),
  };
  const config = {
    dataDir: mkdtempSync(join(tmpdir(), 'bench-methods-')),
    targets: [{ id: 'small', provider: 'p', model: 'small-m' }, { id: 'large', provider: 'p', model: 'big' }],
    suites: { facts: { category: 'facts', prompts: [{ id: 'cap', prompt: 'Capital of France?', grader: { type: 'contains', expect: 'Paris' } }] } },
    grid: { seeds: 1 },
    judge: { provider: 'p', model: 'judge-m' },
  };
  apply(ctx, config);
  const post = async (body) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    req.method = 'POST';
    req.url = '/dsh-benchmark/action';
    const res = { statusCode: 0, setHeader() {}, end(text) { this.body = text; } };
    await routes['/dsh-benchmark/action'](req, res);
    return { status: res.statusCode, json: JSON.parse(res.body) };
  };
  assert.equal((await post({ action: 'methods', suite: 'facts', small: 'small', large: 'small' })).status, 409, 'the two must differ');
  const started = await post({ action: 'methods', suite: 'facts', small: 'small', large: 'large' });
  assert.equal(started.status, 200);
  for (let i = 0; i < 200 && provided.benchmark.status(started.json.id).state === 'running'; i += 1) await new Promise((done) => setTimeout(done, 5));
  const report = provided.benchmark.report(started.json.id);
  assert.deepEqual(report.methods.map((cell) => cell.way), WAYS.map((entry) => entry.id));
  assert.equal(report.methods.find((cell) => cell.way === 'small-one-pass').score, 0, 'the small model alone says Lyon');
  assert.equal(report.methods.find((cell) => cell.way === 'large-one-pass').score, 1);
  assert.equal(report.advice[0].pays, false, 'the stand-in checker says yes to Lyon, so the loop does not help here');
  assert.equal(mutated.length, 0, 'nothing is recorded or switched on by itself');
  const accepted = await post({ action: 'accept', category: 'facts', way: 'small-loop-standard' });
  assert.equal(accepted.status, 200);
  assert.deepEqual(mutated[0], ['benchmark', [{ op: 'set', path: ['acceptedMethods'], value: '{"facts":"small-loop-standard"}' }]]);
  assert.equal((await post({ action: 'accept', category: 'facts', way: 'rm -rf' })).status, 400);
  assert.match((await commands.benchmark.handler({ rawInput: `report ${started.json.id}` })).text, /Ways of working/);
});

test('review fix 9: the cost of calls made before a failure is counted; a judge-graded suite says the judge overlaps', async () => {
  const routes = {};
  const provided = {};
  let calls = 0;
  const llm = {
    async *stream({ model }) {
      calls += 1;
      if (model === 'judge-m') {
        yield { type: 'finish', reason: { kind: 'error', failure: { message: 'judge down' } } };
        return;
      }
      yield { type: 'text-delta', text: 'answer' };
      yield { type: 'usage', usage: { inputTokens: 1000000, outputTokens: 0 } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
  const ctx = {
    logger: { warn() {}, info() {} },
    get: (key) => ({ llm, ...provided })[key],
    effect: (fn) => fn(),
    provide: (key, value) => { provided[key] = value; },
    inject: (_keys, fn) => fn({ effect: (f) => f(), commands: { register: () => {} }, webServer: { register: (spec) => { routes[spec.path] = spec.handler; } }, connection: { requestRejection: () => undefined } }),
  };
  apply(ctx, {
    dataDir: mkdtempSync(join(tmpdir(), 'bench-methods-')),
    targets: [{ id: 'small', provider: 'p', model: 'small-m' }, { id: 'large', provider: 'p', model: 'big' }],
    suites: { style: { category: 'style', prompts: [{ id: 'haiku', prompt: 'A haiku', grader: { type: 'judge', rubric: 'good' } }] } },
    grid: { seeds: 1 },
    judge: { provider: 'p', model: 'judge-m' },
    pricing: { 'p/small-m': { inputPerMTok: 1, outputPerMTok: 0 }, 'p/big': { inputPerMTok: 1, outputPerMTok: 0 } },
  });
  const id = provided.benchmark.startMethods('style', 'small', 'large');
  for (let i = 0; i < 200 && provided.benchmark.status(id).state === 'running'; i += 1) await new Promise((done) => setTimeout(done, 5));
  const report = provided.benchmark.report(id);
  assert.equal(report.job.overlap, true);
  // Every way failed at its judge, yet the answers before it cost 1 USD each.
  assert.equal(report.job.runs.every((row) => row.error), true);
  assert.equal(report.job.runs.every((row) => row.cost >= 1), true, JSON.stringify(report.job.runs.map((row) => row.cost)));
  assert.equal(report.methods.every((cell) => cell.score === 0), true, 'failures score 0');
});
