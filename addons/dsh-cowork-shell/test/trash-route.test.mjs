import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { EMPTY_MAX, TRASH_PATH, apply } from '../index.js';

/**
 * The add-on's trash part against a stand-in app, in a throwaway folder: stored conversations are
 * folders under `<home>/sessions/proj/<id>`, listed from disk on every call as the app does.
 */
function standIn({ seed, gateFirstList = false, schedule, archiveError, noHome = false, cwds = new Map() } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'cws-route-'));
  const store = join(home, 'sessions', 'proj');
  mkdirSync(store, { recursive: true });
  // The first list() call can be held until the test lets it go (to act while a tidy-up waits).
  const gate = { used: !gateFirstList };
  gate.reached = new Promise((done) => { gate.reach = done; });
  gate.promise = new Promise((done) => { gate.release = done; });
  const listeners = {};
  const disposers = [];
  const logs = [];
  let handler;
  const inMemory = new Set();
  const archived = [];
  const pinned = [];
  const archiveCalls = [];
  const helpers = new Map();
  const services = {};
  const fire = async (name, payload) => { for (const fn of listeners[name] ?? []) await fn(payload); };
  // Like the app's token: the file's size and times.
  const snapOf = (id) => {
    const path = join(store, id, 'session.v4.jsonl.zstd');
    const st = statSync(path);
    const header = { ...(helpers.has(id) ? { id, origin: 'subagent', parentSession: helpers.get(id) } : { id }), ...(cwds.has(id) ? { cwd: cwds.get(id) } : {}) };
    return { header, revision: `${st.ino}:${st.size}:${st.mtimeMs}`, location: { kind: 'jsonl', path } };
  };
  const inner = {
    sessionPersistence: {
      list: async () => {
        if (!gate.used) { gate.used = true; gate.reach(); await gate.promise; }
        return readdirSync(store).map(snapOf);
      },
      stat: async (id) => (existsSync(join(store, id)) ? snapOf(id) : undefined),
    },
    sessions: { get: (id) => (inMemory.has(id) ? {} : undefined) },
    workspaceRegistry: {
      get archivedSessionIds() { return archived; },
      get pinnedSessionIds() { return pinned; },
      archiveSession: async (id, options) => {
        archiveCalls.push([id, options]);
        const error = archiveError?.(id);
        if (error) throw error;
        if (!archived.includes(id)) archived.push(id);
        if (pinned.includes(id)) pinned.splice(pinned.indexOf(id), 1);
      },
      unarchiveSession: async (id) => {
        if (!archived.includes(id)) return;
        await fire('workspace/session-unarchiving', { sessionId: id });
        archived.splice(archived.indexOf(id), 1);
      },
    },
    webServer: { register: (spec) => { if (spec.path === TRASH_PATH) handler = spec.handler; return () => {}; } },
    connection: { requestRejection: () => undefined },
    effect: (fn) => { const off = fn(); if (typeof off === 'function') disposers.push(off); },
    on: (name, fn) => { (listeners[name] ??= []).push(fn); },
  };
  const logger = { info: (m) => logs.push(m), warn: (m) => logs.push(m), error: (m) => logs.push(m), debug() {} };
  const ctx = {
    logger,
    effect: (fn) => { try { const off = fn(); if (typeof off === 'function') disposers.push(off); } catch { /* not part of this test */ } },
    provide: (name, value) => { services[name] = value; },
    on() {},
    get: (name) => {
      if (name === 'dshHomePath') return noHome ? undefined : (...parts) => join(home, ...parts);
      if (name === 'schedule') return schedule;
      return services[name];
    },
    inject: (deps, fn) => { if (deps.includes('workspaceRegistry')) fn(inner); },
  };
  seed?.({ home, store, archived, trashDir: join(home, 'trash', 'conversations') });
  apply(ctx);
  const call = async (method, body) => {
    const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
    const req = { method, headers: {}, async *[Symbol.asyncIterator]() { yield* chunks; } };
    let out = '';
    const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text ?? ''; } };
    await handler(req, res);
    return { status: res.statusCode, body: out ? JSON.parse(out) : null };
  };
  const make = (id, { archive = true, helperOf } = {}) => {
    mkdirSync(join(store, id), { recursive: true });
    writeFileSync(join(store, id, 'session.v4.jsonl.zstd'), `log of ${id}`);
    if (archive) archived.push(id);
    if (helperOf) helpers.set(id, helperOf);
    return join(store, id);
  };
  const settle = () => new Promise((done) => setTimeout(done, 30));
  const close = () => { for (const off of disposers) off(); rmSync(home, { recursive: true, force: true }); };
  return { home, store, inner, inMemory, archived, pinned, archiveCalls, services, call, make, settle, close, logs, gate, cwds };
}

test('the tab and the folder\'s tab sent with Delete are kept with the conversation; bad ones are not', async () => {
  const app = standIn();
  try {
    await app.settle();
    app.make('session-r');
    app.make('session-b');
    let reply = await app.call('POST', { action: 'delete', sessionId: 'session-r', title: 'R', tab: 'recon', fallbackTab: 'code' });
    assert.equal(reply.status, 200);
    reply = await app.call('POST', { action: 'delete', sessionId: 'session-b', title: 'B', tab: '../x', fallbackTab: 'a b' });
    const byId = Object.fromEntries(reply.body.items.map((item) => [item.id, item]));
    assert.equal(byId['session-r'].tab, 'recon');
    assert.equal(byId['session-r'].fallbackTab, 'code');
    assert.equal('tab' in byId['session-b'], false);
    assert.equal('fallbackTab' in byId['session-b'], false);
  } finally {
    app.close();
  }
});

test('taken out of the archive while it waits: no longer deleted, and its "delete permanently" mark goes with it at once', async () => {
  const app = standIn();
  try {
    await app.settle();
    const folder = app.make('session-x');
    app.inMemory.add('session-x');
    await app.call('POST', { action: 'delete', sessionId: 'session-x', title: 'X', tab: 'chat' });
    let reply = await app.call('POST', { action: 'erase', sessionId: 'session-x' });
    assert.equal(reply.body.items[0].erasing, true);
    const saved = JSON.parse(readFileSync(join(app.home, 'trash', 'conversations', 'pending.json'), 'utf8'));
    assert.match(saved[0].markedStamp, /^\d+:\d+:/, 'the file\'s change token is kept with the mark');
    // Unarchived in the app's own list, worked in, archived again before any tidy-up.
    await app.inner.workspaceRegistry.unarchiveSession('session-x');
    reply = await app.call('GET');
    assert.deepEqual(reply.body.items, [], 'no longer in the trash, nothing marked');
    await app.inner.workspaceRegistry.archiveSession('session-x');
    assert.equal(existsSync(folder), true);
    assert.ok(app.logs.some((line) => /no longer deleted/.test(line)));
  } finally {
    app.close();
  }
});

test('an erased conversation leaves the archived list only once the app no longer stores it', async () => {
  const app = standIn();
  try {
    await app.settle();
    app.make('session-gone');
    await app.call('POST', { action: 'delete', sessionId: 'session-gone', title: 'G' });
    const reply = await app.call('POST', { action: 'erase', sessionId: 'session-gone' });
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body.items, []);
    assert.equal(app.archived.includes('session-gone'), false, 'forgotten');

    // A conversation of the same id is back in the store (for example from Sync): it stays archived.
    app.make('session-back');
    await app.call('POST', { action: 'delete', sessionId: 'session-back', title: 'B' });
    mkdirSync(join(app.store, 'session-back'), { recursive: true });
    writeFileSync(join(app.store, 'session-back', 'session.v4.jsonl.zstd'), 'a new one');
    await app.call('POST', { action: 'erase', sessionId: 'session-back' });
    assert.equal(app.archived.includes('session-back'), true, 'not brought back to the list');
  } finally {
    app.close();
  }
});

test('the route refuses to erase the trash\'s own files', async () => {
  const app = standIn();
  try {
    await app.settle();
    app.make('session-w');
    app.inMemory.add('session-w');
    await app.call('POST', { action: 'delete', sessionId: 'session-w', title: 'W' });
    const reply = await app.call('POST', { action: 'erase', sessionId: 'pending.json' });
    assert.equal(reply.status, 400);
    const list = await app.call('GET');
    assert.deepEqual(list.body.items.map((item) => item.id), ['session-w'], 'the waiting list is intact');
  } finally {
    app.close();
  }
});

test('taken out of the archive while the tidy-up is about to move it: it stays where it is', async () => {
  const app = standIn({
    gateFirstList: true,
    seed: ({ store, archived, trashDir }) => {
      mkdirSync(join(store, 'session-x'), { recursive: true });
      writeFileSync(join(store, 'session-x', 'session.v4.jsonl.zstd'), 'log');
      archived.push('session-x');
      mkdirSync(trashDir, { recursive: true });
      writeFileSync(join(trashDir, 'pending.json'), JSON.stringify([{ id: 'session-x', title: 'x', deletedAt: 1 }]));
    },
  });
  try {
    await app.gate.reached; // the start tidy-up is looking at session-x
    // Put back now waits for the tidy-up (one queue); taking it out of the archive does not (the app
    // waits for that listener), so that is how it changes under the tidy-up's feet.
    await app.inner.workspaceRegistry.unarchiveSession('session-x');
    app.gate.release();
    await app.settle();
    assert.equal(existsSync(join(app.store, 'session-x', 'session.v4.jsonl.zstd')), true, 'not moved after all');
    assert.equal(existsSync(join(app.home, 'trash', 'conversations', 'session-x')), false);
  } finally {
    app.gate.release();
    app.close();
  }
});

test('Empty trash erases exactly the conversations the tab\'s list showed; open ones are marked; others are untouched', async () => {
  const app = standIn();
  try {
    await app.settle();
    for (const id of ['session-a', 'session-b', 'session-open', 'session-other']) app.make(id);
    app.inMemory.add('session-open');
    await app.call('POST', { action: 'delete', sessionId: 'session-a', title: 'A', tab: 'chat' });
    await app.call('POST', { action: 'delete', sessionId: 'session-b', title: 'B', tab: 'chat' });
    await app.call('POST', { action: 'delete', sessionId: 'session-open', title: 'O', tab: 'chat' });
    await app.call('POST', { action: 'delete', sessionId: 'session-other', title: 'R', tab: 'recon' });
    const reply = await app.call('POST', { action: 'empty', sessionIds: ['session-a', 'session-b', 'session-open', 'session-open', 'session-gone'] });
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body.emptied, { erased: 2, marked: 1, failed: 0 }, 'a repeated id counts once; an unknown one is skipped');
    const byId = Object.fromEntries(reply.body.items.map((item) => [item.id, item]));
    assert.deepEqual(Object.keys(byId).sort(), ['session-open', 'session-other']);
    assert.equal(byId['session-open'].erasing, true, 'still open: erased when it moves');
    assert.equal(byId['session-other'].erasing, undefined, 'another tab\'s: untouched');
    assert.equal(existsSync(join(app.home, 'trash', 'conversations', 'session-a')), false);
    assert.equal(existsSync(join(app.home, 'trash', 'conversations', 'session-other')), true);
    assert.equal(app.archived.includes('session-a'), false, 'erased ones leave the archived list');
    assert.equal(app.archived.includes('session-other'), true);
    const saved = JSON.parse(readFileSync(join(app.home, 'trash', 'conversations', 'pending.json'), 'utf8'));
    assert.match(saved.find((item) => item.id === 'session-open').markedStamp, /^\d+:\d+:/);
  } finally {
    app.close();
  }
});

test('Empty trash refuses a request that is not a short list of conversation ids, and changes nothing', async () => {
  const app = standIn();
  try {
    await app.settle();
    app.make('session-a');
    await app.call('POST', { action: 'delete', sessionId: 'session-a', title: 'A' });
    const tooMany = Array.from({ length: EMPTY_MAX + 1 }, (_, i) => `session-${i}`);
    for (const sessionIds of [undefined, 'session-a', [], ['session-a', '../x'], ['pending.json/..'], tooMany]) {
      const reply = await app.call('POST', { action: 'empty', sessionIds });
      assert.equal(reply.status, 400, JSON.stringify(sessionIds)?.slice(0, 40));
    }
    const list = await app.call('GET');
    assert.deepEqual(list.body.items.map((item) => item.id), ['session-a']);
  } finally {
    app.close();
  }
});

test('Empty trash goes on past one it cannot erase, and says how many stayed', async () => {
  const app = standIn();
  try {
    await app.settle();
    app.make('session-a');
    app.make('session-half');
    await app.call('POST', { action: 'delete', sessionId: 'session-a', title: 'A' });
    // A move that broke off half-way: the record exists, the files are still in the store.
    const entry = join(app.home, 'trash', 'conversations', 'session-half');
    mkdirSync(entry, { recursive: true });
    writeFileSync(join(entry, 'info.json'), JSON.stringify({ id: 'session-half', title: 'H', deletedAt: 1, parts: [{ id: 'session-half', from: join(app.store, 'session-half'), cacheFrom: null }] }));
    const reply = await app.call('POST', { action: 'empty', sessionIds: ['session-half', 'session-a'] });
    assert.deepEqual(reply.body.emptied, { erased: 1, marked: 0, failed: 1 });
    assert.deepEqual(reply.body.items.map((item) => item.id), ['session-half']);
    assert.equal(existsSync(join(app.store, 'session-half', 'session.v4.jsonl.zstd')), true);
  } finally {
    app.close();
  }
});

test('Empty trash takes a long list in one request; Put back of one no longer in the trash says so', async () => {
  const app = standIn();
  try {
    await app.settle();
    // 150 ids of the app's length: about 7 kB, more than the old 4 kB limit.
    const ids = Array.from({ length: 150 }, (_, i) => `session-${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`);
    const reply = await app.call('POST', { action: 'empty', sessionIds: ids });
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body.emptied, { erased: 0, marked: 0, failed: 0 }, 'none of them was in the trash');
    const back = await app.call('POST', { action: 'restore', sessionId: ids[0] });
    assert.equal(back.status, 400);
    assert.match(back.body.error, /no longer in the trash/);
  } finally {
    app.close();
  }
});

/** A scheduler stand-in: the tasks the app's catalog lists. */
const scheduleWith = (tasks) => ({ catalog: async () => tasks });
const owner = (app, spec = {}) => app.services.coworkTrash.register({ owner: 'automations', label: 'Automations', ...spec });
const row = (key = 'task-1') => `group.automations.${key}`;

test('the shared trash is offered at once and ready while the trash runs; owners register and let go', async () => {
  const app = standIn({ schedule: scheduleWith([]) });
  try {
    await app.settle();
    const service = app.services.coworkTrash;
    assert.equal(service.apiVersion, 1);
    assert.equal(service.ready(), true);
    for (const bad of [{ owner: 'Bad Name', label: 'x' }, { owner: 'ok-name', label: ' ' }, null]) assert.throws(() => service.register(bad));
    const first = owner(app);
    const second = owner(app);
    await assert.rejects(first.add({ key: 'k', tab: 'automations', data: { ownerData: 1 } }), /no longer registered/, 'a second register replaces the first');
    second.dispose();
    await assert.rejects(second.add({ key: 'k', tab: 'automations', data: { ownerData: 1 } }), /no longer registered/);
  } finally {
    app.close();
  }
  const off = standIn({ noHome: true });
  try {
    assert.equal(off.services.coworkTrash.ready(), false, 'no data folder: not ready');
    await assert.rejects(owner(off).add({ key: 'k', tab: 'automations', data: {} }), /not available now.*Nothing was moved/);
  } finally {
    off.close();
  }
});

test('the shared trash never stops work in progress and leaves alone what is not safe to move, saying why', async () => {
  const busy = Object.assign(new Error('active'), { name: 'WorkspaceActiveSessionError', activity: [{ kind: 'turn' }] });
  const app = standIn({
    schedule: scheduleWith([{ target: { kind: 'session', sessionId: 'session-target' }, involvedSessionIds: ['session-named'] }]),
    archiveError: (id) => (id === 'session-busy' ? busy : undefined),
  });
  try {
    await app.settle();
    for (const id of ['session-ok', 'session-pinned', 'session-busy', 'session-target', 'session-named', 'session-open', 'session-changed']) app.make(id, { archive: false });
    app.make('session-mine');
    app.make('session-helper', { archive: false, helperOf: 'session-ok' });
    app.make('session-gone', { archive: false });
    app.pinned.push('session-pinned');
    app.inMemory.add('session-open');
    app.make('session-binned');
    await app.call('POST', { action: 'delete', sessionId: 'session-binned', title: 'B', tab: 'chat' });
    const handle = owner(app);
    const got = await handle.add({
      key: 'task-1', title: 'Morning brief', tab: 'automations',
      conversations: [
        { id: 'session-ok', archive: 'plus', ownerData: { run: 1 } }, { id: 'session-pinned', archive: 'plus' }, { id: 'session-busy', archive: 'plus' },
        { id: 'session-target', archive: 'plus' }, { id: 'session-named', archive: 'plus' }, { id: 'session-open', archive: 'plus' },
        { id: 'session-changed', archive: 'plus', expectRevision: 'an old token' }, { id: 'session-mine', archive: 'already' },
        { id: 'session-helper', archive: 'plus' }, { id: 'session-nobody', archive: 'plus' }, { id: 'session-binned', archive: 'plus' },
        { id: 'group.automations.x', archive: 'plus' },
      ],
    });
    const codes = Object.fromEntries(got.skipped.map((s) => [s.id, s.code]));
    assert.deepEqual(codes, {
      'session-pinned': 'pinned', 'session-busy': 'busy', 'session-target': 'automation-target', 'session-named': 'automation-target',
      'session-changed': 'changed', 'session-helper': 'helper', 'session-nobody': 'unknown', 'session-binned': 'in-trash', 'group.automations.x': 'bad-id',
    });
    assert.match(got.skipped.find((s) => s.code === 'busy').reason, /still working \(turn\)/);
    assert.deepEqual(got.moved.sort(), ['session-mine', 'session-ok']);
    assert.deepEqual(got.waiting, ['session-open'], 'one the app holds open waits');
    assert.ok(app.archiveCalls.every(([, options]) => options === undefined), 'never archived with stopActivity');
    assert.equal(app.archived.includes('session-pinned'), false, 'a pinned one is not archived');
    const list = (await app.call('GET')).body.items;
    const grouped = list.find((item) => item.id === row());
    assert.deepEqual([grouped.kind, grouped.count, grouped.title, grouped.tab], ['group', 3, 'Morning brief', 'automations']);
    const items = handle.items({ key: 'task-1' });
    assert.equal(items.length, 1);
    assert.deepEqual(items[0].members.map((m) => [m.id, m.state, m.archivedBy]).sort(), [['session-mine', 'moved', 'user'], ['session-ok', 'moved', 'plus'], ['session-open', 'waiting', 'plus']]);
    assert.deepEqual(items[0].members.find((m) => m.id === 'session-ok').ownerData, { run: 1 });
    assert.equal(app.services.coworkTrash.find('session-helper')?.row, row(), 'refused on its own, it went with its main conversation');
    assert.equal(app.services.coworkTrash.find('session-ok').row, row());
  } finally {
    app.close();
  }
  // Without the scheduler the trash cannot check, so it archives nothing.
  const blind = standIn({ schedule: undefined });
  try {
    await blind.settle();
    blind.make('session-ok', { archive: false });
    const got = await owner(blind).add({ key: 'k', tab: 'automations', conversations: [{ id: 'session-ok', archive: 'plus' }] });
    assert.deepEqual(got.skipped.map((s) => s.code), ['cannot-check']);
    assert.equal(blind.archived.includes('session-ok'), false);
  } finally {
    blind.close();
  }
});

test('when moving fails, the archive the trash made is undone', async () => {
  const app = standIn({ schedule: scheduleWith([]) });
  try {
    await app.settle();
    app.make('session-broken', { archive: false });
    // Its folder holds no conversation file any more: the move is refused.
    rmSync(join(app.store, 'session-broken', 'session.v4.jsonl.zstd'));
    writeFileSync(join(app.store, 'session-broken', 'other.txt'), 'x');
    const statOf = app.inner.sessionPersistence.list;
    app.inner.sessionPersistence.list = async () => [{ header: { id: 'session-broken' }, location: { kind: 'jsonl', path: join(app.store, 'session-broken', 'session.v4.jsonl.zstd') } }];
    const got = await owner(app).add({ key: 'k', tab: 'automations', conversations: [{ id: 'session-broken', archive: 'plus' }] });
    app.inner.sessionPersistence.list = statOf;
    assert.equal(got.failed[0].code, 'move-failed');
    assert.equal(app.archived.includes('session-broken'), false, 'not left archived by the trash');
    assert.equal(existsSync(join(app.store, 'session-broken', 'other.txt')), true);
  } finally {
    app.close();
  }
});

test('a group row is put back as a whole, and says which runs could not come back and why', async () => {
  const app = standIn({ schedule: scheduleWith([]) });
  try {
    await app.settle();
    for (const id of ['session-a1', 'session-a2', 'session-a3']) app.make(id, { archive: false });
    await owner(app).add({ key: 'task-1', title: 'Brief', tab: 'automations', options: { back: 'list' }, conversations: ['session-a1', 'session-a2', 'session-a3'].map((id) => ({ id, archive: 'plus' })) });
    // Something new took one run's place meanwhile.
    mkdirSync(join(app.store, 'session-a2'), { recursive: true });
    writeFileSync(join(app.store, 'session-a2', 'session.v4.jsonl.zstd'), 'a new one');
    const reply = await app.call('POST', { action: 'restore', itemId: row() });
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body.restored.back.sort(), ['session-a1', 'session-a3']);
    assert.deepEqual(reply.body.restored.left.map((l) => l.id), ['session-a2']);
    assert.match(reply.body.restored.left[0].reason, /already in its place/);
    assert.equal(app.archived.includes('session-a1'), false, "archived by the trash and asked back to the list: it is in the list again");
    assert.deepEqual(reply.body.items.find((item) => item.id === row()).ids, ['session-a2'], 'the run that stayed keeps the row');
    rmSync(join(app.store, 'session-a2'), { recursive: true });
    const nothing = await app.call('POST', { action: 'restore', itemId: 'group.automations.none' });
    assert.equal(nothing.status, 400);
    const piece = await app.call('POST', { action: 'restore', sessionId: 'piece-1234' });
    assert.equal(piece.status, 400);
  } finally {
    app.close();
  }
});

test('deleting a group row erases its runs, marks those still open with their own token, and forgets only erased ones', async () => {
  const app = standIn({ schedule: scheduleWith([]) });
  try {
    await app.settle();
    for (const id of ['session-b1', 'session-b2', 'session-open']) app.make(id, { archive: false });
    app.inMemory.add('session-open');
    await owner(app).add({ key: 'task-1', tab: 'automations', conversations: ['session-b1', 'session-b2', 'session-open'].map((id) => ({ id, archive: 'plus' })) });
    const unarchived = [];
    const real = app.inner.workspaceRegistry.unarchiveSession;
    app.inner.workspaceRegistry.unarchiveSession = async (id) => { unarchived.push(id); return real(id); };
    const shown = (await app.call('GET')).body.items.find((item) => item.id === row());
    const reply = await app.call('POST', { action: 'erase', itemId: row(), ids: shown.ids, pieces: shown.pieces });
    assert.deepEqual(reply.body.erased, { erased: 2, marked: 1, failed: 0, reasons: [] });
    assert.deepEqual(unarchived.sort(), ['session-b1', 'session-b2'], 'never the row id');
    const left = reply.body.items.find((item) => item.id === row());
    assert.deepEqual([left.count, left.erasing], [1, true], 'the open run waits, marked');
    const saved = JSON.parse(readFileSync(join(app.home, 'trash', 'conversations', 'pending.json'), 'utf8'));
    assert.match(saved[0].markedStamp, /^\d+:\d+:/);
  } finally {
    app.close();
  }
});

test('Empty trash takes rows and conversations together and counts rows', async () => {
  const app = standIn({ schedule: scheduleWith([]) });
  try {
    await app.settle();
    for (const id of ['session-c1', 'session-c2', 'session-plain']) app.make(id, { archive: false });
    await owner(app).add({ key: 'task-1', tab: 'automations', conversations: ['session-c1', 'session-c2'].map((id) => ({ id, archive: 'plus' })) });
    app.archived.push('session-plain');
    await app.call('POST', { action: 'delete', sessionId: 'session-plain', title: 'P', tab: 'automations' });
    const shown = (await app.call('GET')).body.items.find((item) => item.id === row());
    const reply = await app.call('POST', { action: 'empty', sessionIds: ['session-plain'], itemIds: [row()], shown: { [row()]: { ids: shown.ids, pieces: shown.pieces } } });
    assert.deepEqual(reply.body.emptied, { erased: 2, marked: 0, failed: 0 }, 'one conversation and one row');
    assert.deepEqual(reply.body.items, []);
    const bad = await app.call('POST', { action: 'empty', itemIds: ['session-plain'] });
    assert.equal(bad.status, 400, 'a row id must be a row label');
  } finally {
    app.close();
  }
});

test('kept data goes back through its owner: refused while the owner is off, kept with the reason when it fails, notices sent', async () => {
  const app = standIn({ schedule: scheduleWith([]) });
  try {
    await app.settle();
    app.make('session-d1', { archive: false });
    const notices = [];
    let handle = owner(app, { onNotice: (n) => notices.push(n) });
    const got = await handle.add({ key: 'task-1', title: 'Brief', tab: 'automations', conversations: [{ id: 'session-d1', archive: 'plus' }], data: { ownerData: { recipe: 'every morning' } } });
    assert.match(got.data, /^piece-/);
    // No putBack: rows with data cannot be put back, and nothing moves.
    let list = (await app.call('GET')).body.items;
    assert.equal(list[0].putBackNeeds, 'Automations');
    let reply = await app.call('POST', { action: 'restore', itemId: row() });
    assert.equal(reply.status, 400);
    assert.match(reply.body.error, /needs Automations, which is off now.*Nothing was changed/);
    assert.equal(existsSync(join(app.store, 'session-d1')), false, 'nothing moved');
    // putBack fails: the conversation comes back, the data stays with the reason.
    handle = owner(app, { putBack: async () => { throw new Error('the scheduler is busy'); }, onNotice: (n) => notices.push(n) });
    reply = await app.call('POST', { action: 'restore', itemId: row() });
    assert.deepEqual(reply.body.restored.back, ['session-d1']);
    assert.match(reply.body.restored.data.failed[0].reason, /Automations did not finish putting it back: the scheduler is busy/);
    list = reply.body.items;
    assert.deepEqual([list[0].count, list[0].data], [0, 1]);
    assert.match(list[0].lastError, /scheduler is busy/);
    // putBack works: the data is handed over and leaves the trash.
    const handed = [];
    handle = owner(app, { putBack: async (req) => { handed.push(req); return { done: req.data.map((d) => d.item), notes: ['Its old run list does not come back.'] }; }, onNotice: (n) => notices.push(n) });
    reply = await app.call('POST', { action: 'restore', itemId: row() });
    assert.deepEqual(handed[0].data[0].ownerData, { recipe: 'every morning' });
    assert.deepEqual(reply.body.restored.notes, ['Its old run list does not come back.']);
    assert.deepEqual(reply.body.items, []);
    await new Promise((done) => setTimeout(done, 20));
    assert.ok(notices.some((n) => n.type === 'put-back' && n.conversations.some((c) => c.id === 'session-d1')));
    assert.ok(notices.some((n) => n.type === 'put-back' && n.data.length === 1));
    // Gone and left notices.
    app.make('session-d2', { archive: false });
    app.make('session-d3', { archive: false });
    app.inMemory.add('session-d3');
    await handle.add({ key: 'task-2', tab: 'automations', conversations: [{ id: 'session-d2', archive: 'plus' }, { id: 'session-d3', archive: 'plus' }] });
    await app.call('POST', { action: 'erase', sessionId: 'session-d2' });
    await app.inner.workspaceRegistry.unarchiveSession('session-d3');
    await new Promise((done) => setTimeout(done, 20));
    assert.ok(notices.some((n) => n.type === 'gone' && n.why === 'erased' && n.row === row('task-2') && n.conversations[0].id === 'session-d2'));
    assert.ok(notices.some((n) => n.type === 'left' && n.why === 'unarchived' && n.conversations[0].id === 'session-d3'));
  } finally {
    app.close();
  }
});

test('an owner that throws never breaks the trash, and requests wait their turn behind the tidy-up', async () => {
  const app = standIn({
    gateFirstList: true, schedule: scheduleWith([]),
    seed: ({ store, archived, trashDir }) => {
      mkdirSync(join(store, 'session-w'), { recursive: true });
      writeFileSync(join(store, 'session-w', 'session.v4.jsonl.zstd'), 'log');
      archived.push('session-w');
      mkdirSync(trashDir, { recursive: true });
      writeFileSync(join(trashDir, 'pending.json'), JSON.stringify([{ id: 'session-w', title: 'w', deletedAt: 1, group: row(), owner: 'automations' }]));
    },
  });
  try {
    owner(app, { onNotice: () => { throw new Error('owner bug'); } });
    await app.gate.reached; // the start tidy-up holds the queue
    let answered = false;
    const request = app.call('POST', { action: 'erase', sessionId: 'session-w' }).then((reply) => { answered = true; return reply; });
    await new Promise((done) => setTimeout(done, 30));
    assert.equal(answered, false, 'it waits for the tidy-up');
    app.gate.release();
    const reply = await request;
    assert.equal(reply.status, 200, 'the owner\'s failing notice changes nothing');
    assert.deepEqual(reply.body.items, []);
    assert.ok(app.logs.some((line) => /could not take a trash notice: owner bug/.test(line)));
  } finally {
    app.gate.release();
    app.close();
  }
});

test('Delete permanently and Empty trash on a row erase only what the list showed; what came in since stays', async () => {
  const app = standIn({ schedule: scheduleWith([]) });
  try {
    await app.settle();
    for (const id of ['session-e1', 'session-e2', 'session-e3']) app.make(id, { archive: false });
    const handle = owner(app);
    await handle.add({ key: 'task-1', title: 'Brief', tab: 'automations', conversations: ['session-e1', 'session-e2'].map((id) => ({ id, archive: 'plus' })) });
    const shown = (await app.call('GET')).body.items.find((item) => item.id === row());
    assert.deepEqual([shown.count, shown.data], [2, 0], 'the list shows two conversations');
    // Meanwhile the owner adds the automation's recipe and another run to the same row.
    await handle.add({ key: 'task-1', title: 'Brief', tab: 'automations', conversations: [{ id: 'session-e3', archive: 'plus' }], data: { ownerData: { recipe: 1 } } });
    const reply = await app.call('POST', { action: 'erase', itemId: row(), ids: shown.ids, pieces: shown.pieces });
    assert.equal(reply.body.erased.erased, 2);
    const after = reply.body.items.find((item) => item.id === row());
    assert.deepEqual([after.count, after.data, after.ids], [1, 1, ['session-e3']], 'the new run and the recipe stay');
    // Empty trash likewise.
    const now = reply.body.items.find((item) => item.id === row());
    await handle.add({ key: 'task-1', tab: 'automations', data: { ownerData: { recipe: 2 } } });
    const emptied = await app.call('POST', { action: 'empty', itemIds: [row()], shown: { [row()]: { ids: now.ids, pieces: now.pieces } } });
    assert.deepEqual(emptied.body.emptied, { erased: 1, marked: 0, failed: 0 });
    assert.equal(emptied.body.items.find((item) => item.id === row()).data, 1, 'the recipe added since stays');
    const blind = await app.call('POST', { action: 'erase', itemId: row() });
    assert.equal(blind.status, 400, 'a request that names nothing erases nothing');
  } finally {
    app.close();
  }
});

test('a move that fails after part of it reached the trash keeps it archived and says so', async () => {
  const app = standIn({ schedule: scheduleWith([]) });
  try {
    await app.settle();
    app.make('session-x', { archive: false });
    // The conversation's folder cannot be moved out of its place (read-only parent): the trash has
    // already written its record when the move fails.
    chmodSync(app.store, 0o555);
    let got;
    try {
      got = await owner(app).add({ key: 'k', tab: 'automations', conversations: [{ id: 'session-x', archive: 'plus' }] });
    } finally {
      chmodSync(app.store, 0o755);
    }
    assert.equal(got.failed[0]?.code, 'move-failed');
    assert.equal(got.failed[0].inTrash, true);
    assert.match(got.failed[0].reason, /stays archived/);
    assert.equal(app.archived.includes('session-x'), true, 'not taken out of the archive while part of it is in the trash');
  } finally {
    app.close();
  }
});

test('Empty trash goes on past a row being put back, and its answer stays true', async () => {
  let release;
  const app = standIn({ schedule: scheduleWith([]) });
  try {
    await app.settle();
    for (const id of ['session-p', 'session-q', 'session-plain']) app.make(id, { archive: false });
    owner(app, { putBack: () => new Promise((done) => { release = () => done({ done: [] }); }) });
    const handle = owner(app, { putBack: () => new Promise((done) => { release = () => done({ done: [] }); }) });
    await handle.add({ key: 'slow', tab: 'automations', conversations: [{ id: 'session-p', archive: 'plus' }], data: { ownerData: 1 } });
    await handle.add({ key: 'other', tab: 'automations', conversations: [{ id: 'session-q', archive: 'plus' }] });
    app.archived.push('session-plain');
    await app.call('POST', { action: 'delete', sessionId: 'session-plain', title: 'P', tab: 'automations' });
    const items = (await app.call('GET')).body.items;
    const slow = items.find((item) => item.id === row('slow'));
    const other = items.find((item) => item.id === row('other'));
    const putting = app.call('POST', { action: 'restore', itemId: row('slow') });
    await new Promise((done) => setTimeout(done, 30)); // its owner is still putting the data back
    const reply = await app.call('POST', { action: 'empty', sessionIds: ['session-plain'], itemIds: [row('slow'), row('other')], shown: { [row('slow')]: { ids: slow.ids, pieces: slow.pieces }, [row('other')]: { ids: other.ids, pieces: other.pieces } } });
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body.emptied, { erased: 2, marked: 0, failed: 1 }, 'the plain one and the other row; the busy row is counted as not done');
    release();
    await putting;
  } finally {
    release?.();
    app.close();
  }
});

test('the trash keeps its own 30 days, and an owner sees only the rows it asks for', async () => {
  const app = standIn({ schedule: scheduleWith([]) });
  try {
    await app.settle();
    app.make('session-old', { archive: false });
    const handle = owner(app);
    const before = Date.now();
    await handle.add({ key: 'k', tab: 'automations', deletedAt: before - 40 * 86400000, conversations: [{ id: 'session-old', archive: 'plus' }] });
    const listed = (await app.call('GET')).body.items[0];
    assert.ok(listed.firstAt >= before, 'a date the owner gives is not used: the 30 days start now');
    assert.equal(handle.items({ key: 'k'.repeat(101) }).length, 0, 'a key that cannot be a row: none');
    assert.equal(handle.items({ key: 'k' }).length, 1);
  } finally {
    app.close();
  }
});

test('kept data whose conversation is now in another row can still be put back', async () => {
  const app = standIn({ schedule: scheduleWith([]) });
  try {
    await app.settle();
    app.make('session-s1', { archive: false });
    let fail = true;
    owner(app, { putBack: async (req) => { if (fail) throw new Error('busy'); return { done: req.data.map((d) => d.item) }; } });
    await owner(app, { putBack: async (req) => { if (fail) throw new Error('busy'); return { done: req.data.map((d) => d.item) }; } })
      .add({ key: 'task-1', tab: 'automations', conversations: [{ id: 'session-s1', archive: 'plus' }], data: { ownerData: { recipe: 1 } } });
    await app.call('POST', { action: 'restore', itemId: row() }); // the conversation comes back, the recipe does not
    // The user deletes that conversation again on its own: it is now a plain row.
    app.archived.push('session-s1');
    await app.call('POST', { action: 'delete', sessionId: 'session-s1', title: 'S1', tab: 'automations' });
    fail = false;
    const reply = await app.call('POST', { action: 'restore', itemId: row() });
    assert.equal(reply.status, 200);
    assert.equal(reply.body.restored.data.done.length, 1, 'the recipe goes back');
  } finally {
    app.close();
  }
});

test('a row with a folder from a newer version is neither put back nor deleted here', async () => {
  const app = standIn({ schedule: scheduleWith([]) });
  try {
    await app.settle();
    const dir = join(app.home, 'trash', 'conversations', 'piece-later');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'info.json'), JSON.stringify({ format: 2, item: 'piece-later', kind: 'folder', group: row(), owner: 'automations', title: 'Thread', deletedAt: Date.now(), tab: 'cowork', from: join(app.home, 'mine'), state: 'moved' }));
    const listed = (await app.call('GET')).body.items[0];
    assert.deepEqual([listed.data, listed.folders, listed.newer], [0, 1, true]);
    const erase = await app.call('POST', { action: 'erase', itemId: row(), ids: [], pieces: listed.pieces });
    assert.equal(erase.status, 400);
    assert.match(erase.body.error, /newer version/);
    assert.equal(existsSync(dir), true);
  } finally {
    app.close();
  }
});


// ---- Scratch (step 34): a thread's files go with it ------------------------------------------

test('deleting a Scratch thread moves its own folder too; Put back returns both', async () => {
  const cwds = new Map();
  const app = standIn({ cwds });
  try {
    await app.settle();
    const place = join(app.home, 'scratch');
    const mine = join(place, 'session-s1');
    mkdirSync(mine, { recursive: true });
    writeFileSync(join(mine, 'notes.md'), 'made in scratch');
    cwds.set('session-s1', place);
    cwds.set('session-h1', place);
    app.make('session-s1');
    app.make('session-h1', { archive: false, helperOf: 'session-s1' });
    let reply = await app.call('POST', { action: 'delete', sessionId: 'session-s1', title: 'S', tab: 'chat' });
    assert.equal(reply.status, 200);
    assert.equal(existsSync(mine), false, 'the folder went with it');
    assert.equal(reply.body.items[0].files, true, 'the row says so');
    reply = await app.call('POST', { action: 'restore', sessionId: 'session-s1' });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.equal(readFileSync(join(mine, 'notes.md'), 'utf8'), 'made in scratch');
  } finally {
    app.close();
  }
});

test('a Scratch folder another conversation still works in stays; it goes with the last one', async () => {
  const cwds = new Map();
  const app = standIn({ cwds });
  try {
    await app.settle();
    const place = join(app.home, 'scratch');
    const mine = join(place, 'session-s1');
    mkdirSync(mine, { recursive: true });
    writeFileSync(join(mine, 'shared.txt'), 'x');
    cwds.set('session-s1', place);
    cwds.set('session-copy', mine); // a Rerun copy started in the thread's working folder
    app.make('session-s1');
    app.make('session-copy');
    await app.call('POST', { action: 'delete', sessionId: 'session-s1', title: 'S', tab: 'chat' });
    assert.equal(existsSync(join(mine, 'shared.txt')), true, 'kept: the copy still uses it');
    const reply = await app.call('POST', { action: 'delete', sessionId: 'session-copy', title: 'C', tab: 'chat' });
    assert.equal(existsSync(mine), false, 'the last one takes it');
    assert.equal(reply.body.items.find((item) => item.id === 'session-copy').files, true);
    // A conversation outside Scratch never takes a folder.
    cwds.set('session-p', join(app.home, 'project'));
    mkdirSync(join(app.home, 'project'), { recursive: true });
    app.make('session-p');
    await app.call('POST', { action: 'delete', sessionId: 'session-p', title: 'P', tab: 'cowork' });
    assert.equal(existsSync(join(app.home, 'project')), true);
  } finally {
    app.close();
  }
});

test('add-ons are told of conversations deleted for good, and only of those', async () => {
  const app = standIn();
  try {
    await app.settle();
    const told = [];
    const stop = app.services.coworkTrash.onErased((ids) => told.push(...ids));
    app.make('session-a');
    app.make('session-b');
    await app.call('POST', { action: 'delete', sessionId: 'session-a', title: 'A', tab: 'chat' });
    await app.call('POST', { action: 'delete', sessionId: 'session-b', title: 'B', tab: 'chat' });
    await app.settle();
    assert.deepEqual(told, [], 'moving to the trash is not deleting for good');
    await app.call('POST', { action: 'erase', sessionId: 'session-a' });
    await app.settle();
    assert.deepEqual(told, ['session-a']);
    stop();
    await app.call('POST', { action: 'erase', sessionId: 'session-b' });
    await app.settle();
    assert.deepEqual(told, ['session-a'], 'no longer listening');
    assert.throws(() => app.services.coworkTrash.onErased('nope'), /Give a function/);
  } finally {
    app.close();
  }
});
