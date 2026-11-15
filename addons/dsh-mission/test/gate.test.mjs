/**
 * Where Mission does not work, in a stand-in app: an isolated conversation (Recon) is left alone,
 * and a run is refused, or paused, while the conversation's tier has its sub-agents switched off.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { apply } from '../index.js';
import { IDLE_ROUNDS } from '../runner.js';
import { GIT_CANDIDATES } from '../lib/checkpoints.js';
import { ISOLATED_TEXT, UNDO_WORDS, helpersOffText, whyNot } from '../lib/gate.js';

const fresh = () => realpathSync(mkdtempSync(join(tmpdir(), 'dsh-mission-gate-')));
const hasGit = GIT_CANDIDATES.some((path) => existsSync(path));

test('the gate: isolated refuses all but taking back, and a run needs the tier\'s sub-agents', () => {
  assert.equal(whyNot({ isolated: true }), ISOLATED_TEXT);
  assert.equal(whyNot({ isolated: true, word: 'restricted' }), ISOLATED_TEXT);
  assert.equal(whyNot({ isolated: true, word: '' }), ISOLATED_TEXT, '/mission alone is refused too');
  for (const word of ['off', 'stop', 'pause', 'end', 'finish']) assert.equal(whyNot({ isolated: true, word }), '', word);
  assert.ok(!UNDO_WORDS.has('resume'));
  // The step tool names no word: refused when isolated.
  assert.equal(whyNot({ isolated: true, helpers: true }), ISOLATED_TEXT);
  const small = { id: 'small', label: 'Small', subagents: false };
  assert.equal(whyNot({ isolated: false, tier: small, helpers: true }), helpersOffText(small));
  assert.match(helpersOffText(small), /tier, Small, has Sub-agents switched off\. Switch them on for that tier in Settings → Model Tiers/);
  assert.match(helpersOffText(null), /this conversation's tier has Sub-agents switched off/);
  // Modes and checkpoints do not start helpers; a tier with sub-agents on, or no tier, lets a run go.
  assert.equal(whyNot({ isolated: false, tier: small, helpers: false, word: 'restricted' }), '');
  assert.equal(whyNot({ isolated: false, tier: { ...small, subagents: true }, helpers: true }), '');
  assert.equal(whyNot({ isolated: false, tier: null, helpers: true }), '');
});

/** Mission on stand-in services. */
function running() {
  const home = fresh();
  const isolatedIds = new Set();
  const tiers = {};
  const presets = [];
  const goals = new Map();
  const calls = [];
  const handlers = new Map();
  const commands = {};
  const tools = {};
  const agents = new Map();
  // Like the app: a goal cannot be paused while a session event is being handed out (goals.pause
  // writes to the conversation, and the app refuses that: "session append cannot reenter").
  let dispatching = false;
  const services = {
    dshHomePath: (sub) => join(home, sub),
    modes: { isolated: (id) => isolatedIds.has(id) },
    modelTiers: { resolveTier: (id) => tiers[id] ?? null, roleRoute: () => undefined },
    permissionPresets: { current: () => 'danger-full-access', set: (_session, preset) => presets.push(preset) },
    agents: { list: () => [...agents.values()], get: (id) => agents.get(id) },
    goals: {
      create: (agent) => { calls.push(['create', agent.id]); const goal = { id: `g-${agent.id}`, revision: 1, phase: 'active' }; goals.set(agent.id, goal); return goal; },
      get: (agent) => goals.get(agent.id),
      pause: (agent) => {
        if (dispatching) throw new Error('session append cannot reenter while another append is being published');
        calls.push(['pause', agent.id]);
        goals.get(agent.id).phase = 'paused';
      },
      resume: (agent) => { calls.push(['resume', agent.id]); goals.get(agent.id).phase = 'active'; },
      complete: (agent) => { calls.push(['complete', agent.id]); goals.get(agent.id).phase = 'complete'; },
      clear: (agent) => { goals.delete(agent.id); },
    },
    subagents: { startActivation: async () => { calls.push(['helper']); throw new Error('no helpers in this test'); } },
  };
  const ctx = {
    logger: { warn: () => {}, info: () => {} },
    get: (name) => services[name],
    effect: (start) => start(),
    provide: () => () => {},
    on: (name, handler) => { handlers.set(name, [...(handlers.get(name) ?? []), handler]); return () => {}; },
    inject: (_deps, fn) => fn({
      effect: (start) => start(),
      tools: { register: (spec) => { tools[spec.name] = spec; return () => {}; } },
      commands: { register: (spec) => { commands[spec.name] = spec; return () => {}; } },
    }),
  };
  apply(ctx, {});
  const folders = [home];
  const open = (id) => {
    const cwd = fresh();
    folders.push(cwd);
    const agent = { id, header: { cwd }, session: { id, header: { cwd } }, model: { current: () => ({ provider: 'p', model: 'm' }) } };
    agents.set(id, agent);
    return agent;
  };
  const mission = (agent, rawInput) => commands.mission.handler({ agent, rawInput });
  const step = (agent) => tools.mission_step.execute({}, { agent, signal: new AbortController().signal });
  const preExecute = async (exec) => {
    let decision = { kind: 'allow' };
    for (const handler of handlers.get('tools/pre-execute') ?? []) decision = await handler(exec, async () => decision);
    return decision;
  };
  /** Hand out an event to the add-on's listeners, as the app does: synchronously, refusing a pause meanwhile. */
  const emit = (name, ...args) => {
    dispatching = true;
    try {
      for (const handler of handlers.get(name) ?? []) handler(...args);
    } finally {
      dispatching = false;
    }
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
  const turnStarts = (agent, turn) => emit('session/event', { id: agent.id, header: agent.header }, { type: 'turn/start', data: { turn } });
  /** @returns {object} the conversation's run as stored on disk. */
  const runOnDisk = (agent) => {
    const dir = join(agent.header.cwd, '.dsh-mission', 'runs');
    const [id] = readdirSync(dir);
    return { ...JSON.parse(readFileSync(join(dir, id, 'run.json'), 'utf8')), log: readFileSync(join(dir, id, 'log.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)) };
  };
  const done = () => { for (const folder of folders) rmSync(folder, { recursive: true, force: true }); };
  return { isolatedIds, tiers, presets, calls, goals, open, mission, step, preExecute, turnStarts, tick, runOnDisk, done };
}

test('an isolated conversation: /mission and mission_step refuse; off and end still take back', async () => {
  const app = running();
  try {
    const recon = app.open('recon-1');
    app.isolatedIds.add('recon-1');
    for (const input of ['restricted', 'on', 'make every test pass and add a flag', '', 'checkpoints', 'resume']) {
      const answer = await app.mission(recon, input);
      assert.equal(answer.kind, 'error', input);
      assert.equal(answer.text, ISOLATED_TEXT, input);
    }
    // Nothing was switched, taken or started.
    assert.deepEqual(app.presets, []);
    assert.ok(!existsSync(join(recon.header.cwd, '.dsh-mission')), 'no checkpoint of the conversation\'s folder');
    assert.deepEqual(app.calls, []);
    assert.deepEqual(await app.mission(recon, 'off'), { kind: 'success', text: 'No Mission mode was on.' });
    assert.deepEqual(await app.mission(recon, 'end'), { kind: 'success', text: 'No mission run was started in this conversation.' });
    assert.equal((await app.step(recon)).text, ISOLATED_TEXT);
  } finally {
    app.done();
  }
});

test('a mode an earlier version switched on in a conversation that is isolated now is left alone, and /mission off takes it back', async () => {
  const app = running();
  try {
    const chat = app.open('c2');
    const outside = join(homedir(), 'Documents', 'mission-gate-test.txt');
    assert.equal((await app.mission(chat, 'restricted')).kind, 'success');
    assert.deepEqual(app.presets, ['workspace-write']);
    assert.equal((await app.preExecute({ agent: chat, name: 'write', arguments: { file_path: outside }, callId: 'a' })).kind, 'deny', 'Restricted refuses a write outside');
    app.isolatedIds.add('c2');
    assert.deepEqual(await app.preExecute({ agent: chat, name: 'write', arguments: { file_path: outside }, callId: 'b' }), { kind: 'allow' }, 'Mission leaves an isolated conversation to Modes');
    const off = await app.mission(chat, 'off');
    assert.equal(off.kind, 'success');
    assert.match(off.text, /^Mission mode is off/);
    assert.deepEqual(app.presets, ['workspace-write', 'danger-full-access'], 'the earlier preset is put back');
  } finally {
    app.done();
  }
});

test('a tier with sub-agents off: a run does not start; modes still work', async () => {
  const app = running();
  try {
    const conversation = app.open('c3');
    app.tiers.c3 = { id: 'small', label: 'Small', subagents: false };
    const answer = await app.mission(conversation, 'auto make every test pass and add a flag');
    assert.equal(answer.kind, 'error');
    assert.equal(answer.text, helpersOffText(app.tiers.c3));
    // Refused before anything was switched on.
    assert.deepEqual(app.presets, []);
    assert.deepEqual(app.calls, []);
    assert.equal((await app.mission(conversation, 'resume')).kind, 'error');
    const mode = await app.mission(conversation, 'restricted');
    assert.equal(mode.kind, 'success');
    assert.match(mode.text, /^Mission mode: Restricted is on\./);
    assert.match((await app.step(conversation)).text, /has Sub-agents switched off/);
    assert.deepEqual(app.calls, [], 'no helper was started');
  } finally {
    app.done();
  }
});

test('a run under way pauses when its tier\'s sub-agents are switched off, and carries on once they are back', { skip: !hasGit }, async () => {
  const app = running();
  try {
    const conversation = app.open('c4');
    app.tiers.c4 = { id: 'big', label: 'Big', subagents: true };
    const started = await app.mission(conversation, 'auto do one small thing here');
    assert.equal(started.kind, 'success', started.text);
    assert.match(started.text, /^Mission started \(Full Auto\)/);
    assert.deepEqual(app.calls, [['create', 'c4']]);

    app.tiers.c4 = { ...app.tiers.c4, subagents: false };
    const held = await app.step(conversation);
    assert.match(held.text, /^The mission run is paused\. A mission run needs helper models \(sub-agents\), and this conversation's tier, Big, has Sub-agents switched off\./);
    assert.match(held.text, /the user carries on with \/mission resume/);
    assert.deepEqual(app.calls.at(-1), ['pause', 'c4']);
    assert.ok(!app.calls.some(([kind]) => kind === 'helper'), 'no helper was started');
    // /mission shows why, and resume waits for the tier.
    assert.match((await app.mission(conversation, '')).text, /Paused: A mission run needs helper models/);
    assert.equal((await app.mission(conversation, 'resume')).kind, 'error');

    app.tiers.c4 = { ...app.tiers.c4, subagents: true };
    const resumed = await app.mission(conversation, 'resume');
    assert.equal(resumed.kind, 'success');
    assert.match(resumed.text, /^Mission carries on from step 1/);
    assert.deepEqual(app.calls.at(-1), ['resume', 'c4']);
    assert.ok(!/Paused:/.test((await app.mission(conversation, '')).text));
  } finally {
    app.done();
  }
});

test('a run left on in a conversation that is isolated now is paused a moment after its next turn starts', { skip: !hasGit }, async () => {
  const app = running();
  try {
    const conversation = app.open('c5');
    const started = await app.mission(conversation, 'auto do one small thing here');
    assert.equal(started.kind, 'success', started.text);
    // Moved to the Recon tab after it ran: Modes now holds it isolated and refuses mission_step there,
    // so the run cannot move; only the app's goal rounds would go on.
    app.isolatedIds.add('c5');
    app.turnStarts(conversation, 2);
    assert.equal(app.goals.get('c5').phase, 'active', 'not paused inside the event, where the app refuses it');
    await app.tick();
    assert.equal(app.goals.get('c5').phase, 'paused');
    assert.deepEqual(app.calls.filter(([kind]) => kind === 'pause'), [['pause', 'c5']]);
    const run = app.runOnDisk(conversation);
    assert.equal(run.stalled, `Paused: ${ISOLATED_TEXT}`);
    assert.deepEqual(run.log.filter((entry) => entry.kind === 'held').map((entry) => entry.reason), [ISOLATED_TEXT]);
    // Later turns there (the user talking) leave the paused run as it is.
    app.turnStarts(conversation, 3);
    await app.tick();
    assert.equal(app.calls.filter(([kind]) => kind === 'pause').length, 1);
    assert.equal(app.runOnDisk(conversation).log.filter((entry) => entry.kind === 'held').length, 1);
    assert.match((await app.mission(conversation, 'end')).text, /^Mission stopped/);
  } finally {
    app.done();
  }
});

test('turns without a step pause a run, a moment after the turn starts', { skip: !hasGit }, async () => {
  const app = running();
  try {
    const conversation = app.open('c6');
    assert.equal((await app.mission(conversation, 'auto do one small thing here')).kind, 'success');
    for (let turn = 0; turn <= IDLE_ROUNDS; turn += 1) {
      app.turnStarts(conversation, turn + 2);
      await app.tick();
    }
    assert.equal(app.goals.get('c6').phase, 'paused');
    assert.match((await app.mission(conversation, '')).text, /did not call mission_step for 5 rounds in a row/);
  } finally {
    app.done();
  }
});
