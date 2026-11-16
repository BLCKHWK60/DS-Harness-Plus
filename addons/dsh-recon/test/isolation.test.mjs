/**
 * What Recon found stays where it may go: no step sends a conversation holding findings to a model
 * the user did not agree to, and no mention of another conversation crosses into or out of an
 * isolated one. No network; the app's own services are stand-ins.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEFT_OUT, dropMentions, mentionedId, withoutMentions } from '../lib/mentions.js';
import { SUMMARY_MARK, holdsFindings, wasCompacted } from '../lib/tools.js';
import { loadRecon } from './fixtures/room.mjs';

// Never the real room: apply() empties it.
const { apply, Config, ROOM } = await loadRecon();

const uriOf = (id) => `dsh-session:${Buffer.from(JSON.stringify(id), 'utf8').toString('base64url')}`;

const asked = { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Look into it.' }] };
const call = (id, name = 'recon_onion_search') => ({ role: 'assistant', source: { kind: 'model' }, content: [{ type: 'tool-call', id, name, arguments: '{}' }] });
const answer = (id, text, extra = {}) => ({ role: 'tool', source: { kind: 'tool', callId: id }, toolCallId: id, content: [{ type: 'text', text }], ...extra });

test('a history holds findings only when a recon tool ran and answered', () => {
  assert.equal(holdsFindings(undefined), false);
  assert.equal(holdsFindings([asked]), false);
  assert.equal(holdsFindings([asked, call('c1'), answer('c1', 'Results for "x":\n1. A title')]), true);
  // A refusal holds nothing found, so the model may still tell the user why.
  assert.equal(holdsFindings([asked, call('c1'), answer('c1', 'This conversation uses a cloud model (DeepSeek). What Recon finds would be sent to it.')]), false);
  assert.equal(holdsFindings([asked, call('c1'), answer('c1', 'Recon is switched off in Settings → Recon.')]), false);
  assert.equal(holdsFindings([asked, call('c1'), answer('c1', 'not run', { isError: true })]), false);
  // Another tool's answer is not Recon's.
  assert.equal(holdsFindings([asked, call('c1', 'read_file'), answer('c1', 'file text')]), false);
});

test('mentions of other conversations are taken out as asked', () => {
  const mention = `@[Old research](${uriOf('s-recon')})`;
  assert.equal(mentionedId(uriOf('s-recon')), 's-recon');
  assert.equal(mentionedId('dsh-session:!!'), undefined);
  const text = `Compare ${mention} with ${uriOf('s-plain')} please.`;
  assert.equal(dropMentions(text, (id) => id === 's-recon'), `Compare ${LEFT_OUT} with ${uriOf('s-plain')} please.`);
  assert.equal(dropMentions(text, () => true), `Compare ${LEFT_OUT} with ${LEFT_OUT} please.`);
  assert.equal(dropMentions('no mention here', () => true), 'no mention here');
  const messages = [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] }];
  assert.equal(withoutMentions(messages, () => false), messages, 'nothing to take out leaves the messages as they were');
  assert.doesNotMatch(withoutMentions(messages, () => true)[0].content[0].text, /dsh-session:/);
  // Only what the user wrote is looked at.
  const context = [{ role: 'user', source: { kind: 'context' }, content: [{ type: 'text', text }] }];
  assert.equal(withoutMentions(context, () => true), context);
});

/** Recon on stand-in services, with its pre-step listeners and its command. */
function start({ modeOf = {}, agents = {}, stored = [], memory = new Set(), config = {} } = {}) {
  const listeners = [];
  let command;
  const services = {
    settings: {
      describe: () => [
        { ns: 'modes', value: { extraModes: '{}', sessionIsolated: '{}', defaultMode: 'cowork' } },
        { ns: 'llm-pi-ai', value: { providers: { mine: { baseURL: 'http://localhost:1234/v1', displayName: 'Mine' } } } },
      ],
      mutate: async () => {},
    },
    modes: { get: (id) => modeOf[id]?.mode, isolated: (id) => modeOf[id]?.isolated === true },
    tools: { register: (tool) => { registered[tool.name] = tool; return () => {}; } },
    commands: { register: (spec) => { command = spec; return () => {}; } },
    webServer: { register: () => () => {} },
    connection: { requestRejection: () => undefined },
    sessionPersistence: { list: async () => stored },
    sessions: { get: (id) => (memory.has(id) ? {} : undefined) },
    agents: { get: (id) => agents[id] },
    mission: { endRun: (id) => { ended.push(id); return 'Long run stopped. You ended it.'; } },
    workspaceRegistry: { archiveSession: async () => {} },
  };
  const disposers = [];
  const ended = [];
  const registered = {};
  const provided = {};
  const ctx = {
    ...services,
    logger: { warn: () => {}, info: () => {}, error: () => {} },
    effect: (fn) => { const done = fn(); if (typeof done === 'function') disposers.push(done); },
    get: (name) => services[name],
    inject: (_names, callback) => callback(ctx),
    on: (name, listener) => { if (name === 'agent/pre-step') listeners.push(listener); return () => {}; },
    provide: (name, value) => { provided[name] = value; return () => {}; },
  };
  apply(ctx, Config({ enabled: true, ...config }));
  /** One step, through every pre-step listener in the order the app runs them. */
  const step = (agent, modelSelection, messages = []) => {
    const run = (at) => (at === listeners.length ? Promise.resolve({ kind: 'enter', messages }) : listeners[at]({ agent, modelSelection, messages }, () => run(at + 1)));
    return run(0);
  };
  const say = (agent, rawInput) => command.handler({ agent, rawInput });
  return { step, say, provided, ended, registered, dispose: () => { for (const done of disposers) done(); } };
}

const agentOf = (id, history, model) => ({ id, session: { header: {}, deriveMessages: () => history }, model: { current: () => model } });
const LOCAL = { provider: 'mine', model: 'small' };
const CLOUD = { provider: 'deepseek', model: 'big' };

test('a conversation holding findings takes no step on a cloud model until the user agrees', async () => {
  const app = start({ modeOf: { r1: { mode: 'recon', isolated: true }, copy: { mode: 'isolated-late', isolated: true } } });
  try {
    const history = [asked, call('c1'), answer('c1', 'Results for "x":\n1. A title')];
    const recon = agentOf('r1', history, LOCAL);
    assert.equal((await app.step(recon, LOCAL)).kind, 'enter', 'a local model may have it');
    // The user picks a cloud model in the chat box and sends a message.
    recon.model.current = () => CLOUD;
    await assert.rejects(app.step(recon, CLOUD), /holds what Recon found.*Nothing was sent.*\/recon cloud/s);
    assert.equal((await app.say(recon, 'cloud')).kind, 'success');
    assert.equal((await app.step(recon, CLOUD)).kind, 'enter', 'after /recon cloud it goes');
    // A Rerun copy has another id, so the agreement does not cover it, and it is no longer a Recon conversation.
    const copy = agentOf('copy', history, CLOUD);
    await assert.rejects(app.step(copy, CLOUD), (error) => /holds what Recon found/.test(error.message) && !/\/recon cloud/.test(error.message));
    // A conversation without findings is not held back.
    assert.equal((await app.step(agentOf('plain', [asked], CLOUD), CLOUD)).kind, 'enter');
    // Nor is a Recon conversation whose tool was refused: the model must be able to say why.
    const refused = agentOf('r1', [asked, call('c2'), answer('c2', 'This conversation uses a cloud model (DeepSeek).')], { provider: 'deepseek', model: 'other' });
    assert.equal((await app.step(refused, { provider: 'deepseek', model: 'other' })).kind, 'enter');
  } finally {
    app.dispose();
  }
});

test('no mention crosses into or out of an isolated conversation', async () => {
  const app = start({ modeOf: { r1: { mode: 'recon', isolated: true } } });
  try {
    const text = (messages) => messages[0].content[0].text;
    const wrote = (body) => [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: body }] }];
    const plain = agentOf('plain', [], LOCAL);
    const into = await app.step(plain, LOCAL, wrote(`See @[Research](${uriOf('r1')}) and @[Notes](${uriOf('other')}).`));
    assert.equal(text(into.messages), `See ${LEFT_OUT} and @[Notes](${uriOf('other')}).`, 'only the isolated one is taken out');
    const recon = agentOf('r1', [], LOCAL);
    const out = await app.step(recon, LOCAL, wrote(`Use ${uriOf('other')}.`));
    assert.equal(text(out.messages), `Use ${LEFT_OUT}.`, 'an isolated conversation takes in nothing');
  } finally {
    app.dispose();
  }
});

test('a compacted Recon conversation is still held: after a restart, and in a Rerun copy', async () => {
  // The app's real shape: a user message from a compact-checkpoint source, the summary framed in three blocks.
  const summary = { role: 'user', source: { kind: 'compact-checkpoint', compactionId: 'c-1' }, content: [{ type: 'text', text: `Earlier work was condensed.\n\n${SUMMARY_MARK}` }, { type: 'text', text: 'Recon found a forum post naming x.' }, { type: 'text', text: '</compacted-summary>' }] };
  assert.equal(wasCompacted([summary]), true);
  assert.equal(wasCompacted([{ ...summary, source: { kind: 'user' } }]), true, 'the frame alone is enough');
  assert.equal(wasCompacted([{ role: 'user', source: { kind: 'compact-checkpoint' }, content: [] }]), true, 'the source alone is enough');
  assert.equal(wasCompacted([{ role: 'tool', toolCallId: 'c9', content: [{ type: 'text', text: `a page quoting ${SUMMARY_MARK}` }] }]), false, 'a page that quotes the marker is not a summary');
  assert.equal(wasCompacted([asked]), false);
  assert.equal(wasCompacted(undefined), false);
  const app = start({ modeOf: { r2: { mode: 'recon', isolated: true }, copy2: { mode: 'recon', isolated: true } } });
  try {
    // The tool answers were folded into the summary, so none is left to find.
    const history = [summary, asked];
    assert.equal(holdsFindings(history), false);
    await assert.rejects(app.step(agentOf('r2', history, CLOUD), CLOUD), /holds what Recon found/);
    await assert.rejects(app.step(agentOf('copy2', history, CLOUD), CLOUD), /holds what Recon found/);
    // An ordinary conversation that was compacted is not Recon's business.
    assert.equal((await app.step(agentOf('plain2', history, CLOUD), CLOUD)).kind, 'enter');
    // A fresh Recon conversation with nothing found still talks to the model it was given.
    assert.equal((await app.step(agentOf('r2', [asked], CLOUD), CLOUD)).kind, 'enter');
  } finally {
    app.dispose();
  }
});

test('a Long run\'s helpers in Recon: the conversation\'s agreement covers them, its run has its own folder, and End and wipe takes the run and the helpers\' files', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const sessionsDir = mkdtempSync(join(tmpdir(), 'recon-sessions-'));
  const folderOf = (id) => { const dir = join(sessionsDir, 'project', id); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'session.v4.jsonl'), '{}\n'); return join(dir, 'session.v4.jsonl'); };
  const stored = [
    { header: { id: 'session-r1' }, location: { kind: 'jsonl', path: folderOf('session-r1') } },
    { header: { id: 'helper-plan-1', parentSession: 'session-r1' }, location: { kind: 'jsonl', path: folderOf('helper-plan-1') } },
    { header: { id: 'helper-deep-2', parentSession: 'helper-plan-1' }, location: { kind: 'jsonl', path: folderOf('helper-deep-2') } },
    { header: { id: 'other-helper-3', parentSession: 'session-other' }, location: { kind: 'jsonl', path: folderOf('other-helper-3') } },
  ];
  const history = [asked, call('c1'), answer('c1', 'Results for "x":\n1. A title')];
  const conversation = { id: 'session-r1', header: { cwd: ROOM }, session: { header: { cwd: ROOM }, deriveMessages: () => history }, model: { current: () => CLOUD } };
  const helper = { id: 'helper-plan-1', header: { parentSession: 'session-r1', cwd: ROOM }, session: { header: { parentSession: 'session-r1', cwd: ROOM }, deriveMessages: () => history }, model: { current: () => CLOUD } };
  const app = start({ modeOf: { 'session-r1': { mode: 'recon', isolated: true }, 'helper-plan-1': { mode: 'recon', isolated: true } }, agents: { 'session-r1': conversation, 'helper-plan-1': helper }, stored });
  try {
    // The helper holds findings and runs on a cloud model: not before the user agreed in the conversation.
    await assert.rejects(app.step(helper, CLOUD), /holds what Recon found/);
    // Even a helper with nothing in its history yet: it carries the goal and the plan from its first request.
    const fresh = { id: 'helper-new-9', header: { parentSession: 'session-r1', cwd: ROOM }, session: { header: { parentSession: 'session-r1', cwd: ROOM }, deriveMessages: () => [asked] }, model: { current: () => CLOUD } };
    await assert.rejects(app.step(fresh, CLOUD), /holds what Recon found/);
    assert.equal((await app.say(conversation, 'cloud')).kind, 'success');
    assert.equal((await app.step(helper, CLOUD)).kind, 'enter', 'the conversation\'s agreement covers its helper');
    // Mission's question: may a run happen here, and where does it keep its files.
    assert.equal(app.provided.recon.runs('session-r1'), true);
    assert.equal(app.provided.recon.runs('helper-plan-1'), false, 'a helper is not a conversation of its own');
    assert.equal(app.provided.recon.runs('nobody'), false);
    assert.equal(app.provided.recon.runFolder('helper-plan-1'), '', 'no folder for one that may not run');
    const folder = app.provided.recon.runFolder('session-r1');
    assert.equal(folder, join(ROOM, 'run-session-r1'));
    assert.ok(existsSync(folder));
    writeFileSync(join(folder, 'findings.md'), 'what the run found');
    // End and wipe: the run ends, its folder goes, and the helpers' saved conversations go with the conversation's.
    const said = await app.say(conversation, 'end');
    assert.equal(said.kind, 'success');
    assert.deepEqual(app.ended, ['session-r1']);
    assert.equal(existsSync(folder), false, 'the run\'s folder in the room is gone');
    for (let i = 0; i < 50 && existsSync(join(sessionsDir, 'project', 'session-r1')); i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(existsSync(join(sessionsDir, 'project', 'session-r1')), false);
    assert.equal(existsSync(join(sessionsDir, 'project', 'helper-plan-1')), false, 'its helper');
    assert.equal(existsSync(join(sessionsDir, 'project', 'helper-deep-2')), false, 'and its helper\'s helper');
    assert.equal(existsSync(join(sessionsDir, 'project', 'other-helper-3')), true, 'another conversation\'s helper stays');
  } finally {
    app.dispose();
    rmSync(sessionsDir, { recursive: true, force: true });
  }
});

test('outside Tor without WireGuard: blocked until the user allows direct connections for the conversation; /recon block takes it back', async () => {
  const conversation = { id: 'session-w1', header: { cwd: ROOM }, session: { header: { cwd: ROOM }, deriveMessages: () => [] }, model: { current: () => LOCAL } };
  const app = start({ modeOf: { 'session-w1': { mode: 'recon', isolated: true } }, agents: { 'session-w1': conversation } });
  try {
    assert.match((await app.say(conversation, 'status')).text, /Outside Tor \(the Internet Archive read directly, Usenet, the ordinary web\): blocked: no WireGuard is set up, and direct connections are not allowed in this conversation \(\/recon direct\)\./);
    const allowed = await app.say(conversation, 'direct');
    assert.equal(allowed.kind, 'success');
    assert.match(allowed.text, /sites see its internet address/);
    assert.match((await app.say(conversation, 'status')).text, /Outside Tor [^\n]*: directly \(you allowed it for this conversation; no WireGuard is set up\)/);
    assert.match((await app.say(conversation, 'block')).text, /^Blocked again/);
    assert.match((await app.say(conversation, 'status')).text, /: blocked: no WireGuard is set up/);
    // Not in a conversation that is not Recon's.
    const plain = { id: 'plain', header: {}, session: { header: {} }, model: { current: () => LOCAL } };
    assert.equal((await app.say(plain, 'direct')).kind, 'error');
  } finally {
    app.dispose();
  }
});

test('a real tool call: without a working tunnel, and without /recon direct, nothing goes out on the ordinary web', async () => {
  const conversation = { id: 'session-v1', header: { cwd: ROOM }, session: { header: { cwd: ROOM }, deriveMessages: () => [] }, model: { current: () => LOCAL } };
  const exec = { agent: conversation };
  // No configuration at all.
  const none = start({ modeOf: { 'session-v1': { mode: 'recon', isolated: true } }, agents: { 'session-v1': conversation } });
  try {
    const said = await none.registered.recon_web_search.execute({ query: 'old handle' }, exec);
    assert.match(said.text, /No WireGuard configuration is set up .* Nothing was sent\./);
    const board = await none.registered.recon_board_search.execute({ source: 'hackernews', query: 'old handle' }, exec);
    assert.match(board.text, /Nothing was sent\./);
  } finally {
    none.dispose();
  }
  // A configuration that cannot run (no wireproxy here): blocked the same way.
  const broken = start({ modeOf: { 'session-v1': { mode: 'recon', isolated: true } }, agents: { 'session-v1': conversation }, config: { vpnConfigs: [{ id: 'wg-a', label: 'A' }], wireproxyPath: '/nowhere/wireproxy' } });
  try {
    const said = await broken.registered.recon_web_search.execute({ query: 'old handle' }, exec);
    assert.match(said.text, /wireproxy program was not found.* Nothing was sent\..*\/recon direct/);
  } finally {
    broken.dispose();
  }
});

test('Long run checks: off unless switched on in Settings → Recon; Mission reads the switch at the start of each run', () => {
  const plainApp = start({ modeOf: { r1: { mode: 'recon', isolated: true } } });
  const checking = start({ modeOf: { r1: { mode: 'recon', isolated: true } }, config: { longChecks: true } });
  try {
    assert.equal(Config({}).longChecks.get(), false, 'off by default');
    assert.equal(plainApp.provided.recon.longChecks(), false);
    assert.equal(checking.provided.recon.longChecks(), true);
  } finally {
    plainApp.dispose();
    checking.dispose();
  }
});
