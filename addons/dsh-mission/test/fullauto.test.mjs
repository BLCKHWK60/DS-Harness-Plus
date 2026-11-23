/**
 * Point 17 (owner, 20 November 2026): Full auto. It never asks: helpers decide every question on their own judgement and
 * note it (no question pass, no waits, the planner's and reviewer's questions decided too). A Mission never grants itself
 * permission: what needs the user's yes is not parked and not asked; the helper finishes without it and the report lists
 * each with what became of the item. No card, no alert during the run. Each test fails on the code before point 17.
 */
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GIT_CANDIDATES } from '../lib/checkpoints.js';
import { APPROVAL_RULE_DECIDE, ASK_NOW_RULE, DECIDE_RULE, DECIDED_FOR_AUTO, GUARD_TEXTS, STATUS_RULE_LONG_DECIDE, planPrompt, reviewPrompt, statusFor, statusOf, workPrompt } from '../lib/prompts.js';
import { APPROVAL_ERRORS, FINISH_LINE, TIME_ANSWERS, addQuestion, applyPlan, applyWork, finish, newRun, nextStep, report, userNotes } from '../lib/run.js';
import { PLAN, bench, holdItems, tick } from './bench-pool.mjs';
import { stripOf } from '../lib/strip.js';
import { appHarness } from './app-harness.mjs';

const hasGit = GIT_CANDIDATES.some((path) => existsSync(path));
const auto = (given = {}) => newRun({ id: 'r', goal: 'g', mode: 'Full Auto', root: '/x', limits: {}, kind: 'long', long: { minutes: 60, laps: 3, needs: 'decide', ...given } });

test('a worker\'s status on Full auto: NEEDS ANSWER finishes on its default (QUESTION), NEEDS YES reads as PARTLY; the other choices are untouched', () => {
  assert.deepEqual(statusFor(statusOf('NEEDS ANSWER: Which db? | IF NO ANSWER: SQLite'), 'decide'), { kind: 'question', text: 'Which db? | IF NO ANSWER: SQLite', question: 'Which db?', assume: 'SQLite' });
  assert.deepEqual(statusFor(statusOf('NEEDS YES: changing config.json'), 'decide'), { kind: 'partly', text: 'changing config.json' });
  assert.equal(statusFor(statusOf('NEEDS YES: x'), 'ask').kind, 'needs-yes');
  assert.equal(statusFor(statusOf('QUESTION: A? | ASSUMING: b'), 'ask').kind, 'question');
});

test('Full auto\'s helpers are told it never asks, never waits and never gets a yes', () => {
  const worker = workPrompt({ goal: 'g', item: { id: '1', title: 't', tries: 0 }, long: true, needs: 'decide' });
  assert.ok(worker.includes(STATUS_RULE_LONG_DECIDE));
  assert.ok(worker.includes(APPROVAL_RULE_DECIDE));
  assert.match(worker, /Nobody answers during this Mission \(Full auto\)/);
  assert.match(worker, /do not use NEEDS ANSWER or NEEDS YES/);
  assert.doesNotMatch(worker, /NEEDS ANSWER: <your question/);
  const plan = planPrompt({ goal: 'g', root: '/x', files: '', maxItems: 5, needs: 'decide' });
  assert.ok(plan.includes(DECIDE_RULE));
  assert.ok(!plan.includes(ASK_NOW_RULE));
  assert.ok(reviewPrompt({ goal: 'g', list: '', checks: '', changes: '', needs: 'decide' }).includes(DECIDE_RULE));
  assert.ok(planPrompt({ goal: 'g', root: '/x', files: '', maxItems: 5 }).includes(ASK_NOW_RULE), 'Ask, keep working as before');
  assert.match(GUARD_TEXTS.notAsked, /^This needs the user's yes, and this Mission runs on Full auto: it never asks and never gives itself permission/);
});

test('every question of a Full auto run is decided at once: the worker\'s, the plan\'s, the review\'s and the time question; the same words are the same decision', () => {
  const run = auto();
  applyPlan(run, { items: [{ title: 'a' }, { title: 'b' }], questions: [{ question: 'Which city?', default: 'Berlin' }] });
  assert.deepEqual([run.questions[0].status, run.questions[0].self, run.questions[0].chosen, run.questions[0].chosenBy], ['skipped', true, 'Berlin', 'plan']);
  const worker = addQuestion(run, { text: 'Tabs or spaces?', assume: 'spaces', items: ['1'], from: 'item' });
  assert.deepEqual([worker.status, worker.chosen, worker.chosenBy], ['skipped', 'spaces', '1']);
  const bare = addQuestion(run, { text: 'Colour?', items: ['2'], from: 'item' });
  assert.equal(bare.chosen, 'its own judgement (the helper named no default)');
  const time = addQuestion(run, { text: 'More time?', assume: 'keep', kind: 'time', from: 'time' });
  assert.deepEqual([time.status, time.chosen], ['skipped', TIME_ANSWERS.keep], 'the time question: it keeps the limit');
  const again = addQuestion(run, { text: 'tabs or spaces', assume: 'tabs', items: ['2'], from: 'item' });
  assert.equal(again, worker, 'merged');
  assert.deepEqual(worker.items, ['1', '2']);
  assert.equal(worker.chosen, 'spaces', 'the first decision stands');
  const notes = userNotes(run);
  assert.ok(notes.includes(DECIDED_FOR_AUTO), 'the helpers keep to it');
  assert.match(notes, /- q1: Which city\? Decided: Berlin/);
  assert.doesNotMatch(notes, /More time/, 'not the time question');
});

test('a Full auto run: no question pass, no wait, no alert; a worker that needed an answer finishes on its default and says so', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }], { questions: [{ question: 'Which city?', default: 'Berlin' }] }) } : spec.label === 'Mission: item 1' ? { text: 'NEEDS ANSWER: Which colour? | IF NO ANSWER: blue\nI used blue.' } : spec.label === 'Mission: item 2' ? { text: 'NEEDS YES: changing config.json\nThe rest is done.' } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'paint the page', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2, needs: 'decide' } });
    let told = await app.step();
    assert.match(told, /The planner decided 1 question itself \(Full auto\); the report lists them\./);
    for (let i = 0; i < 8 && app.runner.runOf('conv').status === 'running'; i += 1) told += `\n${await app.step(300)}`;
    const run = app.runner.runOf('conv');
    assert.equal(app.seen.some((entry) => entry.label === 'Mission: questions'), false, 'no question pass');
    assert.ok(app.seen.find((entry) => entry.label === 'Mission: item 1').prompt.includes('Nobody answers during this Mission (Full auto)'));
    assert.equal(run.items[0].status, 'unverified');
    assert.match(run.items[0].note, /Assumed: blue/);
    assert.deepEqual(run.items[0].assumedBy, { q2: 'blue' });
    assert.match(told, /The worker decided a question itself \(Full auto\): Which colour\? It chose: blue\./);
    assert.equal(run.items[1].status, 'unverified', 'NEEDS YES reads as PARTLY: never a failure');
    assert.equal(run.failStreak ?? 0, 0);
    await tick();
    assert.equal(app.fired.filter((event) => event.type === 'needs-you').length, 0, 'no alert');
    assert.equal(run.long.waitingSince, undefined, 'never waits');
    assert.notEqual(run.status, 'running');
    assert.equal(app.runner.view('conv').decided.length, 2);
    // Review of point 17: each worker told to keep to the planner's decision has it noted (Finish it redoes those).
    assert.deepEqual([run.items[0].decidedSeen, run.items[1].decidedSeen], [['q1'], ['q1']]);
  } finally {
    app.done();
  }
});

test('what Full auto was not asked: kept as unasked, the item finishes without it (done) or is set aside (not done); no fail streak, no alert, no wait', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'change two files well', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2, needs: 'decide' } });
    await app.step();
    await tick(30);
    const one = app.seen.find((entry) => entry.label === 'Mission: item 1').childId;
    const two = app.seen.find((entry) => entry.label === 'Mission: item 2').childId;
    const first = app.runner.parkFor(one, { kind: 'files', key: 'files:a.txt', what: 'Change a.txt', files: ['a.txt'] });
    assert.deepEqual([first.said, first.unasked, first.text], ['no', true, GUARD_TEXTS.notAsked]);
    const second = app.runner.parkFor(two, { kind: 'tool', key: 'tool:web_fetch', what: 'Use Fetch', tool: 'web_fetch', plain: 'Fetch a web page', reason: 'Need the docs' });
    assert.equal(second.unasked, true);
    const run = app.runner.runOf('conv');
    assert.deepEqual(run.approvals.map((entry) => [entry.id, entry.status, entry.items, entry.after]), [['a1', 'unasked', ['1'], 'redo'], ['a2', 'unasked', ['2'], 'redo']]);
    assert.equal(app.runner.parkFor(one, { kind: 'files', key: 'files:a.txt', what: 'Change a.txt', files: ['a.txt'] }).id, 'a1', 'asked again: the same entry');
    await app.release('Mission: item 1', 'DONE: a.txt left as it was');
    await app.release('Mission: item 2', 'PARTLY: the docs could not be fetched');
    assert.equal(run.items[0].status, 'unverified');
    assert.match(run.items[0].note, /Done without: Change a\.txt\. It needed your yes, and Full auto does not ask\./);
    assert.equal(run.items[1].status, 'aside');
    assert.deepEqual(run.items[1].asideOn, ['a2']);
    assert.equal(run.items[1].note, 'Not done: it needs your yes for Fetch a web page. Full auto does not ask; Finish it lets you allow it.');
    assert.equal(run.failStreak ?? 0, 0, 'no fail streak');
    await tick();
    assert.equal(app.fired.filter((event) => event.type === 'needs-you').length, 0, 'no alert, not even for the set-aside item');
    assert.equal(app.runner.view('conv').approvals.filter((entry) => entry.status === 'unasked').length, 2, 'the card data has them (shown only after the end)');
    for (let i = 0; i < 6 && run.status === 'running'; i += 1) await app.step(300);
    assert.notEqual(run.status, 'running');
    const text = report(run);
    assert.match(text, /When it needs you: Full auto\./);
    assert.match(text, /Not asked, because it needs your yes \(Full auto never asks; Finish it lets you allow them\):\n- Change a\.txt \(item 1: one\)\. It finished the item without it\.\n- Use Fetch \(item 2: two\)\. Item 2 is not done without it\. The helper said: "Need the docs"/);
    assert.doesNotMatch(text, /Waiting for your yes:/, 'listed once');
    assert.ok(text.trim().endsWith(FINISH_LINE), 'it can be finished');
    await tick();
    const finished = app.fired.find((event) => event.type === 'finished');
    assert.deepEqual([finished.unasked, finished.canContinue], [2, true]);
  } finally {
    app.done();
  }
});

test('review: Full auto keeps every step it did not ask (45 files, past the 40 open ones a card holds), lists all in the report (the Finish card 40 at a time), and never tells a helper something waits', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'change many files well', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2, needs: 'decide' } });
    await app.step();
    await tick(30);
    const one = app.seen.find((entry) => entry.label === 'Mission: item 1').childId;
    for (let n = 1; n <= 45; n += 1) {
      const got = app.runner.parkFor(one, { kind: 'files', key: `files:f${n}.txt`, what: `Change f${n}.txt`, files: [`f${n}.txt`] });
      assert.deepEqual([got.said, got.unasked, got.text], ['no', true, GUARD_TEXTS.notAsked], `file ${n}`);
    }
    const run = app.runner.runOf('conv');
    await app.release('Mission: item 1', 'DONE: the rest');
    for (let i = 0; i < 6 && run.status === 'running'; i += 1) await app.step(300);
    assert.notEqual(run.status, 'running');
    const text = report(run);
    for (const n of [1, 40, 41, 45]) assert.match(text, new RegExp(`- Change f${n}\\.txt \\(item 1: one\\)`), `file ${n} in the report`);
    // The Finish card shows 40 at a time (one Finish it allows up to 40); the rest come up at the next Finish it.
    assert.equal(stripOf({ run: app.runner.view('conv') }).unasked.length, 40);
    assert.equal(run.approvals.filter((entry) => entry.status === 'unasked').length, 45, 'all kept');
  } finally {
    app.done();
  }
});

test('Full auto never waits: an item that parks anyway ends it with its report (noWait); the report lists what it decided', () => {
  const run = auto({ helpers: 2 });
  applyPlan(run, { items: [{ title: 'a' }] });
  run.questions.push({ id: 'q1', text: 'A?', status: 'open', items: ['1'] });
  applyWork(run, '1', { parked: { on: ['q1'] } });
  run.phase = 'review';
  assert.deepEqual(nextStep(run, Date.now(), {}), { kind: 'finish', why: 'noWait' });
  const decided = auto();
  applyPlan(decided, { items: [{ title: 'a' }], questions: [{ question: 'Which city?', default: 'Berlin' }] });
  finish(decided, '', Date.now());
  assert.match(report(decided), /Questions it decided itself \(Full auto; Finish it lets you change them\):\n- Which city\?\n {2}It chose: Berlin/);
  assert.doesNotMatch(report(decided), /Left to the Mission's judgement/);
});

test('through the add-on: a Full auto helper\'s file ask, mission_request_files and Tool access are refused as not asked (ledger mission-not-asked, no card); the guard refuses a command on those files; approve says why', { skip: !hasGit }, async () => {
  const app = appHarness({ config: { longHelpers: 2 } });
  try {
    const chat = app.open('c');
    writeFileSync(join(chat.header.cwd, 'existing.txt'), 'old\n');
    await app.card({ sessionId: 'c', action: 'save', needs: 'decide' });
    const said = await app.mission(chat, 'restricted change two small things in this folder please');
    assert.equal(said.kind, 'success', said.text);
    await app.step(chat);
    for (let i = 0; i < 50 && app.holds.size < 2; i += 1) await tick(5);
    const helper = app.helperAgent('Mission: item 1');
    const write = await app.chain('tools/pre-execute', { agent: helper, name: 'write', arguments: { file_path: join(chat.header.cwd, 'existing.txt'), content: 'x' }, callId: 'w1', signal: new AbortController().signal });
    assert.deepEqual([write.kind, write.reason], ['deny', GUARD_TEXTS.notAsked]);
    assert.deepEqual(app.ledger.at(-1), ['refused', 'mission-not-asked']);
    assert.equal(app.asked.length, 0, 'the app\'s approval card is never asked');
    const asking = await app.tools.mission_request_files.execute({ files: ['existing.txt'], why: 'to fix it' }, { agent: app.helperAgent('Mission: item 2'), signal: new AbortController().signal, callId: 'r1' });
    assert.equal(asking.text, GUARD_TEXTS.notAsked, 'mission_request_files too');
    const tool = app.runner().parkApproval({ sessionId: helper.id, kind: 'tool', tool: 'web_fetch', plain: 'Fetch a web page' });
    assert.deepEqual([tool.said, tool.unasked], ['no', true]);
    const request = await app.chain('tools/pre-execute', { agent: helper, name: 'bash', arguments: { command: 'sed -i "" s/old/new/ existing.txt' }, callId: 'b1', signal: new AbortController().signal });
    assert.equal(request.kind, 'deny');
    assert.match(request.reason, /existing\.txt, which waits for the user's yes \(or they said no\)/, 'never another way');
    const view = app.runner().view('c');
    assert.deepEqual(view.approvals.map((entry) => entry.status), ['unasked', 'unasked']);
    const approve = await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: view.approvals[0].id, choice: 'allow' }] });
    assert.equal(approve.json.error, APPROVAL_ERRORS.notAsked);
    assert.equal(view.strip, undefined);
    const strip = (await app.get('c')).json.strip;
    assert.deepEqual([strip.state, strip.approvals.length, strip.needs], ['running', 0, 'decide'], 'no card during the run');
  } finally {
    app.done();
  }
});
