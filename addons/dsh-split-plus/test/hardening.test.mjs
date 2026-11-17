/**
 * Split Plus, after the review of 17 November 2026: a tab is taken only by a new conversation; requests
 * name conversations by real ids only; a deleted conversation leaves its tray, its folder's pane set and
 * any watch; long logs are read from their end. Stand-ins and throwaway folders only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, DATA_PATH } from '../index.js';
import { isSessionId } from '../lib/panes.js';
import { openSendRoom, tailLines } from '../lib/sendroom.js';
import { openSets } from '../lib/sets.js';

const folder = () => realpathSync(mkdtempSync(join(tmpdir(), 'split-plus-hard-')));

function standIn(home) {
  const routes = new Map();
  const erased = [];
  const set = [];
  const messages = { old: [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi' }], fresh: [] };
  const ctx = {
    get: (name) => (name === 'settings' ? { describe: () => [{ ns: 'modes', value: { modes: { code: { label: 'Code' }, research: { label: 'Research' } } } }] }
      : name === 'modes' ? { get: () => 'code', isolated: () => false, set: async (id, mode) => { set.push([id, mode]); } }
        : name === 'agents' ? { get: (id) => (messages[id] ? { id, session: { deriveMessages: () => messages[id] } } : undefined), list: () => [] }
          : name === 'sessions' ? { get: (id) => ({ header: { id, cwd: home } }) } : undefined),
    on() {},
    effect: (fn) => fn(),
    inject(names, fn) {
      fn({
        effect: (register) => register(),
        webServer: { register: (route) => routes.set(route.path, route) },
        connection: { requestRejection: () => undefined },
        ...(names.includes('coworkTrash') ? { coworkTrash: { onErased: (listener) => { erased.push(listener); return () => {}; } } } : {}),
      });
    },
    logger: { warn() {} },
  };
  apply(ctx, { enabled: true }, { home });
  return { routes, erased, set };
}
async function hit(routes, { method = 'GET', query = '', body } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = { method, url: `${DATA_PATH}${query}`, async *[Symbol.asyncIterator]() { yield* chunks; } };
  let text = '';
  const res = { statusCode: 200, setHeader() {}, end(value) { text = value ?? ''; } };
  await routes.get(DATA_PATH).handler(req, res);
  return { status: res.statusCode, data: text ? JSON.parse(text) : {} };
}

test('only a new, empty conversation takes its tab from the Split page', async () => {
  const home = folder();
  try {
    const { routes, set } = standIn(home);
    assert.equal((await hit(routes, { method: 'POST', body: { action: 'claim', sessionId: 'fresh', mode: 'research' } })).status, 200);
    const old = await hit(routes, { method: 'POST', body: { action: 'claim', sessionId: 'old', mode: 'research' } });
    assert.equal(old.status, 400);
    assert.match(old.data.error, /Only a new, empty conversation/);
    assert.deepEqual(set, [['fresh', 'research']]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('requests name conversations by real ids only; no id is special to the stores', async () => {
  assert.equal(isSessionId('session-1a2b'), true);
  for (const bad of ['__proto__', 'constructor', 'a/b', '', 'x'.repeat(201), '../etc']) assert.equal(isSessionId(bad), false, bad);
  const home = folder();
  try {
    const { routes } = standIn(home);
    assert.match((await hit(routes, { query: '?tray=__proto__' })).data.error, /not a conversation id/);
    assert.match((await hit(routes, { query: '?files=../x' })).data.error, /not a conversation id/);
    assert.match((await hit(routes, { method: 'POST', body: { action: 'send', fromSessionId: '__proto__', toSessionId: 'c1', kind: 'selection', text: 'x' } })).data.error, /not a conversation id/);
    assert.match((await hit(routes, { method: 'POST', body: [1, 2] })).data.error, /an object/);
    // A stored tray or pane set with such a key from an old file is plain data, never the object's prototype.
    writeFileSync(join(home, 'tray.json'), '{"__proto__":[{"id":"X","card":"c"}],"ok":[]}');
    const room = openSendRoom({ home });
    assert.deepEqual(room.trayOf('__proto__').map((card) => card.id), ['X']);
    assert.equal({}.polluted, undefined);
    // Even a send to such an id (refused at the door above) is kept as data and survives a restart.
    const empty = folder();
    try {
      openSendRoom({ home: empty }).send({ from: { sessionId: 'a', label: 'A' }, to: { sessionId: '__proto__', label: 'B' }, kind: 'selection', text: 'kept' });
      assert.deepEqual(openSendRoom({ home: empty }).trayOf('__proto__').map((card) => card.preview), ['kept']);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
    writeFileSync(join(home, 'sets.json'), '{"folders":{"__proto__":{"panes":[{"sessionId":"a","mode":"code"}],"at":1}},"named":{}}');
    const sets = openSets({ home });
    assert.deepEqual(sets.folderPanes('__proto__')?.panes, [{ sessionId: 'a', mode: 'code' }]);
    assert.equal(sets.folderPanes('/nowhere'), null);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('a conversation deleted for good leaves its tray, its folder\'s pane set and its watch; its sends stay in the ledger', async () => {
  const home = folder();
  try {
    const { routes, erased } = standIn(home);
    assert.equal(erased.length, 1, 'Split Plus listens for deleted conversations');
    await hit(routes, { method: 'POST', body: { action: 'send', fromSessionId: 'c1', toSessionId: 'gone', kind: 'selection', text: 'for later' } });
    assert.equal((await hit(routes, { query: '?tray=gone' })).data.tray.length, 1);
    await hit(routes, { method: 'POST', body: { action: 'saveFolder', folder: home, sessionIds: ['gone', 'stays'] } });
    await hit(routes, { method: 'POST', body: { action: 'watch', watcher: 'w1', watched: 'gone' } });
    await erased[0](['gone']);
    assert.deepEqual((await hit(routes, { query: '?tray=gone' })).data.tray, []);
    const panes = (await hit(routes, { query: `?sets=1&folder=${encodeURIComponent(home)}` })).data.folder?.panes ?? [];
    assert.deepEqual(panes.map((row) => row.sessionId), ['stays']);
    assert.deepEqual(JSON.parse(readFileSync(join(home, 'watchers.json'), 'utf8')), {});
    assert.ok((await hit(routes, { query: '?ledger=1' })).data.sends.some((row) => row.to === 'gone'), 'the ledger keeps its history');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('a long ledger is read from its end, never whole', () => {
  const home = folder();
  try {
    const file = join(home, 'sends.jsonl');
    for (let index = 0; index < 2000; index += 1) appendFileSync(file, `${JSON.stringify({ n: index, pad: 'x'.repeat(100) })}\n`);
    const lines = tailLines(file, 10_000);
    assert.ok(lines.length > 0 && lines.length < 100);
    assert.equal(JSON.parse(lines.at(-1)).n, 1999);
    for (const line of lines) assert.doesNotThrow(() => JSON.parse(line), 'the first, cut line is left out');
    assert.equal(openSendRoom({ home }).ledger(5).at(-1).n, 1999);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
