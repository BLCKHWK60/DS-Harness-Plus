import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// client.js is a browser bundle, so its plain helpers are cut out of the source and run here alone.
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

/** The text of `function name(...) { ... }` in the bundle, found by matching braces. */
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

/** The text of one `const name = ...;` line in the bundle. */
function constLine(name) {
  const match = source.match(new RegExp(`^\\s*const ${name} = .*;$`, 'm'));
  assert.ok(match, `client.js has no const ${name}`);
  return match[0];
}

const homeFor = new Function(`${constLine('roomKey')}\n${constLine('rooms')}\n${functionText('defaultWorkspace')}\n${functionText('homeFor')}\nreturn homeFor;`)();

const home = { workspaceId: 'w-home', path: '/Users/someone/default-workspace', sessionIds: ['s1'], createdAt: '2026-01-01T00:00:00Z' };
const books = { workspaceId: 'w-books', path: '/Users/someone/Books', sessionIds: ['s2'], createdAt: '2026-01-02T00:00:00Z' };
const room = { workspaceId: 'w-room', path: '/private/tmp/dsh-recon-room', sessionIds: ['s3'], createdAt: '2026-01-03T00:00:00Z' };
const byId = { s1: { updatedAt: 100 }, s2: { updatedAt: 200 }, s3: { updatedAt: 900 } };

test('a new Cowork conversation never starts in the Recon room, even when it was used last', () => {
  const lib = { ok: true, workspaces: [home, books, room], byId, currentId: null };
  assert.equal(homeFor(lib, 'cowork')?.workspaceId, 'w-books');
  // Also not when the open conversation is a Recon one.
  assert.equal(homeFor({ ...lib, currentId: 's3' }, 'code')?.workspaceId, 'w-books');
  // The open conversation's own project still wins, as in the app.
  assert.equal(homeFor({ ...lib, currentId: 's1' }, 'code')?.workspaceId, 'w-home');
});

test('without a room among the projects the app keeps its own choice, and Chat keeps its workspace', () => {
  const lib = { ok: true, workspaces: [home, books], byId, currentId: null };
  assert.equal(homeFor(lib, 'cowork'), null);
  assert.equal(homeFor({ ...lib, workspaces: [home, books, room] }, 'chat')?.workspaceId, 'w-home');
  assert.equal(homeFor({ ok: false, workspaces: [room], byId: {}, currentId: null }, 'cowork'), null);
});

const newLabelFor = new Function(`${functionText('newLabelFor')}\nreturn newLabelFor;`)();

test('the New button: saved text first, then translated text, then the built-in copy', () => {
  const t = (key) => `zh:${key}`;
  const defaults = { cowork: { newLabel: 'New task' }, research: { newLabel: 'New research' }, scout: { newLabel: 'New search' } };
  assert.equal(newLabelFor({ research: { newLabel: ' Ask ' } }, 'research', t, defaults), 'Ask');
  assert.equal(newLabelFor({}, 'research', t, defaults), 'zh:new.research', 'a saved layout without the tab: the translated text');
  assert.equal(newLabelFor({ scout: {} }, 'scout', t, defaults), 'zh:new.scout');
  assert.equal(newLabelFor({}, 'data', t, { data: { newLabel: 'New analysis' } }), 'New analysis', 'another add-on tab: its built-in copy');
  assert.equal(newLabelFor({}, 'cowork', t, defaults), 'zh:new.cowork', 'the app\'s own tabs stay translated');
  assert.equal(newLabelFor({}, 'finance', t, defaults), 'zh:new.other');
});

const stopQuestion = new Function(`${functionText('stopQuestion')}\nreturn stopQuestion;`)();

test('the question before stopping names the automation that would be deleted, and says so plainly', () => {
  const t = (key, values = {}) => `${key}|${values.names ?? ''}|${values.n ?? ''}`;
  const plain = 'This conversation is still working. Stop it and delete it?';
  assert.equal(stopQuestion(undefined, plain, t), plain, 'no details: the plain question');
  assert.equal(stopQuestion([{ kind: 'turn', items: [] }], plain, t), plain, 'only still working: the plain question');
  // What the app sends (checked in the lab): kind "schedule" with the automation's id and title.
  const one = [{ kind: 'schedule', items: [{ id: 'schedule-1', label: 'Lab daily  market note' }] }];
  assert.equal(stopQuestion(one, plain, t), 'stop.automation.one|“Lab daily market note”|1');
  const two = [{ kind: 'schedule', items: [{ id: 'a', label: 'Morning brief' }, { id: 'b', label: 'Weekly sum' }] }];
  assert.equal(stopQuestion(two, plain, t), 'stop.automation.many|“Morning brief”, “Weekly sum”|2');
  assert.equal(stopQuestion([{ kind: 'schedule', items: [{ id: 'x' }] }], plain, t), 'stop.automation.unnamed||1', 'no title: no name, still the warning');
  assert.equal(stopQuestion([...one, { kind: 'subagent', items: [] }], plain, t), `stop.automation.one|“Lab daily market note”|1\n\n${plain}`, 'also still working: both');
});

test('the warning texts say the automation is deleted for good and cannot be put back', () => {
  for (const key of ['stop.automation.one', 'stop.automation.many', 'stop.automation.unnamed']) {
    const line = source.split('\n').find((text) => text.includes(`'${key}':`) && /[a-z]/.test(text.split(':').slice(1).join(':')));
    assert.match(line, /for good/, key);
    assert.match(line, /cannot be put back/, key);
  }
});

test('the Delete permanently question says it cannot be put back and where copies may remain', () => {
  const lines = source.split('\n').filter((text) => text.includes("'trash.erase.confirm':"));
  assert.equal(lines.length, 2, 'English and Chinese');
  const en = lines.find((text) => /[a-z]{4}/.test(text.split(':').slice(1).join(':')));
  assert.match(en, /\{title\}/);
  assert.match(en, /cannot be put back/);
  assert.match(en, /Time Machine/);
  assert.match(en, /Sync/);
  assert.match(lines.find((text) => text !== en), /\{title\}/);
  // A row being erased offers no Put back and no second delete.
  assert.match(source, /item\.erasing\s*\?\s*\[dot\('d1'\), h\('span', \{ key: 'erasing'/);
  // Two lines: the title alone on the first, so a narrow sidebar does not cut it to one letter.
  assert.match(source, /h\('span', \{ className: 'cws-conv-main cws-trashed', title \},\s*h\('span', \{ className: 'cws-label' \}, title\)\),\s*group \? h\('div', \{ className: 'cws-trash-meta cws-trash-sub' \}/, 'a group row adds its own line; the title line stays alone');
});

const trashTab = new Function(`${functionText('trashTab')}\nreturn trashTab;`)();

test('each tab\'s Trash list shows only what was deleted from it; nothing deleted is out of reach', () => {
  const tabs = ['chat', 'cowork', 'code', 'recon'];
  const state = { sessionModes: { 'session-old': 'recon', 'session-both': 'chat' } };
  assert.equal(trashTab({ id: 'session-r', tab: 'recon' }, state, tabs), 'recon');
  assert.equal(trashTab({ id: 'session-both', tab: 'code' }, state, tabs), 'code', 'the tab kept at delete time wins');
  assert.equal(trashTab({ id: 'session-old' }, state, tabs), 'recon', 'deleted before 0.58.0: its recorded tab');
  assert.equal(trashTab({ id: 'session-unknown' }, state, tabs), null, 'tab cannot be told: every tab');
  assert.equal(trashTab({ id: 'session-x', tab: 'finance' }, state, tabs), 'chat', 'its tab is not shown now: the first tab, as Archived does');
  assert.equal(trashTab({ id: 'session-x', tab: 'finance' }, {}, []), null);
  assert.equal(trashTab({ id: 'session-x' }, undefined, tabs), null);
});

test('both ways to delete keep the tab, and the Trash list counts and lists only this tab\'s', () => {
  assert.equal((source.match(/trash\.remove\(id, (?:title|titleOf\(id\)), tabOf\(id\)\)/g) ?? []).length, 3, 'Delete, the right-click Delete and the Scratch clean-up');
  assert.equal((source.match(/trash\.remove\(/g) ?? []).length, 3, 'no other delete call');
  assert.match(source, /t\('trash\.title', \{ n: binHere\.length \}\)/);
  assert.match(source, /shown \? binHere\.map\(/);
  // Hiding a deleted conversation from the lists still uses the whole trash.
  assert.match(source, /const deleted = new Set\(bin\.items\.flatMap\(\(item\) => \[item\.id, \.\.\.\(Array\.isArray\(item\.ids\) \? item\.ids : \[\]\)\]\)\);/, 'and the runs inside group rows');
});

const trashLists = new Function(`${functionText('trashTab')}\n${functionText('inTabTrash')}\n${functionText('guessTab')}\nreturn { trashTab, inTabTrash, guessTab };`)();

test('while a conversation\'s tab is not shown, its Trash row goes where the Archived list puts it', () => {
  const { trashTab, guessTab } = trashLists;
  assert.equal(guessTab(null), 'chat');
  assert.equal(guessTab({ path: '/Users/someone/Documents/deepseek-harness/default-workspace' }), 'cowork');
  assert.equal(guessTab({ path: '/private/tmp/dsh-recon-room' }), 'code');
  // Recon switched off: a Recon conversation's row goes to Code, like its archived conversations.
  assert.equal(trashTab({ id: 's', tab: 'recon', fallbackTab: 'code' }, {}, ['chat', 'cowork', 'code']), 'code');
  assert.equal(trashTab({ id: 's', tab: 'recon', fallbackTab: 'code' }, {}, ['chat', 'cowork']), 'chat', 'neither shown: the first tab');
  assert.equal(trashTab({ id: 's', tab: 'recon', fallbackTab: 'code' }, {}, ['chat', 'code', 'recon']), 'recon', 'shown again: back under Recon');
});

test('every deleted conversation is in at least one tab\'s Trash list, and in only its own when its tab is known', () => {
  const { inTabTrash } = trashLists;
  const tabs = ['chat', 'cowork', 'code', 'recon'];
  const state = { sessionModes: { 'session-old': 'recon' } };
  const items = [{ id: 'session-r', tab: 'recon' }, { id: 'session-c', tab: 'chat' }, { id: 'session-old' }, { id: 'session-unknown' }, { id: 'session-hidden', tab: 'finance' }];
  for (const item of items) assert.ok(tabs.some((tab) => inTabTrash(item, state, tabs, tab)), `${item.id} is reachable`);
  assert.deepEqual(tabs.filter((tab) => inTabTrash(items[0], state, tabs, tab)), ['recon'], 'a Recon one only under Recon');
  assert.deepEqual(tabs.filter((tab) => inTabTrash(items[2], state, tabs, tab)), ['recon']);
  assert.deepEqual(tabs.filter((tab) => inTabTrash(items[3], state, tabs, tab)), tabs, 'tab unknown: every tab');
  assert.match(source, /bin\.items\.filter\(\(item\) => inTabTrash\(item, state, tabIds, selected\.id\)\)/, 'the list uses it');
});

test('the right-click menu offers neither Restore nor Delete for a Recon conversation being wiped', () => {
  assert.match(source, /const usable = ids\.filter\(\(id\) => !wipingIds\.has\(id\)\)/);
  assert.match(source, /restoreMany\(usable\)/);
  assert.match(source, /removeMany\(usable\)/);
  assert.doesNotMatch(source, /restoreMany\(ids\)|removeMany\(ids\)\s*}/);
});

const emptying = new Function(`${functionText('trashTab')}\n${functionText('emptyIds')}\n${functionText('rowContents')}\nasync ${functionText('runEmpty')}\nreturn { emptyIds, runEmpty, rowContents };`)();

test('Empty trash takes only this tab\'s own rows (not those being deleted, not those listed in every tab), after one question naming how many', async () => {
  const { emptyIds, runEmpty } = emptying;
  const tabs = ['chat', 'cowork', 'code', 'recon'];
  const state = { sessionModes: { 'old-recon': 'recon' } };
  const items = [
    { id: 'chat-1', tab: 'chat' }, { id: 'chat-2', tab: 'chat' }, { id: 'chat-busy', tab: 'chat', erasing: true },
    { id: 'recon-1', tab: 'recon' }, { id: 'old-recon' }, { id: 'untold-1' }, { id: 'untold-2' }, null,
  ];
  assert.deepEqual(emptyIds(items, state, tabs, 'chat'), ['chat-1', 'chat-2']);
  assert.deepEqual(emptyIds(items, state, tabs, 'recon'), ['recon-1', 'old-recon']);
  const t = (key, vars) => `${key}|${vars?.n ?? ''}`;
  const sent = [];
  const asked = [];
  let started = 0;
  const done = await runEmpty({ items, state, tabIds: tabs, selectedId: 'chat', t, ask: (q) => { asked.push(q); return true; }, send: async (ids) => { sent.push(ids); return { emptied: { erased: ids.length, marked: 0, failed: 0 } }; }, start: () => { started += 1; } });
  assert.deepEqual(sent, [['chat-1', 'chat-2']], 'never another tab\'s, never one listed in every tab');
  assert.equal(asked.length, 1);
  assert.match(asked[0], /^trash\.empty\.confirm\|2/);
  assert.match(asked[0], /trash\.empty\.untold\|2/, 'says how many older rows it leaves');
  assert.equal(started, 1);
  assert.deepEqual(done, { asked: true, sent: ['chat-1', 'chat-2'], failed: 0 });

  // One row: the singular question; no older rows: no extra sentence.
  const one = [];
  await runEmpty({ items: [{ id: 'x', tab: 'code' }], state: {}, tabIds: tabs, selectedId: 'code', t, ask: (q) => { one.push(q); return true; }, send: async () => ({}) });
  assert.equal(one[0], 'trash.empty.confirm.one|1');

  // No: nothing sent, the button never says "Emptying…".
  let calls = 0;
  started = 0;
  const no = await runEmpty({ items, state, tabIds: tabs, selectedId: 'chat', t, ask: () => false, send: async () => { calls += 1; }, start: () => { started += 1; } });
  assert.deepEqual([no.sent, calls, started], [[], 0, 0]);

  // Only rows listed in every tab: nothing to empty, no question.
  const none = await runEmpty({ items: [{ id: 'untold-1' }], state: {}, tabIds: tabs, selectedId: 'chat', t, ask: () => { throw new Error('asked'); }, send: async () => {} });
  assert.deepEqual(none, { asked: false, sent: [], failed: 0 });
});

test('Empty trash sends a long list in parts, adds up what failed, and stops at a part that fails', async () => {
  const { runEmpty } = emptying;
  const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, tab: 'chat' }));
  const t = (key) => key;
  const parts = [];
  let done = await runEmpty({ items, state: {}, tabIds: ['chat'], selectedId: 'chat', t, batch: 2, ask: () => true, send: async (ids) => { parts.push(ids); return { emptied: { failed: ids.includes('c') ? 1 : 0 } }; } });
  assert.deepEqual(parts, [['a', 'b'], ['c', 'd'], ['e']]);
  assert.equal(done.failed, 1, 'the server\'s own count');
  done = await runEmpty({ items, state: {}, tabIds: ['chat'], selectedId: 'chat', t, batch: 2, ask: () => true, send: async (ids) => { if (ids.includes('c')) throw new Error('refused'); return {}; } });
  assert.deepEqual(done.sent, ['a', 'b']);
  assert.equal(done.failed, 3, 'the failed part and the one never sent');
});

test('Empty trash texts: true in English and Chinese, and the sidebar wires them to this tab\'s list', () => {
  for (const key of ['trash.empty.confirm', 'trash.empty.confirm.one', 'trash.empty.untold', 'trash.empty.untold.one']) {
    const lines = source.split('\n').filter((text) => text.includes(`'${key}':`));
    assert.equal(lines.length, 2, `${key}: English and Chinese`);
  }
  for (const key of ['trash.empty.confirm', 'trash.empty.confirm.one']) {
    const en = source.split('\n').find((text) => text.includes(`'${key}':`) && /[a-z]{4}/.test(text.split(':').slice(1).join(':')));
    assert.match(en, /cannot be put back/);
    assert.match(en, /other tabs is not touched/);
    assert.match(en, /Time Machine/);
  }
  assert.match(source, /items: binHere, state, tabIds, selectedId: selected\.id, t,/);
  assert.match(source, /shown && emptyIds\(binHere, state, tabIds, selected\.id\)\.length > 0/);
  // While it runs: the Empty button and every row's Put back and Delete permanently wait.
  assert.equal((source.match(/className: 'cws-link', disabled: emptying(,| \|\| Boolean\(blocked\),| \|\| item\.newer === true,)/g) ?? []).length, 3);
});

test('every tab shows its full name when pointed at: to the right in the folded rail, above it in the wide sidebar', () => {
  const made = [];
  const h = (type, props, child) => { made.push({ type, props }); return child; };
  const UI = { Tooltip: 'AppTooltip' };
  const Tooltip = new Function('UI', 'h', `${functionText('Tooltip')}\nreturn Tooltip;`)(UI, h);
  Tooltip({ label: 'Research', show: true, children: 'tab' });
  assert.deepEqual(made.pop(), { type: 'AppTooltip', props: { label: 'Research', delayMs: 500, side: 'right' } }, 'the rail, as before');
  Tooltip({ label: 'Research', show: true, side: 'top', portal: true, children: 'tab' });
  assert.deepEqual(made.pop(), { type: 'AppTooltip', props: { label: 'Research', delayMs: 500, side: 'top', portal: true } });
  assert.equal(Tooltip({ label: 'x', show: false, children: 'tab' }), 'tab', 'not shown: the tab alone');
  const noKit = new Function('UI', 'h', `${functionText('Tooltip')}\nreturn Tooltip;`)({}, h);
  assert.equal(noKit({ label: 'x', show: true, children: 'tab' }), 'tab', 'an app without the tooltip: the tab alone');
  // The tab list: always shown; above the tab when wide, so it never covers the tabs below.
  assert.match(source, /shownTabs\.map\(\(m\) => h\(Tooltip, \{ key: m\.id, label: m\.label, show: true, disabled: arranging, side: wide \? 'top' : 'right', portal: wide \}/, 'shown except while arranging the tabs (kept around the tab, silent)');
  Tooltip({ label: 'Research', show: true, side: 'top', portal: true, disabled: true, children: 'tab' });
  assert.deepEqual(made.pop(), { type: 'AppTooltip', props: { label: 'Research', delayMs: 500, side: 'top', portal: true, disabled: true } }, 'silenced, not removed: the tab is not replaced and keeps focus');
});

const fitting = new Function(`${functionText('nameFits')}\n${functionText('glyphFor')}\n${functionText('iconOnlyIds')}\nreturn { nameFits, glyphFor, iconOnlyIds };`)();

test('a tab whose name does not fit shows its icon alone, measured as if selected; your own modes keep their name', () => {
  const { nameFits, glyphFor, iconOnlyIds } = fitting;
  // Measured in the lab: "Research" is 56.2 px wide, 57.5 px when selected; icon 15, gap 5, padding 4 + 4.
  // A tab is (sidebar - 28) / 3 wide with eight tabs.
  const research = (room, name = 57.5) => nameFits({ room, name, icon: 15, gap: 5, padding: 8 });
  assert.equal(research(78.67), false, '264 px: icon alone');
  assert.equal(research(84), false, '280 px: icon alone');
  assert.equal(research(84.67), false, '282 px: it would read "Researc…" once selected');
  assert.equal(research(85.67), false, '285 px: still a fraction too narrow');
  assert.equal(research(86), true, '286 px and up: icon and name');
  assert.equal(glyphFor('my-own-mode'), 'dot', 'own modes have no icon of their own');

  // The per-tab decision, with stand-in buttons and a stand-in canvas.
  const fonts = [];
  const widths = { Research: 56.2, Chat: 28, 'My long own mode name': 140 };
  const pen = {
    set font(value) { fonts.push(value); this.bold = / (5|6|7|8|9)00 /.test(` ${value} `); },
    measureText(text) { return { width: (widths[text] ?? 40) * (this.bold ? 57.5 / 56.2 : 1) }; },
  };
  const button = (width) => ({ getBoundingClientRect: () => ({ width }), firstElementChild: { getBoundingClientRect: () => ({ width: 15 }) } });
  const css = { fontStyle: 'normal', fontWeight: '400', fontSize: '13px', fontFamily: 'system-ui', columnGap: '5px', paddingLeft: '4px', paddingRight: '4px' };
  const tabs = [{ id: 'chat', label: 'Chat' }, { id: 'research', label: 'Research' }, { id: 'mine', label: 'My long own mode name' }, { id: 'code', label: 'Code' }];
  const at = (room) => iconOnlyIds(tabs, [button(room), button(room), button(room)], () => css, pen);
  assert.deepEqual(at(84.67), ['research'], 'only Research; an own mode never; a tab without a button is left alone');
  assert.deepEqual(at(85.67), ['research'], '285 px: the exact width counts, not a rounded one (86 would let it through)');
  assert.deepEqual(at(86), []);
  assert.ok(fonts.every((font) => / 500 /.test(font)), 'measured at the selected weight');
  assert.deepEqual(iconOnlyIds(tabs, [button(10), button(10)], () => css, null), [], 'no canvas: nothing changes');

  // Wiring in the sidebar.
  assert.match(source, /keep\(iconOnlyIds\(shownTabs, list\.querySelectorAll\('\[role=tab\]'\), \(el\) => getComputedStyle\(el\), pen\)\)/);
  assert.match(source, /watch\.observe\(list\);/);
  assert.match(source, /\}, \[wide, tabsKey, state\.iconOnlyTabs\]\);/);
  assert.match(source, /'aria-label': arranging \? t\('tabs\.arrange\.move', \{ tab: m\.label \}\) : \(wide && !iconOnly\.ids\.has\(m\.id\) \? undefined : m\.label\)/);
  assert.match(source, /wide && !iconOnly\.ids\.has\(m\.id\) \? h\('span', null, m\.label\) : null/);
});

test('tab names: every tab keeps its name by default (tabs wrap); the icon-alone mode is a switch that is off', () => {
  // Default: no tab is measured, so none can lose its name.
  assert.match(source, /if \(!wide \|\| !state\.iconOnlyTabs \|\| !list \|\| typeof ResizeObserver !== 'function'\) \{ keep\(\[\]\); return undefined; \}/);
  assert.match(source, /'data-many': wide && tabs\.length > 3 && state\.iconOnlyTabs \? 'true' : undefined, 'data-wrap': wide && tabs\.length > 3 && !state\.iconOnlyTabs \? 'true' : undefined/);
  assert.match(source, /iconOnlyTabs: false, tabOrder/, 'off in the starting state');
  assert.match(source, /patch\.iconOnlyTabs = mine\.value\?\.iconOnlyTabs === true;/, 'read from the settings, off when missing');
  assert.match(source, /model\.setOption\('iconOnlyTabs', !state\.iconOnlyTabs\)/, 'a switch in the More menu');
  // Wrapping tabs are as wide as their name, never narrower, and never wider than the row.
  assert.match(source, /\.cws-tabs\[data-wrap='true'\]\{flex-wrap:wrap\}/);
  assert.match(source, /\.cws-tabs\[data-wrap='true'\] \.cws-tab\{flex:1 1 auto;min-width:max-content;max-width:100%/);
  const server = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(server, /iconOnlyTabs: z\.boolean\(\)\.default\(false\)\.volatile\(\)/, 'the setting exists and defaults to off');
});

const ordering = new Function(`${functionText('readOrder')}\n${functionText('orderTabs')}\n${functionText('mergeOrder')}\n${functionText('moveId')}\nreturn { readOrder, orderTabs, mergeOrder, moveId };`)();

test('your own tab order: named tabs first, new ones after, missing ones skipped; which tabs show never changes', () => {
  const { orderTabs, readOrder } = ordering;
  const tabs = ['chat', 'cowork', 'code', 'finance', 'research'].map((id) => ({ id }));
  const ids = (order) => orderTabs(tabs, order).map((tab) => tab.id);
  assert.deepEqual(ids(undefined), ['chat', 'cowork', 'code', 'finance', 'research'], 'no order: as today');
  assert.deepEqual(ids(['research', 'code']), ['research', 'code', 'chat', 'cowork', 'finance'], 'the rest follow in the usual order');
  assert.deepEqual(ids(['recon', 'research', 'automations', 'chat']), ['research', 'chat', 'cowork', 'code', 'finance'], 'tabs not here (switched off, another Mac) are skipped');
  assert.equal(orderTabs(tabs, ['finance']).length, tabs.length, 'never adds or drops a tab');
  assert.deepEqual(readOrder(['a', 'a', '../x', '', 7, 'b c', 'ok-1']), ['a', 'ok-1'], 'checked: ids only, each once');
  assert.equal(readOrder(Array.from({ length: 80 }, (_, i) => `t${i}`)).length, 50);
});

test('rearranging keeps the place of a tab not shown now, so it comes back where it was', () => {
  const { orderTabs, mergeOrder, moveId } = ordering;
  // Saved: Research, Chat, Finance, Code. Finance is switched off; you move Code before Chat.
  const saved = ['research', 'chat', 'finance', 'code'];
  const visible = moveId(['research', 'chat', 'code'], 'code', 1);
  assert.deepEqual(visible, ['research', 'code', 'chat']);
  const next = mergeOrder(visible, saved);
  assert.deepEqual(next, ['research', 'code', 'chat', 'finance'], 'Finance stays right after Chat');
  // Finance is switched on again: it shows in its place.
  const back = orderTabs(['chat', 'code', 'finance', 'research'].map((id) => ({ id })), next).map((tab) => tab.id);
  assert.deepEqual(back, ['research', 'code', 'chat', 'finance']);
  assert.deepEqual(mergeOrder(['b', 'c'], ['x', 'b', 'c']), ['x', 'b', 'c'], 'one that was first stays first');
  assert.deepEqual(mergeOrder(['a', 'b'], []), ['a', 'b']);
  assert.deepEqual(moveId(['a', 'b', 'c'], 'a', 9), ['b', 'c', 'a'], 'clamped');
  assert.deepEqual(moveId(['a', 'b'], 'z', 0), ['a', 'b'], 'unknown id: unchanged');
});

test('the Cowork sidebar, /mode and Global Search order tabs the same way', async () => {
  const { orderTabs } = ordering;
  const modes = await import('../../dsh-modes/lib/tabs.js');
  const searchSource = readFileSync(new URL('../../dsh-search/client.js', import.meta.url), 'utf8');
  const start = searchSource.indexOf('function orderTabs(');
  let depth = 0;
  let end = -1;
  for (let i = searchSource.indexOf('{', searchSource.indexOf(')', start)); i < searchSource.length; i += 1) {
    if (searchSource[i] === '{') depth += 1;
    else if (searchSource[i] === '}' && (depth -= 1) === 0) { end = i + 1; break; }
  }
  const searchOrder = new Function(`${searchSource.slice(start, end)}\nreturn orderTabs;`)();
  const tabs = ['chat', 'cowork', 'code', 'finance', 'recon', 'research'].map((id) => ({ id }));
  const long = 'quarterly-board-reporting-and-forecasting-for-the-whole-group';
  tabs.push({ id: long });
  const cases = [undefined, [], ['research'], ['recon', 'chat', 'gone'], ['x', '../y', 'code', 'code', 'finance'], 'not a list', [long, 'chat']];
  assert.deepEqual(orderTabs(tabs, [long, 'chat']).map((tab) => tab.id).slice(0, 2), [long, 'chat'], 'a long mode id can be arranged too');
  for (const order of cases) {
    const want = orderTabs(tabs, order).map((tab) => tab.id);
    assert.deepEqual(modes.orderTabs(tabs, order).map((tab) => tab.id), want, `/mode: ${JSON.stringify(order)}`);
    assert.deepEqual(searchOrder(tabs, order).map((tab) => tab.id), want, `Global Search: ${JSON.stringify(order)}`);
  }
});

test('arranging: an edit button in the wide sidebar, pointer dragging (not the page\'s drag and drop), arrow keys, Reset order', () => {
  assert.match(source, /const tabsOf = \(state\) => orderTabs\(usualTabsOf\(state\), state\.tabOrder\);/);
  assert.match(source, /const usualTabsOf = \(state\) => \[\.\.\.state\.modes\.slice\(0, state\.maxTabs\), \.\.\.\(state\.extra \?\? \[\]\)\];/);
  assert.match(source, /const arrange = wide && tabs\.length > 1 \?/);
  assert.match(source, /onClick: \(\) => \{ if \(!arranging && m\.id !== selected\.id\) switchTab\(m\); \}/, 'no tab switch while arranging');
  assert.match(source, /if \(arranging\) \{ onArrangeKey\(event\); return; \}/);
  assert.match(source, /void model\.setOption\('tabOrder', mergeOrder\(ids, state\.tabOrder\)\)/);
  assert.match(source, /void model\.setOption\('tabOrder', \[\]\)/, 'Reset order');
  assert.doesNotMatch(source, /draggable: true|onDragStart/, 'no HTML drag and drop: it would bring up the app\'s file-drop cover');
  for (const key of ['tabs.arrange', 'tabs.arrange.hint', 'tabs.arrange.move', 'tabs.arrange.reset', 'tabs.arrange.done']) {
    assert.equal(source.split('\n').filter((text) => text.includes(`'${key}':`)).length, 2, `${key}: English and Chinese`);
  }
  const server = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(server, /tabOrder: z\.array\(z\.string\(\)\)\.default\(\[\]\)\.volatile\(\),/);
});

test('arranging changes only the order: which tab a conversation or Trash row belongs to stays on the usual order', () => {
  const pick = new Function(`${functionText('readOrder')}\n${functionText('orderTabs')}\n${constLine('usualTabsOf')}\n${constLine('tabsOf')}\n${functionText('tabOfSession')}\n${functionText('guessTab')}\n${functionText('trashTab')}\nreturn { usualTabsOf, tabsOf, tabOfSession, trashTab };`)();
  const state = { modes: [{ id: 'write' }, { id: 'build' }, { id: 'ask' }], maxTabs: 3, extra: [], tabOrder: ['build', 'write', 'ask'], sessionModes: {} };
  assert.deepEqual(pick.tabsOf(state).map((m) => m.id), ['build', 'write', 'ask'], 'shown in your order');
  const usual = pick.usualTabsOf(state).map((m) => m.id);
  assert.deepEqual(usual, ['write', 'build', 'ask']);
  // A conversation whose own tab and folder tab are not shown falls to the first tab of the usual order.
  assert.equal(pick.tabOfSession('s', {}, { path: '/projects/x' }, state, usual), 'write');
  assert.equal(pick.trashTab({ id: 's', tab: 'finance' }, state, usual), 'write');
  // The sidebar passes the usual order wherever it decides membership.
  assert.match(source, /const tabIds = usualTabsOf\(state\)\.map\(\(m\) => m\.id\);/);
  assert.match(source, /tabOfSession\(id, sess, ws, now, usualTabsOf\(now\)\.map\(\(m\) => m\.id\)\)/);
});

test('a drag lives only while arranging, follows the pointer on the window, and saves only a changed order', () => {
  assert.doesNotMatch(source, /setPointerCapture/, 'no pointer capture: it is lost when the moving tab is put elsewhere in the list');
  assert.match(source, /window\.addEventListener\('pointermove', move, true\);/);
  assert.match(source, /window\.addEventListener\('pointerup', up, true\);/);
  assert.match(source, /if \(e\.buttons === 0\) \{ cancel\(\); return; \}/, 'a release the page never saw ends it unsaved');
  assert.match(source, /if \(drag\.moved && drag\.order\.join\('\\u0000'\) !== drag\.start\.join\('\\u0000'\)\) saveOrder\(drag\.order\);/, 'a wobble saves nothing');
  assert.match(source, /if \(arranging\) return undefined;\s*stopDrag\(\);\s*setPreview\(null\);/, 'arranging ends: the drag ends');
  assert.match(source, /setTimeout\(\(\) => document\.querySelector\('\[data-cws-arrange\]'\)\?\.focus\(\), 0\)/, 'Done hands focus to the Arrange button');
});

/** The sidebar's settings model, run against a stand-in settings service that refuses stale writes. */
function modelWith({ readDelay = 5, writeDelay = 20 } = {}) {
  const make = new Function('window', 'dshPoll', `const NS = 'coworkShell'; const SETTINGS_NS = 'cowork-shell'; const MODES_NS = 'modes'; const LOCAL_KEY = 'k';
    const FALLBACK_MODES = [{ id: 'chat', label: 'Chat' }]; const DEFAULT_TABS = {};
    ${functionText('readObject')}\n${functionText('readOrder')}\n${constLine('DEFAULT_START_PLACES')}\n${functionText('startPlacesOf')}\n${constLine('startPlaceTable')}\n${functionText('createModel')}\nreturn createModel;`)({ localStorage: { getItem: () => null, setItem() {} } }, { settings: (ctx, options) => ctx.remote.settings.describe(options?.fresh === true ? undefined : undefined) });
  const store = { revision: 1, value: { tabOrder: [] } };
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  let writing = Promise.resolve();
  const ctx = {
    locale: { bind: () => (key) => key },
    remote: {
      settings: {
        describe: async () => {
          const snap = { ok: true, value: { namespaces: [{ ns: 'cowork-shell', revision: store.revision, value: structuredClone(store.value) }] } };
          await wait(readDelay);
          return snap;
        },
        // One write at a time, refused when the revision is stale (as the app's settings do).
        mutate: (ns, ops, revision) => (writing = writing.then(async () => {
          await wait(writeDelay);
          if (revision !== store.revision) return { ok: false, error: { code: 'settings/conflict' } };
          for (const op of ops) store.value[op.path[0]] = op.value;
          store.revision += 1;
          return { ok: true };
        })),
      },
    },
  };
  return { model: make(ctx), store };
}

test('fast arrow presses while arranging: every move is saved, in order, with no error', async () => {
  const { model, store } = modelWith();
  const orders = [['b', 'a', 'c'], ['b', 'c', 'a'], ['c', 'b', 'a']];
  const saves = [];
  for (const order of orders) {
    saves.push(model.setOption('tabOrder', order));
    await new Promise((done) => setTimeout(done, 5));
  }
  await Promise.all(saves);
  assert.deepEqual(store.value.tabOrder, ['c', 'b', 'a'], 'the last move is stored');
  assert.deepEqual(model.get().tabOrder, ['c', 'b', 'a'], 'and shown');
  assert.equal(model.get().error, '');
});

test('a refresh that began before a save does not put the old order back', async () => {
  const { model, store } = modelWith({ readDelay: 60 });
  const refresh = model.refresh();
  await new Promise((done) => setTimeout(done, 5));
  const save = model.setOption('tabOrder', ['b', 'a']);
  await Promise.all([refresh, save]);
  assert.deepEqual(model.get().tabOrder, ['b', 'a']);
  assert.deepEqual(store.value.tabOrder, ['b', 'a']);
  // A refresh after the save reads the stored order as usual.
  store.value.tabOrder = ['a', 'b'];
  await model.refresh();
  assert.deepEqual(model.get().tabOrder, ['a', 'b']);
});

test('a group row (old runs of an automation): its second line, its tab, and Empty trash counting rows', async () => {
  const { runEmpty } = emptying;
  const groupSummary = new Function(`${functionText('groupSummary')}\nreturn groupSummary;`)();
  const t = (key, vars) => `${key}|${vars?.n ?? ''}|${vars?.what ?? ''}`;
  const day = Date.UTC(2026, 10, 3, 12);
  const line = groupSummary({ kind: 'group', count: 12, firstAt: day, deletedAt: day + 4 * 86400000, data: 1 }, t);
  assert.match(line, /^trash\.count\|12\|/);
  assert.match(line, / – /, 'the dates it spans');
  assert.match(line, /trash\.data/, 'and saved settings');
  assert.equal(groupSummary({ count: 1, firstAt: day, deletedAt: day }, t).split(' · ').length, 2, 'one day: no range');
  const items = [
    { id: 'group.automations.task-1', kind: 'group', tab: 'automations', count: 12 },
    { id: 'session-x', tab: 'automations' },
    { id: 'group.automations.task-2', kind: 'group', tab: 'cowork', count: 3 },
  ];
  const asked = [];
  const sent = [];
  await runEmpty({ items, state: {}, tabIds: ['automations', 'cowork'], selectedId: 'automations', t, ask: (q) => { asked.push(q); return true; }, send: async (ids) => { sent.push(ids); return {}; } });
  assert.deepEqual(sent, [['group.automations.task-1', 'session-x']], 'only this tab\'s rows');
  assert.equal(asked[0], 'trash.empty.confirm.rows|2|trash.count|13|', 'two rows, thirteen conversations');
  // What a row holds, in words (found in the lab: "with its 0 conversations", "the 1 conversations").
  const { rowContents } = emptying;
  const words = (key, vars) => ({ 'trash.count': `${vars?.n} conversations`, 'trash.count.one': '1 conversation', 'trash.data.its': 'its saved settings', 'trash.and': ' and ' })[key];
  assert.equal(rowContents({ kind: 'group', count: 0, data: 1 }, words), 'its saved settings');
  assert.equal(rowContents({ kind: 'group', count: 1 }, words), '1 conversation');
  assert.equal(rowContents([{ kind: 'group', count: 2, data: 1 }, { id: 'x' }], words), '3 conversations and its saved settings');
  // The list hides every run inside a row, and the buttons act on the whole row.
  assert.match(source, /restore: \(row\) => \(row\?\.kind === 'group' \? call\(\{ method: 'POST', body: JSON\.stringify\(\{ action: 'restore', itemId: row\.id \}\) \}\)/);
  assert.match(source, /onClick: \(\) => void putBack\(item\) \}/);
  for (const key of ['trash.empty.confirm.rows', 'trash.empty.confirm.rows.one', 'trash.erase.confirm.group', 'trash.count', 'trash.left.oldest', 'trash.back.needs', 'trash.back.newer', 'trash.back.partly']) {
    assert.equal(source.split('\n').filter((text) => text.includes(`'${key}':`)).length, 2, `${key}: English and Chinese`);
  }
  const en = source.split('\n').find((text) => text.includes("'trash.erase.confirm.group':") && /[a-z]{4}/.test(text.split(':').slice(1).join(':')));
  assert.match(en, /cannot be put back/);
  assert.match(en, /Time Machine/);
});

test('row actions: a Delete names what the list showed; partial results and the owner\'s notes are shown; rows from a newer version are left out of Empty trash', () => {
  const { emptyIds } = emptying;
  assert.deepEqual(emptyIds([{ id: 'group.a.b', kind: 'group', tab: 'cowork', newer: true }, { id: 'x', tab: 'cowork' }], {}, ['cowork'], 'cowork'), ['x']);
  assert.match(source, /action: 'erase', itemId: row\.id, ids: row\.ids \?\? \[\], pieces: row\.pieces \?\? \[\]/);
  assert.match(source, /itemIds, shown \}/);
  assert.match(source, /for \(const note of Array\.isArray\(done\?\.notes\) \? done\.notes : \[\]\)/);
  assert.match(source, /model\.fail\(t\('trash\.erase\.partly'/);
  for (const key of ['trash.erase.partly', 'trash.folder', 'trash.folder.its']) assert.equal(source.split('\n').filter((text) => text.includes(`'${key}':`)).length, 2, key);
});

// ---- Scratch (step 32) ------------------------------------------------------------------------

/** homeFor, learnScratch and startInScratch together, with a stand-in for the page's fetch. */
function scratchPage(answer) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push([String(url), init.method ?? 'GET']);
    return { ok: Boolean(answer), json: async () => answer };
  };
  const document = { baseURI: 'http://lab.test/' };
  const make = new Function('fetch', 'document', `${constLine('roomKey')}\n${constLine('rooms')}\n${constLine('hidden')}\n${constLine('scratchPlace')}\n${functionText('defaultWorkspace')}\n${functionText('homeFor')}\nasync ${functionText('learnScratch')}\nasync ${functionText('startInScratch')}\nreturn { homeFor, learnScratch, startInScratch, hidden, roomKey };`);
  return { ...make(fetch, document), calls };
}

const scratchWs = { workspaceId: 'w-scratch', path: '/Users/someone/.dsh/scratch', sessionIds: ['s4'], createdAt: '2026-01-04T00:00:00Z' };

test('a new conversation of an ordinary tab never starts in Scratch by \'last used\'', async () => {
  const page = scratchPage({ place: '/Users/someone/.dsh/scratch', title: 'Scratch' });
  const lib = { ok: true, workspaces: [home, books, scratchWs], byId: { ...byId, s4: { updatedAt: 5000 } }, currentId: null };
  assert.equal(await page.learnScratch(), '/Users/someone/.dsh/scratch');
  assert.deepEqual(page.calls, [['http://lab.test/dsh-cowork-shell/scratch', 'GET']], 'asking is a GET, which makes no folder');
  assert.equal(page.homeFor(lib, 'cowork')?.workspaceId, 'w-books');
  assert.equal(page.homeFor({ ...lib, currentId: 's4' }, 'code')?.workspaceId, 'w-books', 'not even from a Scratch thread');
  assert.equal(page.hidden.has(page.roomKey(scratchWs.path)), true, 'kept out of the project lists');
  // No answer: nothing changes.
  const quiet = scratchPage(null);
  assert.equal(await quiet.learnScratch(), '');
  assert.equal(quiet.hidden.size, 0);
});

test('starting a Scratch thread makes the project once and then lets the app reuse an unsent thread', async () => {
  const page = scratchPage({ place: '/Users/someone/.dsh/scratch', title: 'Scratch' });
  const made = [];
  const renamed = [];
  const started = [];
  const library = { workspaces: [home, books] };
  const appCtx = {
    get: () => ({
      create: async ({ path }) => { made.push(path); const ws = { workspaceId: 'w-new', path, sessionIds: [] }; library.workspaces.push(ws); return ws; },
      rename: async (id, title) => { renamed.push([id, title]); },
    }),
    uiWorkspace: { startSession: (id, options) => started.push([id, options]) },
  };
  const lib = { get: () => library };
  assert.equal(await page.startInScratch(appCtx, lib, { prompt: 'hi' }), true);
  assert.equal(await page.startInScratch(appCtx, lib), true);
  assert.deepEqual(made, ['/Users/someone/.dsh/scratch'], 'the project is made once');
  assert.deepEqual(renamed, [['w-new', 'Scratch']]);
  assert.deepEqual(started, [['w-new', { prompt: 'hi' }], ['w-new', undefined]], 'the app\'s own start, which reuses an unsent conversation');
  assert.ok(page.calls.every(([, method]) => method === 'POST'), 'the folder is made first');
  // The place cannot be made: the caller starts as usual.
  const refused = scratchPage({ place: '', error: 'The Scratch folder is a link or not a folder.' });
  assert.equal(await refused.startInScratch(appCtx, lib), false);
});

test('the Scratch project is left out of the project list and of Continue in a project', () => {
  assert.match(source, /if \(hidden\.has\(roomKey\(ws\.path\)\)\) continue;/);
  assert.match(source, /projects: flat \|\| isScratchRow\(id\) \? lib\.workspaces\.filter\(\(ws\) => !rooms\.has\(roomKey\(ws\.path\)\) && !hidden\.has\(roomKey\(ws\.path\)\)\) : undefined/);
  assert.match(source, /void learnScratch\(\);/);
});

// ---- Scratch steps 36 and 37 -------------------------------------------------------------------

const scratchHelpers = new Function(`${constLine('roomKey')}\n${constLine('hidden')}\n${constLine('scratchPlace')}\n${functionText('inScratch')}\n${functionText('scratchFolderOfRow')}\n${functionText('inScratchNow')}\nreturn { inScratch, scratchFolderOfRow, inScratchNow, hidden, scratchPlace, roomKey };`)();

test('which conversations are Scratch, and where Show in Finder goes for them', () => {
  const { inScratch, scratchFolderOfRow, inScratchNow, hidden, scratchPlace, roomKey } = scratchHelpers;
  assert.equal(inScratch('/h/.dsh/scratch'), false, 'nothing is Scratch before the page knows the place');
  scratchPlace.path = '/h/.dsh/scratch';
  hidden.add(roomKey(scratchPlace.path));
  assert.equal(inScratch('/h/.dsh/scratch'), true);
  assert.equal(inScratch('/h/.dsh/scratch/session-abc123'), true, 'a copy working in a thread folder');
  assert.equal(inScratch('/h/.dsh/scratch-x'), false);
  assert.equal(inScratch('/Users/me/Books'), false, 'a Rerun copy of a project conversation is not Scratch');
  assert.equal(scratchFolderOfRow('session-abc123', '/h/.dsh/scratch'), '/h/.dsh/scratch/session-abc123');
  assert.equal(scratchFolderOfRow('session-copy99', '/h/.dsh/scratch/session-abc123/sub'), '/h/.dsh/scratch/session-abc123', 'a copy: the thread folder it works in');
  assert.equal(scratchFolderOfRow('session-abc123', undefined, '/h/.dsh/scratch'), '/h/.dsh/scratch/session-abc123', 'by its project when the row has no folder');
  assert.equal(scratchFolderOfRow('../x', '/h/.dsh/scratch'), '');
  assert.equal(scratchFolderOfRow('session-abc123', '/Users/me/Books'), '');
  const lib = { ok: true, currentId: 's1', workspaces: [{ workspaceId: 'w', path: '/h/.dsh/scratch', sessionIds: ['s1'] }, { workspaceId: 'b', path: '/Users/me/Books', sessionIds: ['s2'] }] };
  assert.equal(inScratchNow(lib), true);
  assert.equal(inScratchNow({ ...lib, currentId: 's2' }), false);
  assert.equal(inScratchNow({ ...lib, currentId: null }), false);
});

test('Scratch has its own group in each tab, the switch sits beside the picker (not in Recon), chips stay in Scratch', () => {
  assert.match(source, /const scratchRows = unplaced\.filter\(isScratchRow\);/);
  assert.match(source, /list\(scratchRows, '__scratch', null\)/);
  assert.match(source, /if \(!scratchPlace\.path \|\| !selected \|\| selected\.id === 'recon'\) return null;/);
  assert.match(source, /id: 'cowork-place', order: 5/);
  assert.match(source, /if \(selected\.id !== 'recon' && inScratchNow\(library\.get\(\)\)\) \{\s*startInScratch\(appCtx, library, options\)/);
  assert.match(source, /\(!!currentWs && hidden\.has\(roomKey\(currentWs\.path\)\)\)/, 'Chat hides the picker in Scratch too');
  assert.match(source, /id: 'cowork-scratch-mark'/);
});

const cleanupPlan = new Function(`${functionText('cleanupPlan')}\nreturn cleanupPlan;`)();

test('Scratch clean-up: only old ones go; working, open and pinned ones are named and left alone', () => {
  const now = Date.parse('2026-11-16T00:00:00Z');
  const day = 86400000;
  const lib = {
    currentId: 'open-old',
    byId: {
      'old': { updatedAt: now - 40 * day },
      'young': { updatedAt: now - 3 * day },
      'busy-old': { updatedAt: now - 40 * day, running: true },
      'open-old': { updatedAt: now - 40 * day },
      'pin-old': { updatedAt: now - 40 * day },
      'helper': { updatedAt: now - 40 * day, origin: 'subagent' },
      'blank': { updatedAt: now - 40 * day, blank: true },
      'no-time': {},
    },
  };
  const plan = cleanupPlan(Object.keys(lib.byId), lib, { days: 30, now, pinned: new Set(['pin-old']) });
  assert.deepEqual(plan.take, ['old']);
  assert.deepEqual(plan.skipped, [{ id: 'busy-old', why: 'running' }, { id: 'open-old', why: 'open' }, { id: 'pin-old', why: 'pinned' }]);
  assert.deepEqual(cleanupPlan(['young'], lib, { days: 2, now, pinned: new Set() }).take, ['young']);
  for (const key of ['cleanup.why.running', 'cleanup.why.open', 'cleanup.why.pinned']) assert.equal((source.match(new RegExp(`'${key.replace(/\./g, '\\.')}':`, 'g')) ?? []).length, 2, `${key} in English and Chinese`);
});

// ---- Scratch step 44: start places ------------------------------------------------------------

const startPlaces = new Function(`${constLine('DEFAULT_START_PLACES')}\n${functionText('startPlacesOf')}\n${constLine('startPlaceTable')}\n${functionText('startPlaceOf')}\nreturn { startPlacesOf, startPlaceOf, startPlaceTable };`)();

test('start places: every tab but Code starts in Scratch, Recon in its room; a saved choice wins; odd values are ignored', () => {
  const { startPlacesOf, startPlaceOf } = startPlaces;
  const defaults = startPlacesOf('');
  for (const tab of ['chat', 'cowork', 'finance', 'data', 'research', 'scout']) assert.equal(startPlaceOf(tab, defaults), 'scratch', tab);
  assert.equal(startPlaceOf('code', defaults), 'folder');
  assert.equal(startPlaceOf('recon', defaults), 'room');
  assert.equal(startPlaceOf('my-own-mode', defaults), 'folder', 'a tab another add-on brings: a folder unless set');
  const saved = startPlacesOf(JSON.stringify({ data: 'folder', code: 'scratch', recon: 'scratch', chat: 'elsewhere' }));
  assert.equal(startPlaceOf('data', saved), 'folder');
  assert.equal(startPlaceOf('code', saved), 'scratch');
  assert.equal(startPlaceOf('recon', saved), 'room', 'Recon always keeps its room');
  assert.equal(startPlaceOf('chat', saved), 'scratch', 'an odd value is ignored');
  assert.deepEqual(startPlacesOf('not json'), defaults);
  assert.deepEqual(startPlacesOf('[1]'), defaults);
});

test('New, a tab switch and Cmd-N start in the tab\'s start place; Scratch falls back to a folder when it cannot start', () => {
  assert.match(source, /const place = startPlaceOf\(tabId\);/);
  assert.match(source, /startInScratch\(appCtx, library\)\.then\(\(done\) => \{ if \(!done\) inFolder\(\); \}, inFolder\);/);
  assert.match(source, /command\.resolve = \(context\) => \(startPlaceTable\.newKey === false \? original\(context\) : \{ status: 'handled', run: \(\) => startNew\(ctx, library, model\.get\(\)\.selected\) \}\);/);
  assert.match(source, /if \(gone\) startNew\(appCtx, library, m\.id\);/, 'a tab switch with nothing to reopen starts in the start place');
  for (const key of ['start.title', 'start.hint', 'start.newkey', 'start.recon.room']) assert.equal((source.match(new RegExp(`'${key.replace(/\./g, '\\.')}':`, 'g')) ?? []).length, 2, `${key} in English and Chinese`);
});
