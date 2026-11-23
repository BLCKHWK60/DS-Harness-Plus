// Item 4A, fix round after the review of stages 2 to 5 (22 November 2026). With spaces live and the Cowork sidebar on:
// a draft nobody has claimed never takes the stale `defaultMode` (its space's start mode instead, or the mode it has
// where that space offers it); Recon's room only ever gives a sealed Recon thread; the window's tab is no hint when a
// space is named; a reused draft follows the space it is shown in and a New drops a pick; a scheduled first message
// keeps a stored mode and space; the Mode list names the current mode and says which add-on a guarded space needs; a
// mid-thread pick keeps the preset.
import assert from 'node:assert/strict';
import test from 'node:test';
import { ROOM_ONLY_RECON } from '../index.js';
import { modePickRefusal, spaceMovePlan } from '../lib/spaces.js';

process.env.DSH_MODES_PRESET_SETTLE_MS = '0';
const { boot, makeWorld, settle } = await import('./app.mjs');

const ROOM = '/tmp/dsh-recon-test-room';
const EXTRA = {
  research: { label: 'Research', tools: 'all', sandbox: 'inherit', prompt: 'Research.' },
  finance: { label: 'Finance', tools: 'all', sandbox: 'inherit', prompt: 'Finance.' },
  recon: { label: 'Recon', tools: ['recon_cite'], sandbox: 'read-only', isolated: true, prompt: 'Recon.' },
  bench: { label: 'Devices', tools: ['bench_read'], sandbox: 'read-only', prompt: 'Devices.' },
  automations: { label: 'Automations', tools: ['schedule_list'], sandbox: 'read-only', prompt: 'Automations.' },
  'creator-plus': { label: 'Creator Plus', tools: ['creator_map'], sandbox: 'workspace-write', prompt: 'Creator Plus.' },
};
/** Recon's service as Modes asks it: is this folder the room? */
const recon = { isRoom: (path) => path === ROOM || String(path).startsWith(`${ROOM}/`) };
const json = (value) => JSON.parse((typeof value === 'string' ? value : value?.get?.()) || '{}');

/** Modes with the Cowork sidebar on (spaces are live by default since stage 3a). */
function app({ extra = EXTRA, services = { recon }, presets, ...fields } = {}) {
  const world = makeWorld({ extraModes: JSON.stringify(extra), ...fields });
  return boot(world, { tabs: true, known: ['read', 'recon_cite', 'bench_read', 'creator_map', 'schedule_list'], services: { ...services, ...(presets ? { agentPresets: presets } : {}) } });
}

test('a Recon-room draft sent before any claim runs sealed in Recon, whatever defaultMode says (review: high)', async () => {
  const run = app({ defaultMode: 'cowork' });
  const { agent } = await run.open('room-1', { header: { cwd: ROOM } });
  assert.equal(run.service().get('room-1'), 'recon');
  assert.equal(run.service().spaces.of('room-1'), 'recon');
  await run.firstTurn(agent);
  await settle();
  assert.equal(json(run.config.sessionModes)['room-1'], 'recon');
  assert.equal(json(run.config.sessionSpaces)['room-1'], 'recon');
  assert.equal(json(run.config.sessionIsolated)['room-1'], true, 'sealed for good');
});

test('a Chat draft with a stale defaultMode of recon runs in Plain chat, unsealed, in Chat (review: high)', async () => {
  const run = app({ defaultMode: 'recon' });
  const { agent } = await run.open('chat-1', { header: { cwd: '/Users/me/Documents/deepseek-harness/default-workspace' } });
  assert.equal(run.service().get('chat-1'), 'plain');
  await run.firstTurn(agent);
  await settle();
  assert.equal(json(run.config.sessionModes)['chat-1'], 'plain');
  assert.equal(json(run.config.sessionSpaces)['chat-1'], 'chat');
  assert.equal(json(run.config.sessionIsolated)['chat-1'], undefined, 'never sealed');
  // A project folder that is not the default workspace: Code's start mode.
  const { agent: other } = await run.open('code-1', { header: { cwd: '/Users/me/src/app' } });
  assert.equal(run.service().get('code-1'), 'code');
  await run.firstTurn(other);
  await settle();
  assert.equal(json(run.config.sessionSpaces)['code-1'], 'code');
});

test('an unclaimed draft keeps its stored Recon mode and space (a restart), with defaultMode cowork', async () => {
  const run = app({ defaultMode: 'cowork', sessionModes: JSON.stringify({ r2: 'recon' }), sessionSpaces: JSON.stringify({ r2: 'recon' }) });
  const { agent } = await run.open('r2', { source: 'resume', header: { cwd: ROOM } });
  assert.equal(run.service().get('r2'), 'recon');
  await run.firstTurn(agent);
  await settle();
  assert.equal(json(run.config.sessionModes).r2, 'recon', 'the forced record is what it ran in');
  assert.equal(json(run.config.sessionSpaces).r2, 'recon');
});

test('upgrade: a blank Workshop draft hit by a scheduled first message keeps Creator Plus and Workshop', async () => {
  const run = app({ defaultMode: 'cowork', scheduledMode: 'cowork', sessionModes: JSON.stringify({ w1: 'creator-plus' }), sessionSpaces: JSON.stringify({ w1: 'workshop' }) });
  const { agent } = await run.open('w1', { source: 'resume', header: { cwd: '/Users/me/src/plugins' } });
  const reminder = { type: 'agent/inbox/spliced', data: { inserted: [{ source: { kind: 'schedule' }, content: [{ type: 'text', text: 'Daily lab run' }] }] } };
  await run.emit('session/event', { id: 'w1' }, reminder);
  await settle();
  assert.equal(run.service().get('w1'), 'creator-plus');
  await run.firstTurn(agent);
  await settle();
  assert.equal(json(run.config.sessionModes).w1, 'creator-plus');
  assert.equal(json(run.config.sessionSpaces).w1, 'workshop', 'a thread never changes space by itself');
});

test("Settings → Spaces' start mode wins over the window's tab: {space: code, tab: code} starts in Finance", async () => {
  const run = app({ modeSpaces: JSON.stringify({ finance: ['chat', 'code'] }), spaceSettings: JSON.stringify({ code: { startMode: 'finance' } }) });
  await run.open('c1', { header: { cwd: '/Users/me/src/app' } });
  const started = await run.service().spaces.startDraft('c1', { space: 'code', tab: 'code' });
  assert.deepEqual(started, { claimed: true, mode: 'finance', space: 'code' });
  // The chat box asking second (with the same space) changes nothing.
  assert.deepEqual(await run.service().spaces.startDraft('c1', { space: 'code', tab: 'code' }), { claimed: false });
  assert.equal(run.service().get('c1'), 'finance');
});

test('a draft whose mode was picked follows the space it is shown in; a New drops the pick (review and lab: high)', async () => {
  const run = app();
  const spaces = run.service().spaces;
  const { agent } = await run.open('d1', { header: { cwd: '/Users/me/Documents/deepseek-harness/default-workspace' } });
  await spaces.startDraft('d1', { space: 'chat' });
  await spaces.pick('d1', 'finance');
  // The app reuses the same blank draft for Code: Code does not offer Finance, so Code's start mode.
  assert.deepEqual(await spaces.startDraft('d1', { space: 'code' }), { claimed: true, mode: 'code', space: 'code' });
  assert.equal(spaces.of('d1'), 'code');
  assert.deepEqual(spaces.view('d1').modes.map((row) => row.id), ['plain', 'code', 'research']);
  // Back in Chat: the pick comes back.
  assert.deepEqual(await spaces.startDraft('d1', { space: 'chat' }), { claimed: true, mode: 'finance', space: 'chat' });
  // Research is offered in both: it stays when the draft moves to Code.
  await spaces.pick('d1', 'research');
  assert.equal((await spaces.startDraft('d1', { space: 'code' })).mode, 'research');
  // A New click: the space's start mode, the pick forgotten.
  assert.deepEqual(await spaces.startDraft('d1', { space: 'code', reset: true }), { claimed: true, mode: 'code', space: 'code' });
  assert.deepEqual(await spaces.startDraft('d1', { space: 'chat' }), { claimed: true, mode: 'plain', space: 'chat' });
  await run.firstTurn(agent);
  await settle();
  assert.equal(json(run.config.sessionSpaces).d1, 'chat', 'recorded where it was shown last');
  assert.equal(json(run.config.sessionModes).d1, 'plain');
  // Another add-on's claim (a Finance brief) is still left alone.
  await run.open('brief');
  await run.service().set('brief', 'finance', { claim: true });
  assert.deepEqual(await spaces.startDraft('brief', { space: 'code' }), { claimed: false });
  assert.deepEqual(await spaces.startDraft('nobody', { space: 'chat' }), { claimed: false, missing: true }, 'Recon\'s door retries on this');
});

test("Recon's room: start, pick, move and set cannot make a room draft anything but sealed Recon (review: safety)", async () => {
  const run = app();
  const spaces = run.service().spaces;
  await run.open('room-2', { header: { cwd: `${ROOM}/run-1` } });
  assert.deepEqual(await spaces.startDraft('room-2', { space: 'chat' }), { claimed: true, mode: 'recon', space: 'recon' }, 'the window said Chat; the folder says Recon');
  await assert.rejects(spaces.pick('room-2', 'plain'), /is not offered in Recon/);
  await assert.rejects(spaces.move(['room-2'], 'chat'), (error) => error.message === "This new thread is in Recon's room, so it stays in Recon. To work elsewhere, start a new thread in the other space.");
  // Stage 6a: a room draft takes any mode Recon offers (sealed); Plain chat is not ticked for Recon here.
  await assert.rejects(run.service().set('room-2', 'plain', { claim: true }), (error) => error.message === "This new thread is in Recon's room, so it can only use a mode Recon offers. Pick one from the Mode list, or start a new thread in another space.");
  void ROOM_ONLY_RECON;
  assert.equal(run.service().get('room-2'), 'recon');
  // Outside the room, Recon is never given: stage 6a (I9) refuses with a sentence.
  await run.open('out-1', { header: { cwd: '/Users/me/src/app' } });
  await assert.rejects(spaces.startDraft('out-1', { space: 'recon' }), (error) => error.message === "Recon threads work only in Recon's room, and this thread's folder is somewhere else. Start it with the New button in Recon: it opens in the room.");
  // Without Recon (or an older one) the window's space is trusted, as before.
  const bare = app({ services: {} });
  await bare.open('r3');
  assert.deepEqual(await bare.service().spaces.startDraft('r3', { space: 'recon' }), { claimed: true, mode: 'recon', space: 'recon' });
  assert.equal(spaceMovePlan({ to: 'chat', from: 'recon', current: 'recon', sealed: false, room: true, shown: ['chat'], offered: [], lang: 'zh' }).refusal, "This new thread is in Recon's room, so it stays in Recon. To work elsewhere, start a new thread in the other space.", 'English on a Chinese page');
});

test('a mode that is gone uses its space\'s start mode, never defaultMode; the Mode list says what to switch on (lab)', async () => {
  const { 'creator-plus': gone, ...rest } = EXTRA;
  void gone;
  const run = app({ extra: rest, defaultMode: 'recon', sessionModes: JSON.stringify({ old: 'creator-plus' }), sessionSpaces: JSON.stringify({ old: 'workshop' }) });
  await run.open('old', { source: 'resume', lastTurn: 2 });
  // Stage 6a (I16): a Workshop thread whose mode is gone, with Creator Plus off, has no tools (never Plain chat, never Recon).
  assert.equal(run.service().get('old'), 'isolated-locked', 'not Recon, not Plain chat');
  const view = run.service().spaces.view('old');
  assert.equal(view.space, 'workshop');
  // Fix round (6a review): a held thread is not "Sealed" (Recon's word); a thread that ran is not "new".
  assert.equal(view.currentLabel, 'No tools for now', 'a name, never an inner id');
  assert.equal(view.effective.held.text, 'This thread has no tools for now: the Creator Plus add-on is off. Switch it on in Settings → Creator Plus.');
  assert.deepEqual(view.needs, { space: 'workshop', section: 'creator-plus', addon: 'Creator Plus' });
  assert.deepEqual(view.modes, []);
});

test('the Mode list names a current mode its space no longer offers, and marks it (review: low)', async () => {
  const run = app({ modeSpaces: JSON.stringify({ finance: [] }), sessionModes: JSON.stringify({ t1: 'finance' }), sessionSpaces: JSON.stringify({ t1: 'chat' }) });
  await run.open('t1', { source: 'resume', lastTurn: 1 });
  const view = run.service().spaces.view('t1', 'zh');
  assert.equal(view.current, 'finance');
  // Stage 7: a Chinese page gets the English name (Plus is English only).
  assert.equal(view.currentLabel, 'Finance');
  assert.equal(run.service().spaces.view('t1', 'en').currentLabel, 'Finance');
  assert.equal(view.currentDesc, 'Money questions, briefs, your adviser setting.');
  assert.equal(view.currentOffered, false);
  assert.equal(view.needs, null);
});

test('refusals in a guarded space never suggest a tick that is greyed until stage 6a (lab)', () => {
  // Stage 6a: guarded spaces can be ticked now, so the usual sentence (with the tick) is given.
  const recon = [{ id: 'recon', greyed: false }];
  assert.equal(modePickRefusal({ space: 'recon', modeId: 'research', modeLabel: 'Research', offered: recon, known: true }), 'Research is not offered in Recon. Pick a mode from the list, or tick Recon for Research on Settings → Modes.');
  assert.equal(modePickRefusal({ space: 'workshop', modeId: 'research', modeLabel: 'Research', offered: [], known: true, lang: 'zh' }), 'Research is not offered in Workshop. Pick a mode from the list, or tick Workshop for Research on Settings → Modes.', 'English on a Chinese page');
  assert.match(modePickRefusal({ space: 'code', modeId: 'finance', modeLabel: 'Finance', offered: [], known: true }), /tick Code for Finance on Settings → Modes/, 'Chat and Code still can be ticked');
});

test('a mid-thread pick of a mode with its own lock keeps the thread\'s preset (A5)', async () => {
  const calls = [];
  const presets = {
    calls,
    list: async () => ['standard', 'ptc', 'cordis'].map((id) => ({ id })),
    presetForSession: (session) => session?.agentPreset ?? null,
    select: async (agent, id) => {
      if (agent.phase?.lastTurn > 0) throw Object.assign(new Error('This session has already started'), { code: 'agent-preset/locked' });
      calls.push([agent.id, id]);
      agent.session.agentPreset = id;
      return id;
    },
  };
  const run = app({ presets });
  const { agent } = await run.open('p1', { header: { cwd: '/Users/me/Documents/deepseek-harness/default-workspace' } });
  agent.session.agentPreset = 'ptc';
  await run.service().spaces.startDraft('p1', { space: 'chat' });
  await run.firstTurn(agent);
  await settle();
  agent.phase = { kind: 'idle', lastTurn: 1 };
  const before = calls.length;
  await run.service().spaces.pick('p1', 'automations');
  await settle();
  assert.equal(run.service().get('p1'), 'automations');
  assert.equal(agent.session.agentPreset, 'ptc', 'the preset is fixed when a thread starts');
  assert.equal(calls.length, before, 'no preset switch was asked for');
  const view = await run.service().presetView('p1');
  assert.equal(view.overridden ?? null, null, 'nothing was switched back');
});

// ---- the chat box and the Settings pages (client.js) ----------------------------------------------------------------
const { readFileSync } = await import('node:fs');
const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

test('the chat box claims with the window\'s space alone when it has one (review: Settings → Spaces start mode)', () => {
  assert.match(client, /value = await modeRoute\(appCtx, sessionId, space \? \{ action: 'start', space \} : \{ action: 'start', space, tab \}\)/);
});

test('the Mode button shows the mode\'s name, the current mode when not offered, and what to switch on', () => {
  assert.match(client, /const name = current\?\.label \?\? \(view\?\.currentLabel \|\| view\?\.current \|\| ''\);/);
  assert.match(client, /'data-mode-current': ''/);
  assert.match(client, /t\('mlist\.needs'\)\.replace\('\{0\}', view\.needs\.addon\)\.replace\('\{1\}', spaceName\)/);
  assert.match(client, /openModesPage\(appCtx, view\.needs\.section\)/);
  for (const [key, en] of [
    ['mlist.needs', 'Switch on {0} to use {1} threads.'],
    ['mlist.notoffered', 'Current mode, not offered in {0}. It stays until you pick another.'],
  ]) {
    assert.ok(client.includes(`'${key}': '${en}'`), key);
  }
  // The mode's name is the last label a narrow row hides (step 5 since round 2), so a new thread's mode shows at 1280 px.
  assert.match(client, /\.dsh-me-tools\[data-f5\] \.pair\[data-kind='mode'\] \.mname\{display:none\}/);
  assert.doesNotMatch(client, /\.dsh-me-tools\[data-f3\] \.pair\[data-kind='mode'\]/);
});

test('Settings → Spaces says its save errors in plain words and shows the note where the change was made', () => {
  for (const key of ['sp.save.noshell', 'sp.save.nomodes', 'sp.save.conflict']) assert.equal((client.match(new RegExp(`'${key.replace(/\./g, '\\.')}': '`, 'g')) ?? []).length, 1, key);
  assert.doesNotMatch(client, /dshKit\.fail\('The settings changed meanwhile/);
  assert.match(client, /setSaid\(\{ text: t\('sp\.saved'\), at \}\);/);
  assert.match(client, /noteAt\(one\.id\)\);/);
  assert.match(client, /shown: on \}\), one\.id\)/);
});

test('every new row has an (i): Open Modes, New threads start in, a mode card\'s Description', () => {
  assert.match(client, /h\(ui\.Row, \{ title: t\('sp\.modes'\), info: \{ title: t\('sp\.modes\.open'\), what: t\('sp\.modes\.i\.what'\)/);
  assert.match(client, /h\(SpRow, \{ title: t\('mt\.start'\), desc: t\('mt\.start\.hint'\), info: \{ title: t\('mt\.start'\), what: t\('mt\.start\.i\.what'\)/);
  assert.match(client, /h\('span', \{ className: 'dsh-me-desc-label' \}, t\('f\.desc'\), ' ', h\(spUi\(\)\.Info, \{ title: t\('f\.desc'\)/);
  for (const key of ['sp.modes.i.what', 'sp.modes.i.when', 'sp.modes.i.change', 'mt.start.i.what', 'mt.start.i.when', 'mt.start.i.change', 'f.desc.i.what', 'f.desc.i.when', 'f.desc.i.change']) {
    assert.equal((client.match(new RegExp(`'${key.replace(/\./g, '\\.')}': '`, 'g')) ?? []).length, 1, `${key}: once, English only`);
  }
});

test('skills are switched off per mode; the Lens note says a Lens is not a mode; Plain chat is in both lists', () => {
  assert.ok(client.includes("'skillsoff.group': 'Skills switched off per mode',"));
  assert.match(client, /'lens\.note': 'For this thread only\. .*A Lens is not a mode: it keeps the mode\\'s instructions and tools and only changes the wording\.'/);
  assert.equal((client.match(/Object\.entries\(ADDED_MODES\)\.filter\(\(\[id\]\) => !rows\.some\(\(row\) => row\.id === id\) && !extras\.some\(\(extra\) => extra\.id === id\)\)/g) ?? []).length, 2, 'scheduled tasks and starting values');
});

test('the quiet line sits below the turn\'s action row (lab: it read as part of the answer)', () => {
  assert.ok(client.includes("[data-turn-tail] > [data-slot='conversation.chat.turnTail']:has(> .dsh-me-modeline){display:contents}"));
  assert.ok(client.includes("[data-turn-tail] > [data-slot='conversation.chat.turnTail'] > .dsh-me-modeline{order:1}"));
});
