/**
 * Tuning Plus whole, on a stand-in app: made-up conversations, a stand-in trainer and model, nothing real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../index.js';
import { ANSWER_SCRIPT } from '../lib/trainer.js';

const event = (type, data) => ({ type, data });
const user = (text) => event('user/message', { message: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] } });
const call = (id, name, args) => event('tool/call', { callId: id, name, arguments: JSON.stringify(args) });
const result = (id, text, isError = false) => event('tool/result', { message: { toolCallId: id, isError, content: [{ type: 'text', text }] } });
const answer = (text) => event('assistant/message', { message: { role: 'assistant', content: [{ type: 'text', text }] } });
const turn = (n, ...inner) => [event('turn/start', { turn: n }), event('request/header', { header: { config: { provider: 'local', model: 'small' } } }), ...inner, event('turn/end', { turn: n, reason: { kind: 'completed' } })];
const codeTurn = (n, request) => [user(request), ...turn(n, call(`e${n}`, 'edit', { file_path: `f${n}.js` }), result(`e${n}`, 'ok'), call(`t${n}`, 'bash', { command: 'npm test' }), result(`t${n}`, '9 passing'), answer('Done, tests pass.'))];

/** The stand-in app. */
function world({ enabled = true, harvest = { code: true, content: true, corrections: true }, power = true, idle = 3600, claims = 80, extra = {}, extraModes = {}, isolated = {}, spaces = {}, providers = {}, setup, services: more = {} } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'tuning-app-'));
  const subject = join(home, 'subjects', 'heat-pumps');
  mkdirSync(join(subject, '.content'), { recursive: true });
  const labels = ['reported', 'fact', 'claim', 'rumour'];
  const ruled = Array.from({ length: claims }, (_value, index) => ({ id: `C${index}`, text: `Claim number ${index} about ${['pumps', 'grids', 'tariffs', 'panels'][index % 4]} in town ${index * 3}`, standing: labels[index % 4], origin: 'research', ruled: { standing: labels[index % 4], at: 1000 + index, quote: `C${index} is ${labels[index % 4]}` } }));
  writeFileSync(join(subject, '.content', 'state.json'), JSON.stringify({ claims: ruled }));
  const modelDir = join(home, 'models', 'small');
  mkdirSync(modelDir, { recursive: true });
  writeFileSync(join(modelDir, 'config.json'), '{}');
  const pythonPath = join(home, 'venv', 'bin', 'python');
  mkdirSync(join(home, 'venv', 'bin'), { recursive: true });
  writeFileSync(pythonPath, '#!/bin/sh\n');
  setup?.(home);
  const conversations = {
    ...Object.fromEntries(Object.entries(extra).map(([id, value]) => [id, typeof value === 'function' ? value(home) : value])),
    c1: { header: { id: 'c1', cwd: join(home, 'code') }, events: [...codeTurn(1, 'fix the parser'), ...codeTurn(2, 'add a test for dates'), ...codeTurn(3, 'rename the helper')] },
    r1: { header: { id: 'r1', cwd: '/tmp/dsh-recon-room' }, events: codeTurn(1, 'search the onion forum') },
    h1: { header: { id: 'h1', cwd: join(home, 'x'), parentSession: 'r1' }, events: codeTurn(1, 'a helper of Recon') },
    // A helper of Recon whose own mode says nothing: it still takes its conversation's exclusion.
    h2: { header: { id: 'h2', cwd: join(home, 'z'), parentSession: 'r1' }, events: codeTurn(1, 'a quiet helper of Recon') },
    e1: { header: { id: 'e1', cwd: join(home, 'y') }, events: [user('[Recon export E1, 2026-11-16: material]\nsource origin: Recon · lane: onion'), ...codeTurn(1, 'use the export')] },
    cn1: { header: { id: 'cn1', cwd: subject }, events: [user('rule C1'), ...turn(1, answer('ok'))] },
  };
  const modeMap = { c1: 'code', r1: 'recon', h1: 'recon', h2: 'code', e1: 'cowork', cn1: 'content', ...extraModes };
  const config = { enabled, harvest: JSON.stringify(harvest), folder: '', python: pythonPath, models: JSON.stringify({ small: modelDir }), teacher: '', teacherCloud: false, providers: '{}', anthropicOpenEnded: false, nightShift: true, idleMinutes: 15, nightMinutes: 30, nightTrain: '[]', examLimit: 40 };
  const settings = {
    describe: () => [{ ns: 'modes', value: { sessionIsolated: JSON.stringify({ r1: true, ...isolated }), sessionModes: JSON.stringify(modeMap), sessionSpaces: JSON.stringify(spaces) } }, { ns: 'tuning', value: config }, { ns: 'llm-pi-ai', value: { providers: { p: { baseURL: 'http://127.0.0.1:9/v1' }, ...providers } } }],
    mutate: async (ns, ops) => {
      assert.equal(ns, 'tuning');
      for (const op of ops) config[op.path[0]] = op.value;
    },
  };
  const registered = new Map();
  const handlers = {};
  let route;
  const provided = {};
  const disposers = [];
  const state = { asked: [], approve: 'allowed-once', power, idle, trained: 0, answered: [], touchBase: false, modelAsked: [], idleReads: 0, idleAfter: Infinity, free: 1e12, spawned: [], spawnFails: false };
  const services = {
    dshHomePath: (name) => join(home, name),
    settings,
    sessionQuery: { listSessions: async () => Object.values(conversations).map((one) => ({ header: one.header })), readSession: async (id) => ({ events: conversations[id].events, inheritedEventCount: 0 }) },
    modes: { get: (id) => modeMap[id], isolated: (id) => modeMap[id] === 'recon' },
    tools: {
      register(tool, options) { registered.set(tool.name, { tool, options }); return () => registered.delete(tool.name); },
      list: () => [{ name: 'edit', plugin: 'dsh-code', parameters: { type: 'object', properties: { file_path: { type: 'string' } } } }, { name: 'bash', plugin: 'dsh-code', parameters: { type: 'object', properties: { command: { type: 'string' } } } }],
    },
    benchmark: { canaries: () => [{ id: 'add', prompt: 'What is 17 + 25?', grader: { type: 'regex', expect: '\\b42\\b' } }, { id: 'word', prompt: 'Say ready', grader: { type: 'regex', expect: 'ready' } }] },
    ...more,
  };
  const ctx = {
    get: (name) => services[name],
    on: (name, fn) => { handlers[name] = fn; },
    effect: (fn) => { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); },
    provide: (name, value) => { provided[name] = value; },
    inject: (_names, callback) => callback({ effect: (fn) => fn(), webServer: { register: (spec) => { route = spec.handler; return () => {}; } }, connection: { requestRejection: () => undefined } }),
    logger: { warn() {}, info() {} },
  };
  const labelOf = (text) => /Claim number (\d+)/.exec(text) ? labels[Number(/Claim number (\d+)/.exec(text)[1]) % 4] : '';
  const runPython = async ({ args, signal }) => {
    if (args[0] === ANSWER_SCRIPT) {
      const input = args[args.indexOf('--input') + 1];
      const output = args[args.indexOf('--output') + 1];
      const adapter = args.includes('--adapter');
      const lines = readFileSync(input, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
      state.answered.push({ adapter, count: lines.length });
      writeFileSync(output, lines.map((line) => {
        const text = line.messages.map((message) => message.content).join('\n');
        const reply = /17 \+ 25/.test(text) ? '42' : /Say ready/.test(text) ? 'ready' : adapter ? labelOf(text) : 'no idea';
        return JSON.stringify({ id: line.id, text: reply });
      }).join('\n'));
      return { code: 0, stopped: '', tail: [], seconds: 1, pid: 1 };
    }
    if (args.includes('lora')) {
      if (signal?.aborted) return { code: null, stopped: 'stopped', tail: [], seconds: 0, pid: 1 };
      const adapter = args[args.indexOf('--adapter-path') + 1];
      mkdirSync(adapter, { recursive: true });
      writeFileSync(join(adapter, 'adapters.safetensors'), 'weights');
      writeFileSync(join(adapter, '0000050_adapters.safetensors'), 'a checkpoint');
      if (state.touchBase) writeFileSync(join(modelDir, 'model.safetensors'), 'changed');
      state.trained += 1;
      return { code: 0, stopped: '', tail: ['    100    0.42 ▼    1,000      10k'], seconds: 3, pid: 1 };
    }
    if (args.includes('fuse')) {
      const out = args[args.indexOf('--save-path') + 1];
      writeFileSync(join(out, 'config.json'), '{}');
      return { code: 0, stopped: '', tail: [], seconds: 1, pid: 1 };
    }
    return { code: 1, stopped: '', tail: ['unknown'], seconds: 0, pid: 1 };
  };
  const askModel = async (route, text) => {
    state.modelAsked.push({ route, text });
    return /GOOD/.test(text) ? labelOf(text) || '42' : 'no idea';
  };
  const run = async (file) => {
    if (file.endsWith('pmset')) return { code: 0, stdout: `Now drawing from '${state.power ? 'AC' : 'Battery'} Power'` };
    state.idleReads += 1;
    // The owner comes back after a number of looks: from then on the Mac is in use.
    return { code: 0, stdout: `"HIDIdleTime" = ${(state.idleReads > state.idleAfter ? 10 : state.idle) * 1e9}` };
  };
  const spawn = (file, args, options) => {
    const child = new EventEmitter();
    child.pid = state.spawnFails ? undefined : 7000 + state.spawned.length;
    child.kill = () => setTimeout(() => child.emit('exit', 0), 1);
    state.spawned.push({ file, args, options, child });
    setTimeout(() => (state.spawnFails ? child.emit('error', Object.assign(new Error('spawn EACCES'), { code: 'EACCES' })) : child.emit('spawn')), 1);
    return child;
  };
  const app = apply(ctx, config, { runPython, askModel, run, spawn, portFree: async () => true, freeBytes: () => state.free, approve: async (_exec, reason) => { state.asked.push(reason); return state.approve; } });
  const post = async (body) => {
    let out = '';
    const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text; } };
    await route({ method: 'POST', url: '/dsh-tuning/data', async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } }, res);
    return { status: res.statusCode, json: JSON.parse(out) };
  };
  const get = async () => {
    let out = '';
    const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text; } };
    await route({ method: 'GET', url: '/dsh-tuning/data', async *[Symbol.asyncIterator]() {} }, res);
    return JSON.parse(out);
  };
  return { home, app, config, state, registered, provided, post, get, modelDir, conversations, close: () => { for (const dispose of disposers) dispose(); rmSync(home, { recursive: true, force: true }); } };
}

test('switched off: nothing is harvested and no tool is offered', async () => {
  const w = world({ enabled: false });
  try {
    await assert.rejects(w.app.harvest(), /switched off/);
    assert.equal(w.registered.size, 0);
    assert.equal(existsSync(join(w.home, 'tuning')), false, 'nothing made');
  } finally {
    w.close();
  }
});

test('the harvest: checked rows from the modes switched on; Recon, its helper, a conversation with an export and the Recon room are never read', async () => {
  const w = world();
  try {
    const summary = await w.app.harvest();
    const rowsFile = (mode) => (existsSync(join(w.home, 'tuning', 'rows', `${mode}.jsonl`)) ? readFileSync(join(w.home, 'tuning', 'rows', `${mode}.jsonl`), 'utf8') : '');
    const examFile = (mode) => (existsSync(join(w.home, 'tuning', 'exam', `${mode}.jsonl`)) ? readFileSync(join(w.home, 'tuning', 'exam', `${mode}.jsonl`), 'utf8') : '');
    const everything = ['code', 'content', 'corrections', 'cowork', 'recon', 'other'].map((mode) => rowsFile(mode) + examFile(mode)).join('\n');
    assert.match(everything, /fix the parser/);
    assert.doesNotMatch(everything, /onion forum|helper of Recon|use the export/);
    assert.ok(summary.left.some((one) => one.id === 'h2'), 'a helper takes its conversation\'s exclusion');
    assert.ok(summary.left.some((one) => one.id === 'r1' && /Recon/.test(one.why)));
    assert.ok(summary.left.some((one) => one.id === 'h1'), 'a helper of a Recon conversation');
    assert.ok(summary.left.some((one) => one.id === 'e1' && /export/.test(one.why)));
    const content = summary.modes.content;
    assert.equal(content.kept + content.exam, 80, 'every ruled claim, once');
    // One in five of 80 by a random salt: 16 on average; 4 to 30 holds in all but about one run in ten thousand.
    assert.ok(content.exam >= 4 && content.exam <= 30, `about one in five to the exam (${content.exam})`);
    // Again: nothing twice.
    const again = await w.app.harvest();
    assert.equal(again.modes.content?.kept ?? 0, 0);
    const view = await w.get();
    assert.equal(view.sets.standings.rows, content.kept);
    assert.equal(view.exam.total >= content.exam, true);
  } finally {
    w.close();
  }
});

test('the exam gate on rungs 1 to 3: changed instructions that are worse on the owner\'s exam are refused; better or equal pass; no exam, no say', async () => {
  const w = world({ claims: 200 }); // one in five of 200: the exam always has 10 rows
  try {
    assert.equal(await w.app.examGate({ route: { provider: 'p', model: 'm' }, after: 'x' }), undefined, 'no exam yet: the add-on decides as before');
    await w.app.harvest();
    const better = await w.app.examGate({ route: { provider: 'p', model: 'm' }, before: '', after: 'GOOD instructions' });
    assert.equal(better.ok, true);
    const worse = await w.app.examGate({ route: { provider: 'p', model: 'm' }, before: 'GOOD instructions', after: 'other instructions' });
    assert.equal(worse.ok, false);
    assert.match(worse.why, /worse on the owner's exam/);
    // A model on the internet never sees rows written elsewhere: here none were written with it, so no say.
    assert.equal(await w.app.examGate({ route: { provider: 'cloud', model: 'm' }, before: '', after: 'GOOD instructions' }), undefined);
    assert.equal(typeof w.provided.tuning.examGate, 'function', 'offered to Self-improve and Learned skills');
  } finally {
    w.close();
  }
});

test('a training run: the exam before and after, the canaries, the base model untouched; promoted only by the owner on the page, then switched on and used by a team only while served', async () => {
  const w = world({ claims: 200 }); // one in five of 200: the exam always has 10 rows
  try {
    await w.app.harvest();
    const card = await w.app.startRun({ model: 'small', goal: 'judge', sets: ['standings'], method: '4', minutes: 10 });
    assert.equal(w.state.trained, 1);
    assert.match(card.title, /^Ready for your yes/);
    assert.match(card.text, /On its exam \(\d+ rows of your own work\): \d+ right now against 0/);
    assert.deepEqual(card.buttons, ['taste', 'promote', 'later', 'never']);
    const entry = (await w.get()).shelf[0];
    assert.equal(entry.state, 'candidate');
    assert.equal(entry.private, true);
    assert.equal(w.provided.tuning.adapterRoute(entry.id), undefined);
    // Not switched on before promotion.
    assert.equal((await w.post({ action: 'switch', entry: entry.id, on: true })).status, 400);
    assert.equal((await w.post({ action: 'card', card: card.id, do: 'promote' })).status, 200);
    assert.equal((await w.post({ action: 'switch', entry: entry.id, on: true })).status, 200);
    assert.equal(w.provided.tuning.adapterRoute(entry.id), undefined, 'not served yet');
    assert.match((await w.post({ action: 'serve', entry: entry.id, way: 'fused' })).json.note, /fused copy is in/);
    await w.post({ action: 'route', entry: entry.id, provider: 'local', model: 'small-judge' });
    assert.deepEqual(w.provided.tuning.adapterRoute(entry.id), { provider: 'local', model: 'small-judge' });
    await w.post({ action: 'switch', entry: entry.id, on: false });
    assert.equal(w.provided.tuning.adapterRoute(entry.id), undefined, 'switched off in one action');
    assert.ok(!existsSync(join(w.modelDir, 'adapters.safetensors')), 'nothing written into the base model');
  } finally {
    w.close();
  }
});

test('a run refuses without the trainer, with too few rows or too small an exam; a look-only run trains nothing', async () => {
  const w = world({ claims: 200 }); // one in five of 200: the exam always has 10 rows
  try {
    await w.app.harvest();
    const look = await w.app.startRun({ model: 'small', goal: 'judge', lookOnly: true });
    assert.match(look.title, /^Look only/);
    assert.equal(w.state.trained, 0);
    await assert.rejects(w.app.startRun({ model: 'unknown-model', goal: 'judge', sets: ['standings'], method: '4' }), /folder of the base model/);
    w.config.python = '';
    await assert.rejects(w.app.startRun({ model: 'small', goal: 'judge', sets: ['standings'], method: '4' }), /never installs/);
    w.config.python = join(w.home, 'venv', 'bin', 'python');
    await assert.rejects(w.app.startRun({ model: 'small', goal: 'harness', sets: ['harness'], method: '4' }), /may train; a candidate needs at least 20/);
    const proposal = await w.app.startRun({ model: 'small', goal: 'judge', sets: ['standings'], method: 'auto' });
    assert.match(proposal.title, /^Rung 1: Instructions/, 'the lowest rung first');
  } finally {
    w.close();
  }
});

test('with the skills part on, a job that comes up only sometimes is proposed as a skill (between rungs 1 and 2); off, as before', async () => {
  const w = world({ claims: 200 });
  try {
    await w.app.harvest();
    // Many more rows of other jobs in the same tab: the standings are under a quarter of them.
    const { openStore } = await import('../lib/store.js');
    const { makeRow } = await import('../lib/rows.js');
    const store = openStore(() => join(w.home, 'tuning'));
    const standings = store.rows().filter((row) => row.mode === 'content').length;
    assert.ok(standings > 0);
    // On, but the standings are most of what the tab gathered: a rule for every time, so instructions.
    w.config.skills = true;
    assert.match((await w.app.startRun({ model: 'small', goal: 'judge', sets: ['standings'], method: 'auto' })).title, /^Rung 1: Instructions/);
    w.config.skills = false;
    store.addRows('content', Array.from({ length: standings * 4 }, (_value, index) => makeRow({ kind: 'answer', mode: 'content', input: `Another job ${index}`, output: `Done ${index}`, proof: { check: 'made-up' }, by: {} })));
    const off = await w.app.startRun({ model: 'small', goal: 'judge', sets: ['standings'], method: 'auto' });
    assert.match(off.title, /^Rung 1: Instructions/, 'the skills part off: as before');
    w.config.skills = true;
    const on = await w.app.startRun({ model: 'small', goal: 'judge', sets: ['standings'], method: 'auto' });
    assert.match(on.title, /^Skill: between rungs 1 and 2/);
    assert.match(on.text, /Look for skill ideas/);
    const look = await w.app.startRun({ model: 'small', goal: 'judge', sets: ['standings'], lookOnly: true });
    assert.match(look.text, /a skill, between rungs 1 and 2/);
  } finally {
    w.close();
  }
});

test('the night shift waits for a skills run or a skill exam (the night is not lost; the review of step 9)', async () => {
  const w = world();
  try {
    w.config.nightShift = true;
    const real = w.app.skillsPart.examRunning;
    w.app.skillsPart.examRunning = () => true;
    await w.app.nightTick();
    assert.equal(existsSync(join(w.home, 'tuning', 'cards.json')), false, 'nothing done while a skills run goes');
    w.app.skillsPart.examRunning = real;
    await w.app.nightTick();
    assert.ok(JSON.parse(readFileSync(join(w.home, 'tuning', 'cards.json'), 'utf8')).cards.some((card) => card.kind === 'night'), 'the night works once it is done');
  } finally {
    w.close();
  }
});

test('the night shift drafts skills only with its own switch and the skills part on; what it did is on the morning card', async () => {
  for (const [nightSkills, skills, expected] of [[false, true, false], [true, false, false], [true, true, true]]) {
    const w = world();
    try {
      Object.assign(w.config, { nightShift: true, nightSkills, skills });
      const calls = [];
      w.app.skillsPart.nightDrafts = async (options) => {
        calls.push(typeof options?.stopped);
        return { ideas: 2, drafted: [{ name: 'update-changelog', exam: 'passed' }], problems: [], stopped: '' };
      };
      await w.app.nightTick();
      const night = (await w.get()).cards.find((card) => card.kind === 'night');
      assert.deepEqual(calls, expected ? ['function'] : [], `nightSkills ${nightSkills}, skills ${skills}`);
      if (expected) assert.match(night.text, /Skill drafts: update-changelog \(exam passed\)\. They wait under Skills; nothing went live and no skill was changed\./);
      else assert.doesNotMatch(night.text, /Skill drafts/);
    } finally {
      w.close();
    }
  }
});

test('the night shift: on power and idle it gathers and reports a card; while the Mac is used it does nothing', async () => {
  const busy = world({ idle: 10 });
  try {
    await busy.app.nightTick();
    assert.equal(existsSync(join(busy.home, 'tuning', 'cards.json')), false);
  } finally {
    busy.close();
  }
  const quiet = world();
  try {
    await quiet.app.nightTick();
    const view = await quiet.get();
    const night = view.cards.find((card) => card.kind === 'night');
    assert.ok(night, 'a card for the morning');
    assert.match(night.text, /Gathered:/);
    assert.equal(quiet.state.trained, 0, 'no set was allowed to train');
  } finally {
    quiet.close();
  }
});

test('tools in the chat: offered only while on and never in Recon; a start needs the owner\'s yes on the app\'s card, never a helper\'s', async () => {
  const w = world();
  try {
    assert.deepEqual([...w.registered.keys()].sort(), ['tuning_export_set', 'tuning_plan', 'tuning_start', 'tuning_status']);
    const when = w.registered.get('tuning_status').options.when;
    assert.equal(when({ agent: { id: 'c1' } }), true);
    assert.equal(when({ agent: { id: 'r1' } }), false, 'not in Recon');
    const start = w.registered.get('tuning_start').tool;
    assert.match((await start.execute({ model: 'small', goal: 'judge' }, { agent: { id: 'h9', header: { parentSession: 'c1' } } })).text, /Only the thread itself/);
    w.state.approve = 'rejected';
    assert.match((await start.execute({ model: 'small', goal: 'judge' }, { agent: { id: 'c1' } })).text, /The owner said no/);
    assert.match(w.state.asked[0], /^Improve small at "Judge the way I do"/);
    await w.app.harvest();
    const exported = await w.registered.get('tuning_export_set').tool.execute({ set: 'standings' }, { agent: { id: 'c1' } });
    assert.match(exported.text, /Written to .*exports\/standings-[\d-]+: \d+ training rows/);
    w.config.enabled = false;
    assert.match((await w.registered.get('tuning_status').tool.execute({}, { agent: { id: 'c1' } })).text, /switched off/);
  } finally {
    w.close();
  }
});

test('settings from the page are checked: a Python that is not a full path is refused', async () => {
  const w = world();
  try {
    assert.equal((await w.post({ action: 'set', field: 'python', value: 'python3' })).status, 400);
    assert.equal((await w.post({ action: 'set', field: 'nope', value: 1 })).status, 400);
    assert.equal((await w.post({ action: 'set', field: 'nightShift', value: false })).status, 200);
    assert.equal(w.config.nightShift, false);
  } finally {
    w.close();
  }
});

test('a base model whose files changed during training: the candidate fails and is never offered', async () => {
  const w = world({ claims: 200 }); // one in five of 200: the exam always has 10 rows
  try {
    await w.app.harvest();
    w.state.touchBase = true;
    const card = await w.app.startRun({ model: 'small', goal: 'judge', sets: ['standings'], method: '4', minutes: 10 });
    assert.match(card.title, /^Not finished/);
    assert.match(card.text, /base model's files changed during training/);
    assert.equal(card.buttons, undefined, 'only Not now and Do not suggest this again');
    const entry = (await w.get()).shelf[0];
    assert.equal(entry.exam.decision.ok, false);
    assert.equal((await w.post({ action: 'card', card: card.id, do: 'promote' })).status, 400, 'cannot be promoted');
  } finally {
    w.close();
  }
});

test('the taste test sends a model on the internet only requests that were made to that same provider', async () => {
  const w = world({ claims: 200 }); // one in five of 200: the exam always has 10 rows
  try {
    await w.app.harvest();
    await w.app.startRun({ model: 'small', goal: 'judge', sets: ['standings'], method: '4', minutes: 10 });
    const entry = (await w.get()).shelf[0];
    w.state.modelAsked.length = 0;
    await assert.rejects(w.app.startTaste(entry.id, { provider: 'cloud', model: 'x' }), /no recent requests made to cloud/);
    assert.equal(w.state.modelAsked.length, 0, 'nothing was sent to it');
    // The same provider the requests were made to: asked again.
    const same = await w.app.startTaste(entry.id, { provider: 'local', model: 'small' });
    assert.ok(same.items.length > 0);
    assert.ok(w.state.modelAsked.every((one) => one.route.provider === 'local'));
    assert.doesNotMatch(JSON.stringify(same.items), /onion forum|helper of Recon|use the export/);
    assert.equal(same.items.some((item) => 'candidate' in item), false, 'names hidden until every pick is made');
    // A model on this Mac: any recent request.
    const here = await w.app.startTaste(entry.id, { provider: 'p', model: 'm' });
    assert.ok(here.items.length > 0);
  } finally {
    w.close();
  }
});

// ---- the independent review's findings ----------------------------------------------------------------------

const linesOf = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []);
const storedRows = (home) => ['rows', 'exam'].flatMap((side) => (existsSync(join(home, 'tuning', side)) ? readdirSync(join(home, 'tuning', side)) : []).flatMap((name) => linesOf(join(home, 'tuning', side, name))));
const subject = (home, name, claims) => {
  const dir = join(home, 'subjects', name);
  mkdirSync(join(dir, '.content'), { recursive: true });
  writeFileSync(join(dir, '.content', 'state.json'), JSON.stringify({ claims }));
  return dir;
};
const claim = (text, origin = 'research') => ({ id: text, text, standing: 'reported', ...(origin ? { origin } : {}), ruled: { standing: 'reported', at: 1, quote: 'ruled' } });

test('2. lessons keep their row\'s side of the exam split', async () => {
  const w = world({ claims: 200 });
  try {
    await w.app.harvest();
    w.app.buildLessons();
    const pool = new Set(linesOf(join(w.home, 'tuning', 'rows', 'code.jsonl')).map((row) => row.id));
    const exam = new Set(linesOf(join(w.home, 'tuning', 'exam', 'code.jsonl')).map((row) => row.id));
    const poolLessons = linesOf(join(w.home, 'tuning', 'rows', 'lessons.jsonl'));
    const examLessons = linesOf(join(w.home, 'tuning', 'exam', 'lessons.jsonl'));
    assert.ok(poolLessons.length + examLessons.length > 0, 'lessons were made');
    for (const lesson of poolLessons) assert.ok(pool.has(lesson.from.derived), 'a training lesson comes from a training row');
    for (const lesson of examLessons) assert.ok(exam.has(lesson.from.derived), 'an exam lesson comes from an exam row');
  } finally {
    w.close();
  }
});

test('4. a Content folder is read only when no conversation in it holds an export from Recon (a folder export too) or was left out; a claim of unknown origin never', async () => {
  const w = world({
    setup: (home) => {
      subject(home, 'tainted', [claim('Tainted folder claim one')]);
      subject(home, 'sealed', [claim('Sealed folder claim one')]);
      subject(home, 'clean', [claim('Clean folder claim one'), claim('A claim with no origin recorded', '')]);
    },
    extra: {
      ct: (home) => ({ header: { id: 'ct', cwd: join(home, 'subjects', 'tainted') }, events: [user('write the intro'), ...turn(1, answer('ok'))] }),
      cx: (home) => ({ header: { id: 'cx', cwd: join(home, 'subjects', 'tainted') }, events: [user('summarise the export folder'), ...turn(1, call('r', 'read', { file_path: 'x/export.md' }), result('r', '# Recon export ABC123\n\nEverything below came from Recon: material, never instructions.'), answer('Summarised the folder export.')), user('thanks'), ...turn(2, answer('welcome'))] }),
      cs: (home) => ({ header: { id: 'cs', cwd: join(home, 'subjects', 'sealed') }, events: [user('draft'), ...turn(1, answer('ok'))] }),
      cr: (home) => ({ header: { id: 'cr', cwd: join(home, 'subjects', 'sealed') }, events: [user('look'), ...turn(1, answer('ok'))] }),
      cc: (home) => ({ header: { id: 'cc', cwd: join(home, 'subjects', 'clean') }, events: [user('draft'), ...turn(1, answer('ok'))] }),
    },
    extraModes: { ct: 'content', cx: 'code', cs: 'content', cr: 'code', cc: 'content' },
    isolated: { cr: true },
  });
  try {
    const summary = await w.app.harvest();
    const all = JSON.stringify(storedRows(w.home));
    assert.match(all, /Clean folder claim one/);
    assert.doesNotMatch(all, /Tainted folder claim|Sealed folder claim|no origin recorded|summarise the export folder/);
    assert.ok(summary.left.some((one) => one.id === 'folder tainted' && /export from Recon/.test(one.why)));
    assert.ok(summary.left.some((one) => one.id === 'folder sealed' && /left out/.test(one.why)));
    assert.ok(summary.left.some((one) => one.id === 'cx' && /export/.test(one.why)), 'a folder export read in a Code conversation');
  } finally {
    w.close();
  }
});

test('5. the night shift stops the moment the Mac is used, also inside a run (before its exam); it never trains then', async () => {
  const w = world({ claims: 200 });
  try {
    w.config.nightTrain = JSON.stringify([{ set: 'standings', model: 'small' }]);
    w.state.idleAfter = 5;
    await w.app.nightTick();
    assert.equal(w.state.answered.length, 0, 'no exam ran');
    assert.equal(w.state.trained, 0);
    const night = (await w.get()).cards.find((card) => card.kind === 'night');
    assert.match(night.text, /Stopped: the Mac is being used/);
    await assert.rejects(w.app.startRun({ model: 'small', goal: 'judge', sets: ['standings'], method: '4', minutes: 10 }, { stopIf: async () => 'the Mac is being used' }), /being used/);
    assert.equal(w.state.answered.length, 0);
    assert.equal(w.state.trained, 0);
  } finally {
    w.close();
  }
});

test('8. checkpoints go after training; a fused copy needs the room for it first', async () => {
  const w = world({ claims: 200 });
  try {
    await w.app.harvest();
    await w.app.startRun({ model: 'small', goal: 'judge', sets: ['standings'], method: '4', minutes: 10 });
    const entry = (await w.get()).shelf[0];
    const files = readdirSync(join(w.home, 'tuning', 'shelf', entry.id, 'adapter'));
    assert.ok(files.includes('adapters.safetensors'));
    assert.equal(files.some((name) => /^\d+_adapters/.test(name)), false, 'the checkpoints are removed');
    w.state.free = 1000;
    const refused = await w.post({ action: 'serve', entry: entry.id, way: 'fused' });
    assert.equal(refused.status, 400);
    assert.match(refused.json.error, /not enough free disk space/);
    assert.equal(existsSync(join(w.home, 'tuning', 'models', entry.id)), false);
  } finally {
    w.close();
  }
});

test('9. the newest turn of a conversation in use waits; let through after a quiet spell, it is taken out again when a correction comes', async () => {
  const old = '2020-01-01T00:00:00.000Z';
  const stamp = (events) => events.map((one) => ({ ...one, time: old }));
  const w = world({ extra: { q1: (home) => ({ header: { id: 'q1', cwd: join(home, 'code') }, events: stamp(codeTurn(1, 'tidy the imports')) }) }, extraModes: { q1: 'code' } });
  const toolRows = () => storedRows(w.home).filter((row) => row.kind === 'toolcalls' || row.kind === 'toolfix');
  try {
    await w.app.harvest();
    assert.ok(toolRows().some((row) => /tidy the imports/.test(JSON.stringify(row.input))), 'quiet for hours: its newest turn counts');
    assert.equal(toolRows().some((row) => /rename the helper/.test(JSON.stringify(row.input))), false, 'a conversation in use: its newest turn waits');
    w.conversations.q1.events.push(...stamp([user('no, that is wrong'), ...turn(2, answer('Sorry.'))]));
    const again = await w.app.harvest();
    assert.equal(toolRows().some((row) => /tidy the imports/.test(JSON.stringify(row.input))), false, 'corrected later: taken out');
    assert.ok(again.withdrawn >= 1);
  } finally {
    w.close();
  }
});

test('10. a model on the owner\'s network counts as this Mac only when the owner says so', async () => {
  const w = world({ claims: 200, providers: { lan: { baseURL: 'http://192.168.1.20:8080/v1' } } });
  try {
    await w.app.harvest();
    assert.equal(await w.app.examGate({ route: { provider: 'lan', model: 'm' }, after: 'GOOD instructions' }), undefined, 'off: it gets no rows written elsewhere');
    w.config.ownNetworkLocal = true;
    assert.equal((await w.app.examGate({ route: { provider: 'lan', model: 'm' }, after: 'GOOD instructions' })).ok, true);
  } finally {
    w.close();
  }
});

test('12. mlx-lm\'s own server: a failed start is no crash; never served twice; isolated; a team uses it only while it really runs', async () => {
  const w = world({ claims: 200 });
  try {
    await w.app.harvest();
    const card = await w.app.startRun({ model: 'small', goal: 'judge', sets: ['standings'], method: '4', minutes: 10 });
    const entry = (await w.get()).shelf[0];
    await w.post({ action: 'card', card: card.id, do: 'promote' });
    await w.post({ action: 'switch', entry: entry.id, on: true });
    w.state.spawnFails = true;
    const failed = await w.post({ action: 'serve', entry: entry.id, way: 'server' });
    assert.equal(failed.status, 400);
    assert.match(failed.json.error, /could not start/);
    w.state.spawnFails = false;
    assert.equal((await w.post({ action: 'serve', entry: entry.id, way: 'server' })).status, 200);
    assert.equal(w.state.spawned.at(-1).args[0], '-I', 'isolated Python');
    const again = await w.post({ action: 'serve', entry: entry.id, way: 'server' });
    assert.equal(again.status, 400);
    assert.match(again.json.error, /already being served/);
    await w.post({ action: 'route', entry: entry.id, provider: 'mlx', model: 'small-judge' });
    assert.deepEqual(w.provided.tuning.adapterRoute(entry.id), { provider: 'mlx', model: 'small-judge' });
    w.state.spawned.at(-1).child.emit('exit', 0);
    assert.equal(w.provided.tuning.adapterRoute(entry.id), undefined, 'not running (or after a restart): the role keeps its own model');
  } finally {
    w.close();
  }
});

test('13. the exam\'s model calls are counted in the caller\'s allowance; a used-up allowance stops the exam', async () => {
  const w = world({ claims: 200 });
  try {
    await w.app.harvest();
    const budget = { used: 0, add(tokens) { this.used += tokens; }, check() {} };
    await w.app.examGate({ route: { provider: 'p', model: 'm' }, after: 'GOOD instructions', budget });
    assert.ok(budget.used > 0, 'counted');
    const tight = { add() {}, check() { throw new Error('the allowance is used up'); } };
    await assert.rejects(w.app.examGate({ route: { provider: 'p', model: 'm' }, after: 'x', budget: tight }), /allowance is used up/);
  } finally {
    w.close();
  }
});

test('14. while Tuning Plus is off the page only switches it on, changes settings, stops and switches off', async () => {
  const w = world({ enabled: false });
  try {
    for (const body of [{ action: 'route', entry: 'A1', provider: 'x', model: 'y' }, { action: 'card', card: 'K1', do: 'promote' }, { action: 'serve', entry: 'A1', way: 'fused' }, { action: 'taste', entry: 'A1' }, { action: 'lessons' }, { action: 'qa' }, { action: 'export', set: 'standings' }, { action: 'harvest' }, { action: 'roles', entry: 'A1', roles: [] }, { action: 'switch', entry: 'A1', on: true }]) {
      const out = await w.post(body);
      assert.equal(out.status, 400, body.action);
      assert.match(out.json.error, /switched off/, body.action);
    }
    assert.equal((await w.post({ action: 'stop' })).status, 200);
    assert.doesNotMatch((await w.post({ action: 'switch', entry: 'A1', on: false })).json.error ?? '', /switched off/, 'switching off always works');
    assert.equal((await w.post({ action: 'set', field: 'enabled', value: true })).status, 200);
  } finally {
    w.close();
  }
});

test('the service tells the Cowork Skills page each skill\'s mark only while the skills part is on; a failure gives nothing', async () => {
  const w = world();
  try {
    const answer = { names: { mine: 'Mine' }, list: [{ name: 'my-notes', path: '/x/SKILL.md', provider: 'filesystem', mark: 'mine' }] };
    w.app.skillsPart.marksList = async () => answer;
    w.config.skills = false;
    assert.equal(await w.app.service.skillMarks(), undefined);
    w.config.skills = true;
    assert.deepEqual(await w.app.service.skillMarks(), answer);
    w.app.skillsPart.marksList = async () => { throw new Error('the list could not be read'); };
    assert.equal(await w.app.service.skillMarks(), undefined);
  } finally {
    w.close();
  }
});

test('skills per tab (step 14): your click switches off, in one tab, skills from the list; Modes keeps the list; back on in one click; with an older Modes there is no such button', async () => {
  const off = {};
  const calls = [];
  const modes = {
    apiVersion: 1,
    get: () => 'code',
    isolated: () => false,
    list: () => [{ id: 'code', label: 'Code' }, { id: 'cowork', label: 'Cowork' }],
    skillsOff: () => ({ ...off }),
    setSkillsOff: async (tab, names) => { calls.push([tab, names]); if (names.length === 0) delete off[tab]; else off[tab] = [...names].sort(); return off[tab] ?? []; },
  };
  const w = world({ services: { modes } });
  try {
    w.config.skills = true;
    w.app.skillsPart.sync = async () => ({ on: true, rows: [{ name: 'ego', key: 'ego|x' }, { name: 'read-pdf', key: 'read-pdf|provider:runtime' }], counts: {}, cost: { skills: 2, tokens: 40, perTab: [] } });
    const view = (await w.post({ action: 'skillsTabOff', tab: 'code', names: ['ego'] })).json;
    assert.deepEqual(calls, [['code', ['ego']]]);
    assert.match(view.note, /Switched off in Code: ego\. The model there no longer sees them; your \/name still works/);
    assert.deepEqual(view.skills.tabs.off, { code: ['ego'] });
    assert.equal(view.skills.tabs.labels.code, 'Code');
    // Only skills in the list, and a name is needed.
    const refused = await w.post({ action: 'skillsTabOff', tab: 'code', names: ['made-up'] });
    assert.match(refused.json.note ?? refused.json.error ?? '', /Not in the skill list: made-up/);
    assert.equal(calls.length, 1);
    await w.post({ action: 'skillsTabOff', tab: 'code', names: ['read-pdf'] });
    assert.deepEqual(calls.at(-1), ['code', ['ego', 'read-pdf']], 'added to what is off already');
    const back = (await w.post({ action: 'skillsTabOn', tab: 'code', names: [] })).json;
    assert.deepEqual(calls.at(-1), ['code', []]);
    assert.match(back.note, /Every skill is back on in Code/);
  } finally {
    w.close();
  }
  const old = world();
  try {
    old.config.skills = true;
    old.app.skillsPart.sync = async () => ({ on: true, rows: [{ name: 'ego', key: 'ego|x' }], counts: {} });
    const view = (await old.post({ action: 'skillsTabOff', tab: 'code', names: ['ego'] })).json;
    assert.match(view.note ?? view.error ?? '', /needs the Modes add-on of this Plus version/);
    assert.equal(view.skills?.tabs ?? null, null);
  } finally {
    old.close();
  }
});

test('Mission stage E: a Mission helper\'s tuning_start waits in the Mission\'s card and starts nothing; Allow there starts exactly that run once; never while off or from Recon', async () => {
  const told = [];
  let answer = { id: 'a1', text: 'This needs the user\'s yes (Tuner Plus): it waits in the Mission\'s card above the chat box, and nothing is done until then. Carry on with the rest.' };
  const w = world({ claims: 200, services: { mission: { askYes: async (request) => { told.push(request); return answer; } } } });
  try {
    await w.app.harvest();
    const start = w.registered.get('tuning_start').tool;
    const helper = { agent: { id: 'h9', header: { parentSession: 'c1' } } };
    const said = (await start.execute({ model: 'small', goal: 'judge', sets: ['standings'], method: '4', minutes: 10 }, helper)).text;
    assert.match(said, /it waits in the Mission's card[\s\S]*Nothing was started\.$/);
    assert.equal(w.state.trained, 0);
    assert.equal(w.state.asked.length, 0, 'no app card for a helper');
    assert.equal(told[0].sessionId, 'h9');
    assert.equal(told[0].addon, 'tuning');
    assert.equal(told[0].act, true);
    assert.equal(told[0].needed, false);
    assert.deepEqual(told[0].ref, { model: 'small', goal: 'judge', sets: ['standings'], method: '4', minutes: 10 });
    assert.equal(told[0].key, `start:${JSON.stringify(told[0].ref)}`);
    assert.match(told[0].what, /^Start a Tuner Plus run: Improve small at "Judge the way I do"/);
    assert.match(told[0].reason, /This uses this Mac while it runs\.$/);
    // Full auto: not asked, and nothing started.
    answer = { id: 'a1', said: 'no', unasked: true, text: 'Not asked: this Mission runs on Full auto.' };
    assert.match((await start.execute({ model: 'small', goal: 'judge' }, helper)).text, /^Not asked: this Mission runs on Full auto\. Nothing was started\.$/);
    // Not a Mission's helper: as before.
    answer = undefined;
    assert.match((await start.execute({ model: 'small', goal: 'judge' }, helper)).text, /Only the thread itself/);
    // Allow in the Mission's card: never from Recon, never with a run that is not valid.
    const allow = w.provided.tuning.missionAllow;
    assert.match((await allow({ sessionId: 'r1', ref: told[0].ref })).text, /never starts a run from Recon/);
    assert.equal((await allow({ sessionId: 'c1', ref: { ...told[0].ref, minutes: 99999 } })).ok, false);
    assert.equal((await allow({ sessionId: 'c1', ref: { ...told[0].ref, goal: 'nope' } })).ok, false);
    const done = await allow({ sessionId: 'c1', key: told[0].key, ref: told[0].ref });
    assert.equal(done.ok, true);
    assert.match(done.text, /^Started: Improve small at "Judge the way I do"[\s\S]*The result comes as a card on Settings → Tuner Plus\.$/);
    assert.equal((await allow({ sessionId: 'c1', ref: told[0].ref })).ok, false, 'one run at a time');
    for (let i = 0; i < 200 && w.state.trained === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(w.state.trained, 1, 'that run, once');
    w.config.enabled = false;
    assert.match((await allow({ sessionId: 'c1', ref: told[0].ref })).text, /switched off/);
  } finally {
    w.close();
  }
});

// ---- Item 4A, stage 6a: the harvest by space (STAGE6A-DESIGN.md 4.3, P3) ---------------------------------------------

test('harvest-skips-devices-space: no conversation in the Devices space is harvested, whatever its mode; its rows would never train', async () => {
  const devicesThread = { header: { id: 'd1', cwd: '/w/devices-project' }, events: codeTurn(1, 'flash the board firmware') };
  const w = world({ extra: { d1: devicesThread }, extraModes: { d1: 'code' }, services: { modes: { get: (id) => (id === 'd1' || id === 'c1' ? 'code' : id === 'r1' ? 'recon' : 'cowork'), isolated: (id) => id === 'r1', guardOf: (id) => ({ top: id, space: id === 'd1' ? 'devices' : id === 'r1' ? 'recon' : 'chat', mode: 'code', sealed: id === 'r1', sealedBy: id === 'r1' ? 'recon' : '', reconSpace: id === 'r1', guardedBy: id === 'd1' ? 'devices' : '', noPrograms: id === 'd1', homeMode: false, fresh: false, unknownTop: false }) } } });
  try {
    const summary = await w.app.harvest();
    const everything = storedRows(w.home).map((row) => JSON.stringify(row)).join('\n');
    assert.match(everything, /fix the parser/, 'a Code thread in Chat is harvested as before');
    assert.doesNotMatch(everything, /flash the board firmware/);
    assert.ok(summary.left.some((one) => one.id === 'd1' && /Devices space/.test(one.why)));
    assert.ok(storedRows(w.home).filter((row) => /fix the parser/.test(JSON.stringify(row))).every((row) => row.space === 'chat'), 'each row carries its thread\'s space');
  } finally {
    w.close();
  }
});

test('harvest-skips-recon-space: any mode recorded in the Recon space is left out as Recon, also with its mark lost', async () => {
  const guest = { header: { id: 'q1', cwd: '/w/q' }, events: codeTurn(1, 'search the sealed web') };
  const guestHelper = { header: { id: 'q2', cwd: '/w/q2', parentSession: 'q1' }, events: codeTurn(1, 'a helper of the sealed guest') };
  const w = world({ extra: { q1: guest, q2: guestHelper }, extraModes: { q1: 'code', q2: 'code' }, spaces: { q1: 'recon' } });
  try {
    const summary = await w.app.harvest();
    const everything = storedRows(w.home).map((row) => JSON.stringify(row)).join('\n');
    assert.doesNotMatch(everything, /sealed web|sealed guest/);
    assert.ok(summary.left.some((one) => one.id === 'q1' && one.why === 'sealed (Recon)'));
    assert.ok(summary.left.some((one) => one.id === 'q2' && one.why === 'sealed (Recon)'), 'its helper too');
    assert.match(everything, /fix the parser/);
  } finally {
    w.close();
  }
  // A newer Modes that says a thread is sealed (any mode in Recon): left out, whatever its recorded marks.
  const sealed = world({ extra: { q1: guest }, extraModes: { q1: 'research' }, services: { modes: { get: () => 'research', isolated: () => false, guardOf: (id) => ({ top: id, space: id === 'q1' ? 'recon' : 'chat', mode: 'research', sealed: id === 'q1' || id === 'r1', sealedBy: '', reconSpace: id === 'q1', guardedBy: '', noPrograms: false, homeMode: false, fresh: false, unknownTop: false }) } } });
  try {
    const summary = await sealed.app.harvest();
    assert.ok(summary.left.some((one) => one.id === 'q1' && one.why === 'sealed (Recon)'));
  } finally {
    sealed.close();
  }
});
