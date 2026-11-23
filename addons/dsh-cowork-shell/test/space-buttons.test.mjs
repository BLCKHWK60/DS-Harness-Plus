// Item 4A, stage 3a (22 November 2026): five space buttons replace the mode tabs. Each thread is listed under its space
// (never under its mode), Archived and Trash per space, each window keeps its own space, each space remembers its last
// thread (the old per-tab memory is only read), the New button's words per space, Workshop without Creator Plus, and
// the copies of Modes' maps match Modes' own (lib/spaces.js).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as modesSpaces from '../../dsh-modes/lib/spaces.js';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

function functionText(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `client.js has no function ${name}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
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

/** A small storage stand-in (localStorage / sessionStorage). */
function store(initial = {}) {
  const data = { ...initial };
  return { data, getItem: (key) => (Object.hasOwn(data, key) ? data[key] : null), setItem: (key, value) => { data[key] = String(value); } };
}

const parts = (win) => new Function('window', `
  const NS = 'coworkShell'; const LOCAL_KEY = 'dsh-cowork-shell.tab'; const LAST_KEY = 'dsh-cowork-shell.lastOpen';
  ${['SPACE_IDS', 'MODE_SPACE', 'SPACE_TAB', 'SPACE_KEY', 'LAST_SPACE_KEY', 'SPACES_ON_KEY', 'isSpaceId', 'usualTabsOf', 'tabsOf', 'spaceMode', 'GUARDED_SPACE_IDS'].map(constLine).join('\n')}
  ${['readOrder', 'orderTabs', 'guessTab', 'readLast', 'spaceOfModeId', 'spaceOfTabId', 'spaceOrderFrom', 'lastOpenBySpace', 'spaceOfTrashItem', 'spaceOfSession', 'trashSpace', 'spaceOfProjectEntry', 'spacesOf', 'workshopWithoutCreator', 'selectedTab', 'readSpaceLocal', 'writeSpaceLocal', 'readLastSpace', 'writeLastSpace', 'readSpacesOn', 'tabKeyOf', 'trashTab', 'emptyIds', 'inTabTrash', 'threadSpaceToShow'].map(functionText).join('\n')}
  return { SPACE_IDS, MODE_SPACE, SPACE_TAB, spaceOfModeId, spaceOfTabId, spaceOrderFrom, lastOpenBySpace, spaceOfTrashItem, spaceOfSession, trashSpace, spaceOfProjectEntry, spacesOf, workshopWithoutCreator, selectedTab, readSpaceLocal, writeSpaceLocal, readLastSpace, writeLastSpace, readSpacesOn, tabKeyOf, spaceMode, trashTab, emptyIds, inTabTrash, threadSpaceToShow };
`)(win);

const plain = parts({ localStorage: store(), sessionStorage: store() });

test('the copies match Modes\' own maps (lib/spaces.js): spaces, mode -> space, the space\'s own tab', () => {
  assert.deepEqual(plain.SPACE_IDS, [...modesSpaces.SPACE_IDS]);
  assert.deepEqual(plain.MODE_SPACE, { ...modesSpaces.MODE_SPACE });
  assert.deepEqual(plain.SPACE_TAB, { ...modesSpaces.SPACE_TAB });
  const orders = [[], ['code', 'chat'], ['recon', 'bench', 'research', 'chat'], ['creator-plus'], 'bad', ['mine', 'finance']];
  for (const order of orders) assert.deepEqual(plain.spaceOrderFrom(order), modesSpaces.spaceOrderFrom(order), JSON.stringify(order));
  const last = { cowork: 'a', chat: 'b', bench: 'c', research: 'd', 'creator-plus': 'e', code: 'f' };
  for (const order of [[], ['research', 'cowork']]) assert.deepEqual(plain.lastOpenBySpace(last, order), modesSpaces.lastOpenBySpace(last, order));
  for (const item of [{ tab: 'bench' }, { fallbackTab: 'code' }, { space: 'recon', tab: 'chat' }, {}, { tab: 'research' }]) {
    assert.equal(plain.spaceOfTrashItem(item), modesSpaces.spaceOfTrashItem(item), JSON.stringify(item));
  }
  for (const id of ['chat', 'bench', 'creator-plus', 'mine', 'toString', '']) assert.equal(plain.spaceOfModeId(id), modesSpaces.spaceOfMode(id), id);
});

test('each thread is listed under its space: its recorded space, never its mode; a new one in the window\'s space', () => {
  const state = { space: 'code', sessionSpaces: { a: 'chat', r: 'recon' }, sessionModes: { a: 'code', b: 'bench', c: 'research', r: 'recon' } };
  assert.equal(plain.spaceOfSession('a', {}, null, state), 'chat', 'Code mode in a Chat thread: still Chat');
  assert.equal(plain.spaceOfSession('b', {}, null, state), 'devices', 'no recorded space yet: its mode\'s');
  assert.equal(plain.spaceOfSession('c', {}, null, state), 'chat', 'Research lives in Chat unless recorded elsewhere');
  assert.equal(plain.spaceOfSession('new', { blank: true }, null, state), 'code', 'a new thread: the window\'s space');
  assert.equal(plain.spaceOfSession('old', {}, null, state), 'chat', 'no mode and no folder: Chat');
  assert.equal(plain.spaceOfSession('old', {}, { path: '/Users/me/default-workspace' }, state), 'chat', 'the default workspace: Chat');
  assert.equal(plain.spaceOfSession('old', {}, { path: '/Users/me/site' }, state), 'code', 'another folder: Code');
  assert.equal(plain.spaceOfSession('x', {}, null, { ...state, sessionSpaces: { x: 'later-space' }, sessionModes: { x: 'bench' } }), 'devices', 'an unknown stored value is passed over');
});

test('Trash per space: read through the stored tab and fallback, never rewritten; unknown ones show in every space', () => {
  const state = { spacesOn: true, sessionSpaces: { s3: 'code' }, sessionModes: { s4: 'bench' } };
  const shown = ['chat', 'code', 'recon'];
  assert.equal(plain.trashSpace({ id: 's1', tab: 'research' }, state, shown), 'chat', 'deleted from the Research tab: Chat');
  assert.equal(plain.trashSpace({ id: 's2', tab: 'recon' }, state, shown), 'recon');
  assert.equal(plain.trashSpace({ id: 's3' }, state, shown), 'code', 'an older one: its recorded space');
  assert.equal(plain.trashSpace({ id: 's4', fallbackTab: 'code' }, state, shown), 'code', 'its space (Devices) is not shown: the space its folder gives');
  assert.equal(plain.trashSpace({ id: 's5', tab: 'bench' }, state, shown), 'chat', 'nothing fits: the first shown space');
  assert.equal(plain.trashSpace({ id: 's6' }, state, shown), null, 'cannot be told: every space');
  // trashTab (and so Empty trash and each list) uses the space with the buttons on, the tab without.
  assert.equal(plain.trashTab({ id: 's1', tab: 'research' }, state, shown), 'chat');
  assert.equal(plain.trashTab({ id: 's1', tab: 'research' }, { sessionModes: {} }, ['chat', 'research']), 'research');
  const items = [{ id: 'x1', tab: 'code' }, { id: 'x2', tab: 'cowork' }, { id: 'x3' }];
  assert.deepEqual(plain.emptyIds(items, state, shown, 'chat'), ['x2'], 'Empty trash in Chat erases Chat\'s rows only');
  assert.equal(plain.inTabTrash({ id: 'x3' }, state, shown, 'code'), true, 'an untold row shows everywhere');
  assert.equal(plain.spaceOfProjectEntry({ tab: 'bench' }), 'devices');
  assert.equal(plain.spaceOfProjectEntry({ space: 'code', tab: 'chat' }), 'code');
});

test('the buttons: the spaces Modes says are shown, Chat always, in your order or the order your tabs had', () => {
  const t = (key) => `t:${key}`;
  const rows = [{ id: 'chat', shown: true }, { id: 'code', shown: true }, { id: 'devices', shown: false }, { id: 'recon', shown: true }, { id: 'workshop', shown: true }];
  assert.deepEqual(plain.spacesOf({ spaceRows: rows, tabOrder: [], spaceOrder: [] }, t).map((one) => one.id), ['chat', 'code', 'recon', 'workshop']);
  assert.equal(plain.spacesOf({ spaceRows: rows, tabOrder: [], spaceOrder: [] }, t)[0].label, 't:space.chat');
  assert.deepEqual(plain.spacesOf({ spaceRows: rows, tabOrder: ['recon', 'code', 'cowork'], spaceOrder: [] }).map((one) => one.id), ['recon', 'code', 'chat', 'workshop'], 'from the tab order, never rewritten');
  assert.deepEqual(plain.spacesOf({ spaceRows: rows, tabOrder: ['recon'], spaceOrder: ['workshop', 'chat'] }).map((one) => one.id), ['workshop', 'chat', 'code', 'recon'], 'your own space order wins');
  assert.deepEqual(plain.spacesOf({ spaceRows: [{ id: 'code', shown: true }] }).map((one) => one.id), ['chat', 'code'], 'Chat is always there');
  assert.deepEqual(plain.spacesOf({}).map((one) => one.id), ['chat'], 'before Modes answers: Chat only');
  // Workshop through Tuner Plus only: no Creator Plus mode.
  assert.equal(plain.workshopWithoutCreator({ modes: [{ id: 'chat' }], extra: [{ id: 'research' }] }), true);
  assert.equal(plain.workshopWithoutCreator({ modes: [{ id: 'chat' }], extra: [{ id: 'creator-plus' }] }), false);
  // What still reads a tab gets the space's own tab.
  assert.deepEqual(plain.selectedTab({ spacesOn: true, space: 'devices', spaceRows: rows.map((row) => ({ ...row, shown: true })) }, t), { id: 'bench', label: 't:space.devices', space: 'devices' });
  assert.equal(plain.selectedTab({ spacesOn: true, space: 'devices', spaceRows: rows }, t).space, 'chat', 'a hidden space falls back to the first button');
  assert.equal(plain.selectedTab({ spacesOn: false, modes: [{ id: 'chat' }, { id: 'code' }], maxTabs: 2, extra: [], tabOrder: [], selected: 'code' }).id, 'code');
});

test('each window keeps its own space; a new window starts from the last one chosen, else the old tab\'s space', () => {
  const local = store({ 'dsh-cowork-shell.tab': 'bench' });
  const one = parts({ localStorage: local, sessionStorage: store() });
  assert.equal(one.readSpaceLocal(), 'devices', 'the old stored tab, read through the map');
  one.writeSpaceLocal('recon');
  assert.equal(local.data['dsh-cowork-shell.tab'], 'bench', 'the old key is not rewritten');
  assert.equal(local.data['dsh-cowork-shell.space'], 'recon');
  // Another window: its own choice stays its own.
  const otherSession = store({ 'dsh-cowork-shell.space': 'code' });
  const two = parts({ localStorage: local, sessionStorage: otherSession });
  assert.equal(two.readSpaceLocal(), 'code');
  assert.equal(parts({ localStorage: local, sessionStorage: store() }).readSpaceLocal(), 'recon', 'a new window: the last one chosen');
  assert.equal(parts({ localStorage: store({ 'dsh-cowork-shell.space': 'nonsense' }), sessionStorage: store() }).readSpaceLocal(), 'chat');
});

test('each space remembers its last thread; the old per-tab memory is read, never rewritten', () => {
  const local = store({ 'dsh-cowork-shell.lastOpen': JSON.stringify({ cowork: 'c1', chat: 'c0', code: 'k1', bench: 'd1' }) });
  const win = parts({ localStorage: local, sessionStorage: store() });
  assert.deepEqual(win.readLastSpace([]), { chat: 'c0', code: 'k1', devices: 'd1' });
  win.writeLastSpace('chat', 'c9');
  win.writeLastSpace('not-a-space', 'x');
  assert.deepEqual(win.readLastSpace([]), { chat: 'c9', code: 'k1', devices: 'd1' });
  assert.equal(local.data['dsh-cowork-shell.lastOpen'], JSON.stringify({ cowork: 'c1', chat: 'c0', code: 'k1', bench: 'd1' }), 'old key untouched');
});

test('a start, a preset lock or a start place reads the space\'s own tab while spaces are live', () => {
  const win = parts({ localStorage: store(), sessionStorage: store() });
  win.spaceMode.on = true;
  assert.equal(win.tabKeyOf('devices'), 'bench');
  assert.equal(win.tabKeyOf('workshop'), 'creator-plus');
  assert.equal(win.tabKeyOf('recon'), 'recon');
  assert.equal(win.tabKeyOf('research'), 'research', 'a mode id is passed through');
  win.spaceMode.on = false;
  assert.equal(win.tabKeyOf('devices'), 'devices');
});

test('the sidebar: space buttons, data-cws-space for the window, data-cws-tab for the open thread\'s mode', () => {
  assert.match(source, /const tabs = spacesOn \? spacesOf\(state, t\) : tabsOf\(state\);/);
  assert.match(source, /const key = spacesOn \? SPACE_TAB\[selected\.id\] : selected\.id;/);
  // Other add-ons' bars (Finance, Research, Recon) keep reading data-cws-tab: the open thread's mode.
  assert.match(source, /const shownTabId = spacesOn \? \(typeof openMode === 'string' && openMode \? openMode : \(typeof spaceStart === 'string' && spaceStart \? spaceStart : key\)\) : selected\.id;/);
  assert.match(source, /if \(spacesOn\) root\.setAttribute\('data-cws-space', selected\.id\);/);
  // A space button keeps the tab look; its id is the space id (the colours match recon and devices).
  assert.match(source, /role: 'tab', className: 'cws-tab', 'aria-selected': m\.id === selected\.id, 'data-tab-id': m\.id,/);
  assert.match(source, /h\(Glyph, \{ name: glyphFor\(spacesOn \? SPACE_TAB\[m\.id\] : m\.id\)/);
  // Arranging: the buttons' own order (`spaceOrder`), `tabOrder` untouched.
  assert.match(source, /if \(spacesOn\) void model\.setOption\('spaceOrder', mergeOrder\(ids, readOrder\(state\.spaceOrder\)\.length > 0 \? state\.spaceOrder : spaceOrderFrom\(state\.tabOrder\)\)\);/);
  const server = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(server, /spaceOrder: z\.array\(z\.string\(\)\)\.default\(\[\]\)\.volatile\(\),/);
});

test('select() with spaces writes nothing to Modes (no defaultMode), only this window\'s space', () => {
  const body = functionText('createModel');
  const select = body.slice(body.indexOf('async function select('), body.indexOf('const before = state.selected;', body.indexOf('async function select(')));
  assert.match(select, /if \(state\.spacesOn\) \{[\s\S]*writeSpaceLocal\(space\);\s*(\/\/[^\n]*\n\s*)*set\(\{ space, selected: SPACE_TAB\[space\], error: '', \.\.\.\(space !== state\.space \? \{ notice: '' \} : \{\}\) \}\);\s*return;\s*\}/, 'stage 7: a space button also takes a draft line away');
  assert.doesNotMatch(select, /defaultMode/);
  // A refresh no longer takes the window's space from the stored tab.
  assert.match(body, /if \(spacesNow\) \{\s*if \(!state\.spacesOn\) patch\.selected = SPACE_TAB\[state\.space\] \?\? 'chat';\s*\} else if/);
});

test('moving a thread to another space goes through Modes, which refuses with a sentence (never into Recon)', () => {
  const body = functionText('createModel');
  assert.match(body, /if \(state\.spacesOn\) return moveSpace\(sessionIds, modeId\);/);
  assert.match(body, /body: JSON\.stringify\(\{ action: 'move', sessionId: sessionIds\[0\], sessionIds, space \}\),/);
  assert.match(body, /set\(\{ sessionSpaces: before, error: data\.error\.slice\(0, 400\), errorFix: '', errorDetails: '' \}\);/, 'the refusal sentence is shown; the list goes back');
  // Fix round: a network or reply problem says what went wrong and what to click; the raw text only behind Details.
  assert.match(body, /set\(\{ sessionSpaces: before, error: t\('move\.failed'\), errorFix: t\('move\.failed\.fix'\), errorDetails: String\(error\?\.message \?\? error\)\.slice\(0, 400\) \}\);/);
  assert.match(body, /if \(Object\.prototype\.hasOwnProperty\.call\(patch, 'error'\) && !Object\.prototype\.hasOwnProperty\.call\(patch, 'errorDetails'\)\) patch = \{ \.\.\.patch, errorFix: '', errorDetails: '' \};/, 'a later error never shows old details');
  assert.match(source, /h\(ui\.ErrorNote, \{ what: state\.error, fix: state\.errorFix \|\| undefined, details: state\.errorDetails \|\| undefined \}\)/);
  assert.match(source, /'move\.failed\.fix': 'Try again\. If it keeps failing, restart the app\.',/);
  assert.match(source, /const moveTargets = \(\) => tabs\.filter\(\(m\) => m\.id !== 'recon'\);/);
  assert.match(source, /promote: flat && !spacesOn,/, '"Promote to" goes with the space buttons');
  assert.match(source, /const outTab = spacesOn \? SPACE_TAB\[modeId\] \?\? modeId : modeId;/, 'out of Recon: a new thread in the space\'s own place');
});

test('the New button\'s words per space, Workshop without Creator Plus, and every new word once, in English', () => {
  const words = { 'new.space.chat': 'New chat', 'new.space.code': 'New code task', 'new.space.devices': 'New device task', 'new.space.recon': 'New Recon search', 'new.space.workshop': 'New workshop task', 'workshop.off': 'Switch on Creator Plus to start Workshop threads.' };
  for (const [key, text] of Object.entries(words)) assert.ok(source.includes(`'${key}': '${text}'`), key);
  for (const key of ['spaces.label', 'space.chat', 'space.code', 'space.devices', 'space.recon', 'space.workshop', 'spaces.arrange', 'spaces.arrange.hint', ...Object.keys(words), 'workshop.off.open', 'spaces.info.title', 'spaces.info.what', 'spaces.info.when', 'spaces.info.change', 'move.label.space']) {
    assert.equal(source.split('\n').filter((line) => line.includes(`'${key}':`)).length, 1, `${key}: English only`);
  }
  assert.match(source, /const noNew = spacesOn && selected\.id === 'workshop' && workshopWithoutCreator\(state\);/);
  assert.match(source, /h\('button', \{ type: 'button', className: 'cws-link', onClick: \(\) => openSettingsPage\(appCtx, 'creator-plus'\) \}, t\('workshop\.off\.open'\)\)/);
  // The (i) about spaces: the shared pop-up, with the three heads.
  assert.match(source, /h\('span', \{ key: 'spaces-info', className: 'cws-info' \}, h\(ui\.Info, \{ title: t\('spaces\.info\.title'\), what: t\('spaces\.info\.what'\), when: t\('spaces\.info\.when'\), change: t\('spaces\.info\.change'\)/);
});

test('a thread opened from outside the list (⌘K) brings the window to its space, as the owner chose (22 Nov)', () => {
  const { threadSpaceToShow } = parts({ localStorage: store(), sessionStorage: store() });
  const state = { spacesOn: true, space: 'chat', sessionSpaces: { a: 'code', r: 'recon', d: 'devices' }, sessionModes: {} };
  const shown = ['chat', 'code', 'recon'];
  assert.equal(threadSpaceToShow('a', {}, null, state, shown), 'code', 'a Code thread opened from Chat: the window goes to Code');
  assert.equal(threadSpaceToShow('r', {}, null, state, shown), 'recon', 'a sealed Recon thread: to Recon');
  assert.equal(threadSpaceToShow('d', {}, null, state, shown), null, 'its space is hidden: the window stays');
  assert.equal(threadSpaceToShow('a', { blank: true }, null, state, shown), null, 'a blank draft never moves the window');
  assert.equal(threadSpaceToShow('a', {}, null, { ...state, space: 'code' }, shown), null, 'already in its space');
  assert.equal(threadSpaceToShow('a', {}, null, { ...state, spacesOn: false }, shown), null, 'without spaces: nothing');
  // Wired to the open thread changing, never to the thread the window opened with.
  assert.match(source, /const followed = useRef\(libSnap\.currentId\);/);
  assert.match(source, /if \(space\) void model\.select\(space\);\n      \}, \[libSnap\.ok, libSnap\.currentId\]\);/);
});
