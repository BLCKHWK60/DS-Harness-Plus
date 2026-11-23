/**
 * Item 6 (the owner's answer of 21 November 2026): one setting, Automations' "Scheduling from Recon", covers both the
 * clock button and the assistant's schedule tools in Recon. On (the default): Tool access may grant them in Recon, as
 * before. Off: they are fenced there, also when a permission was given earlier. Never added to Recon by default.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { boot, makeWorld, maskNow, settle } from './app.mjs';

const KNOWN = ['read', 'grep', 'recon_cite', 'schedule_create', 'schedule_list', 'tools_catalog', 'request_tool_access'];
const MODES = { lab: { label: 'Lab', tools: 'all' }, recon: { label: 'Recon', tools: ['recon_cite'], isolated: true } };

function start({ services } = {}) {
  const automations = { ns: 'automations', value: { scheduleFromRecon: true } };
  const world = makeWorld({ pruneStaleSessions: false, toolAccessOn: true, extraModes: JSON.stringify(MODES), sessionModes: JSON.stringify({ r1: 'recon', l1: 'lab' }) });
  const app = boot(world, { known: KNOWN, home: mkdtempSync(path.join(tmpdir(), 'dsh-recon-sched-')), settingsExtra: [automations], ...(services ? { services } : {}) });
  return { app, automations, access: () => app.provided('toolAccess') };
}
const own = (mask) => mask.allow.filter((name) => !['tools_catalog', 'request_tool_access'].includes(name)).sort();

test('Recon gets no schedule tool by default; with the setting on, Tool access may grant one as before', async () => {
  const { app, access } = start();
  try {
    const r1 = await app.open('r1');
    await app.firstTurn(r1.agent);
    assert.deepEqual(own(maskNow(r1.masks)), ['recon_cite'], 'nothing added by default');
    access().registerCard(async () => ({ choice: 'conversation' }));
    assert.equal((await access().ask({ sessionId: 'r1', tool: 'schedule_create', reason: 'remind me' })).ok, true);
    assert.ok(maskNow(r1.masks).allow.includes('schedule_create'));
  } finally {
    app.stop();
  }
});

test('"Scheduling from Recon" off: the schedule tools are fenced in Recon, a permission given earlier included; other tabs keep them', async () => {
  const { app, automations, access } = start();
  try {
    const r1 = await app.open('r1');
    const l1 = await app.open('l1');
    await app.firstTurn(r1.agent);
    await app.firstTurn(l1.agent);
    access().registerCard(async () => ({ choice: 'conversation' }));
    assert.equal((await access().ask({ sessionId: 'r1', tool: 'schedule_create', reason: 'remind me' })).ok, true);
    automations.value.scheduleFromRecon = false;
    await settle();
    await app.firstTurn(r1.agent);
    assert.ok(!maskNow(r1.masks).allow.includes('schedule_create'), 'the earlier permission no longer adds it');
    const guard = await app.waterfall('tools/pre-execute', { name: 'schedule_create', agent: r1.agent, arguments: {} }, async () => ({ kind: 'allow' }));
    assert.equal(guard.kind, 'deny', 'nor runs, within a turn already under way');
    const asked = await access().ask({ sessionId: 'r1', tool: 'schedule_list', reason: 'list' });
    assert.equal(asked.ok, false);
    assert.equal(asked.code, 'fenced');
    assert.match(asked.text, /Scheduling from Recon is switched off/);
    assert.ok(!access().catalogueFor('r1').some((row) => row.name.startsWith('schedule_')), 'not listed in Recon');
    await app.firstTurn(l1.agent);
    assert.ok(!(maskNow(l1.masks).deny ?? []).includes('schedule_create'), 'other tabs are not touched');
    // Switched on again: the permission of this conversation adds it back.
    automations.value.scheduleFromRecon = true;
    await settle();
    await app.firstTurn(r1.agent);
    assert.ok(maskNow(r1.masks).allow.includes('schedule_create'));
  } finally {
    app.stop();
  }
});

test('Modes\' list says which tabs are sealed', async () => {
  const { app } = start();
  try {
    const list = app.service().list();
    const recon = (list ?? []).find((mode) => mode.id === 'recon');
    assert.equal(recon?.isolated, true);
    assert.equal((list ?? []).find((mode) => mode.id === 'lab')?.isolated, false);
  } finally {
    app.stop();
  }
});

test('from Recon an automation never goes into new chats, whatever the setting (review finding, item 6)', async () => {
  // Stage 6b (Revision 2 L2): an edit from Recon is let through only for an automation that runs in this thread, as
  // Automations says (placeOf); the stand-in says task 'x' writes into r1.
  const { app } = start({ services: { automations: { apiVersion: 1, placesGuestRuns: () => true, placeOf: (id) => (id === 'x' ? { space: 'recon', mode: 'recon', stored: false, sessionId: 'r1' } : id === 'y' ? { space: 'chat', mode: 'lab', stored: false, sessionId: '' } : null) } } });
  try {
    const r1 = await app.open('r1');
    const l1 = await app.open('l1');
    await app.firstTurn(r1.agent);
    await app.firstTurn(l1.agent);
    const ask = (agent, name, args) => app.waterfall('tools/pre-execute', { name, agent, arguments: args }, async () => ({ kind: 'allow' }));
    for (const target of ['new', 'new_once']) {
      const refused = await ask(r1.agent, 'schedule_create', { title: 't', prompt: 'p', rrule: 'x', target });
      assert.equal(refused.kind, 'deny', target);
      assert.match(refused.reason, /only in this thread/);
      assert.equal((await ask(r1.agent, 'schedule_edit', { id: 'x', action: 'update', target })).kind, 'deny');
    }
    assert.equal((await ask(r1.agent, 'schedule_create', { title: 't', prompt: 'p', rrule: 'x', target: 'this_session' })).kind, 'allow');
    assert.equal((await ask(r1.agent, 'schedule_edit', { id: 'x', action: 'update', title: 'n' })).kind, 'allow', 'an edit that keeps the target');
    const other = await ask(r1.agent, 'schedule_edit', { id: 'y', action: 'update', prompt: 'carry this out' });
    assert.equal(other.kind, 'deny', 'recon-edit-other-task-denied-in-modes (L2)');
    assert.match(other.reason, /only automations that run in this thread/);
    assert.equal((await ask(r1.agent, 'schedule_edit', { id: 'zz', action: 'delete' })).kind, 'deny', 'an unknown task');
    assert.equal((await ask(r1.agent, 'schedule_list', {})).kind, 'allow');
    assert.equal((await ask(l1.agent, 'schedule_create', { title: 't', prompt: 'p', rrule: 'x', target: 'new' })).kind, 'allow', 'other tabs are not touched');
  } finally {
    app.stop();
  }
});

test('Modes\' list says which modes have a sidebar tab', async () => {
  const { app } = start();
  try {
    const list = app.service().list();
    assert.ok(list.every((mode) => typeof mode.tab === 'boolean'));
    assert.equal(list.find((mode) => mode.id === 'recon')?.tab, true, 'an add-on\'s mode always has one');
  } finally {
    app.stop();
  }
});

test('recon-edit-other-task-denied-in-modes: with no Automations to say where a task runs, every schedule_edit from Recon is refused (L2)', async () => {
  const { app } = start();
  try {
    const r1 = await app.open('r1');
    const l1 = await app.open('l1');
    await app.firstTurn(r1.agent);
    await app.firstTurn(l1.agent);
    const ask = (agent, name, args) => app.waterfall('tools/pre-execute', { name, agent, arguments: args }, async () => ({ kind: 'allow' }));
    const said = await ask(r1.agent, 'schedule_edit', { id: 'x', action: 'update', title: 'n' });
    assert.equal(said.kind, 'deny');
    assert.match(said.reason, /From a sealed thread you can change only automations that run in this thread/);
    assert.equal((await ask(r1.agent, 'schedule_create', { title: 't', prompt: 'p', rrule: 'x', target: 'this_session' })).kind, 'allow', 'making one into this thread stays');
    assert.equal((await ask(l1.agent, 'schedule_edit', { id: 'x', action: 'update', title: 'n' })).kind, 'allow', 'other threads are not touched');
  } finally {
    app.stop();
  }
});

// Item 4A, stage 6b (J13, D10): "Scheduling from Recon" off covers every sealed thread: the Recon space (a guest there
// too) and the owner's own sealed modes, in any space. Unchanged code paths, tested for both now.
test('schedule-from-recon-off-owner-isolated and schedule-from-recon-off-recon-guest', async () => {
  const automations = { ns: 'automations', value: { scheduleFromRecon: false } };
  const { MODE: RESEARCH } = await import('../../dsh-research/lib/mode.js');
  const modes = { ...MODES, mine: { label: 'Mine sealed', tools: ['read', 'schedule_create'], isolated: true }, research: RESEARCH };
  const world = makeWorld({ pruneStaleSessions: false, toolAccessOn: true, extraModes: JSON.stringify(modes), modeSpaces: JSON.stringify({ research: ['chat', 'code', 'recon'] }), sessionModes: JSON.stringify({ i1: 'mine', rg: 'research', l1: 'lab' }), sessionSpaces: JSON.stringify({ i1: 'chat', rg: 'recon', l1: 'chat' }) });
  const app = boot(world, { tabs: true, known: KNOWN, home: mkdtempSync(path.join(tmpdir(), 'dsh-recon-sched-6b-')), settingsExtra: [automations], services: { recon: { apiVersion: 3, inSpace: () => true, isRoom: () => false } } });
  try {
    const i1 = await app.open('i1', { source: 'resume', lastTurn: 1 });
    const rg = await app.open('rg', { source: 'resume', lastTurn: 1 });
    const l1 = await app.open('l1', { source: 'resume', lastTurn: 1 });
    const ask = (agent, name, args) => app.waterfall('tools/pre-execute', { name, agent, arguments: args }, async () => ({ kind: 'allow' }));
    for (const one of [i1, rg]) {
      assert.equal(app.service().isolated(one.agent.id), true, one.agent.id);
      for (const name of ['schedule_create', 'schedule_list', 'schedule_edit']) {
        const said = await ask(one.agent, name, { target: 'this_session' });
        assert.equal(said.kind, 'deny', `${one.agent.id} ${name}`);
        assert.match(said.reason, /Scheduling from Recon is switched off/);
      }
    }
    assert.equal((await ask(l1.agent, 'schedule_create', { target: 'new' })).kind, 'allow', 'a thread that is not sealed keeps them');
  } finally {
    app.stop();
  }
});
