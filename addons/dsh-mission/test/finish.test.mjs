/**
 * Point 17 (owner, 20 November 2026): the end in every mode, and Finish it. After an end (never after End) a Mission can be
 * taken up again for what is still open, what it decided itself (the user may change it), what Full auto did not ask (the
 * user may allow it) and items not done yet; items done on a default are done again only where the answer differs.
 * Each test fails on the code before point 17.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { GIT_CANDIDATES } from '../lib/checkpoints.js';
import { APPROVAL_ERRORS, ENDED_BY_YOU, addApproval, addQuestion, answerMany, applyPlan, applyReview, applyWork, continueBlock, decideApproval, extraTime, finish, newRun, noteDecidedSeen, reviveRun } from '../lib/run.js';
import { planPrompt } from '../lib/prompts.js';
import { stripOf } from '../lib/strip.js';
import { FINISH_ERRORS, FINISH_SHOW_TEXT } from '../runner.js';
import { APPROVE, PLAN, bench, tick } from './bench-pool.mjs';
import { appHarness } from './app-harness.mjs';

const hasGit = GIT_CANDIDATES.some((path) => existsSync(path));
const T0 = Date.parse('2026-11-20T10:00:00Z');
/** A reviewer that sends item 2 back: it is not done when the lap limit ends the Mission. */
const SEND_BACK = JSON.stringify({ verdict: 'changes', note: 'item 2 is half done', items: [{ id: '2', ok: false, note: 'half' }] });
const mission = (long = {}) => newRun({ id: 'r', goal: 'g', mode: 'Full Auto', root: '/x', limits: {}, at: T0, kind: 'long', long: { minutes: 60, laps: 3, ...long } });

test('what Finish it takes up: open questions, late answers and approvals as before; also decided questions, not-asked steps and items not done yet; End stays final', () => {
  const done = mission();
  applyPlan(done, { items: [{ title: 'a' }] });
  applyWork(done, '1', { check: { ok: true, output: '' } });
  finish(done, '', T0 + 60_000);
  assert.equal(continueBlock(done), 'nothing', 'all done, nothing decided');
  const undone = mission();
  applyPlan(undone, { items: [{ title: 'a' }, { title: 'b' }] });
  finish(undone, '', T0 + 60_000);
  assert.equal(continueBlock(undone), '', 'items not done yet');
  const ended = mission();
  applyPlan(ended, { items: [{ title: 'a' }, { title: 'b' }] });
  finish(ended, ENDED_BY_YOU, T0 + 60_000);
  assert.equal(continueBlock(ended), 'nothing', 'after End: never for what it left');
  const decided = mission({ needs: 'decide' });
  applyPlan(decided, { items: [{ title: 'a' }], questions: [{ question: 'Which city?', default: 'Berlin' }] });
  applyWork(decided, '1', { check: { ok: true, output: '' } });
  finish(decided, '', T0 + 60_000);
  assert.equal(continueBlock(decided), '', 'it decided a question itself');
  const unasked = mission({ needs: 'decide' });
  applyPlan(unasked, { items: [{ title: 'a' }] });
  applyWork(unasked, '1', { check: { ok: true, output: '' } });
  addApproval(unasked, { kind: 'files', key: 'files:a', what: 'Change a', item: '1', unasked: true });
  finish(unasked, '', T0 + 60_000);
  assert.equal(continueBlock(unasked), '', 'a step it did not ask for');
  const late = mission();
  addQuestion(late, { text: 'Q?' });
  finish(late, ENDED_BY_YOU, T0 + 60_000);
  assert.equal(continueBlock(late), '', 'stage C\'s rule after End is unchanged');
});

test('the view and the strip after the end: decided, not asked, not done (with why), the end\'s kind; canContinue for them', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }], { questions: [{ question: 'Which city?', default: 'Berlin' }] }) } : spec.label === 'Mission: item 1' ? { text: 'DONE: done' } : spec.label === 'Mission: item 2' ? { hold: true } : { text: APPROVE }) });
  try {
    await app.runner.start(app.agent, 'list the cities', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2, needs: 'decide' } });
    await app.step();
    await tick(30);
    const two = app.seen.find((entry) => entry.label === 'Mission: item 2').childId;
    app.runner.parkFor(two, { kind: 'files', key: 'files:b.txt', what: 'Change b.txt', files: ['b.txt'] });
    app.runner.finishLap(app.agent);
    app.runner.cut('conv');
    await tick(30);
    app.runner.end(app.agent);
    const run = app.runner.runOf('conv');
    run.longEndKind = 'laps';
    run.stopReason = 'It reached its limit.';
    const view = app.runner.view('conv');
    assert.deepEqual(view.decided.map((entry) => [entry.id, entry.text, entry.chosen, entry.self]), [['q1', 'Which city?', 'Berlin', true]]);
    const item = view.items.find((entry) => entry.id === '2');
    assert.equal(item.tried, false);
    assert.equal(view.canContinue, true);
    const strip = stripOf({ run: { ...view, goalPhase: '' } });
    assert.equal(strip.state, 'finished');
    assert.deepEqual(strip.decided.map((entry) => entry.id), ['q1']);
    assert.deepEqual(strip.unasked.map((entry) => [entry.id, entry.what]), [['a1', 'Change b.txt']]);
    assert.deepEqual(strip.undone.map((entry) => [entry.id, entry.mark]), [['2', 'NOT STARTED']]);
    assert.equal(strip.endKind, 'laps');
    assert.equal(strip.canContinue, true);
    assert.equal(strip.main, 'send', 'Start Mission and Send are back after the end');
  } finally {
    app.done();
  }
});

test('a changed answer to what it decided redoes its items; the same answer redoes nothing (also while it runs)', () => {
  const run = mission({ needs: 'decide' });
  applyPlan(run, { items: [{ title: 'a' }, { title: 'b' }] });
  const asked = addQuestion(run, { text: 'Tabs or spaces?', assume: 'spaces', items: ['1'], from: 'item' });
  applyWork(run, '1', { assumed: 'spaces' });
  run.items[0].assumedBy = { [asked.id]: 'spaces' };
  addQuestion(run, { text: 'tabs or spaces', assume: 'tabs', items: ['2'], from: 'item' });
  applyWork(run, '2', { assumed: 'tabs' });
  run.items[1].assumedBy = { [asked.id]: 'tabs' };
  finish(run, '', T0 + 60_000);
  const copy = structuredClone(run);
  copy.status = 'running';
  const out = answerMany(copy, [{ id: 'q1', text: 'Spaces.' }], T0 + 70_000, { force: true });
  assert.deepEqual(out.reopened, ['2'], 'only the item done on another answer is done again');
  // Every item agrees with the answer: nothing redone; the extra time counts nothing for it.
  run.items[1].assumedBy = { [asked.id]: 'spaces' };
  const same = structuredClone(run);
  same.status = 'running';
  const none = answerMany(same, [{ id: 'q1', text: 'spaces' }], T0 + 70_000, { force: true });
  assert.deepEqual([none.reopened, none.same, same.questions[0].sameAsChosen], [[], ['q1'], true]);
  assert.equal(extraTime(run, [{ id: 'q1', text: 'spaces' }], T0 + 70_000).run, false, 'nothing to do: no time');
  assert.equal(extraTime(run, [{ id: 'q1', text: 'tabs' }], T0 + 70_000).run, true);
  // While it runs (Ask, keep working): an answer equal to what the item assumed redoes nothing.
  const live = mission();
  applyPlan(live, { items: [{ title: 'a' }] });
  addQuestion(live, { text: 'Colour?', assume: 'blue', items: ['1'], from: 'item' });
  applyWork(live, '1', { assumed: 'blue' });
  assert.deepEqual(answerMany(live, [{ id: 'q1', text: 'Blue' }], T0 + 1000).reopened, []);
  assert.equal(live.items[0].status, 'unverified');
});

test('review: Full auto\'s planner and reviewer decisions: a changed answer with Finish it redoes the items that kept to it (named by the plan, else the workers told it); the same answer redoes nothing', () => {
  assert.match(planPrompt({ goal: 'g', root: '/x', files: '', maxItems: 5, needs: 'decide' }), /"default": "what you decided", "items": \[numbers of the items that depend on it\]/);
  // The plan names no item: every worker was told to keep to it.
  const run = mission({ needs: 'decide' });
  applyPlan(run, { items: [{ title: 'schema' }, { title: 'queries' }], questions: [{ question: 'Which database?', default: 'PostgreSQL' }] });
  assert.deepEqual([run.questions[0].self, run.questions[0].chosenBy, run.questions[0].items], [true, 'plan', []]);
  for (const item of run.items) {
    noteDecidedSeen(run, item);
    applyWork(run, item.id, {});
    item.status = 'verified';
  }
  // A review decision after both were done: no worker kept to it yet.
  applyReview(run, { verdict: 'approve', items: [], questions: [{ question: 'Which port?', default: '5432' }] });
  finish(run, '', T0 + 60_000);
  const changed = structuredClone(run);
  changed.status = 'running';
  const out = answerMany(changed, [{ id: 'q1', text: 'SQLite' }], T0 + 70_000, { force: true });
  assert.deepEqual(out.reopened, ['1', '2'], 'both items kept to PostgreSQL');
  assert.equal(extraTime(run, [{ id: 'q1', text: 'SQLite' }], T0 + 70_000).units > 1, true, 'the extra time counts the redo');
  const same = structuredClone(run);
  same.status = 'running';
  assert.deepEqual(answerMany(same, [{ id: 'q1', text: 'postgresql' }], T0 + 70_000, { force: true }).reopened, []);
  const port = structuredClone(run);
  port.status = 'running';
  assert.deepEqual(answerMany(port, [{ id: 'q2', text: '6543' }], T0 + 70_000, { force: true }).reopened, [], 'no worker kept to the review\'s decision yet');
  // The plan names the items that depend on it: only those.
  const named = mission({ needs: 'decide' });
  applyPlan(named, { items: [{ title: 'schema' }, { title: 'docs' }], questions: [{ question: 'Which database?', default: 'PostgreSQL', items: [1] }] });
  assert.deepEqual(named.questions[0].items, ['1']);
  for (const item of named.items) {
    noteDecidedSeen(named, item);
    applyWork(named, item.id, {});
    item.status = 'verified';
  }
  finish(named, '', T0 + 60_000);
  named.status = 'running';
  assert.deepEqual(answerMany(named, [{ id: 'q1', text: 'SQLite' }], T0 + 70_000, { force: true }).reopened, ['1']);
});

test('a step Full auto did not ask: Allow takes the items up again (finished ones do only that step), Deny leaves them not done; never while it runs', () => {
  const run = mission({ needs: 'decide' });
  applyPlan(run, { items: [{ title: 'a' }, { title: 'b' }] });
  const first = addApproval(run, { kind: 'files', key: 'files:a', what: 'Change a', item: '1', unasked: true }).entry;
  const second = addApproval(run, { kind: 'command', key: 'command:x', what: 'Run x', item: '2', unasked: true, command: 'x' }).entry;
  applyWork(run, '1', { check: { ok: true, output: '' } });
  applyWork(run, '2', { aside: 'Not done: it needs your yes for Run x.', asideOn: [second.id] });
  assert.throws(() => decideApproval(run, first.id, 'allow'), { message: APPROVAL_ERRORS.notAsked });
  finish(run, '', T0 + 60_000);
  // A continue that brings no yes does not take the set-aside item up.
  const plain = structuredClone(run);
  reviveRun(plain, { minutes: 10, at: T0 + 70_000 });
  assert.equal(plain.items[1].status, 'aside');
  const allowed = structuredClone(run);
  const out = decideApproval(allowed, second.id, 'allow', { force: true });
  assert.deepEqual(out.reopened, ['2']);
  assert.equal(allowed.items[1].status, 'open');
  assert.deepEqual(allowed.items[1].resume.answers.map((answer) => [answer.kind, answer.command]), [['allowed', 'x']]);
  const redo = decideApproval(allowed, first.id, 'allow', { force: true });
  assert.deepEqual(redo.reopened, ['1'], 'the finished item does only that step');
  assert.equal(allowed.items[0].resume.answers[0].kind, 'redo');
  const denied = structuredClone(run);
  decideApproval(denied, second.id, 'deny', { force: true });
  assert.equal(denied.items[1].status, 'stuck');
  assert.equal(denied.items[1].note, 'You said no to: Run x; it could not be done without it.');
  // Extra time counts a set-aside item only when it would go on.
  assert.equal(extraTime(run, [], T0 + 70_000, [{ id: second.id, choice: 'deny' }]).units, 0);
  assert.equal(extraTime(run, [], T0 + 70_000, [{ id: second.id, choice: 'allow' }]).units, 1);
});

test('Finish it through the runner: a quote with no answers when items are not done; nothing to finish says so; a running Mission says it goes on already; a second Finish it after it ends again; resume says to press Finish it', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : /^Mission: item/.test(spec.label) ? { text: 'DONE: done' } : { text: SEND_BACK } ) });
  try {
    await app.runner.start(app.agent, 'do two things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 1 } });
    const run = app.runner.runOf('conv');
    run.limits.maxTries = 5;
    for (let i = 0; i < 8 && run.status === 'running'; i += 1) await app.step(300);
    assert.notEqual(run.status, 'running');
    assert.equal(run.items[1].status, 'open', 'not done at its lap limit');
    assert.equal(app.runner.view('conv').canContinue, true);
    assert.match(app.runner.resume(app.agent), new RegExp(`^${FINISH_SHOW_TEXT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.ok(run.showFrom > 0, 'the card shows again');
    const quote = app.runner.quoteContinue('conv', []);
    assert.equal(quote.run, true, 'zero answers: the item not done yet');
    const went = await app.runner.continueRun(app.agent, { answers: [], minutes: 20 });
    assert.match(went.said, /1 item not done yet is taken up again\./);
    assert.equal(run.status, 'running');
    assert.throws(() => app.runner.continueCheck('conv', []), { message: FINISH_ERRORS.already });
    for (let i = 0; i < 8 && run.status === 'running'; i += 1) await app.step(300);
    assert.notEqual(run.status, 'running');
    assert.equal(app.runner.view('conv').canContinue, true, 'a second Finish it after it ended again');
    run.items[1].status = 'stuck';
    assert.throws(() => app.runner.continueCheck('conv', []), { message: 'That Mission has ended and has no open questions, so it cannot be continued. Start Mission starts a new one.' });
  } finally {
    app.done();
  }
  // Only decided questions: a Finish it with nothing changed says what to do.
  const auto = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }], { questions: [{ question: 'Which city?', default: 'Berlin' }] }) } : spec.label === 'Mission: item 1' ? { text: 'DONE: done' } : { text: APPROVE }) });
  try {
    await auto.runner.start(auto.agent, 'list the cities', { mode: 'auto', root: auto.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 1, needs: 'decide' } });
    const run = auto.runner.runOf('conv');
    for (let i = 0; i < 8 && run.status === 'running'; i += 1) await auto.step(300);
    assert.equal(auto.runner.view('conv').canContinue, true);
    assert.throws(() => auto.runner.continueCheck('conv', []), { message: FINISH_ERRORS.nothing });
    const same = await auto.runner.continueRun(auto.agent, { answers: [{ id: 'q1', text: 'berlin' }], minutes: 10 });
    assert.deepEqual([same.ran, same.said], [false, 'Noted. Your answers match what it did, so nothing needs doing again; the Mission stays finished.']);
  } finally {
    auto.done();
  }
});

test('the continue route: one Finish it at a time per conversation', { skip: !hasGit }, async () => {
  const app = appHarness({ config: { longHelpers: 1, longLaps: 1 }, answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : /^Mission: item/.test(spec.label) ? { text: 'DONE: done' } : spec.label === 'Mission: reviewer' ? { text: SEND_BACK } : undefined) });
  try {
    const chat = app.open('c');
    assert.equal((await app.mission(chat, 'auto do two small things in this folder please')).kind, 'success');
    for (let i = 0; i < 10 && app.runner().view('c').status === 'running'; i += 1) await app.step(chat);
    assert.notEqual(app.runner().view('c').status, 'running');
    assert.equal(app.runner().view('c').canContinue, true);
    const [one, two] = await Promise.all([app.card({ sessionId: 'c', action: 'continue', answers: [], minutes: 10 }), app.card({ sessionId: 'c', action: 'continue', answers: [], minutes: 10 })]);
    const errors = [one.json.error, two.json.error].filter(Boolean);
    assert.deepEqual(errors, [FINISH_ERRORS.busy], JSON.stringify([one.json, two.json].map((json) => json.error ?? json.said)));
    assert.equal(app.runner().view('c').status, 'running', 'the first one continued it');
  } finally {
    app.done();
  }
});
