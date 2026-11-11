import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { EXAMPLE_TASKS, readSettings, readBody } from '../index.js';
import { normalizeTask } from '../lib/store.js';
import { verdictOf } from '../lib/verify.js';

test('nothing is preconfigured', () => {
  const settings = readSettings({});
  assert.equal(settings.student, null);
  assert.equal(settings.reviewer, null);
  assert.equal(settings.judge, null);
  assert.equal(settings.repeats, 3);
  assert.equal(settings.target, '');
  assert.equal(readSettings({ target: ' Qwen-Coding ' }).target, 'qwen-coding');
  assert.equal(readSettings({ target: '../escape' }).target, '');
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(patch, /^\s*(studentModel|reviewerModel|judgeModel|studentProvider|reviewerProvider):/m);
});

test('settings are clamped and a model needs both parts', () => {
  const settings = readSettings({ studentProvider: 'p', studentModel: '', reviewerProvider: ' p ', reviewerModel: ' m ', repeats: 99, maxEdits: 0, tokenBudget: -5, costCeiling: 0.2, enabled: false });
  assert.equal(settings.student, null);
  assert.deepEqual(settings.reviewer, { provider: 'p', model: 'm' });
  assert.equal(settings.repeats, 5);
  assert.equal(settings.maxEdits, 1);
  assert.equal(settings.tokenBudget, 0);
  assert.equal(settings.costCeiling, 1);
  assert.equal(settings.enabled, false);
});

test('the example tasks are valid, cover all three groups, and their checks can pass', () => {
  const tasks = EXAMPLE_TASKS.map(normalizeTask);
  assert.ok(tasks.every(Boolean));
  assert.deepEqual([...new Set(tasks.map((task) => task.split))].sort(), ['check', 'guard', 'learn']);
  assert.ok(tasks.every((task) => task.checks.length > 0));
  const answers = {
    'example-units': '625 g',
    'example-json': '{"city": "Tokyo", "country": "Japan"}',
    'example-steps': '12:15',
    'example-list': '{"primes": [2, 3, 5, 7, 11, 13, 17, 19]}',
    'example-plain': '42',
    'example-short': 'Jupiter.',
  };
  for (const task of tasks) assert.equal(verdictOf(task.checks, { answer: answers[task.id] }).status, 'PASS', task.id);
  assert.equal(verdictOf(tasks.find((task) => task.id === 'example-short').checks, { answer: 'It is Jupiter, of course.' }).status, 'FAIL');
});

test('request bodies must be small JSON objects', async () => {
  assert.deepEqual(await readBody(Readable.from([Buffer.from('{"action":"measure"}')])), { action: 'measure' });
  assert.equal(await readBody(Readable.from([Buffer.from('[1,2]')])), undefined);
  assert.equal(await readBody(Readable.from([Buffer.from('not json')])), undefined);
  assert.equal(await readBody(Readable.from([Buffer.alloc(70 * 1024, 0x61)])), undefined);
});
