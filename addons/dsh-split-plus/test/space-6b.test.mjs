/**
 * Item 4A, stage 6b, Part C (STAGE6B-DESIGN.md J19, 7.3, Revision 2 G9): Split follows the window's space. The pickers
 * list this space first, Recon only in a Recon window, unknown rows left out; Send to and Continue beside claim the
 * window's space; a pane from another space says so; pane sets keep each pane's space. Stand-ins only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, DATA_PATH } from '../index.js';
import { openSets } from '../lib/sets.js';

// Plus is English only (decision 28). The stand-in Modes answers a 'zh' ask with marked names, so a test can show that
// Split Plus never asks for them, even when the page or a route says Chinese.
const NAMES = {
  en: { chat: 'Chat', code: 'Code', devices: 'Devices', recon: 'Recon', workshop: 'Workshop' },
  zh: { chat: 'Chat (zh)', code: 'Code (zh)', devices: 'Devices (zh)', recon: 'Recon (zh)', workshop: 'Workshop (zh)' },
};

/** A stand-in app with Modes' spaces. `spaceOf`: id -> space, or a function that throws. */
function standIn({ spaceOf = {}, live = true, withSpaces = true, enabled = true, isolated = new Set(['r1']), list, home = '' } = {}) {
  const routes = new Map();
  const calls = [];
  const modes = {
    apiVersion: 2,
    get: (id) => ({ r1: 'research', d1: 'research', k1: 'code' })[id] ?? 'chat',
    isolated: (id) => isolated.has(id),
    modeName: (id, lang) => (lang === 'zh' ? `${id} (zh)` : id),
    async set(id, mode, options) { calls.push([id, mode, options]); },
    ...(withSpaces ? {
      spaces: {
        live: () => live,
        of: (id) => { const found = spaceOf[id]; if (typeof found === 'function') return found(); return found ?? ''; },
        list: () => (list ?? ['chat', 'code', 'devices', 'recon', 'workshop']).map((id) => ({ id })),
        modesIn: (id) => (id === 'chat' ? [{ id: 'chat' }, { id: 'research' }] : id === 'code' ? [{ id: 'code' }, { id: 'research' }] : []),
        startOf: (id) => (id === 'code' ? 'code' : 'chat'),
        names: (lang = 'en') => NAMES[String(lang).startsWith('zh') ? 'zh' : 'en'],
      },
    } : {}),
  };
  const settingsRows = [{ ns: 'modes', value: { modes: { chat: { label: 'Chat' }, code: { label: 'Code' }, research: { label: 'Research' } } } }];
  const ctx = {
    get: (name) => (name === 'modes' ? modes : name === 'settings' ? { describe: () => settingsRows } : undefined),
    on() {},
    effect: (fn) => fn(),
    inject(_names, fn) { fn({ effect: (register) => register(), webServer: { register: (route) => routes.set(route.path, route) }, connection: { requestRejection: () => undefined } }); },
    logger: { warn() {} },
  };
  apply(ctx, { enabled }, home ? { home } : {});
  return { routes, calls };
}

async function hit(routes, { method = 'GET', query = '', body } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = { method, url: `${DATA_PATH}${query}`, async *[Symbol.asyncIterator]() { yield* chunks; } };
  let text = '';
  const res = { statusCode: 200, setHeader() {}, end(value) { text = value ?? ''; } };
  await routes.get(DATA_PATH).handler(req, res);
  return { status: res.statusCode, data: text ? JSON.parse(text) : {} };
}

const CLIENT = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
/** The page's helpers, run as they are written in client.js (they use nothing from the page). */
function helpers() {
  const begin = CLIENT.indexOf('// ---- split-plus:claim-helpers:begin ----');
  const end = CLIENT.indexOf('// ---- split-plus:claim-helpers:end ----');
  assert.ok(begin > 0 && end > begin);
  return new Function(`${CLIENT.slice(begin, end)}\nreturn { claimSpace, pickerGroups, restorePlan, continuePlace, sendNewSpace, paneChip, words6b, SPLIT_6B_WORDS };`)();
}
const slice = (from, to) => CLIENT.slice(CLIENT.indexOf(from), CLIENT.indexOf(to, CLIENT.indexOf(from)));

const ROWS = [{ id: 'c1' }, { id: 'k1' }, { id: 'd1' }, { id: 'r1' }, { id: 'w1' }, { id: 'c2' }];
const ANSWER = {
  live: true,
  names: NAMES.en,
  spaces: {
    c1: { space: 'chat', sealed: false }, k1: { space: 'code', sealed: false }, d1: { space: 'devices', sealed: false },
    r1: { space: 'recon', sealed: true }, w1: { space: 'workshop', sealed: false }, c2: { space: 'chat', sealed: false },
  },
};
const shape = (grouped) => grouped.groups.map((group) => [group.label, group.rows.map((row) => row.id)]);

test('send-new-window-space: "A new chat in" claims the window\'s space; never out of a Recon window', () => {
  const { sendNewSpace } = helpers();
  assert.equal(sendNewSpace({ fromSpace: true }, 'code'), 'code');
  assert.equal(sendNewSpace({ fromSpace: true }, 'devices'), 'devices');
  assert.equal(sendNewSpace({ fromSpace: false }, 'workshop'), 'workshop', 'a guarded space keeps its rules (6a claimSpace)');
  assert.equal(sendNewSpace({ fromSpace: false }, 'chat'), '', 'a mode list that fell back to every mode: today\'s claim');
  assert.equal(sendNewSpace({ fromSpace: true }, 'recon'), null, 'refused in a Recon window');
  assert.equal(sendNewSpace({ fromSpace: true }, ''), '', 'no window space: as before');
  const send = slice('function SendMenu(', 'const ICON_SEND');
  assert.match(send, /const space = sendNewSpace\(offeredModes\(data\), windowSpace\(\)\);\s*if \(space === null\) throw new Error\(words6b\('sendNewRecon'/);
  assert.match(send, /startConversation\(appCtx, data, \{ mode, choice: 'scratch', space \}\)/);
});

test('continue-beside-window-space: Research beside opens in the window\'s space when it offers Research, else Chat with a line', () => {
  const { continuePlace, words6b } = helpers();
  const spaces = { chat: { modes: ['chat', 'research'] }, code: { modes: ['code', 'research'] }, devices: { modes: ['bench'] } };
  assert.deepEqual(continuePlace(spaces, 'code'), { space: 'code', note: '' });
  assert.deepEqual(continuePlace(spaces, 'chat'), { space: 'chat', note: '' });
  assert.deepEqual(continuePlace(spaces, 'devices'), { space: 'chat', note: 'chat' }, 'Research not offered in Devices');
  assert.deepEqual(continuePlace(spaces, 'recon'), { space: 'chat', note: 'recon' }, 'nothing goes into Recon this way');
  assert.deepEqual(continuePlace(null, 'code'), { space: '', note: '' }, 'spaces off: as before');
  assert.deepEqual(continuePlace(spaces, ''), { space: '', note: '' });
  assert.equal(words6b('continueInChat', { space: 'Devices' }, 'en'), 'Research is not offered in Devices, so the thread beside starts in Chat.');
  assert.equal(words6b('continueInChat', { space: 'Devices' }, 'zh-CN'), 'Research is not offered in Devices, so the thread beside starts in Chat.', 'English only');
  const beside = slice('const continueBeside = async', 'return h(React.Fragment');
  assert.match(beside, /const where = continuePlace\(data\.spaces, windowSpace\(\)\);/);
  assert.match(beside, /startConversation\(appCtx, data, \{ mode: 'research', choice: 'scratch', \.\.\.\(where\.space \? \{ space: where\.space \} : \{\}\) \}\)/);
});

test('continue-beside-sealed-refused: a sealed (or unknown) source pane starts nothing, and its text is not taken', () => {
  const { words6b } = helpers();
  const beside = slice('const continueBeside = async', 'return h(React.Fragment');
  const refused = beside.indexOf("throw new Error(words6b('continueSealed'");
  assert.ok(refused > 0);
  assert.match(beside, /if \(data\.panes\?\.\[sessionId\]\?\.sealed !== false\) throw new Error\(words6b\('continueSealed'/, 'sealed when unsure');
  assert.ok(refused < beside.indexOf("action: 'continued', sessionId, taken: true"), 'checked before the starting text is taken');
  assert.ok(refused < beside.indexOf('startConversation('), 'and before anything starts');
  assert.match(words6b('continueSealed', {}, 'en'), /^This pane is sealed \(Recon\), so its text cannot start a thread outside it\./);
  assert.match(words6b('continueSealed', {}, 'zh'), /^This pane is sealed \(Recon\)/, 'English only');
});

test('pickers-space-first: this space first, under "This space (…)", then the others under their names', () => {
  const { pickerGroups } = helpers();
  assert.deepEqual(shape(pickerGroups(ROWS, ANSWER, 'devices', 'en')), [['This space (Devices)', ['d1']], ['Chat', ['c1', 'c2']], ['Code', ['k1']], ['Workshop', ['w1']]]);
  assert.deepEqual(shape(pickerGroups(ROWS, ANSWER, 'code', 'en')), [['This space (Code)', ['k1']], ['Chat', ['c1', 'c2']], ['Devices', ['d1']], ['Workshop', ['w1']]]);
  assert.deepEqual(shape(pickerGroups(ROWS, ANSWER, 'chat', 'zh')), [['This space (Chat)', ['c1', 'c2']], ['Code', ['k1']], ['Devices', ['d1']], ['Workshop', ['w1']]], 'English only');
  assert.equal(pickerGroups(ROWS, ANSWER, 'chat', 'en', 2).groups.reduce((sum, group) => sum + group.rows.length, 0), 2, 'capped');
  assert.deepEqual(pickerGroups(ROWS, null, 'chat', 'en'), { groups: [], left: 0 }, 'nothing listed until the server answers');
  // Both pickers use it; a pick outside the grouped list is refused.
  const add = slice('function AddPane(', '/** The Split page. */');
  assert.match(add, /pickerGroups\(recent, known, windowSpace\(\), pageLang\(\), 40\)/);
  assert.match(add, /Pick a thread from the list\./);
  const send = slice('function SendMenu(', 'const ICON_SEND');
  assert.match(send, /pickerGroups\(recent, known, windowSpace\(\), pageLang\(\), 40\)/);
  assert.match(send, /Pick a thread from the list\./);
  assert.match(send, /\/\\\/dsh-recon\[\^\/\]\*\(\\\/\|\$\)\/\.test\(row\.cwd/, 'the Recon folder belt stays');
});

test('pickers-recon-only-in-recon: Recon and sealed threads only in a Recon window, where they come first', () => {
  const { pickerGroups } = helpers();
  const sealedChat = { ...ANSWER, spaces: { ...ANSWER.spaces, c2: { space: 'chat', sealed: true } } };
  for (const space of ['chat', 'code', 'devices', 'workshop', '']) {
    const ids = pickerGroups(ROWS, sealedChat, space, 'en').groups.flatMap((group) => group.rows.map((row) => row.id));
    assert.ok(!ids.includes('r1') && !ids.includes('c2'), `${space || 'no space'}: no Recon or sealed thread`);
  }
  const recon = pickerGroups(ROWS, sealedChat, 'recon', 'en');
  assert.deepEqual(shape(recon)[0], ['This space (Recon)', ['r1']]);
  assert.ok(shape(recon).some(([label, ids]) => label === 'Chat' && ids.includes('c2')));
  // Without Modes' spaces: today's list, with the server's sealed rows dropped.
  const old = pickerGroups(ROWS, { live: false, spaces: { c1: { space: '', sealed: false }, r1: { space: '', sealed: true }, k1: { space: '', sealed: false } } }, 'chat', 'en');
  assert.deepEqual(shape(old), [['', ['c1', 'k1']]]);
});

test('pickers-unknown-left-out: a row whose space the server cannot give is left out, with the note', () => {
  const { pickerGroups, words6b } = helpers();
  const answer = { ...ANSWER, spaces: { ...ANSWER.spaces, c2: { space: '', sealed: true } } };
  delete answer.spaces.w1;
  const grouped = pickerGroups(ROWS, answer, 'chat', 'en');
  assert.equal(grouped.left, 2);
  assert.ok(!grouped.groups.some((group) => group.rows.some((row) => row.id === 'c2' || row.id === 'w1')));
  // A failed ask: every row left out (the page asks with { live: true, spaces: {} } then).
  assert.deepEqual(pickerGroups(ROWS, { live: true, spaces: {} }, 'chat', 'en'), { groups: [], left: ROWS.length });
  assert.match(CLIENT, /call\(\{ action: 'spacesOf', ids, lang: pageLang\(\) \}\)\.then\(\(value\) => \{ if \(alive\) setAnswer\(value\); \}, \(\) => \{ if \(alive\) setAnswer\(\{ live: true, spaces: \{\}, names: \{\} \}\); \}\)/);
  assert.equal(words6b('unsorted', {}, 'en'), 'Some threads are not listed because their space could not be read. Close this and open it again.');
  assert.equal(words6b('unsorted', {}, 'zh'), words6b('unsorted', {}, 'en'), 'English only');
});

test('spacesOf: each thread\'s space, sealed when unsure; a read that throws is {space: "", sealed: true}; at most 80', async () => {
  const { routes } = standIn({ spaceOf: { c1: 'chat', d1: 'devices', r1: 'recon', bad: () => { throw new Error('busy'); } } });
  const answer = await hit(routes, { method: 'POST', body: { action: 'spacesOf', ids: ['c1', 'd1', 'r1', 'bad', 'none', '../x'] } });
  assert.equal(answer.status, 200);
  assert.equal(answer.data.live, true);
  assert.deepEqual(answer.data.spaces, {
    c1: { space: 'chat', sealed: false, name: 'Chat' },
    d1: { space: 'devices', sealed: false, name: 'Devices' },
    r1: { space: 'recon', sealed: true, name: 'Recon' },
    bad: { space: '', sealed: true },
    none: { space: '', sealed: false },
  }, 'not an id: not looked up');
  assert.equal(answer.data.names.devices, 'Devices');
  const zh = await hit(routes, { method: 'POST', body: { action: 'spacesOf', ids: ['d1'], lang: 'zh' } });
  assert.equal(zh.data.spaces.d1.name, 'Devices', 'English only: lang is accepted and ignored');
  assert.equal(zh.data.names.devices, 'Devices');
  const many = await hit(routes, { method: 'POST', body: { action: 'spacesOf', ids: Array.from({ length: 120 }, (_, n) => `t${n}`) } });
  assert.equal(Object.keys(many.data.spaces).length, 80);
  // Without Modes' spaces: no space, the seal only (the page keeps today's list without sealed rows).
  const old = standIn({ withSpaces: false });
  assert.deepEqual((await hit(old.routes, { method: 'POST', body: { action: 'spacesOf', ids: ['c1', 'r1'] } })).data, { ok: true, live: false, spaces: { c1: { space: '', sealed: false }, r1: { space: '', sealed: true } }, names: {} });
  const off = standIn({ enabled: false });
  assert.equal((await hit(off.routes, { method: 'POST', body: { action: 'spacesOf', ids: ['c1'] } })).status, 400);
  assert.equal((await hit(routes, { method: 'POST', body: { action: 'spacesOf', ids: 'c1' } })).status, 400);
});

test('restore-all-tagged: Bring back restores every pane as before; each pane\'s facts carry its space and name', async () => {
  assert.match(CLIENT, /onClick: \(\) => \{ store\.replace\(offer\.ids\); setOffer\(null\); \} \}, `Bring back the \$\{offer\.ids\.length\} pane/, 'Bring back unchanged');
  const { routes } = standIn({ spaceOf: { c1: 'chat', d1: 'devices' } });
  const view = await hit(routes, { query: '?sessions=c1,d1' });
  assert.equal(view.data.panes.d1.space, 'devices');
  assert.equal(view.data.panes.d1.spaceName, 'Devices');
  assert.equal(view.data.panes.c1.space, 'chat');
  assert.equal((await hit(routes, { query: '?sessions=d1&lang=zh-CN' })).data.panes.d1.spaceName, 'Devices', 'English only');
  assert.equal(view.data.spaceNames.workshop, 'Workshop');
  // A read that throws: no space on the pane (the chip shows the mode only).
  const bad = standIn({ spaceOf: { d1: () => { throw new Error('x'); } } });
  assert.equal((await hit(bad.routes, { query: '?sessions=d1' })).data.panes.d1.space, undefined);
});

test('chip-space-when-different: a pane shows its space beside its mode only when it is not the window\'s', () => {
  const { paneChip } = helpers();
  assert.equal(paneChip({ label: 'Research', space: 'devices', spaceName: 'Devices' }, 'chat'), 'Research · Devices');
  assert.equal(paneChip({ label: 'Research', space: 'chat', spaceName: 'Chat' }, 'chat'), 'Research');
  assert.equal(paneChip({ label: 'Research' }, 'chat'), 'Research', 'no space known');
  assert.equal(paneChip({ label: 'Research', space: 'devices' }, ''), 'Research', 'no window space');
  assert.equal(paneChip({ label: 'Research', space: 'devices' }, 'code'), 'Research · devices', 'the id when no name came');
  assert.equal(paneChip(undefined, 'chat'), '…');
  const pane = slice('function Pane(', '/** The folders the app knows');
  assert.match(pane, /const chip = paneChip\(facts, windowSpace\(\)\);/);
  assert.match(pane, /chip !== label \? h\('span', \{ className: 'dsh-sp-folder', 'data-pane-space'/);
});

test('restore-set-own-space (Revision 2 G9): sets keep each pane\'s space; restore claims it, older sets the window\'s space or Chat', async () => {
  const { restorePlan, words6b } = helpers();
  const spaces = { chat: { modes: ['chat', 'research'] }, code: { modes: ['code', 'research'] }, devices: { modes: ['bench', 'research'] } };
  assert.deepEqual(restorePlan([{ mode: 'research', space: 'chat' }, { mode: 'code', space: 'code' }], 'devices', spaces), [{ mode: 'research', space: 'chat' }, { mode: 'code', space: 'code' }], 'a Chat-saved set in a Devices window stays in Chat');
  assert.deepEqual(restorePlan([{ mode: 'research' }, { mode: 'chat' }], 'devices', spaces), [{ mode: 'research', space: 'devices' }, { mode: 'chat', space: 'chat' }], 'older set: the window\'s space when it offers the mode, else Chat');
  // Review finding: neither the window's space nor Chat offers it: no space, as before 6b (Modes puts it in its own space).
  assert.deepEqual(restorePlan([{ mode: 'research' }, { mode: 'bench' }], 'chat', spaces), [{ mode: 'research', space: 'chat' }, { mode: 'bench', space: '', shown: 'devices' }], 'a Devices pane of an older set still opens');
  assert.deepEqual(restorePlan([{ mode: 'code' }], 'devices', spaces), [{ mode: 'code', space: '', shown: 'code' }]);
  assert.deepEqual(restorePlan([{ mode: 'gone' }], 'chat', spaces), [{ mode: 'gone', space: '', shown: '' }]);
  assert.deepEqual(restorePlan([{ mode: 'bench', space: 'devices' }], 'chat', { chat: { modes: ['chat'] } }), [{ mode: 'bench', space: 'devices' }], 'never moved out of its saved space');
  assert.deepEqual(restorePlan([{ mode: 'code', space: 'code' }], 'chat', null), [{ mode: 'code', space: '' }], 'spaces off: as before');
  assert.equal(words6b('restoreWhere', { list: 'Research · Chat' }, 'en'), 'These panes open in: Research · Chat.');
  assert.equal(words6b('restoreWhere', { list: 'Research · Chat' }, 'zh'), 'These panes open in: Research · Chat.', 'English only');
  const sets = slice('function PaneSets(', '/** The same folder, ignoring');
  assert.match(sets, /const plan = restorePlan\(set\.panes, windowSpace\(\), data\.spaces\);/);
  assert.ok(sets.indexOf('askInPage(') < sets.indexOf('startConversation('), 'where each pane goes is shown before anything opens');
  assert.match(sets, /if \(!yes\) return;/);
  assert.match(sets, /startConversation\(appCtx, data, \{ mode: one\.mode, choice: from\?\.cwd \? 'same' : 'scratch', from, \.\.\.\(one\.space \? \{ space: one\.space \} : \{\}\) \}\)/);
  // The server saves each pane's space (from Modes) beside its mode; lib/sets.js keeps only a known space.
  const home = mkdtempSync(join(tmpdir(), 'split-6b-'));
  try {
    const { routes } = standIn({ spaceOf: { c1: 'chat', d1: 'devices', x1: () => { throw new Error('x'); } }, home });
    const saved = (await hit(routes, { method: 'POST', body: { action: 'saveSet', name: 'Mixed', sessionIds: ['c1', 'd1', 'x1'] } })).data;
    assert.deepEqual(saved.panes, [{ mode: 'chat', space: 'chat' }, { mode: 'research', space: 'devices' }, { mode: 'chat' }]);
    assert.deepEqual((await hit(routes, { query: '?sets=1' })).data.named[0].panes, saved.panes);
    const store = openSets({ home: '' });
    store.saveNamed('Odd', [{ mode: 'code', space: 'mars' }, { mode: 'research', space: 'recon', token: 'x' }]);
    assert.deepEqual(store.namedSet('Odd'), [{ mode: 'code' }, { mode: 'research', space: 'recon' }]);
    assert.equal(store.saveFolder('/Users/me/app', [{ sessionId: 's1', mode: 'code', space: 'code' }]), true);
    assert.deepEqual(store.folderPanes('/Users/me/app').panes, [{ sessionId: 's1', mode: 'code', space: 'code' }]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('space ids from Modes: a claim passes on only a space Modes lists (else today\'s claim, without one)', async () => {
  const { routes, calls } = standIn({ list: ['chat', 'code', 'devices', 'recon', 'workshop', 'lab'] });
  await hit(routes, { method: 'POST', body: { action: 'claim', sessionId: 'c1', mode: 'research', space: 'lab' } });
  await hit(routes, { method: 'POST', body: { action: 'claim', sessionId: 'c1', mode: 'research', space: 'mars' } });
  assert.deepEqual(calls, [['c1', 'research', { claim: true, space: 'lab' }], ['c1', 'research', { claim: true }]]);
  const fallback = standIn({ withSpaces: false });
  await hit(fallback.routes, { method: 'POST', body: { action: 'claim', sessionId: 'c1', mode: 'code', space: 'devices' } });
  assert.deepEqual(fallback.calls, [['c1', 'code', { claim: true, space: 'devices' }]], 'no list from Modes: the five');
});

test('texts: every stage-6b sentence of the page in English only (decision 28)', () => {
  const { SPLIT_6B_WORDS } = helpers();
  assert.deepEqual(Object.keys(SPLIT_6B_WORDS), ['en']);
  assert.equal(SPLIT_6B_WORDS.en.sendNewRecon, 'In a Recon window, Send to cannot start a new thread. Start one with Recon\'s New button, or use Send to from a window of another space.');
});

test('chip-mode-english-only (decision 28): a page that asks in Chinese still gets the English mode names', async () => {
  const { routes } = standIn({ spaceOf: { c1: 'chat', d1: 'devices' } });
  const zh = (await hit(routes, { query: '?sessions=d1&lang=zh-CN' })).data;
  assert.equal(zh.panes.d1.label, 'Research');
  assert.equal(zh.panes.d1.abbr, (await hit(routes, { query: '?sessions=d1' })).data.panes.d1.abbr, 'the short tag stays as before');
  assert.equal(zh.modes.find((row) => row.id === 'research').label, 'Research', 'the pane-set line and pickers read these');
  const en = (await hit(routes, { query: '?sessions=d1' })).data;
  assert.equal(en.panes.d1.label, 'Research');
  assert.equal(en.modes.find((row) => row.id === 'research').label, 'Research');
});
