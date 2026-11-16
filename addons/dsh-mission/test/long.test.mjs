// Long run (the owner's plan, Long run part): the engine's own rules, as plain data.
import test from 'node:test';
import assert from 'node:assert/strict';
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
