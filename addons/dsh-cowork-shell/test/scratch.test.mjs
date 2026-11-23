import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { KEEP_PATH, SCRATCH_PATH, apply } from '../index.js';
import { insideThread, isScratch, isScratchPlace, prepareFolder, storeKey, threadFolder, threadFolderOf, threadName } from '../lib/scratch.js';

const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const OTHER = 'ffeeddcc-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

/** A throwaway app home with a Scratch place in it. */
function home() {
  const dir = mkdtempSync(join(tmpdir(), 'cws-scratch-'));
  const place = join(dir, 'scratch');
  return { dir, place };
}

test('isScratch decides by place: the place and anything in it, nothing beside it', () => {
  const { dir, place } = home();
  mkdirSync(join(place, ID), { recursive: true });
  assert.equal(isScratch(place, place), true);
  assert.equal(isScratch(`${place}/`, place), true);
  assert.equal(isScratch(join(place, ID), place), true);
  assert.equal(isScratch(join(place, ID, 'not', 'made', 'yet'), place), true, 'a folder not made yet still counts');
  assert.equal(isScratch(join(place, '..folder'), place), true, 'a name that only starts with two dots is inside');
  assert.equal(isScratch(dir, place), false);
  assert.equal(isScratch(`${place}-x`, place), false, 'a sibling whose name starts the same is not Scratch');
  assert.equal(isScratch(join(place, '..', 'elsewhere'), place), false);
  assert.equal(isScratch('relative/scratch', place), false, 'a relative path is never Scratch');
  assert.equal(isScratch('', place), false);
  assert.equal(isScratch(place, ''), false, 'no place known: nothing is Scratch');
});

test('isScratch sees through links and macOS\'s /private', () => {
  const { dir, place } = home();
  mkdirSync(place, { recursive: true });
  const real = realpathSync(place);
  // tmpdir() is under /var on macOS, which is a link to /private/var.
  assert.equal(isScratch(real, place), true);
  assert.equal(isScratch(join(real, ID), place), true);
  const link = join(dir, 'shortcut');
  symlinkSync(place, link);
  assert.equal(isScratch(join(link, ID), place), true, 'a link into the place is Scratch');
  const outside = join(dir, 'outside');
  mkdirSync(outside);
  symlinkSync(outside, join(place, 'escape'));
  assert.equal(isScratch(join(place, 'escape'), place), false, 'a link inside the place that leads out is not');
  assert.equal(isScratchPlace(real, place), true);
  assert.equal(isScratchPlace(join(place, ID), place), false);
});

test('the store\'s lossy name can collide with the place; isScratch does not', () => {
  const { dir, place } = home();
  // `<home>/scratch` and `<home>-scratch` get the same name in the app's message store.
  assert.equal(storeKey(place), storeKey(`${dir}-scratch`));
  assert.equal(isScratch(`${dir}-scratch`, place), false);
  // The same encoding as the app's projectKey.
  assert.equal(storeKey('/Users/a b/c'), '--Users-a~0020b-c--');
  assert.equal(storeKey('/'), '--root--');
  assert.equal(storeKey('//x//y/'), '--x-y---');
  assert.equal(storeKey('/a/~b'), '--a-~007Eb--');
  assert.equal(storeKey('/a/😀'), '--a-~D83D~DE00--');
});

test('a thread\'s folder is named after its conversation; odd ids get none', () => {
  assert.equal(threadName(ID), ID);
  for (const bad of ['', '.', '..', '../x', 'a/b', 'short', '-leading', 'x'.repeat(129), 'a b c d e f']) assert.equal(threadName(bad), '', bad);
  assert.equal(threadFolder('/h/scratch', ID), `/h/scratch/${ID}`);
  assert.equal(threadFolder('/h/scratch', '../etc'), '');
  assert.equal(threadFolder('', ID), '');
});

test('the folder a conversation is kept to: the thread\'s own, and its helpers\' that of the thread', () => {
  const { place } = home();
  mkdirSync(place, { recursive: true });
  assert.equal(threadFolderOf({ id: ID, cwd: place }, place), join(place, ID));
  assert.equal(threadFolderOf({ id: 'helper-0001', cwd: place, origin: 'subagent', parentSession: ID }, place), join(place, ID));
  const roots = new Map([['helper-0001', ID]]);
  assert.equal(threadFolderOf({ id: 'helper-0002', cwd: place, origin: 'subagent', parentSession: 'helper-0001' }, place, roots), join(place, ID), 'a helper of a helper');
  assert.equal(threadFolderOf({ id: OTHER, cwd: join(place, ID, 'sub') }, place), join(place, ID), 'recorded inside a thread folder: that folder');
  assert.equal(threadFolderOf({ id: ID, cwd: '/somewhere/else' }, place), '');
  assert.equal(threadFolderOf({ id: ID }, place), '');
  assert.equal(threadFolderOf({ id: 'bad/id', cwd: place }, place), '');
  assert.equal(threadFolderOf(undefined, place), '');
});

test('a thread may move only within its own folder', () => {
  const { place } = home();
  const mine = join(place, ID);
  mkdirSync(join(mine, 'sub'), { recursive: true });
  mkdirSync(join(place, OTHER), { recursive: true });
  assert.equal(insideThread(mine, mine, mine), true);
  assert.equal(insideThread('sub', mine, mine), true);
  assert.equal(insideThread(join(mine, 'new'), mine, mine), true);
  assert.equal(insideThread('..', mine, mine), false);
  assert.equal(insideThread(`../${OTHER}`, mine, mine), false, 'not into another thread');
  assert.equal(insideThread(place, mine, mine), false, 'not to the place itself');
  assert.equal(insideThread('/', mine, mine), false);
  assert.equal(insideThread('..', join(mine, 'sub'), mine), true, 'back up to its own folder');
  symlinkSync(tmpdir(), join(mine, 'door'));
  assert.equal(insideThread('door', mine, mine), false, 'not through a link that leads out');
  assert.equal(insideThread(mine, mine, ''), false);
});

test('prepareFolder makes a folder only the user can open, and refuses a link', () => {
  const { dir, place } = home();
  assert.equal(prepareFolder(join(place, ID)), '');
  assert.equal(statSync(join(place, ID)).mode & 0o777, 0o700);
  const target = join(dir, 'target');
  mkdirSync(target);
  symlinkSync(target, join(dir, 'link'));
  assert.match(prepareFolder(join(dir, 'link')), /link/);
  writeFileSync(join(dir, 'file'), 'x');
  assert.notEqual(prepareFolder(join(dir, 'file')), '');
});

// ---- the host side, against a stand-in app ----------------------------------------------------

function standIn({ noHome = false, noWorkingDirectory = false, failSet = false, stored = [], projects = [], attachmentPaths = new Map() } = {}) {
  const { dir, place } = home();
  const listeners = {};
  const services = {};
  const logs = [];
  let route;
  const cwdOf = new Map();
  const sets = [];
  const waterfall = async (name, request, last) => {
    const chain = listeners[name] ?? [];
    const run = (i) => (i < chain.length ? chain[i](request, () => run(i + 1)) : last());
    return run(0);
  };
  const workingDirectory = {
    // The app checks the current folder (no path) before every turn; that must never be refused.
    ensure: (agent) => waterfall('working-directory/access', { agent, path: null, signal: new AbortController().signal }, async () => workingDirectory.get(agent.session)),
    get: (session) => cwdOf.get(session.header.id) ?? session.header.cwd ?? '/default',
    set: (agent, path) => waterfall('working-directory/access', { agent, path, signal: new AbortController().signal }, async () => {
      if (failSet) throw new Error('set failed');
      const target = resolve(workingDirectory.get(agent.session), path);
      if (!existsSync(target)) throw new Error('no such folder');
      sets.push([agent.session.header.id, target]);
      cwdOf.set(agent.session.header.id, target);
      return target;
    }),
  };
  let keepRoute;
  const inner = {
    webServer: { register: (spec) => { if (spec.path === SCRATCH_PATH) route = spec.handler; if (spec.path === KEEP_PATH) keepRoute = spec.handler; return () => {}; } },
    sessionPersistence: { list: async () => stored.map((header) => ({ header })) },
    connection: { requestRejection: () => undefined },
    effect: (fn) => { fn(); },
    on: () => {},
  };
  const ctx = {
    logger: { info: (m) => logs.push(m), warn: (m) => logs.push(m), error: (m) => logs.push(m), debug() {} },
    effect: (fn) => { try { fn(); } catch { /* not part of this test */ } },
    provide: (name, value) => { services[name] = value; },
    on: (name, fn, options) => { const list = (listeners[name] ??= []); if (options?.prepend) list.unshift(fn); else list.push(fn); },
    get: (name) => {
      if (name === 'dshHomePath') return noHome ? undefined : (...parts) => join(dir, ...parts);
      if (name === 'workingDirectory') return noWorkingDirectory ? undefined : workingDirectory;
      if (name === 'workspaceRegistry') return { list: () => projects };
      if (name === 'attachments') return { fileHostPath: (ref) => attachmentPaths.get(ref.attachmentId) };
      return services[name];
    },
    inject: (deps, fn) => { if (deps.every((dep) => dep in inner)) fn(inner); },
  };
  apply(ctx);
  const agentOf = (header) => ({ id: header.id, session: { header } });
  const call = async (method) => {
    const res = { statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; }, end(text = '') { this.body = text; } };
    await route({ method, url: SCRATCH_PATH, headers: {} }, res);
    return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null };
  };
  const keep = async (body) => {
    const chunks = [Buffer.from(JSON.stringify(body))];
    const res = { statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; }, end(text = '') { this.body = text; } };
    await keepRoute({ method: 'POST', headers: {}, async *[Symbol.asyncIterator]() { yield* chunks; } }, res);
    return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null };
  };
  const claim = async (agent, message) => { for (const fn of listeners['agent/inbox/claimed'] ?? []) await fn({ agent, message }); };
  const created = async (agent) => { for (const fn of listeners['agent/created'] ?? []) await fn({ agent }); };
  const assembleFor = async (agent) => {
    let reached = false;
    const chain = listeners['system-prompt/assemble'] ?? [];
    const run = (i) => (i < chain.length ? chain[i]({}, { agent, signal: new AbortController().signal }, () => run(i + 1)) : (reached = true, Promise.resolve({})));
    await run(0);
    return reached;
  };
  return { dir, place, services, logs, call, keep, claim, created, assembleFor, workingDirectory, agentOf, sets, cwdOf };
}

test('the page learns the place without making it, and has it made before a thread starts', async () => {
  const app = standIn();
  const asked = await app.call('GET');
  assert.equal(asked.status, 200);
  assert.equal(asked.json.place, app.place);
  assert.equal(asked.json.title, 'Scratch');
  assert.equal(existsSync(app.place), false, 'asking makes no folder');
  const made = await app.call('POST');
  assert.equal(made.json.place, app.place);
  assert.equal(statSync(app.place).mode & 0o777, 0o700);
  assert.equal((await app.call('DELETE')).status, 405);
  const none = standIn({ noHome: true });
  // Without a data folder there is no route at all to ask... and nothing breaks.
  assert.equal(none.services.coworkScratch.place(), '');
  assert.equal(none.services.coworkScratch.isScratch('/anything'), false);
});

test('before a thread\'s turn, its working folder becomes its own sub-folder, once', async () => {
  const app = standIn();
  const thread = app.agentOf({ id: ID, cwd: app.place });
  await app.created(thread);
  assert.equal(await app.assembleFor(thread), true);
  assert.deepEqual(app.sets, [[ID, join(app.place, ID)]]);
  assert.equal(statSync(join(app.place, ID)).mode & 0o777, 0o700);
  await app.assembleFor(thread);
  assert.equal(app.sets.length, 1, 'already there: not moved again');
  // A conversation elsewhere is left alone.
  const other = app.agentOf({ id: OTHER, cwd: app.dir });
  await app.assembleFor(other);
  assert.equal(app.sets.length, 1);
  assert.equal(existsSync(join(app.place, OTHER)), false);
});

test('a helper works in the folder of the thread that started it', async () => {
  const app = standIn();
  const thread = app.agentOf({ id: ID, cwd: app.place });
  const helper = app.agentOf({ id: 'helper-0001', cwd: app.place, origin: 'subagent', parentSession: ID });
  const helper2 = app.agentOf({ id: 'helper-0002', cwd: app.place, origin: 'subagent', parentSession: 'helper-0001' });
  const helper3 = app.agentOf({ id: 'helper-0003', cwd: app.place, origin: 'subagent', parentSession: 'helper-0002' });
  for (const agent of [thread, helper, helper2, helper3]) await app.created(agent);
  await app.assembleFor(helper2);
  assert.deepEqual(app.sets, [['helper-0002', join(app.place, ID)]]);
  assert.equal(app.services.coworkScratch.folderOf(helper2), join(app.place, ID));
  assert.equal(app.services.coworkScratch.folderOf(helper3), join(app.place, ID), 'three helpers down');
});

test('the working-folder guard: a Scratch thread cannot move out of its own folder', async () => {
  const app = standIn();
  const thread = app.agentOf({ id: ID, cwd: app.place });
  await app.created(thread);
  mkdirSync(app.place, { recursive: true });
  assert.equal(await app.workingDirectory.ensure(thread), app.place, 'checking the current folder is never refused, even at the place');
  await app.assembleFor(thread);
  mkdirSync(join(app.place, ID, 'sub'));
  mkdirSync(join(app.place, OTHER), { recursive: true });
  await app.workingDirectory.set(thread, join(app.place, ID, 'sub'));
  await assert.rejects(app.workingDirectory.set(thread, app.dir), /Scratch thread/);
  await assert.rejects(app.workingDirectory.set(thread, join(app.place, OTHER)), /Scratch thread/);
  await assert.rejects(app.workingDirectory.set(thread, app.place), /Scratch thread/);
  await assert.rejects(app.workingDirectory.set(thread, '../..'), /Scratch thread/, 'relative to where it is now');
  await app.workingDirectory.set(thread, '..');
  assert.equal(app.cwdOf.get(ID), join(app.place, ID));
  // A conversation that is not Scratch goes anywhere, as before.
  const other = app.agentOf({ id: OTHER, cwd: app.dir });
  await app.workingDirectory.set(other, app.place);
  assert.equal(app.cwdOf.get(OTHER), app.place);
});

test('Scratch gives way when the app\'s working folder service is missing or fails', async () => {
  const missing = standIn({ noWorkingDirectory: true });
  const thread = missing.agentOf({ id: ID, cwd: missing.place });
  assert.equal(await missing.assembleFor(thread), true, 'the turn still goes on');
  const failing = standIn({ failSet: true });
  const again = failing.agentOf({ id: ID, cwd: failing.place });
  assert.equal(await failing.assembleFor(again), true, 'the turn still goes on');
  assert.ok(failing.logs.some((line) => /could not move a Scratch conversation/.test(line)));
});

test('other add-ons can ask whether a folder is Scratch', () => {
  const app = standIn();
  const scratch = app.services.coworkScratch;
  assert.equal(scratch.apiVersion, 1);
  assert.equal(scratch.place(), app.place);
  assert.equal(scratch.isScratch(join(app.place, ID)), true);
  assert.equal(scratch.isScratch(`${app.dir}-scratch`), false);
  assert.equal(scratch.isScratch(42), false);
});


test('a thread whose folder went missing gets it made again before its next turn', async () => {
  const app = standIn();
  const thread = app.agentOf({ id: ID, cwd: app.place });
  await app.assembleFor(thread);
  const { rmSync } = await import('node:fs');
  rmSync(join(app.place, ID), { recursive: true, force: true });
  assert.equal(await app.assembleFor(thread), true);
  assert.equal(existsSync(join(app.place, ID)), true, 'made again, so the app does not fall back to the place');
  assert.equal(app.sets.length, 1, 'still there: not moved again');
});


test('a copy of a thread (the app\'s Fork) starts with a copy of its files in a folder of its own', async () => {
  const app = standIn();
  const thread = app.agentOf({ id: ID, cwd: app.place });
  await app.assembleFor(thread);
  writeFileSync(join(app.place, ID, 'made.txt'), 'by the thread');
  // The fork records the place and carries the thread's working folder.
  const fork = app.agentOf({ id: OTHER, cwd: app.place });
  app.cwdOf.set(OTHER, join(app.place, ID));
  await app.assembleFor(fork);
  assert.equal(app.cwdOf.get(OTHER), join(app.place, OTHER));
  const { readFileSync } = await import('node:fs');
  assert.equal(readFileSync(join(app.place, OTHER, 'made.txt'), 'utf8'), 'by the thread');
  writeFileSync(join(app.place, OTHER, 'made.txt'), 'changed in the fork');
  assert.equal(readFileSync(join(app.place, ID, 'made.txt'), 'utf8'), 'by the thread', 'each has its own');
});

test('copying a thread\'s files stops above the size limit and never overwrites', async () => {
  const { copyThreadFiles } = await import('../lib/scratch.js');
  const { place } = home();
  const from = join(place, ID);
  const to = join(place, OTHER);
  mkdirSync(from, { recursive: true });
  writeFileSync(join(from, 'big.bin'), Buffer.alloc(2048));
  assert.match(copyThreadFiles(from, to, 1024), /larger than/);
  assert.equal(existsSync(join(to, 'big.bin')), false);
  mkdirSync(to, { recursive: true });
  writeFileSync(join(to, 'big.bin'), 'mine');
  assert.equal(copyThreadFiles(from, to), '');
  const { readFileSync } = await import('node:fs');
  assert.equal(readFileSync(join(to, 'big.bin'), 'utf8'), 'mine', 'nothing overwritten');
});


test('Keep in a project: names, clashes, nothing overwritten, nothing to copy, too large', async () => {
  const { keepFolderName, keepInProject } = await import('../lib/scratch.js');
  const { readFileSync } = await import('node:fs');
  assert.equal(keepFolderName('  Budget / plan:\n2027 ', ID), 'Budget plan 2027');
  assert.equal(keepFolderName('...hidden', ID), 'hidden');
  assert.equal(keepFolderName('', 'session-abcdef123'), 'Scratch abcdef12');
  assert.equal(keepFolderName('x'.repeat(100), ID).length, 60);
  const { dir, place } = home();
  const from = join(place, ID);
  mkdirSync(join(from, 'sub'), { recursive: true });
  writeFileSync(join(from, 'sub', 'a.txt'), 'A');
  const project = join(dir, 'project');
  mkdirSync(join(project, 'Plan'), { recursive: true });
  writeFileSync(join(project, 'Plan', 'a.txt'), 'theirs');
  const kept = keepInProject(from, project, 'Plan', ID);
  assert.equal(kept.folder, join(project, 'Plan 2'), 'a folder with that name exists: the next free name');
  assert.equal(readFileSync(join(project, 'Plan 2', 'sub', 'a.txt'), 'utf8'), 'A');
  assert.equal(readFileSync(join(project, 'Plan', 'a.txt'), 'utf8'), 'theirs', 'nothing of theirs is touched');
  assert.equal(readFileSync(join(from, 'sub', 'a.txt'), 'utf8'), 'A', 'the thread keeps its files');
  mkdirSync(join(place, OTHER), { recursive: true });
  assert.deepEqual(keepInProject(join(place, OTHER), project, 'Empty', OTHER), { folder: '', copied: false });
  assert.throws(() => keepInProject(from, project, 'Big', ID, 0), /larger than/);
  symlinkSync(project, join(dir, 'link'));
  assert.throws(() => keepInProject(from, join(dir, 'link'), 'X', ID), /not a folder/);
});

test('the Keep route copies only a Scratch thread, only into one of your projects', async () => {
  const project = mkdtempSync(join(tmpdir(), 'cws-keep-project-'));
  const stored = [];
  const projects = [{ id: 'w1', path: project, title: 'Books' }];
  const app = standIn({ projects, stored });
  projects.push({ id: 'ws', path: app.place, title: 'Scratch' });
  stored.push({ id: ID, cwd: app.place }, { id: OTHER, cwd: project });
  mkdirSync(join(app.place, ID), { recursive: true });
  const empty = await app.keep({ sessionId: ID, title: 'Reading list', workspaceId: 'w1' });
  assert.equal(empty.status, 200, JSON.stringify(empty.json));
  assert.equal(empty.json.copied, false, 'nothing in its folder yet');
  writeFileSync(join(app.place, ID, 'notes.md'), 'notes');
  const copied = await app.keep({ sessionId: ID, title: 'Reading list', workspaceId: 'w1' });
  assert.equal(copied.json.folder, join(project, 'Reading list'));
  assert.equal(existsSync(join(project, 'Reading list', 'notes.md')), true);
  assert.equal((await app.keep({ sessionId: OTHER, title: 'x', workspaceId: 'w1' })).status, 400, 'not a Scratch conversation');
  assert.equal((await app.keep({ sessionId: ID, title: 'x', workspaceId: 'ws' })).status, 400, 'never into Scratch itself');
  assert.equal((await app.keep({ sessionId: ID, title: 'x', workspaceId: 'nope' })).status, 400, 'only one of your projects');
});


test('a file dropped into a Scratch conversation is copied into its folder; the same file is not copied twice', async () => {
  const store = mkdtempSync(join(tmpdir(), 'cws-attach-'));
  const { readFileSync } = await import('node:fs');
  writeFileSync(join(store, 'sales.csv'), 'a,b\n1,2\n');
  writeFileSync(join(store, 'other-sales.csv'), 'different,bytes,longer\n');
  const attachmentPaths = new Map([['att-1', join(store, 'sales.csv')], ['att-2', join(store, 'other-sales.csv')]]);
  const app = standIn({ attachmentPaths });
  const thread = app.agentOf({ id: ID, cwd: app.place });
  const drop = (id, name) => ({ type: 'file', attachment: { attachmentId: id, name, bytes: 1 } });
  await app.claim(thread, { content: [{ type: 'text', text: 'look' }, drop('att-1', 'sales.csv')] });
  assert.equal(readFileSync(join(app.place, ID, 'sales.csv'), 'utf8'), 'a,b\n1,2\n', 'made the folder and copied it before the turn');
  await app.claim(thread, { content: [drop('att-1', 'sales.csv')] });
  await app.claim(thread, { content: [drop('att-2', 'sales.csv')] });
  assert.equal(readFileSync(join(app.place, ID, 'sales.csv'), 'utf8'), 'a,b\n1,2\n', 'never overwritten');
  assert.equal(readFileSync(join(app.place, ID, 'sales 2.csv'), 'utf8'), 'different,bytes,longer\n', 'another file of that name');
  assert.equal(existsSync(join(app.place, ID, 'sales 3.csv')), false, 'the same file dropped again is not copied twice');
  await app.claim(thread, { content: [drop('att-9', '../../evil.sh')] });
  assert.ok(app.logs.some((line) => /could not be found/.test(line)));
  // A conversation outside Scratch: nothing copied.
  const other = app.agentOf({ id: OTHER, cwd: app.dir });
  await app.claim(other, { content: [drop('att-1', 'sales.csv')] });
  assert.equal(existsSync(join(app.dir, 'sales.csv')), false);
});

test('dropped names stay inside the folder', async () => {
  const { droppedName, copyDropped } = await import('../lib/scratch.js');
  assert.equal(droppedName('../../evil.sh'), '.._.._evil.sh'.replace(/^\.+/, ''));
  assert.equal(droppedName('a/b\\c:d.txt'), 'a_b_c_d.txt');
  assert.equal(droppedName('.hidden'), 'hidden');
  assert.equal(droppedName('\u0000'), '');
  const { place } = home();
  mkdirSync(place, { recursive: true });
  assert.equal(copyDropped('relative.txt', place, 'x.txt'), '');
});

// ---- review fixes ------------------------------------------------------------------------------

test('the guard reads paths the way the system does: ~ is home, and .. after a link goes where the link points', async () => {
  const { insideThread, physicalPath } = await import('../lib/scratch.js');
  const { place } = home();
  const mine = join(place, ID);
  mkdirSync(join(mine, 'sub'), { recursive: true });
  const outside = mkdtempSync(join(tmpdir(), 'cws-outside-'));
  mkdirSync(join(outside, 'inner'));
  symlinkSync(join(outside, 'inner'), join(mine, 'door'));
  assert.equal(insideThread('~', mine, mine, undefined, outside), false, '~ is the home folder');
  assert.equal(insideThread('~/Documents', mine, mine, undefined, outside), false);
  assert.equal(insideThread('~someone', mine, mine), false, '~user forms are refused');
  assert.equal(insideThread('door/..', mine, mine), false, 'a link then .. leads outside');
  assert.equal(insideThread('door/../inner', mine, mine), false);
  assert.equal(insideThread('sub/..', mine, mine), true, 'a real folder then .. stays home');
  assert.equal(insideThread('sub/../sub', mine, mine), true);
  assert.equal(physicalPath('door/..', mine), realpathSync(outside));
});

test('a dropped file is never written through a link or over anything; same name and size but other bytes is a new name', async () => {
  const { copyDropped } = await import('../lib/scratch.js');
  const { readFileSync, lstatSync: lstat } = await import('node:fs');
  const { place } = home();
  const mine = join(place, ID);
  mkdirSync(mine, { recursive: true });
  const store = mkdtempSync(join(tmpdir(), 'cws-attach-'));
  writeFileSync(join(store, 'report.pdf'), 'PDF-ONE');
  // A link planted under the name, pointing at a file that does not exist yet.
  const victim = join(mkdtempSync(join(tmpdir(), 'cws-victim-')), 'x.plist');
  symlinkSync(victim, join(mine, 'report.pdf'));
  assert.equal(copyDropped(join(store, 'report.pdf'), mine, 'report.pdf'), 'report 2.pdf');
  assert.equal(existsSync(victim), false, 'nothing was written through the link');
  assert.equal(lstat(join(mine, 'report.pdf')).isSymbolicLink(), true);
  // The same bytes again: not copied twice. Other bytes of the same size: a new name.
  assert.equal(copyDropped(join(store, 'report.pdf'), mine, 'report.pdf'), 'report 2.pdf');
  writeFileSync(join(store, 'report.pdf'), 'PDF-TWO');
  assert.equal(copyDropped(join(store, 'report.pdf'), mine, 'report.pdf'), 'report 3.pdf');
  assert.equal(readFileSync(join(mine, 'report 3.pdf'), 'utf8'), 'PDF-TWO');
});

test('a Fork gets its copy of the files as soon as it exists, also when its first message carries a dropped file', async () => {
  const store = mkdtempSync(join(tmpdir(), 'cws-attach-'));
  writeFileSync(join(store, 'new.csv'), 'n\n1\n');
  const app = standIn({ attachmentPaths: new Map([['att-n', join(store, 'new.csv')]]) });
  const { readFileSync } = await import('node:fs');
  const thread = app.agentOf({ id: ID, cwd: app.place });
  await app.assembleFor(thread);
  writeFileSync(join(app.place, ID, 'made.txt'), 'by the thread');
  // A fork whose first message has a dropped file: the copy of the thread's files comes first.
  const fork = app.agentOf({ id: OTHER, cwd: app.place });
  app.cwdOf.set(OTHER, join(app.place, ID));
  await app.claim(fork, { content: [{ type: 'file', attachment: { attachmentId: 'att-n', name: 'new.csv', bytes: 4 } }] });
  assert.equal(readFileSync(join(app.place, OTHER, 'made.txt'), 'utf8'), 'by the thread');
  assert.equal(readFileSync(join(app.place, OTHER, 'new.csv'), 'utf8'), 'n\n1\n');
  // A fork that exists but has not run: it already has its copy, so deleting the original first is safe.
  const other = 'aaaabbbb-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  const late = app.agentOf({ id: other, cwd: app.place });
  app.cwdOf.set(other, join(app.place, ID));
  await app.created(late);
  assert.equal(readFileSync(join(app.place, other, 'made.txt'), 'utf8'), 'by the thread');
});
