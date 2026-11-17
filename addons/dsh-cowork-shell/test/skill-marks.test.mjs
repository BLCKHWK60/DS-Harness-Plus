/**
 * Tuner Plus's marks on the Skills page (Tuner Plus's step 13): shown only while Tuner Plus sends them;
 * without it (absent, off, failing, too slow) the page's answer is exactly as before.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { SKILLS_PATH, apply } from '../index.js';
import { askMarks, marksFrom, withMarks } from '../lib/skill-marks.js';

const LISTED = [
  { name: 'my-notes', description: 'Notes', path: '/u/.dsh/skills/my-notes/SKILL.md', provider: 'filesystem' },
  { name: 'read-pdf', description: 'PDF', provider: 'runtime' },
  { name: 'unknown', description: 'Not known to Tuner Plus', path: '/u/x/SKILL.md', provider: 'filesystem' },
];
const MARKS = {
  names: { mine: 'Mine', plus: 'Plus', default: 'Default' },
  list: [
    { name: 'my-notes', path: '/other/my-notes/SKILL.md', provider: 'filesystem', mark: 'default' },
    { name: 'my-notes', path: '/u/.dsh/skills/my-notes/SKILL.md', provider: 'filesystem', mark: 'mine' },
    { name: 'read-pdf', path: '', provider: 'runtime', mark: 'plus' },
  ],
};

/** The Skills route against a stand-in app; `tuning` is Tuner Plus's service (or nothing). */
function route(tuning) {
  let handler;
  const inner = {
    skills: { list: async () => LISTED.map((one) => ({ ...one })) },
    workingDirectory: { defaultDirectory: '/u/work' },
    webServer: { register: (spec) => { if (spec.path === SKILLS_PATH) handler = spec.handler; return () => {}; } },
    connection: { requestRejection: () => undefined },
    effect: (fn) => fn(),
  };
  const ctx = {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    effect: (fn) => { try { fn(); } catch { /* not part of this test */ } },
    provide() {},
    on() {},
    get: (name) => {
      if (name === 'tuning') {
        if (tuning === 'throws') throw new Error('no such service');
        return tuning;
      }
      return undefined;
    },
    inject: (deps, fn) => { if (deps.includes('skills')) fn(inner); },
  };
  apply(ctx);
  return async () => {
    let out = '';
    const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text ?? ''; } };
    await handler({ method: 'GET', headers: {} }, res);
    return JSON.parse(out);
  };
}

test('without Tuner Plus (absent, off, failing, an older service, a wrong answer) the Skills page gets exactly what it got before', async () => {
  for (const tuning of [undefined, 'throws', { apiVersion: 1, skillMarks: async () => undefined }, { apiVersion: 1, skillMarks: async () => { throw new Error('x'); } }, { apiVersion: 1 }, { apiVersion: 2, skillMarks: async () => MARKS }, { apiVersion: 1, skillMarks: async () => ({ list: 'no' }) }]) {
    const body = await route(tuning)();
    assert.deepEqual(Object.keys(body).sort(), ['at', 'folder', 'skills']);
    for (const skill of body.skills) assert.deepEqual(Object.keys(skill).sort(), ['description', 'modelInvocable', 'name', 'path', 'provider', 'userInvocable', 'whenToUse']);
  }
});

test('with Tuner Plus\'s skills part on: each known skill gets its mark (by name and file, or name and provider); the page gets the mark names', async () => {
  const body = await route({ apiVersion: 1, skillMarks: async () => MARKS })();
  assert.deepEqual(body.marks, MARKS.names);
  assert.deepEqual(body.skills.map((one) => [one.name, one.mark ?? null, one.markName ?? null]), [['my-notes', 'mine', 'Mine'], ['read-pdf', 'plus', 'Plus'], ['unknown', null, null]]);
});

test('Tuner Plus too slow: the list comes without marks; its answer is checked before use', async () => {
  const slow = { apiVersion: 1, skillMarks: () => new Promise((resolve) => setTimeout(() => resolve(MARKS), 200)) };
  assert.equal(await askMarks(() => slow, 20), undefined);
  assert.deepEqual(marksFrom({ names: { mine: 'Mine', 'BAD!': 'x', empty: ' ' }, list: [{ name: 'a', mark: 'mine', path: 3 }, { name: 'b', mark: 'other' }, null] }), { names: { mine: 'Mine' }, list: [{ name: 'a', path: '', provider: '', mark: 'mine' }] });
  assert.equal(marksFrom({ names: {}, list: [] }), undefined);
  assert.equal(withMarks(LISTED, undefined), LISTED);
});
