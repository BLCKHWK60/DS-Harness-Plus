import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Item 4A, stage 0: the Chat tab's one list left out every chat started in Scratch (Chat's default start
// place), so a new chat showed only with "Show all" or ⌘K. Seen in the lab on 22 November 2026.
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

const chatListIds = new Function(`${functionText('chatListIds')}\nreturn chatListIds;`)();

const byId = {
  proj1: { updatedAt: 10 }, proj2: { updatedAt: 40 },
  scr1: { updatedAt: 50 }, scr2: { updatedAt: 20 },
  loose1: { updatedAt: 30 },
  pin: { updatedAt: 1 },
};
const pinned = new Set(['pin']);
const sortRows = (ids) => ids.filter((id) => byId[id]).sort((a, b) => (pinned.has(b) - pinned.has(a)) || (byId[b].updatedAt - byId[a].updatedAt));

test('Scratch chats are in the Chat list, sorted with the others (pinned first, then newest)', () => {
  const ids = chatListIds(sortRows, [{ ids: ['proj1', 'proj2'] }], ['scr1', 'scr2'], ['loose1', 'pin']);
  assert.deepEqual(ids, ['pin', 'scr1', 'proj2', 'loose1', 'scr2', 'proj1']);
});

test('a Chat tab with only Scratch chats lists all of them', () => {
  assert.deepEqual(chatListIds(sortRows, [], ['scr2', 'scr1'], []), ['scr1', 'scr2']);
});

test('nothing in Scratch: the list is as before (projects and loose)', () => {
  assert.deepEqual(chatListIds(sortRows, [{ ids: ['proj1'] }], [], ['loose1']), ['loose1', 'proj1']);
});

test('the Chat tab builds its flat list with the Scratch rows', () => {
  // Item 4A, stage 3b: the flat list is the tabs' Chat list; with spaces Chat lists Chats, then Projects (space-rows test).
  assert.match(source, /const flatIds = flat && !spacesOn \? chatListIds\(sortRows, projects, scratchRows, loose\) : \[\];/);
  // The other tabs keep their own Scratch group, unchanged.
  assert.match(source, /scratchRows\.length \? h\(React\.Fragment, null,\s*h\('div', \{ className: 'cws-lib-head', title: t\('place\.scratch\.hint'\) \}/);
});
