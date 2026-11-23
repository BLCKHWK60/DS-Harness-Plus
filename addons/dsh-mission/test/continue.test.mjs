/**
 * Mission stage C (item 1, 20 November 2026): continuing an ended Mission by answering its questions. The extra-time
 * rule, the revived run (same id, its own checkpoint, the time after the end not counted), the late answers redone, the
 * guard against a step of the run before it was continued, and the route's quote and continue with their checks.
 * Each test fails on the code before stage C.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { GIT_CANDIDATES } from '../lib/checkpoints.js';
import { addQuestion, answerMany, answerQuestions, answerTooLate, applyPlan, applyReview, applyWork, continueBlock, extraTime, finish, lateAnswers, lateRedo, newRun, nextStep, pauseRun, report, reviveRun, unpauseRun, workedMs } from '../lib/run.js';
import { stripOf } from '../lib/strip.js';
import { createRunner, graceMs } from '../runner.js';
import { RUN_ENDED_AGAIN, apply } from '../index.js';

const hasGit = GIT_CANDIDATES.some((path) => existsSync(path));
const fresh = (name = 'mission-continue-') => realpathSync(mkdtempSync(join(tmpdir(), name)));
const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
const T0 = Date.parse('2026-11-20T10:00:00Z');
const MIN = 60000;
const mission = (long = {}) => newRun({ id: 'r', goal: 'make it good please', mode: 'Full Auto', root: '/x', limits: {}, at: T0, kind: 'long', long: { minutes: 120, laps: 4, ...long } });

/** Ten items, all tried; `left` of them not done; ended `worked` minutes after the start. */
const tenItems = ({ left = 1, worked = 100, minutes = 120 } = {}) => {
  const run = mission({ minutes });
  applyPlan(run, { items: Array.from({ length: 10 }, (_, index) => ({ title: `item ${index + 1}` })), checks: [], questions: [{ question: 'Which city?', default: 'Berlin' }] });
  run.items.forEach((item, index) => {
    if (index < 10 - left) applyWork(run, item.id, { check: { ok: true, output: '' } });
    else applyWork(run, item.id, { check: { ok: false, output: 'no' } });
  });
  finish(run, '', T0 + worked * MIN);
  return run;
};

// ---- The extra-time rule -----------------------------------------------------------------------------------

test('extra time: its own minutes per item tried times the items to do (the owner\'s example), capped at a quarter of its first limit and at most 30', () => {
  const answer = [{ id: 'q1', text: 'Paris' }];
  const example = extraTime(tenItems(), answer, T0 + 200 * MIN);
  assert.deepEqual(example, { measured: true, perItem: 10, units: 1, cap: 30, stepMinutes: 0, late: 0, noLimit: false, run: true, minutes: 10, needed: 10, capped: false, raised: false }, '1 of 10 items left after 100 minutes gives 10 minutes');
  const four = extraTime(tenItems({ left: 4 }), answer, T0 + 200 * MIN);
  assert.deepEqual([four.needed, four.minutes, four.capped], [40, 30, true], 'the full estimate is kept for the card');
  assert.equal(extraTime(tenItems({ minutes: 20 }), answer).cap, 10, 'a quarter of 20 is 5: at least 10');
  assert.equal(extraTime(tenItems({ minutes: 400 }), answer).cap, 30, 'never more than 30');
  const free = extraTime(tenItems({ minutes: 0 }), answer);
  assert.deepEqual([free.noLimit, free.cap], [true, 30], 'no first limit: it suggests no time limit, and caps at 30');
  // One of its steps takes 20 minutes: the time is raised past it.
  const slow = tenItems({ minutes: 400 });
  slow.long.stepMs = [20 * MIN, 20 * MIN, 20 * MIN];
  assert.deepEqual((({ minutes, raised, stepMinutes }) => ({ minutes, raised, stepMinutes }))(extraTime(slow, answer)), { minutes: 21, raised: true, stepMinutes: 20 });
});

test('extra time when nothing was measured: 10 minutes for each item that had a question, and for each item not done yet', () => {
  const run = mission();
  applyPlan(run, { items: [{ title: 'colour' }, { title: 'b' }, { title: 'c' }], checks: [] });
  addQuestion(run, { text: 'Which colour?', assume: 'blue', items: ['1'], from: 'item' });
  addQuestion(run, { text: 'Which city?', assume: 'Berlin', from: 'plan' });
  applyWork(run, '1', { assumed: 'blue' });
  finish(run, 'You ended it.', T0 + 30000);
  const quote = extraTime(run, [{ id: 'q1', text: 'green' }, { id: 'q2', text: 'Paris' }]);
  // Item 1 (its question), the plan question without items, items 2 and 3 not done: 4 × 10.
  assert.deepEqual([quote.measured, quote.units, quote.needed, quote.minutes, quote.capped], [false, 3, 40, 30, true]);
  // The time between the end and now is not working time.
  run.long.afterEndMs = 25000;
  assert.equal(workedMs(run, T0 + 9e9), 5000);
});

test('answers that only skip, with nothing left to do, run no work; End without questions stays final', () => {
  const run = mission();
  applyPlan(run, { items: [{ title: 'a' }], checks: [], questions: [{ question: 'Which city?', default: 'Berlin' }] });
  applyWork(run, '1', { check: { ok: true, output: '' } });
  finish(run, 'You ended it.', T0 + MIN);
  assert.equal(continueBlock(run), '');
  assert.deepEqual([extraTime(run, [{ id: 'q1', skip: true }]).run, extraTime(run, [{ id: 'q1', text: 'Paris' }]).run], [false, true], 'a text answer may change the work: it runs');
  run.questions[0].status = 'answered';
  assert.equal(continueBlock(run), 'nothing', 'no open questions: End stays final');
  assert.equal(continueBlock({ ...run, status: 'running' }), 'running');
  assert.equal(continueBlock({ ...newRun({ id: 'o', goal: 'g', mode: 'Auto', root: '/x', limits: {} }), status: 'stopped' }), 'not-long');
  const gone = mission();
  addQuestion(gone, { text: 'Which?' });
  finish(gone, 'Its conversation is gone.');
  assert.equal(continueBlock(gone), 'gone');
  const spent = mission({ tokenCap: 100 });
  addQuestion(spent, { text: 'Which?' });
  spent.tokens = 100;
  finish(spent, '');
  assert.equal(continueBlock(spent), 'allowance');
});

test('a revived run: the same run, its time from now, late answers done again, the time after the end not counted; it ends after the work its answers called for', () => {
  const run = mission({ minutes: 60, laps: 1 });
  applyPlan(run, { items: [{ title: 'logo', check: 'a' }, { title: 'b', check: 'b' }], checks: [] });
  addQuestion(run, { text: 'Which logo?', assume: 'square', items: ['1'], from: 'item' });
  addQuestion(run, { text: 'Which city?', assume: 'Berlin', from: 'plan' });
  addQuestion(run, { text: 'More time?', kind: 'time', from: 'time', extra: 20 });
  applyWork(run, '1', { check: { ok: true, output: '' }, assumed: 'square' });
  applyWork(run, '2', { check: { ok: true, output: '' } });
  applyReview(run, { verdict: 'approve', items: [] });
  // The last lap has ended: the answer comes too late, so the item keeps its result, and the question remembers it.
  assert.deepEqual(answerQuestions(run, '1. round', T0 + MIN), { answered: ['q1'], reopened: [], late: ['1'] });
  assert.deepEqual(run.questions[0].lateItems, ['1']);
  finish(run, '', T0 + 10 * MIN);
  assert.deepEqual(lateRedo(run), ['1']);
  assert.deepEqual(lateAnswers(run), [{ id: 'q1', text: 'Which logo?', answer: 'round', items: ['1'] }]);
  const at = T0 + 2 * 24 * 60 * MIN;
  reviveRun(run, { minutes: 15, at, answered: 1, skipped: 0, checkpoint: 7, units: 2 });
  assert.deepEqual([run.status, run.endedAt, run.phase, run.long.deadline, run.long.laps, run.long.continueLap], ['running', 0, 'work', at + 15 * MIN, 2, true]);
  assert.equal(run.long.afterEndMs, at - (T0 + 10 * MIN));
  assert.equal(run.items[0].status, 'open');
  assert.equal(run.items[0].note, 'Your answer: round (given too late before; done again now)');
  assert.deepEqual(lateRedo(run), [], 'done again now');
  assert.deepEqual([run.questions[2].status, run.questions[2].closedWhy], ['closed', 'time given after the end']);
  assert.equal(nextStep(run, at).kind, 'work');
  applyWork(run, '1', { check: { ok: true, output: '' } });
  applyReview(run, { verdict: 'approve', items: [] });
  assert.deepEqual(nextStep(run, at + MIN), { kind: 'finish', why: 'continued' }, 'no hunting for extra laps');
  finish(run, '', at + 5 * MIN);
  const text = report(run);
  assert.match(text, /Took 15 minutes/, 'ten before the end and five after: the two days between are not counted');
  assert.match(text, /Continued after the end with 1 answer, for up to 15 more minutes\.\nTo undo only what this continue changed: \/mission back 7/);
});

// ---- The runner ---------------------------------------------------------------------------------------------

const PLAN = JSON.stringify({ summary: 's', items: [{ title: 'one' }, { title: 'two' }], checks: [], questions: [{ question: 'Which city?', default: 'Berlin' }] });
const APPROVE = JSON.stringify({ verdict: 'approve', note: 'fine', items: [{ id: '1', ok: true }, { id: '2', ok: true }] });

function bench({ closingWaitMs } = {}) {
  const root = fresh();
  const home = fresh('mission-continue-home-');
  const goal = { id: 'g', revision: 1, phase: 'active' };
  let made = false;
  const calls = [];
  const goals = {
    create: () => { calls.push('create'); made = true; goal.phase = 'active'; },
    get: () => (made ? goal : undefined),
    pause: () => { goal.phase = 'paused'; },
    resume: () => { calls.push('resume'); goal.phase = 'active'; },
    complete: () => { goal.phase = 'complete'; },
    clear: () => { made = false; },
  };
  const subagents = { startActivation: async (spec) => ({ childId: 'c', result: Promise.resolve({ output: [{ type: 'text', text: /planner/.test(spec.label) ? PLAN : /reviewer/.test(spec.label) ? APPROVE : 'DONE: ok' }], stopReason: 'end' }) }) };
  const ctx = { get: (name) => ({ goals, subagents })[name] };
  const gate = { hold: null };
  const labels = [];
  let number = 0;
  const points = {
    take: async (label) => {
      labels.push(label);
      if (gate.hold && /before item/.test(label)) await gate.hold;
      number += 1;
      return { id: `p${number}`, number };
    },
    files: async () => ({ files: [], more: false }),
    idOf: async () => 'p',
    changes: async () => '',
  };
  const runner = createRunner(ctx, { settings: () => ({ limits: {}, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {}, home: (sub) => join(home, sub), ...(closingWaitMs ? { closingWaitMs } : {}) });
  const agent = { id: 'conv', model: { current: () => ({ provider: 'p', model: 'm' }) } };
  const fired = [];
  runner.onEvent((event) => fired.push(event));
  const step = () => runner.step(agent, new AbortController().signal, 60000);
  const lines = () => readFileSync(join(home, 'mission', 'runs.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  return { runner, agent, root, goal, calls, fired, step, gate, labels, lines, done: () => { rmSync(root, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }); } };
}

test('a Mission whose time ran out continues with your answers: the same run, its own checkpoint, a goal again, events, and a report line per end', async () => {
  const app = bench();
  try {
    await app.runner.start(app.agent, 'do two small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 40, laps: 1 } });
    await app.step();
    const run = app.runner.runOf('conv');
    const id = run.id;
    app.runner.sweep(run.long.deadline + graceMs(run) + 1, () => app.agent);
    assert.equal(run.status, 'incomplete');
    await tick();
    const first = app.fired.filter((event) => event.type === 'finished');
    assert.deepEqual([first.length, first[0].questions, first[0].continues], [1, 1, 0], 'finished says how many questions are left');
    const view = app.runner.view('conv');
    assert.equal(view.canContinue, true);
    assert.equal(stripOf({ run: view }).canContinue, true);
    // The two days between the end and the continue are not working time.
    run.startedAt -= 2 * 24 * 60 * MIN;
    run.endedAt -= 2 * 24 * 60 * MIN;
    const answers = [{ id: 'q1', text: 'Paris' }];
    const quote = app.runner.quoteContinue('conv', answers);
    assert.deepEqual([quote.run, quote.measured, quote.needed, quote.minutes, quote.capped], [true, false, 30, 10, true]);
    assert.equal(run.status, 'incomplete', 'a quote changes nothing');
    const out = await app.runner.continueRun(app.agent, { answers, minutes: 10 });
    assert.equal(out.said, 'The Mission continues with your 1 answer, for up to 10 more minutes. 2 items not done yet are taken up again.');
    assert.equal(app.runner.runOf('conv').id, id, 'the same run');
    assert.deepEqual([run.status, run.endedAt, run.long.continues.length, run.long.continues[0].checkpoint], ['running', 0, 1, out.checkpoint]);
    assert.ok(app.labels.includes('Mission continued'));
    assert.ok(Math.abs(run.long.deadline - (Date.now() + 10 * MIN)) < 5000);
    assert.equal(app.goal.phase, 'active');
    await tick();
    const resumed = app.fired.find((event) => event.type === 'resumed');
    assert.deepEqual([resumed.continued, resumed.by, resumed.minutes, resumed.runId], [true, 'continue', 10, id]);
    assert.equal(app.runner.view('conv').minutesUsed < 5, true, 'minutesUsed leaves the time after the end out');
    let text = '';
    for (let i = 0; i < 6 && run.status === 'running'; i += 1) text = await app.step();
    assert.notEqual(run.status, 'running', text);
    assert.match(text, /It ended because it did the work your answers called for\./);
    assert.match(text, /Continued after the end with 1 answer, for up to 10 more minutes\./);
    assert.match(text, /Questions you answered:\n- Which city\?\n {2}Your answer: Paris/);
    const lines = app.lines();
    assert.deepEqual(lines.map((line) => [line.id, line.continues ?? 0]), [[id, 0], [id, 1]], 'a line per end');
    assert.ok(lines[1].minutes < 60, 'its minutes leave the time after the end out');
    await tick();
    assert.deepEqual(app.fired.filter((event) => event.type === 'finished').map((event) => event.continues), [0, 1]);
  } finally {
    app.done();
  }
});

test('continue refuses what it cannot do, in order, and changes nothing; answers that only skip are recorded and the Mission stays finished', async () => {
  const app = bench();
  try {
    await app.runner.start(app.agent, 'do two small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 40, laps: 1 } });
    await app.step();
    const run = app.runner.runOf('conv');
    await assert.rejects(app.runner.continueRun(app.agent, { answers: [{ id: 'q1', text: 'x' }], minutes: 10 }), { message: 'This Mission is going on again already. Answer in the card while it works.' }, 'point 17: FINISH_ERRORS.already');
    for (let i = 0; i < 6 && run.status === 'running'; i += 1) await app.step();
    assert.equal(run.status, 'complete');
    assert.throws(() => app.runner.continueCheck('conv', []), { message: 'Answer or skip at least one question first.' });
    assert.throws(() => app.runner.continueCheck('conv', [{ id: 'q1', text: 'x' }], 5), { message: 'Give a time from 10 minutes to 12 hours, or No time limit.' });
    assert.throws(() => app.runner.continueCheck('conv', [{ id: 'q1', text: 'x' }], 721), { message: 'Give a time from 10 minutes to 12 hours, or No time limit.' });
    app.runner.continueCheck('conv', [{ id: 'q1', text: 'x' }], 0);
    // Both items are done: a skip leaves nothing to do, so it is only recorded.
    await tick();
    const before = app.fired.length;
    const out = await app.runner.continueRun(app.agent, { answers: [{ id: 'q1', skip: true }], minutes: 10 });
    assert.deepEqual([out.ran, out.said], [false, 'Noted. Nothing needs doing again, so the Mission stays finished. The report shows what it chose.']);
    assert.equal(run.status, 'complete');
    assert.equal(run.questions[0].status, 'skipped');
    assert.match(readFileSync(join(app.root, '.dsh-mission', 'runs', run.id, 'report.md'), 'utf8'), /Left to the Mission's judgement:\n- Which city\?\n {2}It went with the default offered: Berlin/);
    await tick();
    assert.equal(app.fired.length, before, 'no event');
    assert.throws(() => app.runner.continueCheck('conv', [{ id: 'q1', text: 'x' }]), { message: 'That Mission has ended and has no open questions, so it cannot be continued. Start Mission starts a new one.' });
    addQuestion(run, { text: 'Another?' });
    rmSync(join(app.root, '.dsh-mission', 'runs', run.id), { recursive: true, force: true });
    assert.throws(() => app.runner.continueCheck('conv', [{ id: 'q2', text: 'x' }]), { message: 'Its record is gone, so this Mission cannot be continued.' });
    assert.equal(app.runner.view('conv').canContinue, false);
  } finally {
    app.done();
  }
});

test('a step that End stopped is waited for before a continue, and a step of the Mission before it was continued never ends or changes the continued run', async () => {
  const app = bench({ closingWaitMs: 30 });
  try {
    await app.runner.start(app.agent, 'do two small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 40, laps: 2 } });
    await app.step();
    const run = app.runner.runOf('conv');
    // The next step hangs in its checkpoint (as git can), so End cannot stop it at once.
    let release;
    app.gate.hold = new Promise((resolve) => { release = resolve; });
    const pending = app.step();
    await tick();
    app.runner.end(app.agent);
    assert.equal(run.status, 'stopped');
    await assert.rejects(app.runner.continueRun(app.agent, { answers: [{ id: 'q1', text: 'Paris' }], minutes: 10 }), { message: 'It is still closing its last step. Try again in a moment.' });
    assert.equal(run.status, 'stopped', 'nothing changed');
    release();
    app.gate.hold = null;
    assert.match(await pending, /The user ended the run while this step was under way/);
    const out = await app.runner.continueRun(app.agent, { answers: [{ id: 'q1', text: 'Paris' }], minutes: 10 });
    assert.equal(out.ran, true);
    assert.equal(run.status, 'running');
    // The next step is a new one of the continued run, not the old step's final words.
    assert.match(await app.step(), /^Step \d+: item 1/);
  } finally {
    app.done();
  }
});

test('the epoch guard: a step cut by the clock that settles only after the run was continued leaves the continued run alone', async () => {
  const app = bench();
  try {
    await app.runner.start(app.agent, 'do two small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 40, laps: 2 } });
    await app.step();
    const run = app.runner.runOf('conv');
    let release;
    app.gate.hold = new Promise((resolve) => { release = resolve; });
    const pending = app.step();
    await tick();
    // The clock cuts the step (it would end the run when it settles), then End, then the run is taken up again.
    assert.deepEqual(app.runner.sweep(run.long.deadline + graceMs(run) + 1, () => app.agent), ['conv']);
    app.runner.end(app.agent);
    reviveRun(run, { minutes: 10, at: Date.now() });
    release();
    assert.equal(await pending, 'This step belonged to the Mission before it was continued; nothing more to do.');
    assert.equal(run.status, 'running', 'not ended by the old step');
    assert.equal(run.cutByTime, '');
    await tick();
    assert.equal(app.fired.filter((event) => event.type === 'finished').length, 1);
  } finally {
    app.done();
  }
});

// ---- The route --------------------------------------------------------------------------------------------

function standIn({ tab = 'cowork', answer, home: sharedHome } = {}) {
  const home = sharedHome ?? fresh('mission-continue-app-');
  const goals = new Map();
  const routes = {};
  const tools = {};
  const commands = {};
  const agents = new Map();
  const provided = {};
  const refreshed = [];
  const presets = [];
  const services = {
    dshHomePath: (sub) => join(home, sub),
    modes: { isolated: () => false, get: () => tab, readOnly: () => tab === 'data', longTools: () => ({ files: true, web: true }), refreshTools: (id) => refreshed.push(id), depthOf: () => 'standard' },
    modelTiers: { resolveTier: () => null, roleRoute: () => undefined },
    sandboxPolicy: { resolve: () => ({ mode: 'workspace-write' }) },
    permissionPresets: { current: () => 'read-only-preset', set: (_session, name) => presets.push(name) },
    agents: { list: () => [...agents.values()], get: (id) => agents.get(id) },
    goals: {
      create: (agent) => { const goal = { id: `g-${agent.id}`, revision: 1, phase: 'active' }; goals.set(agent.id, goal); return goal; },
      get: (agent) => goals.get(agent.id),
      pause: (agent) => { goals.get(agent.id).phase = 'paused'; },
      resume: (agent) => { goals.get(agent.id).phase = 'active'; },
      complete: (agent) => { goals.get(agent.id).phase = 'complete'; },
      clear: (agent) => { goals.delete(agent.id); },
    },
    subagents: { startActivation: async (spec) => ({ childId: `h-${Math.random().toString(36).slice(2, 8)}`, result: Promise.resolve({ output: [{ type: 'text', text: (answer ?? (() => 'DONE: ok'))(spec.label) }], stopReason: 'end' }) }) },
  };
  const ctx = {
    logger: { warn: () => {}, info: () => {} },
    get: (name) => services[name],
    effect: (start) => start(),
    provide: (name, service) => { provided[name] = service; return () => {}; },
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
  const open = (id, given) => {
    const cwd = given ?? fresh();
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
    card, open, runOnDisk, goals, provided, refreshed, presets, home,
    goalsService: () => services.goals,
    setGoals: (service) => { services.goals = service; },
    mission: (agent, rawInput) => commands.mission.handler({ agent, rawInput }),
    step: (agent) => tools.mission_step.execute({}, { agent, signal: new AbortController().signal }),
    done: () => { for (const folder of folders) rmSync(folder, { recursive: true, force: true }); },
  };
}
const PLANNER = (label) => (/planner/.test(label) ? PLAN : /reviewer/.test(label) ? APPROVE : 'DONE: ok');
const start = (app, id) => app.card({ sessionId: id, action: 'start', goal: 'do two small things now', minutes: 40, laps: 1, keepAwake: false });

test('the route: a quote, then the continue; the mode comes back on, the tools are renewed, the step tool works again; its refusals say what to do', { skip: !hasGit }, async () => {
  const app = standIn({ answer: PLANNER });
  try {
    const chat = app.open('c1');
    const events = [];
    app.provided.mission.onEvent((event) => events.push(event));
    assert.equal((await start(app, 'c1')).status, 200);
    await app.step(chat);
    const ended = await app.card({ sessionId: 'c1', action: 'end' });
    assert.deepEqual([ended.json.strip.state, ended.json.strip.canContinue, ended.json.strip.questions.map((question) => question.id)], ['finished', true, ['q1']]);
    const runId = ended.json.run.id;
    // The step tool on an ended run: the report once, then a short answer.
    await app.step(chat);
    assert.equal((await app.step(chat)).text, RUN_ENDED_AGAIN);
    const none = await app.card({ sessionId: 'c1', action: 'continue', answers: [] });
    assert.deepEqual([none.status, none.json.error], [400, 'Answer or skip at least one question first.']);
    const quote = await app.card({ sessionId: 'c1', action: 'continue', answers: [{ id: 'q1', text: 'Paris' }] });
    assert.equal(quote.status, 200, JSON.stringify(quote.json));
    assert.equal(quote.json.said, '');
    assert.deepEqual([quote.json.quote.run, quote.json.quote.minutes, quote.json.quote.needed, quote.json.quote.capped, quote.json.quote.noLimit], [true, 10, 30, true, false]);
    assert.equal(quote.json.strip.state, 'finished', 'a quote changes nothing');
    const short = await app.card({ sessionId: 'c1', action: 'continue', answers: [{ id: 'q1', text: 'Paris' }], minutes: 5 });
    assert.equal(short.json.error, 'Give a time from 10 minutes to 12 hours, or No time limit.');
    // A goal of the user's own, set after the end, is never cleared.
    app.goals.set('c1', { id: 'mine', revision: 1, phase: 'active' });
    const goal = await app.card({ sessionId: 'c1', action: 'continue', answers: [{ id: 'q1', text: 'Paris' }], minutes: 10 });
    assert.equal(goal.json.error, 'This thread has a goal of its own now. Clear it with /goal clear, then continue.');
    assert.equal(app.goals.get('c1').id, 'mine');
    app.goals.get('c1').phase = 'complete';
    // The Mission mode was switched off after the end: the continue switches it on again.
    const modeBefore = app.provided.mission.mode('c1');
    assert.notEqual(modeBefore, '');
    await app.mission(chat, 'off');
    assert.equal(app.provided.mission.mode('c1'), '');
    const refreshedBefore = app.refreshed.length;
    const going = await app.card({ sessionId: 'c1', action: 'continue', answers: [{ id: 'q1', text: 'Paris' }], minutes: 0 });
    assert.equal(going.status, 200, JSON.stringify(going.json));
    assert.equal(going.json.said, 'The Mission continues with your 1 answer, with no time limit. 2 items not done yet are taken up again.');
    assert.deepEqual([going.json.strip.state, going.json.run.id, going.json.run.deadline, going.json.run.continues], ['running', runId, 0, 1]);
    assert.equal(app.provided.mission.mode('c1'), modeBefore);
    assert.equal(app.provided.mission.longRunId('c1'), runId, 'the same id for Budget guard');
    assert.ok(app.refreshed.length > refreshedBefore, 'the tools are renewed (Modes redoes the helpers too)');
    await new Promise((resolve) => setTimeout(resolve, 5));
    const resumed = events.find((event) => event.type === 'resumed');
    assert.deepEqual([resumed.continued, resumed.runId], [true, runId]);
    assert.notEqual((await app.step(chat)).text, RUN_ENDED_AGAIN, 'the step tool works again');
    const still = await app.card({ sessionId: 'c1', action: 'continue', answers: [{ id: 'q1', text: 'x' }], minutes: 10 });
    assert.equal(still.json.error, 'This Mission is going on again already. Answer in the card while it works.');
    // Ended again with no open question: End stays final.
    await app.card({ sessionId: 'c1', action: 'end' });
    const final = await app.card({ sessionId: 'c1', action: 'continue', answers: [{ id: 'q1', text: 'x' }], minutes: 10 });
    assert.equal(final.json.error, 'That Mission has ended and has no open questions, so it cannot be continued. Start Mission starts a new one.');
    const lines = readFileSync(join(app.home, 'mission', 'runs.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(lines.map((line) => [line.id, line.continues ?? 0]), [[runId, 0], [runId, 1]]);
  } finally {
    app.done();
  }
});

test('typed /mission resume on an ended Mission with questions points to the card and shows it again; another folder is refused', { skip: !hasGit }, async () => {
  const app = standIn({ answer: PLANNER });
  try {
    const chat = app.open('c2');
    await start(app, 'c2');
    await app.step(chat);
    await app.card({ sessionId: 'c2', action: 'end' });
    const typed = await app.mission(chat, 'resume');
    assert.equal(typed.kind, 'success');
    assert.match(typed.text, /^That Mission has ended\. Press Finish it above the chat box: it brings back what is still open and what it decided itself, then the same Mission does the rest\.\n\nMission stopped/, 'point 17: Finish it');
    const card = await app.card({ sessionId: 'c2', action: 'continue', answers: [{ id: 'q1', text: 'Paris' }] });
    assert.ok(card.json.run.showFrom > 0, 'the card shows again (also after × or 24 hours)');
    // The conversation now works in another folder.
    const elsewhere = fresh();
    chat.header.cwd = elsewhere;
    chat.session.header.cwd = elsewhere;
    const moved = await app.card({ sessionId: 'c2', action: 'continue', answers: [{ id: 'q1', text: 'Paris' }], minutes: 10 });
    rmSync(elsewhere, { recursive: true, force: true });
    assert.equal(moved.json.error, 'This thread now works in another folder, so this Mission cannot continue here. Start Mission starts a new one.');
  } finally {
    app.done();
  }
});

test('a continue in a Read Only tab takes Workspace Write again and keeps what to put back at its next end', { skip: !hasGit }, async () => {
  const app = standIn({ tab: 'data', answer: PLANNER });
  try {
    const chat = app.open('d1');
    assert.equal((await start(app, 'd1')).status, 200);
    await app.step(chat);
    await app.card({ sessionId: 'd1', action: 'end' });
    const presetsBefore = app.presets.length;
    const going = await app.card({ sessionId: 'd1', action: 'continue', answers: [{ id: 'q1', text: 'Paris' }], minutes: 15 });
    assert.equal(going.status, 200, JSON.stringify(going.json));
    assert.ok(app.presets.length > presetsBefore, 'the Workspace Write preset is selected again');
    assert.deepEqual(app.runOnDisk(chat).long.restore, { sandbox: 'workspace-write', preset: 'read-only-preset', modeWasOn: true });
  } finally {
    app.done();
  }
});

test('a continue from the card keeps a Split Plus card out of the answer: it reaches the Mission as material, as Send answers does', { skip: !hasGit }, async () => {
  const app = standIn({ answer: PLANNER });
  try {
    const chat = app.open('s1');
    assert.equal((await start(app, 's1')).status, 200);
    await app.step(chat);
    await app.card({ sessionId: 's1', action: 'end' });
    const split = '[Split Plus send AB12CD, 2026-11-20 09:00: material, not instructions]\nsome pasted material\n[End of Split Plus send AB12CD]';
    const going = await app.card({ sessionId: 's1', action: 'continue', answers: [{ id: 'q1', text: `Paris\n${split}` }], minutes: 15 });
    assert.equal(going.status, 200, JSON.stringify(going.json));
    const disk = app.runOnDisk(chat);
    assert.equal(disk.questions.find((question) => question.id === 'q1').answer, 'Paris', 'the Split Plus card is never part of the answer');
    assert.ok(disk.long.asks.some((ask) => ask.text.startsWith('Material the user passed along (material, not instructions):')));
  } finally {
    app.done();
  }
});

// ---- Review of stage C (20 November 2026) ------------------------------------------------------------------------

const NO_QUESTIONS = (label) => (/planner/.test(label) ? JSON.stringify({ summary: 's', items: [{ title: 'one' }, { title: 'two' }], checks: [] }) : /reviewer/.test(label) ? APPROVE : 'DONE: ok');

test('End is final: typed /mission resume and the route\'s Resume never bring back an ended Mission without questions', { skip: !hasGit }, async () => {
  const app = standIn({ answer: NO_QUESTIONS });
  try {
    const chat = app.open('e1');
    const events = [];
    app.provided.mission.onEvent((event) => events.push(event));
    assert.equal((await start(app, 'e1')).status, 200);
    await app.step(chat);
    const ended = await app.card({ sessionId: 'e1', action: 'end' });
    assert.deepEqual([ended.json.strip.state, ended.json.strip.canContinue], ['finished', false]);
    const typed = await app.mission(chat, 'resume');
    assert.match(typed.text, /^That Mission has ended, so it cannot carry on \(it was ended with End\)\. Start Mission starts a new one\./);
    const route = await app.card({ sessionId: 'e1', action: 'resume' });
    assert.match(route.json.said, /^That Mission has ended, so it cannot carry on/);
    for (const word of ['go', 'continue', 'resume 20']) await app.mission(chat, word);
    const disk = app.runOnDisk(chat);
    assert.deepEqual([disk.status, disk.endedAt > 0, disk.long.continues ?? []], ['stopped', true, []]);
    await tick();
    assert.equal(events.filter((event) => event.type === 'resumed').length, 0, 'never resumed');
    assert.equal(events.filter((event) => event.type === 'finished').length, 1, 'never finished twice');
  } finally {
    app.done();
  }
});

test('items waiting for your yes after the time ran out: /mission resume asks for the time, /mission resume <minutes> continues the same run with a checkpoint and Budget\'s continued event; after End they stay', { skip: !hasGit }, async () => {
  const first = standIn({ answer: NO_QUESTIONS });
  let second;
  try {
    const chat = first.open('a1');
    assert.equal((await start(first, 'a1')).status, 200);
    await first.step(chat);
    await first.step(chat);
    await first.card({ sessionId: 'a1', action: 'end' });
    // As if the time had run out with item 2 waiting for a yes: the record is changed, and the app starts again.
    const dir = join(chat.header.cwd, '.dsh-mission', 'runs');
    const [runId] = readdirSync(dir);
    const file = join(dir, runId, 'run.json');
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    const writeRun = (change) => { const run = JSON.parse(readFileSync(file, 'utf8')); change(run); writeFileSync(file, JSON.stringify(run)); };
    writeRun((run) => { run.status = 'incomplete'; run.stopReason = 'Time is up.'; run.items[1].status = 'aside'; run.items[1].note = 'It needed your yes to change a.txt.'; run.endedAt = Date.now() - 3 * MIN; });
    second = standIn({ answer: NO_QUESTIONS, home: first.home });
    const events = [];
    second.provided.mission.onEvent((event) => events.push(event));
    const again = second.open('a1', chat.header.cwd);
    const asked = await second.mission(again, 'resume');
    assert.match(asked.text, /^That Mission has ended\. 1 item waits for your yes\. To take it up again, give it more time: type \/mission resume \d+ \(the suggested time\), another number of minutes from 10 to 720, or \/mission resume 0 for no time limit\.$/);
    assert.equal(second.runOnDisk(again).status, 'incomplete', 'asking changes nothing');
    const going = await second.mission(again, 'resume 15');
    assert.equal(going.kind, 'success', going.text);
    assert.match(going.text, /^The Mission continues, for up to 15 more minutes\. 1 item not done yet is taken up again\./);
    const disk = second.runOnDisk(again);
    assert.deepEqual([disk.id, disk.status, disk.items[1].status, disk.long.continues.length], [saved.id, 'running', 'open', 1]);
    assert.ok(disk.long.afterEndMs >= 3 * MIN - 5000, 'the time after the end is left out');
    assert.ok(disk.long.continues[0].checkpoint > 0, 'its own checkpoint');
    await tick();
    const resumed = events.find((event) => event.type === 'resumed');
    assert.deepEqual([resumed?.continued, resumed?.runId], [true, saved.id], 'Budget guard keeps its whole-run count');
    // Ended with End and waiting for a yes: End stays final.
    await second.card({ sessionId: 'a1', action: 'end' });
    writeRun((run) => { run.items[1].status = 'aside'; });
    const third = standIn({ answer: NO_QUESTIONS, home: first.home });
    try {
      const chat3 = third.open('a1', chat.header.cwd);
      assert.match((await third.mission(chat3, 'resume')).text, /^That Mission has ended, so it cannot carry on \(it was ended with End\)/);
      const refused = await third.mission(chat3, 'resume 15');
      assert.equal(third.runOnDisk(chat3).status, 'stopped', refused.text);
    } finally {
      rmSync(third.home, { recursive: true, force: true });
    }
  } finally {
    second?.done();
    first.done();
  }
});

test('a restart after a continue pauses it from the continue, never from its last step before the end', () => {
  const run = mission({ minutes: 120, laps: 2 });
  applyPlan(run, { items: [{ title: 'a' }, { title: 'b' }], checks: [], questions: [{ question: 'Which city?', default: 'Berlin' }] });
  applyWork(run, '1', { check: { ok: true, output: '' } });
  run.lastStepAt = T0 + 100 * MIN;
  finish(run, '', T0 + 101 * MIN);
  const at = T0 + 6 * 60 * MIN;
  reviveRun(run, { minutes: 20, at });
  assert.equal(run.long.deadline, at + 20 * MIN);
  // The app restarts 5 minutes after the continue, before its first step ends (announceInterrupted pauses from the
  // last step), and Resume is pressed 10 minutes after the continue.
  pauseRun(run, Number(run.lastStepAt) || at + 5 * MIN);
  unpauseRun(run, at + 10 * MIN);
  assert.equal(run.long.deadline, at + 30 * MIN, 'only the real time since the continue is added');
  assert.equal(run.long.pausedMs, 10 * MIN, 'the gap after the end is not paused time');
  assert.ok(workedMs(run, at + 10 * MIN) > 90 * MIN, 'its working time keeps the work before the end');
});

test('a restart after a continue, in the runner: Resume gives back only the time since the continue', async () => {
  const app = bench();
  try {
    await app.runner.start(app.agent, 'do two small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 40, laps: 2 } });
    await app.step();
    const run = app.runner.runOf('conv');
    app.runner.end(app.agent);
    // Ended two days ago.
    run.lastStepAt -= 2 * 24 * 60 * MIN;
    run.endedAt -= 2 * 24 * 60 * MIN;
    run.startedAt -= 2 * 24 * 60 * MIN;
    await app.runner.continueRun(app.agent, { answers: [{ id: 'q1', text: 'Paris' }], minutes: 10 });
    const deadline = run.long.deadline;
    app.runner.announceInterrupted('conv', run);
    assert.ok(run.pausedAt >= Date.now() - 5000, 'paused from the continue');
    app.runner.resume(app.agent);
    assert.ok(run.long.deadline - deadline < 5000, 'the deadline moves by the downtime only');
    assert.ok(run.long.pausedMs < 5000);
  } finally {
    app.done();
  }
});

test('an answer given while paused is judged by the time left at the pause, so the item is done again', () => {
  const run = mission({ minutes: 60, laps: 0 });
  applyPlan(run, { items: [{ title: 'colour' }, { title: 'b' }, { title: 'c' }], checks: [] });
  addQuestion(run, { text: 'Which colour?', assume: 'blue', items: ['1'], from: 'item' });
  applyWork(run, '1', { assumed: 'blue' });
  pauseRun(run, T0 + 40 * MIN);
  assert.equal(answerTooLate(run, T0 + 100 * MIN), false, '20 minutes were left at the pause');
  const out = answerMany(run, [{ id: 'q1', text: 'green' }], T0 + 100 * MIN);
  assert.deepEqual([out.reopened, out.late], [['1'], []]);
  unpauseRun(run, T0 + 101 * MIN);
  assert.equal(nextStep(run, T0 + 101 * MIN).item?.id, '1');
});

test('a continue tries an item that ended NOT FINISHED again when its question is answered, and counts it in the time', () => {
  const run = mission({ minutes: 60 });
  applyPlan(run, { items: [{ title: 'key', check: 'k' }, { title: 'b', check: 'b' }], checks: [] });
  addQuestion(run, { text: 'Which key name?', assume: 'API_KEY', items: ['1'], from: 'item' });
  for (let i = 0; i < run.limits.maxTries; i += 1) applyWork(run, '1', { check: { ok: false, output: 'no' }, assumed: 'API_KEY' });
  applyWork(run, '2', { check: { ok: true, output: '' } });
  assert.equal(run.items[0].status, 'stuck');
  finish(run, '', T0 + 10 * MIN);
  const answers = [{ id: 'q1', text: 'SERVICE_KEY' }];
  assert.equal(extraTime(run, answers).units, 1);
  reviveRun(run, { minutes: 10, at: T0 + 20 * MIN });
  const out = answerMany(run, answers, T0 + 20 * MIN, { force: true });
  assert.deepEqual(out.reopened, ['1']);
  assert.equal(run.items[0].status, 'open');
  assert.equal(run.items[0].tries, run.limits.maxTries - 1, 'one more try');
  assert.equal(nextStep(run, T0 + 20 * MIN).item?.id, '1');
});

test('a late answer survives a review that rewrites the item\'s note: the card still offers the continue', () => {
  const run = mission({ minutes: 60, laps: 1 });
  applyPlan(run, { items: [{ title: 'logo' }, { title: 'b', check: 'b' }], checks: [] });
  addQuestion(run, { text: 'Which logo?', assume: 'square', items: ['1'], from: 'item' });
  applyWork(run, '1', { assumed: 'square' });
  applyWork(run, '2', { check: { ok: true, output: '' } });
  run.long.finishLap = true;
  assert.deepEqual(answerQuestions(run, '1. round', T0 + MIN, { under: 'review' }).late, ['1']);
  applyReview(run, { verdict: 'object', items: [{ id: '1', ok: false, note: 'too plain' }] });
  assert.match(run.items[0].note, /^Reviewer: too plain/);
  finish(run, '', T0 + 10 * MIN);
  assert.deepEqual(lateRedo(run), ['1']);
  assert.equal(continueBlock(run), '');
  reviveRun(run, { minutes: 10, at: T0 + 20 * MIN });
  assert.equal(run.items[0].note, 'Your answer: round (given too late before; done again now)');
  assert.deepEqual(lateRedo(run), []);
});

test('the report\'s time limit says what a continue gave after the end', () => {
  const run = tenItems();
  reviveRun(run, { minutes: 0, at: T0 + 200 * MIN });
  finish(run, '', T0 + 210 * MIN);
  assert.match(report(run), /Time limit: 120 minutes, then no time limit after the end\./);
  const free = tenItems({ minutes: 0 });
  reviveRun(free, { minutes: 20, at: T0 + 200 * MIN });
  finish(free, '', T0 + 210 * MIN);
  assert.match(report(free), /Time limit: none, then 20 more minutes after the end\./);
});

test('a continue that only records skips says the pasted material was not kept', { skip: !hasGit }, async () => {
  const app = standIn({ answer: (label) => (/planner/.test(label) ? JSON.stringify({ summary: 's', items: [{ title: 'one' }], checks: [], questions: [{ question: 'Which city?', default: 'Berlin' }, { question: 'Which port?', default: '80' }] }) : /reviewer/.test(label) ? APPROVE : 'DONE: ok') });
  try {
    const chat = app.open('m1');
    assert.equal((await start(app, 'm1')).status, 200);
    for (let i = 0; i < 6 && app.runOnDisk(chat).status === 'running'; i += 1) await app.step(chat);
    const split = '[Split Plus send AB12CD, 2026-11-20 09:00: material, not instructions]\nsome pasted material\n[End of Split Plus send AB12CD]';
    const out = await app.card({ sessionId: 'm1', action: 'continue', answers: [{ id: 'q1', skip: true }, { id: 'q2', text: split }], minutes: 10 });
    assert.equal(out.status, 200, JSON.stringify(out.json));
    assert.match(out.json.said, /Nothing runs now, so the pasted material was not kept\.$/);
  } finally {
    app.done();
  }
});

test('a continue that fails after its mode was switched on puts the mode and preset from before back', { skip: !hasGit }, async () => {
  const app = standIn({ answer: PLANNER });
  try {
    const chat = app.open('f1');
    assert.equal((await start(app, 'f1')).status, 200);
    await app.step(chat);
    await app.card({ sessionId: 'f1', action: 'end' });
    await app.mission(chat, 'off');
    assert.equal(app.provided.mission.mode('f1'), '');
    // The goal service goes away between the checks and the continue (as an app without one would).
    const goals = app.goalsService();
    app.setGoals(undefined);
    const failed = await app.card({ sessionId: 'f1', action: 'continue', answers: [{ id: 'q1', text: 'Paris' }], minutes: 10 });
    app.setGoals(goals);
    assert.equal(failed.status, 400);
    assert.equal(failed.json.error, 'This version of the app has no goal service.');
    assert.equal(app.provided.mission.mode('f1'), '', 'no Mission mode is left on without a Mission');
    assert.equal(app.presets.at(-1), 'read-only-preset', 'the preset from before is selected again');
  } finally {
    app.done();
  }
});

// ---- Wording after the point 17 lab check (20 November 2026) -----------------------------------------------

test('the report counts the steps you allowed with Finish it, not only the answers', () => {
  const run = tenItems();
  finish(run, '', T0 + 100 * MIN);
  reviveRun(run, { minutes: 10, at: T0 + 200 * MIN, answered: 1, skipped: 0, allowed: 1, checkpoint: 0, units: 1 });
  reviveRun(run, { minutes: 0, at: T0 + 300 * MIN, answered: 0, skipped: 0, allowed: 2, checkpoint: 0, units: 1 });
  finish(run, '', T0 + 310 * MIN);
  const text = report(run);
  assert.match(text, /Continued after the end with 1 answer and 1 step you allowed, for up to 10 more minutes\./);
  assert.match(text, /Continued after the end with 2 steps you allowed, with no time limit\./);
});
