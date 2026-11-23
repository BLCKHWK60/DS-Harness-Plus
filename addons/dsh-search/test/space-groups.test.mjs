/**
 * Item 4A, stage 6b, Part C (STAGE6B-DESIGN.md J18, Revision 2 G8 and L7): ⌘K grouped by space, the mode on each row,
 * Recon never. Stand-ins only: no real app, no real app data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply, SPACE_READ_NOTE } from '../index.js';
import { SPACE_CAP, results } from '../lib/match.js';

const NAMES = {
  en: { chat: 'Chat', code: 'Code', devices: 'Devices', recon: 'Recon', workshop: 'Workshop' },
  // An older Modes that still answers another language when asked: the page must never ask for it.
  zh: { chat: 'ZH-chat', code: 'ZH-code', devices: 'ZH-devices', recon: 'ZH-recon', workshop: 'ZH-workshop' },
};
const MODE_SPACE = { plain: 'chat', chat: 'chat', cowork: 'chat', research: 'chat', automations: 'chat', code: 'code', bench: 'devices', recon: 'recon', 'creator-plus': 'workshop' };
const MODE_NAMES = { en: { plain: 'Plain chat', research: 'Research', code: 'Code', bench: 'Devices', automations: 'Automations', cowork: 'Cowork' }, zh: { plain: 'ZH-plain', research: 'ZH-research', code: 'ZH-code', bench: 'ZH-bench', automations: 'ZH-automations', cowork: 'ZH-cowork' } };

/**
 * A stand-in app with Modes' spaces. `spaceOf`: thread -> space ('' unknown; a function may throw).
 * `list`: Modes' space ids (all five by default); `live`: spaces live; `modesOn`: Modes there at all.
 */
function standIn({ spaceOf = {}, live = true, list = ['chat', 'code', 'devices', 'recon', 'workshop'], isolated = () => false, modesOn = true, withSpaces = true, hits = [], recon } = {}) {
  const routes = {};
  const asked = [];
  const modes = {
    isolated,
    get: () => 'research',
    modeName: (id, lang = 'en') => MODE_NAMES[lang === 'zh' ? 'zh' : 'en'][id] ?? id,
    ...(withSpaces ? {
      spaces: {
        live: () => live,
        of: (id) => { asked.push(id); const found = spaceOf[id]; if (typeof found === 'function') return found(); return found ?? ''; },
        ofMode: (id) => MODE_SPACE[id] ?? 'chat',
        list: () => list.map((id) => ({ id, available: id !== 'workshop', shown: id !== 'code' })),
        names: (lang = 'en') => NAMES[String(lang).startsWith('zh') ? 'zh' : 'en'],
      },
    } : {}),
  };
  const services = {
    settings: { describe: () => [{ ns: 'modes', value: {} }] },
    modes: modesOn ? modes : undefined,
    agents: { get: () => ({}) },
    recon,
    sessionQuery: { searchSessions: async ({ query }) => ({ items: hits.filter(([, text]) => text.includes(query)).map(([id, text]) => ({ header: { id }, bestMatch: { sessionId: id, snippet: text } })) }) },
  };
  const ctx = { get: (name) => services[name], inject: (_deps, fn) => fn({ effect: (start) => start(), webServer: { register: (spec) => { routes[spec.path] = spec.handler; return () => {}; } }, connection: { requestRejection: () => undefined } }) };
  apply(ctx, { shortcut: true });
  const post = async (body) => {
    const req = { method: 'POST', async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } };
    let sent = '';
    const res = { statusCode: 200, setHeader: () => {}, end: (text) => { sent = text ?? ''; } };
    await routes['/dsh-search/match'](req, res);
    return { status: res.statusCode, body: JSON.parse(sent) };
  };
  const get = async () => {
    let sent = '';
    await routes['/dsh-search/match']({ method: 'GET' }, { statusCode: 200, setHeader: () => {}, end: (text) => { sent = text ?? ''; } });
    return JSON.parse(sent);
  };
  return { post, get, asked };
}

const SESSIONS = [
  { id: 'c1', title: 'Leak report', tab: 'research', updatedAt: 10 },
  { id: 'k1', title: 'Leak fix', tab: 'code', updatedAt: 30 },
  { id: 'k2', title: 'Leak notes', tab: 'research', updatedAt: 20 },
  { id: 'd1', title: 'Leak on the router', tab: 'bench', updatedAt: 5 },
  { id: 'w1', title: 'Leak skill', tab: 'research', updatedAt: 7 },
  { id: 'r1', title: 'Leak (Recon)', tab: 'research', updatedAt: 50 },
];
const PLACES = { c1: 'chat', k1: 'code', k2: 'code', d1: 'devices', w1: 'workshop', r1: 'recon' };

const shape = (body) => body.groups.map((group) => [group.label, group.items.map((item) => item.id)]);

test('groups-by-space: headings in the sidebar\'s space order, rows under the space Modes gives', async () => {
  const app = standIn({ spaceOf: PLACES });
  const plain = await app.post({ query: 'leak', text: false, sessions: SESSIONS, tabs: [], projects: [] });
  assert.equal(plain.status, 200);
  assert.equal(plain.body.bySpace, true);
  assert.deepEqual(shape(plain.body), [['Chat', ['c1']], ['Code', ['k1', 'k2']], ['Devices', ['d1']], ['Workshop', ['w1']]]);
  assert.deepEqual(plain.body.groups.map((group) => group.space), ['chat', 'code', 'devices', 'workshop']);
  // The owner's own order of the space buttons wins; a tab order alone gives the first place each space shows.
  const own = await app.post({ query: 'leak', sessions: SESSIONS, spaceOrder: ['devices', 'recon', 'code'], tabOrder: ['code'] });
  assert.deepEqual(own.body.groups.map((group) => group.space), ['devices', 'code', 'chat', 'workshop']);
  const tabs = await app.post({ query: 'leak', sessions: SESSIONS, tabOrder: ['bench', 'code', 'research'] });
  assert.deepEqual(tabs.body.groups.map((group) => group.space), ['devices', 'code', 'chat', 'workshop']);
  // The Research thread in Code is under Code, not under the Chat space its mode lives in.
  assert.equal(plain.body.groups[1].items[1].id, 'k2');
});

test('mode-tag: each row carries its mode\'s shown name; headings too; always in English, also for a Chinese page', async () => {
  const app = standIn({ spaceOf: PLACES });
  const en = await app.post({ query: 'leak', sessions: SESSIONS });
  assert.deepEqual(en.body.groups.flatMap((group) => group.items.map((item) => `${item.id}:${item.tag}`)), ['c1:Research', 'k1:Code', 'k2:Research', 'd1:Devices', 'w1:Research']);
  const zh = await app.post({ query: 'leak', sessions: SESSIONS, lang: 'zh-CN' });
  assert.deepEqual(zh.body.groups.map((group) => group.label), ['Chat', 'Code', 'Devices', 'Workshop']);
  assert.equal(zh.body.groups[0].items[0].tag, 'Research');
});

test('recon-never-heading: no Recon heading, also when only a Recon thread matches; Recon by its mode alone hidden too', async () => {
  const app = standIn({ spaceOf: { ...PLACES, r2: '' } });
  const only = await app.post({ query: 'recon', text: true, sessions: SESSIONS });
  assert.deepEqual(only.body.groups, [], 'the Recon thread is not found, and no empty Recon heading either');
  assert.equal(only.body.total, 0);
  const all = await app.post({ query: 'leak', sessions: SESSIONS });
  assert.ok(!all.body.groups.some((group) => group.space === 'recon' || group.label === 'Recon'));
  assert.ok(!all.body.groups.some((group) => group.items.some((item) => item.id === 'r1')));
  // No recorded space and the Recon mode: its mode's space is Recon, so it is hidden as well (belt on 6a's hidden.js).
  const byMode = await app.post({ query: 'old', sessions: [{ id: 'r2', title: 'Old notes', tab: 'recon' }] });
  assert.equal(byMode.body.total, 0);
  // By text: a Recon thread's text never makes it appear.
  const text = standIn({ spaceOf: PLACES, hits: [['r1', 'the router password'], ['c1', 'router']] });
  const found = await text.post({ query: 'router', text: true, sessions: SESSIONS });
  assert.deepEqual(shape(found.body), [['Chat', ['c1']], ['Devices', ['d1']]]);
  // An isolated thread (6a) stays hidden whatever space Modes gives.
  const sealed = standIn({ spaceOf: { ...PLACES, k1: 'code' }, isolated: (id) => id === 'k1' });
  assert.deepEqual(shape((await sealed.post({ query: 'leak', sessions: SESSIONS })).body)[1], ['Code', ['k2']]);
});

test('space-read-throws-hidden: a thread whose space cannot be read is not shown, and the note says so (only when it matched)', async () => {
  const app = standIn({ spaceOf: { ...PLACES, k2: () => { throw new Error('modes busy'); }, x1: 'mars' } });
  const sessions = [...SESSIONS, { id: 'x1', title: 'Leak elsewhere', tab: 'research' }];
  const found = await app.post({ query: 'leak', sessions });
  assert.deepEqual(shape(found.body), [['Chat', ['c1']], ['Code', ['k1']], ['Devices', ['d1']], ['Workshop', ['w1']]], 'k2 (throws) and x1 (no such space) left out');
  assert.equal(found.body.note, SPACE_READ_NOTE.en);
  const zh = await app.post({ query: 'leak', sessions, lang: 'zh' });
  assert.equal(zh.body.note, SPACE_READ_NOTE.en, 'English also when the page says Chinese');
  assert.equal(SPACE_READ_NOTE.zh, undefined);
  const other = await app.post({ query: 'report', sessions });
  assert.equal(other.body.note, '', 'the unread thread did not match: no note');
  // A Recon thread whose read throws gives no hint either.
  const recon = standIn({ spaceOf: { r1: () => { throw new Error('x'); } }, isolated: (id) => id === 'r1' });
  const none = await recon.post({ query: 'leak', sessions: [SESSIONS[5]] });
  assert.equal(none.body.total, 0);
  assert.equal(none.body.note, '');
});

test('plain-under-chat: a Plain chat thread and an Automations thread with no recorded space are under Chat', async () => {
  const app = standIn({ spaceOf: {} });
  const found = await app.post({ query: 'weekly', sessions: [{ id: 'p1', title: 'Weekly plan', tab: 'plain' }, { id: 'a1', title: 'Weekly report job', tab: 'automations' }, { id: 'n1', title: 'Weekly notes', tab: '' }] });
  assert.deepEqual(shape(found.body), [['Chat', ['p1', 'a1', 'n1']]]);
  assert.deepEqual(found.body.groups[0].items.map((item) => item.tag), ['Plain chat', 'Automations', ''], 'no mode stored: no tag');
});

test('hidden-space-listed: threads of a hidden or unavailable space are still listed under it (reachable only here)', async () => {
  // The stand-in's list marks Code hidden and Workshop unavailable.
  const app = standIn({ spaceOf: PLACES });
  const found = await app.post({ query: 'leak', sessions: SESSIONS });
  assert.ok(found.body.groups.some((group) => group.space === 'code' && group.items.length === 2));
  assert.ok(found.body.groups.some((group) => group.space === 'workshop' && group.items.length === 1));
  // Modes that cannot list its spaces: the four headings still come (never Recon).
  const broken = standIn({ spaceOf: PLACES, list: [] });
  assert.deepEqual((await broken.post({ query: 'leak', sessions: SESSIONS })).body.groups.map((group) => group.space), ['chat', 'code', 'devices', 'workshop']);
});

test('old-modes-tab-groups: without Modes, without spaces, or with spaces not live, the tab grouping exactly as before', async () => {
  const tabs = [{ id: 'research', label: 'Research' }, { id: 'code', label: 'Code' }, { id: 'bench', label: 'Devices' }];
  const want = [['Research', ['c1', 'k2', 'w1', 'r1']], ['Code', ['k1']], ['Devices', ['d1']]].map(([label, ids]) => [label, ids]);
  for (const app of [standIn({ live: false, spaceOf: PLACES }), standIn({ withSpaces: false }), standIn({ modesOn: false })]) {
    const found = await app.post({ query: 'leak', sessions: SESSIONS, tabs });
    assert.equal(found.body.bySpace, undefined);
    assert.deepEqual(shape(found.body).map(([label, ids]) => [label, [...ids].sort()]), want.map(([label, ids]) => [label, [...ids].sort()]));
    assert.equal(found.body.groups[0].items[0].tag, undefined, 'no tag on the tab path');
  }
  const off = standIn({ live: false });
  assert.equal(off.asked.length, 0);
  assert.equal((await off.get()).bySpace, false);
  assert.equal((await standIn({ spaceOf: PLACES }).get()).bySpace, true, 'the page\'s first line says "space" when grouped by space');
});

test('more-line (Revision 2 G8): at most 60 rows per space, the rest counted', async () => {
  const many = Array.from({ length: 75 }, (_, n) => ({ id: `t${n}`, title: `Leak ${n}`, tab: 'plain', updatedAt: n }));
  const app = standIn({ spaceOf: {} });
  const found = await app.post({ query: 'leak', sessions: many });
  assert.equal(found.body.groups[0].items.length, SPACE_CAP);
  assert.equal(SPACE_CAP, 60);
  assert.equal(found.body.groups[0].more, 15);
  assert.equal(found.body.groups[0].items[0].id, 't74', 'newest first');
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(client, /and \{n\} more: type more of the name/);
  assert.match(client, /Nothing found in any space\./);
  assert.doesNotMatch(client, /\bzh: \{/, 'no Chinese twins');
  // The match function alone: no heading for an item's space means it is left out (never an "Other" group).
  const alone = results({ query: 'x', sessions: [{ id: 'a', title: 'x', space: 'mars' }, { id: 'b', title: 'x', space: 'chat', modeName: 'Plain chat' }], groupBy: 'space', spaces: [{ id: 'chat', label: 'Chat' }, { id: 'recon', label: 'Recon' }] });
  assert.deepEqual(alone.groups.map((group) => [group.label, group.items.map((item) => item.id)]), [['Chat', ['b']]]);
  const recon = results({ query: 'x', sessions: [{ id: 'r', title: 'x', space: 'recon' }], groupBy: 'space', spaces: [{ id: 'recon', label: 'Recon' }] });
  assert.deepEqual(recon.groups, [], 'a Recon heading is never made, even when asked for');
});

test('hitids-not-rendered (Revision 2 L7): the page draws only the rows of groups; hitIds stay ids for the sidebar', async () => {
  const app = standIn({ spaceOf: PLACES, hits: [['r1', 'leak dump']] });
  const found = await app.post({ query: 'leak', text: true, sessions: SESSIONS });
  assert.deepEqual(found.body.hitIds, ['r1'], 'ids only, as 6a accepted');
  assert.ok(!JSON.stringify(found.body.groups).includes('leak dump'));
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.doesNotMatch(client.replace(/\/\/[^\n]*/g, ''), /hitIds/, 'the page never reads hitIds');
  assert.match(client, /spaceOrder/, 'the page sends the space order');
  assert.match(client, /lang: pageLang\(\)/, 'and its language');
});

test('projects-no-recon-room: Recon\'s room is never listed under Projects (Recon says, or its name while Recon is off)', async () => {
  const projects = [
    { id: 'p1', title: 'Recon room', path: '/private/tmp/dsh-recon-lab-13' },
    { id: 'p2', title: 'My project', path: '/Users/me/project' },
    { id: 'p3', title: 'Linked room', path: '/Users/me/room-link' },
  ];
  const shown = async (recon) => (await standIn({ recon }).post({ query: 'r', sessions: [], projects })).body.projects.map((one) => one.id);
  assert.deepEqual(await shown({ isRoom: (path) => path === '/Users/me/room-link' }), ['p2'], 'Recon says, and the name');
  assert.deepEqual(await shown(undefined), ['p2', 'p3'], 'Recon off: the room by its name only');
  assert.deepEqual(await shown({ isRoom: () => { throw new Error('no'); } }), [], 'Recon cannot answer: none shown (fail closed)');
  const old = await standIn({ live: false, recon: { isRoom: () => false } }).post({ query: 'r', sessions: [], projects });
  assert.deepEqual(old.body.projects.map((one) => one.id), ['p2', 'p3'], 'also with the tab grouping');
});
