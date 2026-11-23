/**
 * Item 4A, stage 6b, Part B (STAGE6B-DESIGN.md J11, 3.1, Revision 2 L4, L11, G6): a scheduled run that its guarded place
 * cannot take now is held: nothing runs, the thread stays in that space, and the chat box says so. `anyTick` lets a stored
 * Chat or Code place run where it was set. Both count only for a claim of a scheduled thread. A guest's automation that
 * opens new threads is held by Modes itself when nobody placed its thread (Automations off or gone).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DSH_MODES_PRESET_SETTLE_MS = '0';
const { boot, makeWorld, settle } = await import('./app.mjs');
const { MODE: RESEARCH } = await import('../../dsh-research/lib/mode.js');

const ROOM = realpathSync(mkdtempSync(path.join(tmpdir(), 'dsh-6b-hold-room-')));
const KNOWN = ['read', 'write', 'bash', 'bench_usb', 'schedule_create', 'schedule_edit', 'schedule_list'];
const EXTRA = { research: RESEARCH, lab: { label: 'Lab', tools: ['read'] }, bench: { label: 'Devices', tools: ['read', 'bench_usb'], sandbox: 'read-only' }, 'creator-plus': { label: 'Creator Plus', tools: 'all' } };
const TICKS = { research: ['chat', 'code', 'devices', 'workshop'], lab: ['chat'], code: ['code', 'devices', 'workshop'] };

function start({ bench = { guestsGuarded: true }, automations, fields = {} } = {}) {
  const world = makeWorld({ pruneStaleSessions: false, scheduledMode: 'cowork', extraModes: JSON.stringify(EXTRA), modeSpaces: JSON.stringify(TICKS), ...fields });
  const services = {
    recon: { apiVersion: 3, inSpace: () => true, isRoom: (folder) => String(folder ?? '').startsWith(ROOM) },
    ...(bench ? { bench } : {}),
    creatorPlus: { guestsGuarded: true },
    ...(automations ? { automations } : {}),
  };
  const app = boot(world, { tabs: true, known: KNOWN, services });
  return { app, world };
}
/** One step through every `agent/pre-step` listener: whether it entered. */
async function step(app, agent) {
  let entered = false;
  const decision = await app.waterfall('agent/pre-step', { agent, messages: [], turn: 1, step: 1 }, async () => {
    entered = true;
    return { kind: 'enter', messages: [] };
  });
  return { decision, entered };
}
/** A fresh thread the scheduler is opening; `during` runs inside the scheduler's resolve hook (another add-on's claim). */
async function scheduledThread(app, id, { cwd = '/Users/me/projects/p', during } = {}) {
  const made = await app.open(id, { header: { cwd } });
  let inner;
  await app.waterfall('schedule/resolve-agent', id, async () => {
    if (during) inner = during(made.agent);
    return made.agent;
  });
  return { ...made, inner };
}
const reminder = (taskId) => ({ type: 'agent/inbox/spliced', data: { inserted: [{ message: { role: 'user', source: { kind: 'schedule' }, content: [{ type: 'text', text: `[SCHEDULE REMINDER]\nschedule_id_json: "${taskId}"\nreminder_prompt_json: "p"` }] } }] } });

test('hold-on-refused-claim: Devices off: the claim with hold records the thread in Devices and holds it before the throw', async () => {
  const { app } = start({ bench: null });
  let thrown;
  let heldAtOnce;
  await scheduledThread(app, 's1', {
    during: () => {
      const claim = app.service().set('s1', 'research', { claim: true, space: 'devices', hold: true });
      // Synchronous (J11): the hold is there before the promise settles, so the first step cannot run.
      heldAtOnce = app.service().spaces.held('s1');
      return claim.catch((error) => { thrown = error; });
    },
  });
  await settle();
  assert.ok(heldAtOnce, 'held before the claim\'s promise settled');
  assert.equal(thrown?.held, true);
  assert.equal(app.service().spaces.held('s1').space, 'devices');
  assert.equal(app.service().spaces.of('s1'), 'devices', 'never moved: it stays in Devices');
  const agent = app.service().spaces.view('s1');
  assert.match(agent.runHeld, /This automation's run did not start: it runs in Devices · Research, and Devices cannot take it now \(Devices is switched off or out of date\)\. Nothing was run\./);
  assert.equal(app.service().spaces.view('s1', 'zh').runHeld, app.service().spaces.view('s1', 'en').runHeld, 'English on a Chinese page');
  app.stop();
});

test('held-claim-real-mode (stage 7 lab): a run held because Devices is off is recorded in its own mode, and the line names it', async () => {
  const { app, world } = start({ bench: null });
  const { agent } = await scheduledThread(app, 'm1', { during: () => app.service().set('m1', 'research', { claim: true, space: 'devices', hold: true }).catch(() => {}) });
  await settle();
  await app.emit('agent/status', { agent, status: 'running' });
  assert.equal((await step(app, agent)).decision.kind, 'reject', 'held: nothing runs');
  for (let i = 0; i < 4; i += 1) await settle();
  assert.equal(JSON.parse(world.config.sessionModes).m1, 'research', 'its Mode button says Research, not Devices');
  assert.equal(app.service().spaces.of('m1'), 'devices', 'still in Devices');
  const line = app.service().spaces.view('m1').runHeld;
  assert.match(line, /it runs in Devices · Research, and Devices cannot take it now/);
  // Automations is off here: the line first says to switch it on (its page is not there meanwhile).
  assert.match(line, /The automation is paused: switch on Automations on the Plugins page, then switch the automation back on on the Automations page\./);
  app.stop();
});

test('held-claim-automations-on (stage 7 lab): with Automations on, the line points to its page only', async () => {
  const automations = { apiVersion: 1, placesGuestRuns: () => true, placeOf: () => null };
  const { app } = start({ bench: null, automations });
  await scheduledThread(app, 'm2', { during: () => app.service().set('m2', 'research', { claim: true, space: 'devices', hold: true }).catch(() => {}) });
  await settle();
  const line = app.service().spaces.view('m2').runHeld;
  assert.match(line, /it runs in Devices · Research/);
  assert.match(line, /The automation is paused; switch it back on on the Automations page\.$/);
  assert.doesNotMatch(line, /Plugins page/);
  app.stop();
});

test('hold-rejects-steps-and-helpers, then hold-cleared-by-user-message', async () => {
  const { app } = start({ bench: null });
  const { agent } = await scheduledThread(app, 's2', { during: () => app.service().set('s2', 'research', { claim: true, space: 'devices', hold: true }).catch(() => {}) });
  await settle();
  assert.equal((await step(app, agent)).decision.kind, 'reject');
  const helper = await app.open('s2-helper', { header: { origin: 'subagent', parentSession: 's2' } });
  assert.equal((await step(app, helper.agent)).decision.kind, 'reject', 'its helpers too');
  // A message from the user ends the hold (the thread is still in Devices, under its rules).
  await app.claim(agent, 2, 'user');
  assert.equal(app.service().spaces.held('s2'), null);
  assert.equal(app.service().spaces.view('s2').runHeld, '');
  app.stop();
});

test('hold-only-scheduled (G6): `hold` on a thread the scheduler did not open is ignored: a plain refusal, nothing pinned', async () => {
  const { app } = start({ bench: null });
  await app.open('d1', { header: { cwd: '/Users/me/projects/p' } });
  const error = await app.service().set('d1', 'research', { claim: true, space: 'devices', hold: true }).catch((thrown) => thrown);
  assert.ok(error instanceof Error);
  assert.notEqual(error.held, true);
  assert.equal(app.service().spaces.held('d1'), null);
  assert.notEqual(app.service().spaces.of('d1'), 'devices', 'its draft space is not pinned');
  app.stop();
});

test('anytick-only-scheduled (L11) and ANY_TICK_GUARDED: a stored Chat or Code place runs where it was set, only for a scheduled claim', async () => {
  const { app } = start();
  // Lab is ticked for Chat only. A scheduled thread with a stored Code place still goes to Code (J8).
  await scheduledThread(app, 'a1', { during: () => app.service().set('a1', 'lab', { claim: true, space: 'code', anyTick: true }) });
  await settle();
  assert.equal(app.service().get('a1'), 'lab');
  assert.equal(app.service().spaces.of('a1'), 'code');
  // Not a scheduled thread: anyTick is ignored, the usual refusal.
  await app.open('a2', { header: { cwd: '/Users/me/projects/p' } });
  await assert.rejects(app.service().set('a2', 'lab', { claim: true, space: 'code', anyTick: true }), /Lab/);
  // Never for a guarded space (a programming error).
  await assert.rejects(app.service().set('a2', 'research', { claim: true, space: 'devices', anyTick: true }), /ANY_TICK_GUARDED/);
  app.stop();
});

test('a claim into a ready Devices with hold is not held (the guest runs there, under its rules)', async () => {
  const { app } = start();
  const { agent } = await scheduledThread(app, 'ok1', { during: () => app.service().set('ok1', 'research', { claim: true, space: 'devices', hold: true }) });
  await settle();
  assert.equal(app.service().spaces.held('ok1'), null);
  assert.equal(app.service().spaces.of('ok1'), 'devices');
  assert.equal(app.service().guardOf('ok1').guardedBy, 'devices');
  assert.notEqual((await step(app, agent)).decision.kind, 'reject');
  app.stop();
});

test('holdrun-session-target: an existing thread\'s next scheduled turn is held; never a helper or an unknown id', async () => {
  const { app } = start({ fields: { sessionSpaces: JSON.stringify({ e1: 'devices' }), sessionModes: JSON.stringify({ e1: 'research' }) } });
  const e1 = await app.open('e1', { source: 'resume', lastTurn: 3 });
  const helper = await app.open('e1-h', { header: { origin: 'subagent', parentSession: 'e1' } });
  assert.equal(app.service().spaces.holdRun('e1-h', { space: 'devices', reason: 'x' }), false, 'a helper');
  assert.equal(app.service().spaces.holdRun('nobody', { space: 'devices', reason: 'x' }), false, 'unknown');
  assert.equal(app.service().spaces.holdRun('e1', { space: 'devices', reason: 'Devices is switched off' }), true);
  assert.equal((await step(app, e1.agent)).decision.kind, 'reject');
  assert.equal((await step(app, helper.agent)).decision.kind, 'reject');
  assert.match(app.service().spaces.view('e1').runHeld, /\(Devices is switched off\)/);
  await app.claim(e1.agent, 4, 'user');
  assert.equal((await step(app, e1.agent)).decision.kind === 'reject', false, 'the user wrote: it runs');
  app.stop();
});

test('held runs are memory only and go with the thread (agent/disposed)', async () => {
  const { app, world } = start({ fields: { sessionSpaces: JSON.stringify({ e2: 'devices' }), sessionModes: JSON.stringify({ e2: 'research' }) } });
  const e2 = await app.open('e2', { source: 'resume', lastTurn: 1 });
  app.service().spaces.holdRun('e2', { space: 'devices', reason: 'r' });
  assert.ok(!JSON.stringify(world.config).includes('"r"'), 'nothing stored');
  await app.close(e2.agent);
  assert.equal(app.service().spaces.held('e2'), null);
  app.stop();
});

test('guest-run-held-without-automations (L4): a guest automation\'s fresh thread that nobody placed in Devices is held there', async () => {
  const { app, world } = start();
  assert.equal(app.service().spaces.noteGuestRun('t9', 'devices'), true);
  await settle();
  assert.deepEqual(JSON.parse(world.config.guestRunSpaces), { t9: 'devices' }, 'remembered (per Mac, never changed by a repair)');
  // Nobody claims it (Automations off or gone): its first step is refused and it stays in Devices.
  const { agent } = await scheduledThread(app, 'g9');
  await app.emit('session/event', { id: 'g9' }, reminder('t9'));
  assert.equal((await step(app, agent)).decision.kind, 'reject');
  assert.equal(app.service().spaces.held('g9').space, 'devices');
  assert.equal(app.service().spaces.of('g9'), 'devices', 'never Chat or Code');
  // Placed in Devices by its claim (Automations on): it runs.
  const placed = await scheduledThread(app, 'g10', { during: () => app.service().set('g10', 'research', { claim: true, space: 'devices', hold: true }) });
  await app.emit('session/event', { id: 'g10' }, reminder('t9'));
  assert.notEqual((await step(app, placed.agent)).decision.kind, 'reject');
  // Another task's thread is not touched; a note taken away stops the hold.
  const plain = await scheduledThread(app, 'g11');
  await app.emit('session/event', { id: 'g11' }, reminder('t-other'));
  assert.notEqual((await step(app, plain.agent)).decision.kind, 'reject');
  assert.equal(app.service().spaces.noteGuestRun('t9', ''), true);
  await settle();
  assert.deepEqual(JSON.parse(world.config.guestRunSpaces), {});
  assert.equal(app.service().spaces.noteGuestRun('t9', 'recon'), true, 'Recon is never a guest run space: taken away');
  app.stop();
});

test('guest-run-held-without-automations, first turn first (lab 15b): the turn records it in Devices, never Chat; later runs stay there', async () => {
  const { app, world } = start();
  app.service().spaces.noteGuestRun('t15', 'devices');
  await settle();
  // As in the app: the scheduler's message lands, the turn starts (its first-turn record), then its first step.
  const { agent } = await scheduledThread(app, 'g15');
  await app.emit('session/event', { id: 'g15' }, reminder('t15'));
  await app.emit('agent/status', { agent, status: 'running' });
  assert.equal(app.service().spaces.of('g15'), 'devices', 'recorded in Devices at its first turn, not in Chat');
  assert.equal((await step(app, agent)).decision.kind, 'reject', 'held: nothing runs');
  assert.equal(app.service().spaces.held('g15').space, 'devices');
  for (let i = 0; i < 4; i += 1) await settle();
  assert.equal(JSON.parse(world.config.sessionSpaces).g15, 'devices', 'written as Devices');
  // The owner writes in it (the hold ends); the next run in this thread (new_once reused) is still in Devices.
  await app.emit('session/event', { id: 'g15' }, { type: 'agent/inbox/spliced', data: { inserted: [{ message: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'hi' }] } }] } });
  assert.equal(app.service().spaces.held('g15'), null);
  await app.emit('session/event', { id: 'g15' }, reminder('t15'));
  assert.equal(app.service().spaces.of('g15'), 'devices', 'never leaves Devices');
  app.stop();
});

test('held-run-names-real-mode-and-reason (stage 7, 6b lab): Automations off: the thread is in Devices in its own mode, and the line says to switch Automations on', async () => {
  const { app, world } = start();
  assert.equal(app.service().spaces.noteGuestRun('t21', 'devices', 'research'), true);
  await settle();
  assert.deepEqual(JSON.parse(world.config.guestRunModes), { t21: 'research' }, 'its mode is remembered with its space');
  const { agent } = await scheduledThread(app, 'g21');
  await app.emit('session/event', { id: 'g21' }, reminder('t21'));
  await app.emit('agent/status', { agent, status: 'running' });
  assert.equal((await step(app, agent)).decision.kind, 'reject', 'held: nothing runs');
  for (let i = 0; i < 4; i += 1) await settle();
  assert.equal(JSON.parse(world.config.sessionModes).g21, 'research', 'recorded in Research (its row says Research), never Cowork');
  assert.equal(app.service().spaces.of('g21'), 'devices');
  const line = app.service().spaces.view('g21').runHeld;
  assert.match(line, /it runs in Devices · Research, and the Automations add-on is off/);
  assert.match(line, /Switch on Automations on the Plugins page/);
  assert.doesNotMatch(line, /rules could not be read|Automations page/);
  // Stage 7 lab: a one-time automation has no next run, so the line promises none.
  assert.match(line, /While Automations is off, runs set to Devices do not start\./);
  assert.doesNotMatch(line, /next run/);
  // An older note with no mode: the space alone, the same reason.
  app.service().spaces.noteGuestRun('t22', 'devices');
  await settle();
  const old = await scheduledThread(app, 'g22');
  await app.emit('session/event', { id: 'g22' }, reminder('t22'));
  await app.emit('agent/status', { agent: old.agent, status: 'running' });
  assert.equal((await step(app, old.agent)).decision.kind, 'reject');
  assert.match(app.service().spaces.view('g22').runHeld, /it runs in Devices, and the Automations add-on is off/);
  // A note taken away drops its mode too.
  app.service().spaces.noteGuestRun('t21', '');
  await settle();
  assert.equal(JSON.parse(world.config.guestRunModes).t21, undefined);
  app.stop();
});

test('held-run-with-automations-on keeps the space reason (Automations on but the run was not placed)', async () => {
  const automations = { apiVersion: 1, placesGuestRuns: () => true, placeOf: () => null };
  const { app } = start({ automations });
  app.service().spaces.noteGuestRun('t23', 'devices', 'research');
  await settle();
  const { agent } = await scheduledThread(app, 'g23');
  await app.emit('session/event', { id: 'g23' }, reminder('t23'));
  assert.equal((await step(app, agent)).decision.kind, 'reject');
  assert.doesNotMatch(app.service().spaces.view('g23').runHeld, /Automations add-on is off/);
  app.stop();
});

test('scheduled-place-display: where a scheduled thread opens in a folder (display only)', async () => {
  const { app } = start();
  assert.deepEqual({ ...app.service().spaces.scheduledPlace('') }, { space: 'chat', mode: 'cowork' });
  assert.deepEqual({ ...app.service().spaces.scheduledPlace('/Users/me/projects/p') }, { space: 'chat', mode: 'cowork' }, 'Code does not offer Cowork: its own space');
  assert.deepEqual({ ...app.service().spaces.scheduledPlace(path.join(ROOM, 'x')) }, { space: 'recon', mode: '' }, 'Recon\'s room is never a run place');
  app.stop();
  const coded = start({ fields: { scheduledMode: 'code' } });
  assert.deepEqual({ ...coded.app.service().spaces.scheduledPlace('/Users/me/projects/p') }, { space: 'code', mode: 'code' });
  coded.app.stop();
});

test('guest-new-needs-automations: a guest\'s new-thread schedule needs Automations to keep it in its space; this thread always works', async () => {
  const fields = { sessionSpaces: JSON.stringify({ gd: 'devices', cc: 'chat' }), sessionModes: JSON.stringify({ gd: 'research', cc: 'research' }) };
  const without = start({ fields });
  const gd = await without.app.open('gd', { source: 'resume', lastTurn: 1 });
  const cc = await without.app.open('cc', { source: 'resume', lastTurn: 1 });
  const ask = (app, agent, name, args) => app.waterfall('tools/pre-execute', { name, agent, arguments: args }, async () => ({ kind: 'allow' }));
  for (const target of ['new', 'new_once']) {
    const said = await ask(without.app, gd.agent, 'schedule_create', { title: 't', prompt: 'p', rrule: 'x', target });
    assert.equal(said.kind, 'deny', target);
    assert.match(said.reason, /New threads from Devices need the Automations add-on to keep them in Devices/);
  }
  assert.equal((await ask(without.app, gd.agent, 'schedule_create', { title: 't', prompt: 'p', rrule: 'x', target: 'this_session' })).kind, 'allow');
  assert.equal((await ask(without.app, cc.agent, 'schedule_create', { title: 't', prompt: 'p', rrule: 'x', target: 'new' })).kind, 'allow', 'Chat is not touched');
  without.app.stop();
  // Automations on and new enough: allowed, and the task is remembered with its space (L4).
  const automations = { apiVersion: 1, placesGuestRuns: () => true, placeOf: () => null };
  const withIt = start({ fields, automations });
  const gd2 = await withIt.app.open('gd', { source: 'resume', lastTurn: 1 });
  assert.equal((await ask(withIt.app, gd2.agent, 'schedule_create', { title: 't', prompt: 'p', rrule: 'x', target: 'new' })).kind, 'allow');
  await withIt.app.waterfall('tools/post-execute', { name: 'schedule_create', agent: gd2.agent, arguments: { target: 'new' } }, { value: { id: 'task-77' } }, async () => ({ kind: 'accept' }));
  await settle();
  assert.deepEqual(JSON.parse(withIt.world.config.guestRunSpaces), { 'task-77': 'devices' });
  // An older Automations (no placesGuestRuns): refused.
  automations.placesGuestRuns = undefined;
  assert.equal((await ask(withIt.app, gd2.agent, 'schedule_create', { title: 't', prompt: 'p', rrule: 'x', target: 'new' })).kind, 'deny');
  withIt.app.stop();
});

test('mission-guest-no-schedules (app, G13): a guest in Devices on a Mission run gets no schedule tools; without the run it does', async () => {
  const fields = { sessionSpaces: JSON.stringify({ gm: 'devices' }), sessionModes: JSON.stringify({ gm: 'lab' }) };
  const world = makeWorld({ pruneStaleSessions: false, extraModes: JSON.stringify({ ...EXTRA, lab: { label: 'Lab', tools: ['read', 'schedule_create'] } }), modeSpaces: JSON.stringify({ ...TICKS, lab: ['chat', 'devices'] }), ...fields });
  let running = true;
  const app = boot(world, { tabs: true, known: KNOWN, services: { bench: { guestsGuarded: true }, creatorPlus: { guestsGuarded: true } }, mission: { longRun: (id) => (running && id === 'gm' ? { files: true, web: false } : undefined) } });
  const gm = await app.open('gm', { source: 'resume', lastTurn: 1 });
  assert.match(app.guard({ name: 'schedule_create', agent: gm.agent, arguments: {} }) ?? '', /refuses the Terminal/, 'refused during the run');
  running = false;
  assert.equal(app.guard({ name: 'schedule_create', agent: gm.agent, arguments: {} }), undefined, 'allowed without a Mission run');
  app.stop();
});

test('guest-edit-fence (review finding, fail closed): a guest\'s schedule_edit only for its own space\'s automations or this thread; none without Automations', async () => {
  const fields = { sessionSpaces: JSON.stringify({ gd: 'devices', cc: 'chat' }), sessionModes: JSON.stringify({ gd: 'research', cc: 'research' }) };
  const ask = (app, agent, args) => app.waterfall('tools/pre-execute', { name: 'schedule_edit', agent, arguments: args }, async () => ({ kind: 'allow' }));
  // Without Automations: a guest edits nothing (a Chat or Code automation's runs would get the Terminal).
  const without = start({ fields });
  const gd = await without.app.open('gd', { source: 'resume', lastTurn: 1 });
  const cc = await without.app.open('cc', { source: 'resume', lastTurn: 1 });
  const refused = await ask(without.app, gd.agent, { id: 'code-task', action: 'update', prompt: 'run these commands' });
  assert.equal(refused.kind, 'deny');
  assert.match(refused.reason, /^From Devices you can change only automations made in Devices that still run there, or ones delivered to this thread\./);
  assert.equal((await ask(without.app, cc.agent, { id: 'code-task', action: 'update', prompt: 'x' })).kind, 'allow', 'a Chat thread is not touched here');
  without.app.stop();
  const places = {
    'code-task': { space: 'code', mode: 'research', stored: true, sessionId: '', createdSpace: 'devices' },
    'dev-task': { space: 'devices', mode: 'research', stored: true, sessionId: '', createdSpace: 'devices' },
    'into-gd': { space: 'devices', mode: 'research', stored: false, sessionId: 'gd', createdSpace: 'chat' },
    'recon-task': { space: 'recon', mode: 'research', stored: false, sessionId: 'r1', createdSpace: 'recon' },
    'chat-dev': { space: 'devices', mode: 'bench', stored: false, sessionId: '', createdSpace: 'chat' },
  };
  const automations = { apiVersion: 1, placesGuestRuns: () => true, placeOf: (id) => places[id] ?? null };
  const withIt = start({ fields, automations });
  const gd2 = await withIt.app.open('gd', { source: 'resume', lastTurn: 1 });
  assert.equal((await ask(withIt.app, gd2.agent, { id: 'dev-task', action: 'update', prompt: 'x' })).kind, 'allow', 'made in Devices, runs there');
  assert.equal((await ask(withIt.app, gd2.agent, { id: 'into-gd', action: 'update', prompt: 'x' })).kind, 'allow', 'delivered to this thread');
  assert.equal((await ask(withIt.app, gd2.agent, { id: 'code-task', action: 'update', prompt: 'x' })).kind, 'deny', 'moved to Code by the owner');
  assert.equal((await ask(withIt.app, gd2.agent, { id: 'recon-task', action: 'update', target: 'this_session' })).kind, 'deny', 'a Recon automation is never pulled in');
  assert.equal((await ask(withIt.app, gd2.agent, { id: 'chat-dev', action: 'update', prompt: 'x' })).kind, 'deny', 'made elsewhere');
  assert.equal((await ask(withIt.app, gd2.agent, { id: 'nope', action: 'update', prompt: 'x' })).kind, 'deny', 'unknown');
  automations.placeOf = () => { throw new Error('boom'); };
  assert.equal((await ask(withIt.app, gd2.agent, { id: 'dev-task', action: 'update', prompt: 'x' })).kind, 'deny', 'an answer that cannot be read');
  withIt.app.stop();
});

test('held-run-mode-never-sealed (stage 7 review): a sealed mode is never given to a held guest run nor named in its line', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(source, /if \(!runMode \|\| !readModes\(config\)\[runMode\] \|\| readModes\(config\)\[runMode\]\.isolated === true\) runMode = '';/);
  assert.match(source, /mode: readModes\(config\)\[pendingMode\] && readModes\(config\)\[pendingMode\]\.isolated !== true \? pendingMode : ''/);
  assert.match(source, /label = mode && mode\.isolated !== true \? mode\.label \?\? '' : '';/);
});
