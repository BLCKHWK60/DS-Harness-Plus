import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { EMPTY_MAX, TRASH_PATH, apply } from '../index.js';

/**
 * The add-on's trash part against a stand-in app, in a throwaway folder: stored conversations are
 * folders under `<home>/sessions/proj/<id>`, listed from disk on every call as the app does.
 */
function standIn({ seed, gateFirstList = false } = {}) {
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
  const fire = async (name, payload) => { for (const fn of listeners[name] ?? []) await fn(payload); };
  // Like the app's token: the file's size and times.
  const snapOf = (id) => {
    const path = join(store, id, 'session.v4.jsonl.zstd');
    const st = statSync(path);
    return { header: { id }, revision: `${st.ino}:${st.size}:${st.mtimeMs}`, location: { kind: 'jsonl', path } };
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
      archiveSession: async (id) => { if (!archived.includes(id)) archived.push(id); },
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
    provide() {},
    on() {},
    get: (name) => (name === 'dshHomePath' ? (...parts) => join(home, ...parts) : undefined),
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
  const make = (id) => {
    mkdirSync(join(store, id), { recursive: true });
    writeFileSync(join(store, id, 'session.v4.jsonl.zstd'), `log of ${id}`);
    archived.push(id);
    return join(store, id);
  };
  const settle = () => new Promise((done) => setTimeout(done, 30));
  const close = () => { for (const off of disposers) off(); rmSync(home, { recursive: true, force: true }); };
  return { home, store, inner, inMemory, archived, call, make, settle, close, logs, gate };
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

test('put back while the tidy-up is about to move it: it stays where it is', async () => {
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
    const reply = await app.call('POST', { action: 'restore', sessionId: 'session-x' });
    assert.deepEqual(reply.body.items, []);
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
