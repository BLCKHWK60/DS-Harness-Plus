/**
 * Owner point 19 (20 November 2026): the repair helper may change any ordinary setting after your Allow; the stale Try now
 * line; a complete Mission with only the repair helper's suggestions; a run closed because its conversation is gone.
 * Never the user's ~/.dsh: everything lives in fresh temporary folders.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import z from '@deepseek-ai/schemastery';
import { GIT_CANDIDATES } from '../lib/checkpoints.js';
import { TEXT_MAX, catalogText, changeWords, changedWords, checkValue, readSettingsIndex, recheckSettingFix, refusedSetting, resolveSettingAsk, settingGone, settingsCatalog, valueWords } from '../lib/settings-fix.js';
import { widensAccess } from '../lib/repair.js';
import { repairPrompt } from '../lib/prompts.js';
import { CONVERSATION_GONE, GONE_UNDO_LINE, addApproval, addQuestion, applyPlan, continueBlock, decideOk, finish, lapseAtEnd, newRun, okChangedText, pendingOks, report } from '../lib/run.js';
import { createRunner } from '../runner.js';
import { stripOf } from '../lib/strip.js';
import { appHarness } from './app-harness.mjs';
import { PLAN, REPAIR, bench, fresh, tick } from './stage-e-bench.mjs';

const hasGit = GIT_CANDIDATES.some((path) => existsSync(path));

// ---- a stand-in settings list and settings service ----
const entry = (field, page, pageLabel, label, kind, extra = {}) => ({ page, pageLabel, heading: '', label, description: '', kind, keywords: [], configOnly: false, field, ...extra });
const INDEX = [
  entry('activity.still', 'activity', 'Activity', 'No movement', 'switch'),
  entry('activity.soundVolume', 'activity', 'Activity', 'Volume', 'slider'),
  entry('activity.design', 'activity', 'Activity', 'Design', 'select'),
  entry('activity.errorSound', 'activity', 'Activity', 'Sound for an error', 'select'),
  entry('activity.tapeMinutes', 'activity', 'Activity', 'History', 'number', { configOnly: true }),
  entry('ui-theme.textFontFamily', 'general', 'General', 'Text font', 'text'),
  entry('permission.defaultPreset', 'general', 'General', 'Permission', 'select'),
  entry('mission.maxTries', 'mission', 'Mission', 'Tries per item', 'number'),
  entry('mission.longNeeds', 'mission', 'Mission', 'When it needs you', 'select'),
  entry('mission.callsAtOnce', 'mission', 'Mission', 'Calls at once, per model server', 'number'),
  entry('budget.enabled', 'budget', 'Budget guard', 'Use the budget guard', 'switch'),
  entry('budget.maxSteps', 'budget', 'Budget guard', 'Steps', 'number'),
  entry('tool-access.mode', 'tool-access', 'Tool access', 'Ask before', 'select'),
  entry('code-map.enabled', 'code-map', 'Code tools', 'Code map', 'switch'),
  entry('modes.defaultMode', 'modes', 'Modes', 'Mode for new conversations', 'select'),
  entry('modes.webHost', 'modes', 'Modes', 'Search server', 'text', { keywords: ['host', 'url'] }),
];
const nsOf = (ns, dict, value) => ({ ns, schema: z.object(dict).toJSON(), value, revision: 1, applies: 'live' });
const namespaces = () => [
  nsOf('activity', { still: z.boolean().default(false), soundVolume: z.number().min(0).max(100).default(50), design: z.union(['bars', 'dots']).default('bars'), errorSound: z.string().default('ping'), tapeMinutes: z.number().default(5) }, { still: false, soundVolume: 50, design: 'bars', errorSound: 'ping' }),
  nsOf('ui-theme', { textFontFamily: z.string().default('') }, { textFontFamily: 'Inter' }),
  nsOf('permission', { defaultPreset: z.union(['read-only', 'workspace-write', 'full']).default('workspace-write') }, {}),
  nsOf('mission', { maxTries: z.number().default(3), longNeeds: z.string().default('ask'), callsAtOnce: z.string().default('{}') }, { maxTries: 3 }),
  nsOf('budget', { enabled: z.boolean().default(true), maxSteps: z.number().default(5000) }, {}),
];
/** The app's settings service: describe() and mutate(ns, ops), recorded. */
const settingsService = ({ fail = '' } = {}) => {
  const state = namespaces();
  const mutated = [];
  return {
    mutated,
    describe: () => state.map((row) => ({ ...row, value: JSON.parse(JSON.stringify(row.value)) })),
    mutate: async (ns, ops) => {
      if (fail) throw new Error(fail);
      mutated.push({ ns, ops: JSON.parse(JSON.stringify(ops)) });
      const row = state.find((each) => each.ns === ns);
      for (const op of ops) {
        let node = row.value;
        for (const key of op.path.slice(0, -1)) node = node[key] ??= {};
        node[op.path.at(-1)] = op.value;
      }
    },
  };
};

// ---- 1. the pure part ----
test('a setting is named by its id: a valid value becomes a change with page, setting, from and to; anything unsure stays a suggestion', () => {
  const ns = namespaces();
  const got = resolveSettingAsk({ kind: 'setting', field: 'activity.still', to: true, why: 'the animation slows the helpers' }, { index: INDEX, namespaces: ns });
  assert.equal(got.how, 'change');
  assert.deepEqual(got.fix, { kind: 'setting', field: 'activity.still', ns: 'activity', path: ['still'], page: 'Activity', label: 'No movement', from: false, to: true });
  assert.equal(got.what, 'Change Settings → Activity → No movement from Off to On');
  assert.equal(changedWords(got.fix), 'Changed after your Allow: Activity → No movement: Off → On.');
  assert.equal(resolveSettingAsk({ field: 'activity.still', to: 'on' }, { index: INDEX, namespaces: ns }).fix.to, true, 'on/off words read as a switch');
  assert.equal(resolveSettingAsk({ field: 'activity.soundVolume', to: 20 }, { index: INDEX, namespaces: ns }).what, 'Change Settings → Activity → Volume from 50 to 20');
  assert.equal(resolveSettingAsk({ field: 'activity.design', to: 'dots' }, { index: INDEX, namespaces: ns }).fix.to, 'dots');
  assert.equal(resolveSettingAsk({ field: 'ui-theme.textFontFamily', to: 'Menlo' }, { index: INDEX, namespaces: ns }).what, 'Change Settings → General → Text font from "Inter" to "Menlo"');
  assert.equal(resolveSettingAsk({ field: 'mission.maxTries', to: 5 }, { index: INDEX, namespaces: ns }).fix.from, 3, 'the value now is read from the settings service');
  // Never a guess: each of these stays a suggestion question.
  const suggest = (ask, why) => {
    const out = resolveSettingAsk(ask, { index: INDEX, namespaces: ns });
    assert.equal(out.how, 'suggest', JSON.stringify(ask));
    if (why) assert.match(out.why, why);
  };
  suggest({ where: 'Settings → Activity', change: 'switch the animation off' }, /no setting was named/);
  suggest({ field: 'activity.nothing', to: 1 }, /no setting has that id/);
  suggest({ field: 'activity.soundVolume', to: 150 }, /at most 100/);
  suggest({ field: 'activity.soundVolume', to: 'loud' }, /takes a number/);
  suggest({ field: 'activity.design', to: 'stars' }, /one of "bars", "dots"/);
  suggest({ field: 'activity.errorSound', to: 'bell' }, /cannot be changed from a Mission/);
  suggest({ field: 'activity.still' }, /no new value/);
  // Lab check of point 19: the value it has already is no change at all.
  const same = resolveSettingAsk({ field: 'activity.still', to: false }, { index: INDEX, namespaces: ns });
  assert.equal(same.how, 'same');
  assert.match(same.why, /Off already/);
  suggest({ field: 'ui-theme.textFontFamily', to: 'a\nb' }, /one line of text/);
  suggest({ field: 'mission.callsAtOnce', to: 1 }, /cannot be changed from a Mission/);
  suggest({ field: 'budget.maxSteps', to: 9000 }, /cannot be changed from a Mission/);
  assert.equal(resolveSettingAsk({ field: 'activity.still', to: true }, { index: INDEX, namespaces: undefined }).how, 'suggest', 'settings service not there');
  assert.equal(checkValue({ type: 'number', step: 1 }, 2.5).ok, false);
});

test('a setting that would give more access is refused, by its page or its id, never asked', () => {
  const ns = namespaces();
  for (const field of ['permission.defaultPreset', 'mission.longNeeds', 'budget.enabled', 'tool-access.mode', 'code-map.enabled', 'activity.tapeMinutes', 'modes.defaultMode', 'modes.webHost']) {
    const got = resolveSettingAsk({ field, to: 'x' }, { index: INDEX, namespaces: ns });
    assert.equal(got.how, 'refused', field);
    assert.ok(got.why, field);
  }
  assert.match(refusedSetting(INDEX.find((one) => one.field === 'activity.tapeMinutes')), /config file/);
  assert.match(refusedSetting(INDEX.find((one) => one.field === 'mission.longNeeds')), /when it asks you/);
  assert.match(refusedSetting(INDEX.find((one) => one.field === 'code-map.enabled')), /on or off/);
  assert.equal(refusedSetting(INDEX.find((one) => one.field === 'activity.still')), '');
  assert.equal(widensAccess({ kind: 'setting', field: 'tool-access.mode', to: 'never' }), true, 'the id counts too');
  // The real settings list: none of the access settings is offered.
  const real = readSettingsIndex();
  if (real.length > 0) {
    for (const field of ['permission.defaultPreset', 'mission.longNeeds', 'mission.longWaitAsk', 'mission.defaultMode', 'budget.enabled', 'mission.enabled']) {
      const one = real.find((each) => each.field === field);
      if (one) assert.ok(refusedSetting(one), field);
    }
  }
});

test('the list the repair helper gets: Mission\'s page first, the value now and the values each takes; nothing refused or with its own ask', () => {
  const list = catalogText(settingsCatalog(INDEX, namespaces()));
  const rows = list.split('\n');
  assert.equal(rows[0], '- mission.maxTries | Mission → Tries per item | now 3 | a whole number from 1 up to 8', 'Mission\'s own range, though its schema has none');
  assert.ok(rows.includes('- activity.still | Activity → No movement | now false | true or false'));
  assert.ok(rows.includes('- activity.soundVolume | Activity → Volume | now 50 | a number from 0 up to 100'));
  assert.ok(rows.includes('- activity.design | Activity → Design | now "bars" | one of "bars", "dots"'));
  assert.ok(rows.includes('- ui-theme.textFontFamily | General → Text font | now "Inter" | one line of text'));
  for (const field of ['permission.', 'longNeeds', 'callsAtOnce', 'budget.', 'tool-access', 'errorSound', 'tapeMinutes']) assert.doesNotMatch(list, new RegExp(field.replace('.', '\\.')), field);
  const prompt = repairPrompt({ goal: 'g', cause: 'c', appSettings: list });
  assert.match(prompt, /name it by its id from the list below and give the new value exactly as the list allows: \{"kind": "setting", "field": "the id", "to": the new value, "why": "\.\.\."\}/);
  assert.match(prompt, /Settings you may ask to change \(id \| page → setting \| value now \| values it takes\):\n- mission\.maxTries/);
  assert.match(repairPrompt({ goal: 'g', cause: 'c' }), /To ask for a setting, give "where" \(Settings → page → setting\) and "change"; the user changes it by hand\./);
  assert.equal(settingGone({ kind: 'setting', ns: 'activity', path: ['still'], page: 'Activity', label: 'No movement', to: true }, namespaces()), '');
  assert.match(settingGone({ kind: 'setting', ns: 'gone', path: ['x'], page: 'Old', label: 'Thing', to: true }, namespaces()), /is not there any more/);
  assert.match(settingGone({ kind: 'setting', ns: 'activity', path: ['soundVolume'], page: 'Activity', label: 'Volume', to: 500 }, namespaces()), /does not take 500 any more/);
  assert.equal(changeWords({ page: 'P', label: 'L', from: null, to: 'x' }), 'Change Settings → P → L from empty to "x"');
});

// ---- 2. in the runner ----
test('the repair helper\'s setting asks: a named setting waits for your Allow (Ask modes) or is listed (Full auto); an access one is refused and listed; an unsure one stays a suggestion', async () => {
  for (const needs of ['ask', 'decide']) {
    const service = settingsService();
    let prompt = '';
    const app = bench({
      settingsIndex: INDEX,
      services: { settings: service },
      answer: (spec) => {
        if (spec.label === 'Mission: planner') return { throws: 'socket closed by the planner' };
        if (spec.label === 'Mission: repair helper') {
          prompt = spec.prompt?.[0]?.text ?? '';
          return { text: REPAIR([], [{ kind: 'setting', field: 'activity.still', to: true, why: 'the animation slows this Mac' }, { kind: 'setting', field: 'permission.defaultPreset', to: 'full', why: 'more room' }]) };
        }
        return undefined;
      },
    });
    try {
      await app.start({ needs });
      for (let i = 0; i < 4; i += 1) await app.step();
      const run = app.run();
      assert.match(prompt, /- activity\.still \| Activity → No movement \| now false \| true or false/);
      const change = run.approvals.find((one) => one.kind === 'repair' && one.fix?.kind === 'setting');
      assert.equal(change.what, 'Change Settings → Activity → No movement from Off to On');
      assert.equal(change.reason, 'the animation slows this Mac');
      assert.equal(change.status, needs === 'decide' ? 'unasked' : 'open', needs);
      assert.equal(change.by, 'repair');
      const refused = run.approvals.find((one) => one.status === 'cannot');
      assert.match(refused.what, /^Change General → Permission to full \(it decides what|^Change General → Permission to full \(it gives access/);
      assert.equal(run.approvals.filter((one) => one.status === 'open' || one.status === 'unasked').length, 1, 'the access one is never asked');
      assert.equal((run.questions ?? []).filter((question) => question.from === 'repair').length, 0, 'no suggestion question for a setting it could name');
      assert.deepEqual(service.mutated, [], 'nothing is changed before your Allow');
      assert.equal(app.runner.view('conv').approvals.find((one) => one.id === change.id)?.fix, 'setting');
    } finally {
      app.done();
    }
  }
  // A setting it cannot name exactly stays a suggestion, as before.
  const app = bench({
    settingsIndex: INDEX,
    services: { settings: settingsService() },
    answer: (spec) => {
      if (spec.label === 'Mission: planner') return { throws: 'socket closed by the planner' };
      if (spec.label === 'Mission: repair helper') return { text: REPAIR([], [{ kind: 'setting', field: 'activity.soundVolume', to: 400, why: 'w' }]) };
      return undefined;
    },
  });
  try {
    await app.start();
    for (let i = 0; i < 4; i += 1) await app.step();
    const question = app.run().questions.find((one) => one.from === 'repair');
    assert.equal(question.text, 'The repair helper suggests a change in Settings → Activity → Volume: set it to 400. Mission does not change that setting itself. If you agree, change it there; then answer here.');
    assert.equal((app.run().approvals ?? []).filter((one) => one.fix?.kind === 'setting').length, 0);
  } finally {
    app.done();
  }
});

// ---- 3. Allow, through the add-on's card ----
const settingRun = async ({ service }) => {
  const app = appHarness({
    settingsIndex: INDEX,
    services: { settings: service },
    answer: (spec) => {
      if (spec.label === 'Mission: planner') return { throws: 'socket closed by the planner' };
      if (spec.label === 'Mission: repair helper') return { text: REPAIR([], [{ kind: 'setting', field: 'activity.soundVolume', to: 20, why: 'quieter' }]) };
      return undefined;
    },
  });
  const agent = app.open('c');
  assert.equal((await app.card({ sessionId: 'c', action: 'start', goal: 'make two small things for me', mode: 'auto' })).status, 200);
  for (let i = 0; i < 4; i += 1) await app.step(agent);
  await tick(20);
  const change = app.runner().view('c').approvals.find((one) => one.fix === 'setting');
  return { app, agent, change };
};
const runFolder = (agent) => {
  const runs = join(agent.header.cwd, '.dsh-mission', 'runs');
  return join(runs, readdirSync(runs)[0]);
};

test('Allow makes the change through the app\'s settings service, notes it in the run log and the report; Deny leaves it', { skip: !hasGit && 'takes a save point' }, async () => {
  const service = settingsService();
  const { app, agent, change } = await settingRun({ service });
  try {
    assert.ok(change, 'the change waits in the card');
    assert.equal(change.what, 'Change Settings → Activity → Volume from 50 to 20');
    const done = await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: change.id, choice: 'allow' }] });
    assert.equal(done.status, 200, JSON.stringify(done.json));
    assert.match(done.json.said, /^Allowed: Change Settings → Activity → Volume from 50 to 20\. The Mission (carries on|goes on with it)\.$/);
    assert.deepEqual(service.mutated, [{ ns: 'activity', ops: [{ op: 'set', path: ['soundVolume'], value: 20 }] }]);
    const log = readFileSync(join(runFolder(agent), 'log.jsonl'), 'utf8').trim().split('\n').map((row) => JSON.parse(row));
    const noted = log.find((row) => row.kind === 'setting-changed');
    assert.equal(noted.said, 'Changed after your Allow: Activity → Volume: 50 → 20.');
    assert.deepEqual([noted.field, noted.from, noted.to], ['activity.soundVolume', 50, 20]);
    const run = JSON.parse(readFileSync(join(runFolder(agent), 'run.json'), 'utf8'));
    assert.match(report(run), /\nChanged after your Allow: Activity → Volume: 50 → 20\./);
  } finally {
    app.done();
  }
  const denied = settingsService();
  const second = await settingRun({ service: denied });
  try {
    const said = await second.app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: second.change.id, choice: 'deny' }] });
    assert.equal(said.json.said, 'Denied: Change Settings → Activity → Volume from 50 to 20. The Mission does not try another way.');
    assert.deepEqual(denied.mutated, []);
  } finally {
    second.app.done();
  }
});

test('Allow says plainly when the settings service cannot be reached, when the setting is gone, or when the change fails; nothing is changed', { skip: !hasGit && 'takes a save point' }, async () => {
  const service = settingsService();
  const { app, change } = await settingRun({ service });
  try {
    const keep = { describe: service.describe, mutate: service.mutate };
    delete service.mutate;
    let got = await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: change.id, choice: 'allow' }] });
    assert.equal(got.status, 400);
    assert.equal(got.json.error, 'That change could not be made: the app\'s settings could not be reached. Try again in a moment, or change it yourself in Settings. Nothing was changed.');
    service.mutate = keep.mutate;
    service.describe = () => keep.describe().filter((row) => row.ns !== 'activity');
    got = await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: change.id, choice: 'allow' }] });
    assert.equal(got.json.error, 'That change could not be made: the setting Activity → Volume is not there any more (its add-on may be off). Nothing was changed. Press Deny, or change it yourself in Settings → Activity → Volume.');
    service.describe = keep.describe;
    service.mutate = async () => { throw new Error('Config field "soundVolume" is not volatile'); };
    got = await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: change.id, choice: 'allow' }] });
    // The raw text of the settings service only behind Details; the sentence says what went wrong and what to click.
    assert.equal(got.json.error, 'That change could not be made: the app did not take the new value. Nothing was changed. Press Deny, or change it yourself in Settings → Activity → Volume.');
    assert.equal(got.json.details, 'Config field "soundVolume" is not volatile');
    assert.equal(app.runner().view('c').approvals.find((one) => one.id === change.id)?.id, change.id, 'still open');
  } finally {
    app.done();
  }
});

// ---- 3b. review of point 19: Allow never trusts the saved change ----
test('Allow builds the change again from its setting id: an altered namespace, path, page, label or value is refused; a refused setting is refused again', () => {
  const ns = namespaces();
  const { fix } = resolveSettingAsk({ field: 'activity.soundVolume', to: 20 }, { index: INDEX, namespaces: ns });
  const ok = recheckSettingFix(fix, { index: INDEX, namespaces: ns });
  assert.deepEqual(ok.fix, fix);
  assert.equal(ok.what, 'Change Settings → Activity → Volume from 50 to 20');
  const altered = (change) => recheckSettingFix({ ...fix, ...change }, { index: INDEX, namespaces: ns });
  for (const change of [{ ns: 'permission', path: ['defaultPreset'], to: 'full' }, { ns: 'permission', path: ['defaultPreset'] }, { path: ['still'] }, { label: 'Font size' }, { page: 'General' }, { kind: 'calls' }]) {
    const got = altered(change);
    assert.equal(got.fix, undefined, JSON.stringify(change));
    assert.match(got.why, /may have been altered|does not fit/, JSON.stringify(change));
  }
  assert.match(altered({ path: ['design'] }).why, /may have been altered/);
  // Another valid value is the value the card shows (it is said from the fix), so it is the one made.
  assert.equal(altered({ to: 21 }).fix.to, 21);
  // The id itself changed to a setting a Mission may never change: refused by the rules, whatever the saved words say.
  const preset = altered({ field: 'permission.defaultPreset', ns: 'permission', path: ['defaultPreset'], to: 'full' });
  assert.match(preset.why, /^a Mission may not change that setting: /);
  assert.deepEqual(preset.where, { page: 'General', label: 'Permission' }, 'the next step names the setting the list gives');
  assert.match(altered({ field: 'budget.enabled', ns: 'budget', path: ['enabled'], to: false }).why, /may not change that setting/);
  assert.match(altered({ field: 'nothing.here' }).why, /not in the settings list any more/);
  assert.match(recheckSettingFix(fix, { index: INDEX, namespaces: undefined }).why, /could not be read/);
  // Already at that value (you changed it yourself): still the same setting, nothing to refuse.
  const same = ns.map((row) => (row.ns === 'activity' ? { ...row, value: { ...row.value, soundVolume: 20 } } : row));
  assert.equal(recheckSettingFix(fix, { index: INDEX, namespaces: same }).fix.to, 20);
});

const restartWith = (first, service) => appHarness({ home: first.home, settingsIndex: INDEX, services: { settings: service } });
const alterSaved = (agent, id, change) => {
  const file = join(runFolder(agent), 'run.json');
  const run = JSON.parse(readFileSync(file, 'utf8'));
  const entry = run.approvals.find((one) => one.id === id);
  change(entry);
  writeFileSync(file, JSON.stringify(run));
};

test('a pending setting change altered in the run\'s saved record (read again after a restart) is refused at Allow; nothing is changed, and the card says what it would really do', { skip: !hasGit && 'takes a save point' }, async () => {
  const service = settingsService();
  const { app, agent, change } = await settingRun({ service });
  let second;
  try {
    assert.ok(change);
    // A helper's command edits the saved approval: a wider permission preset, said as a harmless font size change.
    alterSaved(agent, change.id, (entry) => {
      entry.fix = { ...entry.fix, ns: 'permission', path: ['defaultPreset'], to: 'full', page: 'General', label: 'Font size', from: 14 };
      entry.what = 'Change Settings → General → Font size from 14 to 15';
    });
    second = restartWith(app, service);
    second.open('c', agent.header.cwd);
    const shown = second.runner().view('c').approvals.find((one) => one.id === change.id);
    assert.equal(shown.what, 'Change Settings → General → Font size from 14 to "full"', 'the card is said from the fix, not the saved sentence');
    const got = await second.card({ sessionId: 'c', action: 'approve', approvals: [{ id: change.id, choice: 'allow' }] });
    assert.equal(got.status, 400);
    assert.equal(got.json.error, 'That change could not be made: the new value does not fit: it takes a number. Nothing was changed. Press Deny, or change it yourself in Settings → Activity → Volume.');
    assert.deepEqual(service.mutated, []);
    // A value that fits, sent to another place: refused as altered.
    alterSaved(agent, change.id, (entry) => { entry.fix = { ...entry.fix, ns: 'activity', path: ['design'], to: 20, page: 'Activity', label: 'Volume' }; });
    second.done();
    second = restartWith(app, service);
    second.open('c', agent.header.cwd);
    const moved = await second.card({ sessionId: 'c', action: 'approve', approvals: [{ id: change.id, choice: 'allow' }] });
    assert.equal(moved.json.error, 'That change could not be made: the saved change does not match the setting it names, so it may have been altered. Nothing was changed. Press Deny, or change it yourself in Settings → Activity → Volume.');
    assert.deepEqual(service.mutated, []);
    // The id changed too: refused by the rules again.
    alterSaved(agent, change.id, (entry) => { entry.fix = { ...entry.fix, field: 'permission.defaultPreset' }; });
    second.done();
    second = restartWith(app, service);
    second.open('c', agent.header.cwd);
    const again = await second.card({ sessionId: 'c', action: 'approve', approvals: [{ id: change.id, choice: 'allow' }] });
    assert.match(again.json.error, /^That change could not be made: a Mission may not change that setting: /);
    assert.deepEqual(service.mutated, []);
  } finally {
    second?.done();
    app.done();
  }
});

test('when one of several changes fails, the answer says what was done before it and that nothing after it was changed; the raw text is behind Details', { skip: !hasGit && 'takes a save point' }, async () => {
  const service = settingsService();
  const real = service.mutate;
  service.mutate = async (ns, ops) => {
    if (ops[0]?.path?.[0] === 'still') throw new Error('settings/conflict: revision 7');
    return real(ns, ops);
  };
  const app = appHarness({
    settingsIndex: INDEX,
    services: { settings: service },
    answer: (spec) => {
      if (spec.label === 'Mission: planner') return { throws: 'socket closed by the planner' };
      if (spec.label === 'Mission: repair helper') return { text: REPAIR([], [{ kind: 'setting', field: 'activity.soundVolume', to: 20, why: 'quieter' }, { kind: 'setting', field: 'activity.still', to: true, why: 'calmer' }]) };
      return undefined;
    },
  });
  try {
    const agent = app.open('c');
    assert.equal((await app.card({ sessionId: 'c', action: 'start', goal: 'make two small things for me', mode: 'auto' })).status, 200);
    for (let i = 0; i < 4; i += 1) await app.step(agent);
    await tick(20);
    const asked = app.runner().view('c').approvals.filter((one) => one.fix === 'setting');
    const volume = asked.find((one) => /Volume/.test(one.what));
    const still = asked.find((one) => /No movement/.test(one.what));
    assert.ok(volume && still);
    const got = await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: volume.id, choice: 'allow' }, { id: still.id, choice: 'allow' }] });
    assert.equal(got.status, 400);
    assert.match(got.json.error, /^That change could not be made: the app did not take the new value\. This one was not changed\. Press Deny, or change it yourself in Settings → Activity → No movement\. Done before it: Allowed: Change Settings → Activity → Volume from 50 to 20\. The Mission (carries on|goes on with it)\. Nothing after it was changed\.$/);
    assert.doesNotMatch(got.json.error, /settings\/conflict/);
    assert.equal(got.json.details, 'settings/conflict: revision 7');
    assert.deepEqual(service.mutated, [{ ns: 'activity', ops: [{ op: 'set', path: ['soundVolume'], value: 20 }] }]);
    const after = app.runner().view('c').approvals;
    assert.equal(after.find((one) => one.id === still.id)?.status, 'open', 'the failed one still waits');
    // With a tool permission chosen after the failing change: it was given first, so it is taken back and never kept.
    const file = join(runFolder(agent), 'run.json');
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    const tool = addApproval(saved, { kind: 'tool', key: 'tool:web_fetch', what: 'Use Fetch a web page', tool: 'web_fetch', plain: 'Fetch a web page', by: 'repair' }).entry;
    writeFileSync(file, JSON.stringify(saved));
    const granted = [];
    const revoked = [];
    const second = appHarness({ home: app.home, settingsIndex: INDEX, services: { settings: service, toolAccess: { grantParked: async ({ tool: name }) => { granted.push(name); return { ok: true, id: `g-${name}` }; }, denyParked: () => {}, revoke: async (id) => { revoked.push(id); } } } });
    try {
      second.open('c', agent.header.cwd);
      const mixed = await second.card({ sessionId: 'c', action: 'approve', approvals: [{ id: still.id, choice: 'allow' }, { id: tool.id, choice: 'mission' }] });
      assert.equal(mixed.status, 400);
      assert.equal(mixed.json.error, 'That change could not be made: the app did not take the new value. Nothing was changed. Press Deny, or change it yourself in Settings → Activity → No movement.');
      assert.deepEqual(granted, ['web_fetch']);
      await tick(5);
      assert.deepEqual(revoked, ['g-web_fetch'], 'the permission given for the later choice goes back');
      assert.equal(second.runner().view('c').approvals.find((one) => one.id === tool.id)?.status, 'open');
    } finally {
      second.done();
    }
  } finally {
    app.done();
  }
});

// ---- review of point 19: what a Mission may never change, on the real settings list ----
test('settings that work without you, skip a review, need a consent, or pick a model, role, depth or instructions are refused (the real settings list too)', () => {
  const stand = [
    entry('engines.applyWhen', 'engines', 'Engines', 'When an engine\'s changes go in', 'select', { description: 'review waits for you; auto puts everything in' }),
    entry('other.mode', 'other', 'Other', 'How it goes', 'select', { description: 'Changes go in without review.' }),
    entry('other.watch', 'other', 'Other', 'Watcher model', 'text'),
    entry('other.night', 'other', 'Other', 'Night work', 'switch', { description: 'Works at night on this Mac.' }),
    entry('activity.still', 'activity', 'Activity', 'No movement', 'switch', { description: 'Stops the animation.' }),
  ];
  for (const field of ['engines.applyWhen', 'other.mode', 'other.watch', 'other.night']) assert.ok(refusedSetting(stand.find((one) => one.field === field)), field);
  assert.match(refusedSetting(stand[1]), /without you, or without a review/, 'read from the description');
  assert.match(refusedSetting(stand[2]), /picks a model/);
  assert.equal(refusedSetting(stand[4]), '');
  const real = readSettingsIndex();
  if (real.length === 0) return;
  const refused = ['engines.applyWhen', 'tuning.anthropicOpenEnded', 'tuning.nightShift', 'tuning.nightSkills', 'tuning.nightTrain', 'tuning.skills', 'tuning.providers', 'tuning.harvest', 'tuning.skillExam', 'tuning.teacher', 'skill-architect.schedule', 'split-plus.watcherModel', 'code-power.bestOfN.judgeRole', 'modes.researchDepth', 'model-arena.criteria', 'mission.longCarryOn'];
  for (const field of refused) {
    const rows = real.filter((one) => one.field === field);
    if (rows.length === 0) continue;
    assert.ok(rows.every((one) => refusedSetting(one)), field);
  }
  // Ordinary settings stay possible.
  for (const field of ['ui-theme.fontSize', 'activity.still', 'mission.maxTries', 'mission.longLaps', 'mission.longHelpers']) {
    const rows = real.filter((one) => one.field === field);
    if (rows.length > 0) assert.equal(refusedSetting(rows[0]), '', field);
  }
});

test('a text value is shown whole on the card, with its quotes written out; hidden characters are refused', () => {
  const ns = namespaces();
  const long = `Menlo, ${'x'.repeat(150)}, "Evil" Sans`;
  assert.ok(long.length > 80 && long.length <= TEXT_MAX);
  const got = resolveSettingAsk({ field: 'ui-theme.textFontFamily', to: long }, { index: INDEX, namespaces: ns });
  assert.equal(got.how, 'change');
  assert.equal(got.what, `Change Settings → General → Text font from "Inter" to ${JSON.stringify(long)}`);
  assert.ok(got.what.includes('\\"Evil\\" Sans'), 'the end of the value is on the card, quotes escaped');
  assert.equal(valueWords('a"b'), '"a\\"b"');
  for (const hidden of ['Menlo‮', 'Men\u0007lo', 'Menlo​']) {
    const out = resolveSettingAsk({ field: 'ui-theme.textFontFamily', to: hidden }, { index: INDEX, namespaces: ns });
    assert.equal(out.how, 'suggest', JSON.stringify(hidden));
    assert.match(out.why, /hidden or control characters/);
  }
  assert.equal(resolveSettingAsk({ field: 'ui-theme.textFontFamily', to: 'x'.repeat(TEXT_MAX + 1) }, { index: INDEX, namespaces: ns }).how, 'suggest');
});

test('numbers: Mission\'s own settings keep their ranges (0 says "no limit"), and no number setting takes a negative value unless its schema says so', () => {
  const index = [
    entry('mission.longLaps', 'mission', 'Mission', 'Laps', 'number'),
    entry('mission.longMinutes', 'mission', 'Mission', 'Time limit', 'number'),
    entry('mission.maxTries', 'mission', 'Mission', 'Tries per item', 'number'),
    entry('mission.longHelpers', 'mission', 'Mission', 'Helpers at once', 'number'),
    entry('ui-theme.fontSize', 'general', 'General', 'Font size', 'number'),
  ];
  const ns = [
    nsOf('mission', { longLaps: z.number().default(10), longMinutes: z.number().default(120), maxTries: z.number().default(3), longHelpers: z.number().default(4) }, { longLaps: 20, longMinutes: 120, maxTries: 3, longHelpers: 4 }),
    nsOf('ui-theme', { fontSize: z.number().default(14) }, { fontSize: 14 }),
  ];
  const ask = (field, to) => resolveSettingAsk({ field, to }, { index, namespaces: ns });
  assert.match(ask('mission.longLaps', -1).why, /at least 1/);
  assert.match(ask('mission.longLaps', 51).why, /at most 50/);
  assert.equal(ask('mission.longLaps', 0).what, 'Change Settings → Mission → Laps from 20 to 0 (no lap limit)');
  assert.match(ask('mission.longMinutes', 5).why, /at least 10/);
  assert.equal(ask('mission.longMinutes', 0).what, 'Change Settings → Mission → Time limit from 120 to 0 (no time limit)');
  assert.match(ask('mission.maxTries', 500).why, /at most 8/);
  assert.match(ask('mission.maxTries', 2.5).why, /whole number/);
  assert.match(ask('mission.maxTries', 0).why, /at least 1/, '0 is no "no limit" here');
  assert.match(ask('mission.longHelpers', 9).why, /at most 8/);
  assert.equal(ask('mission.longHelpers', 2).how, 'change');
  assert.match(ask('ui-theme.fontSize', -3).why, /at least 0/);
  assert.equal(ask('ui-theme.fontSize', 16).how, 'change');
  const list = catalogText(settingsCatalog(index, ns));
  assert.match(list, /- mission\.longLaps \| Mission → Laps \| now 20 \| a whole number from 1 up to 50, or 0 for no lap limit/);
  assert.match(list, /- ui-theme\.fontSize \| General → Font size \| now 14 \| a number from 0/);
  assert.equal(changedWords({ field: 'mission.longLaps', page: 'Mission', label: 'Laps', from: 20, to: 0 }), 'Changed after your Allow: Mission → Laps: 20 → 0 (no lap limit).');
});

// ---- 4. a complete Mission with only the repair helper's suggestions ----
test('a complete Mission with only a repair suggestion stays complete: no Finish it, nothing "left for you"; the report lists the suggestion', () => {
  const run = newRun({ id: 'r', goal: 'g', mode: 'Full Auto', root: '/w', limits: {}, kind: 'long', long: { minutes: 60, laps: 2 } });
  applyPlan(run, { items: [{ title: 'one' }] });
  run.items[0].status = 'verified';
  const question = addQuestion(run, { text: 'The repair helper suggests a change in Settings → Activity: switch the animation off. Mission does not change that setting itself. If you agree, change it there; then answer here.', assume: 'It goes on as it is.', from: 'repair' });
  addApproval(run, { kind: 'repair', by: 'repair', key: 'setting:activity.still:true', what: 'Change Settings → Activity → No movement from Off to On', reason: 'the animation slows this Mac', fix: { kind: 'setting' } });
  finish(run);
  assert.equal(run.status, 'complete');
  assert.equal(continueBlock(run), 'nothing', 'Finish it is not offered');
  const text = report(run);
  assert.match(text, /^Mission complete: all 1 item done and checked\./);
  // Lab check of point 19: the setting change waits for your OK (Allow on the strip); only the question is a suggestion.
  assert.match(text, /\nWaits for your OK \(press "1 change waits for your OK" above the chat box; Allow makes the change, nothing runs again\):\n- Change Settings → Activity → No movement from Off to On\. The repair helper said: "the animation slows this Mac"\n/);
  assert.match(text, /The repair helper suggests \(nothing waits for these; change them yourself if you agree\):\n- The repair helper suggests a change in Settings → Activity: switch the animation off\./);
  assert.doesNotMatch(text, /change them yourself if you agree\):\n- Change Settings/);
  assert.doesNotMatch(text, /Questions still open|Waiting for your yes|To finish it: press Finish it/);
  // The strip after the end: the server says it cannot be continued, so nothing is "left for you".
  const shown = stripOf({ run: { status: 'complete', kind: 'long', items: run.items, questions: [{ ...question }], approvals: run.approvals, canContinue: continueBlock(run) === '' } });
  assert.equal(shown.state, 'finished');
  assert.equal(shown.canContinue, false);
  assert.deepEqual(shown.approvals, []);
  // Real work left: Finish it shows, and brings the suggestion along.
  run.items[0].status = 'open';
  assert.equal(continueBlock(run), '');
  assert.doesNotMatch(report(run), /The repair helper suggests \(nothing waits/);
  // Full auto decided the suggestion itself: still nothing to finish.
  run.items[0].status = 'verified';
  run.questions.find((one) => one.id === question.id).status = 'skipped';
  run.questions.find((one) => one.id === question.id).self = true;
  assert.equal(continueBlock(run), 'nothing');
  // A question from the plan still counts as before.
  addQuestion(run, { text: 'Which colour?', assume: 'blue', from: 'plan' });
  assert.equal(continueBlock(run), '');
});

test('the finished event counts nothing left for a complete Mission whose only open question is a repair suggestion', async () => {
  const app = bench({
    answer: (spec) => {
      if (spec.label === 'Mission: planner') return { text: PLAN([{ title: 'one' }]) };
      if (/reviewer/.test(spec.label)) return { text: '{"verdict":"approve","note":"ok","items":[{"id":"1","ok":true,"note":"fine"}]}' };
      return undefined;
    },
  });
  try {
    await app.start();
    const run = app.run();
    addQuestion(run, { text: 'The repair helper suggests a change in Settings → Activity: x. Mission does not change that setting itself. If you agree, change it there; then answer here.', assume: 'It goes on as it is.', from: 'repair' });
    for (let i = 0; i < 30 && app.run().status === 'running'; i += 1) await app.step();
    await tick(20);
    const finished = app.fired.find((event) => event.type === 'finished');
    assert.equal(app.run().status, 'complete');
    assert.equal(finished.left, 0);
    assert.equal(finished.canContinue, false);
  } finally {
    app.done();
  }
});

// ---- 5. a run closed because its conversation is gone ----
test('a run whose conversation is gone counts only the time it worked, says how long it sat unused, and says undo is no longer possible', () => {
  const home = fresh('mission-gone-home-');
  const project = fresh('mission-gone-project-');
  const day = 24 * 60 * 60_000;
  const started = Date.now() - 7 * day;
  const gone = newRun({ id: '20261113140843-dc07', goal: 'an old goal', mode: 'Auto', root: project, limits: {}, kind: 'long', long: { minutes: 60, laps: 2 }, at: started, checkpoint: 4 });
  applyPlan(gone, { items: [{ title: 'a' }] });
  gone.checkpoint = 4;
  const dir = join(project, '.dsh-mission', 'runs', gone.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'run.json'), JSON.stringify(gone));
  // Its last logged step: 25 minutes after the start.
  writeFileSync(join(dir, 'log.jsonl'), [
    { at: new Date(started + 60_000).toISOString(), step: 1, kind: 'plan' },
    { at: new Date(started + 25 * 60_000).toISOString(), step: 4, kind: 'work' },
    'not json',
  ].map((row) => (typeof row === 'string' ? row : JSON.stringify(row))).join('\n'));
  mkdirSync(join(home, 'mission'), { recursive: true });
  writeFileSync(join(home, 'mission', 'active-runs.json'), JSON.stringify({ 'session-gone': { root: project, id: gone.id } }));
  const runner = createRunner({ get: () => undefined }, { settings: () => ({ limits: {}, roles: {}, projects: {} }), pointsOf: () => ({}), afterCommand: async () => [], warn: () => {}, home: (sub) => join(home, sub) });
  const out = runner.reconcile(() => false);
  assert.deepEqual(out.closed, ['session-gone']);
  const closed = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
  assert.equal(closed.stopReason, CONVERSATION_GONE);
  assert.equal(closed.endedAt, started + 25 * 60_000, 'it ends at its last logged step');
  assert.ok(closed.closedAt >= Date.now() - 60_000);
  const text = readFileSync(join(dir, 'report.md'), 'utf8');
  assert.match(text, /\nTook 25 minutes and 1 step\./);
  assert.match(text, /\nIt worked until \d+ \w+ \d{4}, \d\d:\d\d; it then sat unused until \d+ \w+ \d{4}, \d\d:\d\d, when it was closed\. That time did not count\./);
  assert.ok(text.trimEnd().endsWith(GONE_UNDO_LINE));
  assert.doesNotMatch(text, /\/mission back \d/);
  const line = readFileSync(join(home, 'mission', 'runs.jsonl'), 'utf8').trim().split('\n').map((row) => JSON.parse(row)).find((row) => row.id === gone.id);
  assert.equal(line.minutes, 25);
  const summary = JSON.parse(readFileSync(join(home, 'mission', 'runs', gone.id, 'summary.json'), 'utf8'));
  assert.equal(summary.minutes, 25);
  assert.equal(summary.endedAt, started + 25 * 60_000);
  // A run ended in the ordinary way keeps its undo line and says nothing about sitting unused.
  const ended = newRun({ id: 'x', goal: 'g', mode: 'Auto', root: project, limits: {}, kind: 'long', long: { minutes: 60, laps: 2 }, at: Date.now() - 10 * 60_000 });
  ended.checkpoint = 2;
  finish(ended, 'You ended it.');
  assert.match(report(ended), /To undo everything this run changed: \/mission back 2$/);
  assert.doesNotMatch(report(ended), /sat unused/);
});

/** A run whose conversation was deleted, as kept on disk with its log, and closed at the next start. */
const closeGone = (shape, rows) => {
  const home = fresh('mission-gone-home-');
  const project = fresh('mission-gone-project-');
  const run = newRun({ id: '20261120100000-ab12', goal: 'g', mode: 'Auto', root: project, limits: {}, kind: 'long', long: { minutes: 0, laps: 0 }, at: shape.started });
  applyPlan(run, { items: [{ title: 'a' }] });
  shape.change(run);
  const dir = join(project, '.dsh-mission', 'runs', run.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'run.json'), JSON.stringify(run));
  writeFileSync(join(dir, 'log.jsonl'), rows.map((row) => JSON.stringify(row)).join('\n'));
  mkdirSync(join(home, 'mission'), { recursive: true });
  writeFileSync(join(home, 'mission', 'active-runs.json'), JSON.stringify({ 'session-gone': { root: project, id: run.id } }));
  const runner = createRunner({ get: () => undefined }, { settings: () => ({ limits: {}, roles: {}, projects: {} }), pointsOf: () => ({}), afterCommand: async () => [], warn: () => {}, home: (sub) => join(home, sub) });
  assert.deepEqual(runner.reconcile(() => false).closed, ['session-gone']);
  return { closed: JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')), text: readFileSync(join(dir, 'report.md'), 'utf8') };
};
const MIN = 60_000;
const at = (ms) => new Date(ms).toISOString();

test('a paused run whose conversation is gone ends at its pause: a line logged later (a restart) and the paused time are not working time', () => {
  const started = Date.now() - 4 * 24 * 60 * MIN;
  const restarted = started + 3 * 24 * 60 * MIN;
  const { closed, text } = closeGone({ started, change: (run) => { run.pausedAt = started + 20 * MIN; run.pausedBy = 'restart'; } }, [
    { at: at(started + MIN), step: 1, kind: 'plan' },
    { at: at(started + 20 * MIN), step: 3, kind: 'work' },
    { at: at(restarted), kind: 'restarted' },
  ]);
  assert.equal(closed.endedAt, started + 20 * MIN, 'it ends where it was paused');
  assert.equal(closed.pausedAt, 0);
  assert.equal(closed.pausedBy, '');
  assert.match(text, /\nTook 20 minutes and /);
  assert.doesNotMatch(text, /It was paused for/, 'the pause is not counted as a pause that "did not count" while it is in the time');
  assert.match(text, /\nIt worked until .*; it then sat unused until .*, when it was closed\. That time did not count\./);
});

test('a run whose conversation is gone while it waited for its model server or for you: the open wait (a quiet Wait for me too) ends at its last line and is not working time', () => {
  const started = Date.now() - 2 * 24 * 60 * MIN;
  const down = closeGone({ started, change: (run) => { run.long.down = { since: started + 15 * MIN, tries: 7, nextAt: 0, endsAt: started + 135 * MIN, last: 'fetch failed' }; } }, [
    { at: at(started + 15 * MIN), step: 3, kind: 'work' },
    ...[1, 2, 3, 4, 5, 6, 7].map((k) => ({ at: at(started + (15 + k * 15) * MIN), kind: 'down-try' })).filter((row) => Date.parse(row.at) <= started + 115 * MIN),
    { at: at(started + 115 * MIN), kind: 'down-try' },
  ]);
  assert.equal(down.closed.endedAt, started + 115 * MIN);
  assert.equal(down.closed.long.down, undefined, 'no stale wait is kept');
  assert.equal(down.closed.long.downMs, 100 * MIN);
  assert.match(down.text, /\nTook 15 minutes and /);
  assert.match(down.text, /It waited 100 minutes for your model server; that time did not count\./);
  const waiting = closeGone({ started, change: (run) => { run.long.waitingSince = started + 10 * MIN; run.long.quietGoal = true; } }, [
    { at: at(started + 10 * MIN), step: 2, kind: 'work' },
    { at: at(started + 70 * MIN), kind: 'alert' },
  ]);
  assert.equal(waiting.closed.long.waitingSince, undefined);
  assert.equal(waiting.closed.long.waitedMs, 60 * MIN);
  assert.match(waiting.text, /\nTook 10 minutes and /);
});

// ---- 6. lab check of point 19 (F1): a change that waits for your OK after the Mission ended ----
const okRun = async ({ service, needs = 'ask' }) => {
  const app = appHarness({
    settingsIndex: INDEX,
    services: { settings: service },
    answer: (spec) => {
      if (spec.label === 'Mission: planner') return { throws: 'socket closed by the planner' };
      if (spec.label === 'Mission: repair helper') return { text: REPAIR([], [{ kind: 'setting', field: 'activity.soundVolume', to: 20, why: 'quieter' }]) };
      return undefined;
    },
  });
  const agent = app.open('c');
  if (needs !== 'ask') await app.card({ sessionId: 'c', action: 'save', needs });
  assert.equal((await app.card({ sessionId: 'c', action: 'start', goal: 'make two small things for me', mode: 'auto' })).status, 200);
  for (let i = 0; i < 4; i += 1) await app.step(agent);
  await tick(20);
  const change = app.runner().view('c').approvals.find((one) => one.fix === 'setting');
  return { app, agent, change };
};
/** The run as if it had completed (all its items done), read again after a restart. */
const completeSaved = (agent) => {
  const file = join(runFolder(agent), 'run.json');
  const run = JSON.parse(readFileSync(file, 'utf8'));
  run.status = 'complete';
  run.stopReason = '';
  run.items = [{ id: '1', title: 'one', status: 'verified', tries: 1, attempts: 1 }];
  writeFileSync(file, JSON.stringify(run));
};

test('lab check of point 19: after the end a setting change waits for your OK on the strip; Allow makes it, the Mission stays as it ended, the report says so', { skip: !hasGit && 'takes a save point' }, async () => {
  const service = settingsService();
  const { app, agent, change } = await okRun({ service });
  try {
    assert.equal(change.status, 'open');
    assert.equal((await app.card({ sessionId: 'c', action: 'end' })).status, 200);
    let card = (await app.get('c')).json;
    assert.equal(card.run.status, 'stopped');
    assert.equal(card.strip.state, 'finished');
    assert.deepEqual(card.strip.oks.map((one) => [one.id, one.what, one.reason, one.status]), [[change.id, 'Change Settings → Activity → Volume from 50 to 20', 'quieter', 'open']]);
    assert.equal(card.strip.canContinue, false, 'no Finish it just for this');
    assert.deepEqual(card.strip.approvals, []);
    assert.match(card.run.report, /\nWaits for your OK \(press "1 change waits for your OK" above the chat box; Allow makes the change, nothing runs again\):\n- Change Settings → Activity → Volume from 50 to 20\. The repair helper said: "quieter"/);
    assert.doesNotMatch(card.run.report, /change them yourself if you agree|put the rest to you as a question/);
    assert.match(card.run.report, /It asked for your OK on the rest\./, 'the repair line says it was an approval');
    // The card's approve stays refused after the end; the strip's OK is the way.
    assert.equal((await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: change.id, choice: 'allow' }] })).status, 400);
    const got = await app.card({ sessionId: 'c', action: 'ok', id: change.id, choice: 'allow' });
    assert.equal(got.status, 200, JSON.stringify(got.json));
    assert.equal(got.json.said, 'Changed: Activity → Volume: 50 → 20. Nothing runs again because of it.');
    assert.deepEqual(service.mutated, [{ ns: 'activity', ops: [{ op: 'set', path: ['soundVolume'], value: 20 }] }]);
    card = (await app.get('c')).json;
    assert.equal(card.run.status, 'stopped', 'it stays as it ended');
    assert.deepEqual(card.strip.oks, []);
    assert.equal(card.strip.canContinue, false);
    const text = readFileSync(join(runFolder(agent), 'report.md'), 'utf8');
    assert.match(text, /\nChanged after your Allow: Activity → Volume: 50 → 20\./);
    assert.doesNotMatch(text, /Waits for your OK/);
    const log = readFileSync(join(runFolder(agent), 'log.jsonl'), 'utf8');
    assert.match(log, /"kind":"ok-after-end"/);
    assert.equal((await app.card({ sessionId: 'c', action: 'ok', id: change.id, choice: 'deny' })).json.said, 'Already answered.');
  } finally {
    app.done();
  }
});

test('lab check of point 19: a complete Mission (Full auto) keeps its OK after the end: Deny leaves the setting, it stays complete with no Finish it', { skip: !hasGit && 'takes a save point' }, async () => {
  const service = settingsService();
  const { app, agent, change } = await okRun({ service, needs: 'decide' });
  let second;
  try {
    assert.equal(change.status, 'unasked', 'Full auto never asks while it runs');
    assert.equal((await app.card({ sessionId: 'c', action: 'end' })).status, 200);
    completeSaved(agent);
    second = restartWith(app, service);
    second.open('c', agent.header.cwd);
    let card = (await second.get('c')).json;
    assert.equal(card.run.status, 'complete');
    assert.equal(card.strip.canContinue, false);
    assert.deepEqual(card.strip.unasked, [], 'not in Finish it\'s card');
    assert.deepEqual(card.strip.oks.map((one) => [one.id, one.status]), [[change.id, 'unasked']]);
    assert.match(card.run.report, /^Mission complete: all 1 item done and checked\./);
    assert.match(card.run.report, /- Change Settings → Activity → Volume from 50 to 20\. \(Full auto did not ask it while it ran\.\) The repair helper said: "quieter"/);
    assert.doesNotMatch(card.run.report, /Not asked, because it needs your yes|To finish it: press Finish it/);
    const got = await second.card({ sessionId: 'c', action: 'ok', id: change.id, choice: 'deny' });
    assert.equal(got.json.said, 'Not changed: Change Settings → Activity → Volume from 50 to 20. The Mission stays complete; nothing runs again.');
    assert.deepEqual(service.mutated, []);
    card = (await second.get('c')).json;
    assert.equal(card.run.status, 'complete');
    assert.deepEqual(card.strip.oks, []);
    assert.match(card.run.report, /\nYou said no after the end; not changed:\n- Change Settings → Activity → Volume from 50 to 20\./);
    assert.doesNotMatch(card.run.report, /You said no \(it went on without these\)/);
  } finally {
    second?.done();
    app.done();
  }
});

test('lab check of point 19: at the end a fallback model lapses ("No longer needed"); Calls at once and a Budget raise wait for your OK; the finished event counts them as oks, never as left', async () => {
  const run = newRun({ id: 'r', goal: 'g', mode: 'Full Auto', root: '/w', limits: {}, kind: 'long', long: { minutes: 60, laps: 2 } });
  applyPlan(run, { items: [{ title: 'one' }] });
  run.items[0].status = 'verified';
  const model = addApproval(run, { kind: 'repair', by: 'repair', key: 'model:p/m2', what: 'Let this Mission\'s helpers use m2', fix: { kind: 'model', provider: 'p', model: 'm2' } }).entry;
  const calls = addApproval(run, { kind: 'repair', by: 'repair', key: 'calls:p:2', what: 'Send at most 2 requests at a time to your model server p (Settings → Mission → Calls at once; now 4)', fix: { kind: 'calls', provider: 'p', from: 4, to: 2 } }).entry;
  finish(run);
  assert.equal(lapseAtEnd(run), 1);
  assert.equal(model.status, 'lapsed');
  assert.deepEqual(pendingOks(run).map((one) => one.id), [calls.id]);
  assert.equal(okChangedText(calls), 'Changed after your Allow: Mission → Calls at once for p: 4 → 2.');
  assert.equal(okChangedText({ fix: { kind: 'budget', limit: 'steps', from: 5000, to: 7500 } }), 'Changed after your Allow: Budget guard → Mission steps: 5,000 → 7,500.');
  const text = report(run);
  assert.match(text, /\nNo longer needed \(the Mission ended\):\n- Let this Mission's helpers use m2\./);
  assert.match(text, /\nWaits for your OK \(press "1 change waits for your OK"[^\n]*\n- Send at most 2 requests at a time/);
  assert.equal(continueBlock(run), 'nothing');
  // Answered after the end: only its own status changes; no item is taken up again.
  assert.equal(decideOk(run, calls.id, 'allow').entry.afterEnd, true);
  assert.equal(run.status, 'complete');
  assert.equal(run.items[0].status, 'verified');
  assert.throws(() => decideOk(run, model.id, 'allow'), /not open any more/);
  // While it runs nothing waits for an OK here (the card answers it).
  const live = newRun({ id: 'r2', goal: 'g', mode: 'Full Auto', root: '/w', limits: {}, kind: 'long', long: { minutes: 60, laps: 2 } });
  addApproval(live, { kind: 'repair', by: 'repair', key: 'calls:p:2', what: 'w', fix: { kind: 'calls', provider: 'p', from: 4, to: 2 } });
  assert.deepEqual(pendingOks(live), []);
  // Once its thread is gone nothing waits for an OK, also for a run saved before stage 7 with the old stop reason.
  for (const reason of [CONVERSATION_GONE, 'Its conversation is gone.']) {
    const gone = newRun({ id: 'r3', goal: 'g', mode: 'Full Auto', root: '/w', limits: {}, kind: 'long', long: { minutes: 60, laps: 2 } });
    addApproval(gone, { kind: 'repair', by: 'repair', key: 'calls:p:2', what: 'w', fix: { kind: 'calls', provider: 'p', from: 4, to: 2 } });
    finish(gone, reason);
    assert.deepEqual(pendingOks(gone), [], reason);
  }
  // The finished event of a real run that ends complete with a setting change open.
  const app = bench({
    answer: (spec) => {
      if (spec.label === 'Mission: planner') return { text: PLAN([{ title: 'one' }]) };
      if (/reviewer/.test(spec.label)) return { text: '{"verdict":"approve","note":"ok","items":[{"id":"1","ok":true,"note":"fine"}]}' };
      return undefined;
    },
  });
  try {
    await app.start();
    addApproval(app.run(), { kind: 'repair', by: 'repair', key: 'setting:activity.still:true', what: 'Change Settings → Activity → No movement from Off to On', fix: { kind: 'setting', field: 'activity.still', ns: 'activity', path: ['still'], page: 'Activity', label: 'No movement', from: false, to: true } });
    for (let i = 0; i < 30 && app.run().status === 'running'; i += 1) await app.step();
    await tick(20);
    const finished = app.fired.find((event) => event.type === 'finished');
    assert.equal(app.run().status, 'complete');
    assert.equal(finished.left, 0);
    assert.equal(finished.oks, 1);
    assert.equal(finished.canContinue, false);
  } finally {
    app.done();
  }
});
