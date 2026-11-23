/**
 * Mission stage C follow-ups (owner, 20 November 2026). A: "A helper asking a question already answered gets the
 * earlier answer; the question is not shown again." B: "The time warning says the suggestion includes spare time."
 * Each test fails on the code before these follow-ups.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { addQuestion, alreadyAnswered, answerMany, applyPlan, applyReview, applyWork, continueBlock, decidedBefore, finish, followAnswer, lateRedo, newRun, nextStep, openQuestions, report, reviveRun, sameQuestion, userNotes } from '../lib/run.js';
import { stripOf } from '../lib/strip.js';
import { createRunner } from '../runner.js';

const T0 = Date.parse('2026-11-20T10:00:00Z');
const mission = (long = {}, limits = {}) => newRun({ id: 'r', goal: 'make the files', mode: 'Full Auto', root: '/x', limits, at: T0, kind: 'long', long: { minutes: 60, laps: 4, ...long } });
const ASKED = 'Should b.txt be in capitals?';

/** A Mission whose item 2 asked ASKED, finished on "lower case", and whose question the owner answered. */
const answered = (limits = {}) => {
  const run = mission({}, limits);
  applyPlan(run, { items: [{ title: 'a.txt' }, { title: 'b.txt' }], checks: [] });
  addQuestion(run, { text: ASKED, assume: 'lower case', items: ['2'], from: 'item' });
  applyWork(run, '2', { assumed: 'lower case' });
  const out = answerMany(run, [{ id: 'q1', text: 'Yes, capitals' }], T0 + 1000);
  assert.deepEqual(out.reopened, ['2']);
  return run;
};

// ---- Matching -------------------------------------------------------------------------------------------------

test('the same question: trimmed, spaces collapsed, any case, no end punctuation; nothing fuzzier', () => {
  assert.ok(sameQuestion('Should b.txt be in capitals?', '  should   B.TXT be in capitals '));
  assert.ok(sameQuestion('Which city?', 'which city?!.'));
  assert.ok(sameQuestion('Which city?', 'Which\ncity'));
  assert.ok(!sameQuestion('Which city?', 'Which cities?'), 'no fuzzy matching');
  assert.ok(!sameQuestion('Which city?', 'Which city should it be?'));
  assert.ok(!sameQuestion('?', '!'), 'nothing left to compare is never the same');
});

// ---- A worker asks an answered question again ---------------------------------------------------------------

test('a worker asking an answered question again: no new question, no card, no count; the item is tried again with your answer', () => {
  const run = answered();
  const before = run.questions.length;
  // The redo: the worker asks the same again (other case and punctuation) and finishes on its default.
  const kept = addQuestion(run, { text: 'should B.txt be in capitals', assume: 'lower case', items: ['2'], from: 'item' });
  assert.equal(kept, run.questions[0], 'the earlier answered question is given back');
  assert.equal(run.questions.length, before, 'no new question');
  assert.deepEqual(openQuestions(run), []);
  applyWork(run, '2', { assumed: 'lower case' });
  assert.equal(run.items[1].tries, 1);
  assert.equal(followAnswer(run, '2', kept, 'lower case', T0 + 2000), 'redo');
  assert.equal(run.items[1].status, 'open');
  assert.equal(run.items[1].note, 'This was already answered by the user: Yes, capitals. Use that answer; do not ask it again.');
  assert.equal(alreadyAnswered('x'), 'This was already answered by the user: x. Use that answer; do not ask it again.');
  assert.deepEqual(run.questions[0].items, ['2']);
  // Nothing in the strip, nothing to continue for.
  const strip = stripOf({ run: { id: 'r', kind: 'long', status: 'running', pausedAt: 0, pausedBy: '', stalled: '', goalPhase: 'active', lap: 0, laps: 4, deadline: T0 + 3600000, minutes: 60, finishLap: false, items: run.items, questions: run.questions }, now: T0 });
  assert.deepEqual(strip.questions, []);
  finish(run, '', T0 + 60000);
  // Point 17: items not done yet make it continuable (Finish it); the repeated question never does.
  for (const item of run.items) item.status = 'verified';
  assert.equal(continueBlock(run), 'nothing', 'a repeated answered question never makes a run continuable');
  assert.doesNotMatch(report(run), /Questions still open/);
});

test('a repeat stays within the item\'s tries: with none left it keeps its result, and the report says so plainly', () => {
  const run = answered({ maxTries: 2 });
  const asks = () => {
    const kept = addQuestion(run, { text: ASKED, assume: 'lower case', items: ['2'], from: 'item' });
    applyWork(run, '2', { assumed: 'lower case' });
    return followAnswer(run, '2', kept, 'lower case', T0 + 2000);
  };
  assert.equal(asks(), 'redo', 'try 1 of 2');
  assert.equal(asks(), 'kept', 'try 2 of 2: no try left, never a third');
  assert.equal(run.items[1].tries, 2);
  assert.equal(run.items[1].status, 'unverified', 'it ends as the rules say');
  assert.match(run.items[1].note, /Assumed: lower case\. Its worker asked again a question you had already answered and went with lower case; it had no tries left to do it with your answer\./);
  assert.equal(run.questions.length, 1);
  finish(run, '', T0 + 60000);
  const text = report(run);
  assert.match(text, /Questions you answered:\n- Should b\.txt be in capitals\?\n {2}Your answer: Yes, capitals\n {2}Item 2: its worker kept asking this after your answer and went with lower case instead\. It had no tries left to do it your way\./);
  assert.doesNotMatch(text, /Questions still open/);
});

test('a repeat with no time left to redo it keeps the item\'s result, says so plainly, and a continue does it again', () => {
  const run = answered({ maxTries: 2 });
  applyWork(run, '1', { check: { ok: true, output: '' } });
  // The redo: the worker asks again, its check passes, and the Mission's time is up by now.
  const kept = addQuestion(run, { text: ASKED, assume: 'lower case', items: ['2'], from: 'item' });
  applyWork(run, '2', { check: { ok: true, output: '' }, assumed: 'lower case' });
  assert.equal(run.items[1].status, 'verified');
  const late = T0 + 61 * 60000;
  assert.equal(followAnswer(run, '2', kept, 'lower case', late), 'late', 'no step is left to redo it');
  assert.equal(run.items[1].status, 'verified', 'the PASSED result is kept, never turned into NOT DONE');
  assert.match(run.items[1].note, /Its worker asked again a question you had already answered and went with lower case\. Your answer: Yes, capitals\. There was no time or step left to do it again with your answer, so it keeps this result\.$/);
  assert.doesNotMatch(run.items[1].note, /Use that answer; do not ask it again/, 'never the words meant for the worker');
  assert.deepEqual(lateRedo(run), ['2']);
  finish(run, '', late);
  assert.equal(run.status, 'complete');
  const text = report(run);
  assert.doesNotMatch(text, /\[NOT DONE\]/);
  assert.match(text, /Your answer: Yes, capitals\n {2}Item 2: its worker kept asking this after your answer and went with lower case instead\. There was no time or step left to do it your way; Continue the Mission does it again\./);
  assert.equal(continueBlock(run), '', 'it can be continued to do it your way');
  reviveRun(run, { minutes: 15, at: late + 60000 });
  assert.equal(run.items[1].status, 'open');
  assert.equal(nextStep(run, late + 60000).item?.id, '2');
  assert.doesNotMatch(report(run), /no time or step left/, 'once continued, the late line goes');
});

test('a repeat when the steps are used up keeps the item\'s result too', () => {
  const run = answered({ maxTries: 3 });
  const kept = addQuestion(run, { text: ASKED, assume: 'lower case', items: ['2'], from: 'item' });
  applyWork(run, '2', { assumed: 'lower case' });
  run.limits.maxSteps = run.steps;
  assert.equal(followAnswer(run, '2', kept, 'lower case', T0 + 120000), 'late');
  assert.equal(run.items[1].status, 'unverified');
  assert.equal(run.items[1].lateAnswer, 'q1');
  // With steps left, the same repeat is redone.
  run.limits.maxSteps = run.steps + 5;
  run.items[1].status = 'unverified';
  delete run.items[1].lateAnswer;
  assert.equal(followAnswer(run, '2', kept, 'lower case', T0 + 120000), 'redo');
});

test('an item still to be tried anyway is told your answer; a stuck or waiting item is not reopened', () => {
  const run = answered({ maxTries: 3 });
  const question = run.questions[0];
  run.items[1].status = 'open';
  run.items[1].tries = 1;
  run.items[1].note = 'Its command did not pass. Assumed: lower case';
  assert.equal(followAnswer(run, '2', question, 'lower case'), 'again');
  assert.match(run.items[1].note, /^This was already answered by the user: Yes, capitals\. Use that answer; do not ask it again\. Its command did not pass\./);
  run.items[1].status = 'stuck';
  assert.equal(followAnswer(run, '2', question, 'lower case'), 'kept');
  assert.equal(run.items[1].status, 'stuck');
  run.items[1].status = 'aside';
  assert.equal(followAnswer(run, '2', question), '');
  assert.equal(followAnswer(run, '2', { ...question, status: 'skipped' }), '', 'only an answered question is followed');
});

test('a worker asking a skipped question again: its default is the Mission\'s judgement; no card, nothing redone', () => {
  const run = mission();
  applyPlan(run, { items: [{ title: 'a.txt' }, { title: 'b.txt' }], checks: [], questions: [{ question: ASKED, default: 'lower case' }] });
  answerMany(run, [{ id: 'q1', skip: true }], T0 + 1000);
  assert.equal(run.questions[0].chosen, undefined, 'a plan question has no item to decide it yet');
  const kept = addQuestion(run, { text: 'Should b.txt be in CAPITALS', assume: 'lower case', items: ['2'], from: 'item' });
  assert.equal(kept.status, 'skipped');
  applyWork(run, '2', { assumed: 'lower case' });
  assert.equal(followAnswer(run, '2', kept, 'lower case'), '');
  assert.equal(run.items[1].status, 'unverified', 'nothing is redone');
  assert.deepEqual([run.questions.length, run.questions[0].chosen, run.questions[0].chosenBy], [1, 'lower case', '2']);
  assert.doesNotMatch(userNotes(run), /Left to your judgement/, 'decided now: the helpers are no longer asked to decide it');
  finish(run, '', T0 + 60000);
  assert.match(report(run), /Left to the Mission's judgement:\n- Should b\.txt be in capitals\?\n {2}It chose: lower case/);
  // A choice already made stays.
  addQuestion(run, { text: ASKED, assume: 'upper case', items: ['1'], from: 'item' });
  assert.equal(run.questions[0].chosen, 'lower case');
});

test('the plan or the review asking an answered or skipped question again adds nothing; a different question is still added', () => {
  const run = answered();
  applyReview(run, { verdict: 'changes', note: '', items: [], questions: [{ question: 'should b.txt be in capitals.', default: 'lower case' }, { question: 'Which font?', default: 'Inter' }] });
  assert.deepEqual(run.questions.map((question) => [question.text, question.status]), [[ASKED, 'answered'], ['Which font?', 'open']]);
  answerMany(run, [{ id: 'q2', skip: true }]);
  applyPlan(run, { items: [], checks: [], questions: [{ question: 'WHICH FONT', default: 'Arial' }, 'Which colour?'] });
  assert.deepEqual(run.questions.map((question) => question.text), [ASKED, 'Which font?', 'Which colour?']);
  assert.deepEqual([run.questions[1].chosen, run.questions[1].chosenBy], ['Arial', 'plan'], 'the default the plan offered is the Mission\'s judgement');
  assert.equal(addQuestion(run, { text: 'Should c.txt be in capitals?', assume: 'no', items: ['1'], from: 'item' }).status, 'open', 'a different question is a new one');
});

test('a question still open, or closed, works as before; the time question is never matched; old saved questions still load', () => {
  const run = mission();
  applyPlan(run, { items: [{ title: 'a' }], checks: [] });
  const open = addQuestion(run, { text: 'Which city?', items: ['1'], from: 'item' });
  assert.equal(addQuestion(run, { text: 'Which city?', items: ['2'] }), open, 'the same open question gains the item');
  assert.equal(run.questions.length, 1);
  open.status = 'closed';
  assert.equal(addQuestion(run, { text: 'Which city?' }).status, 'open', 'a closed one is asked again as a new one');
  const time = addQuestion(run, { text: 'More time?', kind: 'time' });
  time.status = 'answered';
  assert.equal(decidedBefore(run, 'More time?'), undefined);
  assert.equal(addQuestion(run, { text: 'More time?', kind: 'time' }).status, 'open', 'the time question is never matched');
  assert.equal(addQuestion(run, { text: 'more time' }).status, 'open', 'nor matched by another question');
  // A question saved before (no items list, no from): a repeat is matched, and the item is added.
  const old = mission();
  old.questions = [{ id: 'q1', text: 'Which logo?', assume: 'round', status: 'answered', answer: 'square' }];
  assert.equal(addQuestion(old, { text: 'which logo', items: ['3'], from: 'item' }), old.questions[0]);
  assert.deepEqual(old.questions[0].items, ['3']);
});

// ---- The runner: the lab's case, end to end -------------------------------------------------------------------

function bench(answer) {
  const goal = { id: 'g', revision: 1, phase: 'active' };
  let made = false;
  const goals = { create: () => { made = true; goal.phase = 'active'; }, get: () => (made ? goal : undefined), pause: () => { goal.phase = 'paused'; }, resume: () => { goal.phase = 'active'; }, complete: () => { goal.phase = 'complete'; }, clear: () => { made = false; } };
  const prompts = [];
  const subagents = { startActivation: async (spec) => { prompts.push({ label: spec.label, text: spec.prompt?.[0]?.text ?? '' }); return { childId: `c${prompts.length}`, result: Promise.resolve({ output: [{ type: 'text', text: answer(spec.label) }], stopReason: 'end' }) }; } };
  const ctx = { get: (name) => ({ goals, subagents })[name] };
  const points = { take: async () => ({ id: 'p', number: 1 }), files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '' };
  const runner = createRunner(ctx, { settings: () => ({ limits: {}, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {} });
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mission-repeat-')));
  const agent = { id: 'conv', model: { current: () => ({ provider: 'p', model: 'm' }) } };
  const step = () => runner.step(agent, new AbortController().signal, 60000);
  return { runner, agent, root, prompts, step, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('the lab\'s case: item 2 asks again after your answer; it is told your answer, never shown the question again, and stops at its tries', async () => {
  const app = bench((label) => (label === 'Mission: planner' ? JSON.stringify({ items: [{ title: 'write a.txt' }, { title: 'write b.txt' }], checks: [] }) : /item 2/.test(label) ? 'QUESTION: Should b.txt be in capitals? | ASSUMING: lower case' : 'DONE: ok'));
  try {
    await app.runner.start(app.agent, 'write two files', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 2 } });
    await app.step();
    await app.step();
    await app.step();
    const run = app.runner.runOf('conv');
    assert.deepEqual(openQuestions(run).map((question) => question.text), [ASKED]);
    app.runner.answerMany('conv', [{ id: 'q1', text: 'Yes, capitals' }]);
    assert.equal(run.items[1].tries, 0, 'the answer\'s redo uses no try');
    const tries = run.limits.maxTries;
    const said = [];
    for (let index = 0; index < tries + 3 && run.items[1].status === 'open'; index += 1) said.push(await app.step());
    // The chat is never told the answered question is a question for the user.
    assert.ok(said.some((text) => /This was already answered by the user: Yes, capitals\./.test(text)));
    for (const text of said) assert.doesNotMatch(text, /question for the user/);
    const worker = app.prompts.filter((prompt) => /item 2/.test(prompt.label));
    assert.equal(worker.length, 1 + tries, 'the first try, then the item\'s normal tries: never more');
    assert.match(worker[2].text, /This was already answered by the user: Yes, capitals\. Use that answer; do not ask it again\./);
    assert.equal(run.items[1].tries, tries);
    assert.equal(run.questions.length, 1, 'never asked as a new question');
    assert.deepEqual(openQuestions(run), []);
    const text = app.runner.end(app.agent);
    assert.match(text, /Item 2: its worker kept asking this after your answer and went with lower case instead\. It had no tries left to do it your way\./);
    assert.doesNotMatch(text, /Questions still open/);
  } finally {
    app.done();
  }
});

test('a worker asking a skipped question again: the step does not put it to the user', async () => {
  const app = bench((label) => (label === 'Mission: planner' ? JSON.stringify({ items: [{ title: 'write a.txt' }, { title: 'write b.txt' }, { title: 'write c.txt' }], checks: [] }) : /item [23]/.test(label) ? 'QUESTION: Should b.txt be in capitals? | ASSUMING: lower case' : 'DONE: ok'));
  try {
    await app.runner.start(app.agent, 'write three files', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 2 } });
    await app.step();
    await app.step();
    assert.match(await app.step(), /The worker has a question for the user: Should b\.txt be in capitals\?/, 'a new question still goes to the user');
    app.runner.answerMany('conv', [{ id: 'q1', skip: true }]);
    const third = await app.step();
    assert.match(third, /item 3/);
    assert.doesNotMatch(third, /question for the user/);
    assert.match(third, /The worker asked again a question the user left to the Mission's judgement; it went with lower case\. Do not ask the user\./);
    const run = app.runner.runOf('conv');
    assert.deepEqual(openQuestions(run), []);
    assert.equal(run.questions.length, 1);
  } finally {
    app.done();
  }
});

// ---- B: the time warning says the suggestion includes spare time ---------------------------------------------

test('the time warning says its suggestion has time to spare; a run saved with the old words still shows them', async () => {
  const items = Array.from({ length: 6 }, (_, index) => ({ title: `item ${index + 1}`, minutes: 8 }));
  const app = bench((label) => (label === 'Mission: planner' ? JSON.stringify({ items, checks: [] }) : 'DONE: ok'));
  try {
    await app.runner.start(app.agent, 'do six small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 10, laps: 2 } });
    const planned = await app.step();
    const time = app.runner.runOf('conv').questions.find((question) => question.kind === 'time');
    assert.match(time.text, /more minutes\? That covers the plan with some time to spare\.$/);
    assert.match(planned, /About \d+ minutes would fit, with some time to spare\./);
  } finally {
    app.done();
  }
  const old = 'The plan needs about 65 minutes, but the Mission has 9 left. Give it about 71 more minutes?';
  const strip = stripOf({ run: { id: 'r', kind: 'long', status: 'running', pausedAt: 0, pausedBy: '', stalled: '', goalPhase: 'active', lap: 0, laps: 4, deadline: T0 + 600000, minutes: 10, finishLap: false, items: [], questions: [{ id: 'q1', text: old, assume: 'keep', status: 'open', kind: 'time', items: [], needed: 65, left: 9, extra: 71, recommend: 80 }] }, now: T0 });
  assert.equal(strip.timeQuestion.text, old);
});
