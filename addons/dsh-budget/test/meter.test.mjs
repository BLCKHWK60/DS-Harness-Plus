import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkRaise, createMeter, describe, missionWords, openRecord, readLimits } from '../lib/meter.js';

function guard(raw, start = Date.UTC(2026, 10, 12, 9)) {
  let clock = start;
  const record = openRecord('');
  const meter = createMeter({ limits: () => readLimits(raw), record, now: () => clock });
  return { meter, record, tick: (ms) => { clock += ms; }, at: () => clock };
}

test('limits are whole numbers and 0 or nonsense means no limit', () => {
  assert.deepEqual(readLimits({ maxSteps: '12', maxTokens: -5, maxMinutes: 'x', maxRepeats: 2.9, enabled: false }),
    { enabled: false, maxSteps: 12, maxHelperSteps: 0, maxLongSteps: 0, maxLongTokens: 0, maxTokens: 0, startingTokens: false, maxMinutes: 0, maxRepeats: 2, dayTokens: 0 });
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
    assert.deepEqual(record.biggest(clock), { count: 2, steps: 12, helperSteps: 0, tokens: 900, minutes: 3 });
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
  assert.equal(describe({ limit: 'steps', used: 300, max: 300 }), 'This run reached its limit of 300 steps.');
  assert.equal(describe({ limit: 'tokens', used: 5000000, max: 5000000 }), 'This run reached its limit of 5,000,000 tokens.');
  assert.equal(describe({ limit: 'day', used: 9, max: 9 }), "Today's limit of 9 tokens is used up.");
});

test('helpers have their own allowance, so a long run is not cut by the conversation\'s limit (review H13)', () => {
  const { meter } = guard({ maxSteps: 5, maxHelperSteps: 50 });
  meter.startTask('s');
  for (let i = 0; i < 40; i += 1) meter.step('s', true);
  assert.equal(meter.check('s'), null, '40 helper steps are fine although the conversation\'s own limit is 5');
  for (let i = 0; i < 4; i += 1) meter.step('s');
  assert.equal(meter.check('s'), null);
  meter.step('s');
  assert.deepEqual(meter.check('s'), { limit: 'steps', used: 5, max: 5, first: true }, 'the conversation\'s own steps still stop at their limit');
  meter.startTask('s');
  for (let i = 0; i < 50; i += 1) meter.step('s', true);
  assert.deepEqual(meter.check('s'), { limit: 'helperSteps', used: 50, max: 50, first: true });
  assert.match(describe({ limit: 'helperSteps', used: 50, max: 50 }), /helpers reached their limit of 50 steps/);
});

test('a helper allowance below the conversation limit is lifted to it; 0 keeps the old shared count; no step limit means no helper limit', () => {
  const lifted = guard({ maxSteps: 100, maxHelperSteps: 20 }).meter;
  lifted.startTask('a');
  for (let i = 0; i < 99; i += 1) lifted.step('a', true);
  assert.equal(lifted.check('a'), null);
  lifted.step('a', true);
  assert.equal(lifted.check('a').limit, 'helperSteps');
  assert.equal(lifted.check('a').max, 100);

  const shared = guard({ maxSteps: 10, maxHelperSteps: 0 }).meter;
  shared.startTask('b');
  for (let i = 0; i < 6; i += 1) shared.step('b', true);
  for (let i = 0; i < 4; i += 1) shared.step('b');
  assert.deepEqual(shared.check('b'), { limit: 'steps', used: 10, max: 10, first: true }, 'with no separate allowance helpers count in the one limit, as before');

  const none = guard({ maxSteps: 0, maxHelperSteps: 50 }).meter;
  none.startTask('c');
  for (let i = 0; i < 500; i += 1) none.step('c', true);
  assert.equal(none.check('c'), null);
});

test('the record keeps the conversation\'s steps and its helpers\' apart', () => {
  const { meter, record, at } = guard({ maxSteps: 300, maxHelperSteps: 1500 });
  meter.startTask('r');
  meter.step('r'); meter.step('r', true); meter.step('r', true);
  assert.equal(meter.current('r').helperSteps, 2);
  meter.endTask('r');
  const big = record.biggest(at());
  assert.equal(big.steps, 1);
  assert.equal(big.helperSteps, 2);
});

test('a Long run has its own allowance (when the limits are the built-in ones), and the ordinary limits come back when it ends', () => {
  const { meter } = guard({ maxSteps: 300, maxHelperSteps: 1500, maxTokens: 20000000, maxLongSteps: 5000, maxLongTokens: 60000000 });
  meter.startTask('m');
  for (let i = 0; i < 2000; i += 1) meter.step('m', true, 'run-1');
  meter.usage('m', 12000000, 'run-1');
  assert.equal(meter.check('m').limit, 'helperSteps', 'an ordinary task stops here');
  assert.equal(meter.check('m', 'run-1'), null, 'a Long run goes on: 2,000 steps and 12 million tokens are inside its allowance');
  meter.usage('m', 50000000, 'run-1');
  assert.deepEqual(meter.check('m', 'run-1'), { limit: 'tokens', used: 62000000, max: 60000000, first: false });
  meter.startTask('n');
  for (let i = 0; i < 5000; i += 1) meter.step('n', true, 'run-2');
  assert.equal(meter.check('n', 'run-2').limit, 'steps');
  assert.equal(meter.check('n', 'run-2').max, 5000);
});

test('a Long run\'s steps have their own allowance whatever step limit is saved; a lower saved token limit still wins', () => {
  // The user saved 100 steps and 5 million tokens (built-in: 300 and 20 million).
  const low = guard({ maxSteps: 100, maxHelperSteps: 1500, maxTokens: 5000000, maxLongSteps: 5000, maxLongTokens: 60000000 }).meter;
  low.startTask('a');
  for (let i = 0; i < 4999; i += 1) low.step('a', i % 2 === 0, 'r');
  assert.equal(low.check('a', 'r'), null, 'the saved 100 per task does not cap a whole Long run');
  low.step('a', false, 'r');
  assert.deepEqual(low.check('a', 'r'), { limit: 'steps', used: 5000, max: 5000, first: true }, 'all requests together stop at the Long run\'s own 5,000, helpers included');
  assert.equal(low.check('a', '').limit, 'steps', 'an ordinary task still stops at the saved 100');
  assert.deepEqual(low.longAllowance(), { enabled: true, steps: 5000, tokens: 5000000, dayTokens: 0 });
  assert.match(describe({ limit: 'steps', max: 5000 }, true), /^This Mission reached its own limit of 5,000 steps\.$/);
  low.startTask('b');
  low.usage('b', 5000000, 'r2');
  assert.equal(low.check('b', 'r2').limit, 'tokens');
  assert.equal(low.check('b', 'r2').max, 5000000);
  // A saved limit above the allowance also stays (the allowance only replaces the built-in default).
  const high = guard({ maxSteps: 9000, maxHelperSteps: 1500, maxTokens: 90000000, maxLongSteps: 5000, maxLongTokens: 60000000 }).meter;
  high.startTask('c');
  for (let i = 0; i < 6000; i += 1) high.step('c', true, 'r3');
  high.usage('c', 70000000, 'r3');
  assert.equal(high.check('c', 'r3'), null);
});

test('the Long run allowance counts across the whole run, not per round', () => {
  const { meter } = guard({ maxSteps: 300, maxHelperSteps: 1500, maxTokens: 20000000, maxLongSteps: 5000, maxLongTokens: 60000000 });
  // 30 rounds of 200 steps and 3 million tokens each: every round alone is far inside the allowance, together they are not.
  let stopped = 0;
  for (let round = 1; round <= 30 && !stopped; round += 1) {
    meter.startTask('w');
    for (let i = 0; i < 200 && !stopped; i += 1) {
      if (meter.check('w', 'run-w')) stopped = round;
      else {
        meter.step('w', i % 2 === 0, 'run-w');
        if (i % 20 === 0) meter.usage('w', 300000, 'run-w');
      }
    }
    meter.endTask('w');
  }
  assert.ok(stopped > 1 && stopped <= 21, `the run was stopped in round ${stopped}, by the total, not at the first round`);
  // A new run starts counting again from nothing.
  meter.startTask('w');
  assert.equal(meter.check('w', 'run-w-2'), null);
});

test('without a Long run working (none, paused or an ordinary Mission run) the ordinary limits apply, not the allowance', () => {
  const { meter } = guard({ maxSteps: 300, maxHelperSteps: 1500, maxTokens: 20000000, maxLongSteps: 5000, maxLongTokens: 60000000 });
  meter.startTask('p');
  for (let i = 0; i < 400; i += 1) meter.step('p', false, '');
  assert.equal(meter.check('p', '').limit, 'steps', 'no run key: the ordinary 300');
  assert.equal(meter.check('p', false).limit, 'steps');
  meter.startTask('q');
  meter.usage('q', 25000000, '');
  assert.equal(meter.check('q', '').limit, 'tokens', 'no allowance of 60 million for a task that is not a Long run');
});

test('helpers\' own allowance (1,500) never lifts a step limit the user saved', () => {
  // Built-in step limit: helpers have their own allowance.
  const own = guard({ maxSteps: 300, maxHelperSteps: 1500 }).meter;
  own.startTask('a');
  for (let i = 0; i < 1000; i += 1) own.step('a', true);
  assert.equal(own.check('a'), null);
  // The user saved a lower step limit: helpers share it.
  const saved = guard({ maxSteps: 100, maxHelperSteps: 1500 }).meter;
  saved.startTask('b');
  for (let i = 0; i < 100; i += 1) saved.step('b', true);
  assert.deepEqual(saved.check('b'), { limit: 'steps', used: 100, max: 100, first: true });
  // The user saved a helper limit as well: that one is theirs.
  const both = guard({ maxSteps: 100, maxHelperSteps: 400 }).meter;
  both.startTask('c');
  for (let i = 0; i < 399; i += 1) both.step('c', true);
  assert.equal(both.check('c'), null);
  both.step('c', true);
  assert.equal(both.check('c').limit, 'helperSteps');
});

test('a Long run never gets a lower limit than an ordinary task, and no limit stays no limit', () => {
  const low = guard({ maxSteps: 300, maxTokens: 5000000, maxLongSteps: 100, maxLongTokens: 1000 }).meter;
  low.startTask('a');
  for (let i = 0; i < 200; i += 1) low.step('a', false, 'k');
  low.usage('a', 2000000, 'k');
  assert.equal(low.check('a', 'k'), null, 'the Long run allowance is never below the ordinary one');
  const none = guard({ maxSteps: 0, maxTokens: 0, maxLongSteps: 100, maxLongTokens: 100 }).meter;
  none.startTask('b');
  for (let i = 0; i < 500; i += 1) none.step('b', true);
  none.usage('b', 9000000);
  assert.equal(none.check('b', true), null);
  assert.equal(none.check('b'), null);
  const day = guard({ maxLongSteps: 5000, dayTokens: 1000 }).meter;
  day.startTask('c');
  day.usage('c', 1000);
  assert.equal(day.check('c', true).limit, 'day', 'the daily limit still holds during a Long run');
});

test('the repeat check still stops a loop during a Long run', () => {
  const { meter } = guard({ maxRepeats: 3 });
  meter.startTask('l');
  for (let i = 0; i < 3; i += 1) assert.equal(meter.tool('l', 'helper', 'bash', { c: 1 }), undefined);
  assert.match(meter.tool('l', 'helper', 'bash', { c: 1 }), /same bash call/);
  assert.equal(meter.check('l', true).limit, 'repeats');
});

test('the installer\'s starting token limit gets the Long run allowance; the same number saved by the person wins', async () => {
  const { readFileSync } = await import('node:fs');
  const row = JSON.parse(readFileSync(new URL('../../../new-install-defaults.json', import.meta.url), 'utf8')).rows.find((r) => r.id === 'budget');
  assert.equal(row.config.maxTokens, 5000000);
  assert.equal(row.config.startingTokens, true, 'the installer marks its starting value');
  const base = { maxSteps: 300, maxHelperSteps: 1500, maxLongSteps: 5000, maxLongTokens: 60000000 };
  // Fresh install, value never touched: the Long run goes past 5 million, up to 60 million; an ordinary task still stops at 5 million.
  const fresh = guard({ ...base, ...row.config }).meter;
  fresh.startTask('f');
  fresh.usage('f', 12000000, 'run');
  assert.equal(fresh.check('f', 'run'), null);
  assert.equal(fresh.check('f', '').limit, 'tokens');
  fresh.usage('f', 50000000, 'run');
  assert.equal(fresh.check('f', 'run').max, 60000000);
  // The person saved 5 million themselves (the Budget page clears the mark): it holds in a Long run.
  const saved = guard({ ...base, maxTokens: 5000000, startingTokens: false }).meter;
  saved.startTask('s');
  saved.usage('s', 5000000, 'run');
  assert.deepEqual(saved.check('s', 'run'), { limit: 'tokens', used: 5000000, max: 5000000, first: true });
});

test('saving the token limit on the Budget page clears the installer\'s mark', async () => {
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), /'maxTokens' in values\) values = \{ \.\.\.values, startingTokens: false \}/);
});

test('stage C: endRun gives back the whole-run count, and restoreRun puts it back (adding steps counted since)', () => {
  const { meter } = guard({ maxSteps: 50, maxHelperSteps: 1500, maxTokens: 20000000, maxLongSteps: 100, maxLongTokens: 60000000 });
  meter.startTask('m');
  for (let i = 0; i < 70; i += 1) meter.step('m', i % 2 === 0, 'run-1');
  meter.usage('m', 1000, 'run-1');
  const kept = meter.endRun('m');
  assert.deepEqual(kept, { key: 'run-1', steps: 35, helperSteps: 35, tokens: 1000 });
  assert.equal(meter.endRun('m'), null, 'nothing is left after the end');
  meter.startTask('m');
  for (let i = 0; i < 20; i += 1) meter.step('m', false, 'run-1');
  meter.restoreRun('m', kept);
  assert.equal(meter.check('m', 'run-1'), null, '90 of 100');
  for (let i = 0; i < 10; i += 1) meter.step('m', false, 'run-1');
  assert.equal(meter.check('m', 'run-1').limit, 'steps', '100 of 100 over the run, across the continue');
  meter.restoreRun('m', null);
  meter.restoreRun('x', kept);
  assert.equal(meter.endRun('x').steps, 35, 'a run with no count yet gets the kept one');
});

test('stage E: stop texts saved as "Long run" are shown with the name Mission', () => {
  assert.equal(missionWords('This Long run reached its own limit of 5,000 steps.'), 'This Mission reached its own limit of 5,000 steps.');
  assert.equal(missionWords('This run reached its limit of 300 steps.'), 'This run reached its limit of 300 steps.');
  assert.equal(missionWords(undefined), '');
});

test('stage E: a Mission allowance is raised only upwards, and only up to 50,000 steps or 500,000,000 tokens', () => {
  const now = { steps: 5000, tokens: 60000000 };
  assert.deepEqual(checkRaise({ limit: 'steps', to: 7500 }, now), { ok: true, key: 'maxLongSteps', from: 5000, to: 7500 });
  assert.deepEqual(checkRaise({ limit: 'tokens', to: 90000000 }, now), { ok: true, key: 'maxLongTokens', from: 60000000, to: 90000000 });
  assert.equal(checkRaise({ limit: 'steps', to: 5000 }, now).ok, false, 'not higher');
  assert.equal(checkRaise({ limit: 'steps', to: 50001 }, now).ok, false, 'past the most');
  assert.equal(checkRaise({ limit: 'tokens', to: 500000001 }, now).ok, false, 'past the most');
  assert.equal(checkRaise({ limit: 'minutes', to: 10 }, now).ok, false, 'only steps or tokens');
  assert.equal(checkRaise({ limit: 'steps', to: 'lots' }, now).ok, false);
  assert.equal(checkRaise({ limit: 'steps', to: 6000 }, { steps: 0, tokens: 0 }).ok, false, 'no limit: nothing to raise');
});

test('stage E: under a stop by a Mission\'s allowance, the card says to allow or raise it and press Resume, not to send a message', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(source, /const BUDGET_TURN_HINT = 'The Mission is paused\. Allow the higher limit in the Mission\\'s card above the chat box, or raise "Steps in a Mission" in Settings → Budget guard, then press Resume\.'/);
  assert.match(source, /stop\?\.mission === true \|\| \/\^This \(Mission\|Long run\) reached\//);
  assert.match(source, /isMissionStop\(stop\)\s*\?\s*BUDGET_TURN_HINT/);
});
