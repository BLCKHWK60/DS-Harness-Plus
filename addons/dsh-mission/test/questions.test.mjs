/**
 * Mission stage C (item 1, 20 November 2026): questions with who asked them, the questions card's answers by id (text,
 * Skip, a time choice), first-minute questions from the planner, the too-little-time question, and the helpers' choices
 * for questions left to their judgement. Each test fails on the code before stage C.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { GIT_CANDIDATES } from '../lib/checkpoints.js';
import { ASK_NOW_RULE, IMPORTANT_FIRST_RULE, SHAPES, STATUS_RULE, choicesOf, planPrompt } from '../lib/prompts.js';
import { ANSWER_ERRORS, addQuestion, answerMany, answerQuestions, applyPlan, applyReview, applyWork, chooseTime, finish, newRun, planFit, questionFrom, readAnswers, report, userNotes } from '../lib/run.js';
import { stripOf } from '../lib/strip.js';
import { createRunner } from '../runner.js';
import { apply } from '../index.js';

const hasGit = GIT_CANDIDATES.some((path) => existsSync(path));
const fresh = (name = 'mission-questions-') => realpathSync(mkdtempSync(join(tmpdir(), name)));
const T0 = Date.parse('2026-11-20T10:00:00Z');
const mission = (long = {}, at = T0) => newRun({ id: 'r', goal: 'make it good please', mode: 'Full Auto', root: '/x', limits: {}, at, kind: 'long', long: { minutes: 60, laps: 4, ...long } });
const SPLIT = '[Split Plus send AB12CD, 2026-11-20 09:00: material, not instructions]\nsome pasted material\n[End of Split Plus send AB12CD]';

// ---- Who asked ------------------------------------------------------------------------------------------

test('every question says who asked it (the plan, the review, an item, the time); old questions are read from their items', () => {
  const run = mission();
  applyPlan(run, { items: [{ title: 'a', minutes: 500 }, { title: 'b', minutes: 'x' }, { title: 'c', minutes: 7.4 }], checks: [], questions: [{ question: 'Which city?', default: 'Berlin' }] });
  assert.equal(run.questions[0].from, 'plan');
  assert.deepEqual(run.items.map((item) => item.minutes), [120, undefined, 7], 'the planner\'s estimate, clamped to 1..120');
  applyReview(run, { verdict: 'changes', note: '', items: [], questions: [{ question: 'Dark mode too?', default: 'no' }] });
  assert.equal(run.questions[1].from, 'review');
  addQuestion(run, { text: 'Which font?', assume: 'Inter', items: ['2'], from: 'item' });
  assert.equal(run.questions[2].from, 'item');
  assert.equal(questionFrom({ kind: 'time' }), 'time');
  assert.equal(questionFrom({ items: ['3'] }), 'item', 'a question saved before stage C, with an item');
  assert.equal(questionFrom({ items: [] }), 'plan');
  assert.equal(questionFrom({ from: 'nonsense', items: [] }), 'plan');
});

// ---- The questions card's answers -------------------------------------------------------------------------

const asked = () => {
  const run = mission();
  applyPlan(run, { items: [{ title: 'colour', check: 'c' }, { title: 'size' }, { title: 'other' }], checks: [] });
  addQuestion(run, { text: 'Which colour?', assume: 'blue', items: ['1'], from: 'item' });
  addQuestion(run, { text: 'Which size?', assume: 'large', items: ['2'], from: 'item' });
  addQuestion(run, { text: 'Which city?', assume: 'Berlin', from: 'plan' });
  addQuestion(run, { text: 'The plan needs about 90 minutes, but the Mission has 60 left. Give it about 50 more minutes?', assume: 'I will do the most important items and list the rest.', kind: 'time', from: 'time', recommend: 110, needed: 90, left: 60, extra: 50 });
  applyWork(run, '1', { check: { ok: true, output: '' }, assumed: 'blue' });
  applyWork(run, '2', { assumed: 'large' });
  return run;
};

test('answers by id: errors come in order and change nothing; skip wins over text; text is clipped; at most 40 are read', () => {
  const run = asked();
  const before = JSON.stringify(run);
  assert.throws(() => answerMany(run, [{ id: 'q1', text: '   ' }, { id: 'q2' }]), { message: ANSWER_ERRORS.empty });
  assert.throws(() => answerMany(run, [{ id: 'q9', text: 'x' }]), { message: ANSWER_ERRORS.stale });
  assert.throws(() => answerMany(run, [{ id: 'q4', skip: true }]), { message: ANSWER_ERRORS.stale }, 'no Skip on the time question');
  assert.throws(() => answerMany(run, [{ id: 'q1', time: 'more' }]), { message: ANSWER_ERRORS.stale }, 'no time choice on another question');
  assert.equal(JSON.stringify(run), before, 'an error changes nothing');
  const read = readAnswers(run, [{ id: 'q3', text: 'Paris', skip: true }, { id: 'q1', text: 'y'.repeat(1500) }]);
  assert.deepEqual(read.map((entry) => [entry.question.id, entry.skip ?? false, entry.text?.length ?? 0]), [['q3', true, 0], ['q1', false, 1000]]);
  const many = Array.from({ length: 50 }, (_, index) => ({ id: index === 45 ? 'q3' : `q${index + 100}`, text: 'x' }));
  assert.throws(() => readAnswers(run, many), { message: ANSWER_ERRORS.stale }, 'the 46th entry is never read');
  const free = mission({ minutes: 0 });
  addQuestion(free, { text: 'More time?', kind: 'time' });
  assert.throws(() => answerMany(free, [{ id: 'q1', time: 'more' }]), { message: ANSWER_ERRORS.noLimit });
});

test('answers by id: text redoes the items finished on the default, Skip leaves it to the Mission (an item\'s own assumption is its choice), empty fields keep their default', () => {
  const run = asked();
  const out = answerMany(run, [{ id: 'q1', text: 'green' }, { id: 'q2', skip: true }, { id: 'q3', text: '' }], T0 + 1000);
  assert.deepEqual(out, { answered: ['q1'], skipped: ['q2'], timeChoice: '', timeAdded: 0, reopened: ['1'], late: [] });
  assert.equal(run.items[0].status, 'open');
  assert.equal(run.items[0].tries, 0, 'the redo uses no try');
  assert.equal(run.items[1].status, 'unverified', 'a skipped question redoes nothing');
  assert.deepEqual([run.questions[1].status, run.questions[1].chosen, run.questions[1].chosenBy, run.questions[1].skippedAt], ['skipped', 'large', '2', T0 + 1000]);
  assert.equal(run.questions[2].status, 'open', 'an empty field keeps its default and stays open');
  // Stage B's typed answers still number the open questions in order: q3 is now question 1.
  assert.deepEqual(answerQuestions(run, '1. Paris').answered, ['q3']);
});

test('a plan question left to the Mission: the helpers are asked to decide and say so (CHOSE), and the report says what it chose or which default it went with', () => {
  const run = asked();
  answerMany(run, [{ id: 'q3', skip: true }, { id: 'q2', skip: true }]);
  assert.match(userNotes(run), /Left to your judgement by the user \(decide what fits the goal best; when your item decides one, add a line "CHOSE <id>: <what you chose>"\):\n- q3: Which city\? \(the default offered: Berlin\)/);
  assert.doesNotMatch(userNotes(run), /- q2:/, 'decided already by its item');
  assert.match(STATUS_RULE, /CHOSE <question id>: <what you chose>/);
  assert.deepEqual(choicesOf('DONE: ok\n**CHOSE q3**: Lisbon, close to the users\nCHOSE q3: Rome\nchose q7: x'), [{ id: 'q3', text: 'Lisbon, close to the users' }, { id: 'q7', text: 'x' }]);
  finish(run, '', T0 + 60000);
  const text = report(run);
  assert.match(text, /Left to the Mission's judgement:\n- Which size\?\n {2}It chose: large\n- Which city\?\n {2}It went with the default offered: Berlin/);
});

test('the time question: keep the limit, give it the extra minutes, or no time limit; refused once there is no limit', () => {
  const keep = asked();
  const time = keep.questions[3];
  assert.equal(chooseTime(keep, time, 'keep', T0), 0);
  assert.deepEqual([time.status, time.answer], ['answered', 'Keep the time limit; do the most important items first and list the rest.']);
  const more = asked();
  const deadline = more.long.deadline;
  const out = answerMany(more, [{ id: 'q4', time: 'more' }, { id: 'q4', time: 'none' }]);
  assert.deepEqual([out.timeChoice, out.timeAdded], ['more', 50], 'one choice per question: the first');
  assert.equal(more.long.deadline, deadline + 50 * 60000, 'extra is added to the limit, never taken as a total');
  assert.equal(more.long.minutes, 110);
  assert.equal(more.questions[3].answer, 'Give it about 50 more minutes.');
  const none = asked();
  answerMany(none, [{ id: 'q4', time: 'none' }]);
  assert.deepEqual([none.long.deadline, none.long.fullTime, none.long.minutes, none.questions[3].answer], [0, false, 60, 'No time limit.']);
  assert.throws(() => chooseTime(none, { status: 'open' }, 'keep'), { message: ANSWER_ERRORS.noLimit });
});

// ---- Sizing the plan ---------------------------------------------------------------------------------------

test('the planner is told the laps, the steps, to ask everything now and to put the most important items first; it gives minutes per item', () => {
  const plan = planPrompt({ goal: 'g', root: '/r', files: '', maxItems: 5, minutes: 30, laps: 3, steps: 40 });
  assert.ok(plan.includes('- It works in laps (the items, then the overall commands, then a review) and has at most 3 laps.'));
  assert.ok(plan.includes('- It may take at most 40 steps in all (the plan, each try of an item, each run of the overall commands, each review): keep the list well under that.'));
  assert.ok(plan.includes(`- ${ASK_NOW_RULE}`) && plan.includes(`- ${IMPORTANT_FIRST_RULE}`));
  assert.match(ASK_NOW_RULE, /they read them in the first minute while still at the screen/);
  assert.ok(plan.includes('"minutes": "about how many minutes a worker needs for it"'));
  assert.match(SHAPES.plan, /"minutes": 5/);
  const bare = planPrompt({ goal: 'g', root: '/r', files: '', maxItems: 5 });
  assert.ok(!/at most \d+ laps|steps in all/.test(bare), 'no limits, no lines');
});

test('the fit counts the planner\'s estimates per item and says how many minutes to add (a span, not a total)', () => {
  const run = mission({ minutes: 30 });
  applyPlan(run, { items: [{ title: 'a', minutes: 20 }, { title: 'b', minutes: 15 }, { title: 'c' }], checks: [] });
  const fit = planFit(run, T0);
  assert.deepEqual(fit, { needed: 45, left: 30, fits: false, recommend: 55, perItem: 5, extra: 25 });
  const roomy = mission({ minutes: 120 });
  applyPlan(roomy, { items: [{ title: 'a' }], checks: [] });
  assert.equal(planFit(roomy, T0).extra, 10, 'at least 10');
});

// ---- The strip's fields for the card -----------------------------------------------------------------------

test('the strip gives the card who asked, the time question while it runs, and the questions left after the end', () => {
  const view = (over = {}) => ({ id: 'r', kind: 'long', status: 'running', pausedAt: 0, pausedBy: '', stalled: '', goalPhase: 'active', lap: 0, laps: 4, deadline: T0 + 3600000, minutes: 60, finishLap: false, items: [{ id: '1', title: 'Pick the colours' }, { id: '2', title: 'Pick the font' }], questions: [
    { id: 'q1', text: 'Which colour?', assume: 'blue', status: 'open', items: ['1', '2'], from: 'plan' },
    { id: 'q2', text: 'More time?', assume: 'keep', status: 'open', kind: 'time', items: [], needed: 90, left: 60, extra: 50, recommend: 110 },
    { id: 'q3', text: 'Old one?', assume: '', status: 'open', items: [] },
  ], ...over });
  const running = stripOf({ run: view(), now: T0 });
  assert.deepEqual(running.questions.map((question) => [question.n, question.id, question.from, question.askedBy]), [[1, 'q1', 'plan', [{ id: '1', title: 'Pick the colours' }, { id: '2', title: 'Pick the font' }]], [2, 'q3', 'plan', []]]);
  assert.deepEqual(running.timeQuestion, { id: 'q2', text: 'More time?', assume: 'keep', minutes: 60, needed: 90, left: 60, extra: 50, recommend: 110 });
  // Stage D: open questions while other work goes on are 'running'; 'waiting' means only the user's answers can move it.
  assert.equal(running.state, 'running');
  assert.equal(stripOf({ run: view({ waitingForYou: { since: T0, until: T0 + 180000 } }), now: T0 }).state, 'waiting');
  assert.equal(stripOf({ run: view({ pausedAt: T0, pausedBy: 'you', goalPhase: 'paused' }), now: T0 }).timeQuestion.id, 'q2', 'also while paused');
  assert.equal(stripOf({ run: view({ deadline: 0 }), now: T0 }).timeQuestion, null, 'no limit, no time question');
  const ended = stripOf({ run: view({ status: 'stopped', canContinue: true, lateAnswers: [{ id: 'q9', text: 'Which logo?', answer: 'round', items: ['2'] }] }), now: T0 });
  assert.equal(ended.state, 'finished');
  assert.deepEqual(ended.questions.map((question) => question.id), ['q1', 'q3'], 'an ended Mission lists its questions, never the time one');
  assert.deepEqual(ended.late, [{ id: 'q9', text: 'Which logo?', answer: 'round', items: ['2'], askedBy: [{ id: '2', title: 'Pick the font' }] }]);
  assert.equal(ended.timeQuestion, null);
  assert.equal(ended.canContinue, true);
  assert.equal(stripOf({ run: view({ status: 'complete', canContinue: false }), now: T0 }).canContinue, false);
  assert.equal(stripOf({ run: view({ status: 'complete', canContinue: true, questions: [] }), now: T0 }).canContinue, false, 'nothing to answer');
});

// ---- The runner: first-minute questions, the time question, CHOSE --------------------------------------------

function bench(answer) {
  const goal = { id: 'g', revision: 1, phase: 'active' };
  let made = false;
  const goals = { create: () => { made = true; goal.phase = 'active'; }, get: () => (made ? goal : undefined), pause: () => { goal.phase = 'paused'; }, resume: () => { goal.phase = 'active'; }, complete: () => { goal.phase = 'complete'; }, clear: () => { made = false; } };
  const prompts = [];
  const subagents = { startActivation: async (spec) => { prompts.push({ label: spec.label, text: spec.prompt?.[0]?.text ?? '' }); return { childId: `c${prompts.length}`, result: Promise.resolve({ output: [{ type: 'text', text: answer(spec.label) }], stopReason: 'end' }) }; } };
  const ctx = { get: (name) => ({ goals, subagents })[name] };
  const points = { take: async () => ({ id: 'p', number: 1 }), files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '' };
  const runner = createRunner(ctx, { settings: () => ({ limits: {}, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {} });
  const root = fresh();
  const agent = { id: 'conv', model: { current: () => ({ provider: 'p', model: 'm' }) } };
  const step = () => runner.step(agent, new AbortController().signal, 60000);
  return { runner, agent, root, prompts, step, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('the plan step asks the time question with how much to add, a steps line when the plan may not fit its step limit, and logs how soon the questions came', async () => {
  const items = Array.from({ length: 6 }, (_, index) => ({ title: `item ${index + 1}`, minutes: 8 }));
  const app = bench((label) => (label === 'Mission: planner' ? JSON.stringify({ items, checks: ['npm test'], questions: [{ question: 'Which city?', default: 'Berlin' }] }) : 'DONE: ok'));
  try {
    await app.runner.start(app.agent, 'do six small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 10, laps: 2, steps: 6 } });
    const planned = await app.step();
    assert.match(app.prompts[0].text, /at most 2 laps/);
    assert.match(app.prompts[0].text, /at most 6 steps in all/);
    const run = app.runner.runOf('conv');
    const time = run.questions.find((question) => question.kind === 'time');
    assert.match(time.text, /^The plan needs about 53 minutes, but the Mission has (9|10) left\. Give it about (4[3-9]|5\d) more minutes\? That covers the plan with some time to spare\.$/);
    assert.deepEqual([time.from, time.needed, time.recommend, time.extra], ['time', 53, 65, 65 - time.left]);
    assert.equal(run.stepsNote, 'This plan may need more steps than the limit of 6 allows. It does the first items and lists the rest.');
    assert.ok(planned.includes(run.stepsNote));
    const log = readFileSync(join(app.root, '.dsh-mission', 'runs', run.id, 'log.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const plan = log.find((entry) => entry.kind === 'plan');
    assert.ok(Number.isFinite(plan.questionsMs) && plan.questionsMs >= 0, 'questionsMs is logged');
    assert.equal(run.questions.find((question) => question.text === 'Which city?').from, 'plan');
    const strip = stripOf({ run: { ...app.runner.view('conv'), goalPhase: 'active' } });
    assert.equal(strip.timeQuestion.id, time.id);
    assert.equal(strip.timeQuestion.extra, time.extra);
    app.runner.end(app.agent);
    assert.match(report(run), /This plan may need more steps than the limit of 6 allows/);
  } finally {
    app.done();
  }
});

test('a worker that decides a question left to its judgement says CHOSE, and the report keeps that choice', async () => {
  const app = bench((label) => (label === 'Mission: planner' ? JSON.stringify({ items: [{ title: 'pick a city' }, { title: 'two' }], checks: [], questions: [{ question: 'Which city?', default: 'Berlin' }] }) : /item 1/.test(label) ? 'DONE: picked one\nCHOSE q1: Lisbon' : 'DONE: ok'));
  try {
    await app.runner.start(app.agent, 'do two small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 2 } });
    await app.step();
    const out = app.runner.answerMany('conv', [{ id: 'q1', skip: true }]);
    assert.deepEqual(out.skipped, ['q1']);
    await app.step();
    assert.match(app.prompts[1].text, /Left to your judgement by the user[\s\S]*- q1: Which city\? \(the default offered: Berlin\)/);
    const run = app.runner.runOf('conv');
    assert.deepEqual([run.questions[0].chosen, run.questions[0].chosenBy], ['Lisbon', '1']);
    assert.match(app.runner.end(app.agent), /Left to the Mission's judgement:\n- Which city\?\n {2}It chose: Lisbon/);
    assert.throws(() => app.runner.answerMany('conv', [{ id: 'q1', text: 'x' }]), /No Mission is on here/);
  } finally {
    app.done();
  }
});

// ---- The route: answers from the questions card -----------------------------------------------------------

function standIn(answer) {
  const home = fresh('mission-questions-app-');
  const goals = new Map();
  const routes = {};
  const tools = {};
  const commands = {};
  const agents = new Map();
  const services = {
    dshHomePath: (sub) => join(home, sub),
    modes: { isolated: () => false, get: () => 'cowork', readOnly: () => false, longTools: () => ({ files: true, web: true }), refreshTools: () => {}, depthOf: () => 'standard' },
    modelTiers: { resolveTier: () => null, roleRoute: () => undefined },
    sandboxPolicy: { resolve: () => ({ mode: 'workspace-write' }) },
    permissionPresets: { current: () => 'workspace-write', set: () => {} },
    agents: { list: () => [...agents.values()], get: (id) => agents.get(id) },
    goals: {
      create: (agent) => { const goal = { id: `g-${agent.id}`, revision: 1, phase: 'active' }; goals.set(agent.id, goal); return goal; },
      get: (agent) => goals.get(agent.id),
      pause: (agent) => { goals.get(agent.id).phase = 'paused'; },
      resume: (agent) => { goals.get(agent.id).phase = 'active'; },
      complete: (agent) => { goals.get(agent.id).phase = 'complete'; },
      clear: (agent) => { goals.delete(agent.id); },
    },
    subagents: { startActivation: async (spec) => ({ childId: `h-${Math.random().toString(36).slice(2, 8)}`, result: Promise.resolve({ output: [{ type: 'text', text: answer(spec.label) }], stopReason: 'end' }) }) },
  };
  const ctx = {
    logger: { warn: () => {}, info: () => {} },
    get: (name) => services[name],
    effect: (start) => start(),
    provide: () => () => {},
    on: () => () => {},
    inject: (_deps, fn) => fn({
      effect: (start) => start(),
      tools: { register: (spec) => { tools[spec.name] = spec; return () => {}; } },
      commands: { register: (spec) => { commands[spec.name] = spec; return () => {}; } },
      webServer: { register: (spec) => { routes[spec.path] = spec.handler; return () => {}; } },
      connection: { requestRejection: () => undefined },
    }),
  };
  apply(ctx, { longKeepAwake: false });
  const folders = [home];
  const open = (id) => {
    const cwd = fresh();
    folders.push(cwd);
    const agent = { id, header: { cwd }, session: { id, header: { cwd }, append: () => {}, deriveMessages: () => [] }, model: { current: () => ({ provider: 'p', model: 'm' }) } };
    agents.set(id, agent);
    return agent;
  };
  const card = async (body) => {
    const chunks = [Buffer.from(JSON.stringify(body))];
    const req = { method: 'POST', url: '/dsh-mission/long', headers: {}, async *[Symbol.asyncIterator]() { yield* chunks; } };
    let out = '';
    const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text ?? ''; } };
    await routes['/dsh-mission/long'](req, res);
    return { status: res.statusCode, json: out ? JSON.parse(out) : null };
  };
  const runOnDisk = (agent) => {
    const dir = join(agent.header.cwd, '.dsh-mission', 'runs');
    const [id] = readdirSync(dir);
    return JSON.parse(readFileSync(join(dir, id, 'run.json'), 'utf8'));
  };
  return {
    card, open, runOnDisk, goals,
    mission: (agent, rawInput) => commands.mission.handler({ agent, rawInput }),
    step: (agent) => tools.mission_step.execute({}, { agent, signal: new AbortController().signal }),
    done: () => { for (const folder of folders) rmSync(folder, { recursive: true, force: true }); },
  };
}

test('the route takes the card\'s answers by id: text, Skip and Split Plus material as typed answers are; its errors say what to do', { skip: !hasGit }, async () => {
  const PLANNED = JSON.stringify({ summary: 's', items: [{ title: 'Pick the colours' }, { title: 'Pick the font' }], checks: [], questions: [{ question: 'Which city?', default: 'Berlin' }] });
  const app = standIn((label) => (/planner/.test(label) ? PLANNED : /item 1/.test(label) ? 'QUESTION: Which colour? | ASSUMING: blue' : /item 2/.test(label) ? 'QUESTION: Which font? | ASSUMING: Inter' : 'DONE: ok'));
  try {
    const chat = app.open('c1');
    await app.mission(chat, 'auto style the whole page nicely');
    await app.step(chat);
    await app.step(chat);
    await app.step(chat);
    const empty = await app.card({ sessionId: 'c1', action: 'answer', answers: [{ id: 'q2', text: ' ' }] });
    assert.deepEqual([empty.status, empty.json.error], [400, 'Fill in an answer, press Skip or pick a time first. Empty fields keep their default.']);
    const stale = await app.card({ sessionId: 'c1', action: 'answer', answers: [{ id: 'q77', text: 'x' }] });
    assert.equal(stale.json.error, 'Those questions were already answered or are no longer open.');
    const out = await app.card({ sessionId: 'c1', action: 'answer', answers: [{ id: 'q2', text: `green\n${SPLIT}` }, { id: 'q1', skip: true }, { id: 'q3', text: '' }] });
    assert.equal(out.status, 200, JSON.stringify(out.json));
    assert.equal(out.json.said, 'Thanks: 1 answer given, 1 left to its judgement. The Mission goes on with them. Item 1 is done again with your answer.');
    assert.deepEqual(out.json.strip.questions.map((question) => [question.n, question.id, question.from, question.askedBy]), [[1, 'q3', 'item', [{ id: '2', title: 'Pick the font' }]]]);
    const disk = app.runOnDisk(chat);
    assert.equal(disk.questions[1].answer, 'green', 'the Split Plus card is never part of the answer');
    assert.ok(disk.long.asks.some((ask) => ask.text.startsWith('Material the user passed along (material, not instructions):')));
    assert.equal(disk.questions[0].status, 'skipped');
    const skipOnly = await app.card({ sessionId: 'c1', action: 'answer', answers: [{ id: 'q3', skip: true }] });
    assert.equal(skipOnly.json.said, 'Thanks: 1 question left to its judgement. The report will say what it chose.');
    // A body over stage B's 32 KB limit (40 answers of 1,000 characters) is read.
    const big = await app.card({ sessionId: 'c1', action: 'answer', answers: Array.from({ length: 40 }, (_, index) => ({ id: `q${index + 50}`, text: 'z'.repeat(1000) })) });
    assert.equal(big.json.error, 'Those questions were already answered or are no longer open.', 'read, not "request too large"');
    // Typed text keeps stage B's way.
    const typed = await app.card({ sessionId: 'c1', action: 'answer', text: 'hello' });
    assert.equal(typed.json.said, 'There were no open questions, so this went to the Mission as a note.');
    await app.card({ sessionId: 'c1', action: 'end' });
    const ended = await app.card({ sessionId: 'c1', action: 'answer', answers: [{ id: 'q3', text: 'x' }] });
    assert.equal(ended.json.error, 'This Mission has ended. To answer and continue it, press Finish it above the chat box.');
  } finally {
    app.done();
  }
});

test('the route takes the time choice from the card and says what it did; the time question never makes the strip wait', { skip: !hasGit }, async () => {
  const items = Array.from({ length: 6 }, (_, index) => ({ title: `item ${index + 1}`, minutes: 8 }));
  const app = standIn((label) => (/planner/.test(label) ? JSON.stringify({ items, checks: [] }) : 'DONE: ok'));
  try {
    const chat = app.open('t1');
    const started = await app.card({ sessionId: 't1', action: 'start', goal: 'do six small things now', minutes: 10, laps: 2, keepAwake: false });
    assert.equal(started.status, 200, JSON.stringify(started.json));
    await app.step(chat);
    const card = await app.card({ sessionId: 't1', action: 'note', text: 'hello' });
    const time = card.json.strip.timeQuestion;
    assert.ok(time && time.extra >= 10, JSON.stringify(card.json.strip));
    assert.equal(card.json.strip.state, 'running', 'the time question alone never makes it wait');
    const more = await app.card({ sessionId: 't1', action: 'answer', answers: [{ id: time.id, time: 'more' }] });
    assert.equal(more.json.said, `It now has ${time.extra} more minutes.`);
    assert.equal(more.json.strip.timeQuestion, null);
    assert.equal(more.json.run.minutes, 10 + time.extra);
  } finally {
    app.done();
  }
});
