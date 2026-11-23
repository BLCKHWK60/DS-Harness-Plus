// Item 4A, fix round 2. A draft's mode picked before the first message brings that mode's starting values (Settings →
// Modes → Starting values), without undoing what the owner set by hand on the draft; after the first message a mode
// change keeps Web and Depth (review: high). A reused blank draft re-claimed for another space takes that mode's start
// access unless the access was changed by hand on it (review: low). /mode on a draft gets a visible reply (review: low).
import assert from 'node:assert/strict';
import test from 'node:test';
import { restartOps, seededBy, startOps, normalizeStart } from '../lib/start.js';
import { draftAccessStep } from '../lib/sandbox.js';

process.env.DSH_MODES_PRESET_SETTLE_MS = '0';
const { boot, makeWorld, settle } = await import('./app.mjs');

const json = (value) => JSON.parse((typeof value === 'string' ? value : value?.get?.()) || '{}');
const EXTRA = {
  research: { label: 'Research', tools: 'all', sandbox: 'inherit', prompt: 'Research.' },
  bench: { label: 'Devices', tools: ['bench_read'], sandbox: 'read-only', prompt: 'Devices.' },
};
const DEFAULT_WS = '/Users/me/Documents/deepseek-harness/default-workspace';

function app(fields = {}, options = {}) {
  const world = makeWorld({ extraModes: JSON.stringify(EXTRA), ...fields, defaultLevel: options.defaultLevel ?? 'read-only' });
  const run = boot(world, { tabs: true, known: ['read', 'bench_read'], ...options });
  return { run, world };
}

test('restartOps: what the earlier start wrote is taken back, hand-set values stay, the new values go in', () => {
  const first = startOps(normalizeStart({ depth: 'quick', web: 'off' }), {}, 'd');
  const seeded = seededBy(first, 'd');
  assert.deepEqual(seeded, { sessionWeb: false, sessionDepth: 'quick' });
  const current = { sessionWeb: JSON.stringify({ d: false }), sessionDepth: JSON.stringify({ d: 'quick', other: 'standard' }), sessionHelpers: JSON.stringify({ d: 'roles' }) };
  const plan = restartOps(normalizeStart({ depth: 'thorough' }), current, 'd', seeded);
  const out = Object.fromEntries(plan.ops.map((op) => [op.path[0], JSON.parse(op.value)]));
  assert.deepEqual(out.sessionDepth, { d: 'thorough', other: 'standard' }, 'the new mode\'s Depth; other threads untouched');
  assert.deepEqual(out.sessionWeb, {}, 'the earlier mode\'s Web Off is taken back (the new mode has none: the usual)');
  assert.equal(out.sessionHelpers, undefined, 'Helpers was set by hand (nothing seeded it): left alone');
  assert.deepEqual(plan.seeded, { sessionDepth: 'thorough' });
  // A seeded value changed by hand since stays.
  const hand = restartOps(normalizeStart({ depth: 'thorough' }), { sessionDepth: JSON.stringify({ d: 'standard' }) }, 'd', { sessionDepth: 'quick' });
  assert.deepEqual(hand.ops, []);
});

test('a Mode list pick on a draft brings the picked mode\'s starting values; after the first message nothing changes', async () => {
  const modeStart = { plain: { depth: 'quick' }, research: { depth: 'thorough', web: 'off' } };
  const { run, world } = app({ modeStart: JSON.stringify(modeStart) });
  const { agent } = await run.open('d1', { header: { cwd: DEFAULT_WS } });
  await settle();
  await run.service().spaces.startDraft('d1', { space: 'chat' });
  await settle();
  assert.equal(run.service().get('d1'), 'plain');
  assert.equal(json(world.config.sessionDepth).d1, 'quick', 'Plain chat\'s start');
  await run.service().spaces.pick('d1', 'research');
  await settle();
  assert.equal(json(world.config.sessionDepth).d1, 'thorough', 'Research\'s start, not Plain chat\'s');
  assert.equal(json(world.config.sessionWeb).d1, false);
  // Back to Plain chat before the first message: Research's values go, Plain chat's come back.
  await run.service().spaces.pick('d1', 'plain');
  await settle();
  assert.equal(json(world.config.sessionDepth).d1, 'quick');
  assert.equal(json(world.config.sessionWeb).d1, undefined);
  await run.firstTurn(agent);
  await settle();
  // After the first message (the owner's answer): Web, Depth and Lens stay as they are.
  await run.service().spaces.pick('d1', 'research');
  await settle();
  assert.equal(json(world.config.sessionDepth).d1, 'quick');
  assert.equal(json(world.config.sessionWeb).d1, undefined);
});

test('what the owner set by hand on the draft is not overridden by a later pick', async () => {
  const modeStart = { plain: { depth: 'quick' }, research: { depth: 'thorough', helpers: 'roles' } };
  const { run, world } = app({ modeStart: JSON.stringify(modeStart) });
  await run.open('d2', { header: { cwd: DEFAULT_WS } });
  await settle();
  await run.service().spaces.startDraft('d2', { space: 'chat' });
  await settle();
  // The owner picks Standard on the Depth button and Same on Models, on the draft.
  world.config.sessionDepth = JSON.stringify({ ...json(world.config.sessionDepth), d2: 'standard' });
  world.config.sessionHelpers = JSON.stringify({ d2: 'same' });
  await run.service().spaces.pick('d2', 'research');
  await settle();
  assert.equal(json(world.config.sessionDepth).d2, 'standard');
  assert.equal(json(world.config.sessionHelpers).d2, 'same');
});

test('draftAccessStep: the new mode\'s start access, unless changed by hand on the draft', () => {
  // Devices set Read only; the draft is claimed for a mode that inherits: back to the level from before.
  assert.deepEqual(draftAccessStep({ sandbox: 'inherit', level: 'read-only', known: { base: 'workspace-write', set: 'read-only' }, wrote: 'read-only' }), { write: 'workspace-write' });
  // A mode with a level of its own.
  assert.deepEqual(draftAccessStep({ sandbox: 'workspace-write', level: 'read-only', known: { base: 'read-only', set: 'read-only' }, wrote: 'read-only' }), { write: 'workspace-write' });
  // Changed by hand since Modes wrote it: left alone.
  assert.deepEqual(draftAccessStep({ sandbox: 'inherit', level: 'danger-full-access', known: { base: 'workspace-write', set: 'read-only' }, wrote: 'read-only' }), {});
  // Already right, or nothing known to go back to.
  assert.deepEqual(draftAccessStep({ sandbox: 'inherit', level: 'workspace-write', known: { base: 'workspace-write', set: 'read-only' }, wrote: 'read-only' }), {});
  assert.deepEqual(draftAccessStep({ sandbox: 'inherit', level: 'read-only', known: undefined, wrote: undefined, base: undefined }), {});
  // Modes never set a level on it: the level is the owner's (or the preset's), left alone.
  assert.deepEqual(draftAccessStep({ sandbox: 'inherit', level: 'read-only', known: undefined, wrote: undefined, base: 'workspace-write' }), {});
  // After a restart (nothing written in this run): the stored entry says what Modes set.
  assert.deepEqual(draftAccessStep({ sandbox: 'inherit', level: 'read-only', known: { base: 'workspace-write', set: 'read-only' } }), { write: 'workspace-write' });
});

test('a reused blank draft: a Read only start mode does not stay when the draft is claimed again for Chat; a hand pick does', async () => {
  // Item 4A, stage 6a: a draft claimed for Devices is recorded there at once and is never claimed for another space (the
  // window opens a fresh draft: `keptIn`). The access rule is checked with Chat (Read only) started in Code instead.
  const { run } = app({ modeSpaces: JSON.stringify({ chat: ['chat', 'code'] }), spaceSettings: JSON.stringify({ code: { startMode: 'chat' } }) }, { defaultLevel: 'workspace-write' });
  const { agent } = await run.open('r1', { header: { cwd: '/Users/me/src/app' } });
  await settle();
  assert.equal((await run.service().spaces.startDraft('r1', { space: 'code' })).mode, 'chat');
  await settle();
  assert.equal(agent.session.level, 'read-only', 'Chat\'s start access');
  assert.equal((await run.service().spaces.startDraft('r1', { space: 'chat' })).mode, 'plain');
  await settle();
  assert.equal(agent.session.level, 'workspace-write', 'the level from before Chat');
  // Again in Code, then the owner picks Full access by hand on the draft: claimed for Chat, it stays.
  await run.service().spaces.startDraft('r1', { space: 'code' });
  await settle();
  assert.equal(agent.session.level, 'read-only');
  agent.session.append('sandbox/mode', { mode: 'danger-full-access' });
  await run.service().spaces.startDraft('r1', { space: 'chat' });
  await settle();
  assert.equal(agent.session.level, 'danger-full-access', 'picked by hand: kept');
  // A Devices draft stays a Devices draft.
  const other = await run.open('r2', { header: { cwd: '/Users/me/src/other' } });
  await settle();
  assert.equal((await run.service().spaces.startDraft('r2', { space: 'devices' })).mode, 'bench');
  await settle();
  assert.deepEqual(await run.service().spaces.startDraft('r2', { space: 'chat' }), { claimed: false, keptIn: 'devices' });
  assert.equal(other.agent.session.level, 'read-only', 'left as Devices set it');
});
