/**
 * Stage E, point 8: what the conversation's own assistant may do while its Mission is paused ("While a Mission runs, the
 * assistant can": Talk and look things up, the default, or Only talk). Each test fails on the code before stage E.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GIT_CANDIDATES } from '../lib/checkpoints.js';
import { ASSISTANT_NOTE, LOOK_ONLY, LOOK_PROGRAM, LOOK_WORKING_NOTE, TALK_ONLY, TALK_PROGRAM, assistantRefusal, readAssistant, stepOnlyProgram } from '../lib/assistant.js';
import { DISARM_SETTLE_MS, readSettings } from '../index.js';
import { appHarness, tick } from './app-harness.mjs';

const hasGit = GIT_CANDIDATES.some((path) => existsSync(path));

test('the rule: Only talk refuses every tool but the Mission\'s step and a question; Talk and look things up allows reading and searching only', () => {
  assert.equal(readAssistant('talk'), 'talk');
  assert.equal(readAssistant('anything'), 'look');
  assert.equal(readSettings({}).long.assistant, 'look', 'the default');
  assert.equal(readSettings({ longAssistant: 'talk' }).long.assistant, 'talk');
  assert.equal(readSettings({}).long.carryOn, true);
  for (const name of ['mission_step', 'ask_user_question']) assert.equal(assistantRefusal({ choice: 'talk', name }), '', name);
  for (const name of ['read', 'web_search']) assert.equal(assistantRefusal({ choice: 'talk', name }), TALK_ONLY, name);
  for (const name of ['read', 'grep', 'web_fetch', 'diagram_draw', 'skill']) assert.equal(assistantRefusal({ choice: 'look', name }), '', name);
  for (const name of ['write', 'edit', 'bash', 'request_tool_access', 'mission_request_files', 'create_goal', 'todo_write', 'schedule_create', 'remember', 'subagent', 'deep_research', 'anything_unknown']) assert.equal(assistantRefusal({ choice: 'look', name }), LOOK_ONLY, name);
  // With Modes' sorting: tier 0 and 1 of the reading groups only.
  assert.equal(assistantRefusal({ choice: 'look', name: 'pdf_read', kind: { group: 'read', tier: 1, sorted: true } }), '');
  assert.equal(assistantRefusal({ choice: 'look', name: 'mcp__mail__send', kind: { group: 'accounts', tier: 3, sorted: true } }), LOOK_ONLY);
  assert.equal(assistantRefusal({ choice: 'look', name: 'office_make', kind: { group: 'change', tier: 2, sorted: true } }), LOOK_ONLY);
  assert.equal(assistantRefusal({ choice: 'look', name: 'new_tool', kind: { group: 'unsorted', tier: 3, sorted: false } }), LOOK_ONLY);
  // Review of stage E: a program can change files and run commands by itself, so with look only a program whose whole
  // code is the Mission's step runs (also in the PTC preset); Recon's own reading tools in Recon.
  assert.equal(assistantRefusal({ choice: 'look', name: 'run_code', viaProgram: true }), LOOK_PROGRAM);
  assert.equal(assistantRefusal({ choice: 'look', name: 'run_code', args: { code: "const fs = await import('node:fs/promises'); await fs.writeFile('src/app.js', 'x')" } }), LOOK_PROGRAM);
  assert.equal(assistantRefusal({ choice: 'look', name: 'run_code', args: { code: "return (await import('node:child_process')).execSync('rm -rf build')" } }), LOOK_PROGRAM);
  assert.equal(assistantRefusal({ choice: 'look', name: 'run_code', args: { code: 'return await tools.mission_step({})' } }), '');
  assert.equal(assistantRefusal({ choice: 'look', name: 'run_code', args: { code: 'await tools.mission_step({}); return await tools.write({})' } }), LOOK_PROGRAM);
  assert.equal(assistantRefusal({ choice: 'look', name: 'run_code' }), LOOK_PROGRAM);
  // Review of stage E: tools Modes sorts as reading that save something are refused with look.
  for (const [name, group] of [['scout_profile', 'web'], ['scout_report', 'web'], ['data_chart', 'read'], ['learn_mark', 'read'], ['learn_plan', 'read'], ['finance_profile_save', 'read'], ['pdf_page_image', 'read'], ['library_save', 'read']]) assert.equal(assistantRefusal({ choice: 'look', name, kind: { group, tier: 1, sorted: true } }), LOOK_ONLY, name);
  for (const [name, group] of [['scout_reports', 'web'], ['scout_search', 'web'], ['data_profile', 'read'], ['data_query', 'read'], ['learn_status', 'read'], ['read_image', 'read']]) assert.equal(assistantRefusal({ choice: 'look', name, kind: { group, tier: name === 'read_image' ? 0 : 1, sorted: true } }), '', name);
  // Review of stage E: while it works, reading and searching only (no question to the user), and Only talk keeps to the step.
  assert.equal(assistantRefusal({ choice: 'look', name: 'read', working: true }), '');
  assert.equal(assistantRefusal({ choice: 'look', name: 'mission_step', working: true }), '');
  assert.notEqual(assistantRefusal({ choice: 'look', name: 'ask_user_question', working: true }), '');
  assert.notEqual(assistantRefusal({ choice: 'look', name: 'write', working: true }), '');
  assert.notEqual(assistantRefusal({ choice: 'talk', name: 'read', working: true }), '');
  assert.equal(assistantRefusal({ choice: 'talk', name: 'mission_step', working: true }), '');
  assert.equal(assistantRefusal({ choice: 'look', name: 'recon_web_search', isolated: true }), '');
  assert.equal(assistantRefusal({ choice: 'look', name: 'recon_cite', isolated: true }), '');
  assert.equal(assistantRefusal({ choice: 'look', name: 'web_search', isolated: true }), LOOK_ONLY);
  assert.match(ASSISTANT_NOTE.talk('g'), /Talk with the user and use no tools/);
  assert.match(ASSISTANT_NOTE.look('g'), /You may read files and search, also the web, to answer; change no files, run no commands and start no helpers/);
});

test('while a Mission is paused: the conversation\'s own assistant only looks things up (or only talks), also before mission_request_files; helpers and a working Mission are not affected', { skip: !hasGit }, async () => {
  const kinds = { read: { group: 'read', tier: 1, sorted: true }, write: { group: 'change', tier: 2, sorted: true } };
  const app = appHarness({ config: { longHelpers: 1 } });
  app.services.modes.toolKind = (name) => kinds[name];
  try {
    const agent = app.open('c');
    await app.card({ sessionId: 'c', action: 'start', goal: 'make two small things for me', mode: 'auto' });
    await app.step(agent);
    const call = (name, who = agent) => app.chain('tools/pre-execute', { agent: who, name, callId: `${name}-${Math.random()}`, arguments: { path: join(agent.header.cwd, 'a.txt') }, signal: new AbortController().signal });
    // Working (review of stage E): Talk and look things up reads and searches, and keeps the step; anything else meets the
    // conductor guard as before.
    assert.equal((await call('read')).kind, 'allow', 'reads while the Mission works');
    assert.match((await call('write')).reason ?? '', /A mission run is on in this thread/);
    assert.match((await call('bash')).reason ?? '', /A mission run is on in this thread/);
    // Second review pass: asking for file changes is neither talking nor looking, so it meets the conductor guard too.
    const before = app.ledger.length;
    assert.match((await call('mission_request_files')).reason ?? '', /A mission run is on in this thread/);
    assert.ok(app.ledger.slice(before).some(([outcome, rule]) => outcome === 'refused' && rule === 'mission-conductor'));
    await app.card({ sessionId: 'c', action: 'pause' });
    assert.equal((await call('read')).kind, 'allow', 'Talk and look things up (the default) reads');
    const refused = await call('write');
    assert.deepEqual([refused.kind, refused.reason], ['deny', LOOK_ONLY]);
    assert.deepEqual((await call('mission_request_files')).reason, LOOK_ONLY, 'before its own early return');
    assert.ok(app.ledger.some(([outcome, rule]) => outcome === 'refused' && rule === 'mission-assistant'));
    assert.match(app.provided.mission.view('c').assistant, /^look$/);
    // Saved while the Mission is on: it applies at once, and says so.
    const saved = await app.card({ sessionId: 'c', action: 'save', assistant: 'talk', carryOn: false });
    assert.match(saved.json.said, /apply to the Mission that is on now too/);
    assert.deepEqual([saved.json.saved.assistant, saved.json.saved.carryOn, saved.json.run.assistant, saved.json.run.carryOn], ['talk', false, 'talk', false]);
    assert.equal((await call('read')).reason, TALK_ONLY);
    assert.equal((await call('mission_step')).kind, 'allow');
    const bad = await app.card({ sessionId: 'c', action: 'save', assistant: 'everything' });
    assert.deepEqual([bad.status, bad.json.error], [400, 'Pick Only talk or Talk and look things up.']);
    // The conversation's model is told what it may do (the rules section).
    assert.match(app.provided.mission.view('c').stalled ?? '', /^$/);
  } finally {
    app.done();
  }
});

test('the note while paused: the conversation\'s model is told to only talk (or look things up), not the conductor\'s rules', { skip: !hasGit }, async () => {
  const sections = [];
  const app = appHarness({ config: { longHelpers: 1, longAssistant: 'talk' } });
  try {
    const agent = app.open('c');
    agent.ctx = { effect: (start) => start(), systemPrompt: { section: (spec) => { sections.push(spec); return () => {}; } } };
    for (const handler of app.handlers.get('agent/created') ?? []) handler({ agent });
    await app.card({ sessionId: 'c', action: 'start', goal: 'make two small things for me', mode: 'auto' });
    await app.step(agent);
    const rules = () => sections.find((spec) => spec.name === 'mission:rules').text();
    assert.match(rules(), /You are the conductor/);
    await app.card({ sessionId: 'c', action: 'pause' });
    await tick();
    assert.match(rules(), /A Mission is on in this thread and is paused \(goal: make two small things for me\)\. Talk with the user and use no tools\./);
    assert.doesNotMatch(rules(), /You are the conductor/);
  } finally {
    app.done();
  }
});

test('review of stage E: stopped by a problem (the app stopped giving rounds: its goal active but disarmed): the assistant rule applies, the conductor note is not given, and mission_step does not carry it on', { skip: !hasGit }, async () => {
  const sections = [];
  const app = appHarness({ config: { longHelpers: 1 } });
  app.services.modes.toolKind = (name) => ({ read: { group: 'read', tier: 1, sorted: true }, write: { group: 'change', tier: 2, sorted: true } })[name];
  try {
    const agent = app.open('c');
    agent.ctx = { effect: (start) => start(), systemPrompt: { section: (spec) => { sections.push(spec); return () => {}; } } };
    for (const handler of app.handlers.get('agent/created') ?? []) handler({ agent });
    await app.card({ sessionId: 'c', action: 'start', goal: 'make two small things for me', mode: 'auto', retry: false });
    await app.step(agent);
    const rules = () => sections.find((spec) => spec.name === 'mission:rules').text();
    assert.match(rules(), /You are the conductor/);
    assert.match(rules(), new RegExp(LOOK_WORKING_NOTE.slice(0, 40)), 'with Talk and look things up the conductor may read to answer');
    // The app stops giving rounds (a failed request): the goal stays active, disarmed; the watchdog marks it stopped.
    await new Promise((resolve) => setTimeout(resolve, 3100));
    const goal = app.goals.get('c');
    goal.activation = 'disarmed';
    app.emit('goal/activation-changed', { sessionId: 'c', goal: { id: goal.id, revision: 1, activation: 'disarmed' } });
    await new Promise((resolve) => setTimeout(resolve, DISARM_SETTLE_MS + 50));
    const run = app.provided.mission.view('c');
    assert.deepEqual([app.runner().view('c').pausedBy, /^Stopped by itself/.test(app.runner().view('c').stalled)], ['problem', true], 'marked stopped by the watchdog');
    assert.equal(goal.phase, 'active');
    const call = (name, args = { path: join(agent.header.cwd, 'a.txt') }) => app.chain('tools/pre-execute', { agent, name, callId: `${name}-${Math.random()}`, arguments: args, signal: new AbortController().signal });
    assert.equal((await call('read')).kind, 'allow', 'Talk and look things up reads');
    assert.deepEqual((await call('write')).reason, LOOK_ONLY);
    assert.equal((await call('run_code', { code: "await (await import('node:fs/promises')).writeFile('x', 'y')" })).reason, LOOK_PROGRAM);
    await tick();
    assert.match(rules(), /A Mission is on in this thread and is paused/);
    const said = await app.step(agent);
    assert.match(said.text ?? '', /^The run is paused/);
    assert.equal(app.runner().view('c').pausedBy, 'problem', 'still paused: only Resume carries it on');
    assert.ok(run.id);
    await app.card({ sessionId: 'c', action: 'save', assistant: 'talk' });
    assert.equal((await call('read')).reason, TALK_ONLY);
  } finally {
    app.done();
  }
});

const STEP = { code: 'return await tools.mission_step({})' };
const WRITES = { code: "await (await import('node:fs/promises')).writeFile('src/app.js', 'x'); return await tools.mission_step({})" };

test('item 7, the rule: while a Mission works with Only talk, only the step program runs under PTC; with Talk and look things up every program goes on to the conductor guard (the accepted gap); paused as before', () => {
  assert.equal(stepOnlyProgram(STEP), true);
  assert.equal(stepOnlyProgram({ code: 'await tools.mission_step();' }), true);
  assert.equal(stepOnlyProgram(WRITES), false);
  assert.equal(stepOnlyProgram(undefined), false);
  // Working + Only talk: the step program runs, any other program gets a plain refusal that says what to do.
  assert.equal(assistantRefusal({ choice: 'talk', name: 'run_code', args: STEP, working: true }), '');
  assert.equal(assistantRefusal({ choice: 'talk', name: 'run_code', args: WRITES, working: true }), TALK_PROGRAM);
  assert.equal(assistantRefusal({ choice: 'talk', name: 'run_code', working: true }), TALK_PROGRAM);
  assert.match(TALK_PROGRAM, /return await tools\.mission_step\(\{\}\)/);
  assert.match(TALK_PROGRAM, /was not run/);
  assert.equal(assistantRefusal({ choice: 'talk', name: 'read', working: true }), TALK_ONLY, 'other tools as before');
  // Paused, as before: Only talk runs no program at all (the step only says the run is paused); look runs the step only.
  assert.equal(assistantRefusal({ choice: 'talk', name: 'run_code', args: STEP }), TALK_ONLY);
  assert.equal(assistantRefusal({ choice: 'talk', name: 'run_code', args: WRITES }), TALK_ONLY);
  assert.equal(assistantRefusal({ choice: 'look', name: 'run_code', args: STEP }), '');
  assert.equal(assistantRefusal({ choice: 'look', name: 'run_code', args: WRITES }), LOOK_PROGRAM);
});

test('item 7, in the conductor: working + Talk and look things up lets programs through (as today); working + Only talk runs only the step program; paused as before', { skip: !hasGit }, async () => {
  const app = appHarness({ config: { longHelpers: 1 } });
  app.services.modes.toolKind = (name) => ({ read: { group: 'read', tier: 1, sorted: true } })[name];
  try {
    const agent = app.open('c');
    await app.card({ sessionId: 'c', action: 'start', goal: 'make two small things for me', mode: 'auto' });
    await app.step(agent);
    const program = (args) => app.chain('tools/pre-execute', { agent, name: 'run_code', callId: `run_code-${Math.random()}`, arguments: args, signal: new AbortController().signal });
    // Working + Talk and look things up (the default): every program is let through; its tools are judged one by one.
    assert.equal((await program(STEP)).kind, 'allow', 'look: the step program');
    assert.equal((await program(WRITES)).kind, 'allow', 'look: another program (the gap the owner accepted)');
    // Working + Only talk: only the step program.
    await app.card({ sessionId: 'c', action: 'save', assistant: 'talk' });
    assert.equal((await program(STEP)).kind, 'allow', 'talk: the step program');
    const before = app.ledger.length;
    const refused = await program(WRITES);
    assert.deepEqual([refused.kind, refused.reason], ['deny', TALK_PROGRAM]);
    assert.deepEqual([(await program({ code: 'return 1' })).reason], [TALK_PROGRAM]);
    assert.ok(app.ledger.slice(before).some(([outcome, rule]) => outcome === 'refused' && rule === 'mission-assistant'));
    // The step itself (called from inside the program) and other tools: as before.
    assert.equal((await app.chain('tools/pre-execute', { agent, name: 'mission_step', callId: 'step-1', arguments: {}, signal: new AbortController().signal })).kind, 'allow');
    assert.match((await app.chain('tools/pre-execute', { agent, name: 'write', callId: 'write-1', arguments: { path: join(agent.header.cwd, 'a.txt') }, signal: new AbortController().signal })).reason ?? '', /A mission run is on in this thread/);
    // Paused: as before.
    await app.card({ sessionId: 'c', action: 'pause' });
    assert.equal((await program(STEP)).reason, TALK_ONLY, 'paused + talk: no program');
    assert.equal((await program(WRITES)).reason, TALK_ONLY);
    await app.card({ sessionId: 'c', action: 'save', assistant: 'look' });
    assert.equal((await program(STEP)).kind, 'allow', 'paused + look: the step program');
    assert.equal((await program(WRITES)).reason, LOOK_PROGRAM);
  } finally {
    app.done();
  }
});
