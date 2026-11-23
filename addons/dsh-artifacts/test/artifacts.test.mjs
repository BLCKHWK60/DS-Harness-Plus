/**
 * Artifacts: kinds and what changed (lib/kinds.js), the index and its versions (lib/store.js), and the
 * server half on a stand-in app: what a tool made becomes an artifact; Recon's stays with Recon; a Devices
 * backup is listed and never shown; contents go out as plain data; a clean-up goes to the trash and comes
 * back with Put back. Throwaway folders only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { apply, testing } from '../index.js';
import { diffLines, kindOf } from '../lib/kinds.js';
import { openArtifacts } from '../lib/store.js';
import { folder, hit, standIn, write } from './stand-in.mjs';

test('kinds, and what changed between two versions line by line', () => {
  assert.equal(kindOf('/a/report.md'), 'markdown');
  assert.equal(kindOf('/a/page.HTML'), 'html');
  assert.equal(kindOf('/a/data.tsv'), 'csv');
  assert.equal(kindOf('/a/deck.pptx'), 'slides');
  assert.equal(kindOf('/a/app.ts'), 'code');
  assert.equal(kindOf('/a/Makefile'), 'code');
  assert.equal(kindOf('/a/blob.xyz'), 'other');
  const diff = diffLines('a\nb\nc', 'a\nB\nc\nd');
  assert.deepEqual(diff.lines.map((line) => `${line.op}${line.text}`), [' a', '-b', '+B', ' c', '+d']);
  assert.deepEqual([diff.added, diff.removed], [2, 1]);
  assert.match(diffLines('x\n'.repeat(5000), 'y').summary, /Too long/);
});

test('a version each time the content changes, kept in Artifacts\' folder, never beside the file', () => {
  const home = folder();
  const work = folder();
  try {
    let t = 1000;
    const store = openArtifacts({ home, now: () => (t += 1000) });
    const file = join(work, 'notes.md');
    write(file, '# One');
    const first = store.record({ path: file, sessionId: 's1', mode: 'code' });
    assert.deepEqual([first.version, first.isNew], [1, true]);
    write(file, '# Two');
    const second = store.record({ path: file, sessionId: 's1', mode: 'code' });
    assert.equal(second.version, 2);
    assert.equal(store.record({ path: file, sessionId: 's2', mode: 'research' }).isNew, false, 'same content: no new version');
    const item = store.get(second.id);
    assert.equal(item.versions, 2);
    assert.deepEqual(item.sessions, ['s1', 's2']);
    assert.equal(readFileSync(store.versionFile(second.id, 1), 'utf8'), '# One');
    assert.ok(store.versionFile(second.id, 1).startsWith(home), 'kept in Artifacts\' own folder');
    assert.deepEqual(readdirSync(work), ['notes.md'], 'nothing beside the file');
    assert.equal(store.record({ path: join(work, 'nope.md'), sessionId: 's1' }), null);
    assert.equal(store.cardsOf('s1').length, 2);
    assert.equal(store.cardsOf('s1', 0, 2500).length, 1, 'a turn\'s window');
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
});
test('Recon\'s artifacts are never listed; a Devices backup is listed, never kept as a copy; a deleted Scratch thread takes its artifacts along', () => {
  const home = folder();
  const work = folder();
  try {
    const store = openArtifacts({ home, scratchRoot: join(work, 'scratch') });
    write(join(work, 'room', 'found.md'), 'secret findings');
    store.record({ path: join(work, 'room', 'found.md'), sessionId: 'r1', mode: 'recon', sealed: true });
    write(join(work, 'bench', 'devices', 'phone', 'backups', 'wifi.txt'), 'psk=secret');
    const backup = store.record({ path: join(work, 'bench', 'devices', 'phone', 'backups', 'wifi.txt'), sessionId: 'b1', mode: 'bench' });
    write(join(work, 'scratch', 'c1', 'draft.md'), 'draft');
    store.record({ path: join(work, 'scratch', 'c1', 'draft.md'), sessionId: 'c1', mode: 'chat' });
    assert.deepEqual(store.list().map((one) => one.name).sort(), ['draft.md', 'wifi.txt'], 'Recon\'s never listed');
    assert.equal(store.get(backup.id).noRender, true);
    assert.equal(store.versionFile(backup.id, 1), join(work, 'bench', 'devices', 'phone', 'backups', 'wifi.txt'), 'no copy of a backup is kept');
    assert.equal(store.cardsOf('r1')[0].sealed, true);
    // The Scratch thread is deleted (its folder goes to the trash): its artifact leaves the list; deleted for good, it goes.
    rmSync(join(work, 'scratch', 'c1'), { recursive: true, force: true });
    assert.deepEqual(store.list().map((one) => one.name), ['wifi.txt']);
    assert.equal(store.erased(['other']), 0);
    assert.equal(store.erased(['c1']), 1);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
});

test('clean-up by kind, size and age; a kept (starred) one is never picked; the trash gives it all back', () => {
  const home = folder();
  const work = folder();
  try {
    let t = Date.now() - 40 * 86_400_000;
    const store = openArtifacts({ home, now: () => t });
    write(join(work, 'old.md'), 'old');
    const old = store.record({ path: join(work, 'old.md'), sessionId: 's1', mode: 'code' });
    t = Date.now();
    write(join(work, 'new.js'), 'x'.repeat(2000));
    const recent = store.record({ path: join(work, 'new.js'), sessionId: 's1', mode: 'code' });
    write(join(work, 'keep.md'), 'keep');
    const kept = store.record({ path: join(work, 'keep.md'), sessionId: 's1', mode: 'code' });
    store.star(kept.id, true);
    assert.deepEqual(store.matching({ olderThanDays: 30 }), [old.id]);
    assert.deepEqual(store.matching({ newerThanDays: 1, kinds: ['code'] }), [recent.id]);
    assert.deepEqual(store.matching({ minBytes: 1000 }), [recent.id]);
    assert.ok(!store.matching({}).includes(kept.id), 'a starred one is never picked');
    const manifest = store.remove([old.id, kept.id], { alsoFiles: true, trashDir: join(home, 'trash') });
    assert.deepEqual(manifest.moved.map((one) => one.id), [old.id]);
    assert.equal(existsSync(join(work, 'old.md')), false, 'its file went to the trash');
    assert.ok(existsSync(manifest.moved[0].file.to));
    assert.equal(store.get(old.id), null);
    assert.deepEqual(store.putBack(manifest).done, [old.id]);
    assert.equal(readFileSync(join(work, 'old.md'), 'utf8'), 'old');
    assert.equal(store.get(old.id).versions, 1);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
});

test('finding what a tool made: file tools by their arguments, other tools by the paths in their answer, commands by a bounded look', () => {
  const work = folder();
  try {
    const since = Date.now() - 500;
    write(join(work, 'reports', 'heat.md'), 'report');
    write(join(work, 'src', 'a.js'), 'a');
    write(join(work, 'node_modules', 'x', 'big.js'), 'skip');
    assert.deepEqual(testing.writesOf('write', { file_path: 'src/a.js' }, work), [join(work, 'src', 'a.js')]);
    assert.deepEqual(testing.changedIn(`Saved as reports/heat.md and ${join(work, 'src', 'a.js')}. See https://example.org/x.html`, work, since, { roots: [work] }).sort(), [join(work, 'reports', 'heat.md'), join(work, 'src', 'a.js')]);
    assert.deepEqual(testing.changedUnder(work, since).sort(), [join(work, 'reports', 'heat.md'), join(work, 'src', 'a.js')], 'never inside node_modules');
    assert.deepEqual(testing.changedUnder('/', since), [], 'never the whole disk');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('on the stand-in app: what a Code conversation writes becomes a card and a version; Recon\'s shows only inside Recon; contents go out as plain data', async () => {
  const home = folder();
  const work = folder();
  try {
    const { routes, run, opened } = standIn(home, work);
    await run('c1', 'write', { file_path: 'page.html', content: '<script>alert(1)</script>' }, () => write(join(work, 'page.html'), '<script>alert(1)</script>'));
    await run('r1', 'write', { file_path: 'room.md', content: 'x' }, () => write(join(work, 'room.md'), 'found'));
    const cards = (await hit(routes, { query: '?session=c1' })).data.cards;
    assert.deepEqual(cards.map((card) => [card.name, card.kind, card.version]), [['page.html', 'html', 1]]);
    assert.deepEqual((await hit(routes, { query: '?session=r1' })).data.cards.map((card) => card.name), ['room.md'], 'Recon sees its own');
    assert.deepEqual((await hit(routes, {})).data.items.map((one) => one.name), ['page.html'], 'never listed');
    const page = await hit(routes, { query: `?content=${cards[0].id}&v=1&session=c1` });
    assert.equal(page.headers['content-type'], 'application/octet-stream');
    assert.match(page.headers['content-security-policy'], /sandbox/);
    assert.equal(page.headers['x-content-type-options'], 'nosniff');
    const reconId = (await hit(routes, { query: '?session=r1' })).data.cards[0].id;
    assert.match((await hit(routes, { query: `?content=${reconId}&v=1&session=c1` })).data.error, /sealed thread/);
    assert.match((await hit(routes, { method: 'POST', body: { action: 'openApp', id: reconId, session: 'c1' } })).data.error, /sealed/);
    await run('c1', 'write', { file_path: 'notes.md' }, () => write(join(work, 'notes.md'), '# notes'));
    const notes = (await hit(routes, {})).data.items.find((one) => one.name === 'notes.md');
    assert.equal((await hit(routes, { method: 'POST', body: { action: 'openApp', id: notes.id, session: 'c1' } })).status, 200);
    assert.deepEqual(opened, [join(work, 'notes.md')]);
    const out = folder();
    const saved = (await hit(routes, { method: 'POST', body: { action: 'saveTo', id: cards[0].id, session: 'c1', folder: out } })).data;
    assert.equal(readFileSync(saved.where, 'utf8'), '<script>alert(1)</script>');
    assert.match((await hit(routes, { method: 'POST', body: { action: 'saveTo', id: cards[0].id, session: 'c1', folder: out } })).data.error, /nothing was overwritten/);
    rmSync(out, { recursive: true, force: true });
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
});

test('a clean-up on the stand-in app goes to the app\'s trash, and Put back brings it back', async () => {
  const home = folder();
  const work = folder();
  try {
    const { routes, run, trashed, owner } = standIn(home, work);
    await run('c1', 'write', { file_path: 'a.md' }, () => write(join(work, 'a.md'), 'A'));
    const id = (await hit(routes, {})).data.items[0].id;
    const done = (await hit(routes, { method: 'POST', body: { action: 'cleanup', ids: [id], alsoFiles: true } })).data;
    assert.equal(done.moved, 1);
    assert.equal(trashed.length, 1);
    assert.match(trashed[0].title, /^Artifacts clean-up: 1 artifact and their files/);
    assert.equal(existsSync(join(work, 'a.md')), false);
    assert.deepEqual((await hit(routes, {})).data.items, []);
    assert.deepEqual((await owner().putBack({ data: [{ item: 'x', ownerData: trashed[0].data.ownerData }] })).done, ['x']);
    assert.equal(readFileSync(join(work, 'a.md'), 'utf8'), 'A');
    assert.equal((await hit(routes, {})).data.items.length, 1);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
});

test('one artifact and what changed are found also when the asking conversation is named', async () => {
  const home = folder();
  const work = folder();
  try {
    const { routes, run } = standIn(home, work);
    await run('c1', 'write', { file_path: 'n.md' }, () => write(join(work, 'n.md'), 'one'));
    await run('c1', 'write', { file_path: 'n.md' }, () => write(join(work, 'n.md'), 'two'));
    const id = (await hit(routes, {})).data.items[0].id;
    assert.equal((await hit(routes, { query: `?item=${id}&session=c1` })).data.item.versions, 2);
    assert.deepEqual((await hit(routes, { query: `?diff=${id}&a=1&b=2&session=c1` })).data.lines.map((line) => line.op + line.text), ['-one', '+two']);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
});

test('the Danger zone: a Devices backup shown, Recon\'s files outside Recon, web pages opening running; noted', async () => {
  const home = folder();
  const work = folder();
  try {
    const routes = new Map();
    const hooks = {};
    const ctx = {
      get: (name) => (name === 'modes' ? { get: () => 'code', isolated: (id) => id === 'r1' } : name === 'workingDirectory' ? { get: () => work } : undefined),
      on: (name, fn) => { hooks[name] = fn; },
      effect: (fn) => fn(),
      inject(names, fn) { if (!names.includes('coworkTrash')) fn({ effect: (register) => register(), webServer: { register: (route) => routes.set(route.path, route) }, connection: { requestRejection: () => undefined } }); },
      logger: { warn() {} },
    };
    apply(ctx, { enabled: true, dangerShowBackups: true, dangerShowSealed: true, dangerPagesRun: true }, { home, userHome: '/Users/nobody' });
    const run = async (who, path, text) => {
      const exec = { agent: { id: who, session: { header: { id: who } } }, name: 'write', arguments: { file_path: path }, callId: `${who}${Math.random()}` };
      await hooks['tools/pre-execute'](exec, async () => ({ kind: 'allow' }));
      write(join(work, path), text);
      await hooks['tools/post-execute'](exec, { content: [] }, async () => ({ kind: 'accept' }));
    };
    await run('r1', 'found.md', 'secret');
    await run('b1', 'devices/phone/backups/wifi.txt', 'psk=x');
    const list = (await hit(routes, {})).data;
    assert.deepEqual(list.items.map((one) => one.name).sort(), ['found.md', 'wifi.txt']);
    assert.deepEqual(list.danger.map((one) => one.name), ['dangerShowBackups', 'dangerShowSealed', 'dangerPagesRun']);
    const backup = list.items.find((one) => one.name === 'wifi.txt');
    assert.equal((await hit(routes, { query: `?item=${backup.id}` })).data.pageStart, 'run');
    const shown = await hit(routes, { query: `?content=${backup.id}&v=1&session=c1` });
    assert.equal(shown.headers['content-type'], 'application/octet-stream');
    assert.ok(readFileSync(join(home, 'danger.jsonl'), 'utf8').includes('dangerShowBackups'));
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
});

test('B2: a sealed (Recon) artifact keeps no content, and End and wipe leaves nothing under artifacts/', async () => {
  const home = folder();
  const work = folder();
  try {
    const { routes, run, wipeSession } = standIn(home, work);
    // Recon (r1) writes; another conversation writes too.
    await run('r1', 'write', { file_path: 'findings.md', content: 'x' }, () => write(join(work, 'findings.md'), 'secret findings from a page'));
    await run('r1', 'write', { file_path: 'findings.md', content: 'y' }, () => write(join(work, 'findings.md'), 'secret findings, version two'));
    await run('c1', 'write', { file_path: 'notes.md' }, () => write(join(work, 'notes.md'), '# notes'));
    const everything = (dir) => readdirSync(dir, { recursive: true }).map((name) => join(dir, String(name)));
    const holds = (text) => everything(home).some((file) => { try { return readFileSync(file, 'utf8').includes(text); } catch { return false; } });
    assert.equal(holds('secret findings'), false, 'no copy of Recon\'s file content is kept');
    assert.equal(everything(join(home, 'versions')).some((file) => file.endsWith('/1') && readFileSync(file, 'utf8').includes('notes')), true, 'an ordinary conversation\'s versions are still kept');
    assert.equal(holds('findings.md'), true, 'the entry exists until the wipe');
    // End and wipe: Recon puts the conversation on its wipe list.
    wipeSession('r1');
    assert.equal(holds('findings.md'), false, 'nothing of Recon\'s remains in the index');
    assert.equal(holds('"r1"'), false);
    assert.deepEqual((await hit(routes, {})).data.items.map((one) => one.name), ['notes.md'], 'the other conversation\'s artifact stays');
    // What the wiped conversation still does is not recorded.
    await run('r1', 'write', { file_path: 'later.md' }, () => write(join(work, 'later.md'), 'later'));
    assert.equal(holds('later.md'), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
});

test('B2/#4: only versions a Recon conversation made are deleted, one at a time; an ordinary version of the SAME file stays', () => {
  const home = folder();
  const work = folder();
  try {
    const isolated = (id) => id === 'r1';
    const first = openArtifacts({ home });
    const file = join(work, 'a.md');
    write(file, 'recon copy');
    const made = first.record({ path: file, sessionId: 'r1', mode: 'recon', sealed: false });
    write(file, 'ordinary copy from code');
    first.record({ path: file, sessionId: 'c1', mode: 'code', sealed: false });
    write(file, 'a version from nobody known');
    first.record({ path: file, sessionId: 'gone-session', mode: 'chat', sealed: false });
    // The file became Recon's afterwards (as when a Recon conversation touched it again).
    first.record({ path: file, sessionId: 'r1', mode: 'recon', sealed: true });
    const again = openArtifacts({ home, isolated });
    assert.equal(existsSync(join(home, 'versions', made.id, '1')), true, 'opening the index deletes nothing by itself');
    assert.deepEqual(again.purgeReconCopies(), { ran: true, deleted: 1 });
    assert.equal(existsSync(join(home, 'versions', made.id, '1')), false, 'the Recon version is gone');
    assert.equal(readFileSync(join(home, 'versions', made.id, '2'), 'utf8'), 'ordinary copy from code');
    assert.equal(readFileSync(join(home, 'versions', made.id, '3'), 'utf8'), 'a version from nobody known', 'an unknown maker is never deleted');
    const entry = again.get(made.id);
    assert.equal(entry.sealed, true);
    assert.deepEqual(entry.versionList.map((one) => one.stored), [false, true, true]);
    assert.equal(again.forgetSessions(['r1']), 0, 'a file other conversations made too stays');
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
});

test('#4: with Modes silent nothing is deleted, and the clean-up runs once Modes answers', async () => {
  const home = folder();
  const work = folder();
  try {
    const first = openArtifacts({ home });
    const file = join(work, 'a.md');
    write(file, 'x');
    const made = first.record({ path: file, sessionId: 'r1', mode: 'recon', sealed: false });
    first.record({ path: file, sessionId: 'r1', mode: 'recon', sealed: true });
    let silent = true;
    const store = openArtifacts({ home, isolated: (id) => (silent ? undefined : id === 'r1') });
    assert.deepEqual(store.purgeReconCopies(), { ran: false, deleted: 0 });
    assert.equal(existsSync(join(home, 'versions', made.id, '1')), true);
    const throwing = openArtifacts({ home, isolated: () => { throw new Error('modes is down'); } });
    assert.equal(throwing.purgeReconCopies().ran, false);
    assert.equal(existsSync(join(home, 'versions', made.id, '1')), true);
    // Through the add-on: Modes off at start keeps everything; Modes back (timer) clears only Recon's copy.
    silent = false;
    assert.equal(store.purgeReconCopies().deleted, 1);
    // The add-on itself, with Modes off.
    const home2 = folder();
    try {
      const seed = openArtifacts({ home: home2 });
      write(file, 'y');
      const m2 = seed.record({ path: file, sessionId: 'r1', mode: 'recon', sealed: false });
      seed.record({ path: file, sessionId: 'r1', mode: 'recon', sealed: true });
      const off = standIn(home2, work, { modes: false });
      await off.forget?.();
      assert.equal(existsSync(join(home2, 'versions', m2.id, '1')), true, 'Modes not answering: nothing deleted');
    } finally {
      rmSync(home2, { recursive: true, force: true });
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
});

test('#4: with Modes answering, the add-on clears only Recon\'s old copy at start', () => {
  const home = folder();
  const work = folder();
  try {
    const seed = openArtifacts({ home });
    const file = join(work, 'a.md');
    write(file, 'recon');
    const made = seed.record({ path: file, sessionId: 'r1', mode: 'recon', sealed: false });
    write(file, 'ordinary');
    seed.record({ path: file, sessionId: 'c1', mode: 'code', sealed: false });
    seed.record({ path: file, sessionId: 'r1', mode: 'recon', sealed: true });
    standIn(home, work);
    assert.equal(existsSync(join(home, 'versions', made.id, '1')), false);
    assert.equal(readFileSync(join(home, 'versions', made.id, '2'), 'utf8'), 'ordinary');
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
});

test('#4: hostile names in the index never reach outside Artifacts\' folder', () => {
  const root = folder();
  const home = join(root, 'artifacts');
  const outside = join(root, 'precious');
  try {
    mkdirSync(join(home, 'versions'), { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'keep.txt'), 'precious');
    writeFileSync(join(root, 'keep2.txt'), 'precious too');
    const good = 'aaaaaaaaaaaaaaaa';
    mkdirSync(join(home, 'versions', good), { recursive: true });
    const hostile = (id, extra = {}) => ({ id, path: '/tmp/x.md', kind: 'text', sealed: true, firstAt: 1, lastAt: 1, sessions: ['r1'], versions: [{ n: 1, at: 1, size: 1, hash: 'h', sessionId: 'r1', mode: 'recon', stored: true }], ...extra });
    const artifacts = { '../../precious': hostile('../../precious'), '..': hostile('..'), '/': hostile('/'), 'bbbbbbbbbbbbbbbb': hostile('bbbbbbbbbbbbbbbb', { versions: [{ n: '../../keep2.txt', at: 1, size: 1, hash: 'h', sessionId: 'r1', mode: 'recon', stored: true }, { n: -1, sessionId: 'r1', stored: true }] }) };
    artifacts[good] = hostile(good, { scratch: true, sessions: ['r1'] });
    writeFileSync(join(home, 'index.json'), JSON.stringify({ artifacts }));
    const store = openArtifacts({ home, isolated: () => true });
    assert.match(store.notice(), /kept untouched/);
    store.purgeReconCopies();
    store.forgetSessions(['r1']);
    store.erased(['r1']);
    store.remove(['../../precious', '..'], { trashDir: join(home, 'trash') });
    store.putBack({ moved: [{ id: '../../precious', entry: hostile('../../precious'), versionsTo: outside }] });
    assert.equal(readFileSync(join(outside, 'keep.txt'), 'utf8'), 'precious');
    assert.equal(readFileSync(join(root, 'keep2.txt'), 'utf8'), 'precious too');
    assert.equal(existsSync(join(home, 'versions')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('#4: a damaged index is kept aside untouched, a new one starts, the versions stay and the owner is told', () => {
  const home = folder();
  try {
    mkdirSync(join(home, 'versions', 'aaaaaaaaaaaaaaaa'), { recursive: true });
    writeFileSync(join(home, 'versions', 'aaaaaaaaaaaaaaaa', '1'), 'kept version');
    const broken = '{"artifacts": {"aaaaaaaaaaaaaaaa": {"id": "aaa';
    writeFileSync(join(home, 'index.json'), broken);
    const store = openArtifacts({ home });
    assert.match(store.notice(), /could not be read/);
    assert.match(store.notice(), /kept untouched as index\.damaged-/);
    const aside = readdirSync(home).filter((name) => name.startsWith('index.damaged-'));
    assert.equal(aside.length, 1);
    assert.equal(readFileSync(join(home, aside[0]), 'utf8'), broken);
    const work = folder();
    try {
      write(join(work, 'n.md'), 'new');
      store.record({ path: join(work, 'n.md'), sessionId: 'c1' });
      assert.equal(readFileSync(join(home, aside[0]), 'utf8'), broken, 'saving later never touches the kept copy');
      assert.equal(readFileSync(join(home, 'versions', 'aaaaaaaaaaaaaaaa', '1'), 'utf8'), 'kept version');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
    assert.equal(openArtifacts({ home }).notice(), '', 'a healthy index says nothing');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
