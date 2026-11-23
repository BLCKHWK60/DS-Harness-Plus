// Preset for each mode (item 7, the owner's decisions of 21 November 2026): every lock is a setting, the defaults,
// the server backstop, the (i) words, the PTC notes (inform, never block) and honest messages to the AI.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODING_TOOLS_LINE, CODING_TOOLS_LINE_STARTED, PRESET_TEXT, lockCaution, whereText, DEFAULT_LOCKS, LOCK_PRESET, OWNER_INFO, WHERE, defaultLockOf, lockOf, lockedPresetOf, loosenWarning,
  noProgramsPtcPrompt, presetInfo, ptcReach, reachLine, readLocks, refusesPrograms, restartPresetOf, swapNote,
} from '../lib/presetlock.js';
import { programNote, SLOW_TOOLS, TIMED_TOOLS } from '../lib/ptc.js';
import { ISOLATED_PTC_PROMPT, promptText, webPrompt } from '../lib/prompt.js';
import { LATE_MODE, LOCKED_MODE } from '../lib/isolation.js';

/** Run with spaces switched off (the lab switch DSH_SPACES_LAB=0): the old tab paths, as before item 4A stage 3a. */
async function tabsOnly(run) {
  const before = process.env.DSH_SPACES_LAB;
  process.env.DSH_SPACES_LAB = '0';
  try {
    return await run();
  } finally {
    if (before === undefined) delete process.env.DSH_SPACES_LAB;
    else process.env.DSH_SPACES_LAB = before;
  }
}


process.env.DSH_MODES_PRESET_SETTLE_MS = '0';
const { boot, makeWorld, settle } = await import('./app.mjs');

const RECON = { label: 'Recon', tools: ['recon_cite'], sandbox: 'read-only', isolated: true, prompt: 'Recon.' };
const EXTRA = {
  recon: RECON,
  bench: { label: 'Devices', tools: ['bench_read'], sandbox: 'read-only', prompt: 'Devices.' },
  automations: { label: 'Automations', tools: ['schedule_list'], sandbox: 'read-only', prompt: 'Automations.' },
  'creator-plus': { label: 'Creator Plus', tools: ['creator_map'], sandbox: 'workspace-write', prompt: 'Creator Plus.' },
  scout: { label: 'Scout', tools: ['web_search'], sandbox: 'inherit', prompt: 'Scout.' },
  mine: { label: 'My tab', tools: 'all', sandbox: 'inherit', prompt: '' },
};

// ---- the setting and its defaults --------------------------------------------------------------------------

test('defaults: Standard only for Recon, Devices and Automations, Creator only for Creator Plus, Any elsewhere', () => {
  assert.deepEqual(DEFAULT_LOCKS, { recon: 'standard', bench: 'standard', automations: 'standard', 'creator-plus': 'creator' });
  for (const id of ['chat', 'cowork', 'code', 'scout', 'data', 'research', 'content', 'finance', 'mine']) assert.equal(lockOf({}, id), 'any', id);
  assert.equal(lockOf({}, 'recon'), 'standard');
  assert.equal(lockOf({}, 'bench'), 'standard');
  assert.equal(lockOf({}, 'automations'), 'standard');
  assert.equal(lockOf({}, 'creator-plus'), 'creator');
  assert.equal(lockedPresetOf({}, 'creator-plus'), 'cordis', 'Creator is the app\'s preset cordis');
  assert.equal(lockedPresetOf({}, 'recon'), 'standard');
  assert.equal(lockedPresetOf({}, 'chat'), '');
  assert.equal(defaultLockOf('constructor'), 'any', 'no inherited keys');
});

test('nothing is fixed: every tab, Recon included, follows its stored choice; a bad entry is ignored', () => {
  const table = readLocks(JSON.stringify({ recon: 'any', chat: 'standard', mine: 'creator', bench: 'nonsense', 'BAD id': 'standard' }));
  assert.deepEqual(table, { recon: 'any', chat: 'standard', mine: 'creator' });
  assert.equal(lockOf(table, 'recon'), 'any');
  assert.equal(lockOf(table, 'chat'), 'standard');
  assert.equal(lockOf(table, 'mine'), 'creator', 'your own modes can be locked too');
  assert.equal(lockOf(table, 'bench'), 'standard', 'a broken entry keeps the default');
  assert.deepEqual(readLocks('not json'), {});
  assert.deepEqual(readLocks(''), {});
  assert.deepEqual(readLocks({ chat: 'any' }), { chat: 'any' }, 'an object already');
});

test('the two isolated fallback modes are never locked', () => {
  for (const mode of [LOCKED_MODE, LATE_MODE]) {
    assert.equal(lockOf({ [mode.id]: 'standard' }, mode.id), 'any', mode.id);
    assert.equal(refusesPrograms(mode), false, `${mode.id} has no tools at all; the cause is the mode`);
  }
});

test('which tabs refuse programs: isolated tabs, Devices, Creator Plus and modes marked noPrograms', () => {
  assert.equal(refusesPrograms({ id: 'recon', isolated: true }), true);
  assert.equal(refusesPrograms({ id: 'my-closed', isolated: true }), true, 'your own isolated mode');
  assert.equal(refusesPrograms({ id: 'bench' }), true);
  assert.equal(refusesPrograms({ id: 'creator-plus' }), true);
  assert.equal(refusesPrograms({ id: 'mine', noPrograms: true }), true);
  assert.equal(refusesPrograms({ id: 'cowork' }), false);
  assert.equal(restartPresetOf({}, { id: 'creator-plus' }), 'cordis');
  assert.equal(restartPresetOf({ 'creator-plus': 'any' }, { id: 'creator-plus' }), 'cordis', 'Creator Plus starts again on Creator even when loosened');
  assert.equal(restartPresetOf({ 'creator-plus': 'standard' }, { id: 'creator-plus' }), 'standard', 'its own lock wins');
  assert.equal(restartPresetOf({}, { id: 'bench' }), 'standard');
});

// ---- the words ---------------------------------------------------------------------------------------------

test('the (i) carries the owner\'s words exactly, plus the Coding Tools line with the app\'s real Settings path', () => {
  const words = [
    'Standard: the AI uses one tool at a time. After each tool it reads the full result, then decides the next step.',
    'PTC (Programmatic Tool Calling): the AI writes a small program that calls many tools in one go (loops, filters, batches). Only the final printed result comes back to the AI.',
    'This saves tokens and time on repetitive or batch work, for example checking 40 links or reading 30 files. It works less well when each step needs judgement, and you see less of each individual step.',
    'Best when each step needs judgement.',
    'The switch applies when a new thread starts. A thread keeps the setting it started with.',
  ];
  const all = `${OWNER_INFO.what} ${OWNER_INFO.when} ${OWNER_INFO.change}`;
  for (const piece of words) assert.ok(all.includes(piece), piece);
  assert.match(OWNER_INFO.when, /^Standard: Best when each step needs judgement\. PTC: This saves/);
  assert.match(CODING_TOOLS_LINE, /Coding Tools/);
  assert.match(CODING_TOOLS_LINE, /Settings → General → Show coding view/);
  const info = presetInfo({ label: 'Chat', modeId: 'chat', lock: 'any' });
  assert.deepEqual(info.more, [CODING_TOOLS_LINE], 'an unlocked tab: only the Coding Tools line');
  assert.equal(info.title, 'Standard or PTC');
});

test('in a locked tab the (i) gives the reason and where to change it; a missing preset is said plainly', () => {
  const recon = presetInfo({ label: 'Recon', modeId: 'recon', lock: 'standard' });
  assert.match(recon.more[1], /Recon is set to Standard only, so the menu is greyed: Recon never runs code the AI writes/);
  assert.ok(recon.more[1].includes(WHERE));
  assert.equal(WHERE, 'Settings → Modes → Preset for each mode');
  const creator = presetInfo({ label: 'Creator Plus', modeId: 'creator-plus', lock: 'creator', missing: true });
  assert.match(creator.more[1], /the Creator preset is not in the app's preset list right now/);
  assert.match(creator.more[1], /menu stays free/);
  assert.match(creator.more[1], /without its inspection tools/);
  const own = presetInfo({ label: 'My tab', modeId: 'mine', lock: 'standard' });
  assert.match(own.more[1], /My tab is set to Standard only, so the menu is greyed\./);
  const started = presetInfo({ label: 'Recon', modeId: 'recon', lock: 'standard', started: true, preset: 'ptc' });
  assert.match(started.more[2], /This thread runs on PTC/);
  assert.match(started.more[2], /Start a new thread for Standard/);
});

test('after the backstop switched a pick made elsewhere, the (i) says so', () => {
  const info = presetInfo({ label: 'Devices', modeId: 'bench', lock: 'standard', overridden: { from: 'ptc', to: 'standard', why: 'pick' } });
  assert.ok(info.more.some((line) => /You had picked PTC for a new thread, but Devices is set to Standard only, so this thread was switched back to Standard\./.test(line)));
});

test('loosening a default lock warns in plain words; Recon says its own rule is not changed here', () => {
  const recon = loosenWarning('recon', 'any', 'Recon');
  assert.match(recon, /^Unsafe\./);
  assert.match(recon, /PTC runs code the AI writes, which breaks Recon's rule/);
  assert.match(recon, /cannot do anything/);
  assert.match(recon, /no-programs rule is not changed here/);
  assert.match(recon, /Start Recon threads in Standard instead/);
  assert.match(loosenWarning('bench', 'any', 'Devices'), /a Mission included/);
  assert.match(loosenWarning('automations', 'any'), /runs in PTC too, each time it runs/);
  assert.match(loosenWarning('creator-plus', 'any'), /cordis_inspect_list/);
  assert.equal(loosenWarning('recon', 'standard'), '', 'keeping the lock warns nothing');
  assert.equal(loosenWarning('chat', 'any'), '', 'an unlocked tab warns nothing');
  assert.equal(loosenWarning('recon', 'creator'), '', 'Creator is a lock too');
  assert.match(swapNote('creator-plus', 'standard'), /without its two inspection tools/);
  assert.match(swapNote('recon', 'creator'), /Recon keeps its own tools and rules/);
  assert.equal(swapNote('chat', 'standard'), '');
});

test('PTC notes inform where a program reaches more than the tab allows; Chat only with Web on', () => {
  assert.deepEqual(ptcReach({ id: 'chat' }, { web: false }), { note: '', info: '' }, 'Chat with Web off refuses programs anyway');
  assert.match(ptcReach({ id: 'chat' }, { web: true }).note, /read files, run commands and go online/);
  assert.match(ptcReach({ id: 'scout' }).info, /privacy check sees only its own search tools/);
  assert.match(ptcReach({ id: 'data' }).note, /go online and read files outside the folder/);
  assert.match(ptcReach({ id: 'research' }).info, /2 minutes/);
  assert.match(ptcReach({ id: 'content' }).note, /go online by itself/);
  assert.match(ptcReach({ id: 'automations' }).note, /run in PTC every time/);
  for (const id of ['chat', 'scout', 'data', 'research', 'content', 'automations']) {
    const reach = ptcReach({ id }, { web: true });
    assert.ok(reach.note.length < 110, `${id}: one short line`);
    assert.ok(id === 'chat' || id === 'automations' || /Nothing is blocked/.test(reach.info), `${id}: never blocks`);
  }
  assert.deepEqual(ptcReach({ id: 'cowork' }), { note: '', info: '' }, 'Cowork allows everything already');
  assert.match(ptcReach({ id: 'bench' }).note, /runs no programs: in PTC it cannot do anything. Start a new thread on Standard/);
  assert.match(ptcReach({ id: 'creator-plus' }, { restart: 'cordis' }).note, /on Creator/);
});

test('honest words for a tab that refuses programs, and the slow-tool note', () => {
  const text = noProgramsPtcPrompt('Devices', 'standard');
  assert.match(text, /The Devices mode runs no programs/);
  assert.match(text, /does not work in PTC/);
  assert.match(text, /with the Standard preset/);
  assert.match(noProgramsPtcPrompt('Creator Plus', 'cordis'), /with the Creator preset/);
  for (const name of ['judge_candidates', 'pdf_ocr', 'generate_image', 'edit_image', 'mac_run_shortcut']) assert.ok(SLOW_TOOLS.includes(name), name);
  assert.deepEqual(TIMED_TOOLS, ['data_python']);
  const timeout = { defaultMs: 120000, maxMs: 600000 };
  const data = programNote({ timeout, timed: ['data_python'] });
  assert.match(data, /data_python can take up to a few minutes: pass a higher `timeoutMs` \(up to 600000\)/);
  assert.doesNotMatch(data, /alone in its own program/, 'Data keeps batching');
  assert.match(data, /stopped after 120 seconds/);
  const both = programNote({ timeout, slow: ['pdf_ocr'], timed: ['data_python'] });
  assert.equal(both.match(/stopped after/g).length, 1, 'the default limit is said once');
});

// ---- on a stand-in app -------------------------------------------------------------------------------------

/** The app's preset registry, as far as Modes uses it. */
function presetsService({ ids = ['standard', 'ptc', 'minimal', 'cordis'], broken = [] } = {}) {
  const calls = [];
  return {
    calls,
    list: async () => ids.map((id) => ({ id, ...(broken.includes(id) ? { broken: 'failed to mount' } : {}) })),
    presetForSession: (session) => session?.agentPreset ?? null,
    select: async (agent, id) => {
      if (agent.phase?.lastTurn > 0) throw Object.assign(new Error('This session has already started'), { code: 'agent-preset/locked' });
      calls.push([agent.id, id]);
      agent.session.agentPreset = id;
      return id;
    },
  };
}

function start(fields = {}, options = {}) {
  const agentPresets = presetsService(options.presets);
  const world = makeWorld({ extraModes: JSON.stringify(EXTRA), ...fields });
  const app = boot(world, { tabs: true, known: ['read', 'bench_read', 'creator_map', 'recon_cite', 'web_search', 'schedule_list'], services: { agentPresets }, viaPrograms: options.viaPrograms });
  return { app, world, agentPresets };
}

/** A new conversation in the selected tab, on a preset, then a pick lands on it. */
async function pick(app, id, from, to) {
  const { agent } = await app.open(id);
  agent.session.agentPreset = from;
  if (to !== undefined) {
    agent.session.agentPreset = to;
    await app.emit('agent-preset/selected', id, to);
  }
  await settle();
  return agent;
}

test('backstop: a blank Recon conversation that gets PTC is switched back to Standard; the (i) says why', () => tabsOnly(async () => {
  const { app, agentPresets } = start({ defaultMode: 'recon' });
  const agent = await pick(app, 'r1', 'standard', 'ptc');
  assert.equal(agent.session.agentPreset, 'standard');
  assert.deepEqual(agentPresets.calls.at(-1), ['r1', 'standard']);
  const view = await app.service().presetView('r1');
  assert.equal(view.lock, 'standard');
  assert.equal(view.greyed, true);
  assert.deepEqual(view.overridden, { from: 'ptc', to: 'standard', why: 'pick', modeId: 'recon', label: 'Recon' });
  assert.ok(view.info.more.some((line) => /switched back to Standard/.test(line)));
}));

test('backstop: Creator Plus is moved to Creator; Devices and Automations to Standard; other tabs keep the pick', () => tabsOnly(async () => {
  for (const [tab, wanted] of [['creator-plus', 'cordis'], ['bench', 'standard'], ['automations', 'standard']]) {
    const { app } = start({ defaultMode: tab });
    const agent = await pick(app, `${tab}-1`, 'ptc', 'ptc');
    assert.equal(agent.session.agentPreset, wanted, tab);
  }
  for (const tab of ['chat', 'cowork', 'scout', 'mine']) {
    const { app, agentPresets } = start({ defaultMode: tab });
    const agent = await pick(app, `${tab}-1`, 'standard', 'ptc');
    assert.equal(agent.session.agentPreset, 'ptc', `${tab}: PTC is never blocked outside a lock`);
    assert.deepEqual(agentPresets.calls, []);
  }
}));

test('backstop: keyed on the setting, not the tab id; your own mode can be locked, Recon can be freed', () => tabsOnly(async () => {
  const mine = start({ defaultMode: 'mine', presetLock: JSON.stringify({ mine: 'standard' }) });
  assert.equal((await pick(mine.app, 'm1', 'standard', 'ptc')).session.agentPreset, 'standard');
  const freed = start({ defaultMode: 'recon', presetLock: JSON.stringify({ recon: 'any' }) });
  assert.equal((await pick(freed.app, 'r2', 'standard', 'ptc')).session.agentPreset, 'ptc', 'Recon set to Any: nothing is forced');
  assert.equal(freed.app.service().lockedPreset('recon'), '');
  assert.equal(mine.app.service().lockedPreset('mine'), 'standard');
}));

test('backstop: a new conversation the app made on its default is switched too (Cmd-N without the sidebar\'s start)', () => tabsOnly(async () => {
  const { app } = start({ defaultMode: 'bench' });
  const { agent } = await app.open('b2');
  agent.session.agentPreset = 'ptc';
  // The check runs after agent/created; here the preset is read when it runs.
  await app.emit('agent/created', { agent, source: 'startup' });
  await settle();
  assert.equal(agent.session.agentPreset, 'standard');
  const view = await app.service().presetView('b2');
  assert.equal(view.overridden.why, 'default');
}));

test('backstop: a started conversation, a helper and the agent-preset/locked refusal are left alone', async () => {
  const { app, agentPresets } = start({ defaultMode: 'recon' });
  const { agent } = await app.open('r3');
  agent.session.agentPreset = 'ptc';
  agent.phase = { kind: 'idle', lastTurn: 1 };
  await app.emit('agent-preset/selected', 'r3', 'ptc');
  await settle();
  assert.equal(agent.session.agentPreset, 'ptc', 'a started chat keeps its preset');
  const helper = (await app.open('h1', { header: { origin: 'subagent', parentSession: 'r3' } })).agent;
  helper.session.agentPreset = 'ptc';
  await app.emit('agent-preset/selected', 'h1', 'ptc');
  await settle();
  assert.equal(helper.session.agentPreset, 'ptc');
  assert.deepEqual(agentPresets.calls, []);
});

test('backstop: a locked preset the app does not offer falls back gracefully and the (i) says so', () => tabsOnly(async () => {
  const { app, agentPresets } = start({ defaultMode: 'creator-plus' }, { presets: { ids: ['standard', 'ptc'] } });
  const agent = await pick(app, 'c2', 'standard', 'ptc');
  assert.equal(agent.session.agentPreset, 'ptc', 'nothing to switch to');
  assert.deepEqual(agentPresets.calls, []);
  const view = await app.service().presetView('c2');
  assert.equal(view.missing, true);
  assert.equal(view.greyed, false, 'the menu stays free');
  assert.ok(view.info.more.some((line) => /not in the app's preset list right now/.test(line)));
  const broken = start({ defaultMode: 'creator-plus' }, { presets: { broken: ['cordis'] } });
  assert.equal((await pick(broken.app, 'c3', 'standard', 'ptc')).session.agentPreset, 'ptc', 'a preset that failed to load counts as missing');
}));

test('the preset view: each tab\'s choice for Settings, and a PTC note under the menu only while in PTC', () => tabsOnly(async () => {
  const { app } = start({ defaultMode: 'scout', presetLock: JSON.stringify({ chat: 'standard' }) });
  const all = await app.service().presetView('');
  const byId = Object.fromEntries(all.tabs.map((tab) => [tab.id, tab]));
  assert.equal(byId.chat.lock, 'standard');
  assert.equal(byId.chat.saved, true);
  assert.equal(byId.recon.lock, 'standard');
  assert.equal(byId.recon.saved, false);
  assert.match(byId.recon.warn, /^Unsafe\./);
  assert.equal(byId.cowork.warn, '');
  assert.equal(byId['creator-plus'].defaultLock, 'creator');
  assert.equal(byId.bench.refuses, true);
  assert.deepEqual(all.presets, { standard: true, creator: true });
  await pick(app, 's1', 'ptc');
  const view = await app.service().presetView('s1');
  assert.equal(view.ptc, true);
  assert.match(view.note, /read your files and go online/);
  assert.ok(view.info.more.some((line) => /privacy check/.test(line)), 'the tab line in the (i)');
  const std = await pick(app, 's2', 'standard');
  assert.equal(std.session.agentPreset, 'standard');
  assert.equal((await app.service().presetView('s2')).note, '', 'no note in Standard');
  assert.equal((await app.service().presetView('nobody')).known, false);
}));

test('honest messages: Devices and Creator Plus under PTC get no run_code note; Recon keeps its own; the fallback modes are not sent to Standard', async () => {
  const ids = ['dev', 'cp', 'rec', 'cow', 'gone'];
  const sessionModes = { dev: 'bench', cp: 'creator-plus', rec: 'recon', cow: 'cowork', gone: 'cowork' };
  const world = makeWorld({ extraModes: JSON.stringify(EXTRA), sessionModes: JSON.stringify(sessionModes), sessionIsolated: JSON.stringify({ gone: true }), defaultMode: 'cowork' });
  const app = boot(world, { known: ['read', 'bench_read', 'creator_map', 'recon_cite'], viaPrograms: new Set(ids), before: ids.map((id) => ({ id, lastTurn: id === 'gone' ? 3 : 0 })) });
  await settle();
  const dev = app.prompt('dev');
  assert.doesNotMatch(dev, /call it from inside a `run_code` program/);
  assert.match(dev, /The Devices mode runs no programs/);
  assert.match(dev, /with the Standard preset/);
  const cp = app.prompt('cp');
  assert.doesNotMatch(cp, /call it from inside a `run_code` program/);
  assert.match(cp, /with the Creator preset/);
  assert.ok(app.prompt('rec').includes(ISOLATED_PTC_PROMPT), 'Recon keeps its own PTC words');
  assert.match(app.prompt('cow'), /call it from inside a `run_code` program/, 'an ordinary tab keeps the usual note');
  assert.ok(!app.prompt('gone').includes(ISOLATED_PTC_PROMPT), 'a locked fallback conversation is not sent to Standard');
  assert.ok(app.prompt('gone').includes(LOCKED_MODE.prompt.slice(0, 40)));
});

/** A request to a route Modes registered; resolves to the parsed answer. */
function call(routes, path, session) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(body) { resolve({ status: this.statusCode, body: body ? JSON.parse(body) : null }); } };
    void routes.get(path)({ method: 'GET', headers: session ? { 'x-dsh-session': session } : {} }, res);
  });
}

test('the Tools panel\'s PTC hint is hidden in tabs that refuse programs; the preset route answers', () => tabsOnly(async () => {
  const ids = ['dev', 'cow'];
  const routes = new Map();
  const webServer = { register: (spec) => { routes.set(spec.path, spec.handler); return () => routes.delete(spec.path); } };
  const connection = { requestRejection: () => undefined };
  const world = makeWorld({ extraModes: JSON.stringify(EXTRA), sessionModes: JSON.stringify({ dev: 'bench', cow: 'cowork' }) });
  const app = boot(world, { known: ['read', 'bench_read'], viaPrograms: new Set(ids), before: ids.map((id) => ({ id })), services: { webServer, connection, agentPresets: presetsService() } });
  await settle();
  assert.equal((await call(routes, '/dsh-modes/tools', 'dev')).body.viaCode, false, 'Devices refuses programs: no PTC hint');
  assert.equal((await call(routes, '/dsh-modes/tools', 'cow')).body.viaCode, true);
  const preset = await call(routes, '/dsh-modes/preset', 'dev');
  assert.equal(preset.status, 200);
  assert.equal(preset.body.lock, 'standard');
  assert.equal(preset.body.ptc, true);
  assert.match(preset.body.note, /runs no programs/);
  const tabs = await call(routes, '/dsh-modes/preset');
  assert.ok(Array.isArray(tabs.body.tabs) && tabs.body.known === undefined, 'without a conversation: the tabs only');
  assert.equal(app.service().lockedPreset('bench'), 'standard');
}));

// ---- item 7 lab fixes (21 November 2026) ----------------------------------------------------------------------

test('a started chat\'s (i) speaks of its label, not a greyed menu, and keeps the reason and where to change it', () => {
  const info = presetInfo({ label: 'Recon', modeId: 'recon', lock: 'standard', started: true, preset: 'standard' });
  assert.equal(info.more[0], CODING_TOOLS_LINE_STARTED);
  assert.match(info.more[0], /preset menu on the new-chat page/);
  assert.ok(info.more.every((line) => !/greyed/.test(line)), 'no "greyed" on a started chat');
  assert.match(info.more[1], /^Recon is set to Standard only: new threads here start on Standard \(Recon never runs code the AI writes/);
  assert.match(info.more[1], /This thread keeps its preset\. To change it: Settings → Modes → Preset for each mode\./);
  const blank = presetInfo({ label: 'Recon', modeId: 'recon', lock: 'standard' });
  assert.equal(blank.more[0], CODING_TOOLS_LINE);
  assert.match(blank.more[1], /so the menu is greyed/);
});

test('a chat that opened on another preset is not told "you had picked"; the stored tab name is used', () => {
  const opened = presetInfo({ label: 'Devices', modeId: 'bench', lock: 'standard', overridden: { from: 'ptc', to: 'standard', why: 'default', label: 'Devices' } });
  assert.ok(opened.more.includes('This new thread opened on PTC, but Devices is set to Standard only, so it was switched to Standard.'));
  assert.ok(opened.more.every((line) => !/You had picked/.test(line)));
  const named = presetInfo({ label: 'Other', modeId: 'bench', lock: 'standard', overridden: { from: 'ptc', to: 'standard', why: 'pick', label: 'Devices' } });
  assert.ok(named.more.some((line) => /but Devices is set to Standard only/.test(line)), 'the tab of the switch');
});

test('under the menu of a blank chat the next step is the menu beside it, not a new chat', () => {
  const blank = ptcReach({ id: 'bench' }, { blank: true });
  assert.equal(blank.note, 'This mode runs no programs: in PTC it cannot do anything. Pick Standard in this menu before you send.');
  assert.match(blank.info, /Pick Standard in the preset menu before you send/);
  assert.match(ptcReach({ id: 'bench' }).info, /Start a new thread in this mode on Standard/, 'a started chat: a new chat');
  assert.match(ptcReach({ id: 'creator-plus' }, { blank: true, restart: 'cordis' }).note, /Pick Creator in this menu/);
});

test('the preset lock is English only: a Chinese page gets the English words (decision 28)', () => {
  assert.deepEqual(Object.keys(PRESET_TEXT), ['en'], 'one table');
  const zh = presetInfo({ label: 'Recon', modeId: 'recon', lock: 'standard', lang: 'zh' });
  assert.equal(zh.title, 'Standard or PTC');
  assert.equal(zh.lang, 'en');
  assert.match(zh.more[0], /Show coding view/);
  assert.match(zh.more[1], /^Recon is set to Standard only, so the menu is greyed/);
  assert.ok(zh.more[1].includes(whereText('zh')));
  assert.equal(whereText('zh'), whereText('en'));
  assert.match(loosenWarning('recon', 'any', 'Recon', 'zh'), /^Unsafe\./);
  assert.match(ptcReach({ id: 'scout' }, { lang: 'zh' }).note, /^PTC: /);
  assert.match(lockCaution('recon', 'zh'), /unsafe/);
  assert.equal(swapNote('chat', 'standard', 'zh'), '');
  assert.equal(presetInfo({ label: 'Chat', modeId: 'chat', lock: 'any' }).title, 'Standard or PTC', 'English by default');
});

test('Recon\'s row always carries its plain warning; other tabs have none', () => {
  assert.equal(lockCaution('recon'), 'Any is unsafe here: PTC runs code the AI writes. Keep Standard only.');
  for (const id of ['bench', 'automations', 'creator-plus', 'chat']) assert.equal(lockCaution(id), '', id);
});

test('Chat under PTC with Web on is told how it may look things up, so its words do not contradict', () => {
  const chat = { id: 'chat', tools: 'none', prompt: 'You are in Chat mode: answer directly in one reply. No tools are available.' };
  const ptc = promptText({ mode: chat, web: true, stepWeb: ['web_fetch'], ptc: true });
  assert.match(ptc, /call web_fetch from inside a run_code program/);
  assert.match(ptc, /Where these instructions say no tools are available, that means no tools other than this\./);
  const standard = promptText({ mode: chat, web: true, stepWeb: ['web_fetch'] });
  assert.doesNotMatch(standard, /run_code/, 'Standard: unchanged');
  assert.equal(webPrompt(['web_fetch'], ['read'], { programOnly: true }).includes('run_code'), false, 'a mode with tools gets the usual program note elsewhere');
});

test('the preset route answers in English when the page says Chinese, and names the app\'s default preset', async () => {
  const routes = new Map();
  const webServer = { register: (spec) => { routes.set(spec.path, spec.handler); return () => routes.delete(spec.path); } };
  const connection = { requestRejection: () => undefined };
  const agentPresets = { ...presetsService(), defaultId: 'standard' };
  const world = makeWorld({ extraModes: JSON.stringify(EXTRA), defaultMode: 'recon' });
  boot(world, { tabs: true, known: ['read', 'recon_cite'], services: { webServer, connection, agentPresets } });
  await settle();
  const answer = await new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(body) { resolve(JSON.parse(body)); } };
    void routes.get('/dsh-modes/preset')({ method: 'GET', headers: { 'x-dsh-locale': 'zh-CN' } }, res);
  });
  assert.equal(answer.defaultPreset, 'standard');
  assert.equal(answer.where, 'Settings → Spaces → Preset in this space', 'with spaces live, the setting is Preset in this space (stage 5)');
  const recon = answer.tabs.find((tab) => tab.id === 'recon');
  assert.match(recon.warn, /^Unsafe\./);
  assert.match(recon.caution, /unsafe/);
});

test('backstop: a new chat claimed into a locked tab (a Split Plus pane) gets that tab\'s preset', () => tabsOnly(async () => {
  const { app, agentPresets } = start({ defaultMode: 'chat' });
  const agent = await pick(app, 'sp1', 'ptc');
  assert.equal(agent.session.agentPreset, 'ptc', 'Chat is Any');
  await app.service().set('sp1', 'bench', { claim: true });
  await settle();
  assert.equal(agent.session.agentPreset, 'standard', 'claimed into Devices: Standard');
  assert.deepEqual(agentPresets.calls.at(-1), ['sp1', 'standard']);
  const view = await app.service().presetView('sp1');
  assert.equal(view.modeId, 'bench');
  assert.equal(view.greyed, true);
  assert.ok(view.info.more.some((line) => line === 'This new thread opened on PTC, but Devices is set to Standard only, so it was switched to Standard.'));
}));

/** The (i) beside the shown draft reads the preset route: twice, as it does while the draft stays on screen. */
async function show(app, id) {
  await app.service().presetView(id);
  const view = await app.service().presetView(id);
  await settle();
  return view;
}

test('backstop: the same blank draft shown in a locked tab, or its tab locked meanwhile, is switched', () => tabsOnly(async () => {
  const moved = start({ defaultMode: 'chat' });
  const draft = await pick(moved.app, 'mv1', 'standard', 'ptc');
  assert.equal(draft.session.agentPreset, 'ptc', 'PTC picked in Chat (Any)');
  moved.world.config.defaultMode = 'bench';
  await moved.app.emit('loader/volatile-update');
  await settle();
  assert.equal(draft.session.agentPreset, 'ptc', 'a tab switch alone changes nothing');
  await show(moved.app, 'mv1');
  assert.equal(draft.session.agentPreset, 'standard', 'shown in Devices with the same draft open: switched');
  const locked = start({ defaultMode: 'cowork' });
  const open = await pick(locked.app, 'lk1', 'standard', 'ptc');
  locked.world.config.presetLock = JSON.stringify({ cowork: 'standard' });
  await locked.app.emit('loader/volatile-update');
  await show(locked.app, 'lk1');
  assert.equal(open.session.agentPreset, 'standard', 'the tab was locked while a PTC draft was on screen');
  const started = start({ defaultMode: 'chat' });
  const ran = await pick(started.app, 'st1', 'ptc');
  ran.phase = { kind: 'idle', lastTurn: 1 };
  started.world.config.presetLock = JSON.stringify({ chat: 'standard' });
  await started.app.emit('loader/volatile-update');
  await show(started.app, 'st1');
  assert.equal(ran.session.agentPreset, 'ptc', 'a started chat keeps its preset');
}));

test('backstop: flipping between a locked tab and an Any tab never touches a blank draft that is not on screen (lab, item 7)', async () => {
  const { app, world, agentPresets } = start({ defaultMode: 'cowork' });
  const cowork = await pick(app, 'cw1', 'standard', 'ptc');
  const other = await pick(app, 'rc1', 'standard');
  for (const tab of ['recon', 'cowork', 'creator-plus', 'cowork', 'recon', 'chat', 'creator-plus']) {
    world.config.defaultMode = tab;
    await app.emit('loader/volatile-update');
    await settle();
  }
  assert.deepEqual(agentPresets.calls, [], 'no select for drafts that are not shown');
  assert.equal(cowork.session.agentPreset, 'ptc', 'the PTC pick in Cowork is kept');
  assert.equal(other.session.agentPreset, 'standard', 'the other draft is not switched to Creator');
  // One read during a tab switch (a stale (i) poked by the change) is not enough to count as shown.
  world.config.defaultMode = 'recon';
  await app.service().presetView('cw1');
  await settle();
  assert.equal(cowork.session.agentPreset, 'ptc');
  world.config.defaultMode = 'cowork';
  await show(app, 'cw1');
  assert.equal(cowork.session.agentPreset, 'ptc', 'back in Cowork: still PTC');
  assert.deepEqual(agentPresets.calls, []);
  // Only the draft actually shown in Recon is switched.
  world.config.defaultMode = 'recon';
  await show(app, 'rc1');
  assert.deepEqual(agentPresets.calls, []);
  const view = await show(app, 'rc1');
  assert.equal(view.overridden, null, 'nothing was switched, so no "opened on Creator" line');
});

test('a draft a locked tab switched gets its own preset back when it is shown in an Any tab again (lab, item 7)', () => tabsOnly(async () => {
  const { app, world } = start({ defaultMode: 'cowork' }, { presets: undefined });
  const draft = await pick(app, 'cv1', 'standard', 'ptc');
  world.config.defaultMode = 'automations';
  await show(app, 'cv1');
  assert.equal(draft.session.agentPreset, 'standard', 'Automations: Standard');
  world.config.defaultMode = 'cowork';
  await show(app, 'cv1');
  assert.equal(draft.session.agentPreset, 'ptc', 'back in Cowork: the PTC pick it had');
  // Through two locked tabs: the first preset is still the one given back.
  world.config.defaultMode = 'automations';
  await show(app, 'cv1');
  world.config.defaultMode = 'creator-plus';
  await show(app, 'cv1');
  assert.equal(draft.session.agentPreset, 'cordis');
  world.config.defaultMode = 'code';
  await show(app, 'cv1');
  assert.equal(draft.session.agentPreset, 'ptc', 'Code: PTC again, not Creator');
}));

test('a Creator Plus draft carried into an Any tab goes back to the app\'s default preset, so a Code chat never starts on Creator (lab, item 7)', () => tabsOnly(async () => {
  const agentPresets = { ...presetsService(), defaultId: 'standard' };
  const world = makeWorld({ extraModes: JSON.stringify(EXTRA), defaultMode: 'creator-plus' });
  const app = boot(world, { tabs: true, known: ['read', 'creator_map'], services: { agentPresets } });
  // The sidebar started it on Creator ({ agentPreset: 'cordis' } on the start): no switch was needed.
  const draft = await pick(app, 'cp1', 'cordis');
  await show(app, 'cp1');
  assert.equal(draft.session.agentPreset, 'cordis');
  world.config.defaultMode = 'code';
  const view = await show(app, 'cp1');
  assert.equal(view.modeId, 'code');
  assert.equal(draft.session.agentPreset, 'standard', 'Code shows it on the app default');
  // A Creator pick made in an Any tab is the owner's own: kept.
  world.config.defaultMode = 'data';
  const mine = await pick(app, 'dt1', 'standard', 'cordis');
  await show(app, 'dt1');
  assert.equal(mine.session.agentPreset, 'cordis', 'Creator picked in Data stays');
}));

test('the "switched" line shows only for a short while after the switch', () => tabsOnly(async () => {
  mock.timers.enable({ apis: ['Date'], now: 5_000_000 });
  try {
    const { app } = start({ defaultMode: 'recon' });
    await pick(app, 'sw1', 'standard', 'ptc');
    assert.equal((await app.service().presetView('sw1')).overridden?.why, 'pick');
    mock.timers.tick(3 * 60 * 1000);
    const later = await app.service().presetView('sw1');
    assert.equal(later.overridden, null, 'an old switch the owner may never have seen is not told');
    assert.ok(later.info.more.every((line) => !/switched/.test(line)));
  } finally {
    mock.timers.reset();
  }
}));

test('the PTC line is left out of the (i) while the menu is greyed on the locked preset (lab: Automations said "Nothing is blocked")', () => tabsOnly(async () => {
  assert.equal(reachLine({ greyed: false, info: 'x' }), 'x');
  assert.equal(reachLine({ greyed: true, refuses: true, preset: 'ptc', lockedTo: 'standard', info: 'x' }), '');
  assert.equal(reachLine({ greyed: true, refuses: false, preset: 'standard', lockedTo: 'standard', info: 'x' }), '');
  assert.equal(reachLine({ greyed: true, refuses: false, preset: 'ptc', lockedTo: 'standard', info: 'x' }), 'x', 'a started PTC chat keeps it');
  const { app } = start({ defaultMode: 'automations' });
  await pick(app, 'au1', 'standard');
  const view = await app.service().presetView('au1');
  assert.equal(view.greyed, true);
  assert.ok(view.info.more.every((line) => !/Nothing is blocked/.test(line)), 'no "Nothing is blocked" under a greyed menu');
  assert.ok(view.info.more.some((line) => /so the menu is greyed/.test(line)));
}));

test('a Chinese page: the preset is Creator as in the English menu, and the (i) gets English heads', () => {
  const zh = presetInfo({ label: 'Creator Plus', modeId: 'creator-plus', lock: 'creator', lang: 'zh' });
  assert.equal(zh.lang, 'en');
  assert.ok(zh.more.some((line) => line.includes('is set to Creator only')));
  assert.equal(presetInfo({ label: 'Chat', modeId: 'chat', lock: 'any' }).lang, 'en');
});

test('the menu is greyed only while the chat is on the locked preset, and only when the app\'s list was read', () => tabsOnly(async () => {
  const stuck = { ...presetsService(), select: async () => 'standard' };
  const { app } = start({ defaultMode: 'bench' }, {});
  const world = makeWorld({ extraModes: JSON.stringify(EXTRA), defaultMode: 'bench' });
  const held = boot(world, { tabs: true, known: ['read', 'bench_read'], services: { agentPresets: stuck } });
  const agent = await pick(held, 'g1', 'ptc');
  assert.equal(agent.session.agentPreset, 'ptc', 'the switch has not landed');
  assert.equal((await held.service().presetView('g1')).greyed, false, 'a blank draft still on PTC keeps a free menu');
  const silent = { ...presetsService(), list: async () => { throw new Error('no list'); } };
  const blind = boot(makeWorld({ extraModes: JSON.stringify(EXTRA), defaultMode: 'bench' }), { tabs: true, known: ['read', 'bench_read'], services: { agentPresets: silent } });
  await pick(blind, 'g2', 'standard');
  assert.equal((await blind.service().presetView('g2')).greyed, false, 'no preset list: not greyed');
  await pick(app, 'g3', 'standard');
  assert.equal((await app.service().presetView('g3')).greyed, true, 'on Standard in Devices: greyed');
}));

test('a switch record that no longer applies is dropped (lab: a Creator Plus draft reused in Devices set to Any)', () => tabsOnly(async () => {
  const { app, world } = start({ defaultMode: 'creator-plus' });
  const draft = await pick(app, 'cp9', 'standard', 'ptc');
  assert.equal(draft.session.agentPreset, 'cordis');
  assert.equal((await app.service().presetView('cp9')).overridden.label, 'Creator Plus');
  world.config.presetLock = JSON.stringify({ bench: 'any' });
  world.config.defaultMode = 'bench';
  await app.emit('loader/volatile-update');
  await settle();
  const view = await app.service().presetView('cp9');
  assert.equal(view.modeId, 'bench');
  assert.equal(view.overridden, null);
  assert.ok(view.info.more.every((line) => !/switched/.test(line)), 'no "switched back" line under another tab');
  assert.equal((await app.service().presetView('cp9')).overridden, null, 'and it stays gone');
}));

test('a blank draft from an earlier run follows the tab it is shown in, not the mode it was stored with (old tabs)', () => tabsOnly(async () => {
  const world = makeWorld({ extraModes: JSON.stringify(EXTRA), defaultMode: 'chat', sessionModes: JSON.stringify({ old: 'recon' }), sessionIsolated: JSON.stringify({ old: true }) });
  const app = boot(world, { tabs: true, known: ['read', 'recon_cite'], before: [{ id: 'old', phase: null }], services: { agentPresets: presetsService() } });
  await settle();
  const old = app.opened[0].agent;
  old.session.agentPreset = 'standard';
  // The app says later that it never ran.
  old.phase = { kind: 'idle', lastTurn: 0 };
  const view = await app.service().presetView('old');
  assert.equal(view.modeId, 'chat', 'Chat, the tab it is shown in');
  assert.equal(view.lock, 'any');
  assert.equal(view.greyed, false);
  assert.ok(view.info.more.every((line) => !/Recon/.test(line)));
  // Once it has run, the tab no longer decides.
  await app.firstTurn(old);
  world.config.defaultMode = 'cowork';
  assert.equal((await app.service().presetView('old')).modeId, 'chat');
}));
