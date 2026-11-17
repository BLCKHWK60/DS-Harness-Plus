// Long run (the owner's plan, Long run part): the engine's own rules, as plain data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { EMPTY_LAPS, NOTES_MAX, applyChecks, applyPlan, applyReview, applyUndo, applyWork, brokenChecks, finish, lapNotes, newRun, nextStep, readLong, report } from '../lib/run.js';

const T0 = Date.parse('2026-11-16T01:00:00Z');
const long = (over = {}) => newRun({ id: 'r1', goal: 'Make the tool better', mode: 'Restricted', root: '/tmp/x', limits: {}, checkpoint: 1, at: T0, kind: 'long', long: { minutes: 60, laps: 4, ...over } });
const plan = (run, items = [{ title: 'A', check: 'test a' }], checks = ['npm test']) => applyPlan(run, { summary: 's', items, checks });

test('a /mission run keeps every rule it had: no clock, no laps, the same limits', () => {
  const run = newRun({ id: 'm1', goal: 'g g g', mode: 'Restricted', root: '/tmp/x', limits: {}, checkpoint: 1, at: T0 });
  assert.equal(run.kind, undefined);
  assert.equal(run.long, undefined);
  assert.equal(run.limits.maxSteps, 60);
  assert.equal(run.limits.maxReviews, 2);
  plan(run);
  applyWork(run, '1', { check: { ok: true, output: '' } });
  assert.equal(nextStep(run, T0 + 10 * 3600000).kind, 'checks', 'no clock stops a /mission run');
  assert.equal(lapNotes(run), '');
});

test('a Long run: its own settings in range, laps decide steps and reviews (decision 1)', () => {
  assert.deepEqual(readLong({ minutes: 5, laps: 99, fullTime: 'yes' }), { minutes: 10, laps: 50, fullTime: false });
  assert.deepEqual(readLong({}), { minutes: 120, laps: 10, fullTime: false });
  const run = long({ laps: 30 });
  assert.equal(run.kind, 'long');
  assert.equal(run.long.deadline, T0 + 60 * 60000);
  assert.ok(run.limits.maxSteps > 300, '30 laps of 12 items may go past /mission\'s 300 steps');
  assert.equal(run.limits.maxReviews, 31);
});

test('the clock stops a Long run between steps, and the report says why', () => {
  const run = plan(long());
  assert.equal(nextStep(run, T0 + 59 * 60000).kind, 'work');
  const stop = nextStep(run, T0 + 60 * 60000);
  assert.deepEqual(stop, { kind: 'finish', why: 'time' });
  run.longEnd = 'its time was up';
  finish(run, '', T0 + 61 * 60000);
  assert.match(report(run), /It ended because its time was up\./);
});

test('a lap is work, the overall commands, then a review; the lap limit ends the run', () => {
  const run = plan(long({ laps: 1 }));
  applyWork(run, '1', { check: { ok: true, output: '' } });
  assert.equal(nextStep(run, T0).kind, 'checks');
  applyChecks(run, [{ command: 'npm test', ok: true, output: '' }]);
  assert.equal(nextStep(run, T0).kind, 'review', 'every lap ends with a review');
  applyReview(run, { verdict: 'approve', items: [] });
  assert.equal(run.long.lap, 1);
  assert.deepEqual(nextStep(run, T0), { kind: 'finish', why: 'laps' });
});

test('after the list is done, laps hunt for weak spots; two empty laps stop it unless the full time is used (decision 2)', () => {
  const run = plan(long({ laps: 10 }));
  applyWork(run, '1', { check: { ok: true, output: '' } });
  applyChecks(run, [{ command: 'npm test', ok: true, output: '' }]);
  applyReview(run, { items: [] });
  assert.deepEqual(nextStep(run, T0), { kind: 'review', hunt: true });
  // A hunt that finds a weak spot: the next lap works on it.
  applyReview(run, { new_items: [{ title: 'Handle empty input', check: 'test empty' }] });
  assert.equal(run.long.emptyLaps, 0);
  assert.equal(nextStep(run, T0).kind, 'work');
  applyWork(run, '2', { check: { ok: true, output: '' } });
  applyChecks(run, [{ command: 'npm test', ok: true, output: '' }]);
  applyReview(run, { items: [] });
  applyReview(run, {});
  assert.equal(run.long.emptyLaps, EMPTY_LAPS);
  assert.deepEqual(nextStep(run, T0), { kind: 'finish', why: 'empty' });
  const full = plan(long({ laps: 10, fullTime: true }));
  applyWork(full, '1', { check: { ok: true, output: '' } });
  applyChecks(full, [{ command: 'npm test', ok: true, output: '' }]);
  applyReview(full, {});
  applyReview(full, {});
  applyReview(full, {});
  assert.deepEqual(nextStep(full, T0), { kind: 'review', hunt: true }, 'Use the full time: it keeps going until the clock or the laps');
});

test('Finish this lap: the lap under way ends, then the report', () => {
  const run = plan(long(), [{ title: 'A', check: 'a' }, { title: 'B', check: 'b' }]);
  run.long.finishLap = true;
  assert.equal(nextStep(run, T0).kind, 'work', 'the lap under way goes on');
  applyWork(run, '1', { check: { ok: true, output: '' } });
  applyWork(run, '2', { check: { ok: false, output: 'x' } });
  applyWork(run, '2', { check: { ok: true, output: '' } });
  applyChecks(run, [{ command: 'npm test', ok: true, output: '' }]);
  assert.equal(nextStep(run, T0).kind, 'review');
  applyReview(run, { items: [{ id: '1', ok: false, note: 'not really' }] });
  assert.deepEqual(nextStep(run, T0), { kind: 'finish', why: 'asked' }, 'not another lap, even with an item reopened');
});

test('the gate: only after the commands passed once, and only for a command that passed before', () => {
  const run = plan(long(), [{ title: 'A' }], ['npm test', 'npm run lint']);
  applyWork(run, '1', {});
  const first = [{ command: 'npm test', ok: false, output: '' }, { command: 'npm run lint', ok: true, output: '' }];
  assert.deepEqual(brokenChecks(run, first), [], 'early laps fail checks as a matter of course: nothing is undone');
  applyChecks(run, [{ command: 'npm test', ok: true, output: '' }, { command: 'npm run lint', ok: true, output: '' }]);
  assert.equal(run.long.checksPassedOnce, true);
  assert.deepEqual(brokenChecks(run, [{ command: 'npm test', ok: false, output: '' }, { command: 'npm run lint', ok: true, output: '' }]), ['npm test']);
  assert.deepEqual(brokenChecks(newRun({ id: 'm', goal: 'g g g', mode: 'R', root: '/x', limits: {}, at: T0 }), first), [], 'never in a /mission run');
});

test('an undone lap: its items are open again with a note, its tries still count, the report names the checkpoint', () => {
  const run = plan(long({ laps: 5 }), [{ title: 'A', check: 'a' }, { title: 'B', check: 'b' }]);
  applyWork(run, '1', { check: { ok: true, output: '' } });
  applyWork(run, '2', { check: { ok: true, output: '' } });
  applyChecks(run, [{ command: 'npm test', ok: true, output: '' }]);
  applyReview(run, { new_items: [{ title: 'C', check: 'c' }] });
  applyWork(run, '3', { check: { ok: true, output: '' } });
  applyUndo(run, { kept: 41, back: 40, broke: ['npm test'], touched: ['3'] });
  const c = run.items.find((item) => item.id === '3');
  assert.equal(c.status, 'open');
  assert.equal(c.tries, 1, 'the undone try still counts');
  assert.match(c.note, /Undone: this lap broke npm test.*checkpoint 41/);
  assert.equal(run.items.find((item) => item.id === '1').status, 'verified', 'work of earlier laps stays');
  assert.equal(nextStep(run, T0).kind, 'work');
  finish(run, '', T0 + 1000);
  assert.match(report(run), /Lap 2 broke npm test and was undone\. Its work is kept as checkpoint 41/);
});

test('the notes the add-on keeps between laps: short, what passed, what failed, what to avoid', () => {
  const run = plan(long(), [{ title: 'A', check: 'a' }, { title: 'B', check: 'b' }]);
  applyWork(run, '1', { check: { ok: true, output: '' } });
  applyWork(run, '2', { check: { ok: false, output: '' } });
  run.items[1].note = 'x'.repeat(5000);
  run.long.undone.push({ lap: 1, kept: 9, back: 8, broke: ['npm test'] });
  const notes = lapNotes(run);
  assert.match(notes, /Done: items 1\./);
  assert.match(notes, /Still open or stuck: 2/);
  assert.match(notes, /Avoid repeating: lap 1 broke npm test/);
  assert.ok(notes.length <= NOTES_MAX);
});

test('a Long run is complete when everything passed, whatever stopped it', () => {
  const run = plan(long());
  applyWork(run, '1', { check: { ok: true, output: '' } });
  applyChecks(run, [{ command: 'npm test', ok: true, output: '' }]);
  applyReview(run, {});
  finish(run, '', T0 + 1000);
  assert.equal(run.status, 'complete');
});

test('the runner: a Long run that breaks a passing check in a later lap is undone, for real, on a throwaway folder', async () => {
  const { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createRunner } = await import('../runner.js');
  const { openCheckpoints } = await import('../lib/checkpoints.js');
  const root = mkdtempSync(join(tmpdir(), 'mission-long-'));
  try {
    writeFileSync(join(root, 'state.txt'), 'good\n');
    const goal = { id: 'g', revision: 1, phase: 'active' };
    let made = false;
    const goals = { create: () => { made = true; goal.phase = 'active'; return goal; }, get: () => (made ? goal : undefined), pause: () => {}, resume: () => {}, complete: () => { goal.phase = 'complete'; } };
    const answers = {
      'Mission: planner': '{"summary":"s","items":[{"title":"Keep it good","check":"true"}],"checks":["grep -q good state.txt"]}',
      'Mission: reviewer': ['{"verdict":"approve","items":[]}', '{"verdict":"changes","new_items":[{"title":"Try something risky","check":"true"}]}', '{"verdict":"approve","items":[]}', '{"verdict":"approve","items":[]}'],
    };
    const subagents = {
      startActivation: async (spec) => {
        let text = 'done';
        if (spec.label === 'Mission: planner') text = answers[spec.label];
        else if (spec.label === 'Mission: reviewer') text = answers[spec.label].shift() ?? '{"items":[]}';
        else if (spec.label === 'Mission: item 2') writeFileSync(join(root, 'state.txt'), 'bad\n');
        return { childId: 'c', result: Promise.resolve({ output: [{ type: 'text', text }], stopReason: 'end' }) };
      },
    };
    const ctx = { get: (name) => ({ goals, subagents })[name] };
    const points = openCheckpoints(root);
    const runner = createRunner(ctx, { settings: () => ({ limits: { maxItems: 12, maxTries: 3, maxReviews: 2, maxSteps: 60, waitMinutes: 3 }, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {}, home: undefined });
    const agent = { id: 'conv', model: { current: () => ({ provider: 'p', model: 'm' }) } };
    const started = await runner.start(agent, 'keep the state good and try things', { mode: 'auto', root }, { kind: 'long', long: { minutes: 60, laps: 5 } });
    assert.match(started, /^Long run started \(Full Auto\)/);
    const texts = [];
    for (let i = 0; i < 30 && runner.isOn('conv'); i += 1) texts.push(await runner.step(agent, new AbortController().signal, 120000));
    const all = texts.join("\n---\n"); if (process.env.SHOW) console.log(all);
    assert.match(all, /extra lap: looking for weak spots/);
    assert.match(all, /grep -q good state\.txt passed before this lap and fails now, also when run again\.\nThe lap was undone/);
    assert.equal(readFileSync(join(root, 'state.txt'), 'utf8'), 'good\n', 'the folder is back as it was at the lap\'s start');
    const run = runner.runOf('conv');
    assert.equal(run.long.undone.length >= 1, true);
    assert.equal(existsSync(join(root, '.dsh-mission', 'runs', run.id, 'run.json')), true, 'the run\'s own record is never put back');
    assert.match(all, /Long run complete: all 2 items done and checked\./);
    assert.match(all, /Lap 3 broke grep -q good state\.txt and was undone\. Its work is kept as checkpoint \d+/);
    assert.match(all, /It ended because two laps in a row found nothing more to do\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('effort by role: a Long run\'s planner and reviewer think High, its workers Medium; a /mission run sets none', async () => {
  const { createRunner } = await import('../runner.js');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = mkdtempSync(join(tmpdir(), 'mission-effort-'));
  try {
    const goal = { id: 'g', revision: 1, phase: 'active' };
    let made = false;
    const goals = { create: () => { made = true; goal.phase = 'active'; return goal; }, get: () => (made ? goal : undefined), pause: () => {}, resume: () => {}, complete: () => { goal.phase = 'complete'; made = false; }, clear: () => { made = false; } };
    const seen = [];
    const subagents = { startActivation: async (spec) => { seen.push([spec.label, spec.agentOptions?.reasoningEffort]); return { childId: 'c', result: Promise.resolve({ output: [{ type: 'text', text: spec.label === 'Mission: planner' ? '{"items":[{"title":"x","check":"true"}],"checks":[]}' : '{"items":[]}' }], stopReason: 'end' }) }; } };
    const points = { take: async () => ({ id: 'p', number: 1 }), files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '' };
    const runner = createRunner({ get: (name) => ({ goals, subagents })[name] }, { settings: () => ({ limits: { maxItems: 12, maxTries: 3, maxReviews: 1, maxSteps: 60, waitMinutes: 3 }, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {}, home: undefined });
    const agent = { id: 'c1', model: { current: () => ({ provider: 'p', model: 'm' }) } };
    await runner.start(agent, 'do a small thing well', { mode: 'auto', root }, { kind: 'long', long: { minutes: 30, laps: 1, effort: true } });
    assert.equal(runner.effortByRole('c1'), true);
    for (let i = 0; i < 5 && runner.isOn('c1'); i += 1) await runner.step(agent, new AbortController().signal, 60000);
    assert.deepEqual(seen.slice(0, 3), [['Mission: planner', 'high'], ['Mission: item 1', 'medium'], ['Mission: reviewer', 'high']]);
    assert.equal(runner.effortByRole('c1'), false, 'not once the run has ended');
    seen.length = 0;
    const other = { id: 'c2', model: agent.model };
    await runner.start(other, 'do a small thing well', { mode: 'auto', root });
    await runner.step(other, new AbortController().signal, 60000);
    assert.deepEqual(seen, [['Mission: planner', undefined]], 'a /mission run leaves effort to the tier');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test('an optional token allowance ends a Long run with its report; none is set unless asked', () => {
  const run = plan(long());
  assert.equal(run.long.tokenCap, 0);
  run.tokens = 10 ** 9;
  assert.equal(nextStep(run, T0).kind, 'work', 'no allowance: tokens never stop it');
  const capped = plan(long({ tokenCap: 5000 }));
  capped.tokens = 4999;
  assert.equal(nextStep(capped, T0).kind, 'work');
  capped.tokens = 5000;
  assert.deepEqual(nextStep(capped, T0), { kind: 'finish', why: 'allowance' });
});

test('a model that refuses a thinking level is asked again without one; helpers that keep failing pause the run with the reason', async () => {
  const { createRunner, helperFailure, FAIL_STREAK } = await import('../runner.js');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = mkdtempSync(join(tmpdir(), 'mission-fail-'));
  try {
    assert.equal(helperFailure({ stopReason: 'end' }), '');
    assert.equal(helperFailure({ stopReason: 'error', diagnostic: 'model down' }), 'The helper\'s model failed: model down');
    assert.match(helperFailure({ stopReason: 'refusal' }), /refused the task/);
    const goal = { id: 'g', revision: 1, phase: 'active' };
    let made = false;
    const paused = [];
    const goals = { create: () => { made = true; goal.phase = 'active'; return goal; }, get: () => (made ? goal : undefined), pause: () => { paused.push('pause'); goal.phase = 'paused'; }, resume: () => {}, complete: () => { goal.phase = 'complete'; made = false; }, clear: () => { made = false; } };
    const seen = [];
    let workersFail = false;
    const subagents = {
      startActivation: async (spec) => {
        seen.push([spec.label, spec.agentOptions?.reasoningEffort]);
        // Like deepseek-flash: High is taken, Medium is refused at once.
        // Like the app: the failure comes with no detail.
        if (spec.agentOptions?.reasoningEffort === 'medium') return { childId: 'c', result: Promise.resolve({ output: [], stopReason: 'error' }) };
        if (workersFail && spec.label.startsWith('Mission: item')) return { childId: 'c', result: Promise.resolve({ output: [], stopReason: 'error', diagnostic: 'connection refused' }) };
        const text = spec.label === 'Mission: planner' ? '{"items":[{"title":"one"},{"title":"two"},{"title":"three"},{"title":"four"}],"checks":[]}' : 'did it';
        return { childId: 'c', result: Promise.resolve({ output: [{ type: 'text', text }], stopReason: 'end' }) };
      },
    };
    const points = { take: async () => ({ id: 'p', number: 1 }), files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '' };
    const runner = createRunner({ get: (name) => ({ goals, subagents })[name] }, { settings: () => ({ limits: { maxItems: 12, maxTries: 3, maxReviews: 2, maxSteps: 60, waitMinutes: 3 }, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {}, home: undefined });
    const agent = { id: 'f1', model: { current: () => ({ provider: 'p', model: 'm' }) } };
    await runner.start(agent, 'do four small things', { mode: 'auto', root }, { kind: 'long', long: { minutes: 30, laps: 2, effort: true } });
    await runner.step(agent, new AbortController().signal, 60000); // plan
    const first = await runner.step(agent, new AbortController().signal, 60000); // item 1
    assert.deepEqual(seen.slice(0, 3), [['Mission: planner', 'high'], ['Mission: item 1', 'medium'], ['Mission: item 1', undefined]], 'asked again without a thinking level');
    assert.match(first, /item 1 of 4.*done; no command proves it/);
    await runner.step(agent, new AbortController().signal, 60000); // item 2
    assert.deepEqual(seen.at(-1), ['Mission: item 2', undefined], 'that model gets none from then on');
    // Now the workers' model fails outright: not "done", and after a few in a row the run pauses.
    workersFail = true;
    const texts = [];
    for (let i = 0; i < FAIL_STREAK; i += 1) texts.push(await runner.step(agent, new AbortController().signal, 60000));
    const run = runner.runOf('f1');
    assert.ok(run.items.filter((item) => item.note.includes('connection refused')).length >= 1);
    assert.equal(run.items.some((item) => item.status === 'unverified' && item.note.includes('connection refused')), false);
    assert.match(texts.at(-1), /The run is paused: 3 helpers in a row could not do their item\. The last one: The helper's model failed: connection refused/);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(paused, ['pause']);
    assert.match(runner.runOf('f1').stalled, /^Paused: 3 helpers in a row/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('End while a step is under way: the step says the run is over, with its report, and that the model stops there', async () => {
  const { createRunner } = await import('../runner.js');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = mkdtempSync(join(tmpdir(), 'mission-end-'));
  try {
    const goal = { id: 'g', revision: 1, phase: 'active' };
    let made = false;
    const goals = { create: () => { made = true; goal.phase = 'active'; return goal; }, get: () => (made ? goal : undefined), pause: () => {}, resume: () => {}, complete: () => { goal.phase = 'complete'; }, clear: () => { made = false; } };
    const subagents = {
      startActivation: async (spec) => {
        if (spec.label === 'Mission: planner') return { childId: 'c', result: Promise.resolve({ output: [{ type: 'text', text: '{"items":[{"title":"one"},{"title":"two"}],"checks":[]}' }], stopReason: 'end' }) };
        // A worker that takes its time; End stops it.
        return { childId: 'c', result: new Promise(() => {}), dispose: () => {} };
      },
    };
    const points = { take: async () => ({ id: 'p', number: 1 }), files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '' };
    const runner = createRunner({ get: (name) => ({ goals, subagents })[name] }, { settings: () => ({ limits: { maxItems: 12, maxTries: 3, maxReviews: 2, maxSteps: 60, waitMinutes: 3 }, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {}, home: undefined });
    const agent = { id: 'e1', model: { current: () => ({ provider: 'p', model: 'm' }) } };
    await runner.start(agent, 'do two small things', { mode: 'auto', root }, { kind: 'long', long: { minutes: 30, laps: 2 } });
    await runner.step(agent, new AbortController().signal, 60000); // plan
    const under = runner.step(agent, new AbortController().signal, 60000); // item 1, still working
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.match(runner.end(agent), /You ended it/);
    const said = await under;
    assert.match(said, /^The user ended the run while this step was under way\. Give the user its report:/);
    assert.match(said, /The run is over\. After giving the report, stop: do not carry on its work yourself and do not start other research or runs, unless the user asks you to\.$/);
    assert.doesNotMatch(said, /resume/);
    assert.match(await runner.step(agent, new AbortController().signal, 60000), /^The mission run has ended\.[\s\S]*The run is over\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a planner and a reviewer that answer in prose: one more short ask turns the answer into the checklist; checks are told how to prove a removal', async () => {
  const { createRunner } = await import('../runner.js');
  const { CHECK_RULE, formatPrompt, planPrompt, reviewPrompt } = await import('../lib/prompts.js');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  assert.match(CHECK_RULE, /! grep -q/);
  assert.ok(planPrompt({ goal: 'g', root: '/r', files: '', maxItems: 5 }).includes(CHECK_RULE));
  assert.ok(reviewPrompt({ goal: 'g', list: '', checks: '', changes: '', last: false }).includes(CHECK_RULE));
  assert.match(formatPrompt('plan', 'some prose'), /^MISSION_FORMAT\n[\s\S]*"items"[\s\S]*some prose$/);
  const root = mkdtempSync(join(tmpdir(), 'mission-prose-'));
  try {
    const goal = { id: 'g', revision: 1, phase: 'active' };
    let made = false;
    const goals = { create: () => { made = true; goal.phase = 'active'; return goal; }, get: () => (made ? goal : undefined), pause: () => {}, resume: () => {}, complete: () => { goal.phase = 'complete'; }, clear: () => { made = false; } };
    const labels = [];
    const subagents = {
      startActivation: async (spec) => {
        labels.push(spec.label);
        let text = 'did it';
        if (spec.label === 'Mission: planner' || spec.label === 'Mission: planner (again)') text = '**Plan created.** I wrote PLAN.md with two items: write the bio, then write the report.';
        else if (spec.label === 'Mission: planner (format)') text = '{"summary":"s","items":[{"title":"Write the bio"},{"title":"Write the report"}],"checks":[]}';
        else if (spec.label === 'Mission: reviewer') text = 'Looks good to me, everything is done.';
        else if (spec.label === 'Mission: reviewer (format)') text = '{"verdict":"approve","note":"fine","items":[]}';
        return { childId: 'c', result: Promise.resolve({ output: [{ type: 'text', text }], stopReason: 'end' }) };
      },
    };
    const points = { take: async () => ({ id: 'p', number: 1 }), files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '' };
    const runner = createRunner({ get: (name) => ({ goals, subagents })[name] }, { settings: () => ({ limits: { maxItems: 12, maxTries: 3, maxReviews: 2, maxSteps: 60, waitMinutes: 3 }, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {}, home: undefined });
    const agent = { id: 'p1', model: { current: () => ({ provider: 'p', model: 'm' }) } };
    await runner.start(agent, 'run the plan.', { mode: 'auto', root }, { kind: 'long', long: { minutes: 30, laps: 1 } });
    const planned = await runner.step(agent, new AbortController().signal, 60000);
    assert.deepEqual(labels, ['Mission: planner', 'Mission: planner (again)', 'Mission: planner (format)']);
    assert.match(planned, /2 items/);
    assert.deepEqual(runner.runOf('p1').items.map((item) => item.title), ['Write the bio', 'Write the report']);
    await runner.step(agent, new AbortController().signal, 60000);
    await runner.step(agent, new AbortController().signal, 60000);
    await runner.step(agent, new AbortController().signal, 60000); // the review
    assert.ok(labels.includes('Mission: reviewer (format)'));
    assert.equal(runner.runOf('p1').reviewNote, 'fine', 'the review was read from the formatted answer');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the planner and the reviewer are known as readers while they work; a check rule for pipelines', async () => {
  const { createRunner } = await import('../runner.js');
  const { CHECK_RULE } = await import('../lib/prompts.js');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  assert.match(CHECK_RULE, /ends in wc, head, sort or echo always passes/);
  const root = mkdtempSync(join(tmpdir(), 'mission-reader-'));
  try {
    const goal = { id: 'g', revision: 1, phase: 'active' };
    let made = false;
    const goals = { create: () => { made = true; return goal; }, get: () => (made ? goal : undefined), pause: () => {}, resume: () => {}, complete: () => {}, clear: () => {} };
    let runner;
    const seen = {};
    let n = 0;
    const subagents = {
      startActivation: async (spec) => {
        const childId = `child-${n += 1}`;
        // While it works, ask who it is.
        const result = new Promise((resolve) => setTimeout(() => {
          seen[spec.label] = runner.readerOf(childId);
          resolve({ output: [{ type: 'text', text: spec.label === 'Mission: planner' ? '{"items":[{"title":"one"}],"checks":[]}' : 'did it' }], stopReason: 'end' });
        }, 5));
        return { childId, result };
      },
    };
    const points = { take: async () => ({ id: 'p', number: 1 }), files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '' };
    runner = createRunner({ get: (name) => ({ goals, subagents })[name] }, { settings: () => ({ limits: { maxItems: 12, maxTries: 3, maxReviews: 2, maxSteps: 60, waitMinutes: 3 }, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {}, home: undefined });
    const agent = { id: 'r1', model: { current: () => ({ provider: 'p', model: 'm' }) } };
    await runner.start(agent, 'do one small thing', { mode: 'auto', root }, { kind: 'long', long: { minutes: 30, laps: 1 } });
    for (let i = 0; i < 4; i += 1) await runner.step(agent, new AbortController().signal, 60000);
    assert.equal(seen['Mission: planner'], 'the planner');
    assert.equal(seen['Mission: item 1'], '', 'a worker writes');
    assert.equal(seen['Mission: reviewer'], 'the reviewer');
    assert.equal(runner.readerOf('child-1'), '', 'forgotten once it is done');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a Recon conversation\'s run: commands are dropped (the reviewer judges), helpers use the conversation\'s model, workers are told the folder', async () => {
  const { createRunner } = await import('../runner.js');
  const { NO_COMMANDS_PLAN, NO_COMMANDS_WORK } = await import('../lib/prompts.js');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = mkdtempSync(join(tmpdir(), 'mission-recon-'));
  try {
    const goal = { id: 'g', revision: 1, phase: 'active' };
    let made = false;
    const goals = { create: () => { made = true; return goal; }, get: () => (made ? goal : undefined), pause: () => {}, resume: () => {}, complete: () => {}, clear: () => {} };
    const seen = [];
    const subagents = {
      startActivation: async (spec) => {
        seen.push({ label: spec.label, model: spec.agentOptions?.model, prompt: spec.prompt?.[0]?.text ?? '' });
        const text = spec.label === 'Mission: planner' ? '{"items":[{"title":"Search the forums","check":"curl https://example.com"}],"checks":["ls"]}' : 'found it';
        return { childId: `c${seen.length}`, result: Promise.resolve({ output: [{ type: 'text', text }], stopReason: 'end' }) };
      },
    };
    // The conversation is set to "different models", and its tier has other models for the roles.
    const modes = { helperModels: () => 'roles' };
    const modelTiers = { resolveTier: () => ({ id: 't' }), roleRoute: () => ({ provider: 'cloud', model: 'big-cloud-model' }) };
    const points = { take: async () => ({ id: 'p', number: 1 }), files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '' };
    const runner = createRunner({ get: (name) => ({ goals, subagents, modes, modelTiers })[name] }, { settings: () => ({ limits: { maxItems: 12, maxTries: 3, maxReviews: 2, maxSteps: 60, waitMinutes: 3 }, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {}, home: undefined });
    const agent = { id: 'rc', model: { current: () => ({ provider: 'local', model: 'home-model' }) } };
    await runner.start(agent, 'find what the forums say', { mode: 'restricted', root }, { kind: 'long', long: { minutes: 30, laps: 1, isolated: true } });
    await runner.step(agent, new AbortController().signal, 60000); // plan
    const run = runner.runOf('rc');
    assert.deepEqual(run.checks, [], 'no overall commands');
    assert.equal(run.items[0].check, '', 'no item command');
    assert.ok(seen[0].prompt.includes(NO_COMMANDS_PLAN));
    const worked = await runner.step(agent, new AbortController().signal, 60000); // item 1
    assert.match(worked, /no command proves it, so the reviewer will judge it/);
    assert.ok(seen[1].prompt.includes(NO_COMMANDS_WORK));
    assert.ok(seen[1].prompt.includes(`Working folder: ${root}. Keep every file you write inside it.`));
    assert.deepEqual([...new Set(seen.map((entry) => entry.model))], ['home-model'], 'every helper on the conversation\'s own model');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/** A Bench conversation's Long run with stand-in helpers: the planner's answer, and what each helper was told and on which model. */
async function benchRun({ checks, plan, long }) {
  const { createRunner } = await import('../runner.js');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = mkdtempSync(join(tmpdir(), 'mission-bench-'));
  const goal = { id: 'g', revision: 1, phase: 'active' };
  let made = false;
  const goals = { create: () => { made = true; return goal; }, get: () => (made ? goal : undefined), pause: () => {}, resume: () => {}, complete: () => {}, clear: () => {} };
  const seen = [];
  const subagents = {
    startActivation: async (spec) => {
      seen.push({ label: spec.label, model: spec.agentOptions?.model, prompt: spec.prompt?.[0]?.text ?? '' });
      const text = spec.label === 'Mission: planner' ? JSON.stringify(plan) : 'done';
      return { childId: `c${seen.length}`, result: Promise.resolve({ output: [{ type: 'text', text }], stopReason: 'end' }) };
    },
  };
  const modes = { helperModels: () => 'roles' };
  const modelTiers = { resolveTier: () => ({ id: 't' }), roleRoute: () => ({ provider: 'cloud', model: 'role-model' }) };
  const points = { take: async () => ({ id: 'p', number: 1 }), files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '' };
  const runner = createRunner({ get: (name) => ({ goals, subagents, modes, modelTiers })[name] }, { settings: () => ({ limits: { maxItems: 12, maxTries: 3, maxReviews: 2, maxSteps: 60, waitMinutes: 3 }, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {}, home: undefined });
  const agent = { id: 'bc', model: { current: () => ({ provider: 'local', model: 'home-model' }) } };
  const events = [];
  runner.onEvent((event) => events.push(event));
  await runner.start(agent, 'look up the board', { mode: 'auto', root }, { kind: 'long', long: long ?? { minutes: 30, laps: 1, bench: { checks, closedPorts: true } } });
  return { runner, agent, seen, events, root };
}

test('a Bench conversation\'s run, checks on: they run as in every tab, with the Mac\'s device ports closed; workers are told they have no commands; nothing else of Recon\'s rules', async () => {
  const { existsSync, rmSync } = await import('node:fs');
  const { NO_COMMANDS_PLAN, NO_COMMANDS_WORK } = await import('../lib/prompts.js');
  const { PORTS_CLOSED_NOTE } = await import('../runner.js');
  // The Mac's own debug port, when this Mac has one: no device of anyone's.
  const port = existsSync('/dev/cu.debug-console') ? '/dev/cu.debug-console' : '';
  const plan = { items: [{ title: 'Write the notes', check: 'echo fine > /dev/null && echo ok' }, ...(port ? [{ title: 'Read the port', check: `: < ${port} && echo opened` }] : [])], checks: [] };
  const { runner, agent, seen, events, root } = await benchRun({ checks: true, plan });
  try {
    await runner.step(agent, new AbortController().signal, 60000); // plan
    const run = runner.runOf('bc');
    assert.deepEqual(run.long.bench, { checks: true, closedPorts: true });
    assert.equal(run.items[0].check, 'echo fine > /dev/null && echo ok', 'the planner\'s checks are kept');
    assert.ok(!seen[0].prompt.includes(NO_COMMANDS_PLAN), 'the planner may write checks');
    const first = await runner.step(agent, new AbortController().signal, 60000); // item 1
    assert.ok(seen[1].prompt.includes(NO_COMMANDS_WORK), 'a worker in Bench has no commands');
    assert.equal(run.items[0].status, 'verified', first);
    assert.match(first, /PASSED: its command was run and passed/);
    if (port) {
      const second = await runner.step(agent, new AbortController().signal, 60000); // item 2
      assert.match(second, /Operation not permitted/);
      assert.ok(second.includes(PORTS_CLOSED_NOTE), second);
      assert.notEqual(run.items[1].status, 'verified');
    }
    assert.ok(seen.some((entry) => entry.model === 'role-model'), 'helpers keep the conversation\'s model choice (not Recon\'s one model)');
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(events.some((event) => event.goal === 'look up the board'), 'its events carry the goal, unlike Recon\'s');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a Bench conversation\'s run, checks switched off in Settings: no commands at all, the reviewer judges, as in a Recon run', async () => {
  const { rmSync } = await import('node:fs');
  const { NO_COMMANDS_PLAN } = await import('../lib/prompts.js');
  const { runner, agent, seen, root } = await benchRun({ checks: false, plan: { items: [{ title: 'Write the notes', check: 'ls' }], checks: ['ls'] } });
  try {
    await runner.step(agent, new AbortController().signal, 60000); // plan
    const run = runner.runOf('bc');
    assert.deepEqual(run.checks, []);
    assert.equal(run.items[0].check, '');
    assert.ok(seen[0].prompt.includes(NO_COMMANDS_PLAN));
    assert.match(await runner.step(agent, new AbortController().signal, 60000), /no command proves it, so the reviewer will judge it/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the check sandbox: device ports are closed only when asked; without the sandbox a Bench check is not run at all', async () => {
  const { fence, runCommand, DEVICE_PORTS } = await import('../lib/shell.js');
  assert.ok(!fence('/x').includes(DEVICE_PORTS), 'every other tab: as before');
  assert.ok(fence('/x', { closePorts: true }).endsWith(DEVICE_PORTS), 'the last rule wins');
  const missing = await runCommand({ command: 'echo hi', root: '/', closePorts: true, sandbox: '/nonexistent/sandbox-exec' });
  assert.equal(missing.ok, false);
  assert.match(missing.output, /sandbox is not available, so this check was not run/);
});

test('a Recon run with checks switched on: checks are kept and run with no internet and only in the run\'s folder; workers still have no commands; Recon\'s other rules stay', async () => {
  const { createRunner } = await import('../runner.js');
  const { NO_COMMANDS_PLAN, NO_COMMANDS_WORK, OFFLINE_CHECKS_PLAN } = await import('../lib/prompts.js');
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createServer } = await import('node:http');
  // A live server on this Mac: reachable from outside the sandbox, so a refused check can only be the sandbox.
  const server = createServer((_req, res) => res.end('reached'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const root = mkdtempSync(join(tmpdir(), 'mission-recon-checks-'));
  try {
    writeFileSync(join(root, 'findings.md'), 'the forum named the alias');
    const goal = { id: 'g', revision: 1, phase: 'active' };
    let made = false;
    const goals = { create: () => { made = true; return goal; }, get: () => (made ? goal : undefined), pause: () => {}, resume: () => {}, complete: () => {}, clear: () => {} };
    const seen = [];
    const plan = { items: [{ title: 'Note the alias', check: 'grep -q alias findings.md' }, { title: 'Phone home', check: `curl -sS --max-time 3 http://127.0.0.1:${port}/ | grep -q reached` }], checks: [] };
    const subagents = {
      startActivation: async (spec) => {
        seen.push({ label: spec.label, model: spec.agentOptions?.model, prompt: spec.prompt?.[0]?.text ?? '' });
        const text = spec.label === 'Mission: planner' ? JSON.stringify(plan) : 'done';
        return { childId: `c${seen.length}`, result: Promise.resolve({ output: [{ type: 'text', text }], stopReason: 'end' }) };
      },
    };
    const modes = { helperModels: () => 'roles' };
    const modelTiers = { resolveTier: () => ({ id: 't' }), roleRoute: () => ({ provider: 'cloud', model: 'big-cloud-model' }) };
    const points = { take: async () => ({ id: 'p', number: 1 }), files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '' };
    const runner = createRunner({ get: (name) => ({ goals, subagents, modes, modelTiers })[name] }, { settings: () => ({ limits: { maxItems: 12, maxTries: 3, maxReviews: 2, maxSteps: 60, waitMinutes: 3 }, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {}, home: undefined });
    const agent = { id: 'rc', model: { current: () => ({ provider: 'local', model: 'home-model' }) } };
    await runner.start(agent, 'find what the forums say', { mode: 'restricted', root }, { kind: 'long', long: { minutes: 30, laps: 1, isolated: true, offlineChecks: true } });
    await runner.step(agent, new AbortController().signal, 60000); // plan
    const run = runner.runOf('rc');
    assert.equal(run.long.offlineChecks, true);
    assert.equal(run.items[0].check, 'grep -q alias findings.md', 'checks are kept');
    assert.ok(seen[0].prompt.includes(OFFLINE_CHECKS_PLAN));
    assert.ok(!seen[0].prompt.includes(NO_COMMANDS_PLAN));
    const first = await runner.step(agent, new AbortController().signal, 60000);
    assert.match(first, /PASSED: its command was run and passed/);
    assert.ok(seen[1].prompt.includes(NO_COMMANDS_WORK), 'workers still have no commands');
    const second = await runner.step(agent, new AbortController().signal, 60000);
    assert.doesNotMatch(second, /PASSED/, 'the check could not reach the server');
    assert.notEqual(run.items[1].status, 'verified');
    assert.deepEqual([...new Set(seen.map((entry) => entry.model))], ['home-model'], 'still one model, as every Recon run');
  } finally {
    server.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('offlineChecks counts only with a Recon run: an ordinary run cannot ask for it', async () => {
  const { newRun, noChecks, offlineChecks } = await import('../lib/run.js');
  const ordinary = newRun({ id: 'x', goal: 'g', mode: 'Auto', root: '/r', kind: 'long', long: { offlineChecks: true } });
  assert.equal(ordinary.long.offlineChecks, undefined);
  assert.equal(offlineChecks(ordinary), false);
  const recon = newRun({ id: 'y', goal: 'g', mode: 'Restricted', root: '/r', kind: 'long', long: { isolated: true } });
  assert.equal(noChecks(recon), true, 'Recon without the switch: no checks, as before');
  const { offlineFence, runCommand } = await import('../lib/shell.js');
  const profile = offlineFence('/private/tmp/x', '/Users/someone');
  for (const rule of ['(deny network*)', '(deny mach-lookup)', '(deny file-read* (subpath "/Users/someone")', '"/usr/bin/open"']) assert.ok(profile.includes(rule), rule);
  const missing = await runCommand({ command: 'echo hi', root: '/', offline: true, sandbox: '/nonexistent/sandbox-exec' });
  assert.match(missing.output, /checks must run without the internet/);
});

test('a Recon run ended while a step was under way: the step writes nothing into the run\'s folder again', async () => {
  const { createRunner } = await import('../runner.js');
  const { mkdtempSync, rmSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = mkdtempSync(join(tmpdir(), 'mission-recon-end-'));
  try {
    const goal = { id: 'g', revision: 1, phase: 'active' };
    let made = false;
    const goals = { create: () => { made = true; return goal; }, get: () => (made ? goal : undefined), pause: () => {}, resume: () => {}, complete: () => {}, clear: () => {} };
    const subagents = {
      startActivation: async (spec) => (spec.label === 'Mission: planner'
        ? { childId: 'p', result: Promise.resolve({ output: [{ type: 'text', text: '{"items":[{"title":"one"}],"checks":[]}' }], stopReason: 'end' }) }
        : { childId: 'w', result: new Promise(() => {}), dispose: () => {} }),
    };
    const points = { take: async () => ({ id: 'p', number: 1 }), files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '' };
    const runner = createRunner({ get: (name) => ({ goals, subagents })[name] }, { settings: () => ({ limits: { maxItems: 12, maxTries: 3, maxReviews: 2, maxSteps: 60, waitMinutes: 3 }, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {}, home: undefined });
    const agent = { id: 'rc', model: { current: () => ({ provider: 'local', model: 'm' }) } };
    const events = [];
    runner.onEvent((event) => events.push(event));
    await runner.start(agent, 'secret goal words', { mode: 'restricted', root }, { kind: 'long', long: { minutes: 30, laps: 1, isolated: true } });
    await runner.step(agent, new AbortController().signal, 60000);
    const under = runner.step(agent, new AbortController().signal, 60000);
    await new Promise((resolve) => setTimeout(resolve, 20));
    runner.end(agent);
    rmSync(join(root, '.dsh-mission'), { recursive: true, force: true }); // what Recon's End and wipe does
    await under;
    assert.equal(existsSync(join(root, '.dsh-mission')), false, 'not written again');
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(events.length > 0);
    assert.equal(events.every((event) => event.goal === ''), true, 'a Recon run\'s events carry no goal');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a helper whose turn failed and that the app never settles is closed, so the retry without a thinking level runs (16 November: a Recon run hung)', async () => {
  const { createRunner } = await import('../runner.js');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = mkdtempSync(join(tmpdir(), 'mission-stuck-'));
  try {
    const goal = { id: 'g', revision: 1, phase: 'active' };
    let made = false;
    const goals = { create: () => { made = true; return goal; }, get: () => (made ? goal : undefined), pause: () => {}, resume: () => {}, complete: () => {}, clear: () => {} };
    const listeners = [];
    const closed = [];
    let n = 0;
    const subagents = {
      startActivation: async (spec) => {
        n += 1;
        const childId = `child-${n}`;
        if (spec.agentOptions?.reasoningEffort === 'high') {
          // Like the app: the turn fails at once, but something still waits in the helper's inbox, so the
          // result is not settled until the helper is closed.
          let settle;
          const result = new Promise((resolve) => { settle = resolve; });
          setTimeout(() => { for (const listener of listeners) listener({ id: childId }, { type: 'turn/end', data: { reason: { kind: 'error', error: { message: 'does not support reasoning effort "high"' } } } }); }, 5);
          return { childId, result, dispose: () => { closed.push(childId); settle({ output: [], stopReason: 'error' }); } };
        }
        return { childId, result: Promise.resolve({ output: [{ type: 'text', text: '{"items":[{"title":"one"}],"checks":[]}' }], stopReason: 'end' }) };
      },
    };
    const ctx = { get: (name) => ({ goals, subagents })[name], on: (name, listener) => { if (name === 'session/event') listeners.push(listener); } };
    const points = { take: async () => ({ id: 'p', number: 1 }), files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '' };
    const runner = createRunner(ctx, { settings: () => ({ limits: { maxItems: 12, maxTries: 3, maxReviews: 2, maxSteps: 60, waitMinutes: 3 }, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {}, home: undefined, failedTurnMs: 30 });
    const agent = { id: 'stuck', model: { current: () => ({ provider: 'local', model: 'no-high' }) } };
    await runner.start(agent, 'plan something small', { mode: 'auto', root }, { kind: 'long', long: { minutes: 30, laps: 1, effort: true } });
    const planned = await Promise.race([runner.step(agent, new AbortController().signal, 60000), new Promise((resolve) => setTimeout(() => resolve('HUNG'), 3000))]);
    assert.notEqual(planned, 'HUNG', 'the step came back');
    assert.deepEqual(closed, ['child-1'], 'the stuck helper was closed');
    assert.match(planned, /1 item/, 'the planner was asked again without a thinking level, and planned');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a Creator Plus conversation\'s run: its checks run in the offline fence with no keys, its workers have no commands', { skip: false }, async () => {
  const { rmSync, existsSync: exists } = await import('node:fs');
  const { NO_COMMANDS_WORK, OFFLINE_CHECKS_PLAN } = await import('../lib/prompts.js');
  const outside = `/private/tmp/mission-creator-escape-${process.pid}`;
  process.env.MISSION_TEST_KEY = 'a-key-the-check-must-not-see';
  const plan = { items: [{ title: 'No keys', check: 'test -z "$MISSION_TEST_KEY" && echo clean' }, { title: 'Stay inside', check: `echo x > ${outside} && echo wrote` }], checks: [] };
  const { runner, agent, seen, root } = await benchRun({ plan, long: { minutes: 30, laps: 1, creator: { cleanEnv: true } } });
  try {
    await runner.step(agent, new AbortController().signal, 60000); // plan
    const run = runner.runOf('bc');
    assert.deepEqual(run.long.creator, { cleanEnv: true });
    assert.ok(seen[0].prompt.includes(OFFLINE_CHECKS_PLAN), 'the planner is told the checks are fenced');
    const first = await runner.step(agent, new AbortController().signal, 60000);
    assert.ok(seen[1].prompt.includes(NO_COMMANDS_WORK), 'a worker in Creator Plus has no commands');
    assert.equal(run.items[0].status, 'verified', first);
    const second = await runner.step(agent, new AbortController().signal, 60000);
    assert.notEqual(run.items[1].status, 'verified', second);
    assert.equal(exists(outside), false, 'nothing written outside the run\'s folder');
  } finally {
    delete process.env.MISSION_TEST_KEY;
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { force: true });
  }
});

test('the fence for checks: only the usual check programs start; launchctl, lsappinfo, open and anything unknown are refused; no launchd job', { skip: !existsSync('/usr/bin/sandbox-exec') && 'needs macOS' }, async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { offlineFence, runCommand, CHECK_PROGRAMS } = await import('../lib/shell.js');
  const profile = offlineFence('/private/tmp/x', '/Users/someone');
  for (const rule of ['(deny process-exec)', '(deny job-creation)', '(deny file-map-executable)', '(deny signal)', '(literal "/bin/launchctl")']) assert.ok(profile.includes(rule), rule);
  assert.ok(!CHECK_PROGRAMS.includes('/bin/launchctl') && !CHECK_PROGRAMS.includes('/usr/bin/open'));
  const root = mkdtempSync(join(tmpdir(), 'mission-fence-'));
  try {
    writeFileSync(join(root, 'findings.md'), 'alias\n');
    assert.equal((await runCommand({ command: 'grep -q alias findings.md && wc -l findings.md && ls', root, offline: true })).ok, true, 'the usual checks work');
    for (const command of ['/bin/launchctl managername', '/usr/bin/lsappinfo front', '/usr/bin/open -g /tmp', '/usr/bin/curl -s https://example.com']) {
      const ran = await runCommand({ command, root, offline: true });
      assert.equal(ran.ok, false, command);
      assert.match(ran.output, /Operation not permitted/, command);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the checkpoint store is the host\'s: a check cannot write it, and a planted git setting runs nothing', { skip: !existsSync('/usr/bin/sandbox-exec') && 'needs macOS' }, async () => {
  const { mkdtempSync, rmSync, writeFileSync, readFileSync, appendFileSync, mkdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { fence, offlineFence, runCommand } = await import('../lib/shell.js');
  const { openCheckpoints, unsafeStoreConfig, GIT_SAFE } = await import('../lib/checkpoints.js');
  const root = mkdtempSync(join(tmpdir(), 'mission-store-'));
  const gitHome = mkdtempSync(join(tmpdir(), 'mission-git-home-test-'));
  const ran = join(gitHome, 'filter-ran');
  try {
    writeFileSync(join(root, 'a.txt'), 'one\n');
    const points = openCheckpoints(root, { gitHome });
    if (!points.available) return;
    await points.take('first');
    // (a) Both fences close the store to checks; offline checks keep their temporary folder.
    for (const profile of [fence(root), offlineFence(root)]) assert.match(profile, /\(deny file-write\* \(subpath "[^"]*\/\.dsh-mission"\)/);
    for (const offline of [false, true]) {
      const tried = await runCommand({ command: 'printf "[filter \\"x\\"]\\n\\tclean = touch FILTER\\n" >> .dsh-mission/checkpoints.git/config', root, offline });
      assert.equal(tried.ok, false, `offline ${offline}`);
      assert.match(tried.output, /Operation not permitted/);
    }
    assert.equal((await runCommand({ command: 'echo x > .dsh-mission/tmp/ok && echo written', root, offline: true })).ok, true, 'an offline check still has its temporary folder');
    const { realpathSync } = await import('node:fs');
    assert.deepEqual(unsafeStoreConfig(readFileSync(join(root, '.dsh-mission', 'checkpoints.git', 'config'), 'utf8'), [root, realpathSync(root)]), [], 'what git init writes is allowed');
    assert.deepEqual(unsafeStoreConfig('[core]\n\tworktree = /somewhere/else\n', [root]), ['core.worktree'], 'a work tree elsewhere is not');
    // (b) A setting planted anyway (by anything but a check): git is not run at all, and nothing runs.
    writeFileSync(join(root, '.gitattributes'), '* filter=x diff=x\n');
    appendFileSync(join(root, '.dsh-mission', 'checkpoints.git', 'config'), `[filter "x"]\n\tclean = touch '${ran}'; cat\n[diff "x"]\n\ttextconv = touch '${ran}'; cat\n`);
    writeFileSync(join(root, 'a.txt'), 'two\n');
    await assert.rejects(points.take('second'), /its settings were changed \(\[filter "x"\], filter\.clean/);
    await assert.rejects(points.idOf(1), /settings were changed/);
    await assert.rejects(points.back(1), /settings were changed/, 'not even going back');
    assert.equal(existsSync(ran), false, 'the planted filter never ran');
    assert.deepEqual(unsafeStoreConfig('[core]\n\tfsmonitor = /tmp/x\n[alias]\n\tst = !sh\n[gpg]\n\tprogram = x\n[include]\n\tpath = /x\n'), ['core.fsmonitor', '[alias]', 'alias.st', '[gpg]', 'gpg.program', '[include]', 'include.path']);
    for (const flag of ['core.attributesFile=/dev/null', 'core.hooksPath=/dev/null', 'commit.gpgSign=false', 'core.fsmonitor=false', 'diff.external=']) assert.ok(GIT_SAFE.includes(flag), flag);
    // A user-wide git setting is not read either: no global config, and git's HOME an empty folder of the host's own.
    const other = mkdtempSync(join(tmpdir(), 'mission-store-2-'));
    try {
      writeFileSync(join(other, '.gitattributes'), '* filter=y\n');
      writeFileSync(join(other, 'b.txt'), 'b\n');
      writeFileSync(join(gitHome, '.gitconfig'), `[filter "y"]\n\tclean = touch '${ran}'; cat\n`);
      mkdirSync(join(gitHome, 'git'), { recursive: true });
      writeFileSync(join(gitHome, 'git', 'config'), `[filter "y"]\n\tclean = touch '${ran}'; cat\n`);
      await openCheckpoints(other, { gitHome }).take('user-wide');
      assert.equal(existsSync(ran), false, 'a user-wide filter never ran');
      // Every git call carries the safe settings; every diff refuses external tools and text converters; HOME is not in the folder.
      const log = join(gitHome, 'calls.log');
      const fake = join(gitHome, 'git-logged');
      writeFileSync(fake, `#!/bin/sh\nprintf '%s|HOME=%s|GLOBAL=%s\\n' "$*" "$HOME" "$GIT_CONFIG_GLOBAL" >> '${log}'\nexec /usr/bin/git "$@"\n`, { mode: 0o755 });
      writeFileSync(join(other, 'b.txt'), 'c\n');
      const logged = openCheckpoints(other, { git: fake, gitHome });
      await logged.take('logged');
      await logged.changes(await logged.idOf(1));
      const calls = readFileSync(log, 'utf8').trim().split('\n');
      assert.ok(calls.length >= 3);
      for (const call of calls) {
        for (const flag of ['core.attributesFile=/dev/null', 'core.hooksPath=/dev/null', 'commit.gpgSign=false', 'core.fsmonitor=false', 'diff.external=']) assert.ok(call.includes(flag), `${flag} in ${call}`);
        assert.ok(call.includes(`HOME=${gitHome}|`) && call.includes('GLOBAL=/dev/null'), call);
        if (/ diff /.test(call)) assert.ok(call.includes('--no-ext-diff') && call.includes('--no-textconv'), call);
      }
      assert.ok(calls.some((call) => / diff /.test(call)));
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(gitHome, { recursive: true, force: true });
  }
});

test('a check leaves no process behind: its process group is stopped when it ends', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { runCommand } = await import('../lib/shell.js');
  const root = mkdtempSync(join(tmpdir(), 'mission-late-'));
  try {
    const ran = await runCommand({ command: '(sleep 1.5; touch late.txt) & echo started', root });
    assert.match(ran.output, /started/);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    assert.equal(existsSync(join(root, 'late.txt')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
