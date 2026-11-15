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
