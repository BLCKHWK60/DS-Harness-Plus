import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { holds, marked, results, wordsOf } from '../lib/match.js';
import { searchText } from '../lib/text.js';

test('a query is words, and a text matches when it holds them all', () => {
  assert.deepEqual(wordsOf('  Acme   LEAK '), ['acme', 'leak']);
  assert.equal(holds('The Acme data leak', ['acme', 'leak']), true);
  assert.equal(holds('The Acme data', ['acme', 'leak']), false);
  assert.equal(holds('anything', []), false, 'an empty query matches nothing');
  assert.deepEqual(marked('Acme leak at Acme', ['acme']), [{ text: 'Acme', hit: true }, { text: ' leak at ', hit: false }, { text: 'Acme', hit: true }]);
  assert.deepEqual(marked('plain', ['x']), [{ text: 'plain', hit: false }]);
  assert.deepEqual(marked('aaa', ['aa', 'a']).map((piece) => piece.text).join(''), 'aaa');
});

test('results: titles and message text, each conversation once, grouped by tab, with projects', () => {
  const sessions = [
    { id: 's1', title: 'Fix the login bug', updatedAt: 30, tab: 'code' },
    { id: 's2', title: 'Holiday plan', updatedAt: 20, tab: 'cowork' },
    { id: 's3', title: 'Login page copy', updatedAt: 10, tab: 'cowork' },
    { id: 's4', title: 'Old chat', updatedAt: 5, tab: '' },
    { id: 's5', title: 'Recon notes', updatedAt: 40, tab: 'recon' },
  ];
  const tabs = [{ id: 'chat', label: 'Chat' }, { id: 'cowork', label: 'Cowork' }, { id: 'code', label: 'Code' }, { id: 'recon', label: 'Recon' }];
  const hits = [{ sessionId: 's2', snippet: 'we discussed the login flow' }, { sessionId: 's1', snippet: 'login fails on Safari' }, { sessionId: 's4', snippet: 'my login' }, { sessionId: 'gone', snippet: 'login' }, { sessionId: 's5', snippet: 'a login dump' }];
  const projects = [{ id: 'p1', title: 'login-service', path: '/work/login-service' }, { id: 'p2', title: 'notes', path: '/work/notes' }];
  const found = results({ query: 'login', sessions, hits, projects, tabs });
  assert.deepEqual(found.groups.map((group) => [group.label, group.items.map((item) => `${item.id}:${item.by}`)]), [
    ['Cowork', ['s3:title', 's2:text']],
    ['Code', ['s1:title']],
    ['Recon', ['s5:text']],
    ['Other', ['s4:text']],
  ]);
  assert.equal(found.groups[1].items[0].snippet, 'login fails on Safari', 'a title match still shows where the text matched');
  assert.deepEqual(found.projects.map((project) => project.id), ['p1']);
  assert.equal(found.total, 6);
  assert.deepEqual(results({ query: '  ', sessions, hits, projects, tabs }), { groups: [], projects: [], total: 0 });
  assert.equal(results({ query: 'login safari', sessions, hits: [], projects, tabs }).total, 0, 'every word must match');
});

test('message text: several pages, every word, and the app\'s own notes left out', async () => {
  // A stand-in index: each "event" is a conversation id and a text.
  const events = [
    ['s1', 'we should fix the login flow on Safari'],
    ['s2', 'the login page needs new copy'],
    ['s3', 'Safari crashes on start'],
    ...Array.from({ length: 5 }, (_, n) => [`b${n}`, 'Skills you can use: login-helper, safari-checker and more']),
    ['s1', 'another login mention'],
  ];
  const asked = [];
  const search = async ({ query, limit, cursor }) => {
    asked.push(`${query}@${cursor ?? 0}`);
    // Like the app's index: one item per conversation, with its best match (here: its first).
    const best = new Map();
    for (const [sessionId, text] of events) if (text.toLowerCase().includes(query.toLowerCase()) && !best.has(sessionId)) best.set(sessionId, text);
    const all = [...best].map(([sessionId, text]) => ({ header: { id: sessionId }, bestMatch: { sessionId, snippet: `… ${text} …` } }));
    const from = Number(cursor ?? 0);
    const size = Math.min(limit, 2);
    return { items: all.slice(from, from + size), ...(from + size < all.length ? { nextCursor: String(from + size) } : {}) };
  };
  const one = await searchText(search, 'login', { pages: 10 });
  assert.deepEqual(one.hits.map((hit) => hit.sessionId), ['s1', 's2'], 'each conversation once; the note that repeats in five conversations is left out');
  assert.equal(one.more, false);
  assert.match(one.hits[0].snippet, /fix the login flow/);
  const both = await searchText(search, 'login safari', { pages: 10 });
  assert.deepEqual(both.hits.map((hit) => hit.sessionId), ['s1'], 'every word, not only the exact phrase');
  const cut = await searchText(search, 'login', { pages: 1 });
  assert.equal(cut.more, true, 'says so when it stopped early');
  assert.deepEqual(await searchText(search, 'x'), { hits: [], more: false }, 'one letter is not searched');
  assert.ok(asked.includes('login safari@0') && asked.includes('safari@0'));
});

test('isolated conversations: marked, or open and isolated by Modes; a conversation moved into Recon is not', async () => {
  const { isolatedCheck } = await import('../lib/hidden.js');
  const modes = {
    sessionIsolated: JSON.stringify({ r1: true, other: false }),
    // `moved` and `movedClosed` were moved into the Recon tab after they ran (the Cowork sidebar's "Move to" menu
    // stores the mode): Modes holds them in its late lock and never marks them.
    sessionModes: JSON.stringify({ moved: 'recon', movedClosed: 'recon', c1: 'cowork', x1: 'gone' }),
    modes: JSON.stringify({ cowork: { label: 'Cowork' } }),
    extraModes: JSON.stringify({ recon: { label: 'Recon', isolated: true } }),
  };
  const open = new Set(['r3', 'c1', 'c2', 'moved']);
  const asked = [];
  const isolated = isolatedCheck({ modes, loaded: (id) => open.has(id), isolated: (id) => { asked.push(id); return id === 'r3' || id === 'moved'; }, modeOf: (id) => (id === 'moved' ? 'isolated-late' : id === 'r3' ? 'recon' : 'cowork') });
  assert.equal(isolated('r1'), true, 'marked for good');
  assert.equal(isolated('r3'), true, 'open, and Modes says so (a new Recon conversation before its mark is stored)');
  assert.equal(isolated('c1'), false);
  assert.equal(isolated('c2'), false);
  assert.equal(isolated('moved'), false, 'open, but only locked when the Recon tab was chosen for it: it holds nothing from Recon');
  assert.equal(isolated('movedClosed'), false, 'closed: its stored mode alone does not hide it');
  assert.equal(isolated('x1'), false, 'a mode that is gone is not isolated by itself');
  assert.equal(isolated('closed'), false, 'a closed conversation is never asked about');
  assert.equal(isolated('other'), false);
  assert.equal(isolated(''), false);
  assert.ok(!asked.includes('closed') && !asked.includes('movedClosed') && !asked.includes('r1'));
  // Without the Modes add-on's settings nothing is known to be isolated; a Modes that throws for an open one keeps it out.
  assert.equal(isolatedCheck({ modes: undefined })('r1'), false);
  assert.equal(isolatedCheck({ modes: {}, loaded: () => true, isolated: () => { throw new Error('x'); } })('c1'), true);
});

test('results never show an isolated conversation, by its title or by its text', () => {
  const sessions = [
    { id: 's1', title: 'Fix the login bug', updatedAt: 30, tab: 'code' },
    { id: 's5', title: 'Recon notes on login', updatedAt: 40, tab: 'recon' },
    { id: 's6', title: 'Old recon chat', updatedAt: 45, tab: 'recon' },
  ];
  const tabs = [{ id: 'code', label: 'Code' }, { id: 'recon', label: 'Recon' }];
  const hits = [{ sessionId: 's5', snippet: 'a login dump' }, { sessionId: 's6', snippet: 'login seen on a forum' }, { sessionId: 's1', snippet: 'login fails' }];
  const hidden = (id) => id === 's5' || id === 's6';
  const found = results({ query: 'login', sessions, hits, projects: [], tabs, hidden });
  assert.deepEqual(found.groups.map((group) => [group.label, group.items.map((item) => item.id)]), [['Code', ['s1']]]);
  assert.equal(found.total, 1);
  assert.equal(results({ query: 'recon', sessions, hits: [], projects: [], tabs, hidden }).total, 0, 'not by title');
  assert.equal(results({ query: 'recon', sessions, hits: [], projects: [], tabs }).total, 2, 'shown when nothing is hidden');
});

test('the route in a stand-in app: an isolated conversation is found neither by title nor by text', async () => {
  const { apply } = await import('../index.js');
  const routes = {};
  const modes = {
    sessionIsolated: JSON.stringify({ r1: true }),
    // m1 and m2 were moved into the Recon tab after they ran: Modes holds them in its late lock (m2 is open).
    sessionModes: JSON.stringify({ r1: 'recon', c1: 'cowork', m1: 'recon', m2: 'recon' }),
    extraModes: JSON.stringify({ recon: { label: 'Recon', isolated: true } }),
  };
  const open = new Map([['r2', {}], ['m2', {}]]);
  const index = {
    // Like the app's index: one item per conversation that holds the text.
    searchSessions: async ({ query }) => ({
      items: [['c1', 'the login flow'], ['c2', 'my login notes'], ['r1', 'a login dump'], ['r2', 'login on a forum'], ['m1', 'budget login'], ['m2', 'login budget too']]
        .filter(([, text]) => text.includes(query))
        .map(([id, text]) => ({ header: { id }, bestMatch: { sessionId: id, snippet: text } })),
    }),
  };
  const services = {
    settings: { describe: () => [{ ns: 'other', value: {} }, { ns: 'modes', value: modes }] },
    modes: { isolated: (id) => id === 'r2' || id === 'm2', get: (id) => (id === 'm2' ? 'isolated-late' : 'recon') },
    agents: { get: (id) => open.get(id) },
    sessionQuery: index,
  };
  const ctx = {
    get: (name) => services[name],
    inject: (_deps, fn) => fn({
      effect: (start) => start(),
      webServer: { register: (spec) => { routes[spec.path] = spec.handler; return () => {}; } },
      connection: { requestRejection: () => undefined },
    }),
  };
  apply(ctx, { shortcut: true });
  const post = async (body) => {
    const req = { method: 'POST', async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } };
    let sent = '';
    const res = { statusCode: 200, setHeader: () => {}, end: (text) => { sent = text ?? ''; } };
    await routes['/dsh-search/match'](req, res);
    return { status: res.statusCode, body: JSON.parse(sent) };
  };
  const sessions = [
    { id: 'c1', title: 'Login page copy', tab: 'cowork' },
    { id: 'c2', title: 'Notes', tab: 'cowork' },
    { id: 'r1', title: 'Login leak (Recon)', tab: 'recon' },
    { id: 'r2', title: 'New recon chat', tab: 'recon' },
  ];
  const tabs = [{ id: 'cowork', label: 'Cowork' }, { id: 'recon', label: 'Recon' }];
  const titles = await post({ query: 'login', text: false, sessions, tabs, projects: [] });
  assert.equal(titles.status, 200);
  assert.deepEqual(titles.body.groups.map((group) => group.items.map((item) => item.id)), [['c1']], 'by title');
  const text = await post({ query: 'login', text: true, sessions, tabs, projects: [] });
  assert.deepEqual(text.body.groups.map((group) => group.items.map((item) => `${item.id}:${item.by}`)), [['c1:title', 'c2:text']], 'by text');
  assert.equal(text.body.total, 2);
  assert.equal(await post({ query: 'recon', text: true, sessions, tabs, projects: [] }).then((answer) => answer.body.total), 0);
  // Conversations moved into the Recon tab after they ran stay findable, by title and by text, closed or open.
  const movedSessions = [...sessions, { id: 'm1', title: 'Budget 2027', tab: 'recon' }, { id: 'm2', title: 'Budget notes', tab: 'recon' }];
  const moved = await post({ query: 'budget', text: true, sessions: movedSessions, tabs, projects: [] });
  assert.deepEqual(moved.body.groups.map((group) => group.items.map((item) => `${item.id}:${item.by}`)), [['m1:title', 'm2:title']]);
  const movedText = await post({ query: 'login', text: true, sessions: movedSessions, tabs, projects: [] });
  assert.deepEqual(movedText.body.groups.map((group) => group.items.map((item) => `${item.id}:${item.by}`)), [['c1:title', 'c2:text'], ['m1:text', 'm2:text']]);
  // The Cowork sidebar's search inside one tab gets every text hit and keeps only its own tab's conversations.
  const inTab = await post({ query: 'login', text: true });
  assert.deepEqual(inTab.body.hitIds, ['c1', 'c2', 'r1', 'r2', 'm1', 'm2']);
  assert.equal(inTab.body.total, 0);
});

test('Thorough\'s check before finishing is never a hit, even in one conversation', async () => {
  const { CHECK_TEXT, isCheck } = await import('../lib/text.js');
  const { DEPTH_CHECK_PROMPT } = await import('../../dsh-modes/lib/prompt.js');
  assert.equal(CHECK_TEXT, DEPTH_CHECK_PROMPT, 'the same words as Modes sends');
  assert.ok(isCheck(`… ${CHECK_TEXT} …`));
  assert.ok(isCheck('… check your answer against the request and your working …'), 'a piece of it');
  assert.ok(!isCheck('… check the login request …'), 'not other text');
  assert.ok(!isCheck('finish'), 'too short to tell');
  const events = [['c1', CHECK_TEXT], ['c2', 'please check the request headers']];
  const search = async ({ query }) => ({
    items: events.filter(([, text]) => text.toLowerCase().includes(query.toLowerCase())).map(([sessionId, text]) => ({ header: { id: sessionId }, bestMatch: { sessionId, snippet: `… ${text} …` } })),
  });
  assert.deepEqual((await searchText(search, 'request')).hits.map((hit) => hit.sessionId), ['c2']);
});

// ---- item 4A, stage 6a: the Recon space keeps its rules for any mode (STAGE6A-DESIGN.md, P4 belt) -------------------

test('hidden-by-space: a thread recorded in the Recon space is hidden whatever its mode; the Chat space is not', async () => {
  const { isolatedCheck } = await import('../lib/hidden.js');
  const modes = { sessionSpaces: JSON.stringify({ rr: 'recon', ch: 'chat', dv: 'devices' }), sessionModes: JSON.stringify({ rr: 'research', ch: 'research', dv: 'code' }) };
  const isolated = isolatedCheck({ modes });
  assert.equal(isolated('rr'), true, 'Research in Recon, closed, no mark');
  assert.equal(isolated('ch'), false);
  assert.equal(isolated('dv'), false, 'Devices is guarded, not sealed: still found');
});

test('hidden-by-room-folder: a closed thread with no space and no mark whose folder is Recon\'s room is hidden; Recon asked once per folder', async () => {
  const { isolatedCheck } = await import('../lib/hidden.js');
  const asked = [];
  const folders = { lost: '/tmp/dsh-recon-room/run-x', ch: '/Users/me/app', ch2: '/Users/me/app' };
  const isolated = isolatedCheck({ modes: {}, folderOf: (id) => folders[id] ?? '', isRoom: (folder) => { asked.push(folder); return folder.startsWith('/tmp/dsh-recon-room'); } });
  assert.equal(isolated('lost'), true);
  assert.equal(isolated('ch'), false);
  assert.equal(isolated('ch2'), false);
  assert.equal(isolated('none'), false, 'no folder known');
  assert.deepEqual(asked, ['/tmp/dsh-recon-room/run-x', '/Users/me/app']);
  assert.equal(isolatedCheck({ modes: {}, folderOf: () => '/x', isRoom: () => { throw new Error('x'); } })('a'), false, 'a Recon that cannot say hides nothing more');
});

test('hidden-by-room-folder: the route hides a thread whose folder (sent by the page) is Recon\'s room', async () => {
  const { apply } = await import('../index.js');
  const routes = {};
  const services = {
    settings: { describe: () => [{ ns: 'modes', value: { sessionSpaces: JSON.stringify({ rr: 'recon' }) } }] },
    modes: { isolated: () => false, get: () => 'research' },
    agents: { get: () => undefined },
    recon: { isRoom: (folder) => folder === '/tmp/dsh-recon-room' },
  };
  const ctx = { get: (name) => services[name], inject: (_deps, fn) => fn({ effect: (start) => start(), webServer: { register: (spec) => { routes[spec.path] = spec.handler; return () => {}; } }, connection: { requestRejection: () => undefined } }) };
  apply(ctx, { shortcut: true });
  const body = { query: 'leak', sessions: [{ id: 'rr', title: 'Leak notes', tab: 'research' }, { id: 'room', title: 'Leak room', tab: 'research', cwd: '/tmp/dsh-recon-room' }, { id: 'ch', title: 'Leak report', tab: 'research', cwd: '/Users/me' }] };
  const req = { method: 'POST', async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } };
  let sent = '';
  await routes['/dsh-search/match'](req, { statusCode: 200, setHeader: () => {}, end: (text) => { sent = text ?? ''; } });
  const ids = JSON.parse(sent).groups.flatMap((group) => group.items.map((item) => item.id));
  assert.deepEqual(ids, ['ch']);
});

test('held-devices-thread-found (stage 7 lab): Devices off holds its open threads (Modes answers "isolated"), and ⌘K still finds them', async () => {
  const { isolatedCheck } = await import('../lib/hidden.js');
  const modes = { sessionSpaces: JSON.stringify({ dv: 'devices', ws: 'workshop', rr: 'recon', ch: 'chat' }), sessionIsolated: JSON.stringify({ was: true }) };
  const isolated = isolatedCheck({ modes, loaded: () => true, isolated: () => true, modeOf: () => 'isolated-locked' });
  assert.equal(isolated('dv'), false, 'a held Devices thread is found');
  assert.equal(isolated('ws'), false, 'a held Workshop thread is found');
  assert.equal(isolated('rr'), true, 'Recon stays hidden');
  assert.equal(isolated('ch'), true, 'a locked thread elsewhere stays hidden');
  assert.equal(isolated('was'), true, 'a thread that ran sealed stays hidden');
  const sealedMode = isolatedCheck({ modes, loaded: () => true, isolated: () => true, modeOf: () => 'recon' });
  assert.equal(sealedMode('dv'), true, 'only the locked copy counts as a hold');
});

// s7c lab (Low): ⌘K kept the thread list from when its box opened, so a thread made while it stayed open was not found.
test('s7c lab: the search box reads the thread list again once it is older than a few seconds', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const fresh = client.match(/const BASE_FRESH_MS = (\d+);/);
  assert.ok(fresh, 'a freshness limit exists');
  assert.ok(Number(fresh[1]) > 0 && Number(fresh[1]) <= 10_000, 'a few seconds at most');
  const box = client.slice(client.indexOf('function SearchBox('), client.indexOf('const flat = ', client.indexOf('function SearchBox(')));
  assert.doesNotMatch(box, /base\.current = base\.current \?\? await gather/, 'no longer kept for the life of the box');
  assert.match(box, /if \(!base\.current \|\| Date\.now\(\) - baseAt\.current > BASE_FRESH_MS\) \{\s*base\.current = await gather\(appCtx\);\s*baseAt\.current = Date\.now\(\);/);
});
