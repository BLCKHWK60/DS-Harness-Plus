import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Preset in this tab (item 7): a locked tab's new conversations start with { agentPreset } on the app's start.
// client.js is a browser bundle, so its plain helpers are cut out of the source and run here alone.
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

function functionText(name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `client.js has no function ${name}`);
  let depth = 0;
  const open = source.indexOf(') {', start) + 2;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && (depth -= 1) === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
}

/** The helpers, with a stand-in fetch that answers as the Modes add-on's route does (or fails, or is slow). */
function load(answer, { delayMs = 0, fail = false } = {}) {
  const calls = { fetch: 0, started: [] };
  const fetch = async () => {
    calls.fetch += 1;
    // The answer as it was when asked (a later change of `answer` is a later answer).
    const asked = typeof answer === 'function' ? answer() : answer;
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (fail) throw new Error('not reachable');
    return { ok: true, json: async () => asked };
  };
  const document = { baseURI: 'http://localhost/' };
  const parts = new Function('fetch', 'document', `
    const PRESET_ROUTE = 'dsh-modes/preset';
    const presetCache = { at: 0, value: null, pending: null, gen: 0 };
    // Item 4A, stage 6a: lockedPresetIn reads the space rows only with spaces on (space-6a.test.mjs covers that).
    const spaceMode = { on: false };
    ${functionText('forgetPresetTable')}
    ${functionText('presetTable')}
    ${functionText('lockedPresetIn')}
    ${functionText('anyTabPresetIn')}
    ${functionText('withTabPreset')}
    ${functionText('startLocked')}
    return { presetTable, forgetPresetTable, lockedPresetIn, anyTabPresetIn, withTabPreset, startLocked, presetCache };
  `)(fetch, document);
  const appCtx = { uiWorkspace: { startSession: (workspaceId, options) => calls.started.push([workspaceId, options]) } };
  return { ...parts, calls, appCtx };
}

const ROUTE = {
  tabs: [
    { id: 'recon', lock: 'standard' },
    { id: 'bench', lock: 'standard' },
    { id: 'automations', lock: 'standard' },
    { id: 'creator-plus', lock: 'creator' },
    { id: 'chat', lock: 'any' },
    { id: 'mine', lock: 'standard' },
  ],
  presets: { standard: true, creator: true },
};

test('a locked tab names its preset; Creator is the app\'s preset cordis; Any names none', () => {
  const { lockedPresetIn } = load(ROUTE);
  assert.equal(lockedPresetIn(ROUTE, 'recon'), 'standard');
  assert.equal(lockedPresetIn(ROUTE, 'bench'), 'standard');
  assert.equal(lockedPresetIn(ROUTE, 'automations'), 'standard');
  assert.equal(lockedPresetIn(ROUTE, 'creator-plus'), 'cordis');
  assert.equal(lockedPresetIn(ROUTE, 'mine'), 'standard', 'your own mode, locked in Settings');
  assert.equal(lockedPresetIn(ROUTE, 'chat'), '');
  assert.equal(lockedPresetIn(ROUTE, 'unknown'), '');
  assert.equal(lockedPresetIn(null, 'recon'), '', 'Modes cannot say: nothing is forced here');
});

test('a preset the app does not have, or cannot name, is not passed (the start would fail)', () => {
  const { lockedPresetIn } = load(ROUTE);
  assert.equal(lockedPresetIn({ ...ROUTE, presets: { standard: true, creator: false } }, 'creator-plus'), '');
  assert.equal(lockedPresetIn({ ...ROUTE, presets: { standard: null, creator: true } }, 'recon'), '');
});

test('the start carries { agentPreset } for a locked tab and keeps the other options', async () => {
  const { withTabPreset, startLocked, calls, appCtx } = load(ROUTE);
  assert.deepEqual(await withTabPreset('recon', { prompt: 'hi', whenDraftExists: 'replace' }), { prompt: 'hi', whenDraftExists: 'replace', agentPreset: 'standard' });
  assert.deepEqual(await withTabPreset('creator-plus'), { agentPreset: 'cordis' });
  assert.equal(await withTabPreset('chat'), undefined, 'Any: the options as they were');
  startLocked(appCtx, 'bench', 'w1', { prompt: 'x' });
  startLocked(appCtx, 'chat', 'w2');
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(calls.started, [['w1', { prompt: 'x', agentPreset: 'standard' }], ['w2', undefined]]);
  assert.equal(calls.fetch, 1, 'one answer is kept for a few seconds');
});

test('an answer asked before the setting changed is not kept: the next start reads the new lock (review)', async () => {
  let route = ROUTE;
  const parts = load(() => route, { delayMs: 30 });
  const early = parts.presetTable(4000, 1000);
  // The owner sets Recon to Any while that answer is on its way.
  route = { ...ROUTE, tabs: ROUTE.tabs.map((tab) => (tab.id === 'recon' ? { ...tab, lock: 'any' } : tab)) };
  parts.forgetPresetTable();
  assert.equal(await early, null, 'the old answer is dropped');
  assert.equal(parts.presetCache.value, null);
  assert.equal(await parts.withTabPreset('recon'), undefined, 'the next start reads Any, not the old Standard lock');
  assert.equal(parts.calls.fetch, 2);
});

test('no answer in time, or no Modes route: the start goes ahead as usual (Modes\' backstop takes over)', async () => {
  const slow = load(ROUTE, { delayMs: 200 });
  const started = Date.now();
  const table = await slow.presetTable(4000, 20);
  assert.equal(table, null);
  assert.ok(Date.now() - started < 150, 'a start never waits long');
  const failing = load(ROUTE, { fail: true });
  assert.equal(await failing.withTabPreset('recon', { prompt: 'a' }).then((value) => value.agentPreset), undefined);
});

test('every way a tab starts a conversation goes through the lock', () => {
  const startNew = functionText('startNew');
  assert.match(startNew, /startLocked\(appCtx, tabId,/);
  assert.match(startNew, /startInScratch\(appCtx, library, undefined, tabId\)/);
  assert.match(functionText('startInRoom'), /await withTabPreset\(tabId, options\)/, 'Recon\'s room, its chips and reopening it');
  assert.match(functionText('startInScratch'), /withTabPreset\(tabId, options\)/);
  // Nothing calls the app's start directly any more, apart from the three helpers that add the preset.
  const direct = source.split('\n').filter((line) => /(?:uiWorkspace|uw\??)\.startSession\??\.?\(/.test(line));
  assert.equal(direct.length, 3, direct.join('\n'));
  assert.match(source, /patch\.presetLock = typeof modesNs\.value\?\.presetLock === 'string'/, 'a changed setting is read again');
});

test('a conversation moved out of Recon into a locked tab is made in that tab\'s preset', () => {
  const move = functionText('moveOutOfRecon');
  assert.match(move, /lockedPresetIn\(await presetTable\(\), tabId\)/);
  // Fix round (item 4A): in its project when there is one (`where` = { workspaceId }), else its folder.
  assert.match(move, /preset \? await sessions\.create\(\{ \.\.\.where, agentPreset: preset \}\) : await sessions\.create\(where\)/);
});

test('an Any tab starts on the app\'s default preset, so a blank another tab left on Creator or PTC is not reused', async () => {
  const table = { ...ROUTE, defaultPreset: 'standard' };
  const { withTabPreset, anyTabPresetIn } = load(table);
  assert.deepEqual(await withTabPreset('chat', { prompt: 'hi' }), { prompt: 'hi', agentPreset: 'standard' });
  assert.deepEqual(await withTabPreset('creator-plus'), { agentPreset: 'cordis' }, 'a locked tab keeps its lock');
  assert.equal(anyTabPresetIn(table, 'recon'), '', 'only Any tabs');
  assert.equal(anyTabPresetIn({ ...ROUTE, defaultPreset: '' }, 'chat'), '', 'Modes cannot name it: nothing is passed');
  assert.equal(anyTabPresetIn({ ...ROUTE, defaultPreset: 'bad id!' }, 'chat'), '');
  assert.equal(anyTabPresetIn(table, 'unknown'), '');
});

test('Chat without a default workspace chooses as the other tabs do, never Recon\'s room', () => {
  const home = functionText('homeFor');
  assert.match(home, /const chatHome = tabId === 'chat' \? defaultWorkspace\(lib\?\.workspaces\) : null;/);
  assert.match(home, /if \(chatHome\) return chatHome;/);
});
