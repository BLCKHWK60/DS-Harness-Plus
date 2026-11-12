import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { RUNS_MAX, TEXT_MAX, openRuns, outcomeOf, scheduledTasks } from '../lib/runs.js';

const reminder = (text) => ({ id: 'm1', role: 'user', source: { kind: 'schedule' }, content: [{ type: 'text', text }] });

test('a scheduled message names its task; other messages name none', () => {
  const one = reminder('[SCHEDULE REMINDER]\nThis is a scheduled message from the user\nschedule_id_json: "task-a"\noccurrence_at: 2026-11-12T09:00:00.000Z\nreminder_prompt_json: "Say hello"');
  assert.deepEqual(scheduledTasks(one), ['task-a']);
  const batch = reminder('[SCHEDULE REMINDER BATCH]\nThis is a scheduled message from the user\nreminders_json: [{"schedule_id":"task-a","occurrence_at":"x","reminder_prompt":"p"},{"schedule_id":"task-b","occurrence_at":"y","reminder_prompt":"q"}]');
  assert.deepEqual(scheduledTasks(batch), ['task-a', 'task-b']);
  // A change notice comes from the scheduler too, but starts no run.
  assert.deepEqual(scheduledTasks(reminder('A scheduled task changed.\nchange: updated\nschedule_id_json: "task-a"')), []);
  // Typed by a person: never a run, whatever it says.
  assert.deepEqual(scheduledTasks({ source: { kind: 'user' }, content: [{ type: 'text', text: '[SCHEDULE REMINDER]\nschedule_id_json: "task-a"' }] }), []);
  assert.deepEqual(scheduledTasks(reminder('[SCHEDULE REMINDER]\nschedule_id_json: not json')), []);
  assert.deepEqual(scheduledTasks(undefined), []);
});

test('how a turn ended becomes how the run ended', () => {
  assert.equal(outcomeOf({ kind: 'completed' }).state, 'ok');
  assert.deepEqual(outcomeOf({ kind: 'error', error: { message: 'No  credit\nleft', code: 'X' } }), { state: 'failed', detail: 'No credit left' });
  assert.equal(outcomeOf({ kind: 'aborted' }).state, 'cancelled');
  assert.equal(outcomeOf({ kind: 'blocked' }).state, 'stopped');
  assert.equal(outcomeOf({ kind: 'max-tokens' }).state, 'failed');
  assert.equal(outcomeOf({ kind: 'something-new' }).state, 'failed');
  assert.equal(outcomeOf(undefined).state, 'failed');
});

test('a run is followed from its start to its end', () => {
  const runs = openRuns('');
  runs.start({ id: 'm1', sessionId: 's1', tasks: [{ id: 'task-a', title: '' }], at: 1000 });
  runs.name('s1', { 'task-a': 'Morning brief' });
  runs.step('s1');
  runs.step('s1');
  runs.usage('s1', 1200);
  runs.usage('s1', 300);
  runs.text('s1', 'First words');
  runs.text('s1', '');
  runs.text('s1', 'Here is your brief.');
  // Another conversation's work is not counted.
  runs.step('s2');
  runs.usage('s2', 99999);
  const done = runs.end('s1', { kind: 'completed' }, 61000);
  assert.equal(done.state, 'ok');
  assert.equal(runs.active('s1'), undefined);
  const [run] = runs.list();
  assert.deepEqual({ ...run, waitKey: undefined }, {
    id: 'm1', sessionId: 's1', tasks: [{ id: 'task-a', title: 'Morning brief' }], startedAt: 1000, state: 'ok', steps: 2, tokens: 1500,
    text: 'Here is your brief.', detail: '', waiting: undefined, waitKey: undefined, endedAt: 61000,
  });
  assert.equal(runs.end('s1', { kind: 'completed' }), undefined);
});

test('waiting for you, and going on after your answer', () => {
  const runs = openRuns('');
  assert.equal(runs.wait('s1', 'approval', 'approval:1'), undefined);
  runs.start({ id: 'm1', sessionId: 's1', tasks: [{ id: 'task-a', title: 'Tidy' }] });
  assert.equal(runs.wait('s1', 'not-a-kind'), undefined);
  const first = runs.wait('s1', 'approval', 'approval:1');
  assert.equal(first.state, 'waiting');
  assert.equal(first.waiting, 'approval');
  // Asked again while already waiting: no second "it started waiting".
  assert.equal(runs.wait('s1', 'question', 'call:9'), undefined);
  // An answer to something else does not end this wait.
  runs.resume('s1', 'call:other');
  assert.equal(runs.list()[0].state, 'waiting');
  runs.resume('s1', 'call:9');
  assert.equal(runs.list()[0].state, 'running');
  assert.equal(runs.list()[0].waiting, undefined);
  runs.wait('s1', 'plan-review', 'call:10');
  assert.equal(runs.end('s1', { kind: 'aborted' }).state, 'cancelled');
  assert.equal(runs.list()[0].waiting, undefined);
});

test('only the end of a long answer is kept', () => {
  const runs = openRuns('');
  runs.start({ id: 'm1', sessionId: 's1', tasks: [] });
  runs.text('s1', `${'a'.repeat(1000)}THE END`);
  const { text } = runs.list()[0];
  assert.equal(text.length, TEXT_MAX + 1);
  assert.ok(text.startsWith('…'));
  assert.ok(text.endsWith('THE END'));
});

test('the record is saved, capped, and tidied after the app closed mid-run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-automations-'));
  const file = join(dir, 'sub', 'runs.json');
  try {
    const runs = openRuns(file);
    for (let i = 0; i < RUNS_MAX + 5; i += 1) {
      runs.start({ id: `m${i}`, sessionId: `s${i}`, tasks: [{ id: 't', title: 'T' }], at: i });
      if (i < RUNS_MAX + 3) runs.end(`s${i}`, { kind: 'completed' }, i + 1);
    }
    runs.wait(`s${RUNS_MAX + 4}`, 'question', 'call:1');
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(saved.runs.length, RUNS_MAX);
    assert.equal(saved.runs[0].id, `m${RUNS_MAX + 4}`);

    // The app starts again: nothing can still be running.
    const again = openRuns(file);
    again.closeLeftovers(999999);
    const list = again.list();
    assert.equal(list.length, RUNS_MAX);
    assert.equal(list.filter((run) => run.state === 'running' || run.state === 'waiting').length, 0);
    assert.equal(list[0].state, 'failed');
    assert.equal(list[0].detail, 'The app closed before it finished.');
    assert.equal(list[0].endedAt, 999999);
    assert.equal(list[2].state, 'ok');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a broken record file starts empty', () => {
  assert.deepEqual(openRuns('/nonexistent/dir/runs.json').list(), []);
});

test('a step begun before the instruction was read is counted', () => {
  const runs = openRuns('');
  runs.start({ id: 'm1', sessionId: 's1', tasks: [], steps: 1 });
  runs.step('s1');
  assert.equal(runs.list()[0].steps, 2);
  runs.start({ id: 'm2', sessionId: 's2', tasks: [], steps: undefined });
  assert.equal(runs.list()[0].steps, 0);
});
