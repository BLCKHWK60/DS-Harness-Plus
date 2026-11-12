import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createMeter, describe, openRecord, readLimits } from '../lib/meter.js';

function guard(raw, start = Date.UTC(2026, 10, 12, 9)) {
  let clock = start;
  const record = openRecord('');
  const meter = createMeter({ limits: () => readLimits(raw), record, now: () => clock });
  return { meter, record, tick: (ms) => { clock += ms; }, at: () => clock };
}

test('limits are whole numbers and 0 or nonsense means no limit', () => {
  assert.deepEqual(readLimits({ maxSteps: '12', maxTokens: -5, maxMinutes: 'x', maxRepeats: 2.9, enabled: false }),
    { enabled: false, maxSteps: 12, maxTokens: 0, maxMinutes: 0, maxRepeats: 2, dayTokens: 0 });
});

test('a task stops at its step limit and a new message starts fresh', () => {
  const { meter } = guard({ maxSteps: 3 });
  meter.startTask('s');
  for (let i = 0; i < 3; i += 1) {
    assert.equal(meter.check('s'), null);
    meter.step('s');
  }
  assert.deepEqual(meter.check('s'), { limit: 'steps', used: 3, max: 3, first: true });
  assert.equal(meter.check('s').first, false);
  meter.endTask('s');
  meter.startTask('s');
  assert.equal(meter.check('s'), null);
});

test('helpers count towards the conversation that started them', () => {
  const { meter } = guard({ maxTokens: 1000 });
  meter.startTask('main');
  meter.usage('main', 400);
  meter.usage('main', 500); // a helper's request, counted under the same conversation
  assert.equal(meter.check('main'), null);
  meter.usage('main', 100);
  assert.equal(meter.check('main').limit, 'tokens');
});

test('minutes and the daily total', () => {
  const { meter, tick, record, at } = guard({ maxMinutes: 10, dayTokens: 5000 });
  meter.startTask('a');
  tick(9 * 60000);
  assert.equal(meter.check('a'), null);
  tick(60000);
  assert.equal(meter.check('a').limit, 'minutes');

  meter.startTask('b');
  meter.usage('b', 5000);
  assert.equal(meter.check('b').limit, 'day');
  tick(24 * 60 * 60000);
  meter.startTask('b');
  assert.equal(record.today(at()), 0);
  assert.equal(meter.check('b'), null);
});

test('the same tool call in a row is a loop; a different call in between is not', () => {
  const { meter } = guard({ maxRepeats: 3 });
  meter.startTask('s');
  for (let i = 0; i < 3; i += 1) assert.equal(meter.tool('s', 's', 'bash', { command: 'ls' }), undefined);
  assert.equal(meter.tool('s', 's', 'bash', { command: 'pwd' }), undefined);
  for (let i = 0; i < 3; i += 1) assert.equal(meter.tool('s', 's', 'bash', { command: 'ls' }), undefined);
  assert.equal(meter.tool('s', 'helper-1', 'bash', { command: 'ls' }), undefined);
  assert.match(meter.tool('s', 's', 'bash', { command: 'ls' }), /4 times in a row/);
  const hit = meter.check('s');
  assert.equal(hit.limit, 'repeats');
  assert.match(describe(hit), /same bash call 4 times in a row/);
});

test('switched off, nothing is stopped', () => {
  const { meter } = guard({ enabled: false, maxSteps: 1, maxRepeats: 1 });
  meter.startTask('s');
  meter.step('s');
  meter.step('s');
  assert.equal(meter.check('s'), null);
  assert.equal(meter.tool('s', 's', 'x', {}), undefined);
  assert.equal(meter.tool('s', 's', 'x', {}), undefined);
});

test('finished tasks are remembered for "your biggest task", and saved', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-budget-'));
  try {
    const file = join(root, 'budget', 'budget.json');
    let clock = Date.UTC(2026, 10, 12, 9);
    const record = openRecord(file);
    const meter = createMeter({ limits: () => readLimits({}), record, now: () => clock });
    for (const [steps, tokens] of [[4, 900], [12, 300]]) {
      meter.startTask('s');
      for (let i = 0; i < steps; i += 1) meter.step('s');
      meter.usage('s', tokens);
      clock += 3 * 60000;
      meter.endTask('s');
    }
    assert.deepEqual(record.biggest(clock), { count: 2, steps: 12, tokens: 900, minutes: 3 });
    record.addStop({ sessionId: 's', at: clock, limit: 'steps', used: 3, max: 3, text: 'x' });
    record.flush();
    assert.equal(existsSync(file), true);
    const again = openRecord(file);
    assert.equal(again.biggest(clock).steps, 12);
    assert.equal(again.stops()[0].sessionId, 's');
    assert.equal(again.biggest(clock + 31 * 24 * 60 * 60000).count, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a stop reads as one plain sentence', () => {
  assert.equal(describe({ limit: 'steps', used: 300, max: 300 }), 'This task reached its limit of 300 steps.');
  assert.equal(describe({ limit: 'tokens', used: 5000000, max: 5000000 }), 'This task reached its limit of 5,000,000 tokens.');
  assert.equal(describe({ limit: 'day', used: 9, max: 9 }), "Today's limit of 9 tokens is used up.");
});
