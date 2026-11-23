// Item 4A, stage 3a (22 November 2026): the five space buttons go live. Modes' part: the switch is on, a thread moved to
// another space through the sidebar (lib/spaces.js spaceMovePlan, modes.spaces.move, the route's `move`), the list of
// spaces the sidebar draws its buttons from, and the preset lock read by space (lib/presetlock.js lockInSpace: Recon and
// Devices Standard, Workshop Creator, the Automations mode Standard; the stricter of space and mode, with one line).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPACE_TAB, spaceMovePlan, spaceOfTab, spacesLive } from '../lib/spaces.js';
import { lockConflictLine, lockInSpace, readLocks } from '../lib/presetlock.js';
import { modeHandler } from '../lib/route.js';
import { boot, makeWorld, settle } from './app.mjs';

const RESEARCH = { label: 'Research', tools: 'all', sandbox: 'inherit', prompt: 'Research method.' };
const RECON = { label: 'Recon', tools: ['recon_cite'], sandbox: 'inherit', prompt: 'Recon.', isolated: true };
const BENCH = { label: 'Devices', tools: ['read'], sandbox: 'inherit', prompt: 'Devices.' };
const json = (value) => JSON.parse((typeof value === 'string' ? value : value?.get?.()) || '{}');

function app() {
  const world = makeWorld({ defaultMode: 'cowork', extraModes: JSON.stringify({ research: RESEARCH, recon: RECON, bench: BENCH }) });
  return boot(world, { tabs: true, maxTabs: 5 });
}

test('spaces are live by default now (no Spaces-or-Tabs setting, the owner\'s answer)', () => {
  assert.equal(spacesLive({}), true);
  // Each space's own tab id, read back to the same space (trash, projects and preset locks keep tab ids).
  for (const [space, tab] of Object.entries(SPACE_TAB)) assert.equal(spaceOfTab(tab), space, space);
});

test('moving a thread to another space: it keeps its mode where the space offers it, else gets the start mode', () => {
  const chat = [{ id: 'chat' }, { id: 'cowork' }, { id: 'research' }];
  const code = [{ id: 'code' }, { id: 'research' }];
  const shown = ['chat', 'code', 'devices', 'recon'];
  assert.deepEqual(spaceMovePlan({ to: 'code', from: 'chat', current: 'research', sealed: false, shown, offered: code }), { refusal: '', space: 'code' });
  assert.deepEqual(spaceMovePlan({ to: 'code', from: 'chat', current: 'cowork', sealed: false, shown, offered: code }), { refusal: '', space: 'code', mode: 'code' });
  assert.deepEqual(spaceMovePlan({ to: 'chat', from: 'code', current: 'code', sealed: false, shown, offered: chat }), { refusal: '', space: 'chat', mode: 'chat' });
  // The owner's start mode for the space wins over the table's.
  assert.equal(spaceMovePlan({ to: 'chat', from: 'code', current: 'code', sealed: false, shown, offered: chat, spaceSettings: { chat: { startMode: 'cowork' } } }).mode, 'cowork');
  assert.deepEqual(spaceMovePlan({ to: 'devices', from: 'chat', current: 'chat', sealed: false, shown, offered: [{ id: 'bench' }, { id: 'research', greyed: true }] }), { refusal: '', space: 'devices', mode: 'bench' }, 'a greyed mode is never kept');
});

test('a refused move says what went wrong and what to do, in English (also on a Chinese page)', () => {
  const shown = ['chat', 'code', 'recon'];
  const sealed = spaceMovePlan({ to: 'chat', from: 'recon', current: 'recon', sealed: true, shown, offered: [{ id: 'chat' }] });
  assert.match(sealed.refusal, /^This thread is sealed \(it ran in Recon\), so it stays in Recon\. Use Move to/);
  assert.match(spaceMovePlan({ to: 'recon', from: 'chat', current: 'chat', sealed: false, shown, offered: [{ id: 'recon' }] }).refusal, /cannot move into Recon.*Start a new Recon search instead\./);
  assert.match(spaceMovePlan({ to: 'devices', from: 'chat', current: 'chat', sealed: false, shown, offered: [] }).refusal, /^Devices is switched off or hidden/);
  assert.match(spaceMovePlan({ to: 'nowhere', from: 'chat', current: 'chat', sealed: false, shown, offered: [] }).refusal, /^There is no space "nowhere"/);
  assert.match(spaceMovePlan({ to: 'code', from: 'chat', current: 'chat', sealed: false, shown, offered: [] }).refusal, /^Code has no mode this thread could use\. Tick a mode for Code on Settings → Modes/);
  const zh = spaceMovePlan({ to: 'recon', from: 'chat', current: 'chat', sealed: false, shown, offered: [], lang: 'zh' });
  assert.match(zh.refusal, /^A thread cannot move into Recon/);
  assert.match(spaceMovePlan({ to: 'devices', from: 'chat', current: 'chat', sealed: false, shown, offered: [], lang: 'zh' }).refusal, /^Devices is switched off or hidden/);
});

test('modes.spaces.move: the space is recorded, the mode follows only where needed, a quiet line for a thread that ran', async () => {
  const run = app();
  const { agent } = await run.open('m1');
  await run.service().spaces.startDraft('m1', { space: 'chat' });
  // Plain chat (Chat's start mode since stage 4) is offered in Code too; the Chat mode is not.
  await run.service().spaces.pick('m1', 'chat');
  await run.firstTurn(agent);
  await settle();
  assert.equal(json(run.config.sessionSpaces).m1, 'chat');
  agent.status = 'idle';
  agent.phase = { kind: 'idle', lastTurn: 1 };
  // Chat (its start mode) is not offered in Code: the thread gets Code's start mode, from its next message.
  const moved = await run.service().spaces.move(['m1'], 'code');
  assert.deepEqual(moved, { moved: 1, changed: 1 });
  assert.equal(json(run.config.sessionSpaces).m1, 'code');
  assert.equal(json(run.config.sessionModes).m1, 'code');
  assert.equal(run.service().spaces.of('m1'), 'code');
  assert.deepEqual(json(run.config.sessionModeChanges).m1.map((row) => [row.turn, row.from, row.to]), [[1, 'chat', 'code']]);
  // Research picked in Code, then moved to Chat: Research is offered there too, so it stays.
  await run.service().set('m1', 'research');
  assert.deepEqual(await run.service().spaces.move(['m1'], 'chat'), { moved: 1, changed: 0 });
  assert.equal(json(run.config.sessionModes).m1, 'research');
  assert.equal(json(run.config.sessionSpaces).m1, 'chat');
});

test('modes.spaces.move refuses a sealed thread and a move into Recon, and writes nothing', async () => {
  const run = app();
  const { agent } = await run.open('r1');
  await run.service().spaces.startDraft('r1', { space: 'recon' });
  await run.firstTurn(agent);
  await settle();
  assert.equal(json(run.config.sessionSpaces).r1, 'recon');
  const before = JSON.stringify(json(run.config.sessionSpaces));
  await assert.rejects(run.service().spaces.move(['r1'], 'chat'), /This thread is sealed/);
  const other = await run.open('c1');
  await run.service().spaces.startDraft('c1', { space: 'chat' });
  await run.firstTurn(other.agent);
  await settle();
  // One refusal stops the whole move: c1 is not moved either.
  await assert.rejects(run.service().spaces.move(['c1', 'r1'], 'code'), /sealed/);
  assert.equal(json(run.config.sessionSpaces).c1, 'chat');
  await assert.rejects(run.service().spaces.move(['c1'], 'recon'), /cannot move into Recon/);
  assert.equal(JSON.parse(before).r1, 'recon');
});

test('the Mode list\'s answer carries the five spaces for the sidebar\'s buttons', async () => {
  const run = app();
  const view = run.service().spaces.view('');
  assert.equal(view.live, true);
  const shown = view.spaces.filter((row) => row.shown).map((row) => row.id);
  assert.deepEqual(shown, ['chat', 'code', 'devices', 'recon'], 'Workshop needs Creator Plus or Tuner Plus');
  assert.equal(view.spaces.find((row) => row.id === 'devices').startMode, 'bench');
});

/** A stand-in request and reply for the route. */
function call(handler, { method = 'GET', headers = {}, body } = {}) {
  const req = { method, headers, async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)); } };
  const res = { statusCode: 200, headers: {}, body: '', setHeader(name, value) { this.headers[name] = value; }, end(text = '') { this.body = text; } };
  return handler(req, res).then(() => ({ status: res.statusCode, answer: res.body ? JSON.parse(res.body) : null }));
}

test('the route: POST move passes the threads (at most 500, valid ids only) and the space; a refusal is its sentence', async () => {
  const calls = [];
  const service = {
    view: () => ({}),
    move: async (ids, space, options) => {
      calls.push([ids, space, options.lang]);
      if (space === 'recon') throw new Error('A thread cannot move into Recon: Recon threads start there, sealed. Start a new Recon search instead.');
      return { moved: ids.length, changed: 0 };
    },
  };
  const handler = modeHandler({ spaces: () => service, connection: { requestRejection: () => undefined } });
  const ok = await call(handler, { method: 'POST', headers: { 'x-dsh-locale': 'zh' }, body: { action: 'move', sessionId: 'a', sessionIds: ['a', 'bad id!', 'b'], space: 'code' } });
  assert.deepEqual(ok.answer, { ok: true, value: { moved: 2, changed: 0 } });
  assert.deepEqual(calls.at(-1), [['a', 'b'], 'code', 'en'], 'a Chinese page is passed on as English');
  const refused = await call(handler, { method: 'POST', body: { action: 'move', sessionId: 'a', sessionIds: ['a'], space: 'recon' } });
  assert.equal(refused.answer.ok, false);
  assert.match(refused.answer.error, /^A thread cannot move into Recon/);
});

test('preset lock by space: Recon and Devices Standard, Workshop Creator, Chat and Code Any; the mode keeps its own', () => {
  const none = readLocks('{}');
  // Stage 5: a space's own key (recon, bench, creator-plus, chat, code) is the space's lock, not also its mode's.
  assert.deepEqual(lockInSpace(none, 'recon', 'recon'), { lock: 'standard', from: 'space', conflict: false, spaceLock: 'standard', modeLock: 'any' });
  assert.equal(lockInSpace(none, 'devices', 'bench').lock, 'standard');
  assert.equal(lockInSpace(none, 'workshop', 'creator-plus').lock, 'creator');
  assert.equal(lockInSpace(none, 'chat', 'chat').lock, 'any');
  assert.equal(lockInSpace(none, 'code', 'research').lock, 'any');
  // The Automations mode keeps its Standard lock in Chat.
  assert.deepEqual(lockInSpace(none, 'chat', 'automations'), { lock: 'standard', from: 'mode', conflict: false, spaceLock: 'any', modeLock: 'standard' });
  // Saved choices under today's keys keep working (read, never rewritten).
  assert.equal(lockInSpace(readLocks('{"recon":"any"}'), 'recon', 'recon').lock, 'any');
  assert.equal(lockInSpace(readLocks('{"bench":"creator"}'), 'devices', 'bench').lock, 'creator');
  assert.equal(lockInSpace(readLocks('{"code":"standard"}'), 'code', 'code').lock, 'standard', 'the former Code tab\'s lock holds as the Code space\'s');
  // Stage 5: Chat and Code read their space's lock from the former tab keys; Plain chat in Chat gets Chat's lock.
  assert.deepEqual(lockInSpace(readLocks('{"chat":"standard"}'), 'chat', 'plain'), { lock: 'standard', from: 'space', conflict: false, spaceLock: 'standard', modeLock: 'any' });
  // The Chat mode ticked into Code does not take Chat's lock along.
  assert.equal(lockInSpace(readLocks('{"chat":"standard"}'), 'code', 'chat').lock, 'any');
});

test('preset lock by space: the stricter wins; when both lock to different presets the space wins with one line', () => {
  // A mode locked to Creator in a space locked to Standard (possible once other modes run in guarded spaces, stage 6a).
  const table = readLocks('{"mine":"creator"}');
  const held = lockInSpace(table, 'recon', 'mine');
  assert.deepEqual(held, { lock: 'standard', from: 'space', conflict: true, spaceLock: 'standard', modeLock: 'creator' });
  assert.equal(lockConflictLine({ space: 'Recon', mode: 'Mine', spaceLock: 'standard', modeLock: 'creator' }), 'Recon is set to Standard only and Mine to Creator only: the space wins, so Standard is used here. Change it on Settings → Spaces.');
  assert.equal(lockConflictLine({ space: 'Recon', mode: 'Mine', spaceLock: 'standard', modeLock: 'creator', lang: 'zh' }), lockConflictLine({ space: 'Recon', mode: 'Mine', spaceLock: 'standard', modeLock: 'creator' }), 'English on a Chinese page');
  // A lock beats Any either way round.
  assert.equal(lockInSpace(readLocks('{"recon":"any","mine":"standard"}'), 'recon', 'mine').lock, 'standard');
});

test('the preset (i) and the backstop read the lock by space while spaces are live', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(source, /const held = lockFor\(sessionId, mode\);\s*const wanted = held\.lock === 'any' \? '' : LOCK_PRESET\[held\.lock\];/);
  assert.match(source, /const held = lockFor\(sessionId, mode, table\);\s*const lock = held\.lock;/);
  assert.match(source, /note: conflict \|\| \(ptc \? reach\.note : ''\),/);
  assert.match(source, /if \(!spacesLive\(\)\) return \{ lock: lockOf\(table, mode\?\.id\), conflict: false \};/);
});
