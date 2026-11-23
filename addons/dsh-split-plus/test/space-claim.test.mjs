/**
 * Item 4A, stage 6a: a new pane keeps its window's space for any mode (STAGE6A-DESIGN.md, P4 Split Plus). The claim
 * carries `{space}` (Modes `apiVersion >= 2`; an older Modes gets startDraft then pick), a pane in a Recon window opens in
 * Recon's room whatever its mode, and a watcher always claims Chat (REGRESSION 21). Stand-ins only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply, DATA_PATH } from '../index.js';

function standIn({ apiVersion, spaces, refuse = '' } = {}) {
  const routes = new Map();
  const calls = [];
  const known = new Set(['s1', 's2']);
  const modes = {
    ...(apiVersion !== undefined ? { apiVersion } : {}),
    get: () => 'code',
    isolated: () => false,
    async set(id, mode, options) {
      if (!known.has(id)) throw new Error(`modes: unknown session "${id}"`);
      if (refuse) throw new Error(refuse);
      calls.push(['set', id, mode, options]);
    },
    ...(spaces ? { spaces: spaces(calls) } : {}),
  };
  const settingsRows = [{ ns: 'modes', value: { modes: { chat: { label: 'Chat' }, code: { label: 'Code' }, research: { label: 'Research' } }, extraModes: JSON.stringify({ recon: { label: 'Recon', isolated: true } }) } }];
  const ctx = {
    get: (name) => (name === 'modes' ? modes : name === 'settings' ? { describe: () => settingsRows } : undefined),
    on() {},
    effect: (fn) => fn(),
    inject(_names, fn) {
      fn({ effect: (register) => register(), webServer: { register: (route) => routes.set(route.path, route) }, connection: { requestRejection: () => undefined } });
    },
    logger: { warn() {} },
  };
  apply(ctx, { enabled: true });
  return { routes, calls };
}

async function hit(routes, body) {
  const route = routes.get(DATA_PATH);
  const chunks = [Buffer.from(JSON.stringify(body))];
  const req = { method: 'POST', url: DATA_PATH, async *[Symbol.asyncIterator]() { yield* chunks; } };
  let text = '';
  const res = { statusCode: 200, setHeader() {}, end(value) { text = value ?? ''; } };
  await route.handler(req, res);
  return { status: res.statusCode, data: text ? JSON.parse(text) : {} };
}

test('claim-with-space: Modes apiVersion 2 gets {claim, space}; an older Modes gets startDraft then pick; no space as before', async () => {
  const v2 = standIn({ apiVersion: 2 });
  assert.equal((await hit(v2.routes, { action: 'claim', sessionId: 's1', mode: 'code', space: 'devices' })).status, 200);
  assert.deepEqual(v2.calls, [['set', 's1', 'code', { claim: true, space: 'devices' }]]);

  const v1 = standIn({ apiVersion: 1, spaces: (calls) => ({ startDraft: async (id, where) => { calls.push(['startDraft', id, where]); return { claimed: true }; }, pick: async (id, mode) => { calls.push(['pick', id, mode]); } }) });
  assert.equal((await hit(v1.routes, { action: 'claim', sessionId: 's1', mode: 'research', space: 'recon' })).status, 200);
  assert.deepEqual(v1.calls, [['startDraft', 's1', { space: 'recon' }], ['pick', 's1', 'research']]);

  const none = standIn({ apiVersion: 2 });
  assert.equal((await hit(none.routes, { action: 'claim', sessionId: 's1', mode: 'code' })).status, 200);
  assert.deepEqual(none.calls, [['set', 's1', 'code', { claim: true }]], 'no space: today\'s claim');

  const odd = standIn({ apiVersion: 2 });
  await hit(odd.routes, { action: 'claim', sessionId: 's1', mode: 'code', space: 'mars' });
  assert.deepEqual(odd.calls, [['set', 's1', 'code', { claim: true }]], 'an unknown space is not passed on');
});

test('claim-with-space: Modes\' refusal reaches the page as its sentence', async () => {
  const sentence = 'Code is not ticked for Devices. Pick a mode from the Mode list.';
  const { routes } = standIn({ apiVersion: 2, refuse: sentence });
  const claimed = await hit(routes, { action: 'claim', sessionId: 's1', mode: 'code', space: 'devices' });
  assert.equal(claimed.status, 400);
  assert.equal(claimed.data.error, sentence);
});

test('place-recon-space: a Research pane in a Recon window opens in Recon\'s room; no room or another folder is refused', async () => {
  const { routes } = standIn({ apiVersion: 2 });
  const room = await hit(routes, { action: 'place', mode: 'research', space: 'recon', choice: 'same', fromCwd: '/Users/me/app', room: '/tmp/dsh-recon-room' });
  assert.deepEqual(room.data.place, { kind: 'cwd', cwd: '/tmp/dsh-recon-room' });
  const noRoom = await hit(routes, { action: 'place', mode: 'research', space: 'recon', choice: 'scratch', room: '' });
  assert.equal(noRoom.data.place.kind, 'refused');
  const other = await hit(routes, { action: 'place', mode: 'research', space: 'recon', choice: 'folder', folder: '/Users/me/app', room: '/Users/me/app' });
  assert.equal(other.data.place.kind, 'refused', 'not Recon\'s room');
  const chat = await hit(routes, { action: 'place', mode: 'research', space: 'chat', choice: 'same', fromCwd: '/Users/me/app' });
  assert.deepEqual(chat.data.place, { kind: 'cwd', cwd: '/Users/me/app' }, 'the same mode in Chat: as before');
});

test('watcher-claims-chat: the watcher claims the Chat space; only Add pane sends the window\'s space', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const watcher = client.slice(client.indexOf('async function startWatcher('), client.indexOf('Item 4A, final fix round: the modes a new pane may take'));
  assert.match(watcher, /const claim = watcherClaim\(data\);[\s\S]*startConversation\(appCtx, data, \{ mode: claim\.mode, choice: 'scratch', space: claim\.space \}\)/);
  assert.doesNotMatch(watcher, /data-cws-space/);
  const add = client.slice(client.indexOf('function AddPane('));
  assert.match(add.slice(0, add.indexOf('return h(')), /claimSpace\(offered, document\.documentElement\.getAttribute\('data-cws-space'\)[\s\S]*startConversation\(appCtx, data, \{ mode, choice, folder, from, space \}\)/);
  const start = client.slice(client.indexOf('async function startConversation('), client.indexOf('async function startWatcher('));
  assert.match(start, /action: 'claim', sessionId: child, mode, \.\.\.\(space \? \{ space \} : \{\}\)/);
  assert.match(start, /action: 'place'[^\n]*\.\.\.\(space \? \{ space \} : \{\}\)/);
});

/** The page's claim helpers, run as they are written in client.js (they use nothing from the page). */
function claimHelpers() {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const begin = client.indexOf('// ---- split-plus:claim-helpers:begin ----');
  const end = client.indexOf('// ---- split-plus:claim-helpers:end ----');
  assert.ok(begin > 0 && end > begin);
  return new Function(`${client.slice(begin, end)}\nreturn { watcherClaim, claimSpace, roomOnlyNote };`)();
}

test('watcher-claim-unticked: the watcher keeps the Chat space when the Chat mode is unticked there, in the space\'s start mode', () => {
  const { watcherClaim } = claimHelpers();
  assert.deepEqual(watcherClaim({ spaces: { chat: { modes: ['chat', 'plain', 'cowork'], start: 'plain' } } }), { mode: 'chat', space: 'chat' });
  assert.deepEqual(watcherClaim({ spaces: { chat: { modes: ['plain', 'cowork', 'research'], start: 'plain' } } }), { mode: 'plain', space: 'chat' }, 'Chat unticked: the start mode');
  assert.deepEqual(watcherClaim({ spaces: { chat: { modes: ['cowork', 'research'], start: 'gone' } } }), { mode: 'cowork', space: 'chat' }, 'the first offered mode');
  assert.deepEqual(watcherClaim({ spaces: null }), { mode: 'chat', space: 'chat' }, 'no spaces data: as before');
  assert.deepEqual(watcherClaim(undefined), { mode: 'chat', space: 'chat' });
});

test('add-pane-space: the claim carries the space only when the mode list came from it (a guarded space always)', () => {
  const { claimSpace } = claimHelpers();
  assert.equal(claimSpace({ fromSpace: true }, 'code'), 'code');
  assert.equal(claimSpace({ fromSpace: false }, 'code'), '', 'fell back to every mode: no space');
  assert.equal(claimSpace({ fromSpace: false }, 'chat'), '');
  for (const space of ['recon', 'devices', 'workshop']) assert.equal(claimSpace({ fromSpace: false }, space), space, `${space} keeps its rules`);
  assert.equal(claimSpace({ fromSpace: true }, ''), '');
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(client, /fromSpace: true \}/);
});

test('lab fix: in a Recon window the Add pane offers no folder choice (any mode opens in the room), with a note (English only)', () => {
  const { roomOnlyNote } = claimHelpers();
  assert.match(roomOnlyNote(false, 'recon', 'en'), /^In Recon, a new pane always opens in its own room folder/);
  assert.equal(roomOnlyNote(false, 'recon', 'zh-CN'), roomOnlyNote(false, 'recon', 'en'), 'English only');
  assert.match(roomOnlyNote(true, 'chat', 'en'), /sealed mode works only in its own room/);
  assert.equal(roomOnlyNote(true, 'chat', 'zh'), roomOnlyNote(true, 'chat', 'en'), 'English only');
  for (const space of ['chat', 'code', 'devices', 'workshop', '']) assert.equal(roomOnlyNote(false, space, 'en'), '', `${space}: folders offered`);
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const pane = client.slice(client.indexOf('function AddPane('), client.indexOf('/** The Split page. */'));
  assert.match(pane, /const sealed = roomNote !== '';/);
  assert.match(pane, /sealed\n?\s*\? h\('p', \{ key: 'room'/);
  assert.match(pane, /!sealed && choice === 'folder'/);
});
