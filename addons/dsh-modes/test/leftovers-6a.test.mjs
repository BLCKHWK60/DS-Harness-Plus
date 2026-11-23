/**
 * Item 4A, stage 6a leftovers (dsh-modes): (a) a thread held by Devices or Workshop gets words that name its space;
 * (b) the Modes service names modes and spaces in a language; (c) the second-layer refusal of engine models; (d) Creator
 * Plus home threads keep their schedule tools in Workshop, guests stay refused.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { boot, makeWorld, maskNow, settle } from './app.mjs';
import { LOCKED_MODE } from '../lib/isolation.js';
import { guardRefusesEngine, heldIn, heldPrompt, spaceCopy } from '../lib/spacerules.js';
import { promptText } from '../lib/prompt.js';
import { spaceText } from '../lib/spaces.js';
import { MODE as RECON } from '../../dsh-recon/lib/mode.js';
import { MODE as RESEARCH } from '../../dsh-research/lib/mode.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const ROOM = realpathSync(mkdtempSync(path.join(tmpdir(), 'dsh-6a-leftovers-room-')));
const KNOWN = ['read', 'write', 'glob', 'bash', 'run_code', 'engine', 'web_search', 'todo_write', 'recon_web_search', 'recon_web_read', 'bench_usb',
  'tools_catalog', 'request_tool_access', 'schedule_create', 'schedule_list', 'schedule_edit', 'schedule_delete'];
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
function reconService() {
  return {
    apiVersion: 3,
    inSpace: () => true,
    isRoom: (folder) => String(folder ?? '').startsWith(ROOM),
    roomRunFolder: (id) => {
      const folder = path.join(ROOM, `run-${id}`);
      mkdirSync(folder, { recursive: true });
      return folder;
    },
  };
}
function start(fields = {}, { bench = { guestsGuarded: true }, creatorPlus = { guestsGuarded: true }, ...options } = {}) {
  const world = makeWorld({ pruneStaleSessions: false, extraModes: JSON.stringify(EXTRA), modeSpaces: JSON.stringify(TICKS), ...fields });
  const services = { recon: reconService(), bench: bench || null, creatorPlus: creatorPlus || null };
  const app = boot(world, { tabs: true, known: KNOWN, ...options, services });
  return { app, world };
}
const call = (app, one, name, args = {}) => app.guard({ name, agent: one.agent, arguments: args });
const offered = (mask, name) => (mask?.allow ? mask.allow.includes(name) : !(mask?.deny ?? []).includes(name));
/** One step of an agent through every `agent/pre-step` listener; `entered` says whether the step reached the model. */
async function step(app, agent) {
  let entered = false;
  const decision = await app.waterfall('agent/pre-step', { agent, messages: [], step: 1 }, async () => {
    entered = true;
    return { kind: 'enter', messages: [] };
  });
  return { decision, entered };
}

// ---- (a) a held thread's words ------------------------------------------------------------------------------------

test('held copy: the locked mode with words naming Devices or Workshop, never an "isolated tab"', () => {
  for (const [space, name, addon] of [['devices', 'Devices', 'Devices'], ['workshop', 'Workshop', 'Creator Plus']]) {
    const held = heldIn(space);
    assert.equal(held, heldIn(space), 'one frozen object per space');
    assert.ok(Object.isFrozen(held));
    assert.equal(held.id, LOCKED_MODE.id);
    assert.deepEqual(held.tools, []);
    assert.equal(held.isolated, true, 'still runs nothing (fail closed)');
    assert.equal(held.heldIn, space);
    assert.equal(held.prompt, heldPrompt(space));
    assert.match(held.prompt, new RegExp(`in the ${name} space`));
    assert.match(held.prompt, new RegExp(`switch on or update the ${addon} add-on in Settings`));
    assert.doesNotMatch(held.prompt, /isolated tab|tab/i);
  }
  assert.equal(heldIn('recon'), LOCKED_MODE, 'Recon keeps its locked mode');
  assert.equal(heldIn('chat'), LOCKED_MODE);
  const code = { id: 'code', tools: ['read'] };
  assert.equal(spaceCopy(code, 'devices', { oldGuard: { devices: true } }), heldIn('devices'));
  assert.equal(spaceCopy(code, 'workshop', { ready: { devices: true, recon: true, workshop: 'off' } }), heldIn('workshop'));
  assert.equal(spaceCopy(code, 'recon', { ready: { recon: 'off' }, ranBefore: true }), LOCKED_MODE, 'Recon unchanged');
});

test('held copy: the prompt is only its own words (no Depth, Web or PTC note), with tools off too', () => {
  const held = heldIn('devices');
  assert.equal(promptText({ mode: held, depth: 'thorough', webOff: true, programOnly: true }), held.prompt);
  assert.match(promptText({ mode: held, off: true }), /in the Devices space/);
});

test('held thread in the app: its instructions name the space; Bench old and Creator Plus off', async () => {
  const devices = start({ sessionSpaces: JSON.stringify({ hd: 'devices' }), sessionModes: JSON.stringify({ hd: 'code' }) }, { bench: {} });
  await devices.app.open('hd', { source: 'resume', lastTurn: 1 });
  assert.equal(devices.app.service().get('hd'), LOCKED_MODE.id);
  const text = devices.app.prompt('hd');
  assert.match(text, /in the Devices space/);
  assert.doesNotMatch(text, /isolated tab/);
  devices.app.stop();
  const workshop = start({ sessionSpaces: JSON.stringify({ hw: 'workshop' }), sessionModes: JSON.stringify({ hw: 'research' }) }, { creatorPlus: {} });
  await workshop.app.open('hw', { source: 'resume', lastTurn: 1 });
  assert.equal(workshop.app.service().get('hw'), LOCKED_MODE.id);
  assert.match(workshop.app.prompt('hw'), /in the Workshop space.*Creator Plus add-on/);
  workshop.app.stop();
});

test('held thread: its first turn does not mark it isolated, so it gets its mode back once the guard is ready', async () => {
  const bench = { guestsGuarded: true };
  const { app, world } = start({}, { bench });
  const one = await app.open('nd', { header: { cwd: '/Users/me/src/app' } });
  await app.service().spaces.startDraft('nd', { space: 'devices' });
  await app.service().spaces.pick('nd', 'code');
  assert.equal(app.service().get('nd'), 'code');
  // Bench goes too old before the first message.
  delete bench.guestsGuarded;
  assert.equal(app.service().get('nd'), LOCKED_MODE.id, 'held while Bench cannot guard guests');
  await app.firstTurn(one.agent);
  await settle();
  assert.notEqual(json(world.config.sessionIsolated).nd, true, 'not marked for good');
  bench.guestsGuarded = true;
  assert.equal(app.service().get('nd'), 'code', 'its mode back, under the Devices rules');
  assert.equal(app.service().guardOf('nd').guardedBy, 'devices');
  app.stop();
});

// ---- (b) names in a language ----------------------------------------------------------------------------------------

test('service: modeName(id, lang), list(lang) and spaces.names(lang): English for every language (stage 7)', () => {
  const { app } = start();
  const modes = app.service();
  assert.equal(modes.modeName('code', 'zh'), 'Code');
  assert.equal(modes.modeName('code'), 'Code');
  assert.equal(modes.modeName('bench', 'zh-CN'), 'Devices');
  assert.equal(modes.modeName('creator-plus', 'zh'), 'Creator Plus', 'a product name stays');
  assert.equal(modes.modeName('no-such-mode', 'zh'), 'no-such-mode');
  const before = modes.list().find((mode) => mode.id === 'code');
  assert.equal(before.label, 'Code', 'no language: the stored name, as before');
  assert.equal(before.name, 'Code');
  const zh = modes.list('zh').find((mode) => mode.id === 'code');
  assert.equal(zh.label, 'Code');
  assert.equal(zh.name, 'Code');
  assert.equal(modes.list('en').find((mode) => mode.id === 'research').label, 'Research');
  assert.deepEqual({ ...modes.spaces.names('zh') }, { chat: 'Chat', code: 'Code', devices: 'Devices', recon: 'Recon', workshop: 'Workshop' });
  assert.equal(modes.spaces.names().workshop, 'Workshop');
  assert.equal(modes.spaces.names('zh-Hans').workshop, 'Workshop');
  assert.ok(Object.isFrozen(modes.spaces.names('en')));
  app.stop();
});

// ---- (c) engine models ----------------------------------------------------------------------------------------------

test('engine models: refused for a thread its space guards (second layer behind dsh-engines)', async () => {
  const { app } = start({ sessionSpaces: JSON.stringify({ ed: 'devices', ew: 'workshop', ec: 'code', od: 'devices' }), sessionModes: JSON.stringify({ ed: 'code', ew: 'code', ec: 'code', od: 'code' }) });
  const engine = () => ({ provider: 'engine-opencode', model: 'opencode' });
  for (const id of ['ed', 'ew']) {
    const one = await app.open(id, { source: 'resume', lastTurn: 1 });
    one.agent.model = { current: engine };
    const { decision, entered } = await step(app, one.agent);
    assert.equal(decision.kind, 'reject', id);
    assert.equal(entered, false, `${id}: the model is never reached`);
    // Stage 6b (J3): a step with no words of the user's keeps nothing, so the line makes no put-back promise.
    assert.equal(app.service().spaces.view(id).engineHeld, spaceText('engineHeldPlain', 'en'));
    assert.equal(app.service().spaces.view(id, 'zh').engineHeld, spaceText('engineHeldPlain', 'en'), 'English on a Chinese page');
  }
  // An ordinary model in Devices, and an engine in the Code space: as before.
  const plainModel = await app.open('od', { source: 'resume', lastTurn: 1 });
  assert.equal((await step(app, plainModel.agent)).entered, true);
  assert.equal(app.service().spaces.view('od').engineHeld, '');
  const code = await app.open('ec', { source: 'resume', lastTurn: 1 });
  code.agent.model = { current: engine };
  assert.equal((await step(app, code.agent)).entered, true, 'Code space: dsh-engines decides');
  assert.equal(app.service().spaces.view('ec').engineHeld, '');
  app.stop();
});

test('engine models: refused in a Recon thread and for a helper of a guarded thread; the chat box line is in client.js', async () => {
  const { app } = start({ sessionSpaces: JSON.stringify({ gd: 'devices' }), sessionModes: JSON.stringify({ gd: 'code' }) });
  const r = await app.open('rt', { header: { cwd: ROOM } });
  await app.service().spaces.startDraft('rt', { space: 'recon' });
  await app.service().spaces.pick('rt', 'research');
  await app.firstTurn(r.agent);
  await settle();
  r.agent.model = { current: () => ({ provider: 'engine-claude', model: 'x' }) };
  assert.equal((await step(app, r.agent)).decision.kind, 'reject');
  await app.open('gd', { source: 'resume', lastTurn: 1 });
  const helper = await app.open('gdh', { header: { parentSession: 'gd' } });
  helper.agent.model = { current: () => ({ provider: 'engine-opencode', model: 'x' }) };
  assert.equal((await step(app, helper.agent)).decision.kind, 'reject');
  assert.equal(app.service().spaces.view('gd').engineHeld, spaceText('engineHeldPlain', 'en'), 'shown on the thread (stage 6b: no words kept, no put-back promise)');
  assert.match(readFileSync(path.join(here, '..', 'client.js'), 'utf8'), /data-engine-held/);
  assert.match(spaceText('engineHeld', 'zh'), /Recon, Devices or Workshop/);
  app.stop();
});

test('engine models: the home modes of Devices and Workshop are not refused here, as before 6a; Recon home stays refused', async () => {
  // Owner point 26, "Home modes keep today's behaviour": Bench in Devices and Creator Plus in Workshop reach the model
  // (dsh-engines' "Code mode only" check answers them, as before 6a). A guest in the same spaces is refused.
  const { app } = start({ sessionSpaces: JSON.stringify({ eb: 'devices', ecp: 'workshop', gb: 'workshop', gc: 'devices' }), sessionModes: JSON.stringify({ eb: 'bench', ecp: 'creator-plus', gb: 'bench', gc: 'creator-plus' }) });
  const engine = () => ({ provider: 'engine-opencode', model: 'opencode' });
  for (const id of ['eb', 'ecp']) {
    const one = await app.open(id, { source: 'resume', lastTurn: 1 });
    one.agent.model = { current: engine };
    assert.equal(app.service().guardOf(id).homeMode, true, id);
    assert.equal((await step(app, one.agent)).entered, true, `${id}: home mode, as before 6a`);
    assert.equal(app.service().spaces.view(id).engineHeld, '', id);
  }
  for (const id of ['gb', 'gc']) {
    const one = await app.open(id, { source: 'resume', lastTurn: 1 });
    one.agent.model = { current: engine };
    assert.equal(app.service().guardOf(id).homeMode, false, id);
    assert.equal((await step(app, one.agent)).decision.kind, 'reject', `${id}: a home mode visiting the other space is a guest`);
  }
  app.stop();
});

test('engine models: a model that cannot be read is refused when the thread is guarded; elsewhere it goes on', async () => {
  const { app } = start({ sessionSpaces: JSON.stringify({ ud: 'devices', uc: 'code', ub: 'devices' }), sessionModes: JSON.stringify({ ud: 'code', uc: 'code', ub: 'bench' }) });
  const broken = () => {
    throw new Error('no model');
  };
  const guest = await app.open('ud', { source: 'resume', lastTurn: 1 });
  guest.agent.model = { current: broken };
  const refused = await step(app, guest.agent);
  assert.equal(refused.decision.kind, 'reject', 'a guarded thread: fail closed');
  assert.equal(refused.entered, false);
  const code = await app.open('uc', { source: 'resume', lastTurn: 1 });
  code.agent.model = { current: broken };
  assert.equal((await step(app, code.agent)).entered, true, 'Code space: not guarded, as before');
  const home = await app.open('ub', { source: 'resume', lastTurn: 1 });
  home.agent.model = { current: broken };
  assert.equal((await step(app, home.agent)).entered, true, 'home mode: as before 6a');
  app.stop();
});

test('guardRefusesEngine: sealed, Recon, guests, unknown and broken guards refuse; plain and home guards do not', () => {
  const base = { sealed: false, reconSpace: false, guardedBy: '', noPrograms: false, homeMode: false, unknownTop: false, space: 'code', mode: 'code' };
  assert.equal(guardRefusesEngine(base), false);
  assert.equal(guardRefusesEngine({ ...base, space: 'devices', mode: 'bench', guardedBy: 'devices', noPrograms: true, homeMode: true }), false);
  assert.equal(guardRefusesEngine({ ...base, space: 'workshop', mode: 'creator-plus', guardedBy: 'workshop', noPrograms: true, homeMode: true }), false);
  assert.equal(guardRefusesEngine({ ...base, space: 'recon', mode: 'recon', sealed: true, reconSpace: true, guardedBy: '', noPrograms: true, homeMode: true }), true, 'Recon home is sealed');
  assert.equal(guardRefusesEngine({ ...base, space: 'devices', mode: 'code', guardedBy: 'devices', noPrograms: true }), true);
  assert.equal(guardRefusesEngine({ ...base, space: 'workshop', mode: 'bench', guardedBy: 'workshop', noPrograms: true, homeMode: true }), true, 'homeMode alone is not enough');
  assert.equal(guardRefusesEngine({ ...base, space: 'devices', mode: 'bench', guardedBy: 'devices', noPrograms: true, homeMode: true, unknownTop: true }), true);
  assert.equal(guardRefusesEngine({ ...base, guardedBy: 'unknown', noPrograms: true }), true);
  assert.equal(guardRefusesEngine({ ...base, noPrograms: true }), true, 'a mode without programs');
  assert.equal(guardRefusesEngine({ ...base, sealed: undefined }), true);
  assert.equal(guardRefusesEngine(null), true);
  assert.equal(guardRefusesEngine('x'), true);
});

// ---- (d) Creator Plus home threads keep their schedule tools ----------------------------------------------------------

// Stage 6b (7.6, J14): updated on purpose: guest-schedule-allowed: a guest in Workshop is offered schedules too (point 27).
test('Creator Plus home thread in Workshop: schedule_* offered and not refused; guest-schedule-allowed: a guest there too (stage 6b)', async () => {
  const { app } = start({ sessionSpaces: JSON.stringify({ cp: 'workshop', gw: 'workshop' }), sessionModes: JSON.stringify({ cp: 'creator-plus', gw: 'research' }) });
  const home = await app.open('cp', { source: 'resume', lastTurn: 1 });
  const guest = await app.open('gw', { source: 'resume', lastTurn: 1 });
  const guard = app.service().guardOf('cp');
  assert.equal(guard.homeMode, true);
  assert.equal(guard.guardedBy, 'workshop', 'the space\'s rules apply (Creator Plus guards its home mode)');
  const homeMask = maskNow(home.masks);
  const guestMask = maskNow(guest.masks);
  for (const name of ['schedule_create', 'schedule_list', 'schedule_edit', 'schedule_delete']) {
    assert.ok(offered(homeMask, name), `home: ${name} in the mask`);
    assert.equal(call(app, home, name, { target: 'new_chat' }), undefined, `home: ${name} not refused by Modes`);
    // The space no longer takes the app's schedule tools out of the mask (Research's own list decides whether it has
    // them at all). schedule_delete is not one of the app's tools: nobody sorted it, so it stays refused (fail closed).
    if (name === 'schedule_delete') {
      assert.match(call(app, guest, name) ?? '', /refuses the Terminal/, 'an unsorted name stays refused');
      continue;
    }
    assert.ok(!(guestMask?.deny ?? []).includes(name), `guest: ${name} not denied by the space (stage 6b)`);
    assert.equal(call(app, guest, name), undefined, `guest: ${name} not refused by Modes (stage 6b)`);
  }
  app.stop();
});
