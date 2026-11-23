// Item 4A, stage 6a: Scout in a sealed thread (Recon, any mode): reports only in the room, no profile, no Scout
// folder, and the thread's postings kept in memory only.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { splitStore } from '../index.js';
import { openFolder, openProfile } from '../lib/private.js';
import { readRegistry } from '../lib/registry.js';
import { readSelection } from '../lib/selection.js';
import { openStore } from '../lib/store.js';
import { SEALED_TEXT, buildTools } from '../lib/tools.js';

const gate = () => ({ files: { ok: true, why: '' }, profile: { ok: true, why: '' } });
const MARKDOWN = '## Understanding\nA run in Germany for data engineering work.';
const ROW = { rank: 1, title: 'Data Engineer', fit: 4, fit_reason: 'matches the skills', freshness: 4, freshness_reason: 'recent', pay_score: 3, pay_reason: 'no pay given', legitimacy: 5, legitimacy_reason: 'public job exchange' };

function setup({ sealed, room }) {
  const dir = mkdtempSync(join(tmpdir(), 'scout-space-'));
  const folder = openFolder(join(dir, 'files'), { convert: async () => '' });
  folder.save('cv.txt', Buffer.from('Jane Example, data engineer').toString('base64'));
  const profile = openProfile(join(dir, 'profile.md'));
  profile.save('Titles: data engineer\nYears: 9');
  const tools = Object.fromEntries(buildTools({
    enabled: () => true, registry: () => readRegistry('{}', '[]'), selection: () => readSelection({ markets: ['Germany'] }),
    keyOf: async () => '', hasKey: () => false, store: openStore(), folder, profile, gate, idOf: () => 'r1',
    sealed: () => sealed, roomOf: () => room(dir),
  }).map((tool) => [tool.name, tool]));
  const run = async (name, args) => (await tools[name].execute(args, { agent: { id: 'r1' } })).text;
  return { dir, run, profile };
}

test('scout-report-in-room: a sealed thread saves into its room folder and says so; the Scout folder gets nothing', async () => {
  const { dir, run } = setup({ sealed: true, room: (d) => join(d, 'room', 'run-r1') });
  try {
    mkdirSync(join(dir, 'room', 'run-r1'), { recursive: true });
    const saved = await run('scout_report', { title: 'Data engineer Germany', markdown: MARKDOWN, opportunities: [ROW] });
    assert.match(saved, /room\/run-r1\/reports\/.*data-engineer-germany\.md/);
    assert.ok(saved.endsWith(SEALED_TEXT.saved.en));
    assert.equal(existsSync(join(dir, 'files', 'reports')), false);
    // scout_reports reads the room only.
    assert.match(await run('scout_reports', {}), /1 saved report/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scout-report-in-room: a sealed thread outside the room saves nothing and says so', async () => {
  const { dir, run } = setup({ sealed: true, room: () => '' });
  try {
    assert.equal(await run('scout_report', { title: 'Data engineer Germany', markdown: MARKDOWN, opportunities: [ROW] }), SEALED_TEXT.notSaved.en);
    assert.equal(existsSync(join(dir, 'files', 'reports')), false);
    assert.match(await run('scout_reports', {}), /no saved reports yet/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scout-profile-refused and scout-files-refused-sealed: neither read nor written from Recon', async () => {
  const { dir, run, profile } = setup({ sealed: true, room: () => '' });
  try {
    assert.equal(await run('scout_profile', {}), SEALED_TEXT.profile.en);
    assert.equal(await run('scout_profile', { save: 'Titles: spy' }), SEALED_TEXT.profile.en);
    assert.match(profile.read(), /Years: 9/);
    assert.equal(await run('scout_files', {}), SEALED_TEXT.files.en);
    assert.equal(await run('scout_files', { name: 'cv.txt' }), SEALED_TEXT.files.en);
    for (const key of ['saved', 'notSaved', 'profile', 'files']) assert.ok(SEALED_TEXT[key].en && !('zh' in SEALED_TEXT[key]), `${key}: English only`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a thread that is not sealed keeps today\'s Scout folder, files and profile', async () => {
  const { dir, run } = setup({ sealed: false, room: () => '' });
  try {
    assert.match(await run('scout_profile', {}), /Years: 9/);
    assert.match(await run('scout_files', {}), /cv\.txt/);
    assert.match(await run('scout_report', { title: 'Data engineer Germany', markdown: MARKDOWN, opportunities: [ROW] }), /files\/reports\/.*\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scout-store-memory-sealed: no <hash>.json written or read for a sealed thread', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scout-store-'));
  try {
    const folder = join(dir, 'postings');
    const disk = openStore(folder);
    // A record on disk for the sealed id (as if written before): never read for it.
    disk.add('r1', 'ba', [{ title: 'Old job', company: 'X', url: 'https://x.example/1' }]);
    const before = readdirSync(folder).length;
    const fresh = openStore(folder);
    const store = splitStore(fresh, openStore(''), (id) => id === 'r1');
    assert.equal(store.count('r1'), 0);
    store.add('r1', 'ba', [{ title: 'Data Engineer', company: 'Y', url: 'https://y.example/2' }]);
    store.request('r1');
    store.saved('r1', 'report-a');
    assert.equal(store.count('r1'), 1);
    assert.equal(readdirSync(folder).length, before);
    assert.equal(store.fileOf('r1'), '');
    // A chat thread still keeps its file.
    store.add('c1', 'ba', [{ title: 'Data Engineer', company: 'Y', url: 'https://y.example/2' }]);
    assert.equal(readdirSync(folder).length, before + 1);
    // A guard that throws counts as sealed.
    const broken = splitStore(openStore(folder), openStore(''), () => { throw new Error('x'); });
    assert.equal(broken.count('r1'), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
