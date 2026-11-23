// Item 4A, stage 2 (22 November 2026): the Mode list in the chat box. Pure parts from lib/spaces.js, the route
// (lib/route.js modeHandler), and Modes whole on a stand-in app with the Cowork sidebar on and spaces live (the lab
// switch DSH_SPACES_LAB=1): a draft keeps the mode picked before its first message and the space it was opened in, a
// change after the first message leaves one quiet line and keeps Web, Depth and Lens, Recon refuses with a sentence,
// /mode works before the first message. With spaces not live nothing changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHANGES_MAX, GUARDED_REASON, SPACES_LIVE, draftStartMode, modeBlurb, modeList, modePickRefusal, noteModeChange, spacesLive, turnOfPhase } from '../lib/spaces.js';
import { modeHandler } from '../lib/route.js';
import { MODE_PATH } from '../index.js';
import { boot, makeWorld, settle } from './app.mjs';

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


const RESEARCH = { label: 'Research', tools: 'all', sandbox: 'inherit', prompt: 'Research method.' };
const RECON = { label: 'Recon', tools: ['recon_cite'], sandbox: 'inherit', prompt: 'Recon.', isolated: true };
const MINE = { label: 'Meeting notes', tools: 'all', sandbox: 'inherit', prompt: 'Notes.', description: 'Turns a call into short notes.' };
const MODES = [{ id: 'chat', label: 'Chat' }, { id: 'cowork', label: 'Cowork' }, { id: 'code', label: 'Code' }, { id: 'research', label: 'Research' }, { id: 'plain', label: 'Plain chat' }, { id: 'recon', label: 'Recon' }, { id: 'mine', label: 'Meeting notes', description: 'Turns a call into short notes.' }];

/** Run with spaces live (the lab switch), then put the environment back. */
async function live(run) {
  const before = process.env.DSH_SPACES_LAB;
  process.env.DSH_SPACES_LAB = '1';
  try {
    return await run();
  } finally {
    if (before === undefined) delete process.env.DSH_SPACES_LAB;
    else process.env.DSH_SPACES_LAB = before;
  }
}

/** Modes on the stand-in app with the Cowork sidebar; the selected tab is `defaultMode`. */
function app(defaultMode = 'cowork') {
  const world = makeWorld({ defaultMode, extraModes: JSON.stringify({ research: RESEARCH, recon: RECON, mine: MINE }) });
  return boot(world, { tabs: true, maxTabs: 5 });
}
/** A stored JSON field (an untouched default is still the settings' own wrapper). */
const json = (value) => JSON.parse((typeof value === 'string' ? value : value?.get?.()) || '{}');

test('the one switch: on in the code since stage 3a; only the lab variable set to 0 turns it off', () => {
  assert.equal(SPACES_LIVE, true, 'stage 3a turns it on');
  assert.equal(spacesLive({}), true);
  assert.equal(spacesLive({ DSH_SPACES_LAB: '0' }), false, 'the lab and the tests can check the old tab paths');
  assert.equal(spacesLive({ DSH_SPACES_LAB: '1' }), true);
});

test('the list of a space: only its ticked modes, Plain chat first, one line each in English and Chinese', () => {
  const chat = modeList('chat', MODES);
  assert.deepEqual(chat.map((row) => row.id), ['plain', 'chat', 'cowork', 'research', 'mine'], 'Code and Recon are not in Chat; Plain chat leads');
  assert.equal(chat[0].desc, 'No extra instructions. Uses the tools this space allows.');
  assert.equal(chat.find((row) => row.id === 'mine').desc, 'Turns a call into short notes.', "a mode's own description wins");
  assert.equal(modeList('chat', [{ id: 'other', label: 'Other' }])[0].desc, 'Your own mode.');
  assert.deepEqual(modeList('code', MODES).map((row) => row.id), ['plain', 'code', 'research']);
  assert.equal(modeList('chat', MODES, {}, 'zh').find((row) => row.id === 'research').desc, 'Looks things up and cites its sources.', 'a Chinese page gets English');
  assert.equal(modeBlurb('recon', 'zh-CN'), modeBlurb('recon', 'en'));
  assert.deepEqual(modeList('nowhere', MODES), []);
  for (const id of ['plain', 'chat', 'cowork', 'code', 'research', 'data', 'finance', 'scout', 'content', 'automations', 'bench', 'recon', 'creator-plus']) {
    assert.ok(modeBlurb(id, 'en') !== 'Your own mode.' && modeBlurb(id, 'zh') === modeBlurb(id, 'en'), `${id} has its own line, the same on a Chinese page`);
  }
});

test("a mode ticked into Recon by the owner shows greyed with the owner's words, not pickable", () => {
  const ticks = { research: ['chat', 'recon'] };
  // Stage 6a: greyed only while Recon's guard is not ready (off or too old), with what to switch on or update.
  const recon = modeList('recon', MODES, ticks, 'en', { ready: { recon: 'off' } });
  assert.deepEqual(recon.map((row) => [row.id, row.greyed]), [['recon', false], ['research', true]]);
  assert.equal(recon[1].reason, 'Needs Recon: switch it on in Settings → Recon.');
  assert.equal(modeList('recon', MODES, ticks, 'zh', { ready: { recon: 'old' } })[1].reason, 'Needs a newer Recon: update it in Settings → Recon.');
  const said = modePickRefusal({ space: 'recon', modeId: 'research', modeLabel: 'Research', offered: recon, known: true });
  assert.equal(said, 'Research cannot be used in Recon now. Needs Recon: switch it on in Settings → Recon.');
  assert.deepEqual(modeList('recon', MODES, ticks, 'en', { ready: { recon: true } }).map((row) => [row.id, row.greyed]).sort(), [['recon', false], ['research', false]]);
  void GUARDED_REASON;
});

test("a new draft's start mode: what it has if offered, else its tab's, else the space's own, never a greyed one", () => {
  const chat = modeList('chat', MODES);
  assert.equal(draftStartMode({ space: 'chat', offered: chat }), 'plain', "Chat's start mode is Plain chat (stage 4)");
  assert.equal(draftStartMode({ space: 'chat', tab: 'research', offered: chat }), 'research', 'opened from the Research tab');
  assert.equal(draftStartMode({ space: 'chat', stored: 'mine', tab: 'research', offered: chat }), 'mine', 'a pick made before a restart stays');
  assert.equal(draftStartMode({ space: 'code', stored: 'mine', offered: modeList('code', MODES) }), 'code', 'a mode the space does not offer is not kept');
  assert.equal(draftStartMode({ space: 'chat', offered: chat, spaceSettings: { chat: { startMode: 'cowork' } } }), 'cowork', "the owner's start mode for the space");
  const greyed = [{ id: 'recon', greyed: true }, { id: 'research', greyed: false }];
  assert.equal(draftStartMode({ space: 'recon', stored: 'recon', offered: greyed }), 'research');
  assert.equal(draftStartMode({ space: 'recon', offered: [] }), undefined);
});

test('refusals are sentences that say what to do next (English, also on a Chinese page)', () => {
  const chat = modeList('chat', MODES);
  assert.equal(modePickRefusal({ space: 'chat', modeId: 'research', offered: chat, known: true }), '');
  assert.match(modePickRefusal({ space: 'chat', modeId: 'nope', offered: chat, known: false }), /^There is no mode "nope"\. Pick one from the Mode list/);
  assert.equal(modePickRefusal({ space: 'chat', modeId: 'code', modeLabel: 'Code', offered: chat, known: true }), 'Code is not offered in Chat. Pick a mode from the list, or tick Chat for Code on Settings → Modes.');
  assert.equal(modePickRefusal({ space: 'chat', modeId: 'code', modeLabel: 'Code', offered: chat, known: true, lang: 'zh' }), 'Code is not offered in Chat. Pick a mode from the list, or tick Chat for Code on Settings → Modes.', 'a Chinese page gets English');
  assert.match(modePickRefusal({ space: 'chat', modeId: 'research', offered: chat, known: true, sealedRefusal: 'modes: a sealed thread cannot change its mode in place.' }), /^This thread is sealed \(it ran in Recon\)/);
  assert.match(modePickRefusal({ space: 'chat', modeId: 'research', offered: chat, known: true, sealedRefusal: 'modes: a thread that has already run cannot become sealed.' }), /^A thread that has already run cannot become sealed/);
});

test('the quiet lines: one per turn, the last change wins, a change back takes the line away, at most CHANGES_MAX kept', () => {
  let list = noteModeChange([], { turn: 1, from: 'chat', to: 'research', at: 1 });
  assert.deepEqual(list, [{ turn: 1, from: 'chat', to: 'research', at: 1 }]);
  list = noteModeChange(list, { turn: 1, from: 'research', to: 'cowork', at: 2 });
  assert.deepEqual(list, [{ turn: 1, from: 'chat', to: 'cowork', at: 2 }], 'from stays where the turn ended');
  assert.deepEqual(noteModeChange(list, { turn: 1, from: 'cowork', to: 'chat', at: 3 }), [], 'back where it was: no line');
  list = noteModeChange(list, { turn: 3, from: 'cowork', to: 'chat', at: 4 });
  assert.equal(list.length, 2);
  assert.deepEqual(noteModeChange(list, { turn: 4, from: 'chat', to: 'chat', at: 5 }), list, 'no change, no line');
  let long = [];
  for (let turn = 1; turn <= CHANGES_MAX + 10; turn += 1) long = noteModeChange(long, { turn, from: 'a', to: 'b', at: turn });
  assert.equal(long.length, CHANGES_MAX);
  assert.equal(long[0].turn, 11, 'the oldest go first');
  assert.deepEqual(noteModeChange('broken', { turn: 1, from: 'a', to: 'b', at: 1 }), [{ turn: 1, from: 'a', to: 'b', at: 1 }]);
});

test('the turn a change shows after: the running one, else the last that ran', () => {
  assert.equal(turnOfPhase({ kind: 'running', turn: 3, lastTurn: 2 }), 3);
  assert.equal(turnOfPhase({ kind: 'running', lastTurn: 2 }), 3);
  assert.equal(turnOfPhase({ kind: 'idle', lastTurn: 2 }), 2);
  assert.equal(turnOfPhase(undefined), 0);
});

test('spaces not live: no list, no claim, the tab still decides a draft and /mode keeps its rule', () => tabsOnly(async () => {
  const run = app('research');
  const { agent } = await run.open('d1');
  const spaces = run.service().spaces;
  assert.equal(spaces.view('d1').shown, false);
  assert.deepEqual(await spaces.startDraft('d1', { tab: 'research' }), { claimed: false });
  const said = await run.command(agent, 'chat');
  assert.equal(said.kind, 'error', 'before the first message the selected tab decides (today)');
  await run.firstTurn(agent);
  await settle();
  assert.equal(json(run.config.sessionModes).d1, 'research');
  await run.service().set('d1', 'chat');
  await settle();
  assert.equal(json(run.config.sessionModeChanges).d1, undefined, 'no quiet line while spaces are not live');
}));

test('a new draft is claimed with its start mode, and a pick before the first message stands at the first message', () => live(async () => {
  const run = app('research');
  const { agent } = await run.open('d2');
  const spaces = run.service().spaces;
  const before = spaces.view('d2');
  assert.equal(before.shown, true);
  assert.equal(before.fresh, true);
  assert.equal(before.claimed, false);
  const started = await spaces.startDraft('d2', { tab: 'research' });
  assert.deepEqual(started, { claimed: true, mode: 'research', space: 'chat' });
  assert.deepEqual(await spaces.startDraft('d2', { tab: 'research' }), { claimed: false }, 'only once');
  await spaces.pick('d2', 'cowork');
  // The selected tab changes in the meantime: it no longer decides this draft.
  run.config.defaultMode = 'code';
  await run.firstTurn(agent);
  await settle();
  assert.equal(json(run.config.sessionModes).d2, 'cowork');
  assert.equal(json(run.config.sessionSpaces).d2, 'chat');
  assert.equal(json(run.config.sessionModeChanges).d2, undefined, 'a pick before the first message leaves no line');
}));

test('a draft opened in Code keeps Code when Research is picked (a thread never changes space)', () => live(async () => {
  const run = app('code');
  const { agent } = await run.open('d3');
  const spaces = run.service().spaces;
  await spaces.startDraft('d3', { tab: 'code' });
  assert.equal(spaces.of('d3'), 'code');
  assert.deepEqual(spaces.view('d3').modes.map((row) => row.id), ['plain', 'code', 'research'], 'Plain chat first: it is ticked for Code too');
  await spaces.pick('d3', 'research');
  await run.firstTurn(agent);
  await settle();
  assert.equal(json(run.config.sessionModes).d3, 'research');
  assert.equal(json(run.config.sessionSpaces).d3, 'code', 'recorded in the space it was opened in, not the mode\'s own');
  assert.equal(spaces.of('d3'), 'code');
  await assert.rejects(spaces.pick('d3', 'cowork'), /^Error: Cowork is not offered in Code\./);
}));

test('a change after the first message: one quiet line after that turn; Web, Depth and Lens stay', () => live(async () => {
  const run = app('cowork');
  const { agent } = await run.open('t1');
  const spaces = run.service().spaces;
  await spaces.startDraft('t1', { tab: 'cowork' });
  await run.firstTurn(agent);
  await settle();
  const kept = { sessionWeb: JSON.stringify({ t1: false }), sessionDepth: JSON.stringify({ t1: 'thorough' }), sessionLens: JSON.stringify({ t1: 'blunt' }) };
  Object.assign(run.config, kept);
  await spaces.pick('t1', 'research');
  await settle();
  assert.equal(json(run.config.sessionModes).t1, 'research');
  assert.deepEqual(json(run.config.sessionModeChanges).t1.map(({ turn, from, to }) => ({ turn, from, to })), [{ turn: 1, from: 'cowork', to: 'research' }]);
  for (const [field, value] of Object.entries(kept)) assert.equal(run.config[field], value, `${field} is not reset`);
  assert.equal(json(run.config.sessionSpaces).t1, 'chat', 'the space stays');
  assert.equal(spaces.view('t1').changes.length, 1);
  // Changed again after the same turn: still one line, with the latest mode.
  await spaces.pick('t1', 'chat');
  await settle();
  assert.deepEqual(json(run.config.sessionModeChanges).t1.map((row) => row.to), ['chat']);
}));

test('Recon: its list has Recon only, and a pick of another mode is refused with a sentence', () => live(async () => {
  const run = app('recon');
  const { agent } = await run.open('r1');
  const spaces = run.service().spaces;
  await spaces.startDraft('r1', { tab: 'recon' });
  assert.deepEqual(spaces.view('r1').modes.map((row) => row.id), ['recon']);
  await run.firstTurn(agent);
  await settle();
  // Stage 6a: Recon can be ticked for Research on Settings → Modes, so the sentence says so.
  await assert.rejects(spaces.pick('r1', 'research'), (error) => error.message === 'Research is not offered in Recon. Pick a mode from the list, or tick Recon for Research on Settings → Modes.');
  const said = await run.command(agent, 'research');
  assert.equal(said.kind, 'error');
  assert.match(said.text, /^Research is not offered in Recon\. /);
  assert.equal(json(run.config.sessionModes).r1, 'recon');
}));

test('/mode with spaces live: allowed before the first message, lists the space, takes a label too', () => live(async () => {
  const run = app('cowork');
  const { agent } = await run.open('c1');
  await run.service().spaces.startDraft('c1', { tab: 'cowork' });
  const listed = await run.command(agent, '');
  assert.equal(listed.kind, 'success');
  assert.match(listed.text, /^Mode: cowork \(space: chat\)/);
  assert.match(listed.text, /research: Research/);
  assert.doesNotMatch(listed.text, /code: Code/);
  const said = await run.command(agent, 'Meeting notes');
  // Fix round 2: on a draft it says "first message" (and the chat box shows it, the app shows no output there).
  assert.deepEqual(said, { kind: 'success', text: 'Mode changed to Meeting notes. It applies from your first message.' });
  await run.firstTurn(agent);
  await settle();
  assert.equal(json(run.config.sessionModes).c1, 'mine');
}));

/** A stand-in request and reply for the route. */
function call(handler, { method = 'GET', headers = {}, body } = {}) {
  const req = {
    method,
    headers,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body));
    },
  };
  const res = { statusCode: 200, headers: {}, body: '', setHeader(name, value) { this.headers[name] = value; }, end(text = '') { this.body = text; } };
  return handler(req, res).then(() => ({ status: res.statusCode, answer: res.body ? JSON.parse(res.body) : null }));
}

test('the route: sign-in first; GET the list, POST a pick or a start; a refusal is a sentence', async () => {
  assert.equal(MODE_PATH, '/dsh-modes/mode');
  const calls = [];
  const service = {
    view: (id, lang) => ({ id, lang }),
    pick: async (id, mode, options) => {
      calls.push(['pick', id, mode, options.lang]);
      if (mode === 'code') throw new Error('modes: Code is not offered in Chat.');
    },
    startDraft: async (id, where) => {
      calls.push(['start', id, where]);
      return { claimed: true };
    },
  };
  const open = { requestRejection: () => undefined };
  const handler = modeHandler({ spaces: () => service, connection: open });
  assert.equal((await call(modeHandler({ spaces: () => service, connection: { requestRejection: () => 401 } }))).status, 401);
  assert.equal((await call(handler, { method: 'PUT' })).status, 405);
  assert.deepEqual((await call(handler, { headers: { 'x-dsh-session': 's1', 'x-dsh-locale': 'zh-CN' } })).answer, { ok: true, value: { id: 's1', lang: 'en' } }, 'a Chinese page is answered in English');
  assert.deepEqual((await call(handler, { headers: { 'x-dsh-session': 'bad id!' } })).answer.value.id, '', 'an id that is not one is not passed on');
  assert.deepEqual((await call(handler, { method: 'POST', body: { action: 'pick', sessionId: 's1', modeId: 'research' } })).answer, { ok: true, value: { id: 's1', lang: 'en' } });
  assert.deepEqual((await call(handler, { method: 'POST', body: { action: 'pick', sessionId: 's1', modeId: 'code' } })).answer, { ok: false, error: 'Code is not offered in Chat.' });
  const started = await call(handler, { method: 'POST', body: { action: 'start', sessionId: 's1', space: 'code', tab: 'research' } });
  assert.deepEqual(started.answer.value.started, { claimed: true });
  assert.deepEqual(calls.at(-1), ['start', 's1', { space: 'code', tab: 'research', lang: 'en' }]);
  assert.equal((await call(handler, { method: 'POST', body: { action: 'pick' } })).answer.ok, false);
  assert.equal((await call(handler, { method: 'POST', body: { action: 'other', sessionId: 's1' } })).answer.error, 'There is no such action.');
  assert.equal((await call(modeHandler({ spaces: () => undefined, connection: open }))).answer.error, 'The Modes add-on is not running. Switch it on on the Plugins page, then reload this page.');
});

// ---- the chat box (client.js) -------------------------------------------------------------------------------------
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const cut = (name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} is in client.js`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && (depth -= 1) === 0) return source.slice(start, i + 1);
  }
  throw new Error(name);
};

test('the chat box: the line after a turn reads the last change recorded after it', () => {
  const modeChangeAt = new Function(`${cut('modeChangeAt')}; return modeChangeAt;`)();
  const list = [{ turn: 1, to: 'research' }, { turn: 2, to: '' }, { turn: 3, to: 'chat' }];
  assert.equal(modeChangeAt(list, 1).to, 'research');
  assert.equal(modeChangeAt(list, 2), undefined);
  assert.equal(modeChangeAt(list, 4), undefined);
  assert.equal(modeChangeAt('x', 1), undefined);
});

test('the chat box: every new word once, in English; the (i) says what a mode is in the owner\'s words', () => {
  const keys = [...source.matchAll(/'(mlist\.[\w.]+|mspace\.\w+)':/g)].map((match) => match[1]);
  assert.ok(keys.length >= 15);
  assert.deepEqual(keys, [...new Set(keys)], 'one dictionary: each key once');
  assert.ok(source.includes("'mlist.what': 'A mode is a set of instructions and tools. You can change it at any time; it applies from your next message.'"));
  assert.ok(source.includes("'mlist.changed': 'Mode changed to {0}'"));
  assert.match(source, /name: 'conversation\.chat\.turnTail', id: 'dsh-modes-change'/);
  assert.match(source, /modeShown \? h\(ModeButton/, 'the list sits first in the row, only while shown');
});
