/**
 * Where Mission does not work, in a stand-in app: an isolated conversation (Recon) is left alone,
 * and a run is refused, or paused, while the conversation's tier has its sub-agents switched off.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { apply } from '../index.js';
import { IDLE_ROUNDS } from '../runner.js';
import { GIT_CANDIDATES } from '../lib/checkpoints.js';
import { lapNotes } from '../lib/run.js';
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
  // A Long run is allowed in Data and Research (the owner's choice); other runs and modes are not.
  assert.equal(whyNot({ isolated: false, tab: 'data', helpers: true, long: true }), '');
  assert.match(whyNot({ isolated: false, tab: 'research', helpers: true }), /Read Only/);
  assert.equal(whyNot({ isolated: true, tab: 'data', helpers: true, long: true }), ISOLATED_TEXT, 'never in Recon');
});

/** Mission on stand-in services. */
function running(config = {}) {
  const home = fresh();
  const isolatedIds = new Set();
  const ultraIds = new Set();
  const tabs = {};
  const tiers = {};
  const presets = [];
  const levels = {};
  const appended = [];
  const refreshed = [];
  const provided = {};
  const readOnlyTabs = new Set(['data', 'research', 'chat']);
  const goals = new Map();
  const calls = [];
  const handlers = new Map();
  const commands = {};
  const tools = {};
  const agents = new Map();
  // Like the app: a goal cannot be paused while a session event is being handed out (goals.pause
  // writes to the conversation, and the app refuses that: "session append cannot reenter").
  let dispatching = false;
  let refusePreset = false;
  const scratchFolders = {};
  const services = {
    dshHomePath: (sub) => join(home, sub),
    modes: {
      isolated: (id) => isolatedIds.has(id),
      get: (id) => tabs[id] ?? 'cowork',
      readOnly: (id) => readOnlyTabs.has(tabs[id] ?? 'cowork'),
      longTools: (id) => ({ files: true, web: (tabs[id] ?? 'cowork') !== 'chat' }),
      // What Mission says at the moment it asks for the tools to be put on.
      refreshTools: (id) => refreshed.push([id, provided.mission?.longRun(id) ?? null]),
      ultraCode: (id) => ultraIds.has(id),
      depthOf: () => 'standard',
    },
    coworkScratch: { folderOf: (agent) => scratchFolders[agent?.id] ?? '' },
    sandboxPolicy: { resolve: ({ session }) => ({ mode: levels[session.id] ?? 'read-only' }) },
    modelTiers: { resolveTier: (id) => tiers[id] ?? null, roleRoute: () => undefined },
    permissionPresets: { current: () => 'danger-full-access', set: (session, preset) => { if (dispatching) throw new Error('session append cannot reenter while another append is being published'); if (refusePreset) throw new Error('refused'); presets.push(preset); levels[session.id] = preset; } },
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
  const routes = {};
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
  apply(ctx, config);
  const folders = [home];
  const open = (id) => {
    const cwd = fresh();
    folders.push(cwd);
    // Like the app: nothing is written to a conversation while one of its events is being handed out.
    const agent = { id, header: { cwd }, session: { id, header: { cwd }, append: (type, data) => { if (dispatching) throw new Error('session append cannot reenter while another append is being published'); appended.push([id, type, data]); if (type === 'sandbox/mode') levels[id] = data.mode; } }, model: { current: () => ({ provider: 'p', model: 'm' }) } };
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
  /** Call the Long run card's route, as the page does. */
  const card = async (method, body) => {
    const chunks = method === 'POST' ? [Buffer.from(JSON.stringify(body))] : [];
    const req = { method, url: method === 'GET' ? `/dsh-mission/long?sessionId=${encodeURIComponent(body.sessionId)}` : '/dsh-mission/long', headers: {}, async *[Symbol.asyncIterator]() { yield* chunks; } };
    let out = '';
    const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text ?? ''; } };
    await routes['/dsh-mission/long'](req, res);
    return { status: res.statusCode, json: out ? JSON.parse(out) : null };
  };
  /** A message in the chat, as the app logs it (source: you, or a goal round). */
  const says = (agent, text, kind = 'user', id = `m-${Math.random().toString(36).slice(2, 8)}`) => emit('session/event', { id: agent.id, header: agent.header }, { type: 'user/message', data: { id, role: 'user', source: { kind }, content: [{ type: 'text', text }] } });
  /** Wait until a condition holds (a run started from a message is started a moment later). */
  const until = async (check) => { for (let i = 0; i < 200 && !check(); i += 1) await tick(); return check(); };
  const refuse = (on) => { refusePreset = on; };
  return { agents, handlers: (name) => handlers.get(name) ?? [], services, scratchFolders, refuse, isolatedIds, ultraIds, tabs, tiers, presets, levels, appended, refreshed, provided, calls, goals, open, mission, step, preExecute, turnStarts, tick, runOnDisk, done, card, emit, says, until, home, tools };
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


test('Data and Research run Read Only: /mission refuses there and says why; looking still works', async () => {
  const app = running();
  try {
    const agent = app.open('d1');
    app.tabs.d1 = 'data';
    for (const words of ['restricted', 'make every test pass please', 'on']) {
      const said = await app.mission(agent, words);
      assert.equal(said.kind, 'error', words);
      assert.match(said.text, /Data and Research run Read Only/);
    }
    assert.equal((await app.mission(agent, 'status')).kind, 'success');
    app.tabs.d1 = 'research';
    assert.match((await app.mission(agent, 'auto')).text, /run Read Only/);
    app.tabs.d1 = 'cowork';
    assert.equal((await app.mission(agent, 'restricted')).kind, 'success', 'in Cowork it works as before');
  } finally {
    app.done();
  }
});

test('the Long run card: pre-flight says why not, a run starts as its own kind, and the card\'s buttons work', { skip: !hasGit && 'needs git' }, async () => {
  const app = running();
  try {
    const agent = app.open('l1');
    // Every tab but Recon (16 November): Finance is fine, and a Read Only tab (Data, Chat) only warns.
    app.tabs.l1 = 'finance';
    let card = await app.card('GET', { sessionId: 'l1' });
    assert.equal(card.status, 200);
    assert.equal(card.json.preflight.ok, true, JSON.stringify(card.json.preflight.ticks.filter((tick) => tick.ok !== true)));
    assert.equal(card.json.preflight.ticks.find((tick) => tick.key === 'tab'), undefined);
    app.tabs.l1 = 'data';
    card = await app.card('GET', { sessionId: 'l1' });
    assert.equal(card.json.preflight.ok, true);
    const warning = card.json.preflight.ticks.find((tick) => tick.key === 'tab');
    assert.equal(warning.warn, true);
    assert.equal(warning.required, false);
    assert.match(warning.text, /Read Only, but a Long run can change files/);
    assert.deepEqual(card.json.defaults, { minutes: 120, laps: 10, fullTime: false, keepAwake: true, battery: false, retry: true, effort: true });
    const refused = await app.card('POST', { sessionId: 'l1', action: 'start', goal: 'fix' });
    assert.equal(refused.status, 400, 'a goal of one word is refused');
    app.tabs.l1 = 'code';
    card = await app.card('GET', { sessionId: 'l1' });
    assert.equal(card.json.preflight.ok, true, JSON.stringify(card.json.preflight.ticks.filter((tick) => tick.ok !== true)));
    const started = await app.card('POST', { sessionId: 'l1', action: 'start', goal: 'make the tool better please', mode: 'auto', minutes: 30, laps: 3, keepAwake: false });
    assert.equal(started.status, 200, JSON.stringify(started.json));
    assert.match(started.json.said, /^Long run started \(Full Auto\)/);
    assert.equal(started.json.run.kind, 'long');
    assert.equal(started.json.run.laps, 3);
    assert.equal(started.json.run.minutes, 30);
    const onDisk = app.runOnDisk(agent);
    assert.equal(onDisk.kind, 'long');
    assert.equal(onDisk.long.keepAwake, false);
    assert.match((await app.card('POST', { sessionId: 'l1', action: 'finish-lap' })).json.said, /finishes the lap under way/);
    assert.equal(app.runOnDisk(agent).long.finishLap, true);
    assert.match((await app.card('POST', { sessionId: 'l1', action: 'pause' })).json.said, /^Mission paused/);
    assert.equal((await app.card('POST', { sessionId: 'l1', action: 'nonsense' })).status, 400);
    assert.equal((await app.card('GET', { sessionId: 'nobody' })).status, 400);
  } finally {
    app.done();
  }
});

test('the watchdog: a Long run the app stopped by itself is noted and tried again; never over your own pause', { skip: !hasGit && 'needs git' }, async (t) => {
  const app = running();
  try {
    const agent = app.open('w1');
    app.tabs.w1 = 'cowork';
    await app.card('POST', { sessionId: 'w1', action: 'start', goal: 'keep improving the thing', keepAwake: false });
    await new Promise((resolve) => setTimeout(resolve, 3100)); // past the moment the conversation was opened
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const goal = app.goals.get('w1');
    goal.activation = 'disarmed';
    app.emit('goal/activation-changed', { sessionId: 'w1', goal: { id: goal.id, revision: 1, activation: 'disarmed' } });
    const log = () => app.runOnDisk(agent).log.map((entry) => entry.kind);
    assert.ok(log().includes('stopped-by-itself'));
    assert.match(app.runOnDisk(agent).stalled, /^Stopped by itself/);
    t.mock.timers.tick(2 * 60000);
    assert.deepEqual(app.calls.filter((call) => call[0] === 'resume'), [['resume', 'w1']], 'tried again after two minutes');
    assert.ok(log().includes('retried'));
    // Stopped by itself again, but this time you paused it before the retry: no retry.
    goal.activation = 'disarmed';
    app.emit('goal/activation-changed', { sessionId: 'w1', goal: { id: goal.id, revision: 1, activation: 'disarmed' } });
    goal.phase = 'paused';
    t.mock.timers.tick(5 * 60000);
    assert.equal(app.calls.filter((call) => call[0] === 'resume').length, 1, 'your own pause wins');
  } finally {
    app.done();
  }
});

test('a Long run in a Read Only tab: its tools come first, it may write, and the tab is put back when it ends', { skip: !hasGit && 'needs git' }, async () => {
  const app = running();
  try {
    const agent = app.open('r1');
    app.tabs.r1 = 'research';
    let card = await app.card('GET', { sessionId: 'r1' });
    assert.deepEqual(card.json.tools, { files: true, web: true }, 'the tab\'s starting choice');
    assert.equal(card.json.preflight.ticks.find((tick) => tick.key === 'tab').warn, true);
    const started = await app.card('POST', { sessionId: 'r1', action: 'start', goal: 'keep looking for new postings', tools: { files: true, web: false } });
    assert.equal(started.status, 200, JSON.stringify(started.json));
    // Modes was asked to put the tools on before the run started, with the card's choice.
    assert.deepEqual(app.refreshed[0], ['r1', { files: true, web: false }]);
    assert.ok(app.presets.includes('workspace-write'), 'it may write in the folder');
    assert.equal(app.levels.r1, 'workspace-write');
    const onDisk = app.runOnDisk(agent);
    assert.deepEqual(onDisk.long.tools, { files: true, web: false });
    assert.deepEqual(onDisk.long.restore, { sandbox: 'read-only', preset: 'danger-full-access', modeWasOn: false });
    assert.deepEqual(app.provided.mission.longRun('r1'), { files: true, web: false });
    // Ended: the earlier preset and the Read Only level come back, the Mission mode it put on goes off.
    assert.equal((await app.card('POST', { sessionId: 'r1', action: 'end' })).status, 200);
    await app.tick();
    assert.equal(app.provided.mission.longRun('r1'), undefined);
    assert.equal(app.presets.at(-1), 'danger-full-access');
    assert.deepEqual(app.appended.at(-1), ['r1', 'sandbox/mode', { mode: 'read-only' }]);
    assert.equal(app.levels.r1, 'read-only');
    assert.equal(app.provided.mission.mode('r1'), '', 'the Mission mode it put on is off');
    assert.deepEqual(app.refreshed.at(-1), ['r1', null], 'the tab\'s own tools come back');
  } finally {
    app.done();
  }
});

test('a Long run in Code keeps its Mission mode after it ends and puts nothing back', { skip: !hasGit && 'needs git' }, async () => {
  const app = running();
  try {
    const agent = app.open('c1');
    app.tabs.c1 = 'code';
    app.levels.c1 = 'workspace-write'; // Code starts at Workspace Write
    assert.equal((await app.card('POST', { sessionId: 'c1', action: 'start', goal: 'make every test pass please', mode: 'restricted', keepAwake: false })).status, 200);
    assert.equal(app.runOnDisk(agent).long.restore, undefined);
    assert.deepEqual(app.runOnDisk(agent).long.tools, { files: true, web: true });
    await app.card('POST', { sessionId: 'c1', action: 'end' });
    await app.tick();
    assert.equal(app.appended.filter((entry) => entry[1] === 'sandbox/mode').length, 0);
    assert.equal(app.provided.mission.mode('c1'), 'restricted', 'its Mission mode stays on, as before');
  } finally {
    app.done();
  }
});

test('a Long run in a Read Only tab: a failed start puts the level back; undo words work; an ended one is not taken up again', { skip: !hasGit && 'needs git' }, async () => {
  const app = running();
  try {
    const agent = app.open('r2');
    app.tabs.r2 = 'data';
    // The conversation has a goal of its own: the run cannot start, and nothing stays lifted.
    app.goals.set('r2', { id: 'own', revision: 1, phase: 'active', objective: 'my own goal' });
    const refused = await app.card('POST', { sessionId: 'r2', action: 'start', goal: 'tidy the data folder please', keepAwake: false });
    assert.equal(refused.status, 400, JSON.stringify(refused.json));
    assert.equal(app.levels.r2, 'read-only', 'the level is put back at once');
    assert.equal(app.provided.mission.mode('r2'), '');
    app.goals.delete('r2');
    assert.equal((await app.card('POST', { sessionId: 'r2', action: 'start', goal: 'tidy the data folder please', keepAwake: false })).status, 200);
    // The run's own advice, /mission back N, is not refused for the tab.
    assert.doesNotMatch((await app.mission(agent, 'back 1')).text ?? '', /Read Only/);
    await app.card('POST', { sessionId: 'r2', action: 'end' });
    await app.tick();
    const again = await app.card('POST', { sessionId: 'r2', action: 'resume' });
    assert.match(again.json.said ?? '', /Read Only again\. Start a new one/);
    assert.equal(app.levels.r2, 'read-only');
  } finally {
    app.done();
  }
});

test('Run: the chat\'s saved settings, the next message of yours is the goal, and later messages go to the run', { skip: !hasGit && 'needs git' }, async () => {
  const app = running();
  try {
    const agent = app.open('u1');
    app.tabs.u1 = 'chat';
    agent.session.deriveMessages = () => [
      { id: 'a', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'plan a weekly sales report' }] },
      { id: 'b', role: 'assistant', source: { kind: 'model' }, content: [{ type: 'thinking', text: 'hidden' }, { type: 'text', text: 'here is the plan: three steps' }] },
      { id: 'c', role: 'user', source: { kind: 'goal' }, content: [{ type: 'text', text: 'a goal round' }] },
      { id: 'go', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'do it now' }] },
    ];
    let card = await app.card('GET', { sessionId: 'u1' });
    assert.equal(card.json.runButton, true);
    assert.deepEqual(card.json.saved.tools, { files: true, web: false }, 'the tab\'s starting choice until saved');
    assert.equal(card.json.saved.minutes, 120);
    // Depth → Long run settings: kept for this chat (and on disk).
    const saved = await app.card('POST', { sessionId: 'u1', action: 'save', minutes: 45, laps: 4, keepAwake: false, mode: 'auto', tools: { files: true, web: true } });
    assert.equal(saved.status, 200, JSON.stringify(saved.json));
    assert.equal(saved.json.saved.minutes, 45);
    assert.equal(saved.json.saved.mode, 'auto');
    assert.deepEqual(saved.json.saved.tools, { files: true, web: true });
    assert.equal(JSON.parse(readFileSync(join(app.home, 'mission', 'long-settings.json'), 'utf8')).u1.laps, 4);
    // Send without Run: an ordinary message, no run.
    app.says(agent, 'what does the data folder hold?');
    await app.tick();
    assert.equal((await app.card('GET', { sessionId: 'u1' })).json.run, null);
    // Run: its tools are there from the first request of the turn, and the model is told.
    const armed = await app.card('POST', { sessionId: 'u1', action: 'arm' });
    assert.equal(armed.status, 200, JSON.stringify(armed.json));
    assert.equal(armed.json.armed, true);
    assert.deepEqual(app.provided.mission.longRun('u1'), { files: true, web: true });
    // A goal round's message is not yours: still waiting.
    app.says(agent, 'a goal round', 'goal');
    await app.tick();
    assert.equal((await app.card('GET', { sessionId: 'u1' })).json.run, null);
    app.says(agent, 'do it now', 'user', 'go');
    // The model's tools wait for the start, then only mission_step is let through.
    const blocked = await app.preExecute({ name: 'write_file', arguments: {}, agent });
    assert.equal(blocked.kind, 'deny');
    assert.match(blocked.reason, /mission_step/);
    assert.ok(await app.until(() => existsSync(join(agent.header.cwd, '.dsh-mission', 'runs'))));
    const onDisk = app.runOnDisk(agent);
    assert.equal(onDisk.kind, 'long');
    assert.equal(onDisk.goal, 'do it now');
    assert.equal(onDisk.mode, 'Full Auto');
    assert.equal(onDisk.long.minutes, 45);
    assert.equal(onDisk.long.laps, 4);
    assert.equal(onDisk.long.keepAwake, false);
    assert.deepEqual(onDisk.long.tools, { files: true, web: true });
    assert.equal(onDisk.long.context, 'User: plan a weekly sales report\n\nAssistant: here is the plan: three steps', 'your messages and the answers before it, not the message itself or a goal round');
    assert.equal(app.levels.u1, 'workspace-write', 'a Read Only tab may write while it runs');
    card = await app.card('GET', { sessionId: 'u1' });
    assert.equal(card.json.armed, false);
    assert.equal(card.json.run.kind, 'long');
    // Send while it works: the message is kept for the helpers' next step.
    app.says(agent, 'also add a chart of the totals');
    const now = app.runOnDisk(agent);
    assert.deepEqual(now.long.asks.map((ask) => ask.text), ['also add a chart of the totals']);
    assert.ok(now.log.some((entry) => entry.kind === 'ask'));
    assert.match(lapNotes(now), /The user wrote to the run while it worked[^\n]*\n- also add a chart of the totals/);
    await app.card('POST', { sessionId: 'u1', action: 'end' });
    await app.tick();
    assert.equal(app.levels.u1, 'read-only');
    // After it ended, Send is an ordinary message again.
    app.says(agent, 'thanks, how did it go?');
    assert.equal(app.runOnDisk(agent).long.asks.length, 1);
  } finally {
    app.done();
  }
});

test('Run: refused when not ready, forgotten when taken back, and a start that fails says why', { skip: !hasGit && 'needs git' }, async () => {
  const app = running();
  try {
    const agent = app.open('u2');
    app.tabs.u2 = 'data';
    app.tiers.u2 = { subagents: false };
    const refused = await app.card('POST', { sessionId: 'u2', action: 'arm' });
    assert.equal(refused.status, 400);
    assert.equal(app.provided.mission.longRun('u2'), undefined);
    delete app.tiers.u2;
    // Not while the conversation is answering.
    agent.status = 'running';
    assert.match((await app.card('POST', { sessionId: 'u2', action: 'arm' })).json.error, /done answering/);
    agent.status = 'idle';
    // Taken back (the Send press did not go through): nothing waits, its tools go.
    assert.equal((await app.card('POST', { sessionId: 'u2', action: 'arm' })).status, 200);
    const back = await app.card('POST', { sessionId: 'u2', action: 'disarm' });
    assert.equal(back.json.armed, false);
    assert.equal(app.provided.mission.longRun('u2'), undefined);
    app.says(agent, 'tidy the data folder please');
    await app.tick();
    assert.equal((await app.card('GET', { sessionId: 'u2' })).json.run, null);
    // The conversation has a goal of its own: the run cannot start, and says so.
    assert.equal((await app.card('POST', { sessionId: 'u2', action: 'arm' })).status, 200);
    app.goals.set('u2', { id: 'own', revision: 1, phase: 'active', objective: 'my own goal' });
    app.says(agent, 'tidy the data folder please');
    const said = await app.step(agent);
    assert.match(said.text, /^The Long run did not start: .*goal of its own/);
    const card = await app.card('GET', { sessionId: 'u2' });
    assert.match(card.json.startError.text, /goal of its own/);
    assert.equal(card.json.armed, false);
    assert.equal(app.levels.u2, 'read-only', 'the level is put back');
    assert.equal(app.provided.mission.longRun('u2'), undefined, 'its tools go');
    // An isolated conversation has no Run button, and cannot be armed.
    app.isolatedIds.add('u2');
    assert.equal((await app.card('GET', { sessionId: 'u2' })).json.runButton, false);
    assert.equal((await app.card('POST', { sessionId: 'u2', action: 'arm' })).status, 400);
  } finally {
    app.done();
  }
});

test('Run: a conversation set to Read Only by hand is lifted for the run and put back; a run that cannot be lifted does not start', { skip: !hasGit && 'needs git' }, async () => {
  const app = running();
  try {
    const agent = app.open('h1');
    app.tabs.h1 = 'cowork';
    app.levels.h1 = 'read-only';
    assert.equal((await app.card('POST', { sessionId: 'h1', action: 'arm' })).status, 200);
    app.says(agent, 'research this and save notes');
    assert.ok(await app.until(() => existsSync(join(agent.header.cwd, '.dsh-mission', 'runs'))));
    assert.equal(app.levels.h1, 'workspace-write', 'lifted, after the message was handed out');
    assert.deepEqual(app.runOnDisk(agent).long.restore, { sandbox: 'read-only', preset: 'danger-full-access', modeWasOn: false });
    await app.card('POST', { sessionId: 'h1', action: 'end' });
    await app.tick();
    assert.equal(app.levels.h1, 'read-only', 'put back');
    // The switch is refused: the run does not start, and says why.
    const other = app.open('h2');
    app.tabs.h2 = 'data';
    app.refuse(true);
    assert.equal((await app.card('POST', { sessionId: 'h2', action: 'arm' })).status, 200);
    app.says(other, 'research this and save notes');
    const said = await app.step(other);
    assert.match(said.text, /^The Long run did not start: This conversation is still Read Only/);
    assert.equal(existsSync(join(other.header.cwd, '.dsh-mission', 'runs')), false);
    assert.equal(app.levels.h2 ?? 'read-only', 'read-only');
    // Files and commands off: a Read Only run is fine.
    app.refuse(false);
  } finally {
    app.done();
  }
});

test('Run in a Scratch conversation: the run\'s folder is the conversation\'s own sub-folder, where its helpers work', { skip: !hasGit && 'needs git' }, async () => {
  const app = running();
  try {
    const agent = app.open('s1');
    app.tabs.s1 = 'cowork';
    app.levels.s1 = 'workspace-write';
    const own = join(agent.header.cwd, 'session-s1');
    mkdirSync(own);
    app.scratchFolders.s1 = own;
    const card = await app.card('GET', { sessionId: 's1' });
    assert.equal(card.json.preflight.ok, true);
    assert.equal((await app.card('POST', { sessionId: 's1', action: 'arm' })).status, 200);
    app.says(agent, 'research this and save notes');
    assert.ok(await app.until(() => existsSync(join(own, '.dsh-mission', 'runs'))), 'the run lives in the conversation\'s own folder');
    assert.equal(existsSync(join(agent.header.cwd, '.dsh-mission', 'runs')), false);
    const dir = join(own, '.dsh-mission', 'runs');
    const [id] = readdirSync(dir);
    assert.equal(JSON.parse(readFileSync(join(dir, id, 'run.json'), 'utf8')).root, own);
    await app.card('POST', { sessionId: 's1', action: 'end' });
  } finally {
    app.done();
  }
});

test('a run\'s planner may not write files: its answer goes in its reply; a worker may', { skip: !hasGit && 'needs git' }, async () => {
  const app = running();
  try {
    const agent = app.open('w9');
    app.tabs.w9 = 'code';
    app.levels.w9 = 'workspace-write';
    let release;
    const decisions = {};
    app.services.subagents = {
      startActivation: async (spec) => {
        const childId = `kid-${spec.label}`;
        const result = new Promise((resolve) => { release = () => resolve({ output: [{ type: 'text', text: '{"items":[{"title":"one"}],"checks":[]}' }], stopReason: 'end' }); });
        return { childId, result };
      },
    };
    assert.equal((await app.card('POST', { sessionId: 'w9', action: 'start', goal: 'do one small thing please', keepAwake: false, effort: false })).status, 200);
    const stepping = app.step(agent);
    assert.ok(await app.until(() => typeof release === 'function'), 'the planner started');
    const planner = { id: 'kid-Mission: planner', header: { parentSession: 'w9', cwd: agent.header.cwd }, session: { header: { parentSession: 'w9' } } };
    decisions.write = await app.preExecute({ name: 'write', arguments: { path: 'plan.json' }, agent: planner });
    decisions.read = await app.preExecute({ name: 'read', arguments: { path: 'README.md' }, agent: planner });
    release();
    await stepping;
    assert.equal(decisions.write.kind, 'deny');
    assert.match(decisions.write.reason, /^You are the planner of a run: change no files/);
    assert.notEqual(decisions.read.kind, 'deny', 'reading is fine');
    assert.notEqual((await app.preExecute({ name: 'write', arguments: { path: 'x.md' }, agent: planner })).reason ?? '', 'You are the planner of a run: change no files. Put your whole answer in your reply.', 'not once it is done');
  } finally {
    app.done();
  }
});

test('a Long run in Recon with checks switched on in Settings → Recon: the card says so and the run keeps its checks, without the internet', { skip: !hasGit && 'needs git' }, async () => {
  const app = running();
  try {
    const agent = app.open('rc2');
    app.tabs.rc2 = 'recon';
    app.isolatedIds.add('rc2');
    const room = mkdtempSync(join(tmpdir(), 'dsh-recon-test-'));
    const folder = join(room, 'run-rc2');
    app.services.recon = { runs: () => true, runFolder: (id) => { mkdirSync(join(room, `run-${id}`), { recursive: true }); return join(room, `run-${id}`); }, longChecks: () => true };
    const card = await app.card('GET', { sessionId: 'rc2' });
    assert.match(card.json.preflight.ticks.find((entry) => entry.key === 'recon-checks').text, /^Recon: the run checks its work with commands that have no internet/);
    assert.equal((await app.card('POST', { sessionId: 'rc2', action: 'save', mode: 'auto', minutes: 30, laps: 1, keepAwake: false })).status, 200);
    assert.equal((await app.card('POST', { sessionId: 'rc2', action: 'arm' })).status, 200);
    app.says(agent, 'find what the forums say about the leak');
    assert.ok(await app.until(() => existsSync(join(folder, '.dsh-mission', 'runs'))));
    const dir = join(folder, '.dsh-mission', 'runs');
    const run = JSON.parse(readFileSync(join(dir, readdirSync(dir)[0], 'run.json'), 'utf8'));
    assert.equal(run.long.isolated, true);
    assert.equal(run.long.offlineChecks, true);
    rmSync(room, { recursive: true, force: true });
  } finally {
    app.done();
  }
});

test('a Long run in Bench: the card says what is closed, and the run carries Bench\'s rules; other tabs carry none', { skip: !hasGit && 'needs git' }, async () => {
  const app = running();
  try {
    const agent = app.open('bn1');
    app.tabs.bn1 = 'bench';
    let checks = true;
    app.services.bench = { longRunRules: (id) => (id === 'bn1' ? { checks, closePorts: true } : undefined) };
    let card = await app.card('GET', { sessionId: 'bn1' });
    assert.match(card.json.preflight.ticks.find((entry) => entry.key === 'bench').text, /device ports closed to those checks/);
    checks = false;
    card = await app.card('GET', { sessionId: 'bn1' });
    assert.match(card.json.preflight.ticks.find((entry) => entry.key === 'bench').text, /checks are switched off in Settings → Bench/);
    checks = true;
    assert.equal((await app.card('POST', { sessionId: 'bn1', action: 'save', mode: 'auto', minutes: 30, laps: 1, keepAwake: false })).status, 200);
    assert.equal((await app.card('POST', { sessionId: 'bn1', action: 'arm' })).status, 200);
    app.says(agent, 'look up the board and write a note');
    const dir = join(agent.header.cwd, '.dsh-mission', 'runs');
    assert.ok(await app.until(() => existsSync(dir) && readdirSync(dir).length > 0), 'the run started');
    const run = JSON.parse(readFileSync(join(dir, readdirSync(dir)[0], 'run.json'), 'utf8'));
    assert.deepEqual(run.long.bench, { checks: true, closedPorts: true });
    assert.equal(run.long.isolated, undefined, 'none of Recon\'s rules');
    app.open('cw1');
    app.tabs.cw1 = 'cowork';
    assert.equal((await app.card('GET', { sessionId: 'cw1' })).json.preflight.ticks.find((entry) => entry.key === 'bench'), undefined, 'Cowork: no Bench line');
  } finally {
    app.done();
  }
});

test('a Long run in Recon, where Recon keeps it in its rules: its own folder, Restricted, no commands, one model, no record outside', { skip: !hasGit && 'needs git' }, async () => {
  const app = running();
  try {
    const agent = app.open('rc1');
    app.tabs.rc1 = 'recon';
    app.isolatedIds.add('rc1');
    // Without Recon's say-so: refused as before.
    assert.equal((await app.card('POST', { sessionId: 'rc1', action: 'arm' })).status, 400);
    assert.equal((await app.card('GET', { sessionId: 'rc1' })).json.runButton, false);
    const room = mkdtempSync(join(tmpdir(), 'dsh-recon-test-'));
    const folder = join(room, 'run-rc1');
    app.services.recon = { runs: () => true, runFolder: (id) => { mkdirSync(join(room, `run-${id}`), { recursive: true }); return join(room, `run-${id}`); } };
    let card = await app.card('GET', { sessionId: 'rc1' });
    assert.equal(card.json.runButton, true);
    const tick = card.json.preflight.ticks.find((entry) => entry.key === 'isolated');
    assert.equal(tick.ok, true);
    assert.match(tick.text, /helpers use this conversation's model and Recon's tools, with files only in the run's own folder/);
    assert.match(card.json.preflight.ticks.find((entry) => entry.key === 'recon-checks').text, /^Recon: the run runs no commands; the reviewer judges each item by reading\./, 'checks off: the default');
    assert.equal((await app.card('POST', { sessionId: 'rc1', action: 'save', mode: 'auto', minutes: 30, laps: 2, keepAwake: false })).status, 200);
    assert.equal((await app.card('POST', { sessionId: 'rc1', action: 'arm' })).status, 200);
    app.says(agent, 'find what the forums say about the leak');
    assert.ok(await app.until(() => existsSync(join(folder, '.dsh-mission', 'runs'))), 'the run lives in its own folder in the room');
    const dir = join(folder, '.dsh-mission', 'runs');
    const [id] = readdirSync(dir);
    const run = JSON.parse(readFileSync(join(dir, id, 'run.json'), 'utf8'));
    assert.equal(run.root, folder);
    assert.equal(run.mode, 'Restricted', 'Restricted whatever was saved: nothing outside the folder');
    assert.equal(run.long.isolated, true);
    assert.equal(run.long.offlineChecks, undefined, 'no checks unless switched on in Settings → Recon');
    assert.equal(app.provided.mission.mode('rc1'), 'restricted');
    // mission_step is let through now (it would refuse an isolated conversation before).
    const stepped = await app.step(agent);
    assert.doesNotMatch(stepped.text, /isolated conversation/);
    // No record of it outside the room.
    assert.equal(existsSync(join(app.home, 'mission', 'active-runs.json')) && readFileSync(join(app.home, 'mission', 'active-runs.json'), 'utf8').includes('rc1'), false);
    // Its helpers are moved into the run's folder before their turn (they start in the room).
    const moved = [];
    app.services.workingDirectory = { get: () => '/private/tmp/dsh-recon-room', set: async (who, where) => { moved.push([who.id, where]); } };
    const helper = { id: 'rc1-worker', header: { parentSession: 'rc1' }, session: { header: { parentSession: 'rc1' } } };
    app.agents.set?.('rc1-worker', helper);
    const assemble = app.handlers('system-prompt/assemble')[0];
    let passed = false;
    await assemble({}, { agent: helper, signal: new AbortController().signal }, async () => { passed = true; });
    assert.equal(passed, true);
    assert.deepEqual(moved, [['rc1-worker', folder]]);
    // Not the conversation itself, and not a helper of a conversation that is not Recon.
    await assemble({}, { agent, signal: new AbortController().signal }, async () => {});
    assert.equal(moved.length, 1);
    // Moved as soon as it is made, before its first turn (a move inside a failing first step left the
    // app waiting on the helper for good).
    const early = { id: 'rc1-planner', header: { parentSession: 'rc1' }, session: { header: { parentSession: 'rc1' } } };
    for (const handler of app.handlers('agent/created')) await handler({ agent: early });
    assert.deepEqual(moved.at(-1), ['rc1-planner', folder]);
    // The helpers' file tools: only inside the fence and from the run's folder (review findings 1 and 7).
    assert.equal(app.provided.mission.longRun('rc1').files, true);
    let where = '/private/tmp/dsh-recon-room';
    app.services.workingDirectory = { get: () => where, set: async () => {} };
    const read = () => app.preExecute({ name: 'read', arguments: { path: 'findings.md' }, agent: helper });
    assert.equal((await read()).kind, 'deny', 'not from the room');
    where = folder;
    assert.notEqual((await read()).kind, 'deny', 'from the run\'s folder');
    assert.equal((await app.preExecute({ name: 'read', arguments: { path: '/etc/hosts' }, agent: helper })).kind, 'deny', 'nothing outside the run\'s folder');
    // /mission off takes the fence away: the file tools go with it, also for a helper already running.
    assert.match((await app.mission(agent, 'off')).text ?? '', /off/i);
    assert.equal(app.provided.mission.longRun('rc1').files, false);
    assert.equal((await read()).kind, 'deny');
    // Recon's End and wipe ends it.
    assert.match(app.provided.mission.endRun('rc1'), /You ended it/);
    // No record of it in the app's home: Mission keeps a Recon conversation's record in memory (review finding 4).
    assert.equal(existsSync(join(app.home, 'mission', 'conversations.json')) && readFileSync(join(app.home, 'mission', 'conversations.json'), 'utf8').includes('rc1'), false);
    assert.equal(existsSync(join(app.home, 'mission', 'runs.jsonl')) && readFileSync(join(app.home, 'mission', 'runs.jsonl'), 'utf8').includes(folder), false, 'no line in runs.jsonl');
    // /mission modes stay refused in Recon.
    assert.match((await app.mission(agent, 'auto')).text, /isolated conversation/);
    rmSync(room, { recursive: true, force: true });
  } finally {
    app.done();
  }
});

test('a run that has ended: the step tool gives the report once more, then a short answer; a model that keeps calling has its turn ended (16 November: some 340 calls)', { skip: !hasGit && 'needs git' }, async () => {
  const { OVER_LIMIT, RUN_ENDED_AGAIN } = await import('../index.js');
  const app = running();
  try {
    const agent = app.open('o1');
    app.tabs.o1 = 'code';
    app.levels.o1 = 'workspace-write';
    assert.equal((await app.card('POST', { sessionId: 'o1', action: 'start', goal: 'make every test pass please', mode: 'restricted', keepAwake: false })).status, 200);
    await app.card('POST', { sessionId: 'o1', action: 'end' });
    await app.tick();
    const nextStep = async () => {
      let decision = { kind: 'enter', messages: [] };
      for (const handler of app.handlers('agent/pre-step')) decision = await handler({ agent }, async () => decision);
      return decision;
    };
    assert.match((await app.step(agent)).text, /^The mission run has ended\.[\s\S]*The run is over\./, 'the report once more');
    assert.equal((await app.step(agent)).text, RUN_ENDED_AGAIN);
    assert.equal((await nextStep()).kind, 'enter');
    for (let n = 2; n < OVER_LIMIT; n += 1) await app.step(agent);
    assert.equal((await nextStep()).kind, 'reject', `after ${OVER_LIMIT} calls the turn ends`);
    assert.equal((await nextStep()).kind, 'enter', 'counted afresh');
    // A new turn of the user's starts afresh, and the report comes once more.
    await app.step(agent);
    app.turnStarts(agent, 9);
    assert.match((await app.step(agent)).text, /^The mission run has ended\./);
  } finally {
    app.done();
  }
});

test('the owner\'s answer: a Long run in the Research tab uses the work loop with Ultra Code on, and runs as today without it (the tab switch does not count there)', { skip: !hasGit && 'needs git' }, async () => {
  for (const [ultra, loopTabs, wanted] of [[true, '[]', true], [false, '[]', false], [false, '["research"]', false]]) {
    const app = running({ loopTabs });
    try {
      const agent = app.open('r1');
      app.tabs.r1 = 'research';
      if (ultra) app.ultraIds.add('r1');
      const started = await app.card('POST', { sessionId: 'r1', action: 'start', goal: 'research the sources about heat pumps', tools: { files: true, web: true }, keepAwake: false });
      assert.equal(started.status, 200, JSON.stringify(started.json));
      const onDisk = app.runOnDisk(agent);
      assert.equal(Boolean(onDisk.loop), wanted, `ultra ${ultra}, tabs ${loopTabs}`);
      if (wanted) assert.equal(onDisk.loop.kind, 'research');
    } finally {
      app.done();
    }
  }
  const { loopWanted } = await import('../lib/loop.js');
  assert.deepEqual(loopWanted({ ultra: false, tab: 'code', loopTabs: ['code'] }), { ultra: false, tabOn: true }, 'other tabs keep their switch');
});
