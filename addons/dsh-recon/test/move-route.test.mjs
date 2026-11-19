// The Move route and the two privacy files, RUN (not read as text): the cloud refusal, the preview first, the model the
// new conversation will really use, clean-up after a failed move, and a damaged door.json / wipe.json.
// Stand-in services; the room is a throwaway folder; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDoor } from '../lib/door.js';
import { openWipeList, salvage } from '../lib/wipe.js';
import { loadRecon } from './fixtures/room.mjs';

const { apply, Config, ROOM, DOOR_PATH, STATE_PATH } = await loadRecon();
const userMessage = (text) => ({ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] });
const CLOUD = { provider: 'cloudp', model: 'big' };
const LOCAL = { provider: 'localp', model: 'small' };

/**
 * Recon on stand-ins. `childModel` is the new conversation's model BEFORE the tab claims it; `afterClaim` is what the
 * claim gives it (the tab's own model), so the order of claim and cloud check can be seen.
 */
function start({ cloudModels = 'never', childModel = LOCAL, afterClaim, prepare } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'recon-move-home-'));
  const out = mkdtempSync(join(tmpdir(), 'recon-move-out-'));
  prepare?.(home);
  const routes = {};
  const handlers = {};
  const provided = {};
  const calls = [];
  let current = childModel;
  const recon = { id: 'r1', header: { cwd: ROOM }, session: { header: { cwd: ROOM }, deriveMessages: () => [userMessage('Look into Acme.')] }, model: { current: () => undefined } };
  const child = { id: 'n1', header: {}, session: { header: {}, deriveMessages: () => [] }, model: { current: () => current } };
  const modeOf = { r1: { mode: 'recon', isolated: true } };
  const services = {
    dshHomePath: (...parts) => join(home, ...parts),
    settings: { describe: () => [{ ns: 'modes', value: { extraModes: '{}', sessionIsolated: '{}', defaultMode: 'cowork' } }, { ns: 'llm-pi-ai', value: { providers: { cloudp: { baseURL: 'https://api.example.com/v1', displayName: 'Example Cloud' }, localp: { baseURL: 'http://localhost:1234/v1' } } } }], mutate: async () => {} },
    modes: {
      get: (id) => modeOf[id]?.mode,
      isolated: (id) => modeOf[id]?.isolated === true,
      list: () => [{ id: 'cowork', label: 'Cowork' }, { id: 'recon', label: 'Recon' }],
      set: async (id, mode, options) => { calls.push(['claim', id, mode, options]); modeOf[id] = { mode, isolated: false }; if (afterClaim) current = afterClaim; },
    },
    tools: { register: () => () => {}, guard: () => () => {} },
    commands: { register: () => () => {} },
    webServer: { register: (spec) => { routes[spec.path] = spec.handler; return () => {}; } },
    connection: { requestRejection: () => undefined },
    sessionPersistence: { list: async () => [] },
    sessionQuery: { readSurface: async () => ({ session: {}, events: [] }), listSessions: async () => [], readTitleSnapshots: async () => [] },
    agents: { get: (id) => ({ r1: recon, n1: child })[id] },
    approval: { request: async () => 'allowed-once' },
  };
  const ctx = {
    ...services,
    logger: { warn: () => {}, info: () => {}, error: () => {} },
    effect: (fn) => { fn(); },
    get: (name) => services[name],
    inject: (_names, callback) => callback(ctx),
    on: (name, listener) => { (handlers[name] ??= []).push(listener); return () => {}; },
    provide: (name, value) => { provided[name] = value; return () => {}; },
  };
  apply(ctx, Config({ enabled: true, cloudModels }));
  const route = async (method, query, body, path = DOOR_PATH) => {
    let text = '';
    const res = { statusCode: 200, setHeader() {}, end: (value) => { text = value; } };
    const req = { method, url: `${path}?${new URLSearchParams(query ?? {})}`, async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)); } };
    await routes[path](req, res);
    return { status: res.statusCode, json: JSON.parse(text || '{}') };
  };
  const move = (extra = {}) => route('POST', {}, { action: 'move', session: 'r1', tab: 'cowork', sessionId: 'n1', folder: out, consent: true, title: 'Acme', ...extra });
  return { home, out, route, move, calls, provided, handlers, child, close: () => { try { chmodSync(join(home, 'recon'), 0o700); } catch { /* not there */ } rmSync(home, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); } };
}

test('the move needs the preview first: without the user\'s yes nothing is claimed, written or recorded', async () => {
  const app = start({ cloudModels: 'always' });
  try {
    const refused = await app.move({ consent: false });
    assert.equal(refused.status, 400);
    assert.match(refused.json.error, /needs the preview window first/);
    assert.deepEqual(app.calls, [], 'the new conversation was not even claimed');
    assert.deepEqual(readdirSync(app.out), [], 'no folder was made');
    assert.equal(existsSync(join(app.home, 'recon', 'door.json')), false, 'nothing recorded');
    assert.equal((await app.route('POST', {}, { action: 'move', session: 'r1', tab: 'cowork', sessionId: 'n1', folder: app.out, title: 'x' })).status, 400, 'consent missing altogether');
  } finally {
    app.close();
  }
});

test('Never: a cloud model is refused with the plain reason, and nothing is written or recorded', async () => {
  const app = start({ cloudModels: 'never', childModel: CLOUD });
  try {
    const refused = await app.move();
    assert.equal(refused.status, 400);
    assert.match(refused.json.error, /^Nothing was moved\./);
    assert.match(refused.json.error, /Cloud models are switched off for Recon/);
    assert.deepEqual(readdirSync(app.out), [], 'no folder, no summary');
    assert.equal(existsSync(join(app.home, 'recon', 'door.json')), false);
    assert.deepEqual(app.provided.reconMoved.list(), []);
  } finally {
    app.close();
  }
});

test('Ask: a cloud model is refused until the window\'s agreement is ticked, then the move goes through', async () => {
  const app = start({ cloudModels: 'ask', childModel: CLOUD });
  try {
    const refused = await app.move();
    assert.equal(refused.status, 400);
    assert.match(refused.json.error, /Tick the agreement in the window/);
    assert.deepEqual(readdirSync(app.out), []);
    const allowed = await app.move({ agreeCloud: true });
    assert.equal(allowed.status, 200, JSON.stringify(allowed.json));
    assert.deepEqual(app.provided.reconMoved.list(), ['n1']);
  } finally {
    app.close();
  }
});

test('the cloud check uses the model the new conversation has AFTER its tab claimed it', async () => {
  // It starts on a local model, the tab gives it a cloud one: refused (the old order would have let it through).
  const a = start({ cloudModels: 'never', childModel: LOCAL, afterClaim: CLOUD });
  try {
    assert.match((await a.move()).json.error, /^Nothing was moved\./);
    assert.equal(a.calls[0][0], 'claim', 'the claim came first');
    assert.deepEqual(readdirSync(a.out), []);
  } finally {
    a.close();
  }
  // It starts on a cloud model, the tab gives it a local one: allowed (it will not use the cloud one).
  const b = start({ cloudModels: 'never', childModel: CLOUD, afterClaim: LOCAL });
  try {
    const done = await b.move();
    assert.equal(done.status, 200, JSON.stringify(done.json));
  } finally {
    b.close();
  }
});

test('a good move: summary.md is written, the move is recorded, Sync is told, and the draft carries no page text', async () => {
  const app = start({ cloudModels: 'never', childModel: LOCAL });
  try {
    const done = await app.move({ full: true });
    assert.equal(done.status, 200, JSON.stringify(done.json));
    assert.ok(existsSync(join(done.json.folder, 'summary.md')));
    assert.ok(existsSync(join(done.json.folder, 'conversation.md')));
    assert.match(done.json.draft, /summary\.md/);
    assert.deepEqual(app.provided.reconMoved.list(), ['n1']);
    assert.equal(app.provided.reconMoved.damaged(), false);
    assert.match(readFileSync(join(app.home, 'recon', 'door.json'), 'utf8'), /"n1"/);
  } finally {
    app.close();
  }
});

test('a move that fails halfway leaves no files behind, not even the folder it made', async () => {
  const app = start({
    cloudModels: 'always',
    // The record cannot be written (its folder is read-only), which is the last step after the files are written.
    prepare: (home) => { mkdirSync(join(home, 'recon'), { recursive: true }); chmodSync(join(home, 'recon'), 0o500); },
  });
  try {
    const parent = join(app.out, 'made-for-this-move');
    const failed = await app.move({ folder: parent, full: true });
    assert.equal(failed.status, 400);
    assert.deepEqual(readdirSync(app.out), [], 'neither the move folder nor the folder made for it remains');
    assert.deepEqual(app.provided.reconMoved.list(), []);
    // An existing parent stays; only the move's own folder goes.
    const again = await app.move({ full: true });
    assert.equal(again.status, 400);
    assert.deepEqual(readdirSync(app.out), []);
  } finally {
    app.close();
  }
});

test('a damaged door.json is kept aside, never overwritten, nothing is moved, and every conversation counts as private (fail closed)', async () => {
  const damaged = '{"exports":[{"id":"E1","what":"move","to":[{"kind":"conversation","id":"moved-1"';
  const app = start({ cloudModels: 'never', childModel: LOCAL, prepare: (home) => { mkdirSync(join(home, 'recon'), { recursive: true }); writeFileSync(join(home, 'recon', 'door.json'), damaged); } });
  try {
    const refused = await app.move();
    assert.equal(refused.status, 400);
    assert.match(refused.json.error, /door\.json\) is damaged/);
    assert.match(refused.json.error, /Fix the file by hand from the copy, or delete door\.json/);
    assert.equal(readFileSync(join(app.home, 'recon', 'door.json'), 'utf8'), damaged, 'the damaged file is exactly as it was');
    const copies = readdirSync(join(app.home, 'recon')).filter((name) => name.startsWith('door.json.damaged-'));
    assert.equal(copies.length, 1);
    assert.equal(readFileSync(join(app.home, 'recon', copies[0]), 'utf8'), damaged);
    assert.deepEqual(readdirSync(app.out), [], 'nothing was written');
    assert.equal(app.provided.reconMoved.damaged(), true, 'Sync is told it cannot know');
    assert.equal(app.provided.reconExports.has('any-conversation'), true, 'every conversation counts as holding an export');
    // The user is told in plain words on the Recon page.
    const state = await app.route('GET', { session: 'r1' }, undefined, STATE_PATH);
    assert.match(state.json.problem, /door\.json\) is damaged/);
    // A conversation on a cloud model that Recon says Never to is stopped (fail closed), with the reason.
    const stops = [];
    for (const handler of app.handlers['agent/pre-step'] ?? []) {
      try {
        await handler({ agent: { id: 'ordinary', header: {} }, modelSelection: CLOUD }, async () => ({ kind: 'continue' }));
      } catch (error) {
        stops.push(String(error.message));
      }
    }
    assert.ok(stops.some((text) => /door\.json\) is damaged/.test(text)), stops.join(' | '));
    // Repaired by deleting it: back to normal.
    rmSync(join(app.home, 'recon', 'door.json'));
    assert.equal(app.provided.reconMoved.damaged(), false);
    assert.equal((await app.move()).status, 200);
  } finally {
    app.close();
  }
});

test('door.json: damaged twice in one second keeps both copies; a file that cannot be copied is left alone and refuses writes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'recon-door-damaged-'));
  try {
    const file = join(dir, 'door.json');
    writeFileSync(file, 'broken one');
    const door = openDoor(file);
    assert.match(door.problem(), /is damaged/);
    assert.throws(() => door.add({ id: 'E1', at: 1, what: 'move', from: 'r1', to: [], addresses: [] }), /door\.json/);
    assert.equal(readFileSync(file, 'utf8'), 'broken one');
    writeFileSync(file, 'broken two');
    assert.match(openDoor(file).problem(), /is damaged/);
    const copies = readdirSync(dir).filter((name) => name.includes('.damaged-'));
    assert.equal(copies.length, 2, 'a second damage never replaces the first copy');
    assert.deepEqual(copies.map((name) => readFileSync(join(dir, name), 'utf8')).sort(), ['broken one', 'broken two']);
    // A valid file is read as before.
    writeFileSync(file, JSON.stringify({ exports: [{ id: 'E2', to: [{ kind: 'conversation', id: 'c9' }], addresses: [] }] }));
    const fine = openDoor(file);
    assert.equal(fine.problem(), '');
    assert.equal(fine.has('c9'), true);
    assert.equal(fine.has('other'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('wipe.json: a damaged list keeps a copy, keeps the ids still plainly there, tells the user, and is never lost', () => {
  const dir = mkdtempSync(join(tmpdir(), 'recon-wipe-damaged-'));
  try {
    const file = join(dir, 'wipe.json');
    const text = '["session-aaa111","session-bbb222","session-cc';
    writeFileSync(file, text);
    const list = openWipeList(file);
    assert.deepEqual(list.list(), ['session-aaa111', 'session-bbb222'], 'the ended conversations still go');
    assert.match(list.problem(), /wipe\.json\) was damaged\. A copy was kept as .*wipe\.json\.damaged-/);
    assert.match(list.problem(), /2 ended conversations were recovered/);
    const copies = readdirSync(dir).filter((name) => name.startsWith('wipe.json.damaged-'));
    assert.equal(copies.length, 1);
    assert.equal(readFileSync(join(dir, copies[0]), 'utf8'), text, 'the original text is safe before anything is saved');
    list.add('session-ddd444');
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), ['session-aaa111', 'session-bbb222', 'session-ddd444']);
    // Not an array at all: no id can be trusted; the copy is kept and the user told.
    writeFileSync(file, '{"oops": true}');
    const none = openWipeList(file);
    assert.deepEqual(none.list(), []);
    assert.match(none.problem(), /0 ended conversations were recovered/);
    assert.equal(readdirSync(dir).filter((name) => name.startsWith('wipe.json.damaged-')).length, 2);
    // A good file: no problem.
    writeFileSync(file, '["session-eee555"]');
    assert.equal(openWipeList(file).problem(), '');
    assert.deepEqual(salvage('["abcdef1", 5, "abcdef2"]'), ['abcdef1'], 'only the leading run of ids is trusted');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('wipe.json that cannot be copied aside is not written over', { skip: process.getuid?.() === 0 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'recon-wipe-locked-'));
  try {
    const file = join(dir, 'wipe.json');
    writeFileSync(file, '["session-aaa111","bro');
    chmodSync(dir, 0o500);
    const list = openWipeList(file);
    assert.match(list.problem(), /No copy could be made/);
    assert.throws(() => list.add('session-new999'), /No copy could be made/);
    chmodSync(dir, 0o700);
    assert.equal(readFileSync(file, 'utf8'), '["session-aaa111","bro', 'left exactly as it was');
  } finally {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
});
