import test from 'node:test';
import assert from 'node:assert/strict';
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
