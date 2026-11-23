/**
 * Point 17 (owner, 20 November 2026): Ask and wait. Every question parks its item (QUESTION | ASSUMING too: nothing is
 * decided on a guess) and every request for the user's yes parks; other items go on; questions no item waits for keep
 * the Mission from ending; when only waiting is left, it waits. Each test fails on the code before point 17.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMMON_LONG_WAIT, OPEN_FOR_WAIT, RESUME_TEXTS, STATUS_RULE_LONG_WAIT, WAIT_PLAN_RULE, WAIT_REVIEW_RULE, planPrompt, questionsPassPrompt, reviewPrompt, statusFor, statusOf, workPrompt } from '../lib/prompts.js';
import { PARKS_MAX_WAIT, WAITS_BEFORE_START, addQuestion, answerMany, applyPlan, applyWork, endGate, finish, newRun, nextStep, openQuestionRef, report, userNotes } from '../lib/run.js';
import { APPROVE, PLAN, bench, holdItems, tick } from './bench-pool.mjs';

const hold = (given = {}) => newRun({ id: 'r', goal: 'g', mode: 'Full Auto', root: '/x', limits: {}, kind: 'long', long: { minutes: 60, laps: 3, needs: 'wait', ...given } });

test('Ask and wait\'s helpers: a QUESTION waits (its ASSUMING is only a suggestion); they are told so, with the open questions', () => {
  assert.deepEqual(statusFor(statusOf('QUESTION: Tabs? | ASSUMING: spaces'), 'wait'), { kind: 'needs-answer', text: 'Tabs? | ASSUMING: spaces', question: 'Tabs?', assume: 'spaces' });
  const worker = workPrompt({ goal: 'g', item: { id: '1', title: 't', tries: 0 }, long: true, needs: 'wait' });
  assert.ok(worker.includes(STATUS_RULE_LONG_WAIT));
  assert.ok(worker.includes(COMMON_LONG_WAIT[0]));
  assert.doesNotMatch(worker, /QUESTION: <your question/);
  assert.match(worker, /write its id instead \(NEEDS ANSWER: q3\)/);
  assert.ok(planPrompt({ goal: 'g', root: '/x', files: '', maxItems: 5, needs: 'wait' }).includes(WAIT_PLAN_RULE));
  assert.match(planPrompt({ goal: 'g', root: '/x', files: '', maxItems: 5, needs: 'wait' }), /"items": \[numbers of the items that depend on it\]/);
  assert.ok(reviewPrompt({ goal: 'g', list: '', checks: '', changes: '', needs: 'wait' }).includes(WAIT_REVIEW_RULE));
  assert.match(questionsPassPrompt({ goal: 'g', needs: 'wait' }), /each with what the Mission would suggest without an answer/);
  const run = hold();
  addQuestion(run, { text: 'Which city?', assume: 'Berlin', from: 'plan' });
  assert.ok(userNotes(run).includes(`${OPEN_FOR_WAIT}\n- q1: Which city? (suggestion: Berlin)`));
});

test('plan items a question names wait before they start; the others go on; the answer starts them with what was said', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }], { questions: [{ question: 'Which city?', default: 'Berlin', items: [2] }] }) } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'list the cities', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2, needs: 'wait' } });
    const told = await app.step();
    assert.match(told, /Item 2 waits for your answers before it starts; the others go on\./);
    assert.match(told, /Questions for the user \(nothing is decided on them until they answer\):\n- Which city\? \(suggestion: Berlin\)/);
    await tick(30);
    const run = app.runner.runOf('conv');
    assert.deepEqual([run.items[1].status, run.items[1].parkedOn, run.items[1].note, run.items[1].resume.before], ['parked', ['q1'], WAITS_BEFORE_START, true]);
    assert.deepEqual(run.questions[0].parks, ['2']);
    assert.deepEqual(app.working(), ['Mission: item 1'], 'the other item goes on');
    await tick();
    assert.ok(app.fired.some((event) => event.type === 'needs-you' && event.waiting === 'question'));
    app.runner.answerMany('conv', [{ id: 'q1', text: 'Paris' }]);
    for (let i = 0; i < 50 && !app.holds.has('Mission: item 2'); i += 1) await tick(5);
    const prompt = app.seen.find((entry) => entry.label === 'Mission: item 2').prompt;
    assert.ok(prompt.includes(RESUME_TEXTS.before));
    assert.ok(prompt.includes('"Which city?": Paris. Do the item with it.'));
    assert.doesNotMatch(prompt, /A helper started this item and stopped/);
  } finally {
    app.done();
  }
});

test('a worker\'s QUESTION parks its item, with one helper and with several; NEEDS ANSWER: q1 parks on q1; an item that finished while its yes is open waits for it', async () => {
  for (const helpers of [1, 2]) {
    const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }], { questions: [{ question: 'Which city?', default: 'Berlin' }] }) } : spec.label === 'Mission: item 1' ? { text: 'QUESTION: Tabs or spaces? | ASSUMING: spaces' } : spec.label === 'Mission: item 2' ? { text: 'NEEDS ANSWER: q1' } : spec.label === 'Mission: questions' ? { text: '{"questions": []}' } : { text: APPROVE }) });
    try {
      await app.runner.start(app.agent, 'tidy the code', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers, needs: 'wait' } });
      for (let i = 0; i < 4; i += 1) await app.step(300);
      await tick(30);
      const run = app.runner.runOf('conv');
      assert.deepEqual([run.items[0].status, run.items[0].parkedOn], ['parked', ['q2']], `${helpers} helper(s): a QUESTION waits`);
      assert.equal(run.questions[1].assume, 'spaces', 'its ASSUMING is the suggestion');
      assert.deepEqual([run.items[1].status, run.items[1].parkedOn], ['parked', ['q1']], `${helpers} helper(s): NEEDS ANSWER: q1 waits for q1`);
      assert.ok(run.questions[0].items.includes('2'));
    } finally {
      app.done();
    }
  }
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'change a file', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2, needs: 'wait' } });
    await app.step();
    await tick(30);
    const child = app.seen.find((entry) => entry.label === 'Mission: item 1').childId;
    const parked = app.runner.parkFor(child, { kind: 'files', key: 'files:a.txt', what: 'Change a.txt', files: ['a.txt'] });
    assert.ok(parked.id);
    await app.release('Mission: item 1', 'DONE: all but a.txt');
    const run = app.runner.runOf('conv');
    assert.deepEqual([run.items[0].status, run.items[0].parkedOn], ['parked', [parked.id]], 'nothing goes on a guess: it waits for the yes');
    assert.equal(run.approvals[0].after, 'park');
  } finally {
    app.done();
  }
});

test('the question pass is waited for only while nothing has started; the time question never holds work', () => {
  const run = hold({ helpers: 2 });
  applyPlan(run, { items: [{ title: 'a' }, { title: 'b' }] });
  assert.equal(nextStep(run, Date.now(), { asking: true }).kind, 'drain', 'the pass may still name items');
  assert.equal(nextStep(run, Date.now(), {}).kind, 'work');
  run.items[0].attempts = 1;
  assert.equal(nextStep(run, Date.now(), { asking: true }).kind, 'work', 'once something started, it is not waited for');
  addQuestion(run, { text: 'More time?', kind: 'time', from: 'time' });
  assert.deepEqual(endGate(run), [], 'the time question holds nothing');
  const ask = newRun({ id: 'r', goal: 'g', mode: 'Full Auto', root: '/x', limits: {}, kind: 'long', long: { helpers: 2 } });
  applyPlan(ask, { items: [{ title: 'a' }] });
  assert.equal(nextStep(ask, Date.now(), { asking: true }).kind, 'work', 'Ask, keep working: never waited for');
});

test('the end gate: a question no item waits for keeps it from ending; an answer to it gives a pass whose review reads it', async () => {
  const run = hold();
  applyPlan(run, { items: [{ title: 'a' }], questions: [{ question: 'Which city?', default: 'Berlin' }] });
  applyWork(run, '1', { check: { ok: true, output: '' } });
  run.phase = 'review';
  run.long.lapEnded = true;
  run.long.lap = 1;
  assert.deepEqual(endGate(run), ['q1']);
  assert.equal(nextStep(run, Date.now(), {}).kind, 'wait-you', 'instead of hunting or ending');
  run.long.lap = 3;
  assert.equal(nextStep(run, Date.now(), {}).kind, 'wait-you', 'also at its lap limit');
  answerMany(run, [{ id: 'q1', text: 'Paris' }]);
  assert.deepEqual(endGate(run), []);
  assert.deepEqual(nextStep(run, Date.now(), {}), { kind: 'finish', why: 'laps' });
  // Through the runner: the review after the answer reads it.
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }], { questions: [{ question: 'Which city?', default: 'Berlin' }] }) } : spec.label === 'Mission: item 1' ? { text: 'DONE: done' } : { text: APPROVE }) });
  try {
    await app.runner.start(app.agent, 'list the cities', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 3, helpers: 1, needs: 'wait' } });
    let text = '';
    for (let i = 0; i < 6 && !/now waits for the user/.test(text); i += 1) text = await app.step(300);
    assert.match(text, /waits for the user/, 'its work is done, but a question is open: it waits');
    const reviews = app.seen.filter((entry) => entry.label === 'Mission: reviewer').length;
    app.runner.answerMany('conv', [{ id: 'q1', text: 'Paris' }]);
    assert.equal(app.goal.phase, 'active');
    await app.step(300);
    const review = app.seen.filter((entry) => entry.label === 'Mission: reviewer');
    assert.equal(review.length, reviews + 1, 'a review follows the answer');
    assert.match(review.at(-1).prompt, /Question: Which city\?\n {2}Answer: Paris/);
  } finally {
    app.done();
  }
});

test('Ask and wait: an item may stop to wait six times before the seventh counts as a try; the report says nothing was decided on open questions', () => {
  const run = hold();
  applyPlan(run, { items: [{ title: 'a' }] });
  run.questions.push({ id: 'q1', text: 'A?', status: 'open', items: ['1'] });
  for (let i = 0; i < PARKS_MAX_WAIT; i += 1) {
    applyWork(run, '1', { parked: { on: ['q1'] } });
    assert.equal(run.items[0].status, 'parked', `stop ${i + 1}`);
    run.items[0].status = 'open';
  }
  applyWork(run, '1', { parked: { on: ['q1'] } });
  assert.deepEqual([run.items[0].status, run.items[0].tries], ['open', 1]);
  assert.match(run.items[0].note, /stopped to wait for you 7 times/);
  finish(run, '', Date.now());
  assert.match(report(run), /Questions still open \(nothing was decided on them\):\n- A\? \(item 1\)/);
  assert.equal(openQuestionRef(run, 'q1: which?')?.id, 'q1');
  assert.equal(openQuestionRef(run, 'Which one is it?'), undefined);
});
