/**
 * Tuning Plus's pieces, with made-up logs and rows only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mask } from '../lib/mask.js';
import { forExam, isAnthropic, makeRow, mayTrain } from '../lib/rows.js';
import { rowsFromLedger, rowsFromLibrary, rowsFromRun, rowsFromTurns, turnsOf, halvesOf } from '../lib/harvest.js';
import { rowsFromBench, rowsFromCorrections, rowsFromCreator, rowsFromData, rowsFromPacket } from '../lib/harvest-more.js';
import { firstCall, likeness, mark, promotable, runExam, weakestSpot } from '../lib/exam.js';
import { buildSets, chatRow, dropRepeats, trainerRows } from '../lib/sets.js';
import { ADAPTER_MIN, proposeRung, runSentence } from '../lib/ladder.js';
import { newEntry, promote, rebuildPlan, recordExam, routeOf, setOn, setServing, markDue } from '../lib/shelf.js';
import { idleSeconds, mayWork, mustStop, onPower } from '../lib/night.js';
import { lessonsFrom, schemaProblem } from '../lib/lessons.js';
import { newRound, pairsOf, recordPick, roundView, tally } from '../lib/taste.js';
import { qaRows } from '../lib/qa.js';
import { fingerprint, modelProblem, progressOf, pythonProblem, runPython, trainArgs, trainSettings } from '../lib/trainer.js';
import { openStore } from '../lib/store.js';

const scratch = () => mkdtempSync(join(tmpdir(), 'tuning-test-'));

test('secrets are masked before a row is stored; a row whose secret could not be masked may not train', () => {
  const masked = mask('token: abcd1234efgh, password=hunter22, sk-abcdefghijklmnop1234, mail me@example.org, /Users/someone/x, Bearer abcdefghijklmnopqrst, sha256: ' + 'a'.repeat(64) + ' https://example.org/' + 'Ab1'.repeat(15));
  assert.doesNotMatch(masked.text, /abcd1234efgh|hunter22|sk-abcdef|me@example|someone|Bearer abcdef/);
  assert.match(masked.text, /a{64}/, 'a checksum named as one stays readable');
  assert.match(masked.text, /https:\/\/example\.org\/(?:Ab1){15}/, 'a web address stays readable');
  const keylike = mask(`key ${'x9'.repeat(20)}`);
  assert.match(keylike.text, /\[secret\]/);
  const row = makeRow({ kind: 'answer', mode: 'code', input: 'set it up', output: 'done', proof: { check: 'tests', detail: 'npm test' }, by: { provider: 'local', model: 'm' } });
  assert.equal(mayTrain(row).ok, true);
  assert.equal(mayTrain({ ...row, unsure: true }).ok, false);
  assert.equal(mayTrain({ ...row, signedIn: true }).ok, false);
  assert.equal(mayTrain({ ...row, mode: 'recon' }).ok, false);
});

test('may it train: each provider has a switch (yes by default); Anthropic\'s text for open-ended adapters starts off, narrow tools may use it', () => {
  const byClaude = makeRow({ kind: 'answer', mode: 'code', input: 'x', output: 'y', proof: { check: 'tests' }, by: { provider: 'anthropic', model: 'claude-x' } });
  const label = makeRow({ kind: 'label', mode: 'content', input: 'claim', label: 'reported', proof: { check: 'ruling' }, by: { provider: 'anthropic', model: 'claude-x' } });
  assert.equal(isAnthropic(byClaude.by), true);
  assert.equal(mayTrain(byClaude).ok, false, 'open-ended text written by Anthropic\'s models: off');
  assert.equal(mayTrain(byClaude, { anthropicOpenEnded: true }).ok, true, 'the owner\'s switch');
  assert.equal(mayTrain(label).ok, true, 'a narrow tool (a judge) may use it');
  const local = makeRow({ kind: 'answer', mode: 'code', input: 'x', output: 'z', proof: { check: 'tests' }, by: { provider: 'local-server', model: 'm' } });
  assert.equal(mayTrain(local).ok, true);
  assert.equal(mayTrain(local, { providers: { 'local-server': false } }).ok, false);
  assert.equal(mayTrain(makeRow({ kind: 'failure', mode: 'code', input: 'x', output: 'no', proof: { check: 'command' } })).ok, false);
});

test('one row in five goes to the exam, by code: the same row always the same way; another install\'s salt picks differently', () => {
  const ids = Array.from({ length: 2000 }, (_value, index) => `row-${index}`);
  const picked = ids.filter((id) => forExam(id, 'salt-one'));
  assert.ok(picked.length > 330 && picked.length < 470, `about one in five (${picked.length})`);
  assert.deepEqual(ids.filter((id) => forExam(id, 'salt-one')), picked);
  assert.notDeepEqual(ids.filter((id) => forExam(id, 'salt-two')), picked);
});

const event = (type, data) => ({ type, data });
const user = (text) => event('user/message', { message: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] } });
const call = (id, name, args) => event('tool/call', { callId: id, name, arguments: JSON.stringify(args) });
const result = (id, text, isError = false) => event('tool/result', { message: { toolCallId: id, isError, content: [{ type: 'text', text }] } });
const answer = (text) => event('assistant/message', { message: { role: 'assistant', content: [{ type: 'text', text }] } });
const turn = (n, ...inner) => [event('turn/start', { turn: n }), event('request/header', { header: { config: { provider: 'local', model: 'small' } } }), ...inner, event('turn/end', { turn: n, reason: { kind: 'completed' } })];

test('the harvest from a conversation: tests that passed, a finished turn, a failed call beside its fix; a corrected turn and a failed test are not rows', () => {
  const events = [
    user('fix the date parser'), ...turn(1, call('a', 'edit', { file_path: 'x.js', old: 'a' }), result('a', 'Error: no match', true), call('b', 'edit', { file_path: 'x.js', old: 'b' }), result('b', 'ok'), call('c', 'bash', { command: 'npm test' }), result('c', '12 passing'), answer('Fixed; tests pass.')),
    user('list the files'), ...turn(2, call('d', 'glob', { pattern: '*.js' }), result('d', 'x.js'), answer('x.js')),
    user('no, I said the markdown files'), ...turn(3, call('e', 'glob', { pattern: '*.md' }), result('e', 'a.md'), answer('a.md')),
    user('run the tests'), ...turn(4, call('f', 'bash', { command: 'npm test' }), result('f', '1 failed, 3 passing'), answer('One fails.')),
  ];
  const turns = turnsOf(events);
  assert.equal(turns.length, 4);
  assert.equal(turns[1].corrected, true, 'the owner corrected turn 2 in his next message');
  const rows = rowsFromTurns(turns, { mode: 'code', session: 's1', quiet: true });
  const kinds = rows.map((row) => `${row.kind}:${row.proof.check}`);
  assert.deepEqual(kinds.sort(), ['toolcalls:finished', 'toolcalls:tests', 'toolfix:finished'].sort());
  const fix = rows.find((row) => row.kind === 'toolfix');
  assert.match(fix.rejected, /"old":"a"[\s\S]*It failed: Error: no match/);
  assert.match(fix.output, /"old":"b"/);
  const tested = rows.find((row) => row.proof.check === 'tests');
  assert.doesNotMatch(tested.output, /"old":"a"/, 'a failed call is not part of what to do');
  assert.equal(tested.by.model, 'small');
  assert.ok(!rows.some((row) => row.output.includes('*.js')), 'the turn the owner corrected is not a row');
  assert.ok(rows.some((row) => row.output.includes('*.md')), 'the answer after his correction, not corrected again, is');
  // A connector (signed-in account) makes the row not trainable.
  const connector = rowsFromTurns(turnsOf([user('mail Bob'), ...turn(1, call('g', 'mcp__mail__send', { to: 'b' }), result('g', 'sent'), answer('Sent.'))]), { mode: 'cowork', session: 's2', quiet: true });
  assert.equal(connector[0].signedIn, true);
  assert.equal(mayTrain(connector[0]).ok, false);
  // A fork's copied events are left out.
  assert.equal(turnsOf(events, events.length).length, 0);
});

test('the harvest from a Mission run: a checked item, a failed try (never trains), the cheapest model that passed; Recon and Bench runs are not read', () => {
  const run = { id: 'r1', goal: 'add a hello file', items: [{ id: '1', title: 'Greeting file', detail: 'hello.txt', doneWhen: 'it says hello', report: 'Wrote hello.txt.', evidence: 'grep ok' }] };
  const log = [
    { kind: 'work', item: '1', try: 1, model: 'big', status: 'unverified', check: { command: 'grep -q hello hello.txt', ok: false } },
    { kind: 'work', item: '1', try: 2, model: 'small', status: 'verified', check: { command: 'grep -q hello hello.txt', ok: true } },
  ];
  const rows = rowsFromRun({ run, log, mode: 'code', session: 'c1', models: { small: 1, big: 2 } });
  assert.deepEqual(rows.map((row) => row.kind).sort(), ['answer', 'failure', 'router']);
  assert.equal(rows.find((row) => row.kind === 'router').label, 'small');
  assert.equal(rows.find((row) => row.kind === 'answer').proof.detail, 'grep -q hello hello.txt');
  assert.deepEqual(rowsFromRun({ run: { ...run, long: { isolated: true } }, log, mode: 'recon', session: 'r' }), []);
  assert.deepEqual(rowsFromRun({ run: { ...run, long: { bench: {} } }, log, mode: 'bench', session: 'b' }), []);
});

test('Content rows: the owner\'s rulings (never a claim from Recon), and his edits beside the writer\'s draft as a preference pair', () => {
  const state = { sources: [{ id: 'S1', origin: 'research' }, { id: 'S2', origin: 'recon' }], claims: [
    { id: 'C1', text: 'Sales rose 34%', who: 'the Agency', passage: 'Sales rose by 34%.', standing: 'reported', origin: 'research', sources: ['S1'], ruled: { standing: 'reported', at: 1, quote: 'C1 is reported by the Agency' } },
    { id: 'C2', text: 'Unruled', standing: 'claim', origin: 'research', ruled: null },
    { id: 'C3', text: 'From an export', standing: 'claim', origin: 'recon', ruled: { at: 1, quote: 'yes' } },
    { id: 'C4', text: 'No origin recorded', standing: 'claim', ruled: { at: 1, quote: 'yes' } },
    { id: 'C5', text: 'Found here, but it cites a source from Recon', standing: 'claim', origin: 'content', sources: ['S2'], ruled: { at: 1, quote: 'yes' } },
  ] };
  const rows = rowsFromLedger(state, { subject: 'heat-pumps' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, 'reported');
  assert.equal(rows[0].proof.check, 'ruling');
  const edits = '# Piece\n\n## What changed\n\n- x\n\n## The writer\'s draft\n\nThe draft text here.\n\n## The owner\'s version\n\nMy own text here.\n';
  assert.deepEqual(halvesOf(edits), { writer: 'The draft text here.', owner: 'My own text here.' });
  const pairs = rowsFromLibrary({ pieces: [{ id: 'P1', title: 'Heat', format: 'blog-post', edits: '/x/edits/a.md', share: 0.4 }, { id: 'P2', title: 'No edits' }] }, () => edits);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].output, 'My own text here.');
  assert.equal(pairs[0].rejected, 'The draft text here.');
});

test('the other modes: Research (only sources really opened), Data (saved or run again), Bench (checked reads, never a write), corrections, Creator Plus', () => {
  const packet = { question: 'Heat pumps', claims: [{ id: 'R1', claim: 'Sales rose', who: 'agency.example', passage: 'rose by 34%', source: 1, read: 'read' }, { id: 'R2', claim: 'Seen only', passage: 'x', source: 2, read: 'seen only in search results' }], sources: [{ n: 1, url: 'https://agency.example/a', host: 'agency.example', read: 'read', grade: 'A' }, { n: 2, url: 'https://b.example', read: 'seen only in search results', grade: 'C' }] };
  const research = rowsFromPacket(packet, { report: 'heat' });
  assert.deepEqual(research.map((row) => `${row.kind}:${row.label ?? ''}`).sort(), ['answer:', 'label:A']);
  const dataTurns = turnsOf([user('average price?'), ...turn(1, call('q', 'data_query', { sql: 'select avg(p) from t' }), result('q', '4.2'), call('s', 'data_save_analysis', { name: 'avg' }), result('s', 'saved'), answer('4.2'))]);
  assert.equal(rowsFromData(dataTurns, { mode: 'data', session: 'd', quiet: true })[0].proof.check, 'saved');
  assert.deepEqual(rowsFromData(turnsOf([user('x'), ...turn(1, call('q', 'data_query', { sql: 's' }), result('q', '1'), answer('1'))]), { mode: 'data', session: 'd' }), [], 'nothing saved or run again: not checked');
  const bench = rowsFromBench([{ name: 'Board', maker: 'Espressif', chip: 'ESP32', recipe: 'esp32', slug: 'board' }, { name: 'Unchecked', maker: 'X', recipe: 'y' }], (card) => card.slug === 'board');
  assert.equal(bench.length, 1);
  assert.doesNotMatch(JSON.stringify(bench), /write_flash|setting_put|flash/i);
  const corrections = rowsFromCorrections(turnsOf([user('capital of Peru?'), ...turn(1, answer('Cusco')), user('no, that\'s wrong'), ...turn(2, answer('Lima'))]), { mode: 'chat', session: 'c', quiet: true });
  assert.equal(corrections.length, 1);
  assert.equal(corrections[0].output, 'Lima');
  assert.equal(corrections[0].rejected, 'Cusco');
  const creator = rowsFromCreator([{ id: 'b1', brief: 'A clock panel', summary: 'Built clock', checks: { loads: true, tests: true, fit: { ok: true }, trial: true }, fixes: [{ error: 'E', cause: 'C', fix: 'F', passed: true }] }, { id: 'b2', brief: 'x', summary: 'y', checks: { loads: true } }]);
  assert.equal(creator.length, 2, 'the build that passed all four checks, and its fix');
});

test('the exam marks each kind by its own check', () => {
  const call_ = makeRow({ kind: 'toolcalls', mode: 'code', input: 'list files', output: JSON.stringify({ calls: [{ name: 'glob', arguments: { pattern: '*.js' } }] }), proof: { check: 'finished' } });
  assert.equal(mark(call_, '{"calls":[{"name":"glob","arguments":{"pattern":"*.ts"}}]}').pass, true);
  assert.equal(mark(call_, 'glob({"path":"."})').pass, false);
  assert.equal(mark(call_, 'I would list them').pass, false);
  assert.deepEqual(firstCall('use read({"file_path":"a"})'), { name: 'read', args: { file_path: 'a' } });
  const label = makeRow({ kind: 'label', mode: 'content', input: 'x', label: 'reported', proof: { check: 'ruling' } });
  assert.equal(mark(label, 'Reported.').pass, true);
  assert.equal(mark(label, 'claim').pass, false);
  const ans = makeRow({ kind: 'answer', mode: 'research', input: 'x', output: 'Heat pump sales rose by thirty four percent in Germany', proof: { check: 'source-opened' } });
  assert.equal(mark(ans, 'In Germany, heat pump sales rose by thirty four percent.').pass, true);
  assert.equal(mark(ans, 'No idea.').pass, false);
  const pair = makeRow({ kind: 'pair', mode: 'content', input: 'x', output: 'my plain short words about pumps today', rejected: 'an ornate verbose paragraph regarding thermal machinery', proof: { check: 'owner-edit' } });
  assert.equal(mark(pair, 'my plain short words about pumps').pass, true);
  assert.equal(likeness('pumps rose sharply today', 'pumps rose sharply today'), 1);
});

test('the rule for promotion: better by a clear margin on its own exam, not worse on the canaries, and enough rows; the weakest spot', async () => {
  const before = { total: 20, passed: 10, rate: 0.5 };
  const canary = (rate) => ({ total: 12, passed: Math.round(rate * 12), rate });
  assert.equal(promotable({ before, after: { total: 20, passed: 14, rate: 0.7 }, canaryBefore: canary(0.8), canaryAfter: canary(0.8) }).ok, true);
  assert.equal(promotable({ before, after: { total: 20, passed: 11, rate: 0.53 }, canaryBefore: canary(0.8), canaryAfter: canary(0.8) }).ok, false, 'not by the margin');
  assert.equal(promotable({ before, after: { total: 20, passed: 14, rate: 0.7 }, canaryBefore: canary(0.8), canaryAfter: canary(0.6) }).ok, false, 'worse at everything else');
  assert.equal(promotable({ before, after: { total: 20, passed: 14, rate: 0.7 }, canaryBefore: canary(0.8) }).ok, false, 'canaries not run after');
  assert.equal(promotable({ before, after: { total: 20, passed: 14, rate: 0.7 }, canaryAfter: canary(0.8) }).ok, false, 'canaries not run before (the run failed)');
  assert.equal(promotable({ before, after: { total: 5, passed: 5, rate: 1 }, canaryBefore: canary(1), canaryAfter: canary(1) }).ok, false, 'too few rows');
  const rows = [makeRow({ kind: 'label', mode: 'm', input: 'a', label: 'x', proof: { check: 'ruling' } }), { ...makeRow({ kind: 'label', mode: 'm', input: 'b', label: 'x', proof: { check: 'ruling' } }), judgedBy: 'A1' }];
  const result = await runExam({ rows, answer: async () => 'x', leaveOut: 'A1' });
  assert.equal(result.total, 1, 'no judge marks its own homework');
  assert.deepEqual(weakestSpot({ byKind: { label: { total: 10, passed: 9 }, toolcalls: { total: 10, passed: 2 }, pair: { total: 2, passed: 0 } } }).kind, 'toolcalls');
});

test('sets: near repeats dropped, exam rows never in a set, the trainer\'s format only with rows that may train', () => {
  const a = makeRow({ kind: 'label', mode: 'content', input: 'claim about pumps rising sharply this year', label: 'reported', proof: { check: 'ruling' }, at: 1, by: { provider: 'owner', model: 'owner' } });
  const b = makeRow({ kind: 'label', mode: 'content', input: 'claim about pumps rising sharply this year.', label: 'reported', proof: { check: 'ruling' }, at: 2 });
  const c = makeRow({ kind: 'toolcalls', mode: 'code', input: 'list files', output: '{"calls":[{"name":"glob"}]}', proof: { check: 'finished' }, at: 3, by: { provider: 'anthropic', model: 'claude' } });
  assert.equal(dropRepeats([a, b, c]).dropped, 1);
  const sets = buildSets([a, b, c]);
  assert.equal(sets.standings.rows, 1);
  assert.equal(sets.harness.rows, 1);
  assert.equal(sets.harness.mayTrain, 0, 'Anthropic\'s text, open-ended set: off');
  assert.equal(chatRow(a).messages.at(-1).content, 'reported');
  const out = trainerRows([a, c], { purpose: 'open' });
  assert.equal(out.train.length + out.valid.length >= 1, true);
  assert.equal(out.left, 1);
});

test('the store keeps each row once, the exam apart from the pool, and writes nothing through a link', () => {
  const root = scratch();
  try {
    const store = openStore(() => root);
    const rows = [makeRow({ kind: 'label', mode: 'content', input: 'one', label: 'x', proof: { check: 'ruling' } }), makeRow({ kind: 'label', mode: 'content', input: 'two', label: 'x', proof: { check: 'ruling' } })];
    rows[0].exam = true;
    rows[1].exam = false;
    assert.deepEqual(store.addRows('content', rows), { kept: 1, exam: 1, repeats: 0 });
    assert.deepEqual(store.addRows('content', rows), { kept: 0, exam: 0, repeats: 2 });
    assert.equal(store.rows().length, 1);
    assert.equal(store.exam().length, 1);
    assert.notEqual(store.rows()[0].id, store.exam()[0].id, 'an exam row is never in the pool');
    const elsewhere = scratch();
    symlinkSync(elsewhere, join(root, 'shelf'));
    assert.throws(() => store.folder('shelf', 'x'), /a link/);
    rmSync(elsewhere, { recursive: true, force: true });
    assert.throws(() => store.addRows('../x', rows), /not a mode name/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the ladder: the lowest rung first; an adapter only with a large enough set; the run in one sentence', () => {
  assert.equal(proposeRung({ failures: [{}, {}], toolErrors: 2 }).rung, 0);
  assert.equal(proposeRung({}).rung, 1);
  assert.equal(proposeRung({ tried: [1], kind: 'pair' }).rung, 2);
  assert.equal(proposeRung({ tried: [1, 2, 3], setRows: 10 }).rung, 3);
  assert.equal(proposeRung({ tried: [1, 2, 3], setRows: ADAPTER_MIN }).rung, 4);
  assert.equal(proposeRung({ tried: [1, 2, 3, 4], setRows: ADAPTER_MIN, kind: 'label', calls: 5000 }).rung, 5);
  assert.match(runSentence({ model: 'small', goal: 'harness', sets: ['harness'], method: '4', minutes: 240, setNames: { harness: 'Harness tool calls' } }), /^Improve small at "Use the harness without mistakes" with adapter, on the Harness tool calls set, for at most 4 hours, and test it on that set's exam rows/);
  assert.match(runSentence({ model: 'small', goal: 'voice', lookOnly: true }), /^Look only:[\s\S]*Nothing is trained\.$/);
});

test('the shelf: promoted only after its exam and the owner\'s yes; switched off in one action; a team uses it only while on and served', () => {
  const shelf = { entries: [newEntry({ id: 'A1', name: 'harness', base: { model: 'small', path: '/m' }, sets: ['harness'], goal: 'harness' })] };
  assert.throws(() => promote(shelf, 'A1', { ownerSaidYes: true }), /not passed its exam/);
  recordExam(shelf, 'A1', { decision: { ok: true, why: 'better' } });
  assert.throws(() => promote(shelf, 'A1', { ownerSaidYes: false }), /your yes/);
  assert.throws(() => setOn(shelf, 'A1', true), /promoted/);
  promote(shelf, 'A1', { ownerSaidYes: true });
  setOn(shelf, 'A1', true);
  assert.equal(routeOf(shelf, 'A1'), undefined, 'not served yet');
  setServing(shelf, 'A1', { way: 'fused', provider: 'local', model: 'small-harness' });
  assert.deepEqual(routeOf(shelf, 'A1'), { provider: 'local', model: 'small-harness' });
  setOn(shelf, 'A1', false);
  assert.equal(routeOf(shelf, 'A1'), undefined, 'switched off: the role keeps its own model');
  assert.deepEqual(rebuildPlan(shelf, 'new-base').map((one) => one.from), ['A1']);
  assert.equal(markDue(shelf, 'a plugin changed'), 1);
  const failed = { entries: [newEntry({ id: 'A2', name: 'x', base: { model: 'm' } })] };
  recordExam(failed, 'A2', { decision: { ok: false, why: 'worse' } });
  assert.equal(failed.entries[0].state, 'failed');
});

test('the night shift: only on power and idle, stops when the Mac is used', () => {
  assert.equal(onPower("Now drawing from 'AC Power'"), true);
  assert.equal(onPower("Now drawing from 'Battery Power'"), false);
  assert.equal(idleSeconds('| |   "HIDIdleTime" = 1200000000000'), 1200);
  assert.equal(mayWork({ on: false, power: true, idle: 9999 }).ok, false);
  assert.equal(mayWork({ on: true, power: false, idle: 9999 }).ok, false);
  assert.equal(mayWork({ on: true, power: true, idle: 60, idleMinutes: 15 }).ok, false);
  assert.equal(mayWork({ on: true, power: true, idle: 3600, idleMinutes: 15 }).ok, true);
  assert.equal(mustStop({ power: true, idle: 10 }), 'the Mac is being used');
  assert.equal(mustStop({ power: false, idle: 9999 }), 'the Mac went on battery');
  assert.equal(mustStop({ power: true, idle: 600 }), '');
});

test('lessons: a call that worked and fits its tool\'s schema, the shortest way first; a schema problem is caught', () => {
  const schema = { type: 'object', properties: { name: { type: 'string', maxLength: 10 }, minutes: { type: 'integer', minimum: 1 } }, required: ['name'], additionalProperties: false };
  assert.equal(schemaProblem(schema, { name: 'a', minutes: 2 }), '');
  assert.match(schemaProblem(schema, { minutes: 2 }), /name is missing/);
  assert.match(schemaProblem(schema, { name: 'a', extra: 1 }), /not a parameter/);
  assert.match(schemaProblem(schema, { name: 'a', minutes: 0 }), /below 1/);
  const long = makeRow({ kind: 'toolcalls', mode: 'code', input: 'a', output: JSON.stringify({ calls: [{ name: 'bench_card', arguments: { name: 'b' } }, { name: 'glob', arguments: {} }, { name: 'read', arguments: {} }] }), proof: { check: 'finished' }, at: 1 });
  const short = makeRow({ kind: 'toolcalls', mode: 'code', input: 'b', output: JSON.stringify({ calls: [{ name: 'bench_card', arguments: { name: 'c' } }] }), proof: { check: 'finished' }, at: 2 });
  const bad = makeRow({ kind: 'toolcalls', mode: 'code', input: 'c', output: JSON.stringify({ calls: [{ name: 'bench_card', arguments: { nope: 1 } }] }), proof: { check: 'finished' }, at: 3 });
  const lessons = lessonsFrom([long, short, bad], { schemaOf: (tool) => (tool === 'bench_card' ? schema : undefined), pluginOf: (tool) => (tool.startsWith('bench_') ? 'dsh-bench' : ''), most: 1 });
  assert.deepEqual(Object.keys(lessons), ['dsh-bench']);
  assert.equal(lessons['dsh-bench'].length, 1);
  assert.match(lessons['dsh-bench'][0].output, /"name":"c"/, 'the shortest way');
});

test('the taste test: names hidden until every pick is made; the picks are preference pairs', () => {
  const round = newRound({ requests: [{ id: '1', text: 'q1', mode: 'chat' }, { id: '2', text: 'q2', mode: 'chat' }], current: ['cur1', 'cur2'], candidate: ['can1', 'can2'], entry: 'A1' });
  const view = roundView(round);
  assert.equal(JSON.stringify(view).includes('"key"'), false);
  assert.equal(view.items[0].candidate, undefined);
  const candidateSide = round.items[0].key;
  recordPick(round, 1, candidateSide);
  recordPick(round, 2, 'same');
  assert.equal(roundView(round).done, true);
  assert.equal(roundView(round).items[0].candidate, candidateSide, 'shown once all are picked');
  assert.deepEqual(tally(round), { candidate: 1, current: 0, same: 1, picked: 2, total: 2, prefers: 'candidate' });
  const pairs = pairsOf(round);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].output, 'can1');
  assert.throws(() => recordPick(round, 1, 'c'), /Pick a, b or same/);
});

test('question-and-answer rows are kept only when a separate run finds the answer in the passage', async () => {
  const passages = [{ text: 'The plant opened in 2019 in Leipzig.', source: 'https://x.example', subject: 's' }, { text: 'Other text', source: 'y', subject: 's' }];
  let asked = 0;
  const result = await qaRows({ passages, ask: async () => { asked += 1; return asked === 1 ? '{"question":"When did the plant open?","answer":"2019"}' : '{"question":"Q","answer":"made up"}'; }, check: async (prompt) => (prompt.includes('2019') ? 'YES' : 'NO') });
  assert.equal(result.rows.length, 1);
  assert.equal(result.dropped, 1);
  assert.equal(result.rows[0].proof.check, 'checked-against-source');
});

test('the trainer: fixed arguments within bounds, a local model folder only (never a download), the base model fingerprinted, progress read', async () => {
  assert.match(pythonProblem(''), /installs nothing|never installs/);
  assert.match(pythonProblem('python'), /full path/);
  assert.match(pythonProblem('/usr/bin/ls'), /end in python/);
  assert.match(modelProblem('mlx-community/SomeModel'), /does not download models/);
  const folder = scratch();
  try {
    assert.match(modelProblem(folder), /no config\.json/);
    writeFileSync(join(folder, 'config.json'), '{}');
    assert.equal(modelProblem(folder), '');
    const before = fingerprint(folder);
    assert.equal(fingerprint(folder), before);
    writeFileSync(join(folder, 'weights.safetensors'), 'x');
    assert.notEqual(fingerprint(folder), before, 'a change to the base model is seen');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
  assert.deepEqual(trainSettings({ iters: 999999, batch: 0, lr: 5 }), { iters: 20000, batch: 1, layers: 16, lr: 1e-3, maxSeq: 2048 });
  const args = trainArgs({ model: '/m', data: '/d', adapter: '/a', settings: {} });
  assert.deepEqual(args.slice(0, 4), ['-m', 'mlx_lm', 'lora', '--model']);
  assert.ok(args.includes('--mask-prompt'));
  assert.deepEqual(progressOf('    20    3.763 ▼    3,552      5.9k'), { iter: 20, loss: 3.763 });
  // A run with a stand-in: offline environment, stopped by its signal.
  const seen = {};
  const fake = (file, list, options) => {
    seen.env = options.env;
    const handlers = {};
    const child = { pid: 4242, stdout: { on: (_e, fn) => { handlers.out = fn; } }, stderr: { on: () => {} }, on: (name, fn) => { handlers[name] = fn; }, kill: () => setTimeout(() => handlers.close?.(null), 5) };
    setTimeout(() => handlers.out?.('    10    2.5 ▼    100      1k\n'), 2);
    return child;
  };
  const abort = new AbortController();
  const lines = [];
  const running = runPython({ python: '/x/python', args: ['-m', 'mlx_lm'], timeoutMs: 60000, signal: abort.signal, onLine: (line) => lines.push(line), spawnFn: fake });
  setTimeout(() => abort.abort(new Error('the Mac is being used')), 20);
  const done = await running;
  assert.equal(done.stopped, 'the Mac is being used');
  assert.equal(seen.env.HF_HUB_OFFLINE, '1');
  assert.equal(lines.length, 1);
});
