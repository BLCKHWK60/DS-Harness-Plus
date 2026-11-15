// The Settings helper's index: read safely, and the shipped index is well formed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readIndex } from '../index.js';

test('reading the index', () => {
  assert.deepEqual(readIndex('not json'), []);
  assert.deepEqual(readIndex('{"a":1}'), []);
  const list = readIndex(JSON.stringify([{ page: 'modes', pageLabel: 'Modes', label: ' Load tools as needed ', keywords: ['trim'] }, { page: 'x' }, { label: 'no page' }]));
  assert.equal(list.length, 1);
  assert.equal(list[0].label, 'Load tools as needed');
  assert.equal(list[0].configOnly, false);
});

test('the shipped index is well formed', () => {
  const list = readIndex(readFileSync(fileURLToPath(new URL('../settings-index.json', import.meta.url)), 'utf8'));
  for (const entry of list) {
    assert.ok(entry.page && entry.label, JSON.stringify(entry));
    assert.ok(entry.label.length <= 160, entry.label);
  }
  const keys = new Set();
  for (const entry of list) keys.add(`${entry.page}|${entry.heading}|${entry.label}`);
  assert.ok(keys.size >= list.length * 0.95, 'few duplicates');
});

test('the route answers with the list, and refuses a request the app does not let in', async () => {
  const { apply, INDEX_PATH } = await import('../index.js');
  let route;
  const inner = {
    webServer: { register: (spec) => { route = spec; return () => {}; } },
    connection: { requestRejection: (req) => (req.headers?.authorization ? undefined : 401) },
    effect: (start) => start(),
  };
  apply({ inject: (_names, callback) => callback(inner) }, { enabled: true });
  assert.equal(route.path, INDEX_PATH);
  const answer = (req) => {
    const res = { statusCode: 200, headers: {}, body: '', setHeader(name, value) { this.headers[name] = value; }, end(text = '') { this.body = text; } };
    route.handler(req, res);
    return res;
  };
  const refused = answer({ headers: {} });
  assert.equal(refused.statusCode, 401);
  assert.equal(refused.body, '');
  const ok = answer({ headers: { authorization: 'token' } });
  const data = JSON.parse(ok.body);
  assert.equal(data.enabled, true);
  assert.ok(data.entries.length > 800);
  assert.ok(data.entries.some((entry) => entry.label === 'Finance (add-on): load tools as needed'));
});
