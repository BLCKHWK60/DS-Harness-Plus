// Item 4A, stage 6a: a sealed thread (Recon, any mode) keeps chart files only in Recon's room and saves no analysis.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { build, fileTables, resultText, runQuery } from '../lib/db.js';
import { openStore } from '../lib/store.js';
import { SEALED_TEXT, buildTools } from '../lib/tools.js';

const folder = () => realpathSync(mkdtempSync(join(tmpdir(), 'dsh-data-space-')));
const engine = {
  async run(job) {
    const tables = [];
    for (const file of job.files) tables.push(...(await fileTables(file.path, file.name)).map((table) => ({ ...table, file: file.shown })));
    const result = runQuery(build(DatabaseSync, tables), job.sql, job.limit);
    return { tables: tables.map((table) => ({ name: table.name, file: table.file, rows: table.rows.length })), result, text: resultText(result) };
  },
};
const sql = 'SELECT month, revenue FROM sales ORDER BY month';

function tools({ dir, sealed, room, store = openStore('', '') }) {
  return Object.fromEntries(buildTools({
    enabled: () => true, rootOf: () => dir, conversationOf: () => 'c1', engine, store,
    show: () => ({ ok: true, outline: 'Bar chart.' }), svgOf: () => '<svg/>', saves: () => true,
    sealed: () => sealed, runFolderOf: () => room ?? '',
  }).map((tool) => [tool.name, tool]));
}

test('data-chart-room-only: sealed outside the room is shown, not saved, and says so', async () => {
  const dir = folder();
  writeFileSync(join(dir, 'sales.csv'), 'month,revenue\n2026-01,100\n2026-02,120\n');
  const out = await tools({ dir, sealed: true, room: '' }).data_chart.execute({ files: ['sales.csv'], sql, title: 'Monthly' }, {});
  assert.match(out.text, /It is shown to the user in the thread, under your answer\. Not saved: this Recon thread has no run folder in Recon's room\./);
  assert.equal(existsSync(join(dir, 'data-output')), false);
});

test('data-chart-room-only: sealed saves only in its run folder, never the room root; a thread that is not sealed saves as before', async () => {
  const room = folder();
  writeFileSync(join(room, 'sales.csv'), 'month,revenue\n2026-01,100\n2026-02,120\n');
  const run = join(room, 'run-c1');
  const inRoom = await tools({ dir: room, sealed: true, room: run }).data_chart.execute({ files: ['sales.csv'], sql, title: 'Monthly' }, {});
  assert.match(inRoom.text, /It is also saved as .*run-c1\/data-output\//);
  assert.equal(readdirSync(join(run, 'data-output')).length, 1);
  assert.equal(existsSync(join(room, 'data-output')), false, 'nothing in the room root');
  const throws = Object.fromEntries(buildTools({
    enabled: () => true, rootOf: () => room, conversationOf: () => 'c1', engine, store: openStore('', ''),
    show: () => ({ ok: true, outline: 'Bar chart.' }), svgOf: () => '<svg/>', saves: () => true,
    sealed: () => true, runFolderOf: () => { throw new Error('old recon'); },
  }).map((tool) => [tool.name, tool]));
  assert.match((await throws.data_chart.execute({ files: ['sales.csv'], sql, title: 'Monthly' }, {})).text, /Not saved: this Recon thread has no run folder/);
  const chat = folder();
  writeFileSync(join(chat, 'sales.csv'), 'month,revenue\n2026-01,100\n2026-02,120\n');
  const plain = await tools({ dir: chat, sealed: false, room: '' }).data_chart.execute({ files: ['sales.csv'], sql, title: 'Monthly' }, {});
  assert.match(plain.text, /It is also saved as data-output\//);
});

test('save-analysis-refused: data_save_analysis and data_rerun_analysis refuse in a sealed thread', async () => {
  const dir = folder();
  writeFileSync(join(dir, 'sales.csv'), 'month,revenue\n2026-01,100\n');
  const store = openStore('', '');
  const open = tools({ dir, sealed: false, room: '', store });
  await open.data_query.execute({ files: ['sales.csv'], sql }, {});
  assert.match((await open.data_save_analysis.execute({ name: 'Monthly', queries: ['Q1'] }, {})).text, /^Saved "Monthly"/);
  const sealed = tools({ dir, sealed: true, room: dir, store });
  assert.equal((await sealed.data_save_analysis.execute({ name: 'Other', queries: ['Q1'] }, {})).text, SEALED_TEXT.analysis.en);
  assert.equal((await sealed.data_rerun_analysis.execute({ name: 'Monthly' }, {})).text, SEALED_TEXT.analysis.en);
  assert.equal(store.analyses().length, 1);
  assert.deepEqual(Object.keys(SEALED_TEXT.analysis), ['en'], 'English only (owner decision 28)');
  assert.deepEqual(Object.keys(SEALED_TEXT.notInRoom), ['en']);
});

test('a sealed check that throws counts as sealed (fail closed)', async () => {
  const dir = folder();
  const list = buildTools({ enabled: () => true, rootOf: () => dir, conversationOf: () => 'c1', engine, store: openStore('', ''), sealed: () => { throw new Error('x'); } });
  const save = list.find((tool) => tool.name === 'data_save_analysis');
  assert.equal((await save.execute({ name: 'Monthly', queries: ['Q1'] }, {})).text, SEALED_TEXT.analysis.en);
});

test('sealed-query-log: a sealed data_query and data_chart leave queries.json byte-identical; the Q id still works in the thread', async () => {
  const { readFileSync } = await import('node:fs');
  const dir = folder();
  writeFileSync(join(dir, 'leak.csv'), 'name,score\nalpha,1\n');
  const file = join(folder(), 'queries.json');
  const store = openStore(file, '');
  store.record('other', { sql: 'SELECT 1', files: [], total: 1 });
  const before = readFileSync(file);
  const sealedStore = openStore('', '');
  const list = Object.fromEntries(buildTools({
    enabled: () => true, rootOf: () => dir, conversationOf: () => 'c1', engine, store, sealedStore,
    show: () => ({ ok: true, outline: 'Bar chart.' }), svgOf: () => '<svg/>', saves: () => true,
    sealed: () => true, runFolderOf: () => '',
  }).map((tool) => [tool.name, tool]));
  const secret = "SELECT * FROM leak WHERE name='alpha'";
  assert.match((await list.data_query.execute({ files: ['leak.csv'], sql: secret }, {})).text, /^Query Q1 /);
  assert.match((await list.data_chart.execute({ files: ['leak.csv'], sql: 'SELECT name, score FROM leak', title: 'Scores' }, {})).text, /Q2/);
  assert.deepEqual(readFileSync(file), before, 'nothing of the sealed thread lands on disk');
  assert.equal(store.queries('c1').length, 0);
  assert.equal(sealedStore.query('c1', 'q1').sql.includes('alpha'), true, 'the Q id resolves within the thread');
});

test('sealed-query-log: End and wipe forgets a conversation in memory and on disk (list at start, then each change)', async () => {
  const { readFileSync } = await import('node:fs');
  const { apply } = await import('../index.js');
  const home = folder();
  const work = folder();
  writeFileSync(join(work, 'leak.csv'), 'name,score\nalpha,1\n');
  // Left by a version before this fix: on disk for a conversation already on the wipe list.
  const { mkdirSync } = await import('node:fs');
  mkdirSync(join(home, 'data'), { recursive: true });
  writeFileSync(join(home, 'data', 'queries.json'), JSON.stringify({ 'session-old': { next: 2, list: [{ id: 'Q1', sql: 'SELECT secret', files: ['leak.csv'], rows: 1, at: 1 }] } }));
  const wipeListeners = [];
  const disposers = [];
  const registered = [];
  const services = {
    dshHomePath: (...parts) => join(home, ...parts),
    tools: { register: (tool) => { registered.push(tool); return () => {}; } },
    settings: { describe: () => [{ ns: 'modes', value: { extraModes: '{}', defaultMode: 'cowork' } }], mutate: async () => {} },
    modes: { guardOf: (id) => ({ sealed: id === 'session-recon' }), get: () => 'data', isolated: () => false },
    agents: { get: () => undefined, list: () => [] },
  };
  const reconWipe = { list: () => ['session-old'], has: () => false, onChange: (fn) => { wipeListeners.push(fn); return () => {}; } };
  const ctx = {
    get: (name) => services[name], effect: (make) => { const dispose = make(); disposers.push(dispose); return dispose; }, on: () => {},
    inject: (deps, fn) => { if (deps.includes('reconWipe')) fn({ effect: (make) => make(), reconWipe }); },
    logger: { warn() {}, info() {} },
  };
  try {
    apply(ctx, { enabled: true, pythonSetup: false });
    await new Promise((resolve) => setImmediate(resolve));
    const saved = () => JSON.parse(readFileSync(join(home, 'data', 'queries.json'), 'utf8'));
    assert.equal(saved()['session-old'], undefined, 'swept at start');
    const query = registered.find((tool) => tool.name === 'data_query');
    const exec = { agent: { id: 'session-recon', header: { id: 'session-recon', cwd: work } } };
    assert.match((await query.execute({ files: ['leak.csv'], sql: "SELECT * FROM leak WHERE name='alpha'" }, exec)).text, /^Query Q1 /);
    assert.equal(saved()['session-recon'], undefined);
    assert.equal(wipeListeners.length, 1);
    wipeListeners[0]('session-recon');
    // Forgotten in memory: numbering starts again at Q1.
    assert.match((await query.execute({ files: ['leak.csv'], sql: 'SELECT * FROM leak' }, exec)).text, /^Query Q1 /);
  } finally {
    for (const dispose of disposers) if (typeof dispose === 'function') dispose();
  }
});

test('data-python-room-only: a sealed thread writes only into its run folder; no run folder refuses without running', async () => {
  const room = folder();
  const run = join(room, 'run-c1');
  const jobs = [];
  const python = {
    async execute(job) {
      jobs.push(job);
      const { mkdirSync } = await import('node:fs');
      mkdirSync(job.outDir, { recursive: true });
      writeFileSync(join(job.outDir, 'out.csv'), 'a\n1\n');
      return { ok: true, seconds: 1, output: 'done', files: [{ name: 'out.csv', path: join(job.outDir, 'out.csv'), size: 4, picture: false }] };
    },
  };
  const make = (sealed, runFolderOf) => Object.fromEntries(buildTools({
    enabled: () => true, rootOf: () => room, conversationOf: () => 'c1', engine, store: openStore('', ''), python,
    show: () => ({ ok: true }), sealed: () => sealed, runFolderOf,
  }).map((tool) => [tool.name, tool]));
  const inRun = await make(true, () => run).data_python.execute({ code: 'print(1)' }, {});
  assert.equal(jobs[0].outDir, join(run, 'data-output'));
  assert.equal(jobs[0].dataDir, room, 'it still reads the thread\'s folder');
  assert.match(inRun.text, new RegExp(`- ${join(run, 'data-output', 'out.csv').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, 4 bytes`));
  assert.equal(existsSync(join(room, 'data-output')), false, 'nothing in the room root');
  assert.equal((await make(true, () => '').data_python.execute({ code: 'print(1)' }, {})).text, SEALED_TEXT.notInRoom.en);
  assert.equal((await make(true, () => { throw new Error('old recon'); }).data_python.execute({ code: 'print(1)' }, {})).text, SEALED_TEXT.notInRoom.en);
  assert.equal(jobs.length, 1, 'refused runs never start the program');
  const chat = folder();
  const plain = Object.fromEntries(buildTools({ enabled: () => true, rootOf: () => chat, conversationOf: () => 'c1', engine, store: openStore('', ''), python, sealed: () => false }).map((tool) => [tool.name, tool]));
  assert.match((await plain.data_python.execute({ code: 'print(1)' }, {})).text, /- data-output\/out\.csv, 4 bytes/);
  assert.equal(jobs[1].outDir, join(chat, 'data-output'), 'a thread that is not sealed writes as before');
});
