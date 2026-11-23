/**
 * Item 4A, stage 6a: the space keeps its safety rules for any mode, Modes run whole on the stand-in app
 * (STAGE6A-DESIGN.md 4.1, the app half): the seam, the sealed and guarded copies, the first-message gap, the guards,
 * `guardOf` / `topOf`, `set {space}`, the ready flags and the Settings rows.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { boot, makeWorld, maskNow, settle } from './app.mjs';
import { SEALED_SPACE_NOTE } from '../index.js';
import { MODE as RECON } from '../../dsh-recon/lib/mode.js';
import { MODE as RESEARCH } from '../../dsh-research/lib/mode.js';

const ROOM = realpathSync(mkdtempSync(path.join(tmpdir(), 'dsh-s6a-room-')));
const KNOWN = ['read', 'write', 'glob', 'bash', 'run_code', 'job_list', 'job_kill', 'engine', 'web_search', 'web_fetch', 'deep_research', 'remember', 'todo_write',
  'ask_user_question', 'diagram_draw', 'recon_web_search', 'recon_web_read', 'recon_cite', 'recon_ultra', 'bench_usb', 'mcp__x__start_process', 'mac_shortcuts',
  'office_convert', 'schedule_create', 'tools_catalog', 'request_tool_access', 'working_directory', 'library_read', 'mission_step', 'zzz_tool'];
const EXTRA = {
  recon: RECON,
  research: RESEARCH,
  bench: { label: 'Devices', tools: ['read', 'bench_usb'], sandbox: 'read-only' },
  'creator-plus': { label: 'Creator Plus', tools: 'all' },
};
const TICKS = { research: ['chat', 'code', 'recon', 'devices', 'workshop'], plain: ['chat', 'code', 'recon'], code: ['code', 'devices', 'workshop'] };
const json = (value) => {
  const raw = value && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value;
  return typeof raw === 'string' ? JSON.parse(raw || '{}') : raw ?? {};
};

/** Recon's service as stage 6a has it (apiVersion 3): the room, and a counter of its isRoom answers. */
function reconService({ apiVersion = 3, room = true } = {}) {
  const calls = { isRoom: 0 };
  return {
    calls,
    apiVersion,
    ...(apiVersion >= 3 ? { inSpace: () => true } : {}),
    isRoom: (folder) => {
      calls.isRoom += 1;
      return String(folder ?? '').startsWith(ROOM);
    },
    roomRunFolder: (id) => {
      if (!room) return '';
      const folder = path.join(ROOM, `run-${id}`);
      mkdirSync(folder, { recursive: true });
      return folder;
    },
  };
}

function start(fields = {}, { recon = reconService(), bench = { guestsGuarded: true }, creatorPlus = { guestsGuarded: true }, extra = EXTRA, world: given, ...options } = {}) {
  const world = given ?? makeWorld({ pruneStaleSessions: false, extraModes: JSON.stringify(extra), modeSpaces: JSON.stringify(TICKS), ...fields });
  const services = { recon: recon || null, bench: bench || null, creatorPlus: creatorPlus || null, ...(options.services ?? {}) };
  const app = boot(world, { tabs: true, known: KNOWN, ...options, services });
  return { app, world, recon };
}
const call = (app, one, name, args = {}) => app.guard({ name, agent: one.agent, arguments: args });
const allowOf = (one) => maskNow(one.masks)?.allow ?? null;

test('seal-draft-before-first-message and seal-any-mode: Research in Recon is sealed from the draft on, and after (I1)', async () => {
  const { app, world } = start();
  const r1 = await app.open('r1', { header: { cwd: ROOM } });
  const spaces = app.service().spaces;
  assert.equal((await spaces.startDraft('r1', { space: 'recon' })).mode, 'recon');
  await spaces.pick('r1', 'research');
  await settle();
  assert.equal(app.service().get('r1'), 'research');
  assert.equal(app.service().isolated('r1'), true, 'sealed before its first message');
  const guard = app.service().guardOf('r1');
  assert.equal(guard.sealed, true);
  assert.equal(guard.sealedBy, 'recon');
  assert.equal(guard.reconSpace, true);
  assert.equal(guard.space, 'recon');
  assert.equal(guard.fresh, true);
  assert.equal(json(world.config.sessionSpaces).r1, 'recon', 'recorded at the claim (I3)');
  await app.firstTurn(r1.agent);
  await settle();
  assert.equal(json(world.config.sessionIsolated).r1, true, 'marked');
  const allow = allowOf(r1);
  assert.ok(allow.includes('recon_web_search') && allow.includes('diagram_draw'));
  for (const name of ['web_search', 'web_fetch', 'deep_research', 'remember', 'recon_ultra', 'library_read']) assert.ok(!allow.includes(name), name);
  assert.equal(call(app, r1, 'web_search'), 'In Recon the web is reached only through Recon\'s routes, so web_search was not run. Use recon_web_search and recon_web_read here.', 'lab fix: says why and what to use');
  assert.match(call(app, r1, 'remember') ?? '', /^Nothing was remembered: this thread is in Recon/, 'lab fix: SHARED_REFUSED');
  assert.match(call(app, r1, 'deep_research') ?? '', /^Deep research does not run in Recon/, 'lab fix: DEEP_REFUSED');
  assert.match(call(app, r1, 'finance_profile_save') ?? '', /^The finance profile was not changed/, 'lab fix: PROFILE_REFUSED');
  assert.equal(call(app, r1, 'recon_web_search', { query: 'x' }), undefined);
  assert.ok(!['isolated-locked', 'isolated-late'].includes(app.service().get('r1')));
  // Its helper: isolated, nothing to call.
  const helper = await app.open('r1-h', { header: { parentSession: 'r1' } });
  assert.equal(app.service().isolated('r1-h'), true);
  assert.deepEqual(allowOf(helper), []);
  assert.equal(app.service().topOf('r1-h'), 'r1');
  // The model hears the sealed note once (REGRESSION 20).
  const prompt = app.prompt('r1');
  assert.equal(prompt.split(SEALED_SPACE_NOTE).length - 1, 1);
  // A switch to another mode Recon offers stays sealed (I11); one it does not offer is refused.
  await spaces.pick('r1', 'plain');
  assert.equal(app.service().isolated('r1'), true);
  await assert.rejects(spaces.pick('r1', 'code'), /is not offered in Recon/);
  app.stop();
});

test('sealed-paths-room-only and granted-write-room-only: files only in the thread\'s room folder (I6, I8)', async () => {
  const { app } = start({ toolAccessOn: true });
  const p1 = await app.open('p1', { header: { cwd: ROOM } });
  await app.service().spaces.startDraft('p1', { space: 'recon' });
  await app.service().spaces.pick('p1', 'plain');
  await app.firstTurn(p1.agent);
  await settle();
  const run = path.join(ROOM, 'run-p1');
  assert.ok(allowOf(p1).includes('read'), 'the room is known: file tools kept');
  assert.ok(!allowOf(p1).includes('working_directory'));
  assert.match(call(app, p1, 'read', { file_path: '~/.ssh/x' }) ?? '', /only in this thread's room folder/);
  assert.equal(call(app, p1, 'read', { file_path: path.join(run, 'a.txt') }), undefined);
  // A popup grant of `write`: in the room yes, outside no; a move out of the room no.
  const access = app.provided('toolAccess');
  access.registerCard(async () => ({ choice: 'conversation' }));
  await app.tool('request_tool_access').definition.execute({ tool: 'write', reason: 'notes' }, { agent: p1.agent });
  assert.equal(call(app, p1, 'write', { file_path: path.join(run, 'n.txt'), content: 'x' }), undefined);
  assert.match(call(app, p1, 'write', { file_path: '/Users/me/Desktop/x.txt', content: 'x' }) ?? '', /only in this thread's room folder/);
  assert.match(call(app, p1, 'move', { from: path.join(run, 'n.txt'), to: '/Users/me/n.txt' }) ?? '', /room folder|not one of this Recon thread's tools/);
  app.stop();
  // Recorded in Recon but its room unknown: no file tools at all.
  const blind = start({ sessionSpaces: JSON.stringify({ q1: 'recon' }), sessionModes: JSON.stringify({ q1: 'plain' }) }, { recon: reconService({ room: false }) });
  const q1 = await blind.app.open('q1', { source: 'resume', lastTurn: 2 });
  assert.equal(blind.app.service().isolated('q1'), true);
  assert.ok(!allowOf(q1).includes('read'));
  blind.app.stop();
});

test('first-message-gap and space-write-retry: a failed write keeps the space in memory and is tried again (I3)', async () => {
  let failing = true;
  const { app, world } = start({}, { failWrite: (ops) => failing && ops.some((op) => op.path[0] === 'sessionSpaces') });
  const d1 = await app.open('d1', { header: { cwd: '/Users/me/src/app' } });
  const spaces = app.service().spaces;
  assert.equal((await spaces.startDraft('d1', { space: 'devices' })).mode, 'bench');
  await settle();
  assert.equal(json(world.config.sessionSpaces).d1, undefined, 'the write failed');
  assert.deepEqual({ ...spaces.pending() }, { d1: 'devices' }, 'held in memory (the sidebar lists it)');
  await app.service().set('d1', 'code', { space: 'devices' });
  await app.firstTurn(d1.agent);
  await settle();
  assert.equal(spaces.of('d1'), 'devices');
  assert.equal(app.service().guardOf('d1').guardedBy, 'devices');
  failing = false;
  // The next turn tries again.
  const other = await app.open('o1');
  await app.firstTurn(other.agent);
  await settle();
  await app.emit('agent/status', { agent: d1.agent, status: 'running' });
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 10));
  await settle();
  assert.equal(json(world.config.sessionSpaces).d1, 'devices', 'written by the retry');
  assert.deepEqual({ ...spaces.pending() }, {}, 'nothing left in memory');
  app.stop();
});

test('claim-records-guarded: a Devices draft is recorded at its claim and stays guarded after a restart (I3)', async () => {
  const first = start();
  const d2 = await first.app.open('d2', { header: { cwd: '/Users/me/src/app' } });
  await first.app.service().spaces.startDraft('d2', { space: 'devices' });
  await first.app.service().set('d2', 'code', { space: 'devices' });
  await settle();
  assert.equal(json(first.world.config.sessionSpaces).d2, 'devices', 'written before any message');
  first.app.stop();
  const again = start({}, { world: first.world });
  await again.app.open('d2', { source: 'resume', header: { cwd: '/Users/me/src/app' } });
  assert.equal(again.app.service().guardOf('d2').guardedBy, 'devices');
  assert.equal(again.app.guard({ name: 'bash', agent: { id: 'd2' }, arguments: {} }) !== undefined, true);
  again.app.stop();
});

test('first-turn-waits-claim: the first step waits for a claim in flight, then has its space\'s tools', async () => {
  const { app } = start({}, { writeDelay: 30 });
  const d3 = await app.open('d3', { header: { cwd: '/Users/me/src/app' } });
  const claiming = app.service().spaces.startDraft('d3', { space: 'devices' });
  let seen;
  await app.waterfall('agent/pre-step', { agent: d3.agent, messages: [] }, () => {
    seen = app.service().guardOf('d3').guardedBy;
    return { kind: 'enter', messages: [] };
  });
  await claiming;
  assert.equal(seen, 'devices', 'the step saw the claimed space');
  app.stop();
});

test('mark-lost-still-sealed and recon-off-locked / recon-old-locked (I2, I10)', async () => {
  const stored = { sessionSpaces: JSON.stringify({ t: 'recon' }), sessionModes: JSON.stringify({ t: 'research' }) };
  const { app } = start(stored);
  await app.open('t', { source: 'resume', lastTurn: 3 });
  assert.equal(app.service().get('t'), 'research', 'not LATE: the recorded space wins over a lost mark');
  assert.equal(app.service().isolated('t'), true);
  app.stop();
  const { recon: _gone, ...noRecon } = EXTRA;
  void _gone;
  const off = start(stored, { extra: noRecon });
  await off.app.open('t', { source: 'resume', lastTurn: 3 });
  assert.equal(off.app.service().get('t'), 'isolated-locked');
  assert.equal(off.app.service().isolated('t'), true, 'never unsealed');
  off.app.stop();
  const old = start(stored, { recon: reconService({ apiVersion: 2 }) });
  await old.app.open('t', { source: 'resume', lastTurn: 3 });
  assert.equal(old.app.service().get('t'), 'isolated-locked');
  const row = old.app.service().spaces.page('en').modes.find((mode) => mode.id === 'research').ticks.find((tick) => tick.space === 'recon');
  assert.equal(row.greyed, true);
  assert.equal(row.reason, 'Needs a newer Recon: update it in Settings → Recon.');
  old.app.stop();
});

test('fail-closed-read: unreadable stored values never open a guarded thread (I4)', async () => {
  const { app, world } = start({ sessionIsolated: JSON.stringify({ m: true }), sessionModes: JSON.stringify({ m: 'research', dv: 'code' }), sessionSpaces: JSON.stringify({ dv: 'devices' }) });
  await app.open('m', { source: 'resume', lastTurn: 2 });
  const dv = await app.open('dv', { source: 'resume', lastTurn: 2 });
  // A stored value whose read fails (as a reactive setting does when it cannot be read).
  const unreadable = () => Object.freeze({ get: () => { throw new Error('unreadable'); } });
  const kept = { ...world.config };
  world.config.sessionSpaces = unreadable();
  assert.equal(app.service().isolated('m'), true, 'a marked thread stays sealed');
  assert.equal(app.service().guardOf('m').sealedBy, 'recon');
  world.config.sessionSpaces = '{"dv": "devices", "m": "chat"';
  assert.equal(app.service().isolated('m'), true, 'a damaged table reads as unreadable, not as empty');
  world.config.sessionSpaces = kept.sessionSpaces;
  world.config.sessionModes = unreadable();
  assert.equal(app.service().guardOf('dv').guardedBy, 'devices', 'the Devices record still guards');
  for (const key of ['sessionSpaces', 'sessionIsolated']) world.config[key] = unreadable();
  const guard = app.service().guardOf('dv');
  assert.equal(guard.guardedBy, 'unknown', 'nothing readable: the base guard');
  assert.equal(guard.noPrograms, true);
  assert.match(call(app, dv, 'bash') ?? '', /refuses the Terminal/);
  assert.match(call(app, dv, 'run_code') ?? '', /refuses the Terminal/);
  assert.equal(call(app, dv, 'read', { file_path: '/tmp/x' }), undefined, 'reading still works');
  for (const key of ['sessionSpaces', 'sessionIsolated', 'sessionModes']) world.config[key] = kept[key];
  app.stop();
});

test('unknown-helper-sealed, unknown-helper-devices and helper-unloaded-parent (I5)', async () => {
  const { app } = start({ sessionSpaces: JSON.stringify({ r: 'recon', P: 'recon' }), sessionModes: JSON.stringify({ r: 'recon', P: 'research' }) });
  await app.open('r', { source: 'resume', lastTurn: 1 });
  const lost = await app.open('lost', { header: { delegationDepth: 1 } });
  assert.equal(app.service().get('lost'), 'isolated-locked');
  assert.equal(app.service().isolated('lost'), true);
  assert.deepEqual(allowOf(lost), []);
  assert.equal(app.service().topOf('lost'), '');
  assert.equal(app.service().guardOf('lost').unknownTop, true);
  assert.equal(app.service().guardOf('lost').guardedBy, 'unknown');
  // A header naming a parent that is not loaded: its recorded space decides.
  await app.open('ph', { header: { parentSession: { id: 'P' } } });
  assert.equal(app.service().topOf('ph'), 'P');
  assert.equal(app.service().isolated('ph'), true);
  assert.equal(app.service().spaces.of('ph'), 'recon');
  app.stop();
  // Only a Devices thread loaded: an unknown helper is held too.
  const devices = start({ sessionSpaces: JSON.stringify({ d: 'devices' }), sessionModes: JSON.stringify({ d: 'code' }) });
  await devices.app.open('d', { source: 'resume', lastTurn: 1 });
  await devices.app.open('lost', { header: { delegationDepth: 1 } });
  assert.equal(devices.app.service().get('lost'), 'isolated-locked');
  devices.app.stop();
  // No guarded thread: as today.
  const calm = start({ sessionSpaces: JSON.stringify({ c: 'chat' }), sessionModes: JSON.stringify({ c: 'code' }) });
  await calm.app.open('c', { source: 'resume', lastTurn: 1 });
  await calm.app.open('lost', { header: { delegationDepth: 1 } });
  assert.notEqual(calm.app.service().get('lost'), 'isolated-locked');
  calm.app.stop();
});

test('seam-memo and no-recursion: many reads cost one room check and return the same object (I18, I29)', async () => {
  const { app, recon } = start({ sessionSpaces: JSON.stringify({ s: 'recon' }), sessionModes: JSON.stringify({ s: 'research' }) });
  await app.open('s', { source: 'resume', lastTurn: 1, header: { cwd: ROOM } });
  recon.calls.isRoom = 0;
  for (let index = 0; index < 1000; index += 1) app.service().get('s');
  assert.ok(recon.calls.isRoom <= 2, `isRoom asked ${recon.calls.isRoom} times`);
  for (let index = 0; index < 10_000; index += 1) app.service().isolated('s');
  const before = app.service().guardOf('s');
  assert.equal(app.service().guardOf('s').mode, before.mode);
  app.stop();
});

test('set-space and room-mode-check: a claim names its space (I23)', async () => {
  const { app } = start({ sessionSpaces: JSON.stringify({ ran: 'code' }), sessionModes: JSON.stringify({ ran: 'code' }) });
  const service = app.service();
  await app.open('in-room', { header: { cwd: ROOM } });
  await service.set('in-room', 'research', { claim: true, space: 'recon' });
  assert.equal(service.guardOf('in-room').sealedBy, 'recon');
  await app.open('out', { header: { cwd: '/Users/me/src/app' } });
  await assert.rejects(service.set('out', 'research', { claim: true, space: 'recon' }), /Recon threads work only in Recon's room/);
  await app.open('nt', { header: { cwd: '/Users/me/src/app' } });
  await assert.rejects(service.set('nt', 'chat', { claim: true, space: 'devices' }), /Chat is not offered in Devices/);
  await app.open('ran', { source: 'resume', lastTurn: 2 });
  await assert.rejects(service.set('ran', 'code', { space: 'chat' }), /This thread is in Code, and a thread never changes space/);
  // A claim without a space follows the draft's space: guarded.
  await app.open('auto', { header: { cwd: '/Users/me/src/app' } });
  await service.spaces.startDraft('auto', { space: 'devices' });
  await service.set('auto', 'research', { claim: true });
  assert.equal(service.guardOf('auto').guardedBy, 'devices');
  // A room draft takes only a mode Recon offers.
  await app.open('room-2', { header: { cwd: ROOM } });
  await service.spaces.startDraft('room-2', { space: 'recon' });
  await assert.rejects(service.set('room-2', 'code', { claim: true }), /can only use a mode Recon offers/);
  await service.set('room-2', 'research', { claim: true });
  assert.equal(service.get('room-2'), 'research');
  // An empty folder is not refused: recorded in Recon, checked again at the first message.
  await app.open('nofolder');
  assert.equal((await service.spaces.startDraft('nofolder', { space: 'recon' })).space, 'recon');
  // A draft recorded in a guarded space is kept there.
  assert.deepEqual(await service.spaces.startDraft('auto', { space: 'chat' }), { claimed: false, keptIn: 'devices' });
  app.stop();
});

test('recon-non-room-refused: a Recon start for a draft outside the room is refused in the window\'s language (I9; integration)', async () => {
  const { app, world } = start();
  await app.open('far', { header: { cwd: '/Users/me/src/app' } });
  await assert.rejects(app.service().spaces.startDraft('far', { space: 'recon' }), /Recon threads work only in Recon's room/);
  await assert.rejects(app.service().spaces.startDraft('far', { space: 'recon', lang: 'zh' }), /^Error: Recon threads work only in Recon's room/);
  assert.equal(json(world.config.sessionSpaces).far, undefined, 'nothing recorded');
  assert.equal(app.service().guardOf('far').reconSpace, false);
  app.stop();
});

test('guarded-copy and base-noprograms-guard: guests in Devices and Workshop (I13, I14)', async () => {
  const { app } = start({ sessionSpaces: JSON.stringify({ cd: 'devices', cw: 'workshop' }), sessionModes: JSON.stringify({ cd: 'code', cw: 'research' }) });
  const cd = await app.open('cd', { source: 'resume', lastTurn: 1 });
  const cw = await app.open('cw', { source: 'resume', lastTurn: 1 });
  const guard = app.service().guardOf('cd');
  assert.equal(guard.guardedBy, 'devices');
  assert.equal(guard.noPrograms, true);
  assert.equal(guard.sealed, false);
  const mask = maskNow(cd.masks);
  for (const name of ['bash', 'run_code', 'job_list', 'engine', 'zzz_tool']) assert.ok(mask.deny?.includes(name) || (mask.allow && !mask.allow.includes(name)), name);
  for (const one of [cd, cw]) {
    for (const name of ['bash', 'run_code', 'job_kill', 'engine', 'mcp__x__start_process', 'mac_shortcuts', 'office_convert']) assert.match(call(app, one, name) ?? '', /refuses the Terminal/, `${one.agent.id} ${name}`);
    // Stage 6b (7.6, J14): schedules are open to a guest in Devices and Workshop.
    assert.equal(call(app, one, 'schedule_create'), undefined, `${one.agent.id} schedule_create`);
    assert.equal(call(app, one, 'read', { file_path: '/tmp/x' }), undefined);
  }
  assert.ok(allowOf(cw) === null || !allowOf(cw).includes('bench_usb'), 'no device tools in Workshop');
  app.stop();
  // Bench off (its mode gone). Fix round (6a review, the owner's "never the Devices folder or /dev"): guests are held
  // without tools until it is back (the base rule has no folder rule).
  const { bench: _bench, ...noBench } = EXTRA;
  void _bench;
  const off = start({ sessionSpaces: JSON.stringify({ cd: 'devices' }), sessionModes: JSON.stringify({ cd: 'code' }) }, { extra: noBench, bench: null });
  const cd2 = await off.app.open('cd', { source: 'resume', lastTurn: 1 });
  assert.equal(off.app.service().get('cd'), 'isolated-locked');
  assert.notEqual(call(off.app, cd2, 'bash'), undefined);
  assert.notEqual(call(off.app, cd2, 'write', { file_path: '/dev/cu.usbserial-0001', content: 'x' }), undefined, 'never /dev');
  assert.notEqual(call(off.app, cd2, 'read', { file_path: '/tmp/x' }), undefined);
  off.app.stop();
});

test('ready-flags, old-guard-held and not-ready-draft-locked (I16, I25, I27)', async () => {
  const stored = { sessionSpaces: JSON.stringify({ cd: 'devices' }), sessionModes: JSON.stringify({ cd: 'code' }) };
  const old = start(stored, { bench: {} });
  await old.app.open('cd', { source: 'resume', lastTurn: 1 });
  assert.equal(old.app.service().get('cd'), 'isolated-locked', 'held until Bench is updated');
  assert.deepEqual({ ...old.app.service().spaces.ready() }, { devices: false, recon: true, workshop: true });
  const view = old.app.service().spaces.view('cd');
  assert.equal(view.effective.held.reason, 'old');
  assert.equal(view.effective.held.text, 'This thread has no tools for now: the Devices add-on is too old to guard it. Update it, then switch it off and on in Settings → Devices.');
  assert.equal(view.currentLabel, 'Code', 'the mode it chose, never "Sealed"');
  const tick = old.app.service().spaces.page('en').modes.find((mode) => mode.id === 'code').ticks.find((one) => one.space === 'devices');
  assert.equal(tick.reason, 'Needs a newer Devices: update it, then switch it off and on in Settings → Devices.');
  old.app.stop();
  // Workshop shown through Tuner Plus only: a new draft there has no tools, never Plain chat.
  const { 'creator-plus': _cp, ...noCreator } = EXTRA;
  void _cp;
  const tuner = start({}, { extra: noCreator, creatorPlus: null, services: { tuning: { isOn: () => true } } });
  await tuner.app.open('w1', { header: { cwd: '/Users/me/src/app' } });
  assert.deepEqual(await tuner.app.service().spaces.startDraft('w1', { space: 'workshop' }), { claimed: false });
  assert.equal(tuner.app.service().get('w1'), 'isolated-locked');
  tuner.app.stop();
  // A Devices thread whose own mode is gone (Bench off): no tools.
  const { bench: _b, ...noBench } = EXTRA;
  void _b;
  const gone = start({ sessionSpaces: JSON.stringify({ bt: 'devices' }), sessionModes: JSON.stringify({ bt: 'bench' }) }, { extra: noBench, bench: null });
  await gone.app.open('bt', { source: 'resume', lastTurn: 1 });
  assert.equal(gone.app.service().get('bt'), 'isolated-locked');
  gone.app.stop();
});

test('grid-locked-in-guarded and grid-removals-switch: grid On never carries; grid Off does while the switch is on (I17)', async () => {
  const grid = JSON.stringify({ code: { groups: { run: 'on' }, tools: { web_search: 'off' } } });
  const stored = { toolAccessOn: true, toolAccess: grid, sessionSpaces: JSON.stringify({ cd: 'devices' }), sessionModes: JSON.stringify({ cd: 'code' }) };
  const on = start(stored);
  const cd = await on.app.open('cd', { source: 'resume', lastTurn: 1 });
  const mask = maskNow(cd.masks);
  const offered = (name) => (mask.allow ? mask.allow.includes(name) : !mask.deny.includes(name));
  assert.equal(offered('bash'), false, 'a grid On never adds bash');
  assert.equal(offered('web_search'), false, 'the grid\'s Off reaches Devices');
  on.app.stop();
  const off = start({ ...stored, gridInGuarded: false });
  const cd2 = await off.app.open('cd', { source: 'resume', lastTurn: 1 });
  const mask2 = maskNow(cd2.masks);
  assert.equal(mask2.allow ? mask2.allow.includes('web_search') : !mask2.deny.includes('web_search'), true, 'switch off: the space\'s rules alone');
  off.app.stop();
});

test('catalogue-effective: sealed Research is not told the web tools are its own; per space the catalogue shows Recon\'s rows', async () => {
  const { app } = start({ toolAccessOn: true });
  const r = await app.open('cr', { header: { cwd: ROOM } });
  await app.service().spaces.startDraft('cr', { space: 'recon' });
  await app.service().spaces.pick('cr', 'research');
  await app.firstTurn(r.agent);
  await settle();
  const access = app.provided('toolAccess');
  const rows = access.catalogueFor('cr');
  for (const name of ['web_search', 'deep_research']) assert.notEqual(rows.find((row) => row.name === name)?.status, 'available now', name);
  assert.ok(access.catalogueForMode('research', { space: 'recon' }).some((row) => row.name.startsWith('recon_')));
  assert.ok(!access.catalogueForMode('research').some((row) => row.name.startsWith('recon_')));
  app.stop();
});

test('reconcile-key: the same mode re-claimed from Chat into Recon re-applies its sandbox (I20)', async () => {
  // Plain chat leaves the level alone in Chat; claimed again into Recon (no folder yet: the window's space is trusted),
  // its sealed copy is read only, so the same mode id re-applies the sandbox.
  const { app } = start({ defaultLevel: 'workspace-write' });
  const one = await app.open('rk');
  await app.service().set('rk', 'plain', { claim: true, space: 'chat' });
  await settle();
  assert.equal(one.agent.session.events.filter((event) => event.type === 'sandbox/mode').length, 0);
  await app.service().set('rk', 'plain', { claim: true, space: 'recon' });
  await settle();
  assert.equal(one.agent.session.level, 'read-only');
  assert.equal(app.service().isolated('rk'), true);
  app.stop();
});

test('preset-by-space (app): a guest in Devices under PTC is told to start again, naming Devices', async () => {
  const { app } = start({ sessionSpaces: JSON.stringify({ pd: 'devices' }), sessionModes: JSON.stringify({ pd: 'research' }) }, { viaPrograms: new Set(['pd']) });
  await app.open('pd', { source: 'resume', lastTurn: 1 });
  assert.match(app.prompt('pd'), /Devices/);
  assert.match(app.prompt('pd'), /Standard/);
  app.stop();
});

test('move-sealed-by-space and moves into Devices after programs (C5, I26)', async () => {
  const { app } = start({ sessionSpaces: JSON.stringify({ rs: 'recon', cp: 'code' }), sessionModes: JSON.stringify({ rs: 'research', cp: 'code' }) });
  await app.open('rs', { source: 'resume', lastTurn: 1 });
  const cp = await app.open('cp', { source: 'resume', lastTurn: 1 });
  await assert.rejects(app.service().spaces.move(['rs'], 'chat'), /This thread is sealed/);
  await app.toolResult(cp.agent, 'bash', { value: 'ok' }, { command: 'ls' });
  await assert.rejects(app.service().spaces.move(['cp'], 'devices'), /ran the Terminal or a program since the app started/);
  app.stop();
});

test('mode-view-effective and guardOf for an ordinary thread', async () => {
  const { app } = start({ sessionSpaces: JSON.stringify({ rv: 'recon', ch: 'chat' }), sessionModes: JSON.stringify({ rv: 'research', ch: 'research' }) });
  await app.open('rv', { source: 'resume', lastTurn: 1 });
  await app.open('ch', { source: 'resume', lastTurn: 1 });
  const view = app.service().spaces.view('rv');
  assert.equal(view.effective.isolated, true);
  assert.equal(view.effective.sealedBy, 'recon');
  assert.equal(view.sealed, true);
  const plainGuard = app.service().guardOf('ch');
  assert.deepEqual({ ...plainGuard }, { top: 'ch', space: 'chat', mode: 'research', sealed: false, sealedBy: '', reconSpace: false, guardedBy: '', noPrograms: false, homeMode: false, fresh: false, unknownTop: false });
  assert.ok(Object.isFrozen(plainGuard));
  assert.equal(app.service().apiVersion, 2);
  assert.equal(app.service().spaces.guestRefuses('bash'), true);
  assert.deepEqual([...app.service().spaces.rules().guarded], ['devices', 'recon', 'workshop']);
  assert.equal(app.service().lockedPreset('research', { space: 'workshop' }), 'cordis');
  assert.equal(app.service().lockedPreset('research', { sessionId: 'rv' }), 'standard');
  assert.equal(app.service().lockedPreset('research'), '');
  app.stop();
});

test('two-marks: two threads marked at once keep both marks (REGRESSION 3)', async () => {
  const { app, world } = start({}, { writeDelay: 5 });
  const a = await app.open('ma', { header: { cwd: ROOM } });
  const b = await app.open('mb', { header: { cwd: ROOM } });
  for (const id of ['ma', 'mb']) await app.service().spaces.startDraft(id, { space: 'recon' });
  await Promise.all([app.firstTurn(a.agent), app.firstTurn(b.agent)]);
  await new Promise((resolve) => setTimeout(resolve, 60));
  await settle();
  const marks = json(world.config.sessionIsolated);
  assert.equal(marks.ma, true);
  assert.equal(marks.mb, true);
  app.stop();
});

test('Settings → Modes → Spaces: sealedExtra and gridInGuarded are written, refusals write nothing', async () => {
  const { app, world } = start();
  const spaces = app.service().spaces;
  const page = spaces.page('en');
  assert.deepEqual(page.rules.sealedExtra, []);
  assert.equal(page.rules.gridInGuarded, true, 'on by default');
  const after = await spaces.setRules({ sealedExtra: ['library_read'] });
  assert.deepEqual(after.rules.sealedExtra, ['library_read']);
  assert.equal(world.config.sealedExtra, JSON.stringify(['library_read']));
  await assert.rejects(spaces.setRules({ sealedExtra: ['web_search'] }), /cannot be kept in Recon/);
  await spaces.setRules({ gridInGuarded: false });
  assert.equal(world.config.gridInGuarded, false);
  const ticked = await spaces.setTick('code', 'chat', true);
  void ticked;
  const warned = page.modes.find((mode) => mode.id === 'code').ticks.find((tick) => tick.space === 'devices');
  assert.match(warned.warn, /^In Devices, Code loses: /);
  assert.equal(page.modes.find((mode) => mode.id === 'research').ticks.find((tick) => tick.space === 'recon').note, 'In Recon, Research is sealed: it goes online only through Recon\'s routes and keeps its files in Recon\'s room.');
  app.stop();
});

test('client-locked-here: the chat box draws the effective mode and a held thread\'s line', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(source, /modeList\.view\?\.effective/);
  assert.match(source, /effective\.held\.text/);
  assert.match(source, /'mt\.rules\.grid'/);
  assert.match(source, /tick\.warn \|\| tick\.note/);
});
