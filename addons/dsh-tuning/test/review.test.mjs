/**
 * The independent review's findings, each with a test of its own (made-up logs and rows only).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRow, mayTrain } from '../lib/rows.js';
import { rowsFromTurns, turnsOf } from '../lib/harvest.js';
import { rowsFromCorrections, rowsFromData, rowsFromPacket } from '../lib/harvest-more.js';
import { dropRepeats, examApart, trainerRows } from '../lib/sets.js';
import { lessonsFrom } from '../lib/lessons.js';
import { newRound, pairsOf, recordPick } from '../lib/taste.js';
import { qaRows } from '../lib/qa.js';
import { newEntry, recordExam, promote, staleEntries } from '../lib/shelf.js';
import { runPython } from '../lib/trainer.js';
import { openStore, writeText } from '../lib/store.js';

const scratch = () => mkdtempSync(join(tmpdir(), 'tuning-review-'));
const event = (type, data) => ({ type, data });
const user = (text) => event('user/message', { message: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] } });
const call = (id, name, args) => event('tool/call', { callId: id, name, arguments: JSON.stringify(args) });
const result = (id, text, isError = false) => event('tool/result', { message: { toolCallId: id, isError, content: [{ type: 'text', text }] } });
const answer = (text) => event('assistant/message', { message: { role: 'assistant', content: [{ type: 'text', text }] } });
const turn = (n, ...inner) => [event('turn/start', { turn: n }), event('request/header', { header: { config: { provider: 'local', model: 'small' } } }), ...inner, event('turn/end', { turn: n, reason: { kind: 'completed' } })];

test('1. secrets in tool arguments are masked before the arguments are written as JSON, in every spelling; a web address with a password makes the row unsure', () => {
  // The pin as a whole number only: a row's `at` time (milliseconds) can hold the digits 4321 (it did on 23 Nov 2026).
  const secrets = /hunter22|correct horse|admin:pw|bob:pw|dXNlcjpwYXNz|ya29\.a0Af|abcd1234efgh|Hunter2\b|zz-key-value|s3cr3t-cookie|opensesame1|\b4321\b/;
  const events = [
    user('set up the database config'),
    ...turn(1,
      call('w', 'write', { file_path: 'config.json', content: '{\n  "password": "hunter22",\n  "user": "app"\n}' }), result('w', 'written'),
      call('e', 'write', { file_path: '.env', content: 'DB_PASSWORD=hunter22\nexport DB_PASS="correct horse"\n' }), result('e', 'written'),
      call('c', 'bash', { command: 'curl -H "Authorization: Basic dXNlcjpwYXNzd29yZA==" "https://api.example.org/v1?access_token=ya29.a0AfH6SMBxyz123&x=1"' }), result('c', 'ok'),
      call('j', 'write', { file_path: 'tokens.json', content: '{"accessToken": "abcd1234efgh"}' }), result('j', 'written'),
      call('m', 'bash', { command: 'mysql -u root -pHunter2 shop < dump.sql' }), result('m', 'ok'),
      call('h', 'http_request', { url: 'https://example.org', headers: { 'X-Api-Key': 'zz-key-value', Cookie: 's3cr3t-cookie' } }), result('h', 'ok'),
      call('l', 'login', { user: 'app', pass: 'opensesame1', pin: 4321 }), result('l', 'ok'),
      answer('Configured.')),
    user('and the backup'),
    ...turn(2, call('b', 'bash', { command: 'psql postgres://admin:pw@10.0.0.5/db -c "select 1"; curl https://bob:pw@localhost/x' }), result('b', 'ok'), answer('Done.')),
    user('thanks'),
    ...turn(3, answer('You are welcome.')),
  ];
  const rows = rowsFromTurns(turnsOf(events), { mode: 'code', session: 's', quiet: true });
  assert.equal(rows.length, 2);
  for (const row of rows) assert.doesNotMatch(JSON.stringify(row), secrets, 'no secret is stored, escaped or not');
  const first = rows.find((row) => row.output.includes('config.json'));
  assert.match(first.output, /\[secret\]/);
  assert.equal(first.unsure, false);
  assert.equal(mayTrain(first).ok, true, 'all masked: it may train');
  const urls = rows.find((row) => row.output.includes('psql'));
  assert.equal(urls.unsure, true, 'a web address carried a password');
  assert.equal(mayTrain(urls).ok, false);
  // An object handed to a row (not text) is masked string by string too.
  const direct = makeRow({ kind: 'answer', mode: 'code', input: 'x', output: { content: '{"password": "hunter22"}' }, proof: { check: 'tests' }, by: { provider: 'local', model: 'm' } });
  assert.doesNotMatch(direct.output, /hunter22/);
});

test('2. the exam never holds a copy of a training row: a lesson keeps its row\'s side, the split ignores the mode, and near repeats of pool rows leave the exam', () => {
  const schema = { type: 'object', properties: { file_path: { type: 'string' } } };
  const mk = (input, exam) => ({ ...makeRow({ kind: 'toolcalls', mode: 'code', input, output: JSON.stringify({ calls: [{ name: 'edit_file', arguments: { file_path: `${input}.js` } }] }), proof: { check: 'tests' }, by: { provider: 'local', model: 'm' } }), exam });
  const lessons = lessonsFrom([mk('pool one', false), mk('pool two', false), mk('exam one', true)], { schemaOf: () => schema, pluginOf: () => 'dsh-edit' })['dsh-edit'];
  assert.equal(lessons.length, 3);
  for (const lesson of lessons) assert.equal(lesson.exam, lesson.input[0].content.startsWith('exam'), 'a lesson stays on its row\'s side');
  // The same work seen from two tabs is one row (one id, one draw).
  const inCode = makeRow({ kind: 'answer', mode: 'code', input: 'same work', output: 'same answer', proof: { check: 'tests' } });
  const inCowork = makeRow({ kind: 'answer', mode: 'cowork', input: 'same work', output: 'same answer', proof: { check: 'tests' } });
  assert.equal(inCode.id, inCowork.id);
  // A near repeat of a pool row is left out of the exam.
  const pool = [makeRow({ kind: 'answer', mode: 'code', input: 'how do I list the files in the project folder today', output: 'use the glob tool with a pattern', proof: { check: 'tests' } })];
  const nearCopy = makeRow({ kind: 'answer', mode: 'other', input: 'how do I list the files in the project folder today?', output: 'use the glob tool with a pattern', proof: { check: 'tests' } });
  const different = makeRow({ kind: 'answer', mode: 'code', input: 'what is the capital of Peru', output: 'Lima is the capital', proof: { check: 'tests' } });
  assert.deepEqual(examApart([nearCopy, different, pool[0]], pool).map((row) => row.id), [different.id]);
});

test('3. the may-train switches see the real writer: a teacher\'s questions, a taste test\'s answers, research findings, a rejected answer', async () => {
  const passages = [{ text: 'The plant opened in 2019 in Leipzig.', source: 'https://x.example', subject: 's' }];
  const ask = async () => '{"question":"When did the plant open?","answer":"2019"}';
  const byClaude = await qaRows({ passages, ask, check: async () => 'YES', by: { provider: 'anthropic', model: 'claude-x' } });
  assert.deepEqual({ provider: byClaude.rows[0].by.provider, model: byClaude.rows[0].by.model }, { provider: 'anthropic', model: 'claude-x' });
  assert.equal(mayTrain(byClaude.rows[0]).ok, false, 'a Claude teacher\'s text: off for open-ended adapters');
  const local = await qaRows({ passages, ask, check: async () => 'YES', by: { provider: 'local', model: 'teacher-m' } });
  assert.equal(mayTrain(local.rows[0]).ok, true, 'a local teacher\'s text may train');
  // A taste test: each side keeps its writer; the owner only picked.
  const round = newRound({ requests: [{ id: '1', text: 'q1', mode: 'chat' }], current: ['from the cloud'], candidate: ['from the adapter'], entry: 'A1', writers: { current: { provider: 'anthropic', model: 'claude-x' }, candidate: { provider: 'mlx-local', model: 'small' } } });
  const cloudSide = round.items[0].key === 'a' ? 'b' : 'a';
  recordPick(round, 1, cloudSide);
  const [pair] = pairsOf(round);
  assert.equal(pair.output, 'from the cloud');
  assert.equal(pair.by.provider, 'anthropic', 'the picked answer is the cloud model\'s writing, not the owner\'s');
  assert.equal(pair.rejectedBy.provider, 'mlx-local');
  assert.equal(mayTrain(pair).ok, false);
  // Research findings: written by a model nobody names: never an open-ended adapter; grades (narrow) may.
  const packet = { question: 'q', claims: [{ id: 'R1', claim: 'Sales rose', passage: 'rose by 34%', source: 1, read: 'read' }], sources: [{ n: 1, url: 'https://a.example', read: 'read', grade: 'A' }] };
  const research = rowsFromPacket(packet, { report: 'r' });
  assert.equal(mayTrain(research.find((row) => row.kind === 'answer')).ok, false);
  assert.equal(mayTrain(research.find((row) => row.kind === 'label')).ok, true);
  // A preference pair needs the rejected answer's writer allowed too.
  const corrected = rowsFromCorrections(turnsOf([user('capital of Peru?'), ...turn(1, answer('Cusco')), user('no, that\'s wrong'), ...turn(2, answer('Lima'))]).map((one, index) => (index === 0 ? { ...one, by: { provider: 'anthropic', model: 'claude-x' } } : one)), { mode: 'chat', session: 'c', quiet: true });
  assert.equal(corrected[0].rejectedBy.provider, 'anthropic');
  const out = trainerRows(corrected, { purpose: 'open' });
  assert.equal(out.train.length, 1, 'the answer after the correction (a local model\'s) may train');
  assert.equal(out.pairs.length, 0, 'the pair carries Claude\'s rejected text: not as a pair');
});

test('6. a turn that called Bench\'s or Recon\'s own tools is never a row, whatever the tab says now', () => {
  const events = [
    user('flash the board'), ...turn(1, call('f', 'bench_write_flash', { port: '/dev/x', image: 'fw.bin' }), result('f', 'flashed'), answer('Flashed.')),
    user('look it up quietly'), ...turn(2, call('r', 'recon_search', { q: 'x' }), result('r', 'found'), answer('Found.')),
    user('list files'), ...turn(3, call('g', 'glob', { pattern: '*' }), result('g', 'a'), answer('a')),
  ];
  const turns = turnsOf(events);
  assert.deepEqual(turns.map((one) => one.closed), [true, true, false]);
  const rows = rowsFromTurns(turns, { mode: 'code', session: 's', quiet: true });
  assert.equal(rows.length, 1);
  assert.doesNotMatch(JSON.stringify(rows), /bench_|recon_/);
  assert.deepEqual(rowsFromCorrections(turnsOf([user('flash it'), ...turn(1, call('f', 'bench_write_flash', {}), result('f', 'x'), answer('A')), user('no, wrong'), ...turn(2, answer('B'))]), { mode: 'code', session: 's', quiet: true }), []);
});

test('7. files are written through a new file and a rename, only inside the folder meant; Python runs isolated in an empty folder', async () => {
  const root = scratch();
  const outside = scratch();
  try {
    mkdirSync(join(root, 'exports'));
    writeFileSync(join(outside, 'precious.txt'), 'keep me');
    symlinkSync(join(outside, 'precious.txt'), join(root, 'exports', 'train.jsonl'));
    assert.throws(() => writeText(join(root, 'exports', 'train.jsonl'), 'rows\n', root), /is a link/);
    assert.equal(readFileSync(join(outside, 'precious.txt'), 'utf8'), 'keep me', 'a planted link is never written through');
    assert.equal(lstatSync(join(root, 'exports', 'train.jsonl')).isSymbolicLink(), true);
    writeText(join(root, 'exports', 'valid.jsonl'), 'rows\n', root);
    assert.equal(readFileSync(join(root, 'exports', 'valid.jsonl'), 'utf8'), 'rows\n');
    symlinkSync(outside, join(root, 'away'));
    assert.throws(() => writeText(join(root, 'away', 'x.jsonl'), 'x', root), /not where it should be/);
    assert.equal(existsSync(join(outside, 'x.jsonl')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
  const seen = {};
  const fake = (_file, args, options) => {
    seen.args = args;
    seen.cwd = options.cwd;
    seen.empty = readdirSync(options.cwd).length === 0;
    const handlers = {};
    setTimeout(() => handlers.close?.(0), 2);
    return { pid: 1, stdout: { on: () => {} }, stderr: { on: () => {} }, on: (name, fn) => { handlers[name] = fn; }, kill: () => {} };
  };
  await runPython({ python: '/x/python', args: ['-m', 'mlx_lm', 'lora'], timeoutMs: 5000, spawnFn: fake });
  assert.equal(seen.args[0], '-I', 'isolated: no current folder or script folder on its path');
  assert.equal(seen.empty, true, 'in a new empty folder');
  assert.equal(existsSync(seen.cwd), false, 'removed afterwards');
});

test('8. near repeats are found without comparing every pair; reads are cached; old shelf entries go, the owner\'s stay', () => {
  const rows = Array.from({ length: 8000 }, (_value, index) => makeRow({ kind: 'toolcalls', mode: 'code', input: `request number ${index} about file ${index * 7} in folder ${index % 97} please`, output: `{"calls":[{"name":"edit","arguments":{"file_path":"src/file-${index}.js","line":${index}}}]}`, proof: { check: 'tests' }, at: index }));
  const copy = makeRow({ kind: 'toolcalls', mode: 'code', input: 'request number 17 about file 119 in folder 17 please!', output: rows[17].output, proof: { check: 'tests' }, at: 99999 });
  const started = Date.now();
  const { kept, dropped } = dropRepeats([...rows, copy]);
  const seconds = (Date.now() - started) / 1000;
  assert.equal(dropped, 1, 'the near copy is found');
  assert.equal(kept.length, 8000);
  assert.ok(seconds < 1.5, `quick enough (${seconds.toFixed(2)} s for 8001 rows; comparing every pair takes many seconds)`);
  const root = scratch();
  try {
    const store = openStore(() => root);
    store.addRows('code', rows.slice(0, 50).map((row) => ({ ...row, exam: false })));
    assert.ok(store.rows()[0] === store.rows()[0], 'an unchanged file is not read again');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  const day = 86_400_000;
  const shelf = { entries: Array.from({ length: 12 }, (_value, index) => newEntry({ id: `A${index}`, name: `x${index}`, base: { model: 'm' }, at: 100 * day + index })) };
  recordExam(shelf, 'A0', { decision: { ok: true } });
  promote(shelf, 'A0', { ownerSaidYes: true });
  const stale = staleEntries(shelf, { at: 100 * day + 20 });
  assert.deepEqual(stale.map((entry) => entry.id).sort(), ['A1'], 'beyond the newest ten candidates; never the promoted one');
  assert.deepEqual(staleEntries(shelf, { at: 200 * day }).map((entry) => entry.id).includes('A0'), false);
});

test('9. the newest turn waits until a later turn shows it was not corrected, or the conversation was quiet for hours', () => {
  const events = [user('list files'), ...turn(1, call('g', 'glob', { pattern: '*' }), result('g', 'a'), answer('a'))];
  assert.deepEqual(rowsFromTurns(turnsOf(events), { mode: 'code', session: 's' }), [], 'still in use: it waits');
  assert.equal(rowsFromTurns(turnsOf(events), { mode: 'code', session: 's', quiet: true }).length, 1, 'quiet for hours: it counts');
  const data = [user('average?'), ...turn(1, call('q', 'data_query', { sql: 's' }), result('q', '1'), call('s', 'data_save_analysis', {}), result('s', 'saved'), answer('1'))];
  assert.deepEqual(rowsFromData(turnsOf(data), { mode: 'data', session: 'd' }), []);
  assert.deepEqual(rowsFromCorrections(turnsOf([user('capital?'), ...turn(1, answer('Cusco')), user('no, wrong'), ...turn(2, answer('Lima'))]), { mode: 'chat', session: 'c' }), [], 'the answer after a correction waits too');
});
