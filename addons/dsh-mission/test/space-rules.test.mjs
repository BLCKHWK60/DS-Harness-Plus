/**
 * Item 4A, stage 6a: the space keeps its safety rules for any mode (STAGE6A-DESIGN.md I24, P4). Mission's Recon fence,
 * Devices rules and Creator Plus rules apply to any mode in the space; a guarded space whose add-on gives no rules refuses
 * a Mission (fail closed); the Read Only warning and refusal and the work loop do not fire in a guarded space; the access
 * restore after a run puts back the permission preset and level (an agent-preset lock does not stop it); Devices checks
 * run in the Devices fence and an unsafe folder is refused; a disk record is purged only on a positive
 * Recon signal. Modes is a stand-in with the stage 6a `guardOf`.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { GIT_CANDIDATES } from '../lib/checkpoints.js';
import { BENCH_CHECKS_TEXT, DEVICES_FOLDER_TEXT, ISOLATED_TEXT, MISSION_NO_SPACE_RULES, READ_ONLY_LONG_TEXT, READ_ONLY_TEXT, READ_ONLY_TYPED_TEXT, whyNot } from '../lib/gate.js';
import { refusedSetting } from '../lib/settings-fix.js';
import { devicesChecks, offlineChecks, cleanEnv, newRun, portsClosed } from '../lib/run.js';
import { devicesFence, devicesRootRefusal, runCommand } from '../lib/shell.js';
import { homedir } from 'node:os';
import { realpathSync, rmSync, writeFileSync } from 'node:fs';
import { appHarness, tick } from './app-harness.mjs';

const hasGit = GIT_CANDIDATES.some((path) => existsSync(path));
/** The run as saved in the conversation's folder. */
const runOnDisk = (agent) => {
  const dir = join(agent.header.cwd, '.dsh-mission', 'runs');
  const [id] = readdirSync(dir);
  return JSON.parse(readFileSync(join(dir, id, 'run.json'), 'utf8'));
};

/** A stage 6a Modes stand-in: `spaces[id]` is the thread's space, `tabs[id]` its mode. */
const spaced = ({ spaces = {}, tabs = {}, extra = {}, guardThrows = false, guardExtra = {} } = {}) => {
  const app = appHarness({ services: extra });
  const guardOf = (id) => {
    if (guardThrows) throw new Error('read error');
    const space = spaces[id] ?? 'code';
    const recon = space === 'recon';
    return { top: id, space, mode: tabs[id] ?? 'code', sealed: recon, sealedBy: recon ? 'recon' : '', reconSpace: recon, guardedBy: space === 'devices' || space === 'workshop' ? space : '', noPrograms: recon || space === 'devices' || space === 'workshop', homeMode: ({ recon: 'recon', devices: 'bench', workshop: 'creator-plus' })[space] === (tabs[id] ?? 'code'), fresh: false, unknownTop: false, ...(guardExtra[id] ?? {}) };
  };
  app.services.modes = {
    ...app.services.modes,
    apiVersion: 2,
    get: (id) => tabs[id] ?? 'code',
    readOnly: (id) => ['data', 'research'].includes(tabs[id]),
    isolated: (id) => {
      if (guardThrows) throw new Error('read error');
      return spaces[id] === 'recon';
    },
    guardOf,
    spaces: { of: (id) => spaces[id] ?? 'code' },
  };
  return app;
};

test('mission-gate-space: Recon sealed by space, a guarded space without rules refused, Read Only skipped there, undo words still work', () => {
  assert.equal(whyNot({ isolated: false, space: 'recon' }), ISOLATED_TEXT, 'any mode in the Recon space is sealed');
  assert.equal(whyNot({ isolated: false, space: 'recon', runs: true, long: true }), '', 'a Mission where Recon keeps it in its rules');
  assert.match(ISOLATED_TEXT, /this thread is in Recon \(sealed\)/);
  for (const space of ['devices', 'workshop']) {
    assert.equal(whyNot({ isolated: false, space, spaceRules: false, long: true }), MISSION_NO_SPACE_RULES(space), space);
    assert.equal(whyNot({ isolated: false, space, spaceRules: false, word: 'auto' }), MISSION_NO_SPACE_RULES(space), `${space}: a mode word`);
    for (const word of ['off', 'stop', 'end']) assert.equal(whyNot({ isolated: false, space, spaceRules: false, word }), '', `${space}: ${word} still works`);
    assert.equal(whyNot({ isolated: false, space, spaceRules: true, long: true }), '', `${space} with rules`);
    // Read Only (Research, Data) does not refuse the mode words in a guarded space: the space's rules decide.
    assert.equal(whyNot({ isolated: false, space, spaceRules: true, tab: 'research', word: 'auto' }), '', `${space}: no Read Only refusal`);
  }
  assert.equal(whyNot({ isolated: false, space: 'unknown', spaceRules: false, long: true }), MISSION_NO_SPACE_RULES('unknown'), 'a space that could not be read: fail closed');
  assert.equal(whyNot({ isolated: false, space: 'chat', tab: 'research', word: 'auto' }), READ_ONLY_TEXT, 'Chat keeps the Read Only refusal');
  assert.equal(whyNot({ isolated: false, tab: 'research', word: 'auto' }), READ_ONLY_TEXT, 'no space (older Modes): as before');
  assert.match(MISSION_NO_SPACE_RULES('devices'), /the rules for a Mission in Devices come from Devices, which is off or too old\. Switch on Devices on the Plugins page \(or update it\), or start the Mission in the Chat or Code space\./);
  // Lab re-check 2 (problem 4): an add-on that is off has no Settings page, so the sentence never points there.
  for (const space of ['devices', 'workshop']) {
    assert.doesNotMatch(MISSION_NO_SPACE_RULES(space), /Settings →/, space);
    // Stage 7 (English only): a Chinese page still gets the English sentence.
    assert.equal(MISSION_NO_SPACE_RULES(space, 'zh'), MISSION_NO_SPACE_RULES(space), `${space} zh`);
  }
  assert.match(MISSION_NO_SPACE_RULES('workshop'), /the rules for a Mission in Workshop come from Creator Plus/);
  assert.equal(MISSION_NO_SPACE_RULES('unknown', 'zh'), MISSION_NO_SPACE_RULES('unknown'), 'unknown zh: English');
  assert.match(MISSION_NO_SPACE_RULES('unknown'), /Start the Mission in the Chat or Code space\./);
});

test('mission-devices-no-bench: Code in Devices with no rules from Devices: Start Mission greyed with the sentence, typed /mission refused', async () => {
  const app = spaced({ spaces: { d: 'devices' }, tabs: { d: 'code' } });
  try {
    const agent = app.open('d');
    const card = (await app.get('d')).json;
    const tick = card.preflight.ticks.find((entry) => entry.key === 'space');
    assert.equal(tick.ok, false);
    assert.equal(tick.text, MISSION_NO_SPACE_RULES('devices'));
    assert.equal(card.runButton, false);
    assert.equal(card.runButtonWhy, 'space');
    assert.equal(card.runButtonText, MISSION_NO_SPACE_RULES('devices'));
    assert.equal(card.runButtonTextZh, undefined, 'stage 7: no Chinese twin');
    assert.deepEqual(await app.mission(agent, 'make every test pass please'), { kind: 'error', text: MISSION_NO_SPACE_RULES('devices') });
    assert.deepEqual(await app.mission(agent, 'auto'), { kind: 'error', text: MISSION_NO_SPACE_RULES('devices') });
    assert.equal((await app.mission(agent, 'off')).kind, 'success', 'off still works');
    const started = await app.card({ sessionId: 'd', action: 'start', goal: 'make every test pass please' });
    assert.notEqual(started.status, 200);
    assert.match(JSON.stringify(started.json), /the rules for a Mission in Devices come from Devices/);
    assert.equal(app.runner().runOf?.('d'), undefined, 'no run');
  } finally {
    app.done();
  }
});

test('mission-devices-rules: a guest in Devices gets the Devices rules (long.bench); no loop and no Read Only warning', { skip: !hasGit && 'needs git' }, async () => {
  const app = spaced({ spaces: { d: 'devices' }, tabs: { d: 'research' }, extra: { bench: { longRunRules: () => ({ checks: true, closePorts: true }) } } });
  app.services.modes.ultraCode = () => true;
  try {
    const agent = app.open('d');
    const card = (await app.get('d')).json;
    assert.equal(card.runButton, true);
    assert.equal(card.runButtonWhy, '');
    assert.equal(card.preflight.ticks.some((entry) => entry.key === 'tab'), false, 'no Read Only warning in Devices');
    assert.equal(card.preflight.ticks.some((entry) => entry.key === 'space'), false);
    assert.ok(card.preflight.ticks.find((entry) => entry.key === 'bench'));
    const said = await app.mission(agent, 'look at the port list and write it down');
    assert.equal(said.kind, 'success', said.text);
    assert.doesNotMatch(said.text, /Work loop/, 'no work loop in Devices');
    assert.equal(said.text.includes(READ_ONLY_TYPED_TEXT), false, 'no Read Only line in Devices');
    assert.deepEqual(runOnDisk(agent).long.bench, { checks: true, closedPorts: true });
  } finally {
    app.done();
  }
});

test('mission-workshop-rules: a guest in Workshop runs under Creator Plus\'s rules; without them it is refused', { skip: !hasGit && 'needs git' }, async () => {
  let rules = { cleanEnv: true };
  const app = spaced({ spaces: { w: 'workshop' }, tabs: { w: 'research' }, extra: { creatorPlus: { longRunRules: () => rules } } });
  app.services.modes.ultraCode = () => true;
  try {
    const agent = app.open('w');
    rules = undefined;
    assert.deepEqual(await app.mission(agent, 'write the plugin readme please'), { kind: 'error', text: MISSION_NO_SPACE_RULES('workshop') });
    rules = { cleanEnv: true };
    const card = (await app.get('w')).json;
    assert.equal(card.preflight.ticks.find((entry) => entry.key === 'creator')?.ok, true);
    const said = await app.mission(agent, 'write the plugin readme please');
    assert.equal(said.kind, 'success', said.text);
    assert.doesNotMatch(said.text, /Work loop/, 'no work loop in Workshop');
    assert.deepEqual(runOnDisk(agent).long.creator, { cleanEnv: true });
  } finally {
    app.done();
  }
});

test('mission-loop-off-guarded: Ultra Code on: the loop runs in Code and for each space\'s own mode (Recon, Devices, Creator Plus), never for a guest in Recon, Devices or Workshop; not sure = a guest; a space that cannot be read refuses', { skip: !hasGit && 'needs git' }, async () => {
  const room = mkdtempSync(join(tmpdir(), 'dsh-recon-6a-'));
  const recon = { runs: () => true, runFolder: (id) => { mkdirSync(join(room, `run-${id}`), { recursive: true }); return join(room, `run-${id}`); } };
  const spaces = { c: 'code', r: 'recon', d: 'devices', w: 'workshop', rh: 'recon', dh: 'devices', wh: 'workshop', du: 'devices', dm: 'devices' };
  const tabs = { c: 'code', r: 'research', d: 'code', w: 'code', rh: 'recon', dh: 'bench', wh: 'creator-plus', du: 'bench', dm: 'bench' };
  // du: Modes cannot find the thread of a helper (unknownTop); dm: Modes' effective mode and `get` disagree.
  const guardExtra = { du: { unknownTop: true }, dm: { mode: 'code' } };
  const app = spaced({ spaces, tabs, guardExtra, extra: { recon, bench: { longRunRules: () => ({}) }, creatorPlus: { longRunRules: () => ({}) } } });
  app.services.modes.ultraCode = () => true;
  try {
    assert.match((await app.mission(app.open('c'), 'write a blog post about heat pumps')).text, /Work loop: on/, 'Code: the loop as before');
    for (const id of ['rh', 'dh', 'wh']) {
      const said = await app.mission(app.open(id), 'write a blog post about heat pumps');
      assert.equal(said.kind, 'success', `${id}: ${said.text}`);
      assert.match(said.text, /Work loop: on/, `${id}: the space's own mode keeps the loop as before 6a`);
    }
    for (const id of ['r', 'd', 'w', 'dm']) {
      const said = await app.mission(app.open(id), 'write a blog post about heat pumps');
      assert.equal(said.kind, 'success', `${id}: ${said.text}`);
      assert.doesNotMatch(said.text, /Work loop/, `${id}: a guest (or not sure): no loop`);
    }
    const unsure = await app.mission(app.open('du'), 'write a blog post about heat pumps');
    assert.doesNotMatch(unsure.text ?? '', /Work loop/, 'du: an unknown thread: no loop');
  } finally {
    app.done();
    rmSync(room, { recursive: true, force: true });
  }
  const broken = spaced({ guardThrows: true });
  broken.services.modes.ultraCode = () => true;
  try {
    const said = await broken.mission(broken.open('u'), 'write a blog post about heat pumps');
    assert.equal(said.kind, 'error', 'fail closed');
  } finally {
    broken.done();
  }
});

test('mission-pickstate-move: a record on disk moves to memory when the thread is recorded in Recon', async () => {
  const spaces = { p: 'code' };
  const app = spaced({ spaces });
  try {
    const agent = app.open('p');
    assert.equal((await app.mission(agent, 'restricted')).kind, 'success');
    const file = join(app.home, 'mission', 'conversations.json');
    app.runner().flush?.();
    await tick(350);
    assert.match(readFileSync(file, 'utf8'), /"p"/, 'on disk while in Code');
    spaces.p = 'recon';
    // The card reads the record: it moves to memory (still the same mode) and leaves the disk.
    assert.equal((await app.get('p')).json.mode, 'restricted');
    await tick(350);
    assert.doesNotMatch(readFileSync(file, 'utf8'), /"p"/, 'purged from disk on a positive Recon signal');
  } finally {
    app.done();
  }
});

test('mission-pickstate-error-kept: Modes throws: the disk record is kept (never purged on the fail-closed answer)', async () => {
  const app = spaced({ spaces: { p: 'code' } });
  try {
    const agent = app.open('p');
    assert.equal((await app.mission(agent, 'restricted')).kind, 'success');
    const file = join(app.home, 'mission', 'conversations.json');
    await tick(350);
    assert.match(readFileSync(file, 'utf8'), /"p"/);
    app.services.modes.guardOf = () => { throw new Error('read error'); };
    app.services.modes.isolated = () => { throw new Error('read error'); };
    // Sealed now (fail closed): the record is still read from disk, and not deleted.
    assert.equal((await app.get('p')).json.mode, 'restricted');
    await tick(350);
    assert.match(readFileSync(file, 'utf8'), /"p"/, 'kept on disk');
  } finally {
    app.done();
  }
});

test('mission-pickstate-move: Modes\' own settings mark the thread (sessionIsolated) also count as a positive Recon signal', async () => {
  const spaces = { p: 'code' };
  const marks = {};
  const app = spaced({ spaces, extra: { settings: { describe: () => [{ ns: 'modes', value: { sessionIsolated: JSON.stringify(marks), sessionSpaces: '{}' } }] } } });
  try {
    const agent = app.open('p');
    assert.equal((await app.mission(agent, 'restricted')).kind, 'success');
    const file = join(app.home, 'mission', 'conversations.json');
    await tick(350);
    // An older Modes: isolated, but no reconSpace from guardOf (legacy answer without a space).
    app.services.modes.guardOf = undefined;
    app.services.modes.isolated = () => true;
    app.services.modes.spaces = { of: () => '' };
    app.services.modes.get = () => 'plain';
    app.services.settings = { describe: () => [{ ns: 'modes', value: { sessionIsolated: '{}', sessionSpaces: '{}' } }] };
    assert.equal((await app.get('p')).json.mode, 'restricted');
    await tick(350);
    assert.match(readFileSync(file, 'utf8'), /"p"/, 'an owner\'s isolated mode outside Recon: kept');
    app.services.settings = { describe: () => [{ ns: 'modes', value: { sessionIsolated: JSON.stringify({ p: true }), sessionSpaces: '{}' } }] };
    assert.equal((await app.get('p')).json.mode, 'restricted');
    await tick(350);
    assert.doesNotMatch(readFileSync(file, 'utf8'), /"p"/, 'marked by Modes: purged');
  } finally {
    app.done();
  }
});

test('mission-restore-recon: after a run in Recon the Mission mode goes off and the permission preset and level come back, even under an agent-preset lock', { skip: !hasGit && 'needs git' }, async () => {
  const room = mkdtempSync(join(tmpdir(), 'dsh-recon-6a-'));
  const recon = { runs: () => true, runFolder: (id) => { mkdirSync(join(room, `run-${id}`), { recursive: true }); return join(room, `run-${id}`); } };
  const levels = {};
  const presets = [];
  const appended = [];
  let lock = 'standard';
  const app = spaced({
    spaces: { r: 'recon' },
    tabs: { r: 'research' },
    extra: {
      recon,
      sandboxPolicy: { resolve: ({ session }) => ({ mode: levels[session.id] ?? 'read-only' }) },
      // A real permission preset id (not an agent preset such as 'standard').
      permissionPresets: { current: () => 'read-only', set: (session, preset) => { presets.push(preset); levels[session.id] = preset === 'read-only' ? 'read-only' : 'workspace-write'; } },
    },
  });
  // Recon's space lock holds the agent preset Standard; it says nothing about the permission preset.
  app.services.modes.lockedPreset = (modeId, opts) => (opts?.sessionId === 'r' ? lock : '');
  try {
    const agent = app.open('r');
    agent.session.append = (type, data) => { appended.push([type, data]); if (type === 'sandbox/mode') levels.r = data.mode; };
    const started = await app.card({ sessionId: 'r', action: 'start', goal: 'find what the forums say about the leak' });
    assert.equal(started.status, 200, JSON.stringify(started.json));
    const presetsDuring = presets.length;
    assert.equal((await app.card({ sessionId: 'r', action: 'end' })).status, 200);
    await tick(30);
    assert.equal(presets.length, presetsDuring + 1, 'the permission preset is set back once');
    assert.equal(presets.at(-1), 'read-only', 'the earlier permission preset is put back under an agent-preset lock');
    assert.equal(levels.r, 'read-only', 'the level comes back');
    assert.equal(app.runner().mode('r'), '', 'Mission mode off');
  } finally {
    app.done();
  }
  // Without a lock (Chat, Research is Read Only): the preset comes back as before.
  lock = '';
  const chat = spaced({
    spaces: { c: 'chat' },
    tabs: { c: 'research' },
    extra: {
      sandboxPolicy: { resolve: ({ session }) => ({ mode: levels[session.id] ?? 'read-only' }) },
      permissionPresets: { current: () => 'danger-full-access', set: (session, preset) => { presets.push(preset); levels[session.id] = preset === 'danger-full-access' ? 'read-only' : 'workspace-write'; } },
    },
  });
  chat.services.modes.lockedPreset = () => '';
  try {
    const agent = chat.open('c');
    agent.session.append = (type, data) => { if (type === 'sandbox/mode') levels.c = data.mode; };
    const card = (await chat.get('c')).json;
    assert.equal(card.preflight.ticks.find((entry) => entry.key === 'tab')?.text, READ_ONLY_LONG_TEXT, 'Chat keeps the Read Only warning');
    assert.equal((await chat.card({ sessionId: 'c', action: 'start', goal: 'look at the sales figures and write a summary' })).status, 200);
    assert.equal((await chat.card({ sessionId: 'c', action: 'end' })).status, 200);
    await tick(30);
    assert.equal(presets.at(-1), 'danger-full-access', 'the earlier preset is put back');
  } finally {
    chat.done();
  }
});

test('mission-modes-absent: no Modes service: not sealed, no space, a Mission as today', async () => {
  const app = appHarness();
  app.services.modes = undefined;
  try {
    const card = (await app.get((app.open('n')).id)).json;
    assert.equal(card.runButton, true);
    assert.equal(card.preflight.ticks.find((entry) => entry.key === 'isolated').ok, true);
    assert.equal(card.preflight.ticks.some((entry) => entry.key === 'space'), false);
  } finally {
    app.done();
  }
});

test('the repair helper refuses the stage 6a Modes settings (sessionIsolated, sealedExtra, gridInGuarded)', () => {
  for (const field of ['modes.sessionIsolated', 'modes.sealedExtra', 'modes.gridInGuarded']) {
    assert.match(refusedSetting({ page: 'modes', label: 'Spaces', field, kind: 'text', configOnly: false }), /decides what a Mission or a thread may do/, field);
  }
});

test('mission-devices-fence: a guest\'s Devices run checks offline, with no keys, and its fence keeps hidden files and the app data closed', () => {
  const run = { kind: 'long', long: { bench: { checks: true, closedPorts: true } } };
  assert.equal(devicesChecks(run), true);
  assert.equal(offlineChecks(run), true);
  assert.equal(cleanEnv(run), true);
  assert.equal(devicesChecks({ kind: 'long', long: {} }), false);
  // Owner's answer after review: the Devices mode's own run keeps its checks as before 6a (network on, no clean
  // environment, device ports still closed); only the `home` mark set by Mission does that.
  const home = { kind: 'long', long: { bench: { checks: true, closedPorts: true, home: true } } };
  assert.equal(devicesChecks(home), false);
  assert.equal(offlineChecks(home), false);
  assert.equal(cleanEnv(home), false);
  assert.equal(portsClosed(home), true);
  for (const mark of ['true', 1, 'yes', undefined]) assert.equal(devicesChecks({ kind: 'long', long: { bench: { checks: true, closedPorts: true, home: mark } } }), true, `home ${String(mark)}: fenced`);
  const profile = devicesFence('/tmp/proj', '/Users/someone', { programs: [], folders: [] }, { dshHome: '/tmp/dsh-data' });
  assert.match(profile, /\(deny network\*\)/);
  assert.match(profile, /\(deny file-read\* \(subpath "\/Users\/someone"\)/);
  assert.match(profile, /\(deny file-read\* file-write\* \(subpath "\/tmp\/dsh-data"\)\)/);
  assert.match(profile, /\(deny file-write\* \(regex #"\^\/tmp\/proj\/\(\.\*\/\)\?\\\."\)/);
  assert.match(profile, /\/dev\/\(cu\|tty\)/);
  assert.match(BENCH_CHECKS_TEXT, /^Devices: /);
  assert.equal(DEVICES_FOLDER_TEXT('home folder', 'zh'), DEVICES_FOLDER_TEXT('home folder'), 'stage 7: English on a Chinese page');
});

test('mission-devices-home: the Devices mode in Devices is marked home (its checks keep the network); a guest, an unknown thread or a mismatch is not', async () => {
  const keep = newRun({ goal: 'g', root: '/tmp/x', mode: 'auto', kind: 'long', long: { minutes: 30, laps: 1, bench: { checks: true, closedPorts: true, home: true } } });
  assert.deepEqual(keep.long.bench, { checks: true, closedPorts: true, home: true }, 'newRun keeps the mark');
  const odd = newRun({ goal: 'g', root: '/tmp/x', mode: 'auto', kind: 'long', long: { minutes: 30, laps: 1, bench: { checks: true, closedPorts: true, home: 'true' } } });
  assert.deepEqual(odd.long.bench, { checks: true, closedPorts: true }, 'only a real true is kept');
  const spaces = { h: 'devices', g: 'devices', u: 'devices', m: 'devices' };
  const tabs = { h: 'bench', g: 'code', u: 'bench', m: 'bench' };
  const guardExtra = { u: { unknownTop: true }, m: { mode: 'code' } };
  const app = spaced({ spaces, tabs, guardExtra, extra: { bench: { longRunRules: () => ({ checks: true, closePorts: true }) } } });
  try {
    const agents = Object.fromEntries(['h', 'g', 'u', 'm'].map((id) => [id, app.open(id)]));
    // The preflight is the same either way (the Devices tick); the mark reaches the run only through Start Mission.
    assert.ok((await app.get('h')).json.preflight.ticks.find((entry) => entry.key === 'bench'));
    if (hasGit) {
      for (const [id, home] of [['h', true], ['g', false], ['u', false], ['m', false]]) {
        const said = await app.mission(agents[id], 'look at the port list and write it down');
        assert.equal(said.kind, 'success', `${id}: ${said.text}`);
        assert.deepEqual(runOnDisk(agents[id]).long.bench, home ? { checks: true, closedPorts: true, home: true } : { checks: true, closedPorts: true }, id);
      }
    }
  } finally {
    app.done();
  }
});

test('mission-devices-folder: the whole disk, the home folder, the Library and the app data are refused; a project folder is not', () => {
  const home = homedir();
  const dsh = mkdtempSync(join(tmpdir(), 'dsh-home-'));
  try {
    assert.equal(devicesRootRefusal('/', { home }), 'home folder');
    assert.equal(devicesRootRefusal(home, { home }), 'home folder');
    assert.equal(devicesRootRefusal(join(home, 'Library', 'LaunchAgents'), { home }), 'Library');
    assert.equal(devicesRootRefusal(join(dsh, 'bench'), { home, dshHome: dsh }), 'inside the app data');
    assert.equal(devicesRootRefusal(join(dsh, 'scratch', 'a'), { home, dshHome: dsh }), '');
    assert.equal(devicesRootRefusal(dirname(dsh), { home, dshHome: dsh }), 'holds the app data');
    assert.equal(devicesRootRefusal('/Applications/X.app/Contents', { home, appBundle: '/Applications/X.app' }), 'the app');
    assert.equal(devicesRootRefusal('/tmp/a"b', { home }), 'odd folder name');
    assert.equal(devicesRootRefusal(join(tmpdir(), 'project'), { home }), '');
  } finally {
    rmSync(dsh, { recursive: true, force: true });
  }
});

test('mission-devices-folder: a Devices thread in the home folder gets a required failing tick and cannot start', async () => {
  const app = spaced({ spaces: { d: 'devices' }, tabs: { d: 'code' }, extra: { bench: { longRunRules: () => ({ checks: true, closePorts: true }) } } });
  try {
    const agent = app.open('d', homedir());
    const card = (await app.get('d')).json;
    const tick = card.preflight.ticks.find((entry) => entry.key === 'devices-folder');
    assert.ok(tick && tick.ok === false && tick.required === true, JSON.stringify(card.preflight.ticks));
    assert.equal(tick.text, DEVICES_FOLDER_TEXT('home folder'));
    const said = await app.mission(agent, 'look at the port list and write it down');
    assert.equal(said.kind, 'error');
    // Bench's own word, when a later Bench gives it, is used as well.
    const later = spaced({ spaces: { e: 'devices' }, tabs: { e: 'code' }, extra: { bench: { longRunRules: () => ({ checks: true, closePorts: true, folderUnsafe: 'Devices folder' }) } } });
    try {
      later.open('e');
      const tick2 = (await later.get('e')).json.preflight.ticks.find((entry) => entry.key === 'devices-folder');
      assert.equal(tick2?.text, DEVICES_FOLDER_TEXT('Devices folder'));
    } finally {
      later.done();
    }
  } finally {
    app.done();
  }
});

const onMacSandbox = process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec');
test('mission-devices-fence (real sandbox): a Devices check cannot write hooks or dot-files, read the app data or the home folder, or see the app\'s keys', { skip: !onMacSandbox && 'needs the Mac sandbox' }, async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-devices-run-')));
  const dsh = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-devices-data-')));
  mkdirSync(join(root, '.git', 'hooks'), { recursive: true });
  writeFileSync(join(dsh, 'backup.txt'), 'WIFI-KEY-SECRET');
  process.env.DSH_TEST_SECRET_KEY = 'sk-should-not-leak';
  try {
    const run = (command) => runCommand({ command, root, devices: true, dshHome: dsh, timeoutMs: 30_000 });
    assert.equal((await run('echo ok > result.txt && cat result.txt')).ok, true, 'ordinary files in the run folder work');
    assert.equal((await run('echo x > .git/hooks/pre-commit')).ok, false, 'no Git hook');
    assert.equal(existsSync(join(root, '.git', 'hooks', 'pre-commit')), false);
    assert.equal((await run('echo x > .envrc')).ok, false, 'no dot-file');
    const data = await run(`cat ${JSON.stringify(join(dsh, 'backup.txt'))}`);
    assert.equal(data.ok, false);
    assert.doesNotMatch(data.output, /WIFI-KEY-SECRET/);
    assert.equal((await run(`ls ${JSON.stringify(homedir())}`)).ok, false, 'the home folder is not read');
    const env = await run('env');
    assert.doesNotMatch(env.output, /sk-should-not-leak/, 'a clean environment');
  } finally {
    delete process.env.DSH_TEST_SECRET_KEY;
    rmSync(root, { recursive: true, force: true });
    rmSync(dsh, { recursive: true, force: true });
  }
});

test('lab fix: Start Mission in Devices or Workshop never names Recon: held guest and guest without rules get the space sentence; a Workshop guest with rules may start', async () => {
  // A Code guest held without tools (Bench off): its effective mode is the locked one, isolated.
  const held = spaced({ spaces: { d: 'devices' }, tabs: { d: 'isolated-locked' }, guardExtra: { d: { sealed: true } } });
  held.services.modes.isolated = (id) => id === 'd';
  try {
    held.open('d');
    const card = (await held.get('d')).json;
    assert.equal(card.runButton, false);
    assert.equal(card.runButtonWhy, 'space', 'never "recon" outside Recon');
    assert.equal(card.runButtonText, MISSION_NO_SPACE_RULES('devices'));
    assert.doesNotMatch(card.runButtonText, /Recon/);
  } finally {
    held.done();
  }
  // A Code guest in Workshop with Creator Plus's rules: Start Mission is on.
  const workshop = spaced({ spaces: { w: 'workshop' }, tabs: { w: 'code' }, extra: { creatorPlus: { longRunRules: () => ({ offlineChecks: true, cleanEnv: true }) } } });
  try {
    workshop.open('w');
    const card = (await workshop.get('w')).json;
    assert.equal(card.runButtonWhy, '');
    assert.equal(card.runButton, true);
  } finally {
    workshop.done();
  }
  // Recon still says Recon.
  const recon = spaced({ spaces: { r: 'recon' }, tabs: { r: 'research' } });
  try {
    recon.open('r');
    assert.equal((await recon.get('r')).json.runButtonWhy, 'recon');
  } finally {
    recon.done();
  }
});

test('the repair helper refuses the stage 6b Modes setting guestRunSpaces (it keeps guest runs in Devices and Workshop)', () => {
  assert.match(refusedSetting({ page: 'modes', label: 'Spaces', field: 'modes.guestRunSpaces', kind: 'text', configOnly: false }), /decides what a Mission or a thread may do/);
  // Stage 7 (6b lab leftover): and the mode each of those runs in.
  assert.match(refusedSetting({ page: 'modes', label: 'Spaces', field: 'modes.guestRunModes', kind: 'text', configOnly: false }), /decides what a Mission or a thread may do/);
});
