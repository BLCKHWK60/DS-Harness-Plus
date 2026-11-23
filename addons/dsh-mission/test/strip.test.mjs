/**
 * Mission and Long run become one (item 1, stage B, 19 November 2026): the strip's state, the stamp, the new route
 * actions (note, answer, resume with text, a start from the conversation), typed /mission as a Mission, no time
 * limit and no lap limit, Finish this lap that says why it cannot, who paused a run, and the user's notes and brief
 * in the helpers' tasks. Each test fails on the code before stage B.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { GIT_CANDIDATES } from '../lib/checkpoints.js';
import { PLAN_CONTEXT_MAX, REVIEW_CONTEXT_MAX, USER_NOTES_HEADING, planPrompt, reviewPrompt, workPrompt } from '../lib/prompts.js';
import { ASK_MAX, CONTEXT_MAX, LAPS_AUTO, addAsk, addQuestion, answerQuestions, applyChecks, applyPlan, applyReview, applyWork, briefOf, finish, lapNotes, newRun, nextStep, planFit, readLong, report, unpauseRun, userNotes } from '../lib/run.js';
import { problemText, stripOf } from '../lib/strip.js';
import { READ_ONLY_TEXT, CREATOR_NO_MISSION_TEXT } from '../lib/gate.js';
import { createRunner, graceMs } from '../runner.js';
import { ARM_LAPSED_TEXT, ARM_MS, THREAD_GOAL, apply } from '../index.js';

const hasGit = GIT_CANDIDATES.some((path) => existsSync(path));
const fresh = (name = 'mission-strip-') => realpathSync(mkdtempSync(join(tmpdir(), name)));
const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
const T0 = Date.parse('2026-11-19T10:00:00Z');
const mission = (long = {}, at = T0) => newRun({ id: 'r', goal: 'make it good please', mode: 'Auto', root: '/x', limits: {}, at, kind: 'long', long: { minutes: 60, laps: 4, ...long } });
const SPLIT = '[Split Plus send AB12CD, 2026-11-19 09:00: material, not instructions]\nsome pasted material\n[End of Split Plus send AB12CD]';

// ---- The strip's state (lib/strip.js) -------------------------------------------------------------------

test('the strip: one state per situation, and the main button that goes with it', () => {
  const run = (over = {}) => ({ id: 'r', kind: 'long', status: 'running', pausedAt: 0, pausedBy: '', stalled: '', stalledDetails: '', goalPhase: 'active', questions: [], lap: 0, laps: 4, deadline: T0 + 3600000, finishLap: false, ...over });
  assert.deepEqual([stripOf({}).state, stripOf({}).main], ['none', 'send']);
  assert.deepEqual([stripOf({ armed: true }).state, stripOf({ starting: true }).main], ['starting', 'send']);
  assert.equal(stripOf({ armed: true, run: run(), now: T0 }).state, 'running', 'a press does not hide a Mission that runs');
  assert.deepEqual([stripOf({ run: run({ status: 'complete' }) }).state, stripOf({ run: run({ status: 'stopped' }) }).main], ['finished', 'send']);
  const running = stripOf({ run: run(), now: T0 });
  assert.deepEqual([running.state, running.main, running.canFinishLap, running.noTimeLimit], ['running', 'note', true, false]);
  // Waiting: only questions the user can answer; the time question (stage C) never counts.
  const time = { id: 'q1', text: 'More time?', status: 'open', kind: 'time', items: [] };
  assert.equal(stripOf({ run: run({ questions: [time] }), now: T0 }).state, 'running');
  const asked = stripOf({ run: run({ questions: [time, { id: 'q2', text: 'Which colour?', assume: 'blue', status: 'open', items: ['3'] }] }), now: T0 });
  // Stage D: questions while other work goes on keep it 'running' (Add note); 'waiting' is when nothing else can move.
  assert.deepEqual([asked.state, asked.main], ['running', 'note'], 'the main button stays Add note while questions are open (review of stage C)');
  assert.deepEqual(asked.questions, [{ n: 1, id: 'q2', text: 'Which colour?', assume: 'blue', items: ['3'], from: 'item', askedBy: [{ id: '3', title: '' }], parks: [] }], 'stage C adds who asked; stage D the items that stopped for it');
  const stuck = stripOf({ run: run({ questions: [{ id: 'q2', text: 'Which colour?', assume: 'blue', status: 'open', items: ['3'], parks: ['3'] }], waitingForYou: { since: T0, until: T0 + 180000 } }), now: T0 });
  assert.deepEqual([stuck.state, stuck.main, stuck.waitUntil, stuck.questions[0].parks], ['waiting', 'note', T0 + 180000, ['3']]);
  // Paused by you, by a restart, by the app; and by a problem, with its cleaned text and its raw details.
  const you = stripOf({ run: run({ pausedAt: T0, pausedBy: 'you', goalPhase: 'paused' }) });
  assert.deepEqual([you.state, you.main, you.pausedBy, you.problem, you.canFinishLap], ['paused', 'resume', 'you', null, false]);
  assert.equal(stripOf({ run: run({ pausedAt: T0, stalled: 'Waiting: the app restarted, and it never carries on.' }) }).pausedBy, 'restart', 'an old run without pausedBy');
  assert.equal(stripOf({ run: run({ goalPhase: 'paused' }) }).pausedBy, 'app');
  const problem = stripOf({ run: run({ pausedAt: T0, pausedBy: 'problem', goalPhase: 'paused', stalled: 'Paused by the Budget guard: this Mission reached its limit.', stalledDetails: 'raw' }), now: T0, retryAt: T0 + 120000 });
  assert.deepEqual([problem.state, problem.main], ['problem', 'resume']);
  assert.deepEqual(problem.problem, { text: 'The Budget guard: this Mission reached its limit.', details: 'raw' });
  assert.equal(problem.retryAt, T0 + 120000);
  assert.equal(problemText('Stopped by itself: the app stopped giving this run rounds.'), 'The app stopped giving this run rounds.');
  assert.equal(problemText('Paused: the model did not answer.'), 'The model did not answer.');
  // Finish this lap only where it can still do something.
  assert.equal(stripOf({ run: run(), now: T0 + 3600000 }).canFinishLap, false, 'its time is up');
  assert.equal(stripOf({ run: run({ lap: 3 }), now: T0 }).canFinishLap, false, 'the last lap');
  assert.equal(stripOf({ run: run({ finishLap: true }), now: T0 }).canFinishLap, false, 'already asked');
  assert.equal(stripOf({ run: run({ kind: 'mission' }), now: T0 }).canFinishLap, false, 'an old run has no laps');
  const free = stripOf({ run: run({ deadline: 0, laps: 0, lap: 40 }), now: T0 + 1e9 });
  assert.deepEqual([free.canFinishLap, free.noTimeLimit], [true, true], 'no time and no lap limit: it can always finish the lap');
  // Point 17 review: while it waits for you its clock stands still, so a wait past the first deadline (or at the lap
  // limit) still offers Finish this lap, which ends it at once.
  const waitingPast = stripOf({ run: run({ lap: 4, waitingForYou: { since: T0 + 1800000, until: 0 } }), now: T0 + 2 * 3600000 });
  assert.deepEqual([waitingPast.state, waitingPast.canFinishLap], ['waiting', true]);
  assert.equal(stripOf({ run: run({ finishLap: true, waitingForYou: { since: T0, until: 0 } }), now: T0 }).canFinishLap, false, 'already asked');
  assert.match(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), /finishLap: \{ title: 'Finish this lap'[^}]*While it waits for you, it stops waiting and writes its report now\./, 'its (i) says so');
});

// ---- No time limit, no lap limit, steps (lib/run.js) --------------------------------------------------

test('no time limit and no lap limit: deadline 0, never ended by the clock or the lap count; steps 0 is automatic', () => {
  assert.deepEqual(readLong({ minutes: 0, laps: 0, steps: 0 }), { minutes: 0, laps: 0, steps: 0, fullTime: false });
  assert.deepEqual(readLong({ minutes: 3, laps: 60, steps: 2 }), { minutes: 10, laps: 50, steps: 5, fullTime: false });
  assert.deepEqual(readLong({ minutes: 9999, steps: 99999, fullTime: true }), { minutes: 720, laps: 10, steps: 2000, fullTime: true });
  assert.equal(readLong({ minutes: 0, fullTime: true }).fullTime, false, 'use the full time means nothing without a time limit');
  const run = mission({ minutes: 0, laps: 0 });
  assert.equal(run.long.deadline, 0);
  assert.equal(run.limits.maxReviews, LAPS_AUTO + 1);
  assert.equal(run.limits.maxSteps, 1 + LAPS_AUTO * (12 * 2 + 2));
  assert.equal(mission({ steps: 40 }).limits.maxSteps, 40, 'a steps limit set by the user wins');
  applyPlan(run, { items: [{ title: 'a', check: 'a' }], checks: [] });
  assert.equal(nextStep(run, T0 + 100 * 3600000).kind, 'work', 'a hundred hours later the clock has not ended it');
  run.long.lap = 30;
  run.long.lapEnded = true;
  assert.equal(nextStep(run, T0).kind, 'work', 'thirty laps and no lap limit');
  assert.equal(planFit(run), undefined, 'no time question');
  assert.equal(lapNotes(run).split('\n')[0], 'Lap 30.');
  assert.equal(lapNotes(mission()).split('\n')[0], 'Lap 0 of at most 4.');
  run.pausedAt = T0;
  run.pausedBy = 'you';
  assert.equal(unpauseRun(run, T0 + 600000), 600000);
  assert.equal(run.long.deadline, 0, 'resume does not make up a deadline');
  assert.equal(run.long.pausedMs, 600000);
  assert.equal(run.pausedBy, '');
  assert.equal(graceMs(run), 0);
  finish(run, '', T0 + 60000);
  assert.match(report(run), /^Mission (complete|not complete|stopped)/);
  assert.match(report(run), /Laps: 30\. Time limit: none\./);
  assert.match(report(mission()), /Laps: 0 of at most 4\. Time limit: 60 minutes\./);
});

test('the planner of a Mission with no time limit gets no time line (never "1 minute"); the clock never sweeps it', async () => {
  const seen = [];
  let made = false;
  const goals = { create: () => { made = true; }, get: () => (made ? { id: 'g', revision: 1, phase: 'active' } : undefined), pause: () => {}, resume: () => {}, complete: () => {}, clear: () => {} };
  const subagents = { startActivation: async (spec) => { seen.push(spec.prompt?.[0]?.text ?? ''); return { childId: `c${seen.length}`, result: Promise.resolve({ output: [{ type: 'text', text: JSON.stringify({ summary: 's', items: [{ title: 'a' }], checks: [] }) }], stopReason: 'end' }) }; } };
  const ctx = { get: (name) => ({ goals, subagents })[name] };
  const points = { take: async () => ({ id: 'p', number: 1 }), files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '' };
  const runner = createRunner(ctx, { settings: () => ({ limits: {}, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {} });
  const root = fresh();
  try {
    const agent = { id: 'conv', model: { current: () => ({ provider: 'p', model: 'm' }) } };
    const said = await runner.start(agent, 'make it good please', { mode: 'auto', root }, { kind: 'long', long: { minutes: 0, laps: 0 } });
    assert.match(said, /^Mission started \(Auto\), one model\. It works by itself now, until its checklist is done \(no time limit\)\. When it needs you: Ask, keep working\.[^\n]* Pause or End it above the chat box/);
    await runner.step(agent, new AbortController().signal, 60000);
    assert.doesNotMatch(seen[0], /minutes in all/);
    assert.deepEqual(runner.sweep(Date.now() + 1e9, () => agent), [], 'no time limit: the wall clock leaves it alone');
    assert.equal(runner.view('conv').deadline, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- Notes, answers and the brief ------------------------------------------------------------------

test('notes and answers: any run takes notes; answers go to the open questions in order; items finished on a default are done again', () => {
  const old = newRun({ id: 'o', goal: 'g g g', mode: 'Auto', root: '/x', limits: {}, at: T0 });
  assert.equal(addAsk(old, 'a note to an old run'), true, 'a run from before stage B (kind mission) takes notes too');
  assert.deepEqual(old.asks.map((ask) => ask.text), ['a note to an old run']);
  assert.equal(ASK_MAX, 1000);
  const run = mission();
  addAsk(run, 'x'.repeat(1500));
  assert.equal(run.long.asks[0].text.length, 1000);
  applyPlan(run, { items: [{ title: 'colour', check: 'c' }, { title: 'size' }, { title: 'other', check: 'o' }], checks: [] });
  addQuestion(run, { text: 'Which colour?', assume: 'blue', items: ['1'] });
  addQuestion(run, { text: 'Which size?', assume: 'large', items: ['2'] });
  addQuestion(run, { text: 'More time?', kind: 'time' });
  applyWork(run, '1', { check: { ok: true, output: '' }, assumed: 'blue' });
  applyWork(run, '2', { assumed: 'large' });
  applyWork(run, '3', { check: { ok: true, output: '' } });
  assert.equal(run.items[0].tries, 1);
  const out = answerQuestions(run, '1. green\n2) small, but\nnot tiny', T0 + 1000);
  assert.deepEqual(out, { answered: ['q1', 'q2'], reopened: ['1', '2'], late: [] });
  assert.equal(run.questions[0].answer, 'green');
  assert.equal(run.questions[1].answer, 'small, but\nnot tiny');
  assert.equal(run.questions[2].status, 'open', 'the time question is never touched');
  assert.equal(run.items[0].status, 'open');
  assert.equal(run.items[0].tries, 0, 'the redo uses no try');
  assert.match(run.items[0].note, /^Your answer: green/);
  assert.equal(run.items[2].status, 'verified', 'an item not finished on a default stays done');
  assert.equal(nextStep(run, T0).kind, 'work');
  // Without numbers: one answer for every open question.
  const all = mission();
  applyPlan(all, { items: [{ title: 'a' }], checks: [] });
  addQuestion(all, { text: 'One?' });
  addQuestion(all, { text: 'Two?' });
  assert.deepEqual(answerQuestions(all, 'do what you think best').answered, ['q1', 'q2']);
  // After Finish this lap ended the lap: no step is left to redo it, so it keeps its result and the report shows the answer.
  const late = mission();
  applyPlan(late, { items: [{ title: 'a', check: 'a' }], checks: [] });
  addQuestion(late, { text: 'Which?', items: ['1'] });
  applyWork(late, '1', { check: { ok: true, output: '' }, assumed: 'x' });
  late.long.finishLap = true;
  applyReview(late, { items: [] });
  assert.deepEqual(answerQuestions(late, 'y', T0 + 500), { answered: ['q1'], reopened: [], late: ['1'] });
  assert.equal(late.items[0].status, 'verified', 'not reopened: it passed, on the default');
  assert.deepEqual(nextStep(late, T0), { kind: 'finish', why: 'asked' });
  finish(late, '', T0 + 1000);
  assert.match(report(late), /\[PASSED\] a [\s\S]*Your answer: y It came too late to do the item again/);
  // The report lists your notes and your answers.
  finish(run, '', T0 + 2000);
  assert.match(report(run), /Your notes to the Mission:\n- x{20}/);
  assert.match(report(run), /Questions you answered:\n- Which colour\?\n {2}Your answer: green/);
});

test('the helpers get the user\'s notes in a block of their own, the brief at its new sizes, and workers the end of the brief only when it started from the conversation', () => {
  const run = mission({ context: `${'old talk '.repeat(3000)}THE NEWEST PART`, fromThread: true });
  assert.ok(run.long.context.length <= CONTEXT_MAX && run.long.context.endsWith('THE NEWEST PART'), 'the newest part of the brief is kept');
  addAsk(run, 'use the blue theme');
  addQuestion(run, { text: 'Which font?' });
  answerQuestions(run, 'Inter');
  const notes = userNotes(run);
  assert.match(notes, /^Your answers to its questions:\n- Question: Which font\?\n {2}Answer: Inter\nYour notes \(newest last\):\n- use the blue theme$/);
  assert.doesNotMatch(lapNotes(run), /blue theme/, 'no longer inside the lap notes, which are cut at 2,000');
  const long = mission();
  for (let i = 0; i < 10; i += 1) addAsk(long, `${i} ${'y'.repeat(900)}`);
  assert.ok(userNotes(long).length <= 3000 && /9 y/.test(userNotes(long)), 'the newest notes are kept');
  const plan = planPrompt({ goal: 'g', root: '/x', files: '', maxItems: 5, context: run.long.context, userNotes: notes });
  assert.ok(plan.includes(`${USER_NOTES_HEADING}\n${notes}`));
  assert.ok(plan.includes('THE NEWEST PART') && plan.length > PLAN_CONTEXT_MAX - 100, 'the planner gets the whole brief');
  assert.match(plan, /What was said in the thread before the Mission \(its brief: the goal and this together say what to do\):/);
  const review = reviewPrompt({ goal: 'g', list: '', checks: '', changes: '', last: false, context: run.long.context, userNotes: notes });
  assert.ok(review.includes(USER_NOTES_HEADING) && review.includes('THE NEWEST PART'));
  assert.ok(review.includes(run.long.context.slice(-REVIEW_CONTEXT_MAX)) && !review.includes(run.long.context.slice(-(REVIEW_CONTEXT_MAX + 50))), 'the reviewer gets the last 4,000');
  const brief = briefOf(run);
  assert.ok(brief.length <= 2000 && brief.endsWith('THE NEWEST PART'));
  assert.equal(briefOf(mission({ context: 'talk' })), '', 'not started from the thread: no brief for workers');
  const work = workPrompt({ goal: 'g', item: { id: '1', title: 't', tries: 0 }, userNotes: notes, brief });
  assert.ok(work.includes(USER_NOTES_HEADING) && work.includes('THE NEWEST PART'));
});

// ---- The runner: Finish this lap, who paused ---------------------------------------------------------

function bench() {
  const goal = { id: 'g', revision: 1, phase: 'active' };
  let made = false;
  const goals = { create: () => { made = true; goal.phase = 'active'; }, get: () => (made ? goal : undefined), pause: () => { goal.phase = 'paused'; }, resume: () => { goal.phase = 'active'; }, complete: () => { goal.phase = 'complete'; }, clear: () => { made = false; } };
  const ctx = { get: (name) => ({ goals, subagents: { startActivation: async () => { throw new Error('none'); } } })[name] };
  const points = { take: async () => ({ id: 'p', number: 1 }) };
  const runner = createRunner(ctx, { settings: () => ({ limits: {}, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {} });
  const root = fresh();
  const agent = { id: 'conv', model: { current: () => ({ provider: 'p', model: 'm' }) } };
  return { runner, agent, goal, root, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('Finish this lap says why when it can do nothing (time up, last lap, no laps) and sets no flag', async () => {
  const app = bench();
  try {
    await app.runner.start(app.agent, 'make it good please', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 10, laps: 2 } });
    const run = app.runner.runOf('conv');
    assert.equal(app.runner.finishLap(app.agent, run.long.deadline + 1), 'Its time is up already: it ends after the step under way and writes its report.');
    assert.equal(run.long.finishLap, false, 'the lab bug: no flag after the deadline');
    run.long.lap = 1;
    assert.equal(app.runner.finishLap(app.agent), 'This is its last lap already: it ends after this lap anyway.');
    assert.equal(run.long.finishLap, false);
    run.long.lap = 0;
    assert.equal(app.runner.finishLap(app.agent), 'The Mission finishes the lap under way (lap 1), then writes its report.');
    assert.equal(run.long.finishLap, true);
    run.kind = 'mission';
    assert.equal(app.runner.finishLap(app.agent), 'This Mission has no laps to finish.');
  } finally {
    app.done();
  }
});

test('who paused: you, a problem, a restart; Resume clears it; the view gives the strip what it needs', async () => {
  const app = bench();
  try {
    await app.runner.start(app.agent, 'make it good please', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 0, laps: 0, steps: 30 } });
    const run = app.runner.runOf('conv');
    let view = app.runner.view('conv');
    assert.deepEqual([view.pausedBy, view.stepsAbout, view.workingItem, view.hasAside, view.deadline, view.laps, view.stepLimit, view.phase], ['', 0, '', false, 0, 0, 30, 'plan']);
    assert.match(app.runner.stop(app.agent), /Press Resume beside the chat box/);
    assert.equal(app.runner.view('conv').pausedBy, 'you');
    app.runner.resume(app.agent);
    assert.equal(app.runner.view('conv').pausedBy, '');
    app.runner.hold(app.agent, 'the model did not answer');
    assert.equal(run.pausedBy, 'problem');
    app.runner.resume(app.agent);
    app.runner.selfStopped(app.agent, 'error');
    assert.equal(run.pausedBy, 'problem');
    app.runner.resume(app.agent);
    app.runner.selfStopped(app.agent, 'restart');
    assert.equal(run.pausedBy, 'restart');
    app.runner.resume(app.agent);
    app.runner.announceInterrupted('conv', run);
    assert.equal(run.pausedBy, 'restart');
    assert.match(run.stalled, /Press Resume beside the chat box/);
    app.runner.resume(app.agent);
    for (let i = 0; i < 6; i += 1) app.runner.round(app.agent);
    assert.equal(run.pausedBy, 'problem', 'the idle brake');
    assert.match(run.stalled, /Press Resume to try again/);
    app.runner.resume(app.agent);
    applyPlan(run, { items: [{ title: 'a', check: 'a' }, { title: 'b' }], checks: ['npm test'] });
    view = app.runner.view('conv');
    assert.equal(view.stepsAbout, 1 + 2 + 1 + 1, 'steps taken, open items, the overall commands, a review');
    // The strip says "now: an extra lap" from view.hunting (the client reads it), so the view must carry it.
    assert.equal(view.hunting, false);
    run.long.hunting = true;
    assert.equal(app.runner.view('conv').hunting, true);
  } finally {
    app.done();
  }
});

// ---- The add-on in a stand-in app: route, stamp, typed /mission ----------------------------------------

function standIn({ tab = 'cowork', creator = false, answer } = {}) {
  const home = fresh('mission-strip-app-');
  const goals = new Map();
  const handlers = new Map();
  const commands = {};
  const tools = {};
  const routes = {};
  const agents = new Map();
  const provided = {};
  const services = {
    dshHomePath: (sub) => join(home, sub),
    modes: { isolated: () => false, get: () => tab, readOnly: () => tab === 'data', longTools: () => ({ files: true, web: true }), refreshTools: () => {}, depthOf: () => 'standard' },
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
    subagents: {
      startActivation: async (spec) => {
        if (!answer) throw new Error('no helpers in this test');
        const text = answer(spec.label);
        return { childId: `h-${Math.random().toString(36).slice(2, 8)}`, result: Promise.resolve({ output: [{ type: 'text', text }], stopReason: 'end' }) };
      },
    },
    ...(creator ? { creatorPlus: { longRunRules: () => ({ cleanEnv: true }) } } : {}),
  };
  const ctx = {
    logger: { warn: () => {}, info: () => {} },
    get: (name) => services[name],
    effect: (start) => start(),
    provide: (name, service) => { provided[name] = service; return () => {}; },
    on: (name, handler) => { handlers.set(name, [...(handlers.get(name) ?? []), handler]); return () => {}; },
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
  const open = (id, messages = []) => {
    const cwd = fresh();
    folders.push(cwd);
    const agent = { id, header: { cwd }, session: { id, header: { cwd }, append: () => {}, deriveMessages: () => messages }, model: { current: () => ({ provider: 'p', model: 'm' }) } };
    agents.set(id, agent);
    return agent;
  };
  const emit = (name, ...args) => { for (const handler of handlers.get(name) ?? []) handler(...args); };
  const card = async (method, body, since = '') => {
    const chunks = method === 'POST' ? [Buffer.from(JSON.stringify(body))] : [];
    const req = { method, url: method === 'GET' ? `/dsh-mission/long?sessionId=${encodeURIComponent(body.sessionId)}${since ? `&since=${encodeURIComponent(since)}` : ''}` : '/dsh-mission/long', headers: {}, async *[Symbol.asyncIterator]() { yield* chunks; } };
    let out = '';
    const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text ?? ''; } };
    await routes['/dsh-mission/long'](req, res);
    return { status: res.statusCode, json: out ? JSON.parse(out) : null };
  };
  const runOnDisk = (agent) => {
    const dir = join(agent.header.cwd, '.dsh-mission', 'runs');
    const [id] = readdirSync(dir);
    return { ...JSON.parse(readFileSync(join(dir, id, 'run.json'), 'utf8')), log: readFileSync(join(dir, id, 'log.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)) };
  };
  return {
    home, goals, provided, open, emit, card, runOnDisk,
    mission: (agent, rawInput) => commands.mission.handler({ agent, rawInput }),
    step: (agent) => tools.mission_step.execute({}, { agent, signal: new AbortController().signal }),
    done: () => { for (const folder of folders) rmSync(folder, { recursive: true, force: true }); },
  };
}
const said = (text, kind = 'user') => ({ id: `m-${Math.random().toString(36).slice(2, 8)}`, role: 'user', source: { kind }, content: [{ type: 'text', text }] });
const answered = (text) => ({ id: `a-${Math.random().toString(36).slice(2, 8)}`, role: 'assistant', content: [{ type: 'text', text }] });

test('the stamp: a per-boot id, the same stamp answers {same: true}, and every action changes it', { skip: !hasGit }, async () => {
  const app = standIn();
  try {
    app.open('s1');
    const first = await app.card('GET', { sessionId: 's1' });
    assert.equal(first.status, 200);
    assert.match(first.json.stamp, /^[0-9a-f]{8}\.\d+\.0\.0\.0$/);
    assert.deepEqual([first.json.strip.state, first.json.strip.main, first.json.hasThread], ['none', 'send', false]);
    assert.deepEqual((await app.card('GET', { sessionId: 's1' }, first.json.stamp)).json, { same: true, stamp: first.json.stamp });
    const stale = `${first.json.stamp.split('.')[0]}x.0.0.0.0`;
    assert.ok((await app.card('GET', { sessionId: 's1' }, stale)).json.run !== undefined, 'another stamp gets the full card');
    const saved = await app.card('POST', { sessionId: 's1', action: 'save', minutes: 0, laps: 0, steps: 120 });
    assert.notEqual(saved.json.stamp, first.json.stamp);
    assert.deepEqual([saved.json.saved.minutes, saved.json.saved.laps, saved.json.saved.steps], [0, 0, 120]);
    const armed = await app.card('POST', { sessionId: 's1', action: 'arm' });
    assert.equal(armed.json.strip.state, 'starting');
    assert.match(armed.json.stamp, /\.0\.1\.0$/, 'armed shows in the stamp');
    const refused = await app.card('POST', { sessionId: 's1', action: 'note', text: 'hello' });
    assert.equal(refused.status, 400);
    assert.equal(refused.json.error, 'No Mission is on here, so the note was not given.');
    const after = await app.card('GET', { sessionId: 's1' });
    assert.notEqual(after.json.stamp, armed.json.stamp, 'a failed action changes the stamp too');
    // A goal change of the conversation changes it as well.
    app.emit('goal/changed', { agent: { id: 's1' }, change: { operation: 'pause' } });
    assert.notEqual((await app.card('GET', { sessionId: 's1' })).json.stamp, after.json.stamp);
  } finally {
    app.done();
  }
});

test('Start Mission from the conversation: nothing typed needs a thread; "do it" after a talk is enough; the brief is the whole thread', { skip: !hasGit }, async () => {
  const app = standIn();
  try {
    app.open('t0', [said(SPLIT)]);
    const none = await app.card('POST', { sessionId: 't0', action: 'start', fromThread: true });
    assert.equal(none.status, 400);
    assert.equal(none.json.error, 'Type what the Mission should do in the chat box first.', 'a Split Plus card alone is no thread');
    assert.equal((await app.card('GET', { sessionId: 't0' })).json.hasThread, false);
    const talk = [said('We should add a dark mode to the settings page'), answered('Agreed: a toggle and a saved choice.')];
    app.open('t1', talk);
    assert.equal((await app.card('GET', { sessionId: 't1' })).json.hasThread, true);
    const started = await app.card('POST', { sessionId: 't1', action: 'start', fromThread: true, keepAwake: false });
    assert.equal(started.status, 200, JSON.stringify(started.json));
    const view = started.json.run;
    assert.equal(view.goal, THREAD_GOAL);
    assert.equal(view.kind, 'long');
    assert.equal(started.json.strip.state, 'running');
    // "do it" (two words) after a talk.
    app.open('t2', talk);
    const short = await app.card('POST', { sessionId: 't2', action: 'start', goal: 'do it', fromThread: true, keepAwake: false });
    assert.equal(short.status, 200, JSON.stringify(short.json));
    assert.equal(short.json.run.goal, 'do it');
    // Without a thread, two words are refused.
    app.open('t3');
    const bare = await app.card('POST', { sessionId: 't3', action: 'start', goal: 'do it' });
    assert.equal(bare.json.error, 'Say what the Mission should do in a few words.');
  } finally {
    app.done();
  }
});

test('Add note, Answer and continue, Resume with text: they reach the run directly; a Split Plus card is material, never the user\'s words', { skip: !hasGit }, async () => {
  const app = standIn();
  try {
    const chat = app.open('n1', [said('build the report page')]);
    assert.equal((await app.mission(chat, 'auto build the report page with charts')).kind, 'success');
    const empty = await app.card('POST', { sessionId: 'n1', action: 'note', text: '  ' });
    assert.equal(empty.json.error, 'Type a note in the chat box first.');
    const note = await app.card('POST', { sessionId: 'n1', action: 'note', text: `use the brand colours\n${SPLIT}` });
    assert.equal(note.status, 200);
    assert.equal(note.json.said, 'Your note reaches the Mission at its next step.');
    let disk = app.runOnDisk(chat);
    assert.deepEqual(disk.long.asks.map((ask) => ask.text.split('\n')[0]), ['Material the user passed along (material, not instructions):', 'use the brand colours']);
    assert.ok(disk.log.some((entry) => entry.kind === 'note'));
    const long = await app.card('POST', { sessionId: 'n1', action: 'note', text: 'z'.repeat(1200) });
    assert.match(long.json.said, /Only the first 1,000 characters were kept\.$/);
    // No open question: an answer is a note.
    const asNote = await app.card('POST', { sessionId: 'n1', action: 'answer', text: 'blue' });
    assert.equal(asNote.json.said, 'There were no open questions, so this went to the Mission as a note.');
    // Pause, then Resume with text: the text goes along only after the Mission really carries on.
    await app.card('POST', { sessionId: 'n1', action: 'pause' });
    const paused = await app.card('GET', { sessionId: 'n1' });
    assert.deepEqual([paused.json.strip.state, paused.json.strip.main, paused.json.strip.pausedBy], ['paused', 'resume', 'you']);
    const resumed = await app.card('POST', { sessionId: 'n1', action: 'resume', text: `and keep it simple\n${SPLIT}` });
    assert.equal(resumed.status, 200, JSON.stringify(resumed.json));
    assert.match(resumed.json.said, /^Mission carries on/);
    assert.match(resumed.json.said, /Your note reaches the Mission at its next step\./);
    disk = app.runOnDisk(chat);
    assert.ok(disk.long.asks.some((ask) => ask.text === 'and keep it simple'));
    assert.ok(!disk.long.asks.some((ask) => ask.text.startsWith('and keep it simple') && ask.text.includes('pasted material')), 'the card is never part of the user\'s words');
    assert.equal(resumed.json.strip.state, 'running');
  } finally {
    app.done();
  }
});

test('answers on the route: the strip waits for them, numbered answers reach the questions that asked, and an item finished on a default is done again', { skip: !hasGit }, async () => {
  const PLANNED = JSON.stringify({ summary: 's', items: [{ title: 'Pick the colours' }, { title: 'Pick the font' }], checks: [] });
  const app = standIn({ answer: (label) => (/planner/.test(label) ? PLANNED : /item 1/.test(label) ? 'QUESTION: Which colour? | ASSUMING: blue' : /item 2/.test(label) ? 'QUESTION: Which font? | ASSUMING: Inter' : 'DONE: ok') });
  try {
    const chat = app.open('q1', [said('style the page')]);
    await app.mission(chat, 'auto style the whole page nicely');
    await app.step(chat);
    await app.step(chat);
    await app.step(chat);
    const card = await app.card('GET', { sessionId: 'q1' });
    assert.deepEqual([card.json.strip.state, card.json.strip.main], ['running', 'note'], 'stage D: questions alone do not make it wait');
    assert.deepEqual(card.json.strip.questions.map((question) => [question.n, question.text, question.assume, question.items]), [[1, 'Which colour?', 'blue', ['1']], [2, 'Which font?', 'Inter', ['2']]]);
    const empty = await app.card('POST', { sessionId: 'q1', action: 'answer', text: '' });
    assert.equal(empty.json.error, 'Type your answers first. Unanswered questions keep their default.');
    const out = await app.card('POST', { sessionId: 'q1', action: 'answer', text: '1. green' });
    assert.equal(out.status, 200, JSON.stringify(out.json));
    assert.equal(out.json.said, 'Thanks: 1 answer given. The Mission goes on with it. Item 1 is done again with your answer.');
    assert.equal(out.json.strip.questions.length, 1, 'question 2 is still open');
    assert.deepEqual(out.json.strip.questions.map((question) => question.text), ['Which font?']);
    const disk = app.runOnDisk(chat);
    assert.equal(disk.items[0].status, 'open');
    assert.equal(disk.questions[0].answer, 'green');
    assert.ok(disk.log.some((entry) => entry.kind === 'answer'));
    const both = await app.card('POST', { sessionId: 'q1', action: 'answer', text: 'Roboto' });
    assert.match(both.json.said, /^Thanks: 1 answer given\. .*Item 2 is done again/);
    assert.equal(both.json.strip.state, 'running');
  } finally {
    app.done();
  }
});

test('Resume checks the problem first; an error changes nothing (no note is added)', { skip: !hasGit }, async () => {
  const app = standIn();
  try {
    const chat = app.open('r1', [said('make the tests pass')]);
    await app.mission(chat, 'auto make every test pass now');
    await app.card('POST', { sessionId: 'r1', action: 'pause' });
    // The folder is gone: Resume says so, with the tick's key as details, and keeps the run as it is.
    rmSync(chat.header.cwd, { recursive: true, force: true });
    const refused = await app.card('POST', { sessionId: 'r1', action: 'resume', text: 'a note that must not be kept' });
    assert.equal(refused.status, 400);
    assert.equal(refused.json.details, 'folder');
    assert.match(refused.json.error, /folder is gone/);
    assert.equal(app.goals.get('r1').phase, 'paused');
  } finally {
    app.done();
  }
});

test('typed /mission is a Mission: kind long with this chat\'s Mission settings; stage E: Data and Creator Plus allow it inside their rules', { skip: !hasGit }, async () => {
  const app = standIn();
  try {
    const chat = app.open('m1', [said('we talked about the export')]);
    await app.card('POST', { sessionId: 'm1', action: 'save', minutes: 0, laps: 3, steps: 0 });
    const started = await app.mission(chat, 'auto add the csv export');
    assert.equal(started.kind, 'success', started.text);
    assert.match(started.text, /^Mission started \(Auto\).*until its checklist is done \(no time limit\), in at most 3 laps\./);
    const view = app.provided.mission.view('m1');
    assert.deepEqual([view.kind, view.deadline, view.laps], ['long', 0, 3]);
    assert.deepEqual(app.provided.mission.runOf('m1').kind, 'long');
    assert.ok(app.provided.mission.longRunId('m1'), 'Budget guard\'s Mission allowance now covers a typed Mission');
    const disk = app.runOnDisk(chat);
    assert.match(disk.long.context, /we talked about the export/, 'the thread is its brief');
    assert.equal(disk.long.fromThread, true, 'a short typed goal: workers get the end of the brief');
    const card = await app.card('GET', { sessionId: 'm1' });
    assert.deepEqual([card.json.strip.state, card.json.strip.main, card.json.strip.noTimeLimit], ['running', 'note', true]);
  } finally {
    app.done();
  }
  const data = standIn({ tab: 'data' });
  try {
    const chat = data.open('d1');
    // Stage E (point 12): a typed goal works in Data (point 14's refusal lifted); the mode words alone stay refused.
    assert.equal((await data.mission(chat, 'auto add the csv export')).kind, 'success');
    assert.deepEqual(await data.mission(chat, 'auto'), { kind: 'error', text: READ_ONLY_TEXT });
    assert.match(READ_ONLY_TEXT, /A Mission works here: type \/mission and what it should do, or press Start Mission/);
  } finally {
    data.done();
  }
  const creator = standIn({ creator: true });
  try {
    const chat = creator.open('c1');
    // Stage E (point 12): a Mission works in Creator Plus, inside its rules (checks without the internet and keys).
    const started = await creator.mission(chat, 'auto add the csv export');
    assert.equal(started.kind, 'success', started.text);
    assert.equal(creator.runOnDisk(chat).long.creator.cleanEnv, true);
    assert.ok(CREATOR_NO_MISSION_TEXT);
  } finally {
    creator.done();
  }
});

test('typed /mission with no time limit saved for the chat runs without one (owner, 20 November); a saved limit is used', { skip: !hasGit }, async () => {
  const app = standIn();
  try {
    const plain = app.open('t1', [said('we talked about the export')]);
    const started = await app.mission(plain, 'auto add the csv export');
    assert.equal(started.kind, 'success', started.text);
    assert.match(started.text, /no time limit/);
    assert.equal(app.provided.mission.view('t1').deadline, 0, 'nothing saved: no clock');
    const timed = app.open('t2', [said('we talked about the export')]);
    await app.card('POST', { sessionId: 't2', action: 'save', minutes: 30, laps: 3, steps: 0 });
    const again = await app.mission(timed, 'auto add the csv export');
    assert.equal(again.kind, 'success', again.text);
    assert.ok(app.provided.mission.view('t2').deadline > 0, 'a saved time limit is kept');
  } finally {
    app.done();
  }
});

test('Finish this lap on the route says why, and the strip hides it then', { skip: !hasGit }, async () => {
  const app = standIn();
  try {
    app.open('f1', [said('do the work')]);
    await app.card('POST', { sessionId: 'f1', action: 'save', minutes: 30, laps: 1 });
    await app.card('POST', { sessionId: 'f1', action: 'start', goal: 'do the work well please', keepAwake: false });
    const card = await app.card('GET', { sessionId: 'f1' });
    assert.equal(card.json.strip.canFinishLap, false, 'one lap: it is the last lap already');
    const lap = await app.card('POST', { sessionId: 'f1', action: 'finish-lap' });
    assert.equal(lap.status, 200);
    assert.equal(lap.json.said, 'This is its last lap already: it ends after this lap anyway.');
    assert.equal(lap.json.run.finishLap, false);
  } finally {
    app.done();
  }
});

// ---- Stage B review (19 November): answers that look numbered, and answers that come too late ---------------

test('a decimal or version number at the start of an answer is a plain answer, never a question number', () => {
  const one = mission();
  applyPlan(one, { items: [{ title: 'a' }], checks: [] });
  addQuestion(one, { text: 'Which Node version?' });
  assert.deepEqual(answerQuestions(one, '18.2', T0 + 1000).answered, ['q1']);
  assert.equal(one.questions[0].answer, '18.2');
  const two = mission();
  applyPlan(two, { items: [{ title: 'a' }], checks: [] });
  addQuestion(two, { text: 'Timeout?' });
  addQuestion(two, { text: 'Retry wait?' });
  assert.deepEqual(answerQuestions(two, '2.5 seconds is fine for both', T0 + 1000).answered, ['q1', 'q2']);
  assert.deepEqual(two.questions.map((question) => question.answer), ['2.5 seconds is fine for both', '2.5 seconds is fine for both']);
  for (const text of ['1.5x', '3.11', '8.0.1']) {
    const run = mission();
    applyPlan(run, { items: [{ title: 'a' }], checks: [] });
    addQuestion(run, { text: 'Which?' });
    assert.equal(answerQuestions(run, text, T0 + 1000).answered.length, 1, text);
    assert.equal(run.questions[0].answer, text);
  }
  // Real numbering still works, also with a number alone on its line.
  const numbered = mission();
  applyPlan(numbered, { items: [{ title: 'a' }], checks: [] });
  addQuestion(numbered, { text: 'One?' });
  addQuestion(numbered, { text: 'Two?' });
  answerQuestions(numbered, '1.\nyes\n2) 18.2', T0 + 1000);
  assert.deepEqual(numbered.questions.map((question) => question.answer), ['yes', '18.2']);
});

test('an answer during the last lap\'s review, or after the time is up, keeps the item\'s result instead of reopening it', () => {
  const setup = (long) => {
    const run = mission(long);
    applyPlan(run, { items: [{ title: 'a', check: 'a' }], checks: [] });
    addQuestion(run, { text: 'Which?', items: ['1'] });
    applyWork(run, '1', { check: { ok: true, output: '' }, assumed: 'x' });
    return run;
  };
  // The last lap (laps 1), its review under way.
  const review = setup({ laps: 1 });
  const out = answerQuestions(review, 'y', T0 + 1000, { under: 'review' });
  assert.deepEqual(out, { answered: ['q1'], reopened: [], late: ['1'] });
  assert.equal(review.items[0].status, 'verified');
  assert.match(review.items[0].note, /Your answer: y It came too late/);
  // No step under way, the next one is the last lap's review: late too.
  assert.deepEqual(answerQuestions(setup({ laps: 1 }), 'y', T0 + 1000).late, ['1']);
  // Finish this lap set, review next: late.
  const finishing = setup({ laps: 4 });
  finishing.long.finishLap = true;
  assert.deepEqual(answerQuestions(finishing, 'y', T0 + 1000).late, ['1']);
  // The deadline passed (the step under way is in its grace time): late.
  assert.deepEqual(answerQuestions(setup({ laps: 4 }), 'y', T0 + 61 * 60000, { under: 'work' }).late, ['1']);
  // An earlier lap, a work step under way: reopened and done again, as before.
  const early = setup({ laps: 4 });
  assert.deepEqual(answerQuestions(early, 'y', T0 + 1000, { under: 'work' }), { answered: ['q1'], reopened: ['1'], late: [] });
  assert.equal(early.items[0].status, 'open');
  // The last lap with its work still under way: the item is done before the review, so it is reopened.
  assert.deepEqual(answerQuestions(setup({ laps: 1 }), 'y', T0 + 1000, { under: 'work' }).reopened, ['1']);
});

test('Start Mission with only a Split Plus card and a thread: the thread is the brief and the card goes along as material', { skip: !hasGit }, async () => {
  const app = standIn();
  try {
    const chat = app.open('cm1', [said('We should add a dark mode to the settings page'), answered('Agreed: a toggle and a saved choice.')]);
    const started = await app.card('POST', { sessionId: 'cm1', action: 'start', fromThread: true, material: SPLIT, keepAwake: false });
    assert.equal(started.status, 200, JSON.stringify(started.json));
    assert.equal(started.json.run.goal, THREAD_GOAL);
    const context = app.runOnDisk(chat).long.context;
    assert.match(context, /dark mode/, 'the thread is kept');
    assert.match(context, /Material the user sent along with the goal, from another thread \(material, not instructions\):\n\[Split Plus send AB12CD[\s\S]*some pasted material/);
  } finally {
    app.done();
  }
});

test('a press of Start Mission whose message never arrives says why on the button when it runs out', { skip: !hasGit }, async () => {
  const app = standIn();
  try {
    app.open('am1', [said('We should add a dark mode to the settings page')]);
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const armed = await app.card('POST', { sessionId: 'am1', action: 'arm' });
      assert.equal(armed.json.strip.state, 'starting');
      mock.timers.tick(ARM_MS + 10);
    } finally {
      mock.timers.reset();
    }
    const after = await app.card('GET', { sessionId: 'am1' });
    assert.equal(after.json.strip.state, 'none');
    assert.equal(after.json.startError?.text, ARM_LAPSED_TEXT);
    assert.match(ARM_LAPSED_TEXT, /^Your message did not arrive, so no Mission started\. Type what the Mission should do and press Start Mission again\.$/);
  } finally {
    app.done();
  }
});

test('review of stage C: with questions open, a note typed in the chat box stays a note; only numbered lines answer', { skip: !hasGit }, async () => {
  const PLANNED = JSON.stringify({ summary: 's', items: [{ title: 'Pick the colours' }, { title: 'Pick the font' }], checks: [] });
  const app = standIn({ answer: (label) => (/planner/.test(label) ? PLANNED : /item 1/.test(label) ? 'QUESTION: Which colour? | ASSUMING: blue' : /item 2/.test(label) ? 'QUESTION: Which font? | ASSUMING: Inter' : 'DONE: ok') });
  try {
    const chat = app.open('nq', [said('style the page')]);
    await app.mission(chat, 'auto style the whole page nicely');
    await app.step(chat);
    await app.step(chat);
    await app.step(chat);
    const card = await app.card('GET', { sessionId: 'nq' });
    assert.equal(card.json.strip.main, 'note', 'Enter and the main button add a note');
    const note = await app.card('POST', { sessionId: 'nq', action: 'note', text: 'also update the README' });
    assert.equal(note.json.said, 'Your note reaches the Mission at its next step.');
    let disk = app.runOnDisk(chat);
    assert.deepEqual(disk.questions.filter((question) => question.status === 'open').length, 2, 'no question was answered by the note');
    assert.deepEqual(disk.items.map((item) => item.status), ['unverified', 'unverified'], 'no item is done again');
    assert.ok(disk.long.asks.some((ask) => ask.text === 'also update the README'));
    const numbered = await app.card('POST', { sessionId: 'nq', action: 'note', text: '2. Roboto' });
    assert.match(numbered.json.said, /^Thanks: 1 answer given\. .*Item 2 is done again/);
    disk = app.runOnDisk(chat);
    assert.deepEqual([disk.questions[0].status, disk.questions[1].answer], ['open', 'Roboto']);
  } finally {
    app.done();
  }
});
