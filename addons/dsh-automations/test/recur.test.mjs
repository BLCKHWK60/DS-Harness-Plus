import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describe, nextAfter, occurrences } from '../lib/recur.js';

// Expected times are worked out from the app's scheduler rules (dsh-schedule domain.ts and
// dsh-util-time cron.ts / rrule.ts / instant.ts): skipped local times do not run, repeated ones
// run at the earlier instant.
const T = (s) => Date.parse(s);
const iso = (list) => list?.map((t) => new Date(t).toISOString());
const S = '2026-01-01T00:00:00.000Z'; // a scheduledAt for rules that do not use it
const runs = (entry, from, to, opts) => iso(occurrences(entry, T(from), T(to), opts));

test('one-time tasks give their single time when in range', () => {
  const at = { kind: 'at', scheduledAt: '2026-11-17T09:00:00.000Z', status: 'active' };
  assert.deepEqual(runs(at, '2026-11-17T00:00Z', '2026-11-18T00:00Z'), ['2026-11-17T09:00:00.000Z']);
  assert.deepEqual(runs(at, '2026-11-17T09:00Z', '2026-11-18T00:00Z'), []); // strictly after from
  assert.deepEqual(runs(at, '2026-11-16T00:00Z', '2026-11-17T09:00Z'), ['2026-11-17T09:00:00.000Z']); // at or before to
  const after = { kind: 'after', afterSeconds: 600, scheduledAt: '2026-11-17T09:10:00.000Z' };
  assert.equal(nextAfter(after, T('2026-11-17T09:00Z')), T('2026-11-17T09:10Z'));
  assert.equal(nextAfter(after, T('2026-11-17T09:10Z')), undefined);
});

test('every: fixed rate anchored on scheduledAt, never before createdAt', () => {
  const every = { kind: 'every', everySeconds: 300, scheduledAt: '2026-11-17T09:02:00.000Z' };
  assert.deepEqual(runs(every, '2026-11-17T09:00Z', '2026-11-17T09:20Z'),
    ['2026-11-17T09:02:00.000Z', '2026-11-17T09:07:00.000Z', '2026-11-17T09:12:00.000Z', '2026-11-17T09:17:00.000Z']);
  // The app derives the next target as occurrence + interval, so the grid also holds for past times.
  assert.deepEqual(runs(every, '2026-11-17T08:50Z', '2026-11-17T09:00Z'), ['2026-11-17T08:52:00.000Z', '2026-11-17T08:57:00.000Z']);
  const made = { ...every, createdAt: '2026-11-17T08:57:00.000Z' }; // created at 08:57, first run 09:02
  assert.deepEqual(runs(made, '2026-11-17T08:50Z', '2026-11-17T09:03Z'), ['2026-11-17T09:02:00.000Z']);
  assert.equal(nextAfter(every, T('2026-11-17T09:02Z')), T('2026-11-17T09:07Z'));
});

test('max limits the list', () => {
  const every = { kind: 'every', everySeconds: 60, scheduledAt: '2026-11-17T09:00:00.000Z' };
  assert.equal(occurrences(every, T('2026-11-17T00:00Z'), T('2026-11-18T00:00Z')).length, 500);
  assert.deepEqual(runs(every, '2026-11-17T09:00Z', '2026-11-18T00:00Z', { max: 2 }),
    ['2026-11-17T09:01:00.000Z', '2026-11-17T09:02:00.000Z']);
  const cron = { kind: 'cron', expression: '* * * * *', timeZone: 'UTC', scheduledAt: S };
  assert.equal(occurrences(cron, T('2026-11-17T00:00Z'), T('2027-11-18T00:00Z'), { max: 3 }).length, 3);
});

test('daily across the Berlin clock changes: the skipped day does not run, the repeated time runs once', () => {
  const daily = { kind: 'daily', time: '02:30:00.000', timeZone: 'Europe/Berlin', scheduledAt: S };
  assert.deepEqual(runs(daily, '2026-03-27T12:00Z', '2026-03-31T12:00Z'),
    ['2026-03-28T01:30:00.000Z', '2026-03-30T00:30:00.000Z', '2026-03-31T00:30:00.000Z']); // 29 March skipped
  assert.deepEqual(runs(daily, '2026-10-24T12:00Z', '2026-10-27T00:00Z'),
    ['2026-10-25T00:30:00.000Z', '2026-10-26T01:30:00.000Z']); // 25 October: the earlier 02:30 (CEST)
  const morning = { ...daily, time: '08:30:00.000' };
  assert.deepEqual(runs(morning, '2026-03-28T00:00Z', '2026-03-30T00:00Z'), ['2026-03-28T07:30:00.000Z', '2026-03-29T06:30:00.000Z']);
  assert.equal(nextAfter(daily, T('2026-03-28T01:30Z')), T('2026-03-30T00:30Z'));
});

test('weekly across the New York clock changes', () => {
  const sunday = { kind: 'weekly', time: '02:30:00.000', timeZone: 'America/New_York', weekdays: [7], scheduledAt: S };
  assert.deepEqual(runs(sunday, '2026-03-01T00:00Z', '2026-03-16T00:00Z'),
    ['2026-03-01T07:30:00.000Z', '2026-03-15T06:30:00.000Z']); // 8 March 02:30 does not exist
  const early = { ...sunday, time: '01:30:00.000' };
  assert.deepEqual(runs(early, '2026-10-25T00:00Z', '2026-11-09T00:00Z'),
    ['2026-10-25T05:30:00.000Z', '2026-11-01T05:30:00.000Z', '2026-11-08T06:30:00.000Z']); // 1 Nov: earlier 01:30 (EDT)
  const two = { kind: 'weekly', time: '09:00:00.000', timeZone: 'UTC', weekdays: [1, 4], scheduledAt: S };
  assert.deepEqual(runs(two, '2026-11-16T00:00Z', '2026-11-24T00:00Z'),
    ['2026-11-16T09:00:00.000Z', '2026-11-19T09:00:00.000Z', '2026-11-23T09:00:00.000Z']);
});

test('cron: Vixie day rule, ranges, steps, lists, Sunday as 0 or 7', () => {
  const cron = (expression, timeZone = 'UTC') => ({ kind: 'cron', expression, timeZone, scheduledAt: S });
  // Both day fields restricted: the 13th OR any Friday.
  assert.deepEqual(runs(cron('0 9 13 * 5'), '2026-12-01T00:00Z', '2027-01-01T00:00Z'),
    ['04', '11', '13', '18', '25'].map((d) => `2026-12-${d}T09:00:00.000Z`));
  // Day-of-month starts with '*': both must match (odd days that are Mondays).
  assert.deepEqual(runs(cron('0 9 */2 * 1'), '2026-11-01T00:00Z', '2026-12-31T00:00Z'),
    ['2026-11-09T09:00:00.000Z', '2026-11-23T09:00:00.000Z', '2026-12-07T09:00:00.000Z', '2026-12-21T09:00:00.000Z']);
  assert.deepEqual(runs(cron('0 9 * * 1-5'), '2026-11-20T00:00Z', '2026-11-24T00:00Z'),
    ['2026-11-20T09:00:00.000Z', '2026-11-23T09:00:00.000Z']);
  assert.deepEqual(runs(cron('0 9 * * 7'), '2026-11-20T00:00Z', '2026-11-24T00:00Z'), runs(cron('0 9 * * 0'), '2026-11-20T00:00Z', '2026-11-24T00:00Z'));
  assert.deepEqual(runs(cron('0,30 8-17/4 * * *'), '2026-11-17T00:00Z', '2026-11-17T23:59Z'),
    ['08:00', '08:30', '12:00', '12:30', '16:00', '16:30'].map((t) => `2026-11-17T${t}:00.000Z`));
  assert.equal(occurrences(cron('*/15 * * * *'), T('2026-11-17T00:00Z'), T('2026-11-17T01:00Z')).length, 4);
  // A time skipped by the clock change does not run.
  assert.deepEqual(runs(cron('30 2 * * *', 'Europe/Berlin'), '2026-03-28T00:00Z', '2026-03-30T12:00Z'),
    ['2026-03-28T01:30:00.000Z', '2026-03-30T00:30:00.000Z']);
  // Never matches: 30 February.
  assert.equal(nextAfter(cron('0 0 30 2 *'), T('2026-11-17T00:00Z')), undefined);
});

test('rrule: BYDAY=1MO, BYMONTHDAY=10, BYSETPOS, defaults from DTSTART', () => {
  const rr = (rrule) => ({ kind: 'rrule', rrule, scheduledAt: S });
  assert.deepEqual(runs(rr('DTSTART;TZID=Europe/Berlin:20260105T090000\nRRULE:FREQ=MONTHLY;BYDAY=1MO'), '2026-01-01T00:00Z', '2026-05-01T00:00Z'),
    ['2026-01-05T08:00:00.000Z', '2026-02-02T08:00:00.000Z', '2026-03-02T08:00:00.000Z', '2026-04-06T07:00:00.000Z']);
  assert.deepEqual(runs(rr('DTSTART;TZID=Europe/Berlin:20260110T090000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=10'), '2026-02-01T00:00Z', '2026-05-01T00:00Z'),
    ['2026-02-10T08:00:00.000Z', '2026-03-10T08:00:00.000Z', '2026-04-10T07:00:00.000Z']);
  // DTSTART day 31: months without a 31st are skipped (BYMONTHDAY defaults to 31).
  assert.deepEqual(runs(rr('DTSTART:20260131T090000Z\nRRULE:FREQ=MONTHLY'), '2026-01-01T00:00Z', '2026-06-01T00:00Z'),
    ['2026-01-31T09:00:00.000Z', '2026-03-31T09:00:00.000Z', '2026-05-31T09:00:00.000Z']);
  // Last weekday of the month.
  assert.deepEqual(runs(rr('DTSTART:20260101T090000Z\nRRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1'), '2026-01-01T00:00Z', '2026-04-01T00:00Z'),
    ['2026-01-30T09:00:00.000Z', '2026-02-27T09:00:00.000Z', '2026-03-31T09:00:00.000Z']);
  assert.deepEqual(runs(rr('DTSTART:20260101T090000Z\nRRULE:FREQ=MONTHLY;BYDAY=-1FR'), '2026-01-01T00:00Z', '2026-03-01T00:00Z'),
    ['2026-01-30T09:00:00.000Z', '2026-02-27T09:00:00.000Z']);
  // WEEKLY takes its weekday from DTSTART (a Tuesday); INTERVAL=2 skips every other week.
  assert.deepEqual(runs(rr('DTSTART:20261117T070000Z\nRRULE:FREQ=WEEKLY;INTERVAL=2'), '2026-11-01T00:00Z', '2026-12-20T00:00Z'),
    ['2026-11-17T07:00:00.000Z', '2026-12-01T07:00:00.000Z', '2026-12-15T07:00:00.000Z']);
  assert.deepEqual(runs(rr('DTSTART:20261117T070000Z\nRRULE:FREQ=DAILY;BYHOUR=7,19;BYMINUTE=0'), '2026-11-17T00:00Z', '2026-11-18T12:00Z'),
    ['2026-11-17T07:00:00.000Z', '2026-11-17T19:00:00.000Z', '2026-11-18T07:00:00.000Z']);
  assert.deepEqual(runs(rr('DTSTART:20240229T120000Z\nRRULE:FREQ=YEARLY'), '2024-01-01T00:00Z', '2030-01-01T00:00Z'),
    ['2024-02-29T12:00:00.000Z', '2028-02-29T12:00:00.000Z']);
});

test('rrule: HOURLY;INTERVAL=3 steps in local wall time', () => {
  const utc = { kind: 'rrule', rrule: 'DTSTART:20261117T010000Z\nRRULE:FREQ=HOURLY;INTERVAL=3', scheduledAt: S };
  assert.deepEqual(runs(utc, '2026-11-17T05:00Z', '2026-11-17T12:00Z'),
    ['2026-11-17T07:00:00.000Z', '2026-11-17T10:00:00.000Z']);
  // Berlin wall times 23:00, 02:00 (skipped by the spring change), 05:00, 08:00.
  const berlin = { kind: 'rrule', rrule: 'DTSTART;TZID=Europe/Berlin:20260328T230000\nRRULE:FREQ=HOURLY;INTERVAL=3', scheduledAt: S };
  assert.deepEqual(runs(berlin, '2026-03-28T00:00Z', '2026-03-29T06:00Z'),
    ['2026-03-28T22:00:00.000Z', '2026-03-29T03:00:00.000Z', '2026-03-29T06:00:00.000Z']);
});

test('rrule: COUNT counts real runs only; UNTIL is inclusive', () => {
  const count = { kind: 'rrule', rrule: 'DTSTART;TZID=Europe/Berlin:20260328T023000\nRRULE:FREQ=DAILY;COUNT=3', scheduledAt: S };
  assert.deepEqual(runs(count, '2026-01-01T00:00Z', '2026-12-31T00:00Z'),
    ['2026-03-28T01:30:00.000Z', '2026-03-30T00:30:00.000Z', '2026-03-31T00:30:00.000Z']);
  assert.deepEqual(runs(count, '2026-03-29T00:00Z', '2026-12-31T00:00Z'), ['2026-03-30T00:30:00.000Z', '2026-03-31T00:30:00.000Z']);
  assert.equal(nextAfter(count, T('2026-03-31T00:30Z')), undefined);
  const until = { kind: 'rrule', rrule: 'DTSTART:20261116T090000Z\nRRULE:FREQ=DAILY;UNTIL=20261118T090000Z', scheduledAt: S };
  assert.deepEqual(runs(until, '2026-11-01T00:00Z', '2026-12-31T00:00Z'),
    ['2026-11-16T09:00:00.000Z', '2026-11-17T09:00:00.000Z', '2026-11-18T09:00:00.000Z']);
});

test('rules that are not understood give undefined', () => {
  const rr = (rrule) => occurrences({ kind: 'rrule', rrule, scheduledAt: S }, 0, T('2030-01-01T00:00Z'));
  assert.equal(rr('DTSTART:20260101T090000Z\nRRULE:FREQ=YEARLY;BYWEEKNO=20'), undefined); // valid in the app, not computed here
  assert.equal(rr('DTSTART:20260101T090000Z\nRRULE:FREQ=HOURLY;BYHOUR=9'), undefined); // the app refuses it
  assert.equal(rr('DTSTART:20260101T090000Z\nRRULE:FREQ=DAILY;COUNT=2;UNTIL=20260301T000000Z'), undefined);
  assert.equal(rr('DTSTART;TZID=Europe/Berlin:20260329T023000\nRRULE:FREQ=DAILY'), undefined); // DTSTART does not exist
  assert.equal(rr('RRULE:FREQ=DAILY'), undefined);
  const cron = (expression, timeZone = 'UTC') => occurrences({ kind: 'cron', expression, timeZone, scheduledAt: S }, 0, 1e12);
  assert.equal(cron('0 9 * * MON'), undefined); // the app takes numbers only
  assert.equal(cron('0 9 * *'), undefined);
  assert.equal(cron('0 9 * * 1', 'Nowhere/City'), undefined);
  assert.equal(occurrences({ kind: 'daily', time: '9:00', timeZone: 'UTC', scheduledAt: S }, 0, 1e12), undefined);
  assert.equal(occurrences({ kind: 'weekly', time: '09:00:00.000', timeZone: 'UTC', weekdays: [], scheduledAt: S }, 0, 1e12), undefined);
  assert.equal(occurrences({ kind: 'monthly', scheduledAt: S }, 0, 1e12), undefined);
  assert.equal(nextAfter({ kind: 'monthly', scheduledAt: S }, 0), undefined);
});

test('describe in plain words', () => {
  const here = { localZone: 'Europe/Paris' };
  const year = new Date().getUTCFullYear();
  const day = new Date(Date.UTC(year, 10, 17)).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  assert.equal(describe({ kind: 'at', scheduledAt: `${year}-11-17T09:00:00.000Z` }, { localZone: 'UTC' }), `Once, on ${day} 17 Nov at 09:00`);
  assert.match(describe({ kind: 'at', scheduledAt: '2099-11-17T09:00:00.000Z' }, { localZone: 'UTC' }), / 17 Nov 2099 at 09:00$/);
  assert.match(describe({ kind: 'after', afterSeconds: 600, scheduledAt: S }), /^Once, 10 minutes after it was created, on /);
  assert.equal(describe({ kind: 'every', everySeconds: 300, scheduledAt: S }), 'Every 5 minutes');
  assert.equal(describe({ kind: 'every', everySeconds: 60, scheduledAt: S }), 'Every minute');
  assert.equal(describe({ kind: 'every', everySeconds: 10800, scheduledAt: S }), 'Every 3 hours');
  const paris = { timeZone: 'Europe/Paris', scheduledAt: S };
  assert.equal(describe({ kind: 'daily', time: '08:30:00.000', ...paris }, here), 'Every day at 08:30');
  assert.equal(describe({ kind: 'weekly', time: '09:00:00.000', weekdays: [1, 4], ...paris }, here), 'Every Monday and Thursday at 09:00');
  assert.equal(describe({ kind: 'weekly', time: '09:00:00.000', weekdays: [1, 4], ...paris }, { localZone: 'UTC' }),
    'Every Monday and Thursday at 09:00 (Europe/Paris time)');
  assert.equal(describe({ kind: 'weekly', time: '07:00:00.000', weekdays: [1, 2, 3, 4, 5], ...paris }, here), 'Every weekday at 07:00');
  const cron = (expression) => describe({ kind: 'cron', expression, ...paris }, here);
  assert.equal(cron('*/5 * * * *'), 'Every 5 minutes');
  assert.equal(cron('0 */3 * * *'), 'Every 3 hours');
  assert.equal(cron('30 8 * * *'), 'Every day at 08:30');
  assert.equal(cron('0 9 * * 1-5'), 'Every weekday at 09:00');
  assert.equal(cron('0 9 10 * *'), 'On the 10th of every month at 09:00');
  assert.equal(cron('0 9 13 * 5'), 'Rule: 0 9 13 * 5');
  const rr = (rrule) => describe({ kind: 'rrule', rrule, scheduledAt: S }, here);
  assert.equal(rr('DTSTART;TZID=Europe/Paris:20260105T090000\nRRULE:FREQ=MONTHLY;BYDAY=1MO'), 'The first Monday of every month at 09:00');
  assert.equal(rr('DTSTART;TZID=Europe/Paris:20260110T090000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=10'), 'On the 10th of every month at 09:00');
  assert.equal(rr('DTSTART;TZID=America/New_York:20260110T090000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=10'),
    'On the 10th of every month at 09:00 (America/New_York time)');
  assert.equal(rr('DTSTART:20261117T010000Z\nRRULE:FREQ=HOURLY;INTERVAL=3'), 'Every 3 hours');
  assert.equal(rr('DTSTART;TZID=Europe/Paris:20261117T070000\nRRULE:FREQ=WEEKLY;BYDAY=MO,TH;COUNT=4'), 'Every Monday and Thursday at 07:00, 4 times');
  assert.equal(rr('DTSTART:20260101T090000Z\nRRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1'),
    'Custom rule: FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1');
  assert.equal(describe({ kind: 'monthly', scheduledAt: S }), 'Unknown schedule');
});
