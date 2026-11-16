import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diffCatalog, everyOf, openAlive, openNotes, recipeOf, targetOf, timingOf } from '../lib/notes.js';
import { createAlerter } from '../lib/alerts.js';
import { keepDefault, LATE_MS, occurrencesOf, openRuns } from '../lib/runs.js';

const reminder = (text) => ({ source: { kind: 'schedule' }, content: [{ type: 'text', text }] });

test('occurrence times come from single and batch reminders (A2)', () => {
  assert.deepEqual(occurrencesOf(reminder('[SCHEDULE REMINDER]\nx\nschedule_id_json: "t1"\noccurrence_at: 2026-11-16T09:00:00.000Z\nreminder_prompt_json: "p"')), { t1: Date.parse('2026-11-16T09:00:00.000Z') });
  const batch = occurrencesOf(reminder(`[SCHEDULE REMINDER BATCH]\nx\nreminders_json: ${JSON.stringify([{ schedule_id: 'a', occurrence_at: '2026-11-16T08:00:00.000Z' }, { schedule_id: 'b', occurrence_at: '2026-11-16T08:30:00.000Z' }])}`));
  assert.deepEqual(Object.keys(batch), ['a', 'b']);
  assert.deepEqual(occurrencesOf({ source: { kind: 'user' }, content: [{ type: 'text', text: 'occurrence_at: 2026-11-16T09:00:00Z' }] }), {});
});

test('a run is late only past the threshold, and "when the app opened" only when told (A2)', () => {
  const runs = openRuns('');
  const due = 1_000_000;
  const late = runs.start({ id: 'm1', sessionId: 's1', tasks: [{ id: 't', title: '' }], at: due + LATE_MS + 1, dueAt: due, whenOpened: true });
  assert.equal(late.late, true);
  assert.equal(late.whenOpened, true);
  runs.end('s1', { kind: 'completed' });
  // Run now: occurrence_at is the current time.
  const now = runs.start({ id: 'm2', sessionId: 's2', tasks: [{ id: 't', title: '' }], at: due, dueAt: due - 1000 });
  assert.equal(now.late, undefined);
  // A run delayed by a busy conversation is late, but not "when the app opened".
  runs.end('s2', { kind: 'completed' });
  const busy = runs.start({ id: 'm3', sessionId: 's3', tasks: [{ id: 't', title: '' }], at: due + LATE_MS * 2, dueAt: due });
  assert.equal(busy.late, true);
  assert.equal(busy.whenOpened, undefined);
});

test('the heartbeat records the time the app was closed (A2, A3)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'auto-alive-'));
  try {
    const file = join(dir, 'alive.json');
    const t0 = Date.now() - 3 * 60 * 60 * 1000;
    const first = openAlive(file, t0);
    first.beat(t0 + 60000);
    assert.deepEqual(first.gaps(), []);
    const later = openAlive(file, t0 + 2 * 60 * 60 * 1000);
    assert.deepEqual(later.gaps(), [{ from: t0 + 60000, to: t0 + 2 * 60 * 60 * 1000 }]);
    assert.equal(later.closedAt(t0 + 30 * 60 * 1000), true);
    assert.equal(later.closedAt(t0 + 3 * 60 * 60 * 1000), false);
    // A short silence is not a gap.
    const again = openAlive(file, t0 + 2 * 60 * 60 * 1000 + 90000);
    assert.equal(again.gaps().length, 1);
    writeFileSync(file, 'not json');
    assert.deepEqual(openAlive(file, Date.now()).gaps(), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a recipe makes an automation again; a passed one-time task cannot (A10)', () => {
  const now = Date.parse('2026-11-16T10:00:00Z');
  const daily = { id: 'd', kind: 'daily', title: 'Brief', prompt: 'Do it', time: '08:30:00.000', timeZone: 'Europe/Berlin', scheduledAt: '2026-11-17T07:30:00.000Z', status: 'paused', target: { kind: 'new', create: { cwd: '/tmp/x', agentPreset: 'p', other: 1 } }, involvedSessionIds: ['s1'] };
  const recipe = recipeOf(daily);
  assert.equal(recipe.prompt, 'Do it');
  assert.equal(recipe.status, 'paused');
  assert.deepEqual(timingOf(recipe, now), { kind: 'daily', daily: { time: '08:30:00.000', time_zone: 'Europe/Berlin' } });
  assert.deepEqual(targetOf(recipe.target), { kind: 'new', create: { cwd: '/tmp/x', agentPreset: 'p' } });
  assert.deepEqual(targetOf({ kind: 'session', sessionId: 'abc' }), { kind: 'session', sessionId: 'abc' });
  assert.deepEqual(targetOf(undefined), { kind: 'new_once', create: {} });
  assert.deepEqual(timingOf({ kind: 'weekly', time: '09:00:00.000', timeZone: 'UTC', weekdays: [1, 4] }, now), { kind: 'weekly', weekly: { time: '09:00:00.000', time_zone: 'UTC', weekdays: [1, 4] } });
  assert.deepEqual(timingOf({ kind: 'every', everySeconds: 300 }, now), { kind: 'every', every_seconds: 300 });
  assert.deepEqual(timingOf({ kind: 'cron', expression: '0 9 * * 1', timeZone: 'UTC' }, now), { kind: 'cron', cron: { expression: '0 9 * * 1', time_zone: 'UTC' } });
  assert.deepEqual(timingOf({ kind: 'rrule', rrule: 'RRULE:FREQ=DAILY' }, now), { kind: 'rrule', rrule: 'RRULE:FREQ=DAILY' });
  assert.equal(timingOf({ kind: 'at', scheduledAt: '2026-11-16T09:00:00Z' }, now), undefined);
  assert.deepEqual(timingOf({ kind: 'after', scheduledAt: '2026-11-17T09:00:00Z' }, now), { kind: 'at', at: '2026-11-17T09:00:00.000Z' });
  assert.equal(recipeOf({ ...daily, status: 'ended' }), undefined);
});

test('the list is compared: new ones get the tab they were made in; gone ones are reported once (A4)', () => {
  const notes = openNotes('');
  const a = { id: 'a', kind: 'every', everySeconds: 60, title: 'A', prompt: 'p', status: 'active', involvedSessionIds: ['s-fin'] };
  const b = { id: 'b', kind: 'every', everySeconds: 60, title: 'B', prompt: 'p', status: 'active', involvedSessionIds: [] };
  const tab = (entry) => (entry.involvedSessionIds.includes('s-fin') ? 'finance' : '');
  let change = notes.take([a, b], tab);
  assert.deepEqual(change.added.map((e) => e.id), ['a', 'b']);
  assert.equal(notes.get('a').createdIn, 'finance');
  assert.equal(notes.get('b').createdIn, '');
  change = notes.take([a], tab);
  assert.deepEqual(change.removed.map((r) => r.id), ['b']);
  change = notes.take([a], tab);
  assert.deepEqual(change.removed, []);
  assert.deepEqual(diffCatalog({}, []), { added: [], removed: [] });
});

test('own alerts and keep rules are stored and checked (A11, A17)', () => {
  const notes = openNotes('');
  notes.setAlerts('a', { failed: false, finished: true, needs: 'x' });
  assert.deepEqual(notes.get('a').alerts, { failed: false, finished: true });
  notes.setAlerts('a', {});
  assert.equal(notes.get('a').alerts, undefined);
  notes.setKeep('a', { days: -5, count: 99999 });
  assert.deepEqual(notes.get('a').keep, { days: 0, count: 1000 });
  notes.setKeep('a', null);
  assert.equal(notes.get('a').keep, undefined);
  assert.equal(notes.setCreatedIn('a', '../x'), undefined);
  assert.equal(notes.get('a').createdIn, undefined);
});

test('an automation\'s own alert choice wins over the global switch (A17)', () => {
  const sent = [];
  const alerter = createAlerter({ settings: () => ({ failed: true, needs: true, finished: false, others: false, othersMinutes: 2, runs: true, mac: true, phone: false }) });
  const notify = (what) => (alerter.notify(what) ? sent.push(what.event) : undefined);
  // Delivery itself is not tested here: notify returns a promise when an alert is due.
  assert.notEqual(alerter.notify({ event: 'finished', scheduled: true, name: 'x', own: { finished: true } }), undefined);
  assert.equal(alerter.notify({ event: 'failed', scheduled: true, name: 'x', own: { failed: false } }), undefined);
  assert.equal(alerter.notify({ event: 'finished', scheduled: true, name: 'x' }), undefined);
  // Not for your own conversations.
  assert.equal(alerter.notify({ event: 'finished', scheduled: false, name: 'x', own: { finished: true }, minutes: 10 }), undefined);
  void notify;
  void sent;
});

test('keep rules: starting values from how often it runs; old runs leave, shared ones stay while any task keeps them (A11)', () => {
  const H = 3600000;
  const D = 24 * H;
  assert.deepEqual(keepDefault(H), { days: 7, count: 0 });
  assert.deepEqual(keepDefault(D), { days: 31, count: 0 });
  assert.deepEqual(keepDefault(7 * D), { days: 183, count: 0 });
  assert.deepEqual(keepDefault(30 * D), { days: 365, count: 0 });
  assert.deepEqual(keepDefault(undefined), { days: 31, count: 0 });
  assert.equal(everyOf({ kind: 'weekly', weekdays: [1, 3, 5] }), (7 * D) / 3);
  assert.equal(everyOf({ kind: 'rrule', rrule: 'RRULE:FREQ=HOURLY;INTERVAL=3' }), 3 * H);
  assert.equal(everyOf({ kind: 'cron', expression: '0 9 * * *' }), D);
  const now = 100 * D;
  const runs = openRuns('');
  const add = (id, tasks, endedAt, own) => {
    runs.start({ id, sessionId: id, tasks: tasks.map((t) => ({ id: t, title: t })), at: endedAt, target: own ? 'new' : 'session' });
    runs.end(id, { kind: 'completed' }, endedAt);
  };
  add('old-a', ['a'], now - 10 * D, true);
  add('old-ab', ['a', 'b'], now - 10 * D, false);
  add('new-a', ['a'], now - D, true);
  runs.start({ id: 'live', sessionId: 'live', tasks: [{ id: 'a', title: 'a' }], at: now - 40 * D });
  const rules = { a: { days: 7, count: 0 }, b: { days: 31, count: 0 } };
  const dropped = runs.prune((id) => rules[id], now);
  assert.deepEqual(dropped.map((run) => run.id), ['old-a']);
  assert.equal(dropped[0].own, true);
  assert.deepEqual(runs.list().map((run) => run.id).sort(), ['live', 'new-a', 'old-ab']);
  // Count: only the newest run of each task stays (the running one counts); 'old-ab' stays for 'b'.
  const more = runs.prune(() => ({ days: 0, count: 1 }), now);
  assert.deepEqual(more.map((run) => run.id), ['new-a']);
});

test('the notes survive a restart and an unreadable file starts empty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'auto-notes-'));
  try {
    const file = join(dir, 'tasks.json');
    const notes = openNotes(file);
    notes.take([{ id: 'a', kind: 'every', everySeconds: 60, prompt: 'p', status: 'active' }], () => 'cowork');
    notes.setAlerts('a', { failed: false });
    const again = openNotes(file);
    assert.equal(again.get('a').createdIn, 'cowork');
    assert.equal(Object.keys(again.known()).length, 1);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).tasks.a.alerts.failed, false);
    writeFileSync(file, '[');
    assert.deepEqual(openNotes(file).known(), {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the Automations tab joins and leaves the Modes add-on\'s modes (A5)', async () => {
  const { withAutomations, MODE, MODE_ID, METHOD } = await import('../lib/mode.js');
  const on = JSON.parse(withAutomations('{"finance":{"label":"Finance"}}', true));
  assert.deepEqual(Object.keys(on), ['finance', MODE_ID]);
  assert.equal(on[MODE_ID].sandbox, 'read-only');
  assert.equal(withAutomations(JSON.stringify(on), true), undefined);
  assert.deepEqual(JSON.parse(withAutomations(JSON.stringify(on), false)), { finance: { label: 'Finance' } });
  assert.equal(withAutomations('{}', false), undefined);
  // An unreadable table is never written over: the other add-ons' modes would go (review finding 10).
  assert.equal(withAutomations('not json', true), undefined);
  assert.equal(withAutomations('', true), JSON.stringify({ [MODE_ID]: MODE }));
  assert.ok(METHOD.length < 4000);
  assert.ok(!MODE.tools.includes('run_code'));
});

test('results: runs picked by name, date and outcome; the final answer is the last thing said (A22)', async () => {
  const { pickRuns, finalAnswer } = await import('../lib/mode.js');
  const now = Date.parse('2026-11-16T12:00:00Z');
  const runs = [
    { id: '3', tasks: [{ id: 't1', title: 'Morning brief' }], startedAt: Date.parse('2026-11-16T07:00:00Z'), state: 'ok' },
    { id: '2', tasks: [{ id: 't2', title: 'Backup check' }], startedAt: Date.parse('2026-11-15T07:00:00Z'), state: 'failed' },
    { id: '1', tasks: [{ id: 't1', title: 'Morning brief' }], startedAt: Date.parse('2026-09-01T07:00:00Z'), state: 'ok' },
  ];
  assert.deepEqual(pickRuns(runs, { automation: 'morning' }, now).map((r) => r.id), ['3']);
  assert.deepEqual(pickRuns(runs, { automation: 'morning', since: '2026-08-01' }, now).map((r) => r.id), ['3', '1']);
  assert.deepEqual(pickRuns(runs, { state: 'failed' }, now).map((r) => r.id), ['2']);
  assert.deepEqual(pickRuns(runs, { automation: 't2' }, now).map((r) => r.id), ['2']);
  assert.equal(pickRuns(runs, { limit: 1 }, now).length, 1);
  assert.equal(finalAnswer([
    { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'first' }] } } },
    { type: 'user/message', data: {} },
    { type: 'assistant/message', data: { message: { content: [{ type: 'tool_use' }, { type: 'text', text: 'last' }] } } },
    { type: 'assistant/message', data: { message: { content: [{ type: 'tool_use' }] } } },
  ]), 'last');
});

test('a run you went on with is marked, and a deleted automation waits for the trash (review findings 3, 8)', () => {
  const runs = openRuns('');
  runs.start({ id: 'm', sessionId: 's', tasks: [{ id: 't', title: 't' }], at: 1, target: 'new' });
  runs.touch('s');
  assert.equal(runs.list()[0].touched, undefined, 'not while it runs');
  runs.end('s', { kind: 'completed' }, 2);
  runs.touch('s');
  assert.equal(runs.list()[0].touched, true);
  const notes = openNotes('');
  notes.hold({ id: 'a', title: 'A' });
  notes.hold({ id: 'a', title: 'A2' });
  assert.deepEqual(notes.held().map((r) => r.title), ['A2']);
  notes.release('a');
  assert.deepEqual(notes.held(), []);
});
