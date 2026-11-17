/**
 * Split Plus, step 1: the pane rules (lib/panes.js) and the server half on a stand-in app.
 * Stand-ins only: no real app, no real app data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, DATA_PATH } from '../index.js';
import { MAX_PANES, abbreviation, cleanPanes, folderLabel, paneState, placeOfNewPane, sameFolder } from '../lib/panes.js';

test('a saved pane list is cleaned: bad rows out, each conversation once, at most four', () => {
  const panes = cleanPanes([
    { id: 'a', sessionId: 's1' },
    { id: 'b', sessionId: 's1' },
    { id: 'bad id!', sessionId: 's2' },
    { id: 'c', sessionId: '' },
    null,
    { id: 'd', sessionId: 's3', extra: 'dropped' },
    { id: 'e', sessionId: 's4' },
    { id: 'f', sessionId: 's5' },
    { id: 'g', sessionId: 's6' },
  ]);
  assert.deepEqual(panes, [{ id: 'a', sessionId: 's1' }, { id: 'd', sessionId: 's3' }, { id: 'e', sessionId: 's4' }, { id: 'f', sessionId: 's5' }]);
  assert.equal(panes.length, MAX_PANES);
  assert.deepEqual(cleanPanes('nonsense'), []);
});

test('a new pane opens in the same folder as the pane it is split from', () => {
  assert.deepEqual(placeOfNewPane({ from: { cwd: '/Users/me/app' }, choice: 'same', sealedMode: false }), { kind: 'cwd', cwd: '/Users/me/app' });
  assert.deepEqual(placeOfNewPane({ from: { cwd: '' }, choice: 'same', sealedMode: false }), { kind: 'scratch' });
  assert.deepEqual(placeOfNewPane({ from: { cwd: '/Users/me/app' }, choice: 'scratch', sealedMode: false }), { kind: 'scratch' });
  assert.deepEqual(placeOfNewPane({ choice: 'folder', folder: '/Users/me/other', sealedMode: false }), { kind: 'cwd', cwd: '/Users/me/other' });
  assert.equal(placeOfNewPane({ choice: 'folder', folder: 'relative/path', sealedMode: false }).kind, 'refused');
});

test('Recon never shares a folder: its pane opens in its room, and no other pane opens there', () => {
  const room = '/private/tmp/dsh-recon-room';
  assert.deepEqual(placeOfNewPane({ from: { cwd: '/Users/me/app' }, choice: 'same', sealedMode: true, room }), { kind: 'cwd', cwd: room });
  assert.equal(placeOfNewPane({ choice: 'same', sealedMode: true, room: '' }).kind, 'refused');
  // A pane split from a Recon pane, or from a folder that is Recon's room, gets a scratch thread instead.
  assert.deepEqual(placeOfNewPane({ from: { cwd: room, sealed: true }, choice: 'same', sealedMode: false, room }), { kind: 'scratch' });
  assert.deepEqual(placeOfNewPane({ from: { cwd: '/tmp/dsh-recon-room/' }, choice: 'same', sealedMode: false, room }), { kind: 'scratch' });
  assert.equal(placeOfNewPane({ choice: 'folder', folder: '/tmp/dsh-recon-room', sealedMode: false, room }).kind, 'refused');
  assert.ok(sameFolder('/private/tmp/x/', '/tmp/x'));
  assert.ok(!sameFolder('', ''));
});

test('titles: folder names, short letters and states', () => {
  assert.equal(folderLabel('/Users/me/Projects/app/'), 'app');
  assert.equal(folderLabel('/Users/me/.dsh/scratch/abc123'), 'Scratch');
  assert.equal(folderLabel(''), '');
  assert.equal(abbreviation('Code'), 'Cod');
  assert.notEqual(abbreviation('Content'), abbreviation('Code'));
  assert.notEqual(abbreviation('Research'), abbreviation('Recon'));
  assert.equal(abbreviation('Creator Plus'), 'CP');
  assert.equal(abbreviation('deep research tab mode'), 'DRT');
  assert.equal(abbreviation(''), '?');
  assert.equal(paneState({ running: true }), 'working');
  assert.equal(paneState({ running: true, waiting: true }), 'waiting');
  assert.equal(paneState({ blank: true }), 'new');
  assert.equal(paneState({}), 'done');
});

/** A stand-in app: Modes, settings and the web server, nothing real. */
function standIn({ enabled = true, isolated = new Set(), modesOn = true } = {}) {
  const routes = new Map();
  const set = [];
  const known = new Set(['s1', 's2', 'r1']);
  const modes = {
    get: (id) => (id === 'r1' ? 'recon' : id === 's2' ? 'research' : 'code'),
    isolated: (id) => isolated.has(id) || id === 'r1',
    async set(id, mode, options) {
      if (!known.has(id)) throw new Error(`modes: unknown session "${id}"`);
      set.push([id, mode, options]);
    },
  };
  const settingsRows = [{ ns: 'modes', value: { modes: { chat: { label: 'Chat' }, code: { label: 'Code' }, research: { label: 'Research' } }, extraModes: JSON.stringify({ recon: { label: 'Recon', isolated: true } }) } }];
  const ctx = {
    get: (name) => (name === 'modes' ? (modesOn ? modes : undefined) : name === 'settings' ? { describe: () => settingsRows } : undefined),
    on() {},
    effect: (fn) => fn(),
    inject(_names, fn) {
      fn({ effect: (register) => register(), webServer: { register: (route) => routes.set(route.path, route) }, connection: { requestRejection: () => undefined } });
    },
    logger: { warn() {} },
  };
  apply(ctx, { enabled, localAtOnce: 9, watcherModel: 'local/small' });
  return { routes, set, known };
}

async function hit(routes, { method = 'GET', query = '', body } = {}) {
  const route = routes.get(DATA_PATH);
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = { method, url: `${DATA_PATH}${query}`, async *[Symbol.asyncIterator]() { yield* chunks; } };
  let text = '';
  const res = { statusCode: 200, setHeader() {}, end(value) { text = value ?? ''; } };
  await route.handler(req, res);
  return { status: res.statusCode, data: text ? JSON.parse(text) : {} };
}

test('the server tells the page each pane\'s mode, short letters, folder and seal', async () => {
  const { routes } = standIn();
  const { data } = await hit(routes, { query: `?sessions=s1,s2,r1&cwds=${encodeURIComponent(JSON.stringify({ s1: '/Users/me/app' }))}` });
  assert.equal(data.enabled, true);
  assert.equal(data.localAtOnce, 4, 'the limit is held to 1 to 4');
  assert.equal(data.watcherModel, 'local/small');
  assert.deepEqual(data.modes.map((row) => row.id), ['chat', 'code', 'research', 'recon']);
  assert.equal(data.modes.find((row) => row.id === 'recon').sealed, true);
  assert.deepEqual(data.panes.s1, { mode: 'code', label: 'Code', abbr: 'Cod', sealed: false, folder: 'app' });
  assert.equal(data.panes.s2.label, 'Research');
  assert.equal(data.panes.r1.sealed, true);
});

test('switched off: the page learns nothing about conversations and cannot set a mode', async () => {
  const { routes, set } = standIn({ enabled: false });
  const { data } = await hit(routes, { query: '?sessions=s1' });
  assert.equal(data.enabled, false);
  assert.deepEqual(data.panes, {});
  assert.deepEqual(data.modes, []);
  const claimed = await hit(routes, { method: 'POST', body: { action: 'claim', sessionId: 's1', mode: 'code' } });
  assert.equal(claimed.status, 400);
  assert.match(claimed.data.error, /switched off/);
  assert.equal(set.length, 0);
});

test('a new pane takes its mode through Modes\' own move, waiting for the conversation to appear', async () => {
  const { routes, set, known } = standIn();
  setTimeout(() => known.add('late'), 300);
  const claimed = await hit(routes, { method: 'POST', body: { action: 'claim', sessionId: 'late', mode: 'research' } });
  assert.equal(claimed.status, 200);
  assert.deepEqual(set, [['late', 'research', { claim: true }]]);
});

test('without the Modes add-on a pane cannot take a mode, and says why', async () => {
  const { routes } = standIn({ modesOn: false });
  const claimed = await hit(routes, { method: 'POST', body: { action: 'claim', sessionId: 's1', mode: 'code' } });
  assert.equal(claimed.status, 400);
  assert.match(claimed.data.error, /Modes add-on is not running/);
  const { data } = await hit(routes, { query: '?sessions=s1' });
  assert.equal(data.panes.s1.sealed, true, 'without Modes nobody can tell which conversation is Recon\'s: each counts as sealed');
});

test('where a new pane opens is decided on the server: a Recon pane only in its room', async () => {
  const { routes } = standIn();
  const recon = await hit(routes, { method: 'POST', body: { action: 'place', mode: 'recon', choice: 'same', fromCwd: '/Users/me/app', room: '/tmp/dsh-recon-room' } });
  assert.deepEqual(recon.data.place, { kind: 'cwd', cwd: '/tmp/dsh-recon-room' });
  const fromRecon = await hit(routes, { method: 'POST', body: { action: 'place', mode: 'code', choice: 'same', fromCwd: '/tmp/dsh-recon-room', fromSessionId: 'r1', room: '/tmp/dsh-recon-room' } });
  assert.deepEqual(fromRecon.data.place, { kind: 'scratch' });
  const same = await hit(routes, { method: 'POST', body: { action: 'place', mode: 'code', choice: 'same', fromCwd: '/Users/me/app', fromSessionId: 's1' } });
  assert.deepEqual(same.data.place, { kind: 'cwd', cwd: '/Users/me/app' });
  const bad = await hit(routes, { method: 'POST', body: { action: 'nonsense' } });
  assert.equal(bad.status, 400);
});

test('live settings the app hands over as holders are read through', async () => {
  const routes = new Map();
  const holder = (value) => Object.freeze({ get: () => value });
  apply({
    get: () => undefined,
    on() {},
    effect: (fn) => fn(),
    inject(_names, fn) { fn({ effect: (register) => register(), webServer: { register: (route) => routes.set(route.path, route) }, connection: { requestRejection: () => undefined } }); },
  }, { enabled: holder(true), localAtOnce: holder(2), watcherModel: holder('local/small') });
  const { data } = await hit(routes, {});
  assert.equal(data.enabled, true);
  assert.equal(data.localAtOnce, 2);
  assert.equal(data.watcherModel, 'local/small');
});

test('a pane opened from a conversation that sits in Recon\'s room never opens there, whatever its own tab', async () => {
  const room = '/private/tmp/dsh-recon-lab';
  assert.deepEqual(placeOfNewPane({ from: { cwd: room }, choice: 'same', sealedMode: false, rooms: [room] }), { kind: 'scratch' });
  assert.deepEqual(placeOfNewPane({ from: { cwd: '/tmp/dsh-recon-lab/inner' }, choice: 'same', sealedMode: false, rooms: [room] }), { kind: 'scratch' });
  assert.equal(placeOfNewPane({ choice: 'folder', folder: '/tmp/dsh-recon-lab/x', sealedMode: false, rooms: [room] }).kind, 'refused');
  assert.deepEqual(placeOfNewPane({ from: { cwd: '/tmp/recon-labs-other' }, choice: 'same', sealedMode: false, rooms: [room] }), { kind: 'cwd', cwd: '/tmp/recon-labs-other' });
  // Any folder of Recon's, in any capitals, even one the page did not list.
  assert.deepEqual(placeOfNewPane({ from: { cwd: '/tmp/DSH-Recon-Other/x' }, choice: 'same', sealedMode: false, rooms: [] }), { kind: 'scratch' });
  assert.equal(placeOfNewPane({ choice: 'folder', folder: '/Users/me/dsh-RECON-room', sealedMode: false, rooms: [] }).kind, 'refused');
  // A Recon pane only in a room of Recon's, whatever the page says its room is.
  assert.equal(placeOfNewPane({ choice: 'same', sealedMode: true, room: '/Users/me' }).kind, 'refused');
  const { routes } = standIn();
  const placed = await hit(routes, { method: 'POST', body: { action: 'place', mode: 'code', choice: 'same', fromCwd: room, fromSessionId: 's1', rooms: [room] } });
  assert.deepEqual(placed.data.place, { kind: 'scratch' });
  // The server checks the real path: a link to Recon's room is Recon's room.
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'split-place-')));
  try {
    mkdirSync(join(base, 'dsh-recon-x'));
    symlinkSync(join(base, 'dsh-recon-x'), join(base, 'plain'));
    const viaLink = await hit(routes, { method: 'POST', body: { action: 'place', mode: 'code', choice: 'folder', folder: join(base, 'plain') } });
    assert.equal(viaLink.data.place.kind, 'refused');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
