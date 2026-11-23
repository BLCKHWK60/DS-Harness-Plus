// Item 4A, stage 3b (22 November 2026): the rows of each space and the Chat space's list. Fixed rows in every space
// (Projects, Artifacts, Automations, Plugins), rows per space (Model Arena in Chat and Workshop; Connectors and Skills in
// Chat and Code; Bench Lab, Tuner Plus and Benchmark in Workshop), Split and Compare everywhere; Chat lists Chats, then
// Projects as folders; the Automations page opens a thread in Chat, Automations mode, through the sidebar.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DEFAULT_SPACES } from '../index.js';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

function functionText(name) {
  const plainStart = source.indexOf(`function ${name}(`);
  assert.ok(plainStart >= 0, `client.js has no function ${name}`);
  const isAsync = source.slice(plainStart - 6, plainStart) === 'async ';
  const start = isAsync ? plainStart - 6 : plainStart;
  let depth = 0;
  // The body opens at the first '{' after the parameter list (a parameter may hold braces of its own).
  for (let i = source.indexOf(') {', plainStart) + 2; i < source.length; i += 1) {
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
/** The client's DEFAULT_SPACES (plain JSON between its braces). */
function clientSpaces() {
  const start = source.indexOf('const DEFAULT_SPACES = {');
  assert.ok(start > 0, 'client.js has DEFAULT_SPACES');
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && (depth -= 1) === 0) return JSON.parse(source.slice(open, i + 1));
  }
  throw new Error('unbalanced DEFAULT_SPACES');
}

const parts = new Function(`
  ${['SPACE_IDS', 'SPACE_TAB', 'ADDED_MODES', 'QUIET_TAGS'].map(constLine).join('\n')}
  const DEFAULT_SPACES = ${JSON.stringify(clientSpaces())};
  ${['readObject', 'spaceLayoutOf', 'spaceRows', 'chatGroups', 'modeNameIn', 'modeTagOf', 'waitForBlank'].map(functionText).join('\n')}
  return { spaceLayoutOf, spaceRows, chatGroups, modeTagOf, waitForBlank };
`)();

const PAGES = ['model-arena', 'automations', 'artifacts', 'split', 'compare', 'plugins', 'connectors', 'skills', 'benchlab', 'schedules', 'my-plugin']
  .map((id) => ({ id, label: id }));
const SECTIONS = [{ id: 'tuning', label: 'Tuner Plus' }, { id: 'benchmark', label: 'Benchmark' }, { id: 'creator-plus', label: 'Creator Plus' }];
const ids = (rows) => rows.map((row) => row.id);
const layout = parts.spaceLayoutOf('');

test('the client\'s copy of the space layout is the host\'s (index.js DEFAULT_SPACES)', () => {
  assert.deepEqual(clientSpaces(), DEFAULT_SPACES);
});

test('every space shows the fixed rows first: Projects, Artifacts, Automations, Plugins', () => {
  for (const space of ['chat', 'code', 'devices', 'recon', 'workshop']) {
    assert.deepEqual(ids(parts.spaceRows(space, PAGES, layout, SECTIONS).fixed), ['projects', 'artifacts', 'automations', 'plugins'], space);
  }
  // A fixed row whose add-on is off is left out; Projects is always there (the sidebar draws it).
  assert.deepEqual(ids(parts.spaceRows('chat', PAGES.filter((p) => p.id !== 'artifacts'), layout, SECTIONS).fixed), ['projects', 'automations', 'plugins']);
});

test('rows per space: Model Arena in Chat and Workshop, Connectors and Skills in Chat and Code, Bench Lab in Workshop only', () => {
  const own = (space) => ids(parts.spaceRows(space, PAGES, layout, SECTIONS).own);
  assert.deepEqual(own('chat'), ['model-arena', 'connectors', 'skills']);
  assert.deepEqual(own('code'), ['connectors', 'skills']);
  assert.deepEqual(own('devices'), []);
  assert.deepEqual(own('recon'), []);
  assert.deepEqual(own('workshop'), ['model-arena', 'benchlab']);
  for (const space of ['chat', 'code', 'devices', 'recon']) {
    const all = parts.spaceRows(space, PAGES, layout, SECTIONS);
    assert.ok(![...all.fixed, ...all.own, ...all.shared].some((row) => row.id === 'benchlab'), `no Bench Lab in ${space}`);
  }
});

test('Workshop has Tuner Plus and Benchmark rows that open their Settings pages, only while those pages exist', () => {
  assert.deepEqual(parts.spaceRows('workshop', PAGES, layout, SECTIONS).settings, [
    { id: 'tuning', label: 'Tuner Plus', settings: true },
    { id: 'benchmark', label: 'Benchmark', settings: true },
  ]);
  assert.deepEqual(parts.spaceRows('workshop', PAGES, layout, [{ id: 'benchmark', label: 'Benchmark' }]).settings.map((row) => row.id), ['benchmark']);
  assert.deepEqual(parts.spaceRows('chat', PAGES, layout, SECTIONS).settings, [], 'no Settings rows outside Workshop');
  // Owner's answer (22 Nov): the Tuner Plus row only while Tuner Plus is switched on (Modes lists it in `addonsOff`).
  assert.deepEqual(parts.spaceRows('workshop', PAGES, layout, SECTIONS, ['tuning']).settings.map((row) => row.id), ['benchmark']);
  assert.match(source, /spaceRows\(selected\.id, allPages, spaceLayoutOf\(state\.spaceLayout\), allSections, \(state\.spaceRows \?\? \[\]\)\.find\(\(row\) => row\?\.id === selected\.id\)\?\.addonsOff \?\? \[\]\)/);
  assert.match(source, /window\.addEventListener\('dsh-tuning:switched', onTuner\);/);
});

test('pages no space lists show in every space (Split, Compare, a plugin\'s own row); never the app\'s task editor', () => {
  for (const space of ['chat', 'code', 'devices', 'recon', 'workshop']) {
    assert.deepEqual(ids(parts.spaceRows(space, PAGES, layout, SECTIONS).shared), ['split', 'compare', 'my-plugin'], space);
  }
});

test('a saved layout changes only what it names; a bad one keeps the built-in layout', () => {
  const mine = parts.spaceLayoutOf(JSON.stringify({ code: { pages: ['connectors'] }, recon: 'bad' }));
  assert.deepEqual(mine.code, { pages: ['connectors'], settings: [] });
  assert.deepEqual(mine.chat, DEFAULT_SPACES.chat);
  assert.deepEqual(mine.recon, DEFAULT_SPACES.recon);
  assert.deepEqual(mine.fixed, DEFAULT_SPACES.fixed);
  assert.deepEqual(parts.spaceLayoutOf('{not json').workshop, DEFAULT_SPACES.workshop);
});

test('the Chat space lists Chats (Scratch and loose, sorted together) first, then Projects with the default workspace', () => {
  const byId = { s1: { updatedAt: 50 }, s2: { updatedAt: 10 }, l1: { updatedAt: 30 }, pin: { updatedAt: 1 } };
  const pinned = new Set(['pin']);
  const sortRows = (list) => list.filter((id) => byId[id]).sort((a, b) => (pinned.has(b) - pinned.has(a)) || (byId[b].updatedAt - byId[a].updatedAt));
  const home = { workspaceId: 'home', path: '/x/default-workspace', updatedAt: '2026-01-01T00:00:00Z' };
  const site = { ws: { workspaceId: 'site' }, ids: ['p1'], latest: Date.parse('2026-06-01T00:00:00Z') };
  const groups = parts.chatGroups(sortRows, [site], ['s1', 's2'], ['l1', 'pin'], home);
  assert.deepEqual(groups.chats, ['pin', 's1', 'l1', 's2']);
  assert.deepEqual(groups.projects.map((p) => p.ws.workspaceId), ['site', 'home'], 'the default workspace is a project, even with no thread yet');
  // Already listed (it has Chat threads): not twice.
  const withHome = parts.chatGroups(sortRows, [{ ws: home, ids: ['h1'], latest: Date.parse('2026-07-01T00:00:00Z') }, site], [], [], home);
  assert.deepEqual(withHome.projects.map((p) => p.ws.workspaceId), ['home', 'site']);
  // No default workspace: only the projects with Chat threads.
  assert.deepEqual(parts.chatGroups(sortRows, [], [], [], null).projects, []);
});

test('a thread\'s row names its mode in a grey tag only when it is not the space\'s usual mode', () => {
  const state = {
    sessionModes: { a: 'chat', b: 'research', c: 'code', d: 'gone' },
    spaceRows: [{ id: 'chat', startMode: 'chat' }, { id: 'code', startMode: 'code' }],
    modes: [{ id: 'chat', label: 'Chat' }, { id: 'code', label: 'Code' }],
    extra: [{ id: 'research', label: 'Research' }],
  };
  assert.equal(parts.modeTagOf('a', state, 'chat'), '');
  assert.equal(parts.modeTagOf('b', state, 'chat'), 'Research');
  assert.equal(parts.modeTagOf('b', state, 'code'), 'Research');
  assert.equal(parts.modeTagOf('c', state, 'code'), '');
  assert.equal(parts.modeTagOf('d', state, 'chat'), '', 'a mode that cannot be named: no tag');
  // Stage 7 (owner decision 28): English only, so an extra argument (the old Chinese flag) changes nothing.
  assert.equal(parts.modeTagOf('b', state, 'chat', true), 'Research');
  assert.equal(parts.modeTagOf('new', state, 'chat'), '', 'no mode yet: no tag');
  // Item 4A, stage 4: Plain chat is Chat's start mode (no tag there); an old Chat-mode chat says "Chat", and Plain chat
  // is named even though it is in no stored list.
  const now = { ...state, sessionModes: { p: 'plain', a: 'chat' }, spaceRows: [{ id: 'chat', startMode: 'plain' }, { id: 'code', startMode: 'code' }] };
  assert.equal(parts.modeTagOf('p', now, 'chat'), '');
  assert.equal(parts.modeTagOf('a', now, 'chat'), '', 'fix round: an old Chat-mode chat in Chat carries no tag');
  assert.equal(parts.modeTagOf('a', now, 'code'), 'Chat', 'elsewhere it still does');
  assert.equal(parts.modeTagOf('w', { ...now, sessionModes: { w: 'cowork' } }, 'chat'), '', 'nor an old Cowork thread in Chat');
  assert.equal(parts.modeTagOf('p', now, 'code'), 'Plain chat');
});

test('a start waits for the new blank thread: a new id at once, the old blank only after a moment', async () => {
  let clock = 0;
  const sleep = async (ms) => { clock += ms; };
  const now = () => clock;
  const seq = (frames) => { let i = 0; return { get: () => frames[Math.min(i++, frames.length - 1)] }; };
  const blank = (id) => ({ currentId: id, byId: { [id]: { blank: true } } });
  assert.equal(await parts.waitForBlank(seq([{ currentId: 'old', byId: { old: {} } }, blank('new'), blank('new')]), 'old', { sleep, now }), 'new');
  clock = 0;
  const reused = await parts.waitForBlank({ get: () => blank('old') }, 'old', { sleep, now });
  assert.equal(reused, 'old');
  assert.ok(clock > 1500, 'the old blank counts only after a second and a half');
  clock = 0;
  assert.equal(await parts.waitForBlank({ get: () => ({ currentId: 'busy', byId: { busy: {} } }) }, '', { sleep, now, limit: 1000 }), '', 'nothing opened: none');
});

test('the Projects row opens the project page on its list; a project page goes back to All projects', () => {
  assert.match(source, /p\.projects\s*\? \(\) => \{ projects\.focus\(null\); appCtx\.layout\.selectPanel\('project'\); \}/);
  assert.match(source, /if \(!ws\) return h\(ProjectList, \{ appCtx, lib, projects \}\);/);
  assert.match(source, /'data-cws-all-projects': '', onClick: \(\) => projects\.focus\(null\)/);
  // A Settings row opens its Settings page.
  assert.match(source, /p\.settings \? \(\) => openSettingsPage\(appCtx, p\.id\)/);
});

test('with spaces the Chat list is grouped; without, the tabs\' flat Chat list is as before', () => {
  assert.match(source, /const groups = flat && spacesOn\s*\? chatGroups\(/);
  assert.match(source, /if \(groups\) \{/);
  assert.match(source, /'data-cws-list': 'chat-groups'/);
  // Recon's room is no project: threads listed there go with the Chats (seen in the lab, 22 November).
  assert.match(source, /projects\.filter\(\(p\) => !rooms\.has\(roomKey\(p\.ws\.path\)\)\)/);
  // Chat-mode threads of the default workspace (the Chat tab's chats from before Scratch) stay with the Chats.
  assert.match(source, /filter\(\(id\) => state\.sessionModes\?\.\[id\] === 'chat'\)/);
});

test('"Ask about automations" goes through the sidebar\'s start event; nothing touches the Automations "tab" setting', () => {
  assert.match(source, /window\.addEventListener\('dsh-cowork-shell:start', onStart\)/);
  assert.match(source, /if \(!model\.get\(\)\.spacesOn\) return;\s*event\.preventDefault\(\);/);
  assert.match(functionText('startInMode'), /modeCall\(\{ action: 'pick', sessionId: id, modeId: mode \}\)/);
  assert.doesNotMatch(source, /'automations'[^\n]*path: \['tab'\]/);
});

test('every new stage 3b text is there once, in English', () => {
  const keys = ['rows.projects', 'rows.settings.hint', 'lib.chats', 'lib.chats.info.title', 'lib.chats.info.what', 'lib.chats.info.when', 'lib.chats.info.change', 'lib.projects', 'lib.chats.empty', 'projects.title', 'projects.hint', 'projects.info.what', 'projects.info.when', 'projects.info.change', 'projects.none', 'projects.threads', 'projects.threads.one', 'projects.default', 'projects.all', 'projects.open', 'row.mode', 'start.mode.none'];
  for (const key of keys) {
    const count = source.split(`'${key}':`).length - 1;
    assert.equal(count, 1, `${key}: English only`);
  }
});

test('fix round 2: Modes can switch the window to a thread\'s space (Recon\'s room picked from Chat or Code) without opening another thread', () => {
  assert.match(source, /window\.addEventListener\('dsh-cowork-shell:show-space', onShow\)/);
  assert.match(source, /if \(!model\.get\(\)\.spacesOn \|\| !isSpaceId\(detail\.space\)\) return;\s*event\.preventDefault\(\);\s*if \(model\.get\(\)\.space !== detail\.space\) void model\.select\(detail\.space\);/);
});
