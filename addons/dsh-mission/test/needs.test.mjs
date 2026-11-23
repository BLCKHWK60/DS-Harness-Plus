/**
 * Point 17 (owner, 20 November 2026), part 1: the setting "When it needs you" (Full auto, Ask keep working, Ask and wait)
 * and "Wait for me": Settings → Mission's defaults, migrated from stage D's waitMinutes when read; each chat's own choice
 * (Mission settings); fixed for the run when it starts; Start Mission and a typed /mission use the same; old runs still
 * read as before. Also the stage D questions 3-9 as the owner answered them, and the shared alert throttle.
 * Each test fails on the code before point 17.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GIT_CANDIDATES } from '../lib/checkpoints.js';
import { Config, readSettings } from '../index.js';
import { APPROVAL_CHOICES, HELPERS_DEFAULT, HELPERS_MAX, NEEDS, NEEDS_LABELS, applyPlan, applyWork, needsLine, needsOf, newRun, readHelpers, readNeeds, readWaitChoice, waitAskOf, waitMsOf, waitOf } from '../lib/run.js';
import { patchPaths } from '../lib/paths.js';
import { needsStartText } from '../runner.js';
import { PLAN, bench, holdItems, tick } from './bench-pool.mjs';
import { appHarness } from './app-harness.mjs';

const hasGit = GIT_CANDIDATES.some((path) => existsSync(path));
const long = (given = {}, limits = {}) => newRun({ id: 'r', goal: 'g', mode: 'Full Auto', root: '/x', limits, kind: 'long', long: { minutes: 60, laps: 3, ...given } });

test('the choices and Wait for me as read from a setting or a card', () => {
  assert.deepEqual(NEEDS, ['decide', 'ask', 'wait']);
  assert.deepEqual(NEEDS_LABELS, { decide: 'Full auto', ask: 'Ask, keep working', wait: 'Ask and wait' });
  assert.equal(readNeeds('wait'), 'wait');
  assert.equal(readNeeds('auto'), 'ask', 'never a Mission access id');
  assert.equal(readNeeds(undefined, 'decide'), 'decide');
  assert.equal(readNeeds('x', 'nonsense'), 'ask');
  for (const [given, read] of [[null, null], [undefined, null], ['', null], [true, null], ['abc', null], [0, 0], [-5, 0], [2.4, 2], [45, 45], [5000, 720], ['30', 30]]) assert.equal(readWaitChoice(given), read, String(given));
});

test('migration: Wait for me (Ask, keep working) from stage D\'s waitMinutes: 3 (its old default) becomes 30, 0 stays until you answer, others are kept; a saved value wins', () => {
  assert.equal(waitAskOf(-1, 3), 30);
  assert.equal(waitAskOf(-1, undefined), 30);
  assert.equal(waitAskOf(undefined, 3), 30);
  assert.equal(waitAskOf(-1, 0), 0);
  assert.equal(waitAskOf(-1, 12), 12);
  assert.equal(waitAskOf(-1, 60), 60);
  assert.equal(waitAskOf(45, 3), 45);
  assert.equal(waitAskOf(0, 12), 0, 'saved: until you answer');
  assert.equal(waitAskOf(900, 3), 720);
  const set = (config) => readSettings(config).long;
  assert.deepEqual([set({}).needs, set({}).waitAsk, set({}).waitHold], ['ask', 30, 0], 'the defaults: Ask, keep working; 30 minutes; until you answer');
  assert.equal(set({ waitMinutes: 0 }).waitAsk, 0);
  assert.equal(set({ waitMinutes: 12 }).waitAsk, 12);
  assert.equal(set({ waitMinutes: 12, longWaitAsk: 60 }).waitAsk, 60);
  assert.equal(set({ longNeeds: 'decide' }).needs, 'decide');
  assert.equal(set({ longNeeds: 'auto' }).needs, 'ask');
  assert.equal(set({ longWaitHold: 90 }).waitHold, 90);
  assert.equal(set({ longWaitHold: -3 }).waitHold, 0);
  assert.equal(readSettings({ waitMinutes: 12 }).limits.waitMinutes, 12, 'waitMinutes is kept (old runs, Tool access)');
  // The settings keys exist with their defaults (Settings Plus's index needs them to match).
  const keys = Object.keys(Config.dict ?? Config.meta?.dict ?? {});
  if (keys.length > 0) for (const key of ['longNeeds', 'longWaitAsk', 'longWaitHold', 'waitMinutes']) assert.ok(keys.includes(key), key);
});

test('a run\'s choice and wait: new runs keep theirs (Full auto never waits); runs from before read Ask, keep working and the legacy wait', () => {
  assert.equal(needsOf(long()), 'ask', 'nothing given: Ask, keep working');
  assert.equal(needsOf(long({ needs: 'weird' })), 'ask');
  assert.equal(needsOf(long({ needs: 'wait' })), 'wait');
  const old = newRun({ id: 'r', goal: 'g', mode: 'Full Auto', root: '/x', limits: { waitMinutes: 3 } });
  assert.equal(needsOf(old), 'ask', 'kind mission: as before');
  // Saved before point 17: no needs, no waitFor; their waitMinutes reads as Wait for me.
  const saved = long({}, { waitMinutes: 3 });
  delete saved.long.needs;
  assert.equal(needsOf(saved), 'ask');
  assert.equal(waitOf(saved), 30, '3 was the old default');
  saved.limits.waitMinutes = 0;
  assert.equal(waitOf(saved), 0);
  assert.equal(waitMsOf(saved), Infinity, 'until you answer');
  saved.limits.waitMinutes = 7;
  assert.equal(waitMsOf(saved), 7 * 60000);
  assert.equal(waitOf(long({ waitFor: 45 })), 45);
  assert.equal(long({ waitFor: 9999 }).long.waitFor, 720);
  assert.equal(long({ waitFor: -4 }).long.waitFor, 0);
  const auto = long({ needs: 'decide', waitFor: 45 });
  assert.deepEqual([auto.long.needs, auto.long.waitFor, waitMsOf(auto)], ['decide', 0, 0], 'Full auto never waits');
  assert.equal(needsLine(auto), 'When it needs you: Full auto.');
  assert.equal(needsLine(long({ needs: 'wait', waitFor: 0 })), 'When it needs you: Ask and wait; Wait for me: until you answer.');
  assert.equal(needsLine(long({ waitFor: 30 })), 'When it needs you: Ask, keep working; Wait for me: 30 minutes.');
});

test('runner.start: the run\'s choice from the chat (options), else Settings → Mission; the start text, the started event and /mission status say it', async () => {
  const app = bench({ settings: { long: { needs: 'wait', waitAsk: 30, waitHold: 0 } } });
  try {
    const said = await app.runner.start(app.agent, 'do a thing well', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 2 } });
    const run = app.runner.runOf('conv');
    assert.deepEqual([run.long.needs, run.long.waitFor], ['wait', 0], 'from Settings: Ask and wait, until you answer');
    assert.match(said, /When it needs you: Ask and wait\. Every question and every request for your yes waits for you; other items go on\. When only waiting is left, it waits until you answer\./);
    await tick();
    const started = app.fired.find((event) => event.type === 'started');
    assert.deepEqual([started.needs, started.waitFor], ['wait', 0]);
    assert.match(app.runner.status(app.agent), /When it needs you: Ask and wait\./);
    const view = app.runner.view('conv');
    assert.deepEqual([view.needs, view.waitFor, view.waitedMs, view.endKind, view.decided], ['wait', 0, 0, '', []]);
  } finally {
    app.done();
  }
  const own = bench({ settings: { long: { needs: 'wait', waitAsk: 30, waitHold: 0 } } });
  try {
    const said = await own.runner.start(own.agent, 'do a thing well', { mode: 'auto', root: own.root }, { kind: 'long', long: { minutes: 60, laps: 2, needs: 'decide', waitFor: 20 } });
    assert.deepEqual([own.runner.runOf('conv').long.needs, own.runner.runOf('conv').long.waitFor], ['decide', 0], 'the chat\'s own choice wins; Full auto never waits');
    assert.match(said, / When it needs you: Full auto\. It asks nothing: it decides questions itself and never gives itself permission; the report lists what it decided and what it skipped\./);
  } finally {
    own.done();
  }
  assert.match(needsStartText(long({ needs: 'ask', waitFor: 30 })), /^ When it needs you: Ask, keep working\. Questions with a safe default go on with it; when only your answers can move it on, it waits 30 minutes\.$/);
});

test('Mission settings for a chat: saved with When it needs you and Wait for me; the card has the defaults and the resolved wait; a typed /mission uses the saved choice', { skip: !hasGit }, async () => {
  const app = appHarness({ config: { longHelpers: 1, waitMinutes: 3 } });
  try {
    const chat = app.open('c');
    let card = await app.get('c');
    assert.deepEqual([card.json.defaults.needs, card.json.defaults.waitAsk, card.json.defaults.waitHold], ['ask', 30, 0]);
    assert.deepEqual([card.json.saved.needs, card.json.saved.wait, card.json.saved.waitFor], ['ask', null, 30], 'nothing saved: the defaults');
    card = await app.card({ sessionId: 'c', action: 'save', needs: 'wait', wait: null });
    assert.deepEqual([card.json.saved.needs, card.json.saved.wait, card.json.saved.waitFor], ['wait', null, 0], 'Ask and wait follows its default: until you answer');
    card = await app.card({ sessionId: 'c', action: 'save', needs: 'ask', wait: 45 });
    assert.deepEqual([card.json.saved.needs, card.json.saved.wait, card.json.saved.waitFor], ['ask', 45, 45]);
    card = await app.card({ sessionId: 'c', action: 'save', needs: 'zzz', wait: 'x' });
    assert.deepEqual([card.json.saved.needs, card.json.saved.wait, card.json.saved.waitFor], ['ask', null, 30], 'invalid values fall back without an error');
    const file = JSON.parse(readFileSync(join(app.home, 'mission', 'long-settings.json'), 'utf8'));
    assert.deepEqual([file.c.needs, file.c.wait], ['ask', null]);
    card = await app.card({ sessionId: 'c', action: 'save', needs: 'decide' });
    assert.deepEqual([card.json.saved.needs, card.json.saved.waitFor], ['decide', 0]);
    // A typed /mission uses this chat's choice.
    const typed = await app.mission(chat, 'auto do two small things in this folder please');
    assert.equal(typed.kind, 'success', typed.text);
    assert.match(typed.text, /When it needs you: Full auto\./);
    const view = app.runner().view('c');
    assert.deepEqual([view.needs, view.waitFor], ['decide', 0]);
    assert.deepEqual([(await app.get('c')).json.strip.needs, (await app.get('c')).json.strip.waitFor], ['decide', 0]);
  } finally {
    app.done();
  }
});

test('stage D questions 3-9 as answered (point 17, last bullet)', async () => {
  // 3: tool choices Allow for this item / Allow for this Mission / Deny; files, places and commands Allow / Deny.
  assert.deepEqual(APPROVAL_CHOICES.tool.map((choice) => choice.label), ['Allow for this item', 'Allow for this Mission', 'Deny']);
  assert.deepEqual(APPROVAL_CHOICES.other.map((choice) => choice.label), ['Allow', 'Deny']);
  // 4: parking also with one helper.
  const one = long({ helpers: 1 });
  applyPlan(one, { items: [{ title: 'a' }] });
  one.questions.push({ id: 'q1', text: 'A?', status: 'open', items: ['1'] });
  applyWork(one, '1', { parked: { on: ['q1'] } });
  assert.equal(one.items[0].status, 'parked');
  // 5: 1 to 8 helpers, 4 by default, never above Calls at once.
  assert.deepEqual([HELPERS_DEFAULT, HELPERS_MAX, readHelpers(0), readHelpers(99), readHelpers('x')], [4, 8, 1, 8, 4]);
  const app = bench({ callsAtOnce: 2 });
  try {
    await app.runner.start(app.agent, 'do a thing well', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 2, helpers: 4 } });
    assert.deepEqual([app.runner.runOf('conv').long.helpers, app.runner.runOf('conv').long.helpersWhy], [2, 'server']);
  } finally {
    app.done();
  }
  // 8: the apply_patch gap is left as it is: patch headers are read for the claims only.
  assert.deepEqual(patchPaths({ input: '*** Begin Patch\n*** Update File: a.js\n*** End Patch' }, '/root'), ['/root/a.js']);
});

test('alerts: questions and approvals together at most once per 10 minutes per Mission', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }, { title: 'three' }]) } : spec.label === 'Mission: item 1' ? { text: 'NEEDS ANSWER: Which colour? | IF NO ANSWER: blue' } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'paint it well', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 2, helpers: 3 } });
    await app.step();
    await tick(40);
    assert.equal(app.runner.runOf('conv').items[0].status, 'parked');
    const child = app.seen.find((entry) => entry.label === 'Mission: item 2').childId;
    const parked = app.runner.parkFor(child, { kind: 'files', key: 'files:a.txt', what: 'Change a.txt', files: ['a.txt'] });
    assert.ok(parked.id, 'parked');
    await tick(10);
    const alerts = app.fired.filter((event) => event.type === 'needs-you' && event.waiting !== 'you');
    assert.deepEqual(alerts.map((event) => event.waiting), ['question'], 'the approval within 10 minutes of the question sends none');
  } finally {
    app.done();
  }
});
