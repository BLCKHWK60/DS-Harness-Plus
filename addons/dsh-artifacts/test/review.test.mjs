/**
 * Artifacts, the security review's findings (server half): each test fails without its fix. Stand-ins and
 * throwaway folders only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, truncateSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { testing } from '../index.js';
import { openArtifacts } from '../lib/store.js';
import { folder, hit, standIn, write } from './stand-in.mjs';

const cleanUp = (...folders) => { for (const one of folders) rmSync(one, { recursive: true, force: true }); };
const itemNamed = async (routes, name, query = '') => (await hit(routes, { query })).data.items.find((one) => one.name === name);

test('1: tidying the trash folder keeps every clean-up the trash still holds, does nothing while the trash is not up, and lets go of what the trash erased', async () => {
  const home = folder();
  const work = folder();
  try {
    const app = standIn(home, work);
    await app.run('c1', 'write', { file_path: 'a.md' }, () => write(join(work, 'a.md'), 'A'));
    const id = (await itemNamed(app.routes, 'a.md')).id;
    assert.equal((await hit(app.routes, { method: 'POST', body: { action: 'cleanup', ids: [id], alsoFiles: true } })).data.moved, 1);
    const stamp = app.trashed[0].data.ownerData.stamp;
    const room = join(home, 'trash', stamp);
    app.tidy();
    assert.ok(existsSync(room), 'the trash still holds it: kept');
    // The trash not up yet (it lists nothing then): nothing is taken for erased.
    app.trash.ready = false;
    app.tidy();
    assert.ok(existsSync(room), 'kept while the trash is not up');
    app.trash.ready = true;
    // Put back still works after the tidies.
    assert.deepEqual((await app.owner().putBack({ data: [{ item: 'p', ownerData: { stamp } }] })).done, ['p']);
    assert.equal(readFileSync(join(work, 'a.md'), 'utf8'), 'A');
    // Cleaned up again, then erased for good by the trash (its row goes): the folder goes too.
    await hit(app.routes, { method: 'POST', body: { action: 'cleanup', ids: [id], alsoFiles: true } });
    const second = app.trashed[1].data.ownerData.stamp;
    app.rows.length = 0;
    app.tidy();
    assert.equal(existsSync(join(home, 'trash', second)), false, 'erased by the trash: gone from the folder');
  } finally {
    cleanUp(home, work);
  }
});

test('15: a clean-up on its way to the trash is never tidied away; one cut short (the trash never took it) is put back', async () => {
  const home = folder();
  const work = folder();
  try {
    const app = standIn(home, work);
    await app.run('c1', 'write', { file_path: 'b.md' }, () => write(join(work, 'b.md'), 'B'));
    const id = (await itemNamed(app.routes, 'b.md')).id;
    let release;
    app.trash.gate = new Promise((done) => { release = done; });
    const asked = hit(app.routes, { method: 'POST', body: { action: 'cleanup', ids: [id], alsoFiles: true } });
    await new Promise((done) => setTimeout(done, 20));
    const [stamp] = readdirSync(join(home, 'trash'));
    app.tidy();
    assert.ok(existsSync(join(home, 'trash', stamp, 'files')), 'on its way: kept');
    release();
    assert.equal((await asked).data.moved, 1);
    assert.equal(existsSync(join(work, 'b.md')), false);
    // A clean-up cut short: moved, written down, never taken by the trash (the app closed meanwhile).
    const store = openArtifacts({ home });
    write(join(work, 'c.md'), 'C');
    const c = store.record({ path: join(work, 'c.md'), sessionId: 'c1' });
    store.remove([c.id], { alsoFiles: true, trashDir: join(home, 'trash') });
    const app2 = standIn(home, work);
    app2.tidy();
    assert.equal(readFileSync(join(work, 'c.md'), 'utf8'), 'C', 'put back, never erased');
  } finally {
    cleanUp(home, work);
  }
});

test('2: Put back of an artifact made again since the clean-up brings its file back beside the new one and its older versions back in front', async () => {
  const home = folder();
  const work = folder();
  try {
    const app = standIn(home, work);
    await app.run('c1', 'write', { file_path: 'n.md' }, () => write(join(work, 'n.md'), 'old one'));
    await app.run('c1', 'write', { file_path: 'n.md' }, () => write(join(work, 'n.md'), 'old two'));
    const id = (await itemNamed(app.routes, 'n.md')).id;
    await hit(app.routes, { method: 'POST', body: { action: 'cleanup', ids: [id], alsoFiles: true } });
    // Made again at the same place.
    await app.run('c1', 'write', { file_path: 'n.md' }, () => write(join(work, 'n.md'), 'new'));
    const answer = await app.owner().putBack({ data: [{ item: 'p', ownerData: app.trashed[0].data.ownerData }] });
    assert.deepEqual(answer.done, ['p']);
    assert.equal(readFileSync(join(work, 'n.md'), 'utf8'), 'new', 'the new file is never overwritten');
    assert.equal(readFileSync(join(work, 'n (restored).md'), 'utf8'), 'old two', 'the one from the trash is back beside it');
    assert.match(answer.notes.join(' '), /n \(restored\)\.md/);
    const item = (await hit(app.routes, { query: `?item=${id}&session=c1` })).data.item;
    assert.equal(item.versions, 3, 'older versions back in front of the new one');
    const read = async (n) => (await hit(app.routes, { query: `?content=${id}&v=${n}&session=c1` })).text;
    assert.deepEqual([await read(1), await read(2), await read(3)], ['old one', 'old two', 'new']);
  } finally {
    cleanUp(home, work);
  }
});

test('3: a clean-up that fails half-way puts back what it had moved and refuses', () => {
  const home = folder();
  const work = folder();
  const locked = join(work, 'locked');
  try {
    const store = openArtifacts({ home });
    write(join(work, 'free.md'), 'free');
    write(join(locked, 'stuck.md'), 'stuck');
    const free = store.record({ path: join(work, 'free.md'), sessionId: 's1' });
    const stuck = store.record({ path: join(locked, 'stuck.md'), sessionId: 's1' });
    chmodSync(locked, 0o555); // its file cannot be moved out
    assert.throws(() => store.remove([free.id, stuck.id], { alsoFiles: true, trashDir: join(home, 'trash') }));
    assert.equal(readFileSync(join(work, 'free.md'), 'utf8'), 'free', 'the file moved first is back');
    assert.ok(store.get(free.id) && store.get(stuck.id), 'both still listed');
    assert.equal(readFileSync(store.versionFile(free.id, 1), 'utf8'), 'free', 'its kept version is back');
    assert.deepEqual(readdirSync(join(home, 'trash')).filter((name) => !name.startsWith('.')), [], 'nothing left in the trash folder');
    // And after a restart, too: the index on disk has both.
    assert.ok(openArtifacts({ home }).get(free.id));
  } finally {
    chmodSync(locked, 0o755);
    cleanUp(home, work);
  }
});

test('4: Open in its app only for documents, pictures and media; never a page, a script, a link file or a program; Show in Finder for any', async () => {
  const home = folder();
  const work = folder();
  try {
    const app = standIn(home, work);
    const make = async (name, text, mode) => {
      await app.run('c1', 'write', { file_path: name }, () => { write(join(work, name), text); if (mode) chmodSync(join(work, name), mode); });
      return (await itemNamed(app.routes, name)).id;
    };
    const tries = { 'page.html': '<p>x</p>', 'run.sh': 'echo', 'go.command': 'echo', 'site.webloc': '<plist/>', 'pic.svg': '<svg/>', 'Makefile': 'all:', 'macro.docm': 'x' };
    for (const [name, text] of Object.entries(tries)) {
      const id = await make(name, text);
      assert.match((await hit(app.routes, { method: 'POST', body: { action: 'openApp', id, session: 'c1' } })).data.error, /not opened from here/, name);
    }
    const marked = await make('notes.md', '# x', 0o755);
    assert.match((await hit(app.routes, { method: 'POST', body: { action: 'openApp', id: marked, session: 'c1' } })).data.error, /marked as a program/);
    assert.deepEqual(app.opened, [], 'nothing was opened');
    const report = await make('report.md', '# report');
    assert.equal((await hit(app.routes, { method: 'POST', body: { action: 'openApp', id: report, session: 'c1' } })).status, 200);
    const page = (await itemNamed(app.routes, 'page.html')).id;
    assert.equal((await hit(app.routes, { method: 'POST', body: { action: 'reveal', id: page, session: 'c1' } })).status, 200);
    assert.deepEqual([app.opened, app.revealed], [[join(work, 'report.md')], [join(work, 'page.html')]]);
  } finally {
    cleanUp(home, work);
  }
});

test('7: Recon\'s files are sealed by where they lie (any capitals, through links), a command\'s look never goes into Recon\'s room, and without Modes everything is sealed', async () => {
  const home = folder();
  const home2 = folder();
  const work = folder();
  try {
    const store = openArtifacts({ home });
    write(join(work, 'DSH-Recon-Room', 'found.md'), 'secret');
    store.record({ path: join(work, 'DSH-Recon-Room', 'found.md'), sessionId: 'c1' });
    mkdirSync(join(work, 'dsh-recon-x'), { recursive: true });
    symlinkSync(join(work, 'dsh-recon-x'), join(work, 'innocent'));
    write(join(work, 'innocent', 'leak.md'), 'secret too');
    store.record({ path: join(work, 'innocent', 'leak.md'), sessionId: 'c1' });
    assert.deepEqual(store.list(), [], 'neither is listed');
    const since = Date.now() - 500;
    write(join(work, 'dsh-recon-room', 'deep.md'), 'x');
    write(join(work, 'mine.md'), 'mine');
    assert.deepEqual(testing.changedUnder(work, since), [join(work, 'mine.md')], 'never into Recon\'s room');
    // Modes off: nobody can tell a Recon conversation, so what is made is sealed.
    const app = standIn(home2, work, { modes: false });
    await app.run('x1', 'write', { file_path: 'mine.md' }, () => write(join(work, 'mine.md'), 'changed'));
    assert.deepEqual((await hit(app.routes, {})).data.items, []);
  } finally {
    cleanUp(home, home2, work);
  }
});

test('8: inside Recon, its own file is shown but never saved out, opened in another app or shown in Finder', async () => {
  const home = folder();
  const work = folder();
  const out = folder();
  try {
    const app = standIn(home, work);
    await app.run('r1', 'write', { file_path: 'notes.md' }, () => write(join(work, 'notes.md'), 'found'));
    const id = (await hit(app.routes, { query: '?session=r1' })).data.cards[0].id;
    assert.equal((await hit(app.routes, { query: `?content=${id}&v=1&session=r1` })).text, 'found', 'shown inside Recon');
    for (const body of [{ action: 'saveTo', folder: out }, { action: 'openApp' }, { action: 'reveal' }]) {
      assert.match((await hit(app.routes, { method: 'POST', body: { ...body, id, session: 'r1' } })).data.error, /Export… button/, body.action);
    }
    assert.deepEqual([readdirSync(out), app.opened, app.revealed], [[], [], []]);
  } finally {
    cleanUp(home, work, out);
  }
});

test('9: Save to folder never writes into Recon\'s room, whatever the capitals and through links, and makes no folder there', async () => {
  const home = folder();
  const work = folder();
  const out = folder();
  try {
    const app = standIn(home, work);
    await app.run('c1', 'write', { file_path: 'r.md' }, () => write(join(work, 'r.md'), 'r'));
    const id = (await itemNamed(app.routes, 'r.md')).id;
    const save = async (target) => (await hit(app.routes, { method: 'POST', body: { action: 'saveTo', id, session: 'c1', folder: target } })).data;
    assert.match((await save(join(out, 'DSH-RECON-room'))).error, /Recon's room/);
    mkdirSync(join(out, 'dsh-recon-real'));
    symlinkSync(join(out, 'dsh-recon-real'), join(out, 'plain'));
    assert.match((await save(join(out, 'plain', 'sub'))).error, /Recon's room/);
    assert.deepEqual(readdirSync(join(out, 'dsh-recon-real')), [], 'no folder made there');
    assert.equal(existsSync(join(out, 'DSH-RECON-room')), false);
    assert.equal(readFileSync((await save(join(out, 'fine', 'deeper'))).where, 'utf8'), 'r', 'anywhere else, as before');
  } finally {
    cleanUp(home, work, out);
  }
});

test('10: a tool\'s answer is looked through only in the conversation\'s folder and the app\'s output folders, never hidden files or a reading tool\'s answer', async () => {
  const home = folder();
  const work = folder();
  const elsewhere = folder();
  const outputs = folder();
  try {
    const since = Date.now() - 500;
    write(join(elsewhere, 'id_rsa.txt'), 'secret');
    write(join(work, '.secrets', 'key.txt'), 'secret');
    write(join(work, 'made.md'), 'made');
    write(join(outputs, 'report.md'), 'report');
    const text = `${join(elsewhere, 'id_rsa.txt')} ${join(work, '.secrets', 'key.txt')} made.md ${join(outputs, 'report.md')}`;
    assert.deepEqual(testing.changedIn(text, work, since, { roots: [work, outputs] }).sort(), [join(outputs, 'report.md'), join(work, 'made.md')].sort());
    // At most 500 paths are looked at.
    const many = `${Array.from({ length: 600 }, (_, n) => `/nowhere/f${n}.md`).join(' ')} made.md`;
    assert.deepEqual(testing.changedIn(many, work, since, { roots: [work] }), []);
    // A reading tool (an MCP server's too) names files it read: nothing is recorded.
    const app = standIn(home, work, { outputRoots: [outputs] });
    await app.run('c1', 'mcp__files__read_text_file', { path: 'made.md' }, () => write(join(work, 'made.md'), 'again'), `${join(work, 'made.md')}`);
    assert.deepEqual((await hit(app.routes, {})).data.items, []);
    // A tool that makes something in the app's output folders is found.
    await app.run('c1', 'research_report', {}, () => write(join(outputs, 'report.md'), 'new report'), `Saved ${join(outputs, 'report.md')}`);
    assert.deepEqual((await hit(app.routes, {})).data.items.map((one) => one.name), ['report.md']);
  } finally {
    cleanUp(home, work, elsewhere, outputs);
  }
});

test('11: a clean-up never picks or moves a Bench backup', () => {
  const home = folder();
  const work = folder();
  try {
    const store = openArtifacts({ home });
    const path = join(work, 'bench', 'devices', 'phone', 'backups', 'wifi.txt');
    write(path, 'psk=secret');
    const backup = store.record({ path, sessionId: 'b1' });
    assert.deepEqual(store.matching({}), []);
    assert.deepEqual(store.remove([backup.id], { alsoFiles: true, trashDir: join(home, 'trash') }).moved, []);
    assert.equal(readFileSync(path, 'utf8'), 'psk=secret');
    assert.ok(store.get(backup.id));
  } finally {
    cleanUp(home, work);
  }
});

test('12: the trash keeps only a clean-up\'s name; what it moved is written down in Artifacts\' trash folder, however many', async () => {
  const home = folder();
  const work = folder();
  try {
    const app = standIn(home, work);
    const deep = join(work, 'a-rather-long-folder-name-to-make-the-paths-long', 'and-another-one-below-it');
    for (let n = 0; n < 300; n += 1) await app.run('c1', 'write', { file_path: join(deep, `file-number-${n}.md`) }, () => write(join(deep, `file-number-${n}.md`), `n${n}`));
    const ids = (await hit(app.routes, {})).data.items.map((one) => one.id);
    assert.equal((await hit(app.routes, { method: 'POST', body: { action: 'cleanup', ids } })).data.moved, 300);
    const { ownerData } = app.trashed[0].data;
    assert.deepEqual(Object.keys(ownerData), ['stamp']);
    assert.ok(JSON.stringify(ownerData).length < 100);
    const manifest = JSON.parse(readFileSync(join(home, 'trash', ownerData.stamp, 'manifest.json'), 'utf8'));
    assert.equal(manifest.moved.length, 300);
    assert.equal(statSync(join(home, 'trash', ownerData.stamp, 'manifest.json')).mode & 0o777, 0o600);
    assert.deepEqual((await app.owner().putBack({ data: [{ item: 'p', ownerData }] })).done, ['p']);
    assert.equal((await hit(app.routes, {})).data.items.length, 300);
  } finally {
    cleanUp(home, work);
  }
});

test('13: a big file is fingerprinted by size and time, the index is not rewritten when nothing changed, and a command never looks through your home folder or above it', () => {
  const home = folder();
  const work = folder();
  try {
    const store = openArtifacts({ home });
    const big = join(work, 'big.bin');
    writeFileSync(big, '');
    truncateSync(big, 50_000_001); // over 50 MB
    const made = store.record({ path: big, sessionId: 's1' });
    assert.match(store.get(made.id).versionList[0].hash, /^size:/);
    write(join(work, 'same.md'), 'same');
    store.record({ path: join(work, 'same.md'), sessionId: 's1' });
    unlinkSync(join(home, 'index.json'));
    store.record({ path: join(work, 'same.md'), sessionId: 's1' });
    assert.equal(existsSync(join(home, 'index.json')), false, 'nothing changed: nothing written');
    const userHome = join(work, 'someone');
    const since = Date.now() - 500;
    write(join(userHome, 'Documents', 'private.md'), 'x');
    assert.deepEqual(testing.changedUnder(`${userHome}/`, since, userHome), [], 'home folder, with a trailing slash');
    assert.deepEqual(testing.changedUnder(dirname(userHome), since, userHome), [], 'the folder above it');
    assert.equal(testing.changedUnder(join(userHome, 'Documents'), since, userHome).length, 1, 'a folder inside it is fine');
  } finally {
    cleanUp(home, work);
  }
});

test('14: one sealed artifact\'s details go only to a sealed conversation that made it', async () => {
  const home = folder();
  const work = folder();
  try {
    const app = standIn(home, work);
    // A Code conversation wrote into Recon's room: the file is sealed, and Code is not Recon.
    await app.run('c1', 'write', { file_path: join(work, 'dsh-recon-room', 'n.md') }, () => write(join(work, 'dsh-recon-room', 'n.md'), 'x'));
    const id = (await hit(app.routes, { query: '?session=c1' })).data.cards[0]?.id ?? openArtifacts({ home }).listSealed()[0].id;
    assert.equal((await hit(app.routes, { query: `?item=${id}&session=c1` })).data.item, null);
    await app.run('r1', 'write', { file_path: join(work, 'dsh-recon-room', 'n.md') }, () => write(join(work, 'dsh-recon-room', 'n.md'), 'y'));
    assert.equal((await hit(app.routes, { query: `?item=${id}&session=r1` })).data.item.versions, 2, 'Recon sees its own');
  } finally {
    cleanUp(home, work);
  }
});

test('17: the newest version is read from the file only while it is still a plain file there, never through a link put in its place', async () => {
  const home = folder();
  const work = folder();
  try {
    const app = standIn(home, work, { config: { dangerShowBackups: true } });
    const path = join(work, 'devices', 'phone', 'backups', 'wifi.txt');
    await app.run('b1', 'write', { file_path: path }, () => write(path, 'psk=x'));
    const id = (await itemNamed(app.routes, 'wifi.txt')).id;
    write(join(work, 'elsewhere.txt'), 'not this');
    unlinkSync(path);
    symlinkSync(join(work, 'elsewhere.txt'), path);
    const store = openArtifacts({ home });
    assert.equal(store.versionFile(id, 1), '');
    assert.match((await hit(app.routes, { query: `?content=${id}&v=1&session=b1` })).data.error, /not there any more/);
  } finally {
    cleanUp(home, work);
  }
});
