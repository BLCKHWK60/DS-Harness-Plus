/**
 * Item 6: the five "When" choices of the Schedule form give the app's exact timing (HH:mm:ss, sorted weekdays,
 * every_seconds = hours * 3600), a past "Once" is refused, and the words match the Automations list (recur.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { clockOf, planOf, previewOf, zonedEpoch, WHEN_WORDS } from '../lib/when.js';
import { describe } from '../lib/recur.js';

const NOW = Date.parse('2026-11-21T10:00:00Z'); // a Saturday

test('times always go to the app as HH:mm:ss', () => {
  assert.equal(clockOf('9:05'), '09:05:00');
  assert.equal(clockOf('09:05'), '09:05:00');
  assert.equal(clockOf('23:59:59'), '23:59:59');
  assert.equal(clockOf('24:00'), undefined);
  assert.equal(clockOf('9 am'), undefined);
});

test('every choice gives the app\'s exact timing', () => {
  assert.deepEqual(planOf({ kind: 'daily', time: '08:30' }, 'Europe/Paris', NOW).timing, { kind: 'daily', daily: { time: '08:30:00', time_zone: 'Europe/Paris' } });
  assert.deepEqual(planOf({ kind: 'weekdays', time: '09:00' }, 'UTC', NOW).timing, { kind: 'weekly', weekly: { time: '09:00:00', time_zone: 'UTC', weekdays: [1, 2, 3, 4, 5] } });
  assert.deepEqual(planOf({ kind: 'days', time: '07:00', days: [5, 1, 3, 3, 9] }, 'UTC', NOW).timing, { kind: 'weekly', weekly: { time: '07:00:00', time_zone: 'UTC', weekdays: [1, 3, 5] } });
  assert.deepEqual(planOf({ kind: 'days', time: '07:00', days: [1, 2, 3, 4, 5, 6, 7] }, 'UTC', NOW).timing, { kind: 'daily', daily: { time: '07:00:00', time_zone: 'UTC' } }, 'all seven days is every day');
  assert.deepEqual(planOf({ kind: 'hours', hours: 3 }, 'UTC', NOW).timing, { kind: 'every', every_seconds: 10800 });
  assert.deepEqual(planOf({ kind: 'once', date: '2026-11-24', time: '09:00' }, 'Europe/Paris', NOW).timing, { kind: 'at', at: { date: '2026-11-24', time: '09:00:00', time_zone: 'Europe/Paris' } });
});

test('what is wrong is named, never sent to the app', () => {
  assert.equal(planOf({ kind: 'once', date: '2026-11-21', time: '09:00' }, 'UTC', NOW).problem, 'past');
  assert.equal(planOf({ kind: 'once', date: '2026-02-30', time: '09:00' }, 'UTC', NOW).problem, 'gap');
  assert.equal(planOf({ kind: 'once', date: '', time: '09:00' }, 'UTC', NOW).problem, 'date');
  assert.equal(planOf({ kind: 'days', time: '09:00', days: [] }, 'UTC', NOW).problem, 'days');
  assert.equal(planOf({ kind: 'hours', hours: 0 }, 'UTC', NOW).problem, 'hours');
  assert.equal(planOf({ kind: 'hours', hours: 25 }, 'UTC', NOW).problem, 'hours');
  assert.equal(planOf({ kind: 'daily', time: '25:00' }, 'UTC', NOW).problem, 'time');
  assert.equal(planOf({ kind: 'daily', time: '09:00' }, 'Mars/Base', NOW).problem, 'zone');
  assert.equal(planOf({ kind: 'monthly' }, 'UTC', NOW).problem, 'kind');
  // A time the clocks skip (Paris, 29 March 2026, 02:30) does not exist.
  assert.equal(zonedEpoch('2026-03-29', '02:30:00', 'Europe/Paris'), undefined);
  assert.equal(new Date(zonedEpoch('2026-11-24', '09:00:00', 'Europe/Paris')).toISOString(), '2026-11-24T08:00:00.000Z');
});

test('the words match the Automations list, and the next run is right', () => {
  for (const when of [{ kind: 'daily', time: '08:30' }, { kind: 'weekdays', time: '09:00' }, { kind: 'days', time: '18:15', days: [2, 4] }]) {
    const plan = planOf(when, 'UTC', NOW);
    const preview = previewOf(when, 'UTC', 'en', NOW);
    assert.equal(preview.words, describe(plan.record, { localZone: 'UTC' }));
  }
  const weekday = previewOf({ kind: 'weekdays', time: '09:00' }, 'UTC', 'en', NOW);
  assert.equal(weekday.next, Date.parse('2026-11-23T09:00:00Z'), 'Saturday -> Monday 09:00');
  assert.match(weekday.line, /^Every weekday at 09:00 · next: Mon 23 Nov, 09:00$/);
  assert.equal(previewOf({ kind: 'hours', hours: 1 }, 'UTC', 'en', NOW).line, 'Every hour, first in 1 hour');
  assert.equal(previewOf({ kind: 'hours', hours: 1 }, 'UTC', 'en', NOW).next, NOW + 3600000);
  assert.match(previewOf({ kind: 'once', date: '2026-11-24', time: '09:00' }, 'UTC', 'en', NOW).line, /^Once, Tue 24 Nov, 09:00$/);
  assert.equal(previewOf({ kind: 'once', date: '2026-11-20', time: '09:00' }, 'UTC', 'en', NOW).line, 'That time has passed. Pick a later one.');
});

test('a page that reports Chinese gets the English words (decision 28)', () => {
  assert.deepEqual(Object.keys(WHEN_WORDS), ['en'], 'no Chinese table');
  assert.equal(previewOf({ kind: 'weekdays', time: '09:00' }, 'UTC', 'zh', NOW).line, previewOf({ kind: 'weekdays', time: '09:00' }, 'UTC', 'en', NOW).line);
  assert.equal(previewOf({ kind: 'days', time: '09:00', days: [] }, 'UTC', 'zh', NOW).line, 'Pick at least one day.');
});
