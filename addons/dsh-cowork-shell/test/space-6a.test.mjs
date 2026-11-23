// Item 4A, stage 6a (STAGE6A-DESIGN.md, P4 Cowork shell): the list keeps a thread in its space for any mode. A thread Modes
// marked as Recon's with no recorded space is listed in Recon; a guarded space Modes holds but has not written yet
// (pendingSpaces, this add-on's route) wins over a stale record; a space shown without its home mode starts on the
// space's preset; a draft Modes keeps in another space opens a fresh one with a line; a first send waits for a guarded
// start (at most 2 s).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PENDING_SPACES_PATH, apply, pendingSpacesOf } from '../index.js';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

function functionText(name) {
  const start = source.search(new RegExp(`(async )?function ${name}\\(`));
  assert.ok(start >= 0, `client.js has no function ${name}`);
  let depth = 0;
  // The body's brace: after the parameters (a default `= {}` there has braces of its own).
  for (let i = source.indexOf(') {', source.indexOf(`function ${name}(`)) + 2; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && (depth -= 1) === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
}
function constLine(name) {
  const match = source.match(new RegExp(`^\\s*const ${name} = .*;$`, 'm'));
  assert.ok(match, `client.js has no const ${name}`);
  return match[0];
}

const parts = (stubs = {}) => new Function('stubs', `
  const { modeCall, presetTable, KeyboardEvent, inIsolatedRoom } = stubs;
  const NS = 'coworkShell';
  const spaceMode = { on: stubs.spacesOn !== false };
  const isZh = () => false;
  ${['SPACE_IDS', 'MODE_SPACE', 'SPACE_TAB', 'isSpaceId', 'GUARDED_SPACE_IDS', 'shellModel', 'keptDrafts', 'freshOpening', 'pendingStarts', 'newStarts'].map(constLine).join('\n')}
  const SEND_WAIT_MS = stubs.wait ?? 2000;
  const NEW_SEND_WAIT_MS = stubs.newWait ?? 9000;
  let lastReconRefusal = '';
  ${['guessTab', 'spaceOfModeId', 'spaceOfSession', 'lockedPresetIn', 'startForSpace', 'startForSpaceNow', 'openFreshDraft', 'holdSendsForStarts', 'holdForNew'].map(functionText).join('\n')}
  return { spaceOfSession, lockedPresetIn, startForSpace, openFreshDraft, holdSendsForStarts, holdForNew, shellModel, pendingStarts, newStarts, keptDrafts };
`)(stubs);

test('list-isolated-unrecorded: a thread Modes marked as Recon\'s with no recorded space is listed under Recon', () => {
  const { spaceOfSession } = parts();
  const state = { space: 'chat', sessionSpaces: {}, sessionModes: { r: 'research', own: 'mine', c: 'code' }, sessionIsolated: { r: true, own: true }, ownIsolatedModes: ['mine'] };
  assert.equal(spaceOfSession('r', {}, null, state), 'recon', 'Research marked as Recon\'s: Recon');
  assert.equal(spaceOfSession('own', {}, null, state), spaceOfSession('x', {}, null, { ...state, sessionModes: { x: 'mine' }, sessionIsolated: {} }), 'an owner\'s isolated mode: its own space');
  assert.equal(spaceOfSession('c', {}, null, state), 'code', 'not marked: as before');
  assert.equal(spaceOfSession('r', {}, null, { ...state, sessionSpaces: { r: 'recon' } }), 'recon');
  assert.equal(spaceOfSession('r', { blank: true }, null, { ...state, sessionIsolated: {} }), 'chat', 'a blank draft follows the window');
});

test('list-devices-pending: a Devices thread whose space is not written yet is listed under Devices (pendingSpaces wins over a stale record)', () => {
  const { spaceOfSession } = parts();
  const state = { space: 'chat', sessionSpaces: { d: 'code' }, sessionModes: { d: 'code' }, pendingSpaces: { d: 'devices', e: 'chat' } };
  assert.equal(spaceOfSession('d', {}, null, state), 'devices');
  assert.equal(spaceOfSession('d', { blank: true }, null, state), 'devices', 'a claimed draft too');
  assert.equal(spaceOfSession('e', {}, null, { ...state, sessionSpaces: { e: 'code' } }), 'code', 'only guarded pending values count');
  assert.equal(spaceOfSession('d', {}, null, { ...state, pendingSpaces: {} }), 'code', 'written: the record');
});

test('the pending-spaces route asks Modes\' spaces.pending and keeps guarded values only; an older Modes gives none', async () => {
  assert.deepEqual(pendingSpacesOf({ spaces: { pending: () => ({ a: 'devices', b: 'recon', c: 'chat', d: 'workshop', '': 'devices' }) } }), { a: 'devices', b: 'recon', d: 'workshop' });
  assert.deepEqual(pendingSpacesOf({ spaces: {} }), {});
  assert.deepEqual(pendingSpacesOf(undefined), {});
  assert.deepEqual(pendingSpacesOf({ spaces: { pending: () => { throw new Error('busy'); } } }), {});
  const routes = new Map();
  const inner = { webServer: { register: (spec) => { routes.set(spec.path, spec.handler); return () => {}; } }, connection: { requestRejection: () => undefined }, effect: (fn) => { fn(); } };
  const ctx = {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    effect: (fn) => { try { fn(); } catch { /* not part of this test */ } },
    provide() {},
    on() {},
    get: (name) => (name === 'modes' ? { spaces: { pending: () => ({ t1: 'devices' }) } } : undefined),
    inject: (deps, fn) => { if (deps.length === 2 && deps[0] === 'webServer' && deps[1] === 'connection') { try { fn(inner); } catch { /* another route */ } } },
  };
  apply(ctx);
  let out = '';
  const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text ?? ''; } };
  await routes.get(PENDING_SPACES_PATH)({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(out), { pendingSpaces: { t1: 'devices' } });
});

test('start-preset-space-lock: Workshop shown with Tuner Plus only starts on Creator, from the space\'s lock row', () => {
  const table = { tabs: [{ id: 'chat', lock: 'any' }], spaces: [{ id: 'creator-plus', space: 'workshop', lock: 'creator' }, { id: 'bench', space: 'devices', lock: 'standard' }], presets: { creator: true, standard: true } };
  const on = parts();
  assert.equal(on.lockedPresetIn(table, 'creator-plus'), 'cordis');
  assert.equal(on.lockedPresetIn(table, 'bench'), 'standard');
  assert.equal(on.lockedPresetIn(table, 'chat'), '', 'Any');
  assert.equal(on.lockedPresetIn({ ...table, presets: { creator: false } }, 'creator-plus'), '', 'a preset the app does not have');
  const off = parts({ spacesOn: false });
  assert.equal(off.lockedPresetIn(table, 'creator-plus'), '', 'without spaces: the tab rows only, as before');
});

/** A stand-in app for the start helpers. */
function app({ answer, room = false } = {}) {
  const calls = [];
  const created = [];
  const opened = [];
  const notes = [];
  const errors = [];
  const stubs = {
    modeCall: async (body) => { calls.push(body); return answer(body); },
    presetTable: async () => ({ tabs: [], spaces: [{ id: 'bench', lock: 'standard' }], presets: { standard: true } }),
    inIsolatedRoom: () => room,
  };
  const p = parts(stubs);
  p.shellModel.current = { note: (text) => notes.push(text), fail: (text) => errors.push(text) };
  const appCtx = {
    locale: { bind: () => (key, vars = {}) => (key === 'draft.kept' ? `That draft belongs to ${vars.space}, so a new draft was opened here.` : key === 'space.code' ? 'Code' : key) },
    get: (name) => (name === 'sessions' ? { create: async (where) => { created.push(where); return `new${created.length}`; } } : name === 'uiWorkspace' ? { openSession: (id) => opened.push(id) } : undefined),
  };
  const library = { get: () => ({ currentId: 'old', byId: { old: { blank: true } }, workspaces: [{ workspaceId: 'w1', path: '/Users/me/app', sessionIds: ['old'] }] }) };
  return { p, calls, created, opened, notes, errors, appCtx, library };
}

test('startdraft-kept-opens-fresh: a draft Modes keeps in Code opens a fresh Devices draft in the same project, with one line', async () => {
  const a = app({ answer: (body) => (body.sessionId === 'old' ? { started: { claimed: false, keptIn: 'code' } } : { started: { claimed: true, mode: 'bench', space: 'devices' } }) });
  await a.p.startForSpace(a.appCtx, a.library, 'old', 'devices', { reset: true });
  assert.deepEqual(a.notes, ['That draft belongs to Code, so a new draft was opened here.']);
  assert.deepEqual(a.created, [{ workspaceId: 'w1', agentPreset: 'standard' }], 'made with the app\'s create, on the Devices preset');
  assert.deepEqual(a.opened, ['new1']);
  assert.deepEqual(a.calls.map((body) => [body.sessionId, body.space]), [['old', 'devices'], ['new1', 'devices']]);
  // Asked again for the same kept draft: no second fresh draft.
  await a.p.startForSpace(a.appCtx, a.library, 'old', 'devices');
  assert.equal(a.created.length, 1);
  // A Recon room draft is never reused for another space's fresh draft.
  const room = app({ room: true, answer: () => ({ started: { claimed: false, keptIn: 'recon' } }) });
  await room.p.startForSpace(room.appCtx, room.library, 'old', 'chat');
  assert.equal(room.created.length, 0);
  assert.equal(room.notes.length, 1, 'the line still says why');
});

test('startdraft-kept-follows (lab re-check 2, problem 2): in Recon, a Devices draft outside the room takes the window to Devices', async () => {
  const a = app({ room: false, answer: (body) => (body.space === 'recon' ? { started: { claimed: false, keptIn: 'devices' } } : { started: { claimed: true } }) });
  const selected = [];
  a.p.shellModel.current.select = async (id) => { selected.push(id); };
  a.appCtx.locale = { bind: () => (key, vars = {}) => (key === 'draft.followed' ? `That draft belongs to ${vars.space}, so the window went there. To start a new thread in ${vars.from}, click its button, then New.` : key === 'space.devices' ? 'Devices' : key === 'space.recon' ? 'Recon' : key) };
  await a.p.startForSpace(a.appCtx, a.library, 'old', 'recon');
  assert.equal(a.created.length, 0, 'no Recon draft opens outside the room');
  assert.deepEqual(selected, ['devices'], 'the window follows the draft to its own space');
  assert.deepEqual(a.notes, ['That draft belongs to Devices, so the window went there. To start a new thread in Recon, click its button, then New.']);
  // Asked again for the same draft: nothing more.
  await a.p.startForSpace(a.appCtx, a.library, 'old', 'recon');
  assert.deepEqual(selected, ['devices']);
  // A fresh draft that opens keeps the old line and the window where it is.
  const b = app({ answer: (body) => (body.sessionId === 'old' ? { started: { claimed: false, keptIn: 'code' } } : { started: { claimed: true } }) });
  const moved = [];
  b.p.shellModel.current.select = async (id) => { moved.push(id); };
  await b.p.startForSpace(b.appCtx, b.library, 'old', 'devices');
  assert.deepEqual(moved, []);
  assert.deepEqual(b.notes, ['That draft belongs to Code, so a new draft was opened here.']);
  // Never into Recon: a Recon-room draft shown in Chat is left as before.
  const room = app({ room: true, answer: () => ({ started: { claimed: false, keptIn: 'recon' } }) });
  const none = [];
  room.p.shellModel.current.select = async (id) => { none.push(id); };
  await room.p.startForSpace(room.appCtx, room.library, 'old', 'chat');
  assert.deepEqual(none, []);
  const lines = source.match(/'draft\.followed': '([^']*)'/g);
  assert.equal(lines?.length, 1, 'English only');
});

test('startdraft-kept-opens-fresh: a refusal in Recon (outside the room) shows Modes\' sentence', async () => {
  const sentence = 'Recon threads work only in Recon\'s room, and this thread\'s folder is somewhere else. Start it with the New button in Recon: it opens in the room.';
  const a = app({ answer: () => { throw new Error(sentence); } });
  await assert.rejects(a.p.startForSpace(a.appCtx, a.library, 'old', 'recon'), /Recon threads work only/);
  assert.deepEqual(a.errors, [sentence]);
  const chat = app({ answer: () => { throw new Error('unknown session'); } });
  await assert.rejects(chat.p.startForSpace(chat.appCtx, chat.library, 'old', 'recon'));
  assert.deepEqual(chat.errors, [], 'a draft not open yet is not shown');
});

test('send-waits-start: Enter in the chat box of a draft whose guarded start is pending waits for it, then goes on once', async () => {
  class KeyboardEvent { constructor(type, init) { Object.assign(this, { type, ...init }); } }
  let finish;
  const a = app({ answer: () => ({ started: { claimed: true } }) });
  const p = parts({ modeCall: async (body) => { a.calls.push(body); return new Promise((done) => { finish = () => done({ started: { claimed: true } }); }); }, KeyboardEvent, presetTable: async () => ({}), inIsolatedRoom: () => false, wait: 2000 });
  p.shellModel.current = { note() {}, fail() {} };
  const listeners = {};
  const doc = { addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener: (type) => { delete listeners[type]; } };
  const dispatched = [];
  const editor = { dispatchEvent: (event) => { dispatched.push(event); listeners.keydown(event); } };
  const target = { closest: (selector) => (selector === '[data-composer-input]' ? editor : null) };
  const stop = p.holdSendsForStarts(doc, a.library);
  const press = () => {
    const event = { key: 'Enter', target, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    listeners.keydown(event);
    return event;
  };
  // No start pending: nothing is held.
  assert.equal(press().prevented, false);
  const started = p.startForSpace(a.appCtx, a.library, 'old', 'devices');
  const held = press();
  assert.equal(held.prevented && held.stopped, true, 'held while the Devices start is pending');
  assert.equal(dispatched.length, 0);
  finish();
  await started;
  await new Promise((done) => setTimeout(done, 5));
  assert.equal(dispatched.length, 1, 'given back once');
  assert.equal(dispatched[0].key, 'Enter');
  assert.equal(press().prevented, false, 'answered: nothing is held any more');
  // A Chat start is never waited for.
  void p.startForSpace(a.appCtx, a.library, 'old', 'chat');
  assert.equal(press().prevented, false);
  finish();
  stop();
  assert.equal(listeners.keydown, undefined);
});

test('send-waits-start: the wait ends after the limit even when the start never answers', async () => {
  class KeyboardEvent { constructor(type, init) { Object.assign(this, { type, ...init }); } }
  const p = parts({ modeCall: () => new Promise(() => {}), KeyboardEvent, presetTable: async () => ({}), inIsolatedRoom: () => false, wait: 30 });
  p.shellModel.current = { note() {}, fail() {} };
  const listeners = {};
  const doc = { addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener() {} };
  const dispatched = [];
  const editor = { dispatchEvent: (event) => dispatched.push(event) };
  const library = { get: () => ({ currentId: 'old', byId: { old: { blank: true } }, workspaces: [] }) };
  p.holdSendsForStarts(doc, library, { wait: 30 });
  void p.startForSpace({ locale: { bind: () => (key) => key }, get: () => undefined }, library, 'old', 'workshop');
  const event = { key: 'Enter', target: { closest: (selector) => (selector === '[data-composer-input]' ? editor : null) }, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
  listeners.keydown(event);
  assert.equal(event.prevented, true);
  await new Promise((done) => setTimeout(done, 60));
  assert.equal(dispatched.length, 1, 'sent after the limit');
});

test('lab fix: a Recon start that works takes the earlier "work only in Recon\'s room" line away', async () => {
  const sentence = 'Recon threads work only in Recon\'s room, and this thread\'s folder is somewhere else. Start it with the New button in Recon: it opens in the room.';
  let refuse = true;
  const a = app({ answer: () => { if (refuse) throw new Error(sentence); return { started: { claimed: true, mode: 'recon', space: 'recon' } }; } });
  let shown = '';
  a.p.shellModel.current = { note: () => {}, fail: (text) => { shown = text; }, clearFail: (text) => { if (shown === text) shown = ''; } };
  await assert.rejects(a.p.startForSpace(a.appCtx, a.library, 'old', 'recon'));
  assert.equal(shown, sentence);
  refuse = false;
  await a.p.startForSpace(a.appCtx, a.library, 'room1', 'recon');
  assert.equal(shown, '', 'the stale line is gone once a Recon thread starts in the room');
  // Another line shown meanwhile is left alone.
  refuse = true;
  await assert.rejects(a.p.startForSpace(a.appCtx, a.library, 'old', 'recon'));
  shown = 'Something else went wrong.';
  refuse = false;
  await a.p.startForSpace(a.appCtx, a.library, 'room2', 'recon');
  assert.equal(shown, 'Something else went wrong.');
  assert.match(source, /clearFail: \(message\) => \{ if \(message && state\.error === String\(message\)\) set\(\{ error: '' \}\); \}/);
});

// Stage 7 (6b lab leftovers 4 and 5).
test('new-never-reuses-other-space-draft (6b lab 4): a New click that lands on a kept draft again opens a fresh one again', async () => {
  const a = app({ answer: (body) => (body.sessionId === 'old' ? { started: { claimed: false, keptIn: 'devices' } } : { started: { claimed: true, mode: 'code', space: 'code' } }) });
  a.appCtx.locale = { bind: () => (key, vars = {}) => (key === 'draft.kept' ? `That draft belongs to ${vars.space}, so a new draft was opened here.` : key) };
  await a.p.startForSpace(a.appCtx, a.library, 'old', 'code');
  assert.equal(a.created.length, 1, 'the first time: a fresh draft');
  // The sidebar asks again for the same draft (no New click): nothing more, as before.
  await a.p.startForSpace(a.appCtx, a.library, 'old', 'code');
  assert.equal(a.created.length, 1);
  // Later, Code → New: the app reuses the empty Devices draft again (it is open again): a fresh Code draft again.
  await a.p.startForSpace(a.appCtx, a.library, 'old', 'code', { reset: true });
  assert.equal(a.created.length, 2, 'New never leaves the Devices draft open under Code');
  assert.deepEqual(a.opened, ['new1', 'new2']);
  assert.deepEqual(a.calls.filter((body) => body.sessionId !== 'old').map((body) => body.space), ['code', 'code'], 'each fresh draft is claimed for Code');
  // The window already left the kept draft: no extra draft.
  const moved = app({ answer: () => ({ started: { claimed: false, keptIn: 'devices' } }) });
  moved.p.keptDrafts.add('old');
  moved.library.get = () => ({ currentId: 'other', byId: { other: { blank: true } }, workspaces: [{ workspaceId: 'w1', path: '/Users/me/app', sessionIds: ['old'] }] });
  await moved.p.startForSpace(moved.appCtx, moved.library, 'old', 'code', { reset: true });
  assert.equal(moved.created.length, 0);
});

test('new-send-waits (6b lab 4): a first message after a New click waits until its draft is the space\'s own', async () => {
  let finish;
  const a = app({ answer: () => ({}) });
  const p = parts({ modeCall: () => new Promise((done) => { finish = () => done({ started: { claimed: true } }); }), presetTable: async () => ({}), inIsolatedRoom: () => false });
  p.shellModel.current = { note() {}, fail() {} };
  const started = p.startForSpace(a.appCtx, a.library, 'old', 'code', { reset: true });
  assert.ok(p.pendingStarts.has('old'), 'a Code New click is waited for too');
  finish();
  await started;
  await new Promise((done) => setTimeout(done, 5));
  assert.equal(p.pendingStarts.has('old'), false);
  void p.startForSpace(a.appCtx, a.library, 'old', 'chat');
  assert.equal(p.pendingStarts.has('old'), false, 'a Chat claim that is no New click is not waited for, as before');
});

test('stale-draft-line-cleared (6b lab 5): the window moves first, then the line; a space button click takes it away', async () => {
  const a = app({ room: false, answer: (body) => (body.space === 'recon' ? { started: { claimed: false, keptIn: 'devices' } } : { started: { claimed: true } }) });
  const order = [];
  a.p.shellModel.current.select = async (id) => { order.push(`select ${id}`); };
  a.p.shellModel.current.note = (text) => order.push(`note ${text}`);
  a.appCtx.locale = { bind: () => (key) => key };
  await a.p.startForSpace(a.appCtx, a.library, 'old', 'recon');
  assert.deepEqual(order, ['select devices', 'note draft.followed']);
  // The model's select (spaces on) takes the notice away.
  const select = source.slice(source.indexOf('      async function select(id, label) {'), source.indexOf('        const before = state.selected;'));
  assert.match(select, /set\(\{ space, selected: SPACE_TAB\[space\], error: '', \.\.\.\(space !== state\.space \? \{ notice: '' \} : \{\}\) \}\)/);
});

// Stage 7 lab re-check, bug A: New code task, then Enter at once, ended on an empty draft (the send ran in the blank draft
// still open, the app's late start then opened another one, and only that one was claimed and held).
test('new-then-send-at-once (s7c bug A): a send right after a New click waits until the New\'s draft is open and claimed', async () => {
  class KeyboardEvent { constructor(type, init) { Object.assign(this, { type, ...init }); } }
  const p = parts({ modeCall: async () => ({ started: { claimed: true } }), KeyboardEvent, presetTable: async () => ({}), inIsolatedRoom: () => false });
  p.shellModel.current = { note() {}, fail() {} };
  // The blank Code draft shown when New is clicked; it has no pending start of its own.
  const snap = { currentId: 'shown', byId: { shown: { blank: true } }, workspaces: [] };
  const library = { get: () => snap };
  const listeners = {};
  const doc = { addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener() {} };
  const sent = [];
  const editor = { isConnected: true, dispatchEvent: (event) => { sent.push(snap.currentId); listeners.keydown(event); } };
  p.holdSendsForStarts(doc, library);
  const press = () => {
    const event = { key: 'Enter', target: { closest: (selector) => (selector === '[data-composer-input]' ? editor : null) }, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
    listeners.keydown(event);
    return event;
  };
  // The click: startNew registers its claim at once (holdForNew), before the app's start or waitForBlank lands.
  let claim;
  p.holdForNew(new Promise((done) => { claim = done; }));
  assert.equal(p.pendingStarts.has('shown'), false, 'the shown draft has no start of its own (the lab case)');
  const event = press();
  assert.equal(event.prevented, true, 'held from the click on, though the open draft has no pending start');
  await new Promise((done) => setTimeout(done, 5));
  assert.deepEqual(sent, [], 'nothing runs in the draft shown at the click');
  // The app's start lands and the New's draft is claimed for Code (startForSpace with reset), then the claim settles.
  snap.currentId = 'fresh';
  snap.byId.fresh = { blank: true };
  await p.startForSpace({ locale: { bind: () => (key) => key }, get: () => undefined }, library, 'fresh', 'code', { reset: true });
  claim('fresh');
  await new Promise((done) => setTimeout(done, 5));
  assert.deepEqual(sent, ['fresh'], 'given back once, into the New\'s own draft');
  assert.equal(p.newStarts.size, 0, 'settled: forgotten');
  assert.equal(press().prevented, undefined, 'nothing held any more');
});

test('new-then-send-at-once (s7c bug A): the hold ends after its limit, a thread that has run is never held, and spaces off holds nothing', async () => {
  class KeyboardEvent { constructor(type, init) { Object.assign(this, { type, ...init }); } }
  const p = parts({ modeCall: async () => ({}), KeyboardEvent, presetTable: async () => ({}), inIsolatedRoom: () => false });
  const snap = { currentId: 'shown', byId: { shown: { blank: true }, ran: { blank: false } }, workspaces: [] };
  const listeners = {};
  const doc = { addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener() {}, querySelector: (selector) => (selector === '[data-composer-input]' ? redrawn : null) };
  const sent = [];
  const old = { isConnected: false, dispatchEvent: () => sent.push('old') };
  const redrawn = { isConnected: true, dispatchEvent: () => sent.push('redrawn') };
  p.holdSendsForStarts(doc, { get: () => snap }, { newWait: 30 });
  const press = () => {
    const event = { key: 'Enter', target: { closest: (selector) => (selector === '[data-composer-input]' ? old : null) }, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
    listeners.keydown(event);
    return event;
  };
  p.holdForNew(new Promise(() => {}));
  assert.equal(press().prevented, true);
  await new Promise((done) => setTimeout(done, 60));
  assert.deepEqual(sent, ['redrawn'], 'given back after the limit, to the chat box shown now (the app drew a new one)');
  // Point 29: a thread that has run is held only while a New click is pending (this one never settles); with no New
  // click pending it is never held, as before.
  snap.currentId = 'ran';
  assert.equal(press().prevented, true, 'a thread that has run, with a New click pending: held for the new draft');
  const calm = parts({ modeCall: async () => ({}), KeyboardEvent, presetTable: async () => ({}), inIsolatedRoom: () => false });
  const calmListeners = {};
  calm.holdSendsForStarts({ addEventListener: (type, fn) => { calmListeners[type] = fn; }, removeEventListener() {} }, { get: () => snap }, { newWait: 30 });
  const plain = { key: 'Enter', target: { closest: (selector) => (selector === '[data-composer-input]' ? old : null) }, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
  calmListeners.keydown(plain);
  assert.equal(plain.prevented, undefined, 'a thread that has run, no New click pending: never held, as before');
  const off = parts({ spacesOn: false, modeCall: async () => ({}), presetTable: async () => ({}), inIsolatedRoom: () => false });
  off.holdForNew(new Promise(() => {}));
  assert.equal(off.newStarts.size, 0, 'without spaces a New click holds nothing (no space to claim)');
  // startNew registers the hold at the click, before any start is made.
  const startNew = source.slice(source.indexOf('    function startNew('), source.indexOf('      const inFolder = () => {', source.indexOf('    function startNew(')));
  assert.match(startNew, /const claimed = claimNew\([^)]*\)\.catch\(\(\) => ''\);\n\s*holdForNew\(claimed\);/);
});

// Stage 7 (point 29): New clicked while the window shows a thread that has run, then a send at once: it goes to the new
// draft New opens, with the typed text, never into the old thread.
function ranThenNew({ newWait = 9000, carry = false, other = '', askAgain, store = null, recheck, spacesOn = true, appClears = false } = {}) {
  class KeyboardEvent { constructor(type, init) { Object.assign(this, { type, ...init }); } }
  const p = parts({ spacesOn, modeCall: async () => ({ started: { claimed: true } }), KeyboardEvent, presetTable: async () => ({}), inIsolatedRoom: () => false });
  p.shellModel.current = { note() {}, fail() {} };
  const snap = { currentId: 'ran', byId: { ran: { blank: false } }, workspaces: [] };
  // The window's list: it tells its listeners when another thread is shown (stage 7 lab, bug D).
  const subscribers = new Set();
  const library = { get: () => snap, subscribe: (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); } };
  const show = async (id) => { snap.currentId = id; for (const fn of [...subscribers]) fn(); await new Promise((done) => setTimeout(done, 15)); };
  const listeners = {};
  const sent = [];
  const said = [];
  const lines = [];
  // One chat box per thread, as the app keeps a draft per thread: the shown box follows the open thread.
  const boxes = {
    ran: { value: 'Summarise the report', isConnected: true, focus() {}, dispatchEvent: (event) => { if (event.key === 'Enter') sent.push(['ran', boxes.ran.value]); } },
    fresh: { value: carry ? 'Summarise the report' : other, isConnected: true, focus() {}, dispatchEvent: (event) => { if (event.key === 'Enter') { sent.push(['fresh', boxes.fresh.value]); if (appClears) boxes.fresh.value = ''; } } },
  };
  const sendButtons = { ran: { getAttribute: (name) => (name === 'aria-label' ? 'Send' : null), click: () => sent.push(['ran', boxes.ran.value]) }, fresh: { getAttribute: (name) => (name === 'aria-label' ? 'Send' : null), click: () => sent.push(['fresh', boxes.fresh.value]) } };
  const doc = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    removeEventListener() {},
    querySelector: (selector) => (selector === '[data-composer-input]' ? boxes[snap.currentId] ?? null : null),
    querySelectorAll: (selector) => (selector === '[data-composer-seat] button' ? [sendButtons[snap.currentId]].filter(Boolean) : []),
  };
  p.holdSendsForStarts(doc, library, { newWait, say: (key) => said.push(key), settle: 1, waitLine: (key) => lines.push(key), ...(askAgain ? { askAgain } : {}), store, ...(recheck ? { recheck } : {}) });
  let claim;
  const click = () => p.holdForNew(new Promise((done) => { claim = done; }));
  const enter = () => {
    const box = boxes[snap.currentId];
    const event = { key: 'Enter', target: { closest: (selector) => (selector === '[data-composer-input]' ? box : null) }, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
    listeners.keydown(event);
    return event;
  };
  const sendClick = () => {
    const seat = { querySelector: (selector) => (selector === '[data-composer-input]' ? boxes[snap.currentId] : null) };
    // Drawn again by the time it is given back (isConnected false): the Send button shown then is clicked.
    const button = { isConnected: false, getAttribute: (name) => (name === 'aria-label' ? 'Send' : null), closest: (selector) => (selector === 'button' ? button : selector === '[data-composer-seat]' ? seat : null) };
    const event = { target: button, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
    listeners.click(event);
    return event;
  };
  const opens = async () => {
    snap.currentId = 'fresh';
    snap.byId.fresh = { blank: true };
    claim('fresh');
    await new Promise((done) => setTimeout(done, 10));
  };
  return { p, snap, boxes, sent, said, lines, click, enter, sendClick, opens, show };
}

test('point 29: New in a thread that has run, then Enter at once: the message goes to the new draft, moved from the old box', async () => {
  const s = ranThenNew();
  s.click();
  const event = s.enter();
  assert.equal(event.prevented, true, 'held: not sent into the thread that has run');
  await new Promise((done) => setTimeout(done, 5));
  assert.deepEqual(s.sent, [], 'nothing runs in the old thread');
  await s.opens();
  assert.deepEqual(s.sent, [['fresh', 'Summarise the report']], 'sent once, in the new draft, with the typed text');
  assert.deepEqual(s.said, []);
  assert.equal(s.p.newStarts.size, 0);
});

test('point 29: the same with the Send button, and when the app already carried the text into the new box', async () => {
  const s = ranThenNew({ carry: true });
  s.click();
  assert.equal(s.sendClick().prevented, true);
  await s.opens();
  assert.deepEqual(s.sent, [['fresh', 'Summarise the report']], 'sent in the new draft; the text is not put in twice');
});

test('point 29: the text is never lost: no new draft in time, or a new box holding other text, sends nothing and says what to do', async () => {
  const late = ranThenNew({ newWait: 20 });
  late.click();
  assert.equal(late.enter().prevented, true);
  await new Promise((done) => setTimeout(done, 50));
  assert.deepEqual(late.sent, [], 'not sent into the old thread behind your back');
  assert.equal(late.boxes.ran.value, 'Summarise the report', 'the text stays in the box');
  assert.deepEqual(late.said, ['send.newNotOpen']);
  const busy = ranThenNew({ other: 'my own draft' });
  busy.click();
  busy.enter();
  await busy.opens();
  assert.deepEqual(busy.sent, [], 'never over what the new box holds');
  assert.equal(busy.boxes.fresh.value, 'my own draft');
  assert.equal(busy.boxes.ran.value, 'Summarise the report');
  assert.deepEqual(busy.said, ['send.notMoved']);
  // The words say what is happening and what to do next.
  assert.match(source, /'send\.newNotOpen': 'The new thread did not open in time, so your message was not sent\. It is still in the chat box: press Send to send it in this thread, or click New again\.'/);
  assert.match(source, /'send\.notMoved': 'Your message was not sent: it could not be moved into the new thread\. It is still in the chat box of the thread you were in; copy it here and press Send\.'/);
  assert.match(source, /holdSendsForStarts\(document, library, \{\s*say: \(key\) => \{ try \{ model\.note\(ctx\.locale\.bind\(NS\)\(key\)\); \}/);
});

test('point 29 review: Enter pressed again, or Send clicked, while the move waits: still sent once, in the new draft', async () => {
  const s = ranThenNew();
  s.click();
  assert.equal(s.enter().prevented, true);
  assert.equal(s.enter().prevented, true, 'a second Enter is held too, not sent into the old thread');
  assert.equal(s.sendClick().prevented, true, 'so is the Send button');
  await s.opens();
  await new Promise((done) => setTimeout(done, 20));
  assert.deepEqual(s.sent, [['fresh', 'Summarise the report']], 'one send, never two');
  assert.deepEqual(s.said, []);
  const after = s.enter();
  assert.notEqual(after.prevented, true, 'once the move is done, a send goes on as usual');
});

test('point 29: spaces off: a New click holds nothing, and a send in a thread that has run goes on at once', () => {
  class KeyboardEvent { constructor(type, init) { Object.assign(this, { type, ...init }); } }
  const off = parts({ spacesOn: false, modeCall: async () => ({}), KeyboardEvent, presetTable: async () => ({}), inIsolatedRoom: () => false });
  const listeners = {};
  off.holdSendsForStarts({ addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener() {} }, { get: () => ({ currentId: 'ran', byId: { ran: { blank: false } } }) });
  off.holdForNew(new Promise(() => {}));
  const event = { key: 'Enter', target: { closest: (selector) => (selector === '[data-composer-input]' ? { value: 'x' } : null) }, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
  listeners.keydown(event);
  assert.equal(event.prevented, undefined);
});

test('point 29 lead: while a send waits for New\'s draft, a line above the chat box says so; it goes when the send goes or the wait ends', async () => {
  const s = ranThenNew();
  s.click();
  s.enter();
  assert.deepEqual(s.lines, ['send.waiting'], 'shown at once, while the send waits');
  s.enter();
  s.sendClick();
  assert.deepEqual(s.lines, ['send.waiting'], 'a second Enter or Send while waiting does not add another');
  await s.opens();
  await new Promise((done) => setTimeout(done, 20));
  assert.deepEqual(s.sent, [['fresh', 'Summarise the report']]);
  assert.deepEqual(s.lines, ['send.waiting', ''], 'taken away once the send went out');
  // The wait ends without a new draft: the line goes and the existing line takes over.
  const late = ranThenNew({ newWait: 20 });
  late.click();
  late.enter();
  await new Promise((done) => setTimeout(done, 50));
  assert.deepEqual(late.lines, ['send.waiting', '']);
  assert.deepEqual(late.said, ['send.newNotOpen']);
  // A send in a thread that has run with no New click pending shows nothing.
  const calm = ranThenNew();
  assert.notEqual(calm.enter().prevented, true);
  assert.deepEqual(calm.lines, []);
  // The words, and where the line is drawn: in the input dock, above the chat box.
  assert.match(source, /'send\.waiting': 'Waiting for the new thread to open, then sending your message there\.'/);
  assert.match(source, /name: 'conversation\.input\.dock', id: 'cowork-send-wait'[^\n]*\n\s*\}, SendWaitLine\)\)/);
  assert.match(source, /waitLine: \(key\) => \{ try \{ sendWait\.set\(key \? ctx\.locale\.bind\(NS\)\(key\) : ''\); \}/);
});

test('point 29 lead: a blank draft\'s send held for a New click shows the waiting line too, and takes it away after', async () => {
  class KeyboardEvent { constructor(type, init) { Object.assign(this, { type, ...init }); } }
  const p = parts({ modeCall: async () => ({ started: { claimed: true } }), KeyboardEvent, presetTable: async () => ({}), inIsolatedRoom: () => false });
  const snap = { currentId: 'blank', byId: { blank: { blank: true } }, workspaces: [] };
  const listeners = {};
  const lines = [];
  const box = { value: 'hi', isConnected: true, dispatchEvent() {} };
  p.holdSendsForStarts({ addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener() {}, querySelector: () => box }, { get: () => snap }, { newWait: 20, waitLine: (key) => lines.push(key) });
  p.holdForNew(new Promise(() => {}));
  const event = { key: 'Enter', target: { closest: (selector) => (selector === '[data-composer-input]' ? box : null) }, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
  listeners.keydown(event);
  assert.equal(event.prevented, true);
  assert.deepEqual(lines, ['send.waiting']);
  await new Promise((done) => setTimeout(done, 50));
  assert.deepEqual(lines, ['send.waiting', '']);
});

// ---- Stage 7 lab (bug D): New + fast send moved the message; the old thread's box kept a copy that Enter sent again ----

/** A stand-in for the window's sessionStorage. */
function memoryStore() {
  const items = new Map();
  return { getItem: (key) => (items.has(key) ? items.get(key) : null), setItem: (key, value) => items.set(key, String(value)), removeItem: (key) => items.delete(key), items };
}

test('bug D: back in the old thread, its box still holding the moved message is cleared once, with a line; nothing is sent twice', async () => {
  const s = ranThenNew({ appClears: true });
  s.click();
  s.enter();
  await s.opens();
  assert.deepEqual(s.sent, [['fresh', 'Summarise the report']]);
  assert.equal(s.boxes.ran.value, 'Summarise the report', 'the app kept a copy in the old box (the lab case)');
  await s.show('ran');
  assert.equal(s.boxes.ran.value, '', 'cleared: it is the shown box now');
  assert.deepEqual(s.said, ['send.alreadySent']);
  // Enter now sends nothing more (an empty box), and a new message there is an ordinary send.
  s.boxes.ran.value = 'Another question';
  assert.notEqual(s.enter().prevented, true, 'an ordinary send is not touched');
  // Shown again later: the line is not shown again.
  await s.show('fresh');
  await s.show('ran');
  assert.deepEqual(s.said, ['send.alreadySent'], 'one time only');
  assert.deepEqual(s.sent, [['fresh', 'Summarise the report']]);
  assert.match(source, /'send\.alreadySent': 'This message was already sent in the new thread\.'/);
});

test('bug D: text the owner changed in the old box is left alone, and sends as usual', async () => {
  const s = ranThenNew({ appClears: true });
  s.click();
  s.enter();
  await s.opens();
  s.boxes.ran.value = 'Summarise the report, and the appendix';
  await s.show('ran');
  assert.equal(s.boxes.ran.value, 'Summarise the report, and the appendix');
  assert.deepEqual(s.said, []);
  assert.notEqual(s.enter().prevented, true, 'a changed text is a new message');
});

test('bug D: Enter or Send with exactly the moved text before it could be cleared asks first; Don\'t send sends nothing', async () => {
  const asked = [];
  let answer = false;
  const s = ranThenNew({ appClears: true, recheck: [], askAgain: () => { asked.push(1); return Promise.resolve(answer); } });
  s.click();
  s.enter();
  await s.opens();
  await s.show('ran');
  assert.equal(s.boxes.ran.value, 'Summarise the report', 'not cleared (no look yet)');
  assert.equal(s.enter().prevented, true, 'held');
  assert.equal(s.enter().prevented, true, 'a second Enter while asking is held too');
  await new Promise((done) => setTimeout(done, 5));
  assert.equal(asked.length, 1, 'asked once');
  assert.deepEqual(s.sent, [['fresh', 'Summarise the report']], 'Don\'t send: nothing more is sent');
  assert.equal(s.boxes.ran.value, 'Summarise the report', 'the text stays in the box');
  // Asked again next time; Send here too sends it here, once.
  answer = true;
  assert.equal(s.sendClick().prevented, true, 'the Send button asks too');
  await new Promise((done) => setTimeout(done, 5));
  assert.equal(asked.length, 2);
  assert.deepEqual(s.sent, [['fresh', 'Summarise the report'], ['ran', 'Summarise the report']]);
  // After Send here too, nothing asks again.
  assert.notEqual(s.enter().prevented, true);
  // The question's words, and that it is the page's own question box (never confirm()).
  assert.match(source, /'send\.alreadyAsk': 'This message was already sent in the new thread\. Send it here too\?'/);
  assert.match(source, /'send\.alreadyYes': 'Send here too'/);
  assert.match(source, /'send\.alreadyNo': "Don't send"/);
  assert.match(source, /askAgain: \(\) => \{ const t = ctx\.locale\.bind\(NS\); return askInPage\(\{ text: t\('send\.alreadyAsk'\), ok: t\('send\.alreadyYes'\), cancel: t\('send\.alreadyNo'\), danger: true \}\); \}/);
  // Stage 7 lab: the question opens on Don't send (danger), so a second Enter press never confirms it.
  assert.match(source, /\(input \?\? \(options\.danger && cancel \? cancel : ok\)\)\.focus\(\);/);
});

test('bug D: the moved text is kept in sessionStorage, so a reloaded window still clears the old box', async () => {
  const store = memoryStore();
  const s = ranThenNew({ appClears: true, store });
  s.click();
  s.enter();
  await s.opens();
  assert.deepEqual(JSON.parse(store.getItem('cws-moved-sends')), { ran: 'Summarise the report' });
  // A new window part (a reload) opened on the old thread.
  const again = ranThenNew({ store });
  await new Promise((done) => setTimeout(done, 15));
  assert.equal(again.boxes.ran.value, '');
  assert.deepEqual(again.said, ['send.alreadySent']);
  assert.equal(store.getItem('cws-moved-sends'), null, 'forgotten once cleared');
});

test('bug D: spaces off: nothing is cleared or asked, even with a kept moved text', async () => {
  const store = memoryStore();
  store.setItem('cws-moved-sends', JSON.stringify({ ran: 'Summarise the report' }));
  const asked = [];
  const s = ranThenNew({ spacesOn: false, store, askAgain: () => { asked.push(1); return Promise.resolve(false); } });
  await new Promise((done) => setTimeout(done, 15));
  assert.equal(s.boxes.ran.value, 'Summarise the report');
  assert.notEqual(s.enter().prevented, true);
  assert.deepEqual(asked, []);
  assert.deepEqual(s.said, []);
});

test('bug D: when the app kept no copy in the old box, nothing is asked later, and another message there ends the watch', async () => {
  const asked = [];
  const s = ranThenNew({ appClears: true, recheck: [0, 5], askAgain: () => { asked.push(1); return Promise.resolve(false); } });
  s.click();
  s.enter();
  await s.opens();
  s.boxes.ran.value = '';
  await s.show('ran');
  // The owner types the same words again later, on purpose: an ordinary send.
  s.boxes.ran.value = 'Summarise the report';
  assert.notEqual(s.enter().prevented, true);
  assert.deepEqual(asked, []);
  assert.deepEqual(s.said, []);
  // Another message sent in the old thread before going back: no question afterwards either.
  const t = ranThenNew({ appClears: true, recheck: [], askAgain: () => { asked.push(1); return Promise.resolve(false); } });
  t.click();
  t.enter();
  await t.opens();
  await t.show('ran');
  t.boxes.ran.value = 'Something else';
  assert.notEqual(t.enter().prevented, true);
  t.boxes.ran.value = 'Summarise the report';
  assert.notEqual(t.enter().prevented, true);
  assert.deepEqual(asked, []);
});

test('bug D: clearing an editor that is not a text field never deletes outside the chat box', () => {
  const body = source.slice(source.indexOf('      const clearBox = (editor) => {'), source.indexOf('      /** The old thread is shown again'));
  assert.match(body, /if \(focused !== undefined && focused !== editor && !editor\.contains\?\.\(focused\)\) return;\n\s*doc\.execCommand\?\.\('selectAll', false\);/);
  assert.doesNotMatch(source, /\bconfirm\(|\balert\(/);
});

test('bug D lab: the app\'s Lexical chat box ignores execCommand delete; it is cleared with a beforeinput delete, then the line shows', async () => {
  const store = memoryStore();
  store.setItem('cws-moved-sends', JSON.stringify({ ran: 'Summarise the report' }));
  class KeyboardEvent { constructor(type, init) { Object.assign(this, { type, ...init }); } }
  class InputEvent { constructor(type, init) { Object.assign(this, { type, ...init, defaultPrevented: false }); } preventDefault() { if (this.cancelable) this.defaultPrevented = true; } }
  const p = parts({ modeCall: async () => ({ started: { claimed: true } }), KeyboardEvent, presetTable: async () => ({}), inIsolatedRoom: () => false });
  const calls = [];
  const doc = {
    activeElement: null,
    defaultView: { InputEvent },
    // As in the lab: execCommand reports success but the editor keeps its text.
    execCommand: (name) => { calls.push(name); return true; },
    addEventListener() {},
    removeEventListener() {},
    querySelector: (selector) => (selector === '[data-composer-input]' ? box : null),
    querySelectorAll: () => [],
  };
  // A Lexical-like editor: no value; it handles a delete beforeinput itself and draws the change a moment later.
  const box = {
    innerText: 'Summarise the report', isConnected: true,
    focus() { doc.activeElement = box; },
    contains: (node) => node === box,
    dispatchEvent(event) {
      if (event.type === 'beforeinput' && event.inputType === 'deleteContentBackward' && calls.includes('selectAll')) {
        event.preventDefault();
        queueMicrotask(() => { box.innerText = ''; });
        return false;
      }
      return true;
    },
  };
  const said = [];
  p.holdSendsForStarts(doc, { get: () => ({ currentId: 'ran', byId: { ran: { blank: false } }, workspaces: [] }) }, { say: (key) => said.push(key), settle: 1, store, recheck: [0] });
  await new Promise((done) => setTimeout(done, 15));
  assert.equal(box.innerText, '', 'the moved copy is gone from the old box');
  assert.deepEqual(calls, ['selectAll'], 'the delete went to the editor, not execCommand (which it ignores)');
  assert.deepEqual(said, ['send.alreadySent']);
  assert.equal(store.getItem('cws-moved-sends'), null);
});

test('bug D lab: a plain editable box that does not take the beforeinput delete is still cleared with execCommand', async () => {
  const store = memoryStore();
  store.setItem('cws-moved-sends', JSON.stringify({ ran: 'Summarise the report' }));
  class KeyboardEvent { constructor(type, init) { Object.assign(this, { type, ...init }); } }
  class InputEvent { constructor(type, init) { Object.assign(this, { type, ...init, defaultPrevented: false }); } preventDefault() { if (this.cancelable) this.defaultPrevented = true; } }
  const p = parts({ modeCall: async () => ({ started: { claimed: true } }), KeyboardEvent, presetTable: async () => ({}), inIsolatedRoom: () => false });
  let selected = false;
  const doc = {
    activeElement: null,
    defaultView: { InputEvent },
    execCommand: (name) => { if (name === 'selectAll') selected = true; if (name === 'delete' && selected) box.innerText = ''; return true; },
    addEventListener() {},
    removeEventListener() {},
    querySelector: (selector) => (selector === '[data-composer-input]' ? box : null),
    querySelectorAll: () => [],
  };
  const box = { innerText: 'Summarise the report', isConnected: true, focus() { doc.activeElement = box; }, contains: (node) => node === box, dispatchEvent: () => true };
  const said = [];
  p.holdSendsForStarts(doc, { get: () => ({ currentId: 'ran', byId: { ran: { blank: false } }, workspaces: [] }) }, { say: (key) => said.push(key), settle: 1, store, recheck: [0] });
  await new Promise((done) => setTimeout(done, 15));
  assert.equal(box.innerText, '');
  assert.deepEqual(said, ['send.alreadySent']);
});
