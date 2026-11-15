/**
 * Modes run whole in a stand-in app (test/app.mjs), for what only shows across a restart or at the
 * start of a conversation: the access level a mode sets (0.57.0), a mode's tier for new
 * conversations, /mode before the first message under the sidebar, Web Off for programs and image
 * tools, a mode's own prompt under a model version that stands alone, and the tools a mode starts with.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { COWORK_METHOD } from '../index.js';
import { CORE, FIND_TOOL } from '../lib/trim.js';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trashedIds } from '../lib/trashed.js';
import { boot, makeWorld, maskNow, sessionOf, settle } from './app.mjs';

const levelOf = (world, id) => world.sessions.get(id).level ?? world.defaultLevel;
/** A setting's value: a volatile field is a reactive reference until something writes it. */
const read = (value) => (value && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value);
const bases = (world) => JSON.parse(read(world.config.sessionSandboxBase) || '{}');
const sessionModes = (world) => JSON.parse(read(world.config.sessionModes) || '{}');

test('a level picked by hand survives a restart: Code does not set its level again on a reload', async () => {
  const world = makeWorld({ defaultLevel: 'read-only', defaultMode: 'code' });
  let app = boot(world);
  const { agent } = await app.open('c1');
  assert.equal(levelOf(world, 'c1'), 'workspace-write', 'a conversation that starts in Code gets its level');
  await app.firstTurn(agent);
  await settle();
  // The user picks full access by hand, then the app restarts.
  world.sessions.get('c1').append('sandbox/mode', { mode: 'danger-full-access' });
  app.stop();
  app = boot(world);
  const before = world.sessions.get('c1').events.length;
  await app.open('c1', { source: 'resume', lastTurn: 1 });
  await settle();
  assert.equal(world.sessions.get('c1').events.length, before, 'nothing is written on the reload');
  assert.equal(levelOf(world, 'c1'), 'danger-full-access');
  app.stop();
});

test('the add-on loading over a conversation that already ran does not set its level either', async () => {
  const world = makeWorld({ defaultLevel: 'danger-full-access', defaultMode: 'code', sessionModes: JSON.stringify({ old: 'code' }) });
  const app = boot(world, { before: [{ id: 'old', lastTurn: 3 }] });
  await settle();
  assert.equal(world.sessions.get('old').events.length, 0);
  assert.equal(levelOf(world, 'old'), 'danger-full-access');
  app.stop();
});

test('leaving Chat puts the earlier level back, also after a restart, and forgets it then', async () => {
  const world = makeWorld({ defaultLevel: 'workspace-write', defaultMode: 'chat' });
  let app = boot(world);
  const { agent } = await app.open('c2');
  assert.equal(levelOf(world, 'c2'), 'read-only', 'a conversation that starts in Chat is Read only');
  await app.firstTurn(agent);
  await settle();
  assert.deepEqual(bases(world).c2, { mode: 'chat', base: 'workspace-write', set: 'read-only' }, 'the earlier level is stored, with the mode that set it');
  app.stop();
  app = boot(world);
  await app.open('c2', { source: 'resume', lastTurn: 1 });
  assert.equal(app.service().get('c2'), 'chat');
  await app.service().set('c2', 'cowork');
  await settle();
  assert.equal(levelOf(world, 'c2'), 'workspace-write', 'Cowork can write again');
  assert.deepEqual(bases(world).c2, { mode: 'cowork' }, 'the earlier level is dropped once restored; only the mode stays');
  app.stop();
});

test('Chat never sets Read only over a level picked by hand afterwards; leaving it keeps that level', async () => {
  const world = makeWorld({ defaultLevel: 'workspace-write', defaultMode: 'chat' });
  let app = boot(world);
  const { agent } = await app.open('c3');
  await app.firstTurn(agent);
  await settle();
  world.sessions.get('c3').append('sandbox/mode', { mode: 'workspace-write' });
  app.stop();
  app = boot(world);
  const before = world.sessions.get('c3').events.length;
  await app.open('c3', { source: 'resume', lastTurn: 1 });
  await settle();
  assert.equal(levelOf(world, 'c3'), 'workspace-write', 'the restart did not put Read only back');
  await app.service().set('c3', 'cowork');
  await settle();
  assert.equal(world.sessions.get('c3').events.length, before, 'leaving Chat wrote nothing over the hand-picked level');
  assert.deepEqual(bases(world).c3, { mode: 'cowork' });
  app.stop();
});

test('a switch into a mode sets its level; a switch between two such modes keeps the first earlier level', async () => {
  const world = makeWorld({ defaultLevel: 'danger-full-access' });
  const app = boot(world);
  const { agent } = await app.open('c4');
  await app.firstTurn(agent);
  await app.service().set('c4', 'chat');
  await settle();
  assert.equal(levelOf(world, 'c4'), 'read-only');
  await app.service().set('c4', 'code');
  await settle();
  assert.equal(levelOf(world, 'c4'), 'workspace-write');
  assert.deepEqual(bases(world).c4, { mode: 'code', base: 'danger-full-access', set: 'workspace-write' });
  await app.service().set('c4', 'cowork');
  await settle();
  assert.equal(levelOf(world, 'c4'), 'danger-full-access');
  app.stop();
});

/** The Cowork sidebar's Move on a closed conversation: it writes only the conversation's mode. */
const moveClosed = async (app, world, id, modeId) => {
  world.config.sessionModes = JSON.stringify({ ...sessionModes(world), [id]: modeId });
  await app.emit('loader/volatile-update');
};

test('a conversation moved while it was not loaded gets the new mode\'s level when it is opened', async () => {
  const world = makeWorld({ defaultLevel: 'workspace-write' });
  // Stored on disk, so that pruning keeps their entries.
  const persisted = new Set(['mv1', 'mv2', 'mv3']);
  let app = boot(world, { persisted });
  // A Cowork conversation runs, is closed, and is moved to Chat from the sidebar; then it is opened.
  const cowork = await app.open('mv1');
  await app.firstTurn(cowork.agent);
  await app.close(cowork.agent);
  await moveClosed(app, world, 'mv1', 'chat');
  assert.equal(levelOf(world, 'mv1'), 'workspace-write', 'nothing happens while it is closed');
  await app.open('mv1', { source: 'resume', lastTurn: 1 });
  await settle();
  assert.equal(levelOf(world, 'mv1'), 'read-only', 'Chat is Read only once it is opened');
  assert.deepEqual(bases(world).mv1, { mode: 'chat', base: 'workspace-write', set: 'read-only' });
  // A Chat conversation, then a restart; moved to Code while closed: Code's level, not Read only.
  world.config.defaultMode = 'chat';
  const chat = await app.open('mv2');
  await app.firstTurn(chat.agent);
  const chat3 = await app.open('mv3');
  await app.firstTurn(chat3.agent);
  await settle();
  app.stop();
  app = boot(world, { persisted });
  await moveClosed(app, world, 'mv2', 'code');
  await moveClosed(app, world, 'mv3', 'cowork');
  await app.open('mv2', { source: 'resume', lastTurn: 1 });
  await app.open('mv3', { source: 'resume', lastTurn: 1 });
  await settle();
  assert.equal(levelOf(world, 'mv2'), 'workspace-write', 'moved into Code: it can write');
  assert.deepEqual(bases(world).mv2, { mode: 'code', base: 'workspace-write', set: 'workspace-write' });
  assert.equal(levelOf(world, 'mv3'), 'workspace-write', 'moved into Cowork: the level from before Chat');
  assert.deepEqual(bases(world).mv3, { mode: 'cowork' });
  // Opened again without a move: nothing is written.
  app.stop();
  app = boot(world, { persisted });
  const before = world.sessions.get('mv2').events.length;
  await app.open('mv2', { source: 'resume', lastTurn: 1 });
  await settle();
  assert.equal(world.sessions.get('mv2').events.length, before);
  app.stop();
});

test('a move made while closed also brings the new mode\'s tier, as a switch does', async () => {
  const modes = JSON.stringify({
    cowork: { label: 'Cowork', tools: 'all', sandbox: 'inherit', defaultTier: '', prompt: '' },
    code: { label: 'Code', tools: 'all', sandbox: 'workspace-write', defaultTier: 'strong', prompt: '' },
  });
  const world = makeWorld({ modes, defaultMode: 'cowork' });
  let app = boot(world, { tiers: ['strong'] });
  const { agent } = await app.open('mt1');
  await app.firstTurn(agent);
  await settle();
  app.stop();
  app = boot(world, { tiers: ['strong'] });
  await moveClosed(app, world, 'mt1', 'code');
  await app.open('mt1', { source: 'resume', lastTurn: 1 });
  await settle();
  assert.deepEqual(app.tierCalls, [['mt1', 'strong']]);
  assert.equal(levelOf(world, 'mt1'), 'workspace-write');
  app.stop();
});

test('a level picked by hand between two modes that set one is the level that comes back', async () => {
  const world = makeWorld({ defaultLevel: 'workspace-write', defaultMode: 'code' });
  const app = boot(world);
  const { agent } = await app.open('h1');
  await app.firstTurn(agent);
  await settle();
  assert.deepEqual(bases(world).h1, { mode: 'code', base: 'workspace-write', set: 'workspace-write' });
  world.sessions.get('h1').append('sandbox/mode', { mode: 'danger-full-access' });
  await app.service().set('h1', 'chat');
  await settle();
  assert.equal(levelOf(world, 'h1'), 'read-only');
  assert.deepEqual(bases(world).h1, { mode: 'chat', base: 'danger-full-access', set: 'read-only' });
  await app.service().set('h1', 'cowork');
  await settle();
  assert.equal(levelOf(world, 'h1'), 'danger-full-access', 'Full access, picked by hand before Chat, comes back');
  app.stop();
});

/** The app's permission presets, as configured by a user with a Read only one. */
const PRESETS = { 'read-only': { sandbox: 'read-only' }, 'workspace-write': { sandbox: 'workspace-write' }, 'danger-full-access': { sandbox: 'danger-full-access' } };

/** A conversation as 0.56 left it: its preset (when recorded), then Chat's Read only; nothing stored by Modes. */
const legacyChat = (world, id, { preset, level = 'read-only' } = {}) => {
  const session = sessionOf(world, id);
  if (preset) {
    session.append('permission/preset', { preset });
    session.append('sandbox/mode', { mode: PRESETS[preset].sandbox });
  }
  session.append('sandbox/mode', { mode: level });
};

test('a Chat conversation from before 0.57.0 promoted to Cowork gets the level of its own preset back', async () => {
  const world = makeWorld({ defaultLevel: 'workspace-write', presets: PRESETS, defaultPreset: 'workspace-write' });
  const ids = ['old', 'own-ro', 'by-hand', 'to-code'];
  world.config.sessionModes = JSON.stringify(Object.fromEntries(ids.map((id) => [id, 'chat'])));
  legacyChat(world, 'old', { preset: 'workspace-write' });
  legacyChat(world, 'own-ro', { preset: 'read-only' });
  legacyChat(world, 'by-hand', { preset: 'workspace-write', level: 'danger-full-access' });
  legacyChat(world, 'to-code', { preset: 'danger-full-access' });
  const app = boot(world, { persisted: new Set(ids) });
  for (const id of ids) await app.open(id, { source: 'resume', lastTurn: 2 });
  await settle();
  assert.equal(levelOf(world, 'old'), 'read-only', 'nothing is written on opening');
  assert.deepEqual(bases(world).old, { mode: 'chat' }, 'only the mode is noted: nothing to go back to is known');
  await app.service().set('old', 'cowork');
  await app.service().set('own-ro', 'cowork');
  await app.service().set('by-hand', 'cowork');
  await settle();
  assert.equal(levelOf(world, 'old'), 'workspace-write', 'its preset\'s level: Cowork can write');
  assert.deepEqual(bases(world).old, { mode: 'cowork' });
  assert.equal(levelOf(world, 'own-ro'), 'read-only', 'its own preset is Read only: kept');
  assert.equal(levelOf(world, 'by-hand'), 'danger-full-access', 'a level that is not Chat\'s was picked by hand: kept');
  // Into another mode that sets a level: the level to go back to is the preset's, not Chat's.
  await app.service().set('to-code', 'code');
  await settle();
  assert.deepEqual(bases(world)['to-code'], { mode: 'code', base: 'danger-full-access', set: 'workspace-write' });
  await app.service().set('to-code', 'cowork');
  await settle();
  assert.equal(levelOf(world, 'to-code'), 'danger-full-access');
  app.stop();
});

test('an old Chat conversation with no recorded preset takes the user\'s default preset (here Read only: nothing is raised); without presets nothing is written', async () => {
  // No preset recorded in its log: the user's default preset decides, here Read only.
  const world = makeWorld({ defaultLevel: 'workspace-write', presets: PRESETS, defaultPreset: 'read-only', sessionModes: JSON.stringify({ old: 'chat' }) });
  legacyChat(world, 'old');
  let app = boot(world);
  await app.open('old', { source: 'resume', lastTurn: 2 });
  const before = world.sessions.get('old').events.length;
  await app.service().set('old', 'cowork');
  await settle();
  assert.equal(world.sessions.get('old').events.length, before);
  assert.equal(levelOf(world, 'old'), 'read-only');
  app.stop();
  const bare = makeWorld({ defaultLevel: 'workspace-write', sessionModes: JSON.stringify({ old: 'chat' }) });
  legacyChat(bare, 'old', { level: 'read-only' });
  app = boot(bare);
  await app.open('old', { source: 'resume', lastTurn: 2 });
  await app.service().set('old', 'cowork');
  await settle();
  assert.equal(levelOf(bare, 'old'), 'read-only', 'no presets service: nothing is written');
  app.stop();
});

test('a Research-like add-on mode that is Read only: set on a start and on a move made while closed, put back on leaving', async () => {
  const RESEARCH = { label: 'Research', tools: ['deep_research', 'web_search', 'web_fetch'], sandbox: 'read-only', defaultTier: '', prompt: 'Research method.' };
  const world = makeWorld({ defaultLevel: 'workspace-write', extraModes: JSON.stringify({ research: RESEARCH }), defaultMode: 'research' });
  const app = boot(world, { persisted: new Set(['r1', 'r2']) });
  const { agent } = await app.open('r1');
  assert.equal(levelOf(world, 'r1'), 'read-only', 'a conversation that starts in it is Read only');
  await app.firstTurn(agent);
  world.config.defaultMode = 'cowork';
  const other = await app.open('r2');
  await app.firstTurn(other.agent);
  await settle();
  // Moved while closed: Cowork into Research, Research into Cowork.
  await app.close(agent);
  await app.close(other.agent);
  await moveClosed(app, world, 'r2', 'research');
  await moveClosed(app, world, 'r1', 'cowork');
  await app.open('r1', { source: 'resume', lastTurn: 1 });
  await app.open('r2', { source: 'resume', lastTurn: 1 });
  await settle();
  assert.equal(levelOf(world, 'r1'), 'workspace-write', 'out of Research: the earlier level');
  assert.equal(levelOf(world, 'r2'), 'read-only', 'into Research: Read only');
  assert.deepEqual(bases(world).r2, { mode: 'research', base: 'workspace-write', set: 'read-only' });
  await app.service().set('r2', 'cowork');
  await settle();
  assert.equal(levelOf(world, 'r2'), 'workspace-write');
  app.stop();
});

test('a Rerun copy keeps the entry it carries: the mode noted when it was opened never replaces it', async () => {
  const carried = { mode: 'chat', base: 'workspace-write', set: 'read-only' };
  const world = makeWorld({ defaultLevel: 'workspace-write', sessionModes: JSON.stringify({ parent: 'chat' }), sessionSandboxBase: JSON.stringify({ parent: carried }) });
  // The copy has the earlier turns (Read only from Chat) and nothing stored yet: Modes notes its mode
  // (the default one); the chat box carries the conversation's entry over before that note is written.
  sessionOf(world, 'copy').append('sandbox/mode', { mode: 'read-only' });
  const app = boot(world, { persisted: new Set(['parent', 'copy']), before: [{ id: 'copy', lastTurn: 1 }] });
  world.config.sessionSandboxBase = JSON.stringify({ ...bases(world), copy: carried });
  await settle();
  assert.deepEqual(bases(world).copy, carried, 'the carried entry stays');
  world.config.sessionModes = JSON.stringify({ ...sessionModes(world), copy: 'chat' });
  await app.emit('loader/volatile-update');
  await settle();
  await app.service().set('copy', 'cowork');
  await settle();
  assert.equal(levelOf(world, 'copy'), 'workspace-write', 'leaving Chat in the copy puts the carried level back');
  app.stop();
});

test('earlier levels of conversations that are gone are pruned with the other per-conversation fields', async () => {
  const world = makeWorld({ sessionSandboxBase: JSON.stringify({ gone: { base: 'workspace-write', set: 'read-only' }, kept: { base: 'read-only', set: 'workspace-write' } }) });
  const app = boot(world, { persisted: new Set(['kept', 'n1']) });
  await app.open('n1');
  await settle();
  assert.deepEqual(Object.keys(bases(world)).sort(), ['kept', 'n1'], 'the gone one is pruned; the open one notes its mode');
  assert.deepEqual(bases(world).n1, { mode: 'cowork' });
  app.stop();
});

test('a mode\'s tier applies to a conversation that starts in it, never on a reload or to a helper', async () => {
  const modes = JSON.stringify({ cowork: { label: 'Cowork', tools: 'all', sandbox: 'inherit', defaultTier: 'strong', prompt: '' }, chat: { label: 'Chat', tools: 'none', sandbox: 'read-only', defaultTier: '', prompt: '' } });
  const world = makeWorld({ modes });
  const app = boot(world, { tiers: ['strong'], before: [{ id: 'loaded', lastTurn: 0 }] });
  await settle();
  await app.open('new-1');
  await app.open('empty-reloaded', { source: 'resume' });
  await app.open('ran-before', { source: 'resume', lastTurn: 2 });
  await app.open('helper-1', { header: { origin: 'subagent', parentSession: 'new-1' } });
  await settle();
  assert.deepEqual(app.tierCalls, [['new-1', 'strong']]);
  // A switch still moves the conversation to the mode's tier, as before.
  await app.service().set('ran-before', 'chat');
  await app.service().set('ran-before', 'cowork');
  await settle();
  assert.deepEqual(app.tierCalls.at(-1), ['ran-before', 'strong']);
  app.stop();
});

test('before the first message, a move to a mode without a tier puts the earlier tier back, unless one was picked by hand', async () => {
  const modes = JSON.stringify({
    chat: { label: 'Chat', tools: 'none', sandbox: 'read-only', defaultTier: '', prompt: '' },
    cowork: { label: 'Cowork', tools: 'all', sandbox: 'inherit', defaultTier: '', prompt: '' },
    code: { label: 'Code', tools: 'all', sandbox: 'workspace-write', defaultTier: 'strong', prompt: '' },
  });
  // The Code tab is selected; the user then clicks the Cowork tab on the blank conversation.
  const world = makeWorld({ modes, defaultMode: 'code' });
  const app = boot(world, { tabs: true, tiers: ['strong', 'everyday', 'other'] });
  const { agent } = await app.open('b1');
  assert.deepEqual(app.tierCalls, [['b1', 'strong']]);
  world.config.defaultMode = 'cowork';
  await app.emit('loader/volatile-update');
  await settle();
  assert.deepEqual(app.tierCalls.at(-1), ['b1', 'everyday'], 'the tier it had before');
  await app.firstTurn(agent);
  // A hand pick after the start tier stays.
  world.config.defaultMode = 'code';
  const { agent: second } = await app.open('b2');
  app.pickTier('b2', 'other');
  world.config.defaultMode = 'cowork';
  await app.emit('loader/volatile-update');
  await settle();
  assert.deepEqual(app.tierCalls.filter(([id]) => id === 'b2'), [['b2', 'strong']]);
  await app.firstTurn(second);
  app.stop();
});

test('a conversation an Automation task opens does not keep the selected tab\'s tier when the task\'s mode has none', async () => {
  const modes = JSON.stringify({
    cowork: { label: 'Cowork', tools: 'all', sandbox: 'inherit', defaultTier: '', prompt: '' },
    code: { label: 'Code', tools: 'all', sandbox: 'workspace-write', defaultTier: 'strong', prompt: '' },
  });
  const world = makeWorld({ modes, defaultMode: 'code', scheduledMode: 'cowork' });
  const app = boot(world, { tabs: true, tiers: ['strong', 'everyday'] });
  await app.open('task-1');
  const reminder = { type: 'agent/inbox/spliced', data: { inserted: [{ source: { kind: 'schedule' }, content: [{ type: 'text', text: 'Daily brief' }] }] } };
  await app.emit('session/event', { id: 'task-1' }, reminder);
  await settle();
  assert.equal(app.service().get('task-1'), 'cowork');
  assert.deepEqual(app.tierCalls, [['task-1', 'strong'], ['task-1', 'everyday']]);
  app.stop();
});

test('an Automation task\'s conversation is on the earlier tier before the task\'s message is sent, however slow the tier change', async () => {
  const modes = JSON.stringify({
    cowork: { label: 'Cowork', tools: 'all', sandbox: 'inherit', defaultTier: '', prompt: '' },
    code: { label: 'Code', tools: 'all', sandbox: 'workspace-write', defaultTier: 'strong', prompt: '' },
  });
  const world = makeWorld({ modes, defaultMode: 'code', scheduledMode: 'cowork' });
  const app = boot(world, { tabs: true, tiers: ['strong', 'everyday'], tierDelay: 30 });
  // The scheduler creates the conversation (the app waits for agent/created), resolves it through its
  // hook, and sends the task's message only once the hook returns: the first step's model is fixed then.
  const agent = await app.waterfall('schedule/resolve-agent', 'task-2', async () => (await app.open('task-2')).agent);
  assert.equal(agent.id, 'task-2', 'the hook hands the conversation on');
  assert.deepEqual(app.tierSelected, [['task-2', 'strong'], ['task-2', 'everyday']], 'the tab\'s tier is undone before the message');
  assert.equal(app.service().get('task-2'), 'cowork');
  const reminder = { type: 'agent/inbox/spliced', data: { inserted: [{ source: { kind: 'schedule' }, content: [{ type: 'text', text: 'Daily brief' }] }] } };
  await app.emit('session/event', { id: 'task-2' }, reminder);
  await settle();
  assert.deepEqual(app.tierCalls, [['task-2', 'strong'], ['task-2', 'everyday']], 'the message changes nothing more');
  // A task that delivers to a conversation that already ran leaves it alone.
  const ran = await app.open('ran', { source: 'resume', lastTurn: 3 });
  await app.waterfall('schedule/resolve-agent', 'ran', async () => ran.agent);
  assert.equal(app.service().get('ran'), 'code');
  assert.equal(app.tierCalls.length, 2);
  app.stop();
});

test('with the sidebar, /mode before the first message answers that the tab decides and names the tabs', async () => {
  const FINANCE = { label: 'Finance', tools: 'all', sandbox: 'inherit', defaultTier: '', prompt: 'Finance method.' };
  const world = makeWorld({ extraModes: JSON.stringify({ finance: FINANCE }) });
  const app = boot(world, { tabs: true, maxTabs: 2 });
  const { agent } = await app.open('m1');
  const answer = await app.command(agent, 'code');
  assert.equal(answer.kind, 'error');
  assert.match(answer.text, /^Not switched\. Before the first message, the selected sidebar tab decides the mode of a new conversation \(now: Cowork\)\./);
  assert.match(answer.text, /Tabs: Chat, Cowork, Finance\./, 'the first two modes, then the add-on\'s');
  assert.match(answer.text, /use \/mode after your first message/);
  assert.equal(sessionModes(world).m1, undefined, 'nothing was stored');
  assert.equal(app.service().get('m1'), 'cowork');
  const list = await app.command(agent, '');
  assert.equal(list.kind, 'success');
  assert.match(list.text, /selected sidebar tab decides/);
  await app.firstTurn(agent);
  const later = await app.command(agent, 'code');
  assert.equal(later.kind, 'success');
  assert.equal(app.service().get('m1'), 'code', 'after the first message /mode works as before');
  app.stop();
});

test('without the sidebar, /mode before the first message switches as before', async () => {
  const world = makeWorld();
  const app = boot(world);
  const { agent } = await app.open('m2');
  const answer = await app.command(agent, 'code');
  assert.equal(answer.kind, 'success');
  assert.equal(app.service().get('m2'), 'code');
  app.stop();
});

test('Web Off also stops programs that go online; Web on lets them run', async () => {
  const world = makeWorld({ trimModes: [], sessionWeb: JSON.stringify({ w1: false }) });
  const app = boot(world, { known: ['read', 'bash', 'web_search', 'web_fetch', 'run_code'] });
  await app.open('w1');
  const run = (code) => app.guard({ name: 'run_code', agent: { id: 'w1' }, arguments: { code } });
  assert.match(run('const page = await fetch("https://example.com"); return page.status;'), /programs that go online/);
  assert.match(run('const { execSync } = await import("node:child_process"); return String(execSync("curl -s example.com"));'), /programs that go online/);
  assert.equal(run('const files = await glob({ pattern: "*.md" }); return files.length;'), undefined);
  assert.match(app.guard({ name: 'bash', agent: { id: 'w1' }, arguments: { command: 'curl example.com' } }), /commands that go online/);
  world.config.sessionWeb = JSON.stringify({ w1: true });
  assert.equal(run('await fetch(url)'), undefined);
  app.stop();
});

test('Web Off takes the image tools away unless their service is on this Mac or a private network', async () => {
  const known = ['read', 'web_search', 'web_fetch', 'generate_image', 'edit_image', 'mcp__files__list'];
  const media = (baseUrl) => [{ options: { id: 'media-tools', name: '@local/dsh-media-tools', config: { images: { baseUrl, model: 'm' } } } }];
  const fields = { trimModes: [], sessionWeb: JSON.stringify({ i1: false }) };
  const remote = makeWorld(fields);
  let app = boot(remote, { known, loader: media('https://images.example.com/v1') });
  const away = await app.open('i1');
  const deny = maskNow(away.masks)?.deny ?? [];
  assert.ok(deny.includes('generate_image') && deny.includes('edit_image'), JSON.stringify(deny));
  assert.ok(!deny.includes('mcp__files__list'), 'connectors stay on');
  const told = app.prompt('i1');
  assert.match(told, /the image tools/);
  assert.match(told, /Connector tools \(named mcp__…\) stay on and can still reach the internet/);
  app.stop();
  const local = makeWorld(fields);
  app = boot(local, { known, loader: media('http://192.168.1.20:8080/v1') });
  const kept = await app.open('i1');
  assert.ok(!(maskNow(kept.masks)?.deny ?? []).includes('generate_image'), 'a service on the own network stays');
  app.stop();
});

test('a mode with keepPrompt keeps its words under a model version that stands alone; others do not', async () => {
  const SCOUT = { label: 'Scout', tools: ['scout_search', 'deep_research', 'web_search', 'web_fetch'], sandbox: 'inherit', prompt: 'Scout rules: nothing is sent.', keepPrompt: true };
  const PLAIN = { label: 'Plain', tools: 'all', sandbox: 'inherit', prompt: 'Plain words.' };
  const world = makeWorld({ extraModes: JSON.stringify({ scout: SCOUT, plain: PLAIN }), sessionModes: JSON.stringify({ s1: 'scout', p1: 'plain' }) });
  const app = boot(world, { alone: true });
  await app.open('s1');
  await app.open('p1');
  assert.match(app.prompt('s1'), /Scout rules: nothing is sent\./);
  assert.doesNotMatch(app.prompt('p1'), /Plain words\./);
  app.stop();
});

test('Cowork gets its working method while its prompt is empty and the switch is on', async () => {
  const on = makeWorld();
  let app = boot(on);
  await app.open('k1');
  assert.ok(app.prompt('k1').startsWith(COWORK_METHOD));
  app.stop();
  const off = makeWorld({ coworkMethod: false });
  app = boot(off);
  await app.open('k2');
  assert.ok(!app.prompt('k2').includes('You are in Cowork mode'));
  app.stop();
  const own = makeWorld({ modes: JSON.stringify({ cowork: { label: 'Cowork', tools: 'all', prompt: 'My own way.' } }) });
  app = boot(own);
  await app.open('k3');
  assert.ok(app.prompt('k3').startsWith('My own way.') && !app.prompt('k3').includes(COWORK_METHOD));
  app.stop();
});

test('Data loads its tools as needed, with its data and PDF tools there from the first step', async () => {
  const DATA = { label: 'Data', tools: 'all', sandbox: 'inherit', prompt: 'Data method.', startFamilies: ['data', 'pdf'] };
  const known = [...CORE.filter((name) => name !== FIND_TOOL), 'web_search', 'web_fetch', 'data_python', 'data_chart', 'pdf_read', 'finance_news'];
  const world = makeWorld({ extraModes: JSON.stringify({ data: DATA }), defaultMode: 'data' });
  const app = boot(world, { known });
  const { masks } = await app.open('d1');
  const allow = maskNow(masks)?.allow ?? [];
  for (const name of ['data_python', 'data_chart', 'pdf_read', 'read', 'web_search']) assert.ok(allow.includes(name), name);
  assert.ok(!allow.includes('finance_news'), 'other families wait for tools_find');
  assert.match(app.prompt('d1'), /only the core tools and the data and pdf tools are offered at first/);
  app.stop();
});

test('once, data is added to a stored "load tools as needed" list; switched off after that, it stays off', async () => {
  const world = makeWorld({ trimModes: ['cowork'] });
  let app = boot(world);
  await app.open('x0');
  await settle();
  assert.deepEqual([...read(world.config.trimModes)], ['cowork', 'data']);
  assert.equal(read(world.config.dataTrimAdded), true);
  world.config.trimModes = ['cowork'];
  app.stop();
  app = boot(world);
  await app.open('x1');
  await settle();
  assert.deepEqual([...read(world.config.trimModes)], ['cowork']);
  app.stop();
});

test('the trash: moved conversations with their helpers, waiting ones, and an unreadable trash', () => {
  const home = mkdtempSync(join(tmpdir(), 'modes-trash-'));
  try {
    const dir = join(home, 'trash', 'conversations');
    assert.deepEqual([...trashedIds(dir)], [], 'no trash folder: nothing in the trash');
    assert.equal(trashedIds(''), null, 'no folder known: unsure');
    mkdirSync(join(dir, 'recon-1'), { recursive: true });
    writeFileSync(join(dir, 'recon-1', 'info.json'), JSON.stringify({ id: 'recon-1', parts: [{ id: 'recon-1' }, { id: 'helper-9' }] }));
    mkdirSync(join(dir, 'moving-2'), { recursive: true });
    writeFileSync(join(dir, 'pending.json'), JSON.stringify([{ id: 'open-3' }, { id: '../x' }]));
    assert.deepEqual([...trashedIds(dir)].sort(), ['helper-9', 'moving-2', 'open-3', 'recon-1'], 'a folder without its record is kept, an unsafe id is not');
    writeFileSync(join(dir, 'recon-1', 'info.json'), '{ broken');
    assert.equal(trashedIds(dir), null, 'a record that cannot be read: unsure, so nothing may be treated as gone');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('a conversation in the trash keeps its tab, Web, Tools and Recon isolation across a restart; one erased for good does not', async () => {
  const home = mkdtempSync(join(tmpdir(), 'modes-trash-'));
  try {
    const dir = join(home, 'trash', 'conversations');
    mkdirSync(join(dir, 'recon-1'), { recursive: true });
    writeFileSync(join(dir, 'recon-1', 'info.json'), JSON.stringify({ id: 'recon-1', parts: [{ id: 'recon-1' }] }));
    writeFileSync(join(dir, 'pending.json'), JSON.stringify([{ id: 'code-2' }]));
    const world = makeWorld({
      sessionModes: JSON.stringify({ 'recon-1': 'recon', 'code-2': 'code', 'erased-3': 'code' }),
      sessionIsolated: JSON.stringify({ 'recon-1': true }),
      sessionWeb: JSON.stringify({ 'code-2': false, 'erased-3': false }),
      sessionTools: JSON.stringify({ 'code-2': false }),
    });
    // After a restart the app lists none of the three: two are in the trash, one was erased.
    const app = boot(world, { home, persisted: new Set(['n1']) });
    await app.open('n1');
    await settle();
    const modes = JSON.parse(read(world.config.sessionModes) || '{}');
    assert.equal(modes['recon-1'], 'recon');
    assert.equal(modes['code-2'], 'code');
    assert.equal(modes['erased-3'], undefined, 'erased for good: its entries go');
    assert.deepEqual(JSON.parse(read(world.config.sessionIsolated) || '{}'), { 'recon-1': true }, 'Recon\'s isolation mark survives');
    assert.deepEqual(JSON.parse(read(world.config.sessionWeb) || '{}'), { 'code-2': false });
    assert.deepEqual(JSON.parse(read(world.config.sessionTools) || '{}'), { 'code-2': false });
    app.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Depth reaches the model: the care note, then the web note, then how much to search; a Mission run\'s rounds get none of it', async () => {
  // Chat, Recon and Research cannot start a helper: their Thorough note ends at the check (no helper review).
  const { DEPTH_PROMPTS_NO_HELPERS: DEPTH_PROMPTS, DEPTH_SEARCH_PROMPTS, ISOLATED_DEPTH_PROMPTS } = await import('../lib/prompt.js');
  const RECON = { label: 'Recon', tools: ['recon_cite', 'web_search'], sandbox: 'read-only', prompt: 'Recon method.', isolated: true };
  const RESEARCH = { label: 'Research', tools: ['deep_research', 'web_search', 'web_fetch'], sandbox: 'read-only', prompt: 'Research method.' };
  const goals = new Map();
  const world = makeWorld({
    // The stand-in app stores no conversations: nothing is cleaned up as gone.
    pruneStaleSessions: false,
    // The start stored before 0.59.0: the Web level Deep, which is Thorough now.
    searchDepth: 'deep',
    extraModes: JSON.stringify({ recon: RECON, research: RESEARCH }),
    sessionModes: JSON.stringify({ c1: 'chat', c2: 'chat', c3: 'chat', r1: 'recon', g1: 'chat', s1: 'research' }),
    sessionWeb: JSON.stringify({ c1: true, c2: false, c3: true, g1: true }),
    sessionDepth: JSON.stringify({ c3: 'quick' }),
  });
  const app = boot(world, { known: ['read', 'web_search', 'web_fetch', 'recon_cite'], goals });
  for (const id of ['c1', 'c2', 'c3', 'r1', 'g1', 's1']) await app.open(id);
  const c1 = app.prompt('c1');
  const care = c1.indexOf(DEPTH_PROMPTS.thorough);
  const webNote = c1.search(/Web is on for this conversation/);
  const search = c1.indexOf(DEPTH_SEARCH_PROMPTS.thorough);
  assert.ok(care >= 0 && webNote > care && search > webNote, `order: care ${care}, web ${webNote}, search ${search}`);
  // Web Off: the care note stays; nothing about searching.
  const c2 = app.prompt('c2');
  assert.ok(c2.includes(DEPTH_PROMPTS.thorough) && !c2.includes(DEPTH_SEARCH_PROMPTS.thorough));
  // A conversation's own pick wins over the start.
  const c3 = app.prompt('c3');
  assert.ok(c3.includes(DEPTH_PROMPTS.quick) && c3.includes(DEPTH_SEARCH_PROMPTS.quick) && !c3.includes(DEPTH_PROMPTS.thorough));
  // Recon: the care note like every tab, then its own search effort by Depth.
  const r1 = app.prompt('r1');
  assert.ok(r1.indexOf(DEPTH_PROMPTS.thorough) >= 0 && r1.indexOf(ISOLATED_DEPTH_PROMPTS.thorough) > r1.indexOf(DEPTH_PROMPTS.thorough), r1);
  // A Mission run's rounds are running (its goal, armed): they only conduct, so no Depth words at all.
  const MISSION = { phase: 'active', activation: 'armed', objective: 'Mission run r-1: tidy the books\n\nIn each round call the step tool once.' };
  goals.set('g1', MISSION);
  const during = app.prompt('g1');
  assert.ok(!during.includes('How much care') && !during.includes(DEPTH_SEARCH_PROMPTS.thorough), during);
  assert.match(during, /Web is on for this conversation/, 'the web note itself stays');
  // Also while its goal is disarmed (after a restart or an error) and the user writes: Mission still
  // conducts the run and refuses every other tool.
  goals.set('g1', { ...MISSION, activation: 'disarmed' });
  assert.ok(!app.prompt('g1').includes('How much care'));
  assert.equal(app.service().depthSpoken({ id: 'g1' }), 'standard');
  // They come back once it is done or paused, and for the user's own /goal (running or only stored),
  // whose rounds do the work.
  for (const goal of [{ ...MISSION, phase: 'complete' }, { ...MISSION, phase: 'paused' }, { phase: 'active', activation: 'armed', objective: 'research the market' }, { phase: 'active', activation: 'disarmed', objective: 'research the market' }]) {
    goals.set('g1', goal);
    assert.ok(app.prompt('g1').includes(DEPTH_PROMPTS.thorough), JSON.stringify(goal));
    assert.equal(app.service().depthSpoken({ id: 'g1' }), 'thorough', JSON.stringify(goal));
  }
  goals.delete('g1');
  // Model Tiers keeps only its thinking words exactly where the Depth note is given (depthSpoken).
  assert.equal(app.service().depthSpoken({ id: 'c1' }), 'thorough');
  assert.equal(app.service().depthSpoken({ id: 'c3' }), 'quick');
  // Recon and Research get the Depth note too (one Depth everywhere): Model Tiers goes thinking-only there as well.
  assert.equal(app.service().depthSpoken({ id: 'r1' }), 'thorough', 'Recon');
  assert.equal(app.service().depthSpoken({ id: 's1' }), 'thorough', 'Research');
  assert.ok(app.prompt('s1').includes(DEPTH_PROMPTS.thorough));
  assert.ok(!app.prompt('s1').includes(DEPTH_SEARCH_PROMPTS.thorough), 'Research searches by its own method');
  goals.set('g1', MISSION);
  assert.equal(app.service().depthSpoken({ id: 'g1' }), 'standard', 'a Mission run\'s rounds');
  goals.delete('g1');
  assert.equal(app.service().depthSpoken({ id: 'g1' }), 'thorough');
  const helper = await app.open('h1', { header: { parentSession: 'c1' } });
  assert.equal(app.service().depthOf('h1'), 'thorough', 'a helper follows its conversation\'s Depth');
  assert.equal(app.service().depthSpoken(helper.agent), 'standard', 'but gets no Depth note');
  world.config.sessionTools = JSON.stringify({ c1: false });
  assert.equal(app.service().depthSpoken({ id: 'c1' }), 'standard', 'tools off');
  world.config.sessionTools = '{}';
  assert.equal(app.service().depthSpoken(undefined), 'standard');
  // The service answers the same.
  assert.equal(app.service().searchDepth(), 'thorough');
  assert.equal(app.service().depthOf('c3'), 'quick');
  assert.equal(app.service().depthOf('c1'), 'thorough');
  app.stop();
});

test('the first start after 0.59.0 moves each conversation\'s Web level into its Depth, once', async () => {
  const world = makeWorld({
    pruneStaleSessions: false,
    searchDepth: 'deep',
    sessionSearchDepth: JSON.stringify({ a: 'quick', b: 'deep' }),
    sessionDepth: JSON.stringify({ c: 'quick' }),
  });
  let app = boot(world);
  await app.open('m1');
  await settle();
  assert.deepEqual(JSON.parse(world.config.sessionDepth), { a: 'quick', b: 'thorough', c: 'quick' });
  assert.equal(world.config.sessionSearchDepth, '{}', 'the old levels are cleared');
  assert.equal(world.config.searchDepth, 'thorough');
  assert.equal(world.config.depthMoved, true);
  app.stop();
  // Later picks are never overwritten by the old levels on the next start.
  world.config.sessionDepth = JSON.stringify({ a: 'standard', b: 'thorough', c: 'quick' });
  world.config.sessionSearchDepth = JSON.stringify({ a: 'quick', z: 'deep' });
  app = boot(world);
  await app.open('m2');
  await settle();
  assert.deepEqual(JSON.parse(world.config.sessionDepth), { a: 'standard', b: 'thorough', c: 'quick' }, 'moved once only');
  app.stop();
  // Before the move is written (or should it fail), a start of Deep already counts as Thorough.
  const early = makeWorld({ pruneStaleSessions: false, depthMoved: true, searchDepth: 'deep' });
  app = boot(early);
  assert.equal(app.service().searchDepth(), 'thorough');
  assert.equal(app.service().depthOf('any'), 'thorough');
  app.stop();
});

test('the start-up clean-up never undoes the move of the Web levels into Depth', async () => {
  // A conversation stored in the settings was deleted: the clean-up drops it while the move is written.
  const world = makeWorld({
    searchDepth: 'deep',
    sessionModes: JSON.stringify({ a: 'chat', b: 'chat', gone: 'chat' }),
    sessionSearchDepth: JSON.stringify({ a: 'quick', b: 'deep', gone: 'quick' }),
  });
  const app = boot(world, { persisted: new Set(['a', 'b']), writeDelay: 5 });
  await app.open('m1');
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(world.config.depthMoved, true);
  assert.deepEqual(JSON.parse(world.config.sessionDepth), { a: 'quick', b: 'thorough' }, 'moved, and the gone one dropped');
  assert.equal(world.config.sessionSearchDepth, '{}');
  assert.deepEqual(JSON.parse(world.config.sessionModes), { a: 'chat', b: 'chat' });
  assert.equal(app.service().depthOf('a'), 'quick');
  assert.equal(app.service().depthOf('b'), 'thorough');
  app.stop();
});

test('a failed write of the move is tried again with the next conversation that opens', async () => {
  let refused = 0;
  const world = makeWorld({ pruneStaleSessions: false, sessionSearchDepth: JSON.stringify({ a: 'deep' }) });
  const app = boot(world, { failWrite: (ops) => ops.some((op) => op.path[0] === 'depthMoved') && refused++ === 0 });
  await app.open('m1');
  await settle();
  assert.equal(refused, 1);
  assert.notEqual(world.config.depthMoved, true, 'not marked done');
  assert.equal(app.service().depthOf('a'), 'standard', 'nothing moved yet');
  await app.open('m2');
  await settle();
  assert.equal(world.config.depthMoved, true);
  assert.deepEqual(JSON.parse(world.config.sessionDepth), { a: 'thorough' });
  app.stop();
});

test('the move also runs a moment after loading, when no conversation opens', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = makeWorld({ pruneStaleSessions: false, sessionSearchDepth: JSON.stringify({ a: 'quick' }) });
  const app = boot(world);
  await settle();
  assert.notEqual(world.config.depthMoved, true);
  t.mock.timers.tick(2000);
  await settle();
  assert.equal(world.config.depthMoved, true);
  assert.deepEqual(JSON.parse(world.config.sessionDepth), { a: 'quick' });
  app.stop();
});

test('Thorough: one check just before a turn ends, in every tab, never twice, never starting the work over', async () => {
  const { DEPTH_CHECK_PROMPT, DEPTH_CHECK_KIND, DEPTH_CHECK_SUMMARY, DEPTH_CHECK_REFUSAL } = await import('../lib/prompt.js');
  // The owner's words, with his rule that a check never starts the work over.
  assert.equal(DEPTH_CHECK_PROMPT, 'Before you finish, check your answer against the request and your working method. Fix only what is missing, without starting the work over or starting a new research run, then finish. If nothing is missing, say so in one line.');
  const RECON = { label: 'Recon', tools: ['recon_cite', 'recon_news_search'], sandbox: 'read-only', prompt: 'Recon method.', isolated: true };
  const LOCKED = { label: 'Locked', tools: [], sandbox: 'read-only', prompt: 'No tools are available.', isolated: true };
  const RESEARCH = { label: 'Research', tools: ['deep_research', 'web_search', 'web_fetch'], sandbox: 'read-only', prompt: 'Research method.' };
  const goals = new Map();
  const world = makeWorld({
    pruneStaleSessions: false,
    searchDepth: 'thorough',
    extraModes: JSON.stringify({ recon: RECON, research: RESEARCH, locked: LOCKED }),
    sessionModes: JSON.stringify({ c1: 'cowork', ch: 'chat', r1: 'recon', s1: 'research', q1: 'cowork', st: 'cowork', off1: 'cowork', m1: 'cowork', lk: 'locked' }),
    sessionDepth: JSON.stringify({ q1: 'quick', st: 'standard' }),
    sessionTools: JSON.stringify({ off1: false }),
  });
  const app = boot(world, { known: ['read', 'web_search', 'web_fetch', 'deep_research', 'run_swarm', 'recon_cite'], goals });
  const open = async (id, header) => (await app.open(id, header ? { header } : {})).agent;
  /** One turn the user started: their message is claimed, then the app asks before closing. */
  const userTurn = async (agent, turn) => {
    await app.claim(agent, turn);
    await app.turnStopping(agent, turn);
  };
  const refused = (id, name = 'deep_research') => app.guard({ name, agent: { id }, arguments: {} }) === DEPTH_CHECK_REFUSAL;
  const c1 = await open('c1');
  // The first ask: one check, as a one-line row of its own (not the user's message).
  await userTurn(c1, 1);
  assert.equal(c1.steered.length, 1);
  const [check] = c1.steered;
  assert.equal(check.role, 'user');
  assert.deepEqual(check.content, [{ type: 'text', text: DEPTH_CHECK_PROMPT }]);
  assert.deepEqual(check.source, { kind: DEPTH_CHECK_KIND, form: 'notice', summary: DEPTH_CHECK_SUMMARY });
  assert.match(check.id, /^[0-9a-f-]{36}$/);
  // During the check, nothing that starts a whole new run; small work goes on.
  for (const name of ['deep_research', 'run_swarm', 'run_pipeline', 'review_lanes', 'delegate_role', 'workflow']) assert.ok(refused('c1', name), name);
  assert.equal(app.guard({ name: 'web_search', agent: { id: 'c1' }, arguments: {} }), undefined);
  assert.ok(!refused('ch'), 'only the conversation in its check');
  // A helper started during the check is held to it; one started before is not.
  const before = await open('hb', { parentSession: 'ch' });
  const during = await open('hd', { parentSession: 'c1' });
  assert.ok(refused('hd') && !refused('hb'));
  // The check step itself claims the check message: that does not lift the block.
  await app.claim(c1, 1, DEPTH_CHECK_KIND);
  assert.ok(refused('c1'));
  // The second ask closes the turn: no second check, and the block is lifted; later asks add nothing.
  await app.turnStopping(c1, 1);
  await app.turnStopping(c1, 1);
  await app.turnStopping(c1, 1);
  assert.equal(c1.steered.length, 1, 'never twice in a turn');
  assert.ok(!refused('c1') && !refused('hd'));
  void before; void during;
  // Something the user sends during the check step is theirs: the block ends, and there is no second check.
  await userTurn(c1, 2);
  assert.equal(c1.steered.length, 2);
  await app.claim(c1, 2);
  assert.ok(!refused('c1'), 'the user\'s own request for research is not refused');
  await app.turnStopping(c1, 2);
  assert.equal(c1.steered.length, 2);
  // A turn that ends early (stopped) gets none; going idle lifts the block.
  await app.claim(c1, 3);
  await app.turnStopping(c1, 3, { aborted: true });
  assert.equal(c1.steered.length, 2);
  await userTurn(c1, 4);
  await app.emit('agent/status', { agent: c1, status: 'idle' });
  assert.ok(!refused('c1'));
  // A turn without a message from the user (a goal round, a helper's notice, an Automation task): no check.
  for (const kind of ['goal', 'subagent-settled', 'schedule', 'tool-jobs']) {
    await app.claim(c1, 10, kind);
    await app.turnStopping(c1, 10);
  }
  assert.equal(c1.steered.length, 3, 'no check without the user');
  // Every tab, Recon and Research (research-level modes) and Chat included.
  for (const id of ['ch', 'r1', 's1']) {
    const agent = await open(id);
    await userTurn(agent, 1);
    assert.equal(agent.steered.length, 1, id);
  }
  // None: Quick, Standard, tools off, a helper, a Mission run, a Recon conversation that can use no tool, an Automation task's conversation.
  const none = [await open('q1'), await open('st'), await open('off1'), await open('h1', { parentSession: 'c1' }), await open('lk')];
  goals.set('m1', { phase: 'active', activation: 'armed', objective: 'Mission run r-2: tidy\n\nIn each round call the step tool once.' });
  none.push(await open('m1'));
  none.push(await app.waterfall('schedule/resolve-agent', 'task-1', async () => (await app.open('task-1')).agent));
  for (const agent of none) {
    await userTurn(agent, 1);
    assert.equal(agent.steered.length, 0, agent.id);
  }
  assert.equal(app.service().depthSpoken({ id: 'lk' }), 'standard', 'an isolated conversation that can use no tool has no Depth note');
  // A reply cut off at the output limit: the turn ends there, no check.
  const cut = await open('cut');
  await app.claim(cut, 1);
  await app.cutOff(cut);
  await app.turnStopping(cut, 1);
  assert.equal(cut.steered.length, 0);
  await userTurn(cut, 2);
  assert.equal(cut.steered.length, 1, 'the next turn is checked again');
  // An engine does its whole task again on any new message: no check on an engine.
  const engine = await open('en');
  engine.model.current = () => ({ provider: 'engine-opencode', model: 'x' });
  await userTurn(engine, 1);
  assert.equal(engine.steered.length, 0);
  // A question to the user or a plan to approve: still waiting at the end, no check; answered, the rest is checked.
  const asks = await open('a1');
  assert.equal(app.guard({ name: 'ask_user_question', agent: { id: 'a1' }, arguments: {} }), undefined, 'the question itself runs');
  await app.toolResult(asks, 'ask_user_question', { output: { pending: true, callId: 'c', message: 'later' } });
  await userTurn(asks, 1);
  assert.equal(asks.steered.length, 0, 'no answer yet');
  app.guard({ name: 'ask_user_question', agent: { id: 'a1' }, arguments: {} });
  await app.toolResult(asks, 'ask_user_question', { output: { answers: [{ id: 'q', selected: ['Yes'] }] } });
  await userTurn(asks, 2);
  assert.equal(asks.steered.length, 1, 'answered: the work after it is checked');
  const plans = await open('p1');
  app.guard({ name: 'exit_plan_mode', agent: { id: 'p1' }, arguments: {} });
  await app.toolResult(plans, 'exit_plan_mode', { output: { approved: false } });
  await userTurn(plans, 1);
  assert.equal(plans.steered.length, 0, 'a dismissed review: the user replies first');
  app.guard({ name: 'exit_plan_mode', agent: { id: 'p1' }, arguments: {} });
  await app.toolResult(plans, 'exit_plan_mode', { output: { approved: true } });
  await userTurn(plans, 2);
  assert.equal(plans.steered.length, 1, 'an approved plan\'s work is checked');
  // A question asked during the check step never takes the next turn's check; nor one left open when the turn was stopped.
  const late = await open('a2');
  await userTurn(late, 1);
  app.guard({ name: 'ask_user_question', agent: { id: 'a2' }, arguments: {} });
  await app.turnStopping(late, 1);
  await userTurn(late, 2);
  assert.equal(late.steered.length, 2);
  const stopped = await open('a3');
  app.guard({ name: 'ask_user_question', agent: { id: 'a3' }, arguments: {} });
  await app.emit('agent/status', { agent: stopped, status: 'idle' });
  await userTurn(stopped, 2);
  assert.equal(stopped.steered.length, 1);
  // A failing steer never breaks the turn and leaves no block behind.
  const broken = await open('b1');
  broken.steer = () => { throw new Error('closed'); };
  await userTurn(broken, 1);
  assert.ok(!refused('b1'));
  app.stop();
});

test('with only the final answer shown, there is no check: its one line would hide the answer', async () => {
  const world = makeWorld({ pruneStaleSessions: false, searchDepth: 'thorough' });
  const app = boot(world, { chat: { foldedReplies: 'final' } });
  const agent = (await app.open('f1')).agent;
  await app.claim(agent, 1);
  await app.turnStopping(agent, 1);
  assert.equal(agent.steered.length, 0);
  app.stop();
  const shown = boot(makeWorld({ pruneStaleSessions: false, searchDepth: 'thorough' }), { chat: { foldedReplies: 'all' } });
  const other = (await shown.open('f2')).agent;
  await shown.claim(other, 1);
  await shown.turnStopping(other, 1);
  assert.equal(other.steered.length, 1, 'all replies shown (and without the setting): the check runs');
  shown.stop();
});

test('the check is never read as the user naming tools', async () => {
  const { readFileSync } = await import('node:fs');
  const host = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(host, /message\?\.source\?\.kind !== 'runtime-context' && message\?\.source\?\.kind !== DEPTH_CHECK_KIND/);
});

test('the Lens: its own section after the standing texts; nothing for Default or helpers; kept with tools off and "Use only these"; paused while studying', async () => {
  const { LENS_PROMPTS } = await import('../lib/lens.js');
  const studying = new Set();
  const world = makeWorld({
    pruneStaleSessions: false,
    extraModes: JSON.stringify({ recon: { label: 'Recon', tools: ['recon_cite'], sandbox: 'read-only', prompt: 'Recon method.', isolated: true } }),
    sessionModes: JSON.stringify({ b1: 'cowork', s1: 'chat', d1: 'cowork', r1: 'recon', off1: 'cowork', st1: 'cowork' }),
    sessionLens: JSON.stringify({ b1: 'blunt', s1: 'skeptic', r1: 'data-only', off1: 'encouraging', st1: 'scientific', bad: 'nonsense' }),
    sessionTools: JSON.stringify({ off1: false }),
  });
  const app = boot(world, { alone: true, studying });
  for (const id of ['b1', 's1', 'd1', 'r1', 'off1', 'st1']) await app.open(id);
  const lens = (id) => app.section(id, 'modes:lens');
  // After the tiers (70) and Self-improve's lessons (72), so it wins on wording.
  assert.equal(lens('b1').order, 73);
  assert.equal(lens('b1').text, LENS_PROMPTS.blunt, 'kept under a model version that stands alone');
  assert.equal(lens('s1').text, LENS_PROMPTS.skeptic);
  assert.equal(lens('r1').text, LENS_PROMPTS['data-only'], 'Recon too (its rules come first, the Lens says so)');
  assert.equal(lens('off1').text, LENS_PROMPTS.encouraging, 'with tools off too: it is about wording');
  assert.equal(lens('d1').text, '', 'Default adds nothing');
  assert.equal(app.service().lens('bad'), 'default', 'an unknown Lens is Default');
  // Modes' own section is unchanged by a Lens.
  assert.ok(!app.prompt('b1').includes('Lens:'));
  // A helper gets nothing (searchers and workers stay neutral), though it follows its conversation's pick.
  await app.open('h1', { header: { parentSession: 'b1' } });
  assert.equal(app.service().lens('h1'), 'blunt');
  assert.equal(lens('h1').text, '');
  // A study session pauses it; it comes back when the session ends.
  studying.add('st1');
  assert.equal(lens('st1').text, '');
  studying.delete('st1');
  assert.equal(lens('st1').text, LENS_PROMPTS.scientific);
  app.stop();
  // Without Learn the Lens simply stays.
  const plain = boot(makeWorld({ pruneStaleSessions: false, sessionLens: JSON.stringify({ x1: 'blunt' }) }));
  await plain.open('x1');
  assert.equal(plain.section('x1', 'modes:lens').text, LENS_PROMPTS.blunt);
  plain.stop();
});

test('the Lens pick is kept per conversation like Depth: cleaned up, carried into Rerun, kept on each Mac, searchable', async () => {
  const { readFileSync } = await import('node:fs');
  const host = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(host, /sessionLens: z\.string\(\)\.default\('\{\}'\)\.volatile\(\),/);
  assert.match(host, /const fields = \[[^\]]*'sessionLens'[^\]]*\];/);
  assert.match(client, /const CARRIED = \[[^\]]*'sessionLens'/);
  const { ALWAYS_SKIP } = await import('../../dsh-shared-settings/index.mjs');
  assert.ok(ALWAYS_SKIP.includes('modes.sessionLens'));
  const index = JSON.parse(readFileSync(new URL('../../dsh-settings-plus/settings-index.json', import.meta.url), 'utf8'));
  assert.ok(index.some((entry) => entry.field === 'modes.sessionLens'));
  const learn = readFileSync(new URL('../../dsh-learn/index.js', import.meta.url), 'utf8');
  assert.match(learn, /studying: \(sessionId\) => settings\(\)\.enabled && Boolean\(sessions\.get\(String\(sessionId \?\? ''\)\)\)/);
});

test('Deep research\'s writer gets the conversation\'s Lens text (helpers too follow their conversation); none while studying', async () => {
  const { LENS_PROMPTS } = await import('../lib/lens.js');
  const studying = new Set();
  const app = boot(makeWorld({ pruneStaleSessions: false, sessionLens: JSON.stringify({ w1: 'journalistic' }) }), { studying });
  await app.open('w1');
  await app.open('w2');
  await app.open('wh', { header: { parentSession: 'w1' } });
  assert.equal(app.service().lensWords('w1'), LENS_PROMPTS.journalistic);
  assert.equal(app.service().lensWords('wh'), LENS_PROMPTS.journalistic, 'a run started by a helper of the conversation');
  assert.equal(app.service().lensWords('w2'), '', 'Default');
  studying.add('w1');
  assert.equal(app.service().lensWords('w1'), '');
  app.stop();
});

test('your own Lens reaches the conversation\'s instructions with the guard; removed, the conversation is back on Default', async () => {
  const { LENS_GUARD } = await import('../lib/lens.js');
  const world = makeWorld({ pruneStaleSessions: false, ownLenses: [{ id: 'own-calm', name: 'Calm', text: 'Short sentences.' }], sessionLens: JSON.stringify({ o1: 'own-calm' }) });
  const app = boot(world);
  await app.open('o1');
  assert.equal(app.section('o1', 'modes:lens').text, `Lens: Calm. Short sentences. ${LENS_GUARD}`);
  assert.equal(app.service().lensWords('o1'), `Lens: Calm. Short sentences. ${LENS_GUARD}`, 'Deep research\'s writer too');
  world.config.ownLenses = [];
  assert.equal(app.service().lens('o1'), 'default');
  assert.equal(app.section('o1', 'modes:lens').text, '');
  app.stop();
});
