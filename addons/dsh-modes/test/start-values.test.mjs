import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeStart, startOps } from '../lib/start.js';

const none = { web: '', depth: '', helpers: '', tools: '' };
const fields = (ops) => Object.fromEntries(ops.map((op) => [op.path[0], JSON.parse(op.value)]));

test('starting values per mode: nothing is set until the owner picks something', () => {
  assert.deepEqual(normalizeStart(undefined), none);
  assert.deepEqual(normalizeStart({}), none);
  assert.deepEqual(normalizeStart({ web: 'nonsense', depth: 'deep', helpers: 'many', tools: 'on' }), none, 'unknown values mean usual');
  assert.deepEqual(startOps(none, {}, 's'), [], 'no values, no writes');
});

test('each value lands in the setting its button writes, for this conversation only', () => {
  const start = normalizeStart({ web: 'verified', depth: 'Thorough', helpers: 'roles', tools: 'off' });
  assert.deepEqual(start, { web: 'verified', depth: 'thorough', helpers: 'roles', tools: 'off' });
  const out = fields(startOps(start, { sessionWeb: '{"x":false}', sessionDepth: {}, sessionHelpers: '{"x":"same"}' }, 's'));
  assert.deepEqual(out, {
    sessionWeb: { x: false, s: true },
    sessionWebLevel: { s: 'verified' },
    sessionDepth: { s: 'thorough' },
    sessionHelpers: { x: 'same', s: 'roles' },
    sessionTools: { s: false },
  });
});

test('Web Off and Web On: Off writes no level; On takes the usual level back', () => {
  assert.deepEqual(fields(startOps(normalizeStart({ web: 'off' }), {}, 's')), { sessionWeb: { s: false } });
  assert.deepEqual(fields(startOps(normalizeStart({ web: 'on' }), { sessionWebLevel: '{"s":"open","y":"verified"}' }, 's')), { sessionWeb: { s: true }, sessionWebLevel: { y: 'verified' } });
});

test('a conversation that already has its own value in a field keeps it', () => {
  const start = normalizeStart({ web: 'off', depth: 'quick', helpers: 'roles', tools: 'off' });
  const current = { sessionWeb: '{"s":true}', sessionDepth: '{"s":"thorough"}', sessionHelpers: '{"s":"same"}', sessionTools: '{"s":false}' };
  assert.deepEqual(startOps(start, current, 's'), []);
  assert.deepEqual(fields(startOps(start, current, 'other')).sessionDepth, { s: 'thorough', other: 'quick' });
});

test('an isolated mode (Recon) keeps its own web rules: only Off is honoured, never a wider level', () => {
  for (const web of ['on', 'verified', 'open', 'everything']) assert.equal(normalizeStart({ web }, { isolated: true }).web, '', web);
  assert.equal(normalizeStart({ web: 'off', depth: 'quick' }, { isolated: true }).web, 'off');
  assert.equal(normalizeStart({ depth: 'quick' }, { isolated: true }).depth, 'quick');
});

test('the setting, the hook and the page are wired', () => {
  const host = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(host, /modeStart: z\.string\(\)\.default\('\{\}'\)\.volatile\(\)/);
  assert.match(host, /if \(starting\) await seedStart\(agent, modeOf\(agent\.id\)\);/, 'only a conversation that has just begun');
  assert.match(host, /normalizeStart\(entry, \{ isolated: mode\.isolated === true \}\)/);
  const body = host.slice(host.indexOf('async function seedStart('), host.indexOf('async function seedStart(') + 900);
  assert.match(body, /catch \(error\)/, 'a listener that must never throw');
  assert.match(client, /saveNow\('modeStart', JSON\.stringify\(next\)\)/);
  for (const key of ['start.group', 'start.hint', 'start.usual', 'start.web.everything', 'start.isolated']) {
    assert.equal(client.split('\n').filter((line) => line.includes(`'${key}':`)).length, 2, `${key}: English and Chinese`);
  }
});
