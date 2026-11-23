// Item 4A, stage 5 (22 November 2026): Settings → Spaces and the space ticks on Settings → Modes. The pure parts from
// lib/spaces.js (a tick, a space's own settings, a description, the rows and cards the pages draw), the route's settings
// actions (lib/route.js modeHandler), Modes whole on the stand-in app (a tick written, the Mode list following it), the
// preset view's "Preset in this space" rows, and the page's own small helpers (client.js, between the sp-logic lines).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_TICKS, DESC_MAX, GUARDED_REASON, MODE_SPACE, SPACE_IDS, SPACE_SETTINGS_TEXT, SPACE_TAB, descriptionOf, modeList, modeRowsForPage, nextDescriptions,
  nextModeSpaces, nextSpaceSettings, spaceCards, spaceOrderFrom, spacesNow, spacesOfMode,
} from '../lib/spaces.js';
import { modeHandler } from '../lib/route.js';
import { boot, makeWorld, settle } from './app.mjs';

const MODES = [
  { id: 'chat', label: 'Chat' }, { id: 'cowork', label: 'Cowork' }, { id: 'code', label: 'Code' }, { id: 'plain', label: 'Plain chat', added: true },
  { id: 'research', label: 'Research', extra: true }, { id: 'data', label: 'Data', extra: true }, { id: 'finance', label: 'Finance', extra: true },
  { id: 'bench', label: 'Devices', extra: true }, { id: 'recon', label: 'Recon', extra: true }, { id: 'creator-plus', label: 'Creator Plus', extra: true },
  { id: 'mine', label: 'Meeting notes' },
];

test('a tick: Research into Code and back, Finance into Code, stored outside the add-ons\' own modes', () => {
  // Research is in Chat and Code by default: unticking Code stores the owner's choice.
  const off = nextModeSpaces({ modeSpaces: {}, modeId: 'research', space: 'code', on: false, modes: MODES });
  assert.equal(off.refusal, '');
  assert.deepEqual(off.next, { research: [{ space: 'chat', adjust: {} }] });
  assert.deepEqual(spacesOfMode('research', off.next), ['chat']);
  // Ticking it back gives the defaults: the entry goes, so a later change of the defaults still reaches it.
  const back = nextModeSpaces({ modeSpaces: off.next, modeId: 'research', space: 'code', on: true, modes: MODES });
  assert.deepEqual(back.next, {});
  const finance = nextModeSpaces({ modeSpaces: { mine: ['code'] }, modeId: 'finance', space: 'code', on: true, modes: MODES });
  assert.deepEqual(finance.next, { mine: ['code'], finance: [{ space: 'chat', adjust: {} }, { space: 'code', adjust: {} }] }, 'other entries stay as they are');
  // An adjustment kept for a space (Part B) survives a tick elsewhere.
  const kept = nextModeSpaces({ modeSpaces: { research: [{ space: 'chat', adjust: { web: 'on' } }, { space: 'code', adjust: {} }] }, modeId: 'research', space: 'code', on: false, modes: MODES });
  assert.deepEqual(kept.next, { research: [{ space: 'chat', adjust: { web: 'on' } }] });
  // Nothing to change: the same map back.
  assert.deepEqual(nextModeSpaces({ modeSpaces: {}, modeId: 'research', space: 'chat', on: true, modes: MODES }), { refusal: '', next: {} });
});

test('a tick is refused with a sentence: guarded modes, guarded spaces until stage 6a, the last mode of a space', () => {
  assert.equal(nextModeSpaces({ modeId: 'bench', modeLabel: 'Devices', space: 'chat', on: true, modes: MODES }).refusal, 'Devices stays in Devices: it carries that space\'s safety rules, so its ticks are fixed.');
  assert.match(nextModeSpaces({ modeId: 'recon', modeLabel: 'Recon', space: 'recon', on: false, modes: MODES }).refusal, /^Recon stays in Recon/);
  // Stage 6a: a guarded space takes a mode only while its guard is ready; the sentence says what to switch on or update.
  assert.equal(nextModeSpaces({ modeId: 'research', modeLabel: 'Research', space: 'recon', on: true, modes: MODES }).refusal, 'Research cannot be ticked for Recon now. Needs Recon: switch it on in Settings → Recon.');
  assert.equal(nextModeSpaces({ modeId: 'research', modeLabel: 'Research', space: 'workshop', on: true, modes: MODES, ready: { workshop: 'old' } }).refusal, 'Research cannot be ticked for Workshop now. Needs a newer Creator Plus: update it in Settings → Creator Plus.');
  assert.match(nextModeSpaces({ modeId: 'research', space: 'workshop', on: true, modes: MODES, lang: 'zh' }).refusal, /cannot be ticked for Workshop now/, 'English on a Chinese page');
  void GUARDED_REASON;
  assert.match(nextModeSpaces({ modeId: 'research', space: 'mars', on: true, modes: MODES }).refusal, /^There is no space "mars"/);
  assert.match(nextModeSpaces({ modeId: 'ghost', space: 'chat', on: true, modes: MODES }).refusal, /^There is no mode "ghost"/);
  // Code offers Plain chat, Code, Research and Data: the last one cannot go.
  let ticks = {};
  for (const id of ['plain', 'code', 'research']) ticks = nextModeSpaces({ modeSpaces: ticks, modeId: id, space: 'code', on: false, modes: MODES }).next;
  assert.deepEqual(spacesOfMode('data', ticks), ['chat', 'code']);
  const last = nextModeSpaces({ modeSpaces: ticks, modeId: 'data', modeLabel: 'Data', space: 'code', on: false, modes: MODES });
  assert.equal(last.refusal, 'Code must offer at least one mode. Tick another mode for Code first, then untick Data.');
  assert.equal(last.next, undefined, 'nothing to write');
});

test('a mode ticked for no space is offered nowhere; its threads keep it', () => {
  const none = nextModeSpaces({ modeSpaces: {}, modeId: 'mine', space: 'chat', on: false, modes: MODES });
  assert.deepEqual(none.next, { mine: [] });
  assert.deepEqual(spacesOfMode('mine', none.next), []);
  assert.ok(!modeList('chat', MODES, none.next).some((row) => row.id === 'mine'));
  // A hand edit with no real space in it still counts as no choice.
  assert.deepEqual(spacesOfMode('scout', { scout: ['mars'] }), ['chat']);
});

test('a space\'s own settings: Chat always shown, another hidden and shown again, a start mode it offers', () => {
  const offered = [{ id: 'plain' }, { id: 'code' }, { id: 'research' }, { id: 'data' }];
  assert.equal(nextSpaceSettings({ space: 'chat', patch: { shown: false } }).refusal, 'Chat is always shown: something has to be there. You can hide any other space.');
  const hidden = nextSpaceSettings({ spaceSettings: { recon: { shown: false } }, space: 'code', patch: { shown: false } });
  assert.deepEqual(hidden.next, { recon: { shown: false }, code: { shown: false } });
  assert.equal(spacesNow({ spaceSettings: hidden.next }).find((row) => row.id === 'code').shown, false);
  assert.deepEqual(nextSpaceSettings({ spaceSettings: hidden.next, space: 'code', patch: { shown: true } }).next, { recon: { shown: false } }, 'shown is the default: no entry');
  const research = nextSpaceSettings({ space: 'code', patch: { startMode: 'research' }, offered });
  assert.deepEqual(research.next, { code: { startMode: 'research' } });
  assert.deepEqual(nextSpaceSettings({ spaceSettings: research.next, space: 'code', patch: { startMode: 'code' }, offered }).next, {}, 'the usual start mode: no entry');
  assert.equal(nextSpaceSettings({ space: 'code', patch: { startMode: 'finance' }, offered, modeLabel: 'Finance' }).refusal, 'Finance is not offered in Code. Tick Code for Finance on Settings → Modes first, or pick a mode from this list.');
  assert.match(nextSpaceSettings({ space: 'nowhere', patch: { shown: true } }).refusal, /^There is no space/);
});

test('a description: one line, at most 160 characters; empty gives the usual line back', () => {
  assert.equal(DESC_MAX, 160);
  assert.deepEqual(nextDescriptions({}, 'research', '  Finds   sources\nand cites them. ').next, { research: 'Finds sources and cites them.' });
  assert.deepEqual(nextDescriptions({ research: 'x', data: 'y' }, 'research', '  ').next, { data: 'y' });
  assert.match(nextDescriptions({}, 'research', 'x'.repeat(161)).refusal, /at most 160 characters/);
  assert.match(nextDescriptions({}, 'research', 'x'.repeat(161), 'zh').refusal, /at most 160 characters/);
  assert.equal(descriptionOf('research', 'en', { descriptions: { research: 'Mine.' } }), 'Mine.');
  assert.equal(descriptionOf('research', 'en', { descriptions: {}, own: 'From the add-on.' }), 'From the add-on.');
  assert.equal(descriptionOf('research'), 'Looks things up and cites its sources.');
});

test('Settings → Modes rows: built in first (Plain chat first), add-ons, yours; five ticks each with the owner\'s words', () => {
  const rows = modeRowsForPage(MODES, { modeSpaces: { finance: ['chat', 'code'] }, descriptions: { finance: 'Money.' } });
  assert.deepEqual(rows.map((row) => row.id), ['plain', 'chat', 'cowork', 'code', 'research', 'data', 'finance', 'bench', 'recon', 'creator-plus', 'mine']);
  assert.deepEqual(rows.map((row) => row.kind), ['builtin', 'builtin', 'builtin', 'builtin', 'addon', 'addon', 'addon', 'addon', 'addon', 'addon', 'own']);
  const plain = rows[0];
  assert.deepEqual(plain.ticks.map((tick) => [tick.space, tick.on, tick.greyed]), [['chat', true, false], ['code', true, false], ['devices', false, true], ['recon', false, true], ['workshop', false, true]]);
  assert.equal(plain.ticks[3].reason, 'Needs Recon: switch it on in Settings → Recon.');
  // Stage 6a: with every guard ready the guarded ticks are open.
  const open = modeRowsForPage(MODES, { ready: { devices: true, recon: true, workshop: true } })[0];
  assert.ok(open.ticks.every((tick) => !tick.greyed));
  const finance = rows.find((row) => row.id === 'finance');
  assert.equal(finance.ticks.find((tick) => tick.space === 'code').on, true);
  assert.equal(finance.desc, 'Money.');
  assert.equal(finance.ownDesc, 'Money.');
  assert.equal(finance.usualDesc, 'Money questions, briefs, your adviser setting.');
  const bench = rows.find((row) => row.id === 'bench');
  assert.deepEqual(bench.ticks.map((tick) => [tick.space, tick.on, tick.fixed]), [['chat', false, false], ['code', false, false], ['devices', true, true], ['recon', false, false], ['workshop', false, false]]);
  assert.ok(bench.ticks.every((tick) => tick.greyed), 'a guarded mode\'s ticks are fixed');
  assert.equal(rows.find((row) => row.id === 'mine').desc, 'Your own mode.');
  assert.equal(modeRowsForPage(MODES, { lang: 'zh' })[0].desc, 'No extra instructions. Uses the tools this space allows.');
});

test('Settings → Spaces cards: shown, what each needs, the start mode and the modes it can start in', () => {
  const spaces = spacesNow({ modeIds: MODES.map((mode) => mode.id), spaceSettings: { code: { shown: false } } });
  const cards = spaceCards({ spaces, spaceSettings: { code: { shown: false, startMode: 'finance' } }, modes: MODES });
  assert.deepEqual(cards.map((card) => card.id), SPACE_IDS);
  const [chat, code, devices, recon, workshop] = cards;
  assert.equal(chat.canHide, false);
  assert.equal(chat.shown, true);
  assert.equal(chat.startMode, 'plain');
  assert.deepEqual(chat.offered.map((one) => one.id), ['chat', 'cowork', 'plain', 'research', 'data', 'finance', 'mine']);
  assert.equal(code.shown, false);
  // Finance is not ticked for Code: the card says the usual one is used instead.
  assert.equal(code.startMode, 'code');
  assert.equal(code.startModeGone, 'finance');
  assert.equal(code.startModeGoneOff, false, 'listed but not ticked: tick it (not "switch the add-on on")');
  assert.equal(devices.requires, 'needs Devices');
  assert.equal(devices.startMode, 'bench');
  assert.deepEqual(recon.offered.map((one) => one.id), ['recon']);
  assert.equal(workshop.requires, 'needs Creator Plus or Tuner Plus');
  assert.equal(workshop.off, '');
  // Without the Devices mode, its card says why it is not shown and that the choices are kept.
  const without = spaceCards({ spaces: spacesNow({ modeIds: ['chat', 'code'] }), modes: MODES.filter((mode) => mode.id !== 'bench') });
  assert.match(without[2].off, /^The Devices add-on is off/);
  assert.equal(spaceCards({ spaces, modes: MODES, lang: 'zh' })[0].label, 'Chat');
});

test('the settings pages have one English table (stage 7: no Chinese twins)', () => {
  assert.deepEqual(Object.keys(SPACE_SETTINGS_TEXT), ['en']);
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const from = source.indexOf('      en: {', source.indexOf('const DICT = {'));
  const en = new Set([...source.slice(from, source.indexOf('\n      },', from)).matchAll(/^\s+'((?:sp|mt)\.[\w.]+|head\.hint\.spaces|f\.desc(?:\.hint)?)':/gm)].map((match) => match[1]));
  assert.ok(en.size > 80, `the page's words: ${en.size}`);
  assert.equal(source.indexOf('      zh: {', source.indexOf('const DICT = {')), -1, 'no Chinese dictionary');
});

/** A stand-in request and reply for the route. */
function call(handler, { method = 'GET', headers = {}, body } = {}) {
  const req = { method, headers, async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)); } };
  const res = { statusCode: 200, headers: {}, body: '', setHeader(name, value) { this.headers[name] = value; }, end(text = '') { this.body = text; } };
  return handler(req, res).then(() => ({ status: res.statusCode, answer: res.body ? JSON.parse(res.body) : null }));
}

test('the route: the settings page on GET with x-dsh-page, and tick, space and describe without a thread', async () => {
  const calls = [];
  const service = {
    view: () => ({ list: true }),
    page: (lang) => ({ page: true, lang }),
    setTick: async (modeId, space, on, options) => { calls.push(['tick', modeId, space, on, options.lang]); if (space === 'recon') throw new Error('Research cannot be ticked for Recon yet.'); return { cards: [] }; },
    setSpace: async (space, patch) => { calls.push(['space', space, patch]); return { cards: [] }; },
    describe: async (modeId, text) => { calls.push(['describe', modeId, text]); return { cards: [] }; },
  };
  const handler = modeHandler({ spaces: () => service, connection: { requestRejection: () => undefined } });
  assert.deepEqual((await call(handler, { headers: { 'x-dsh-page': 'settings', 'x-dsh-locale': 'zh-CN' } })).answer, { ok: true, value: { page: true, lang: 'en' } }, 'a Chinese page is answered in English');
  assert.deepEqual((await call(handler, {})).answer.value, { list: true }, 'without the header: the Mode list, as before');
  assert.equal((await call(handler, { method: 'POST', body: { action: 'tick', modeId: 'research', space: 'code', on: true } })).answer.ok, true);
  const refused = await call(handler, { method: 'POST', body: { action: 'tick', modeId: 'research', space: 'recon', on: true } });
  assert.deepEqual(refused.answer, { ok: false, error: 'Research cannot be ticked for Recon yet.' });
  await call(handler, { method: 'POST', body: { action: 'space', space: 'code', shown: false, startMode: 'research', other: 1 } });
  await call(handler, { method: 'POST', body: { action: 'describe', modeId: 'research', text: 'Mine.' } });
  assert.deepEqual(calls, [['tick', 'research', 'code', true, 'en'], ['tick', 'research', 'recon', true, 'en'], ['space', 'code', { shown: false, startMode: 'research' }], ['describe', 'research', 'Mine.']]);
  assert.equal((await call(modeHandler({ spaces: () => service, connection: { requestRejection: () => 401 } }), { method: 'POST', body: { action: 'tick' } })).status, 401, 'sign-in first');
});

const RESEARCH = { label: 'Research', tools: 'all', sandbox: 'inherit', prompt: 'Research method.' };
const json = (value) => JSON.parse((typeof value === 'string' ? value : value?.get?.()) || '{}');

test('Modes whole: a tick and a hidden space are written, refusals write nothing, the Mode list follows', async () => {
  const run = boot(makeWorld({ defaultMode: 'cowork', extraModes: JSON.stringify({ research: RESEARCH }) }), { tabs: true, maxTabs: 5 });
  await settle();
  const spaces = run.service().spaces;
  const page = spaces.page('en');
  assert.equal(page.live, true);
  assert.ok(page.modes.some((row) => row.id === 'research' && row.kind === 'addon'));
  const after = await spaces.setTick('research', 'code', false);
  assert.deepEqual(json(run.config.modeSpaces), { research: [{ space: 'chat', adjust: {} }] });
  assert.equal(after.modes.find((row) => row.id === 'research').ticks.find((tick) => tick.space === 'code').on, false, 'the answer shows the change at once');
  await settle();
  assert.ok(!spaces.modesIn('code').some((row) => row.id === 'research'), 'Code\'s Mode list no longer offers Research');
  await assert.rejects(spaces.setTick('research', 'recon', true), /cannot be ticked for Recon now/);
  assert.deepEqual(json(run.config.modeSpaces), { research: [{ space: 'chat', adjust: {} }] }, 'nothing written');
  await spaces.setSpace('code', { shown: false });
  assert.deepEqual(json(run.config.spaceSettings), { code: { shown: false } });
  await assert.rejects(spaces.setSpace('chat', { shown: false }), /Chat is always shown/);
  await spaces.describe('research', 'Finds and cites.');
  assert.deepEqual(json(run.config.modeDescriptions), { research: 'Finds and cites.' });
  await settle();
  assert.equal(spaces.view('', 'en').modes.find((row) => row.id === 'research')?.desc, 'Finds and cites.', 'the Mode list shows your line');
  await assert.rejects(spaces.describe('ghost', 'x'), /There is no mode "ghost"/);
  run.stop();
});

test('the preset view: "Preset in this space" rows from today\'s keys, and the Automations mode\'s own lock', async () => {
  const routes = new Map();
  const webServer = { register: (spec) => { routes.set(spec.path, spec.handler); return () => routes.delete(spec.path); } };
  const extra = { recon: { label: 'Recon', tools: ['recon_cite'], sandbox: 'inherit', prompt: 'Recon.', isolated: true }, automations: { label: 'Automations', tools: 'all', sandbox: 'inherit', prompt: 'A.' }, research: RESEARCH };
  boot(makeWorld({ extraModes: JSON.stringify(extra), presetLock: JSON.stringify({ code: 'standard', research: 'standard' }) }), { tabs: true, services: { webServer, connection: { requestRejection: () => undefined } } });
  await settle();
  const answer = await new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(body) { resolve(JSON.parse(body)); } };
    void routes.get('/dsh-modes/preset')({ method: 'GET', headers: {} }, res);
  });
  assert.deepEqual(answer.spaces.map((row) => [row.space, row.id, row.lock, row.defaultLock]), [['chat', 'chat', 'any', 'any'], ['code', 'code', 'standard', 'any'], ['recon', 'recon', 'standard', 'standard'], ['devices', 'bench', 'standard', 'standard'], ['workshop', 'creator-plus', 'creator', 'creator']]);
  assert.match(answer.spaces.find((row) => row.space === 'recon').warn, /^Unsafe\./, 'the same warnings as the former tab rows');
  assert.deepEqual(answer.modeLocks.map((row) => row.id), ['automations', 'research'], 'Automations always, and any mode with a saved lock');
  assert.equal(answer.where, 'Settings → Spaces → Preset in this space');
});

test('the page\'s own copies match Modes\' maps (client.js, between the sp-logic lines)', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('// ---- sp-logic:begin ----'), source.indexOf('// ---- sp-logic:end ----'));
  const logic = new Function(`${block}\nreturn { SP_IDS, SP_TAB, SP_OF_TAB, spOrder, spMove, spPlace, spNextPlaces };`)();
  assert.deepEqual(logic.SP_IDS, [...SPACE_IDS]);
  assert.deepEqual(logic.SP_TAB, { ...SPACE_TAB });
  assert.deepEqual(logic.SP_OF_TAB, { ...MODE_SPACE });
  for (const order of [[], ['code', 'cowork', 'recon'], ['bench', 'mine', 'chat']]) assert.deepEqual(logic.spOrder([], order), spaceOrderFrom(order), String(order));
  assert.deepEqual(logic.spOrder(['recon', 'chat'], ['code']), ['recon', 'chat', 'code', 'devices', 'workshop'], 'your own order first');
  assert.deepEqual(logic.spMove(['chat', 'code', 'devices'], 'code', -1), ['code', 'chat', 'devices']);
  assert.deepEqual(logic.spMove(['chat', 'code'], 'chat', -1), ['chat', 'code'], 'the first stays first');
  assert.equal(logic.spPlace('', 'chat'), 'scratch');
  assert.equal(logic.spPlace('', 'devices'), 'folder');
  assert.equal(logic.spPlace('{"recon":"folder"}', 'recon'), 'room', 'Recon always starts in its room');
  assert.equal(logic.spPlace('{"creator-plus":"scratch"}', 'workshop'), 'scratch');
  assert.deepEqual(JSON.parse(logic.spNextPlaces('{"finance":"folder"}', 'chat', 'folder')), { finance: 'folder', chat: 'folder' }, 'only the space\'s own key changes');
  assert.deepEqual(DEFAULT_TICKS.research, ['chat', 'code']);
});

test('a changed start mode reaches a reused draft the chat box claimed by itself, never one you picked', async () => {
  const run = boot(makeWorld({ defaultMode: 'cowork', extraModes: JSON.stringify({ research: RESEARCH }) }), { tabs: true, maxTabs: 5 });
  await settle();
  const spaces = run.service().spaces;
  await run.open('n1');
  assert.deepEqual(await spaces.startDraft('n1', { space: 'code' }), { claimed: true, mode: 'code', space: 'code' });
  assert.deepEqual(await spaces.startDraft('n1', { space: 'code' }), { claimed: false }, 'nothing changed: nothing to do');
  await spaces.setSpace('code', { startMode: 'research' });
  await settle();
  // The app reuses the blank draft for the next New code task: it now starts in Research.
  assert.deepEqual(await spaces.startDraft('n1', { space: 'code' }), { claimed: true, mode: 'research', space: 'code' });
  // A pick of yours stays.
  await run.open('n2');
  await spaces.startDraft('n2', { space: 'code' });
  await spaces.pick('n2', 'plain');
  await spaces.setSpace('code', { startMode: 'code' });
  await settle();
  assert.deepEqual(await spaces.startDraft('n2', { space: 'code' }), { claimed: false });
  assert.equal(json(run.config.sessionModes).n2, 'plain');
  run.stop();
});
