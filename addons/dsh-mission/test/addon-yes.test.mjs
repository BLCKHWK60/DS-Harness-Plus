/**
 * Stage E, point 12: a yes another add-on (Devices, Recon, Creator Plus, Tuner Plus) asks for a Mission's helper reaches
 * the Mission: parked in its card with the Ask modes, listed as not asked with Full auto, allowable with Finish it; what
 * an add-on's own rule never lets a helper do is listed under Not possible. Allow means exactly that add-on's own yes.
 * Each test fails on the code before stage E.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GIT_CANDIDATES } from '../lib/checkpoints.js';
import { endGate, report } from '../lib/run.js';
import { ADDON_TEXTS } from '../runner.js';
import { GUARD_TEXTS } from '../lib/prompts.js';
import { appHarness, tick } from './app-harness.mjs';

const hasGit = GIT_CANDIDATES.some((path) => existsSync(path));

/** A Mission on, with item 1's helper at work. */
const started = async ({ needs = 'ask', services = {} } = {}) => {
  const app = appHarness({ config: { longHelpers: 1 }, services });
  const agent = app.open('c');
  if (needs !== 'ask') await app.card({ sessionId: 'c', action: 'save', needs });
  await app.card({ sessionId: 'c', action: 'start', goal: 'make two small things for me', mode: 'auto' });
  await app.step(agent);
  void app.step(agent);
  for (let i = 0; i < 100 && !app.holds.has('Mission: item 1'); i += 1) await tick(5);
  return { app, agent, helper: app.helperAgent('Mission: item 1') };
};

test('Devices asks a yes for a helper (Ask, keep working): parked in the card, the item waits; Allow gives it once (the next identical step asks again); Deny stays no', { skip: !hasGit }, async () => {
  const { app, helper } = await started();
  try {
    const service = app.provided.mission;
    assert.equal(service.askYes({ sessionId: 'c', addon: 'bench', key: 'k', what: 'w' }), undefined, 'the conversation itself: the add-on\'s own card');
    assert.equal(service.askYes({ sessionId: helper.id, addon: 'other', key: 'k', what: 'w' }), undefined, 'an unknown add-on');
    const ask = { sessionId: helper.id, addon: 'bench', key: 'bench_serial_open:Opening the serial port of the board', what: 'Opening the serial port of the board', reason: 'Devices asks: open the port?' };
    const parked = service.askYes(ask);
    assert.equal(parked.text, ADDON_TEXTS.parked('Devices'));
    const entry = service.view('c').approvals.find((each) => each.id === parked.id);
    assert.deepEqual([entry.kind, entry.addon, entry.addonName, entry.act, entry.items], ['addon', 'bench', 'Devices', false, ['1']]);
    await app.release('Mission: item 1', 'NEEDS YES: the serial port');
    assert.equal(service.view('c').items[0].status, 'parked', 'the item waits for the yes');
    const allowed = await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: parked.id, choice: 'allow' }] });
    assert.equal(allowed.status, 200, JSON.stringify(allowed.json));
    assert.match(allowed.json.said, /^Allowed: Opening the serial port of the board\. Item 1 goes on when a helper is free\./);
    assert.equal(service.view('c').items[0].status, 'open');
    // The item's next helper takes the same step.
    void app.step(app.agents.get('c'));
    for (let i = 0; i < 100 && !app.holds.has('Mission: item 1'); i += 1) await tick(5);
    const next = { ...ask, sessionId: app.helperAgent('Mission: item 1').id };
    assert.deepEqual(service.askYes(next), { granted: true, id: parked.id }, 'the next identical step gets it once');
    const again = service.askYes(next);
    assert.equal(again.text, ADDON_TEXTS.parked('Devices'), 'asked again after that');
    await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: again.id, choice: 'deny' }] });
    assert.deepEqual(service.askYes(next), { id: again.id, said: 'no', text: GUARD_TEXTS.saidNo });
    // What Devices' own rule never lets a helper do: listed under Not possible, never allowable.
    const cannot = service.askYes({ ...next, key: 'bench_firmware:flash', what: 'Flashing the board', cannot: true });
    assert.equal(cannot.cannot, true);
    assert.equal(cannot.text, ADDON_TEXTS.cannot('Devices'));
    assert.match(report(onDisk(app)), /Not possible for a Mission's helper[\s\S]*Flashing the board \(Devices\)/);
  } finally {
    app.done();
  }
});

/** The run as saved in its folder. */
const onDisk = (app) => {
  const view = app.provided.mission.view('c');
  return JSON.parse(readFileSync(join(app.agents.get('c').header.cwd, '.dsh-mission', 'runs', view.id, 'run.json'), 'utf8'));
};

test('Full auto: never asked, listed as not asked; Allow with Finish it after the end', { skip: !hasGit }, async () => {
  const { app, helper } = await started({ needs: 'decide' });
  try {
    const said = app.provided.mission.askYes({ sessionId: helper.id, addon: 'recon', key: 'open:https://example.org', what: 'Open https://example.org (from a Recon export)' });
    assert.deepEqual([said.said, said.unasked, said.text], ['no', true, GUARD_TEXTS.notAsked]);
    const entry = app.provided.mission.view('c').approvals.find((each) => each.id === said.id);
    assert.deepEqual([entry.status, entry.addonName], ['unasked', 'Recon']);
    const refused = await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: said.id, choice: 'allow' }] });
    assert.equal(refused.status, 400, 'only with Finish it after the end');
  } finally {
    app.done();
  }
});

test('an act (Tuner Plus starts a run, Creator Plus installs a card): it waits in the card with no item; Allow does that add-on\'s own yes, a failure changes nothing, the add-on off says so; with Ask and wait it keeps the Mission from ending', { skip: !hasGit }, async () => {
  const calls = [];
  let ok = false;
  const tuning = { missionAllow: async (request) => { calls.push(request); return ok ? { ok: true, text: 'Started.' } : { ok: false, text: 'Tuner Plus is busy with another run.' }; } };
  const { app, helper } = await started({ needs: 'wait' });
  try {
    const service = app.provided.mission;
    const asked = service.askYes({ sessionId: helper.id, addon: 'tuning', key: 'start:{"model":"m"}', what: 'Start a Tuner Plus run: tune m', act: true, needed: false, ref: { model: 'm' } });
    assert.equal(asked.text, ADDON_TEXTS.parkedAct('Tuner Plus'));
    const entry = service.view('c').approvals.find((each) => each.id === asked.id);
    assert.deepEqual([entry.act, entry.items, entry.addonName], [true, [], 'Tuner Plus']);
    // No Tuner Plus here: said, nothing changed.
    const off = await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: asked.id, choice: 'allow' }] });
    assert.deepEqual([off.status, off.json.error], [400, 'Tuner Plus is switched off or not installed, so this cannot be done from here. Nothing was changed.']);
    app.services.tuning = tuning;
    const failed = await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: asked.id, choice: 'allow' }] });
    assert.deepEqual([failed.status, failed.json.error], [400, 'That change could not be made: Tuner Plus is busy with another run. Nothing was changed.']);
    assert.equal(service.view('c').approvals.find((each) => each.id === asked.id).status, 'open');
    ok = true;
    const done = await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: asked.id, choice: 'allow' }] });
    assert.equal(done.json.said, 'Allowed: Start a Tuner Plus run: tune m. The Mission goes on with it.');
    assert.deepEqual(calls.at(-1), { sessionId: 'c', key: 'start:{"model":"m"}', ref: { model: 'm' } });
    // Ask and wait: an open act holds the end (its end gate).
    const second = service.askYes({ sessionId: helper.id, addon: 'creatorPlus', key: 'card:c7', what: 'Install hello in your real setup', act: true, needed: false, ref: { card: 'c7' } });
    assert.ok(second.id);
    assert.ok(endGate(onDisk(app)).includes(second.id));
  } finally {
    app.done();
  }
});
