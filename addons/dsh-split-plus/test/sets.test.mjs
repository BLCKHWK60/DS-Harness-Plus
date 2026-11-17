/**
 * Split Plus, step 6: pane sets. A folder's panes come back; a named set keeps tabs and their order only,
 * never a permission or a sign-in. Throwaway folders only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, DATA_PATH } from '../index.js';
import { MAX_NAMED, cleanName, openSets } from '../lib/sets.js';

const folder = () => realpathSync(mkdtempSync(join(tmpdir(), 'split-plus-sets-')));

test('a folder\'s panes are kept with their conversations, tabs and order, across a restart', () => {
  const home = folder();
  try {
    const sets = openSets({ home });
    assert.equal(sets.saveFolder('/Users/me/app', [{ sessionId: 's1', mode: 'code' }, { sessionId: 's2', mode: 'research', permission: 'full-auto', token: 'x' }]), true);
    assert.equal(sets.saveFolder('relative', [{ sessionId: 's1', mode: 'code' }]), false, 'only a full path');
    assert.equal(sets.saveFolder('/Users/me/empty', []), false);
    const again = openSets({ home });
    assert.deepEqual(again.folderPanes('/Users/me/app').panes, [{ sessionId: 's1', mode: 'code' }, { sessionId: 's2', mode: 'research' }]);
    assert.equal(again.folderPanes('/Users/me/other'), null);
    const stored = readFileSync(join(home, 'sets.json'), 'utf8');
    assert.doesNotMatch(stored, /permission|full-auto|token/, 'never a permission or a sign-in');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('a named pane set keeps tabs and their order only; a name is replaced; limits hold', () => {
  const sets = openSets();
  const saved = sets.saveNamed('  Code,   Research, Chat ', [{ sessionId: 's1', mode: 'code' }, { sessionId: 's2', mode: 'research' }, { mode: 'chat' }, { mode: 'bad mode!' }]);
  assert.deepEqual(saved, { name: 'Code, Research, Chat', panes: [{ mode: 'code' }, { mode: 'research' }, { mode: 'chat' }] });
  sets.saveNamed('Code, Research, Chat', [{ mode: 'content' }]);
  assert.deepEqual(sets.namedSet('Code, Research, Chat'), [{ mode: 'content' }]);
  assert.throws(() => sets.saveNamed('', [{ mode: 'code' }]), /name/);
  assert.throws(() => sets.saveNamed('Empty', []), /at least one pane/);
  for (let n = 1; n < MAX_NAMED; n += 1) sets.saveNamed(`Set ${n}`, [{ mode: 'chat' }]);
  assert.throws(() => sets.saveNamed('One too many', [{ mode: 'chat' }]), new RegExp(`At most ${MAX_NAMED}`));
  assert.equal(sets.dropNamed('Set 1'), true);
  assert.equal(sets.dropNamed('Set 1'), false);
  assert.equal(cleanName('a'.repeat(80)).length, 60);
});

function standIn(home) {
  const routes = new Map();
  const ctx = {
    get: (name) => (name === 'settings' ? { describe: () => [{ ns: 'modes', value: { modes: { code: { label: 'Code' }, research: { label: 'Research' } } } }] }
      : name === 'modes' ? { get: (id) => ({ s1: 'code', s2: 'research' })[id] ?? 'chat', isolated: () => false } : undefined),
    on() {},
    effect: (fn) => fn(),
    inject(_names, fn) { fn({ effect: (register) => register(), webServer: { register: (route) => routes.set(route.path, route) }, connection: { requestRejection: () => undefined } }); },
    logger: { warn() {} },
  };
  apply(ctx, { enabled: true }, { home });
  return routes;
}

async function hit(routes, { method = 'GET', query = '', body } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = { method, url: `${DATA_PATH}${query}`, async *[Symbol.asyncIterator]() { yield* chunks; } };
  let text = '';
  const res = { statusCode: 200, setHeader() {}, end(value) { text = value ?? ''; } };
  await routes.get(DATA_PATH).handler(req, res);
  return { status: res.statusCode, data: text ? JSON.parse(text) : {} };
}

test('on the stand-in app: the tabs come from Modes, not from the page; a folder\'s panes and the named sets are read back', async () => {
  const home = folder();
  try {
    const routes = standIn(home);
    await hit(routes, { method: 'POST', body: { action: 'saveFolder', folder: '/Users/me/app', sessionIds: ['s1', 's2'] } });
    const read = (await hit(routes, { query: `?sets=1&folder=${encodeURIComponent('/Users/me/app')}` })).data;
    assert.deepEqual(read.folder.panes, [{ sessionId: 's1', mode: 'code' }, { sessionId: 's2', mode: 'research' }]);
    const saved = (await hit(routes, { method: 'POST', body: { action: 'saveSet', name: 'Code, Research', sessionIds: ['s1', 's2'] } })).data;
    assert.deepEqual(saved.panes, [{ mode: 'code' }, { mode: 'research' }]);
    assert.deepEqual((await hit(routes, { query: '?sets=1' })).data.named.map((set) => set.name), ['Code, Research']);
    assert.equal((await hit(routes, { method: 'POST', body: { action: 'dropSet', name: 'Code, Research' } })).data.ok, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('linked logs: which conversations were side by side and when, with the sends between them, for one conversation', async () => {
  const home = folder();
  try {
    let provided;
    const routes = new Map();
    const ctx = {
      get: (name) => (name === 'settings' ? { describe: () => [{ ns: 'modes', value: { modes: { code: { label: 'Code' }, research: { label: 'Research' } } } }] }
        : name === 'modes' ? { get: (id) => ({ s1: 'code', s2: 'research' })[id] ?? 'chat', isolated: () => false } : undefined),
      on() {},
      effect: (fn) => fn(),
      provide: (name, value) => { if (name === 'splitLinks') provided = value; return () => {}; },
      inject(_names, fn) { fn({ effect: (register) => register(), webServer: { register: (route) => routes.set(route.path, route) }, connection: { requestRejection: () => undefined } }); },
      logger: { warn() {} },
    };
    apply(ctx, { enabled: true }, { home });
    await hit(routes, { method: 'POST', body: { action: 'panes', panes: [{ id: 'a', sessionId: 's1' }, { id: 'b', sessionId: 's2' }] } });
    await hit(routes, { method: 'POST', body: { action: 'panes', panes: [{ id: 'a', sessionId: 's1' }, { id: 'b', sessionId: 's2' }] } });
    await hit(routes, { method: 'POST', body: { action: 'send', fromSessionId: 's2', toSessionId: 's1', kind: 'selection', text: 'see https://example.org' } });
    await hit(routes, { method: 'POST', body: { action: 'panes', panes: [{ id: 'a', sessionId: 's1' }] } });
    const found = provided.linksOf('s1');
    assert.equal(found.beside.length, 1, 'written once while the set did not change');
    assert.equal(found.beside[0].sessionId, 's2');
    assert.ok(found.beside[0].to >= found.beside[0].from, 'until the set changed');
    assert.deepEqual(found.sends.map((row) => [row.event, row.from, row.to]), [['sent', 's2', 's1']]);
    assert.deepEqual((await hit(routes, { query: '?links=s2' })).data.beside.map((row) => row.sessionId), ['s1']);
    assert.ok(readFileSync(join(home, 'links.jsonl'), 'utf8').trim().split('\n').length === 2);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
