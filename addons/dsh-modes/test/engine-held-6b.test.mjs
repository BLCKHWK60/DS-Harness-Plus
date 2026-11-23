/**
 * Item 4A, stage 6b, Part A (STAGE6B-DESIGN.md J2, J3, L5, C5): when Modes refuses a step because the thread's model is
 * an engine (Recon, guests in Devices or Workshop), the user's words are kept in memory for that thread only, offered to
 * its own chat box once, and dropped when taken, after 10 minutes, or when the thread goes. Never logged, never stored.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { boot, makeWorld } from './app.mjs';
import { HELD_TEXT_MAX, HELD_TEXT_MS, HELD_THREADS, HELD_USER_KINDS, engineHeldTexts, heldTextOf } from '../lib/engineheld.js';
import { guardRefusesEngine } from '../lib/spacerules.js';
import { spaceText } from '../lib/spaces.js';
import { ENGINE_HELD_TAKEN_PATH } from '../lib/route.js';
import { MODE_PATH } from '../index.js';
import { MODE as RECON } from '../../dsh-recon/lib/mode.js';
import { MODE as RESEARCH } from '../../dsh-research/lib/mode.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const ROOM = realpathSync(mkdtempSync(path.join(tmpdir(), 'dsh-6b-held-room-')));
const KNOWN = ['read', 'write', 'bash', 'bench_usb', 'recon_web_search', 'schedule_create'];
const EXTRA = { recon: RECON, research: RESEARCH, bench: { label: 'Devices', tools: ['read', 'bench_usb'], sandbox: 'read-only' }, 'creator-plus': { label: 'Creator Plus', tools: 'all' } };
const TICKS = { research: ['chat', 'code', 'recon', 'devices', 'workshop'], plain: ['chat', 'code', 'recon'], code: ['code', 'devices', 'workshop'] };
const SPACES = { gd: 'devices', gw: 'workshop', other: 'devices', ec: 'code', eb: 'devices', eb2: 'devices' };
const MODES = { gd: 'code', gw: 'research', other: 'code', ec: 'code', eb: 'bench', eb2: 'bench' };
const ENGINE = () => ({ provider: 'engine-opencode', model: 'opencode' });
const SECRET = 'please rename the file called zebra-7421 in my project';

function reconService() {
  return {
    apiVersion: 3,
    inSpace: () => true,
    isRoom: (folder) => String(folder ?? '').startsWith(ROOM),
    roomRunFolder: (id) => {
      const folder = path.join(ROOM, `run-${id}`);
      mkdirSync(folder, { recursive: true });
      return folder;
    },
  };
}
function start() {
  const routes = new Map();
  const world = makeWorld({ pruneStaleSessions: false, extraModes: JSON.stringify(EXTRA), modeSpaces: JSON.stringify(TICKS), sessionSpaces: JSON.stringify(SPACES), sessionModes: JSON.stringify(MODES) });
  const services = {
    recon: reconService(),
    bench: { guestsGuarded: true },
    creatorPlus: { guestsGuarded: true },
    webServer: { register: (spec) => { routes.set(spec.path, spec.handler); return () => routes.delete(spec.path); } },
    connection: { requestRejection: () => undefined },
  };
  const app = boot(world, { tabs: true, known: KNOWN, services });
  return { app, world, routes };
}
const userMessage = (text, kind = 'user') => ({ id: `m-${kind}`, role: 'user', content: [{ type: 'text', text }], source: { kind } });
/** One step of an agent through every `agent/pre-step` listener. */
async function step(app, agent, messages = []) {
  let entered = false;
  const decision = await app.waterfall('agent/pre-step', { agent, messages, turn: 1, step: 1 }, async () => {
    entered = true;
    return { kind: 'enter', messages };
  });
  return { decision, entered };
}
async function refusedGuest(app, id = 'gd', messages = [userMessage(SECRET)]) {
  const one = await app.open(id, { source: 'resume', lastTurn: 1 });
  one.agent.model = { current: ENGINE };
  const { decision, entered } = await step(app, one.agent, messages);
  assert.equal(decision.kind, 'reject', id);
  assert.equal(entered, false);
  return one;
}
const view = (app, id, windowSpace, lang = 'en') => app.service().spaces.view(id, lang, { windowSpace });
async function request(handler, { method = 'GET', headers = {}, body } = {}) {
  const req = {
    method,
    headers,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body));
    },
  };
  const res = { statusCode: 200, headers: {}, body: '', setHeader(key, value) { this.headers[key] = value; }, end(text = '') { this.body = String(text); } };
  await handler(req, res);
  return { status: res.statusCode, data: res.body ? JSON.parse(res.body) : undefined };
}

test('held-text-user-only: only the user\'s words are kept; the scheduler\'s and tools\' never', async () => {
  // The pure part.
  assert.equal(heldTextOf([userMessage('one'), userMessage('timer says run', 'schedule'), { role: 'tool', content: [{ type: 'text', text: 'tool out' }], source: { kind: 'tool' } }, userMessage('two', 'skill-invocation')]), 'one\n\ntwo');
  assert.equal(heldTextOf([{ message: userMessage('wrapped') }]), 'wrapped', 'message.source.kind too');
  assert.equal(heldTextOf([{ role: 'user', content: 'plain string', source: { kind: 'user-question-reply' } }]), 'plain string');
  assert.equal(heldTextOf([userMessage('   ')]), '', 'blank text is not kept');
  assert.equal(heldTextOf([{ role: 'user', content: [{ type: 'image', data: 'x' }, { type: 'text', text: 'see' }], source: { kind: 'user' } }]), 'see');
  assert.equal(heldTextOf('nope'), '');
  assert.deepEqual([...HELD_USER_KINDS], ['user', 'skill-invocation', 'user-question-reply']);
  assert.equal(heldTextOf([userMessage('x'.repeat(HELD_TEXT_MAX + 50))]).length, HELD_TEXT_MAX, 'cut to 20 000 characters');
  // In the app: a scheduled run's refused step keeps nothing and makes no put-back promise.
  const { app } = start();
  await refusedGuest(app, 'gd', [userMessage('run the report', 'schedule')]);
  assert.equal(view(app, 'gd', 'devices').engineHeldDraft, null);
  assert.equal(view(app, 'gd', 'devices').engineHeld, spaceText('engineHeldPlain', 'en'));
  // The user's own message: kept, and the line says it is back.
  await refusedGuest(app, 'gw', [userMessage('run the report', 'schedule'), userMessage(SECRET)]);
  const shown = view(app, 'gw', 'workshop');
  assert.equal(shown.engineHeldDraft.text, SECRET);
  assert.match(shown.engineHeldDraft.id, /^[0-9a-f-]{36}$/);
  assert.equal(shown.engineHeld, spaceText('engineHeld', 'en'));
  assert.equal(shown.engineHeldKept, spaceText('engineHeldKept', 'en'));
  assert.match(shown.engineHeld, /Your message is back in the chat box/);
  assert.match(shown.engineHeldKept, /Click Put back/);
  app.stop();
});

test('held-text-own-thread-only: only that thread, only a window of its space, never a helper or another thread', async () => {
  const { app } = start();
  await refusedGuest(app);
  await app.open('other', { source: 'resume', lastTurn: 1 });
  const helper = await app.open('gdh', { header: { parentSession: 'gd' } });
  assert.equal(view(app, 'gd', 'devices').engineHeldDraft.text, SECRET);
  assert.equal(view(app, 'other', 'devices').engineHeldDraft, null, 'another thread in the same space');
  assert.equal(view(app, 'gd', 'chat').engineHeldDraft, null, 'a window of another space (L5)');
  assert.equal(view(app, 'gd', '').engineHeldDraft, null, 'no window space: not offered (fail closed)');
  // Review finding: a window that is not given the text never says it is back in its chat box.
  assert.equal(view(app, 'gd', 'chat').engineHeld, spaceText('engineHeldPlain', 'en'), 'another space\'s window: no promise');
  assert.equal(view(app, 'gd', '').engineHeld, spaceText('engineHeldPlain', 'en'), 'no window space: no promise');
  assert.equal(view(app, 'gd', 'devices').engineHeld, spaceText('engineHeld', 'en'), 'its own space\'s window: back in the box');
  assert.equal(app.service().spaces.view('gd').engineHeldDraft, null, 'a caller without a window (another add-on)');
  assert.equal(view(app, 'gdh', 'devices').engineHeldDraft, null, 'a helper id');
  assert.equal(view(app, 'gdh', 'devices').engineHeldKept, '');
  // A helper's refused step keeps nothing for the thread above it.
  helper.agent.model = { current: ENGINE };
  await step(app, helper.agent, [userMessage('helper words')]);
  assert.equal(view(app, 'gd', 'devices').engineHeldDraft.text, SECRET, 'the thread\'s own text stays');
  // Taking it: only the thread's own id with the view's id.
  const { id } = view(app, 'gd', 'devices').engineHeldDraft;
  assert.equal(app.service().spaces.engineHeldTaken('other', id), false);
  assert.equal(app.service().spaces.engineHeldTaken('gdh', id), false, 'not through a helper');
  assert.equal(app.service().spaces.engineHeldTaken('gd', 'another-id'), false);
  assert.equal(app.service().spaces.engineHeldTaken('gd', id), true);
  assert.equal(app.service().spaces.engineHeldTaken('gd', id), false, 'once');
  const after = view(app, 'gd', 'devices');
  assert.equal(after.engineHeldDraft, null, 'deleted once taken');
  assert.equal(after.engineHeld, spaceText('engineHeld', 'en'), 'the line still says it is back');
  app.stop();
});

test('held-text-own-thread-only: the routes: GET offers it with the window\'s space, POST engine-held-taken deletes it', async () => {
  const { app, routes } = start();
  await refusedGuest(app);
  const mode = routes.get(MODE_PATH);
  const taken = routes.get(ENGINE_HELD_TAKEN_PATH);
  assert.equal(typeof mode, 'function');
  assert.equal(typeof taken, 'function');
  const other = await request(mode, { headers: { 'x-dsh-session': 'gd', 'x-dsh-space': 'chat' } });
  assert.equal(other.data.value.engineHeldDraft, null);
  const odd = await request(mode, { headers: { 'x-dsh-session': 'gd', 'x-dsh-space': 'DEVICES"' } });
  assert.equal(odd.data.value.engineHeldDraft, null, 'a space id that is not one is ignored');
  const own = await request(mode, { headers: { 'x-dsh-session': 'gd', 'x-dsh-space': 'devices', 'x-dsh-locale': 'zh-CN' } });
  assert.equal(own.data.value.engineHeldDraft.text, SECRET);
  assert.equal(own.data.value.engineHeldKept, spaceText('engineHeldKept', 'en'), 'a Chinese page gets English');
  // C5: the page's language is remembered for dsh-engines; Plus is English only, so it is always 'en'.
  assert.equal(app.service().spaces.pageLang('gd'), 'en');
  assert.equal(app.service().spaces.pageLang('other'), '');
  assert.equal((await request(taken, { method: 'GET' })).status, 405);
  assert.equal((await request(taken, { method: 'POST', body: { sessionId: 'gd', id: 'wrong' } })).status, 404);
  assert.equal((await request(taken, { method: 'POST', body: { sessionId: 'bad id', id: own.data.value.engineHeldDraft.id } })).status, 404);
  assert.equal((await request(taken, { method: 'POST', body: { sessionId: 'gd', id: own.data.value.engineHeldDraft.id } })).status, 204);
  assert.equal((await request(mode, { headers: { 'x-dsh-session': 'gd', 'x-dsh-space': 'devices' } })).data.value.engineHeldDraft, null);
  app.stop();
});

test('held-text-expires: after 10 minutes the text is gone (pure store and in the app)', async () => {
  let clock = 1_000;
  let n = 0;
  const store = engineHeldTexts({ now: () => clock, newId: () => `id-${(n += 1)}` });
  assert.equal(store.keep('t', [userMessage('hello')]), true);
  assert.deepEqual({ ...store.draft('t') }, { id: 'id-1', text: 'hello' });
  assert.equal(store.keep('t', [userMessage('timer', 'schedule')]), false, 'a step without user words keeps the earlier text');
  assert.equal(store.draft('t').id, 'id-1');
  clock += HELD_TEXT_MS + 1;
  assert.equal(store.draft('t'), null);
  assert.equal(store.had('t'), false);
  assert.equal(store.take('t', 'id-1'), false);
  for (let i = 0; i < HELD_THREADS + 5; i += 1) store.keep(`x${i}`, [userMessage('w')]);
  assert.equal(store.size(), HELD_THREADS, 'at most 200 threads');
  assert.equal(store.draft('x0'), null, 'the oldest went first');
  // In the app, with the real clock moved on.
  const { app } = start();
  await refusedGuest(app);
  assert.equal(view(app, 'gd', 'devices').engineHeldDraft.text, SECRET);
  const realNow = Date.now;
  try {
    const later = realNow() + HELD_TEXT_MS + 1_000;
    Date.now = () => later;
    assert.equal(view(app, 'gd', 'devices').engineHeldDraft, null);
  } finally {
    Date.now = realNow;
  }
  app.stop();
});

test('held-text-cleared-on-dispose: the thread goes (closed, or Recon\'s End and wipe), its text goes with it', async () => {
  const { app } = start();
  const one = await refusedGuest(app);
  assert.equal(view(app, 'gd', 'devices').engineHeldDraft.text, SECRET);
  await app.close(one.agent);
  // The same id opened again (a reload) has nothing to put back.
  await app.open('gd', { source: 'resume', lastTurn: 1 });
  assert.equal(view(app, 'gd', 'devices').engineHeldDraft, null);
  assert.equal(app.service().spaces.pageLang('gd'), '');
  app.stop();
});

test('held-text-never-logged: not in Modes\' log, not in any setting, not on the console', async () => {
  const seen = [];
  const methods = ['log', 'info', 'warn', 'error', 'debug'];
  const real = Object.fromEntries(methods.map((name) => [name, console[name]]));
  for (const name of methods) console[name] = (...args) => { seen.push(args.map(String).join(' ')); };
  try {
    const { app, world, routes } = start();
    await refusedGuest(app);
    await request(routes.get(MODE_PATH), { headers: { 'x-dsh-session': 'gd', 'x-dsh-space': 'devices' } });
    assert.ok(app.logs.some((line) => /refused a step of gd on an engine model/.test(line)), 'the refusal itself is logged');
    assert.ok(app.logs.every((line) => !line.includes('zebra-7421')), 'never the text');
    const stored = JSON.stringify(Object.fromEntries(Object.entries(world.config).map(([key, value]) => [key, typeof value?.get === 'function' ? value.get() : value])));
    assert.equal(stored.includes('zebra-7421'), false, 'never written to a setting');
    app.stop();
  } finally {
    for (const name of methods) console[name] = real[name];
  }
  assert.equal(seen.some((line) => line.includes('zebra-7421')), false);
  // The module and the chat box never log it.
  const module = readFileSync(path.join(here, '..', 'lib', 'engineheld.js'), 'utf8');
  assert.doesNotMatch(module, /console\.|logger/);
  const client = readFileSync(path.join(here, '..', 'client.js'), 'utf8');
  const hook = client.slice(client.indexOf('function useEnginePutBack('), client.indexOf('return { held, putBack, copied };'));
  assert.doesNotMatch(hook, /console\./);
});

test('engine-home-modes: Bench at home in Devices still reaches dsh-engines (soft refusal there), and its words come back; an engine in Code is not refused here', async () => {
  const { app } = start();
  const home = await app.open('eb', { source: 'resume', lastTurn: 1 });
  home.agent.model = { current: ENGINE };
  assert.equal((await step(app, home.agent, [userMessage('hi')])).entered, true, 'J2: not refused by Modes');
  // Review finding (point 27): the typed message goes back into the chat box here too.
  assert.equal(view(app, 'eb', 'devices').engineHeldDraft.text, 'hi');
  assert.equal(view(app, 'eb', 'devices').engineHeld, spaceText('engineHeld', 'en'));
  assert.equal(view(app, 'eb', 'chat').engineHeldDraft, null, 'only a window of its own space');
  // A scheduled step keeps nothing and shows no line (as before).
  const quiet = await app.open('eb2', { source: 'resume', lastTurn: 1 });
  quiet.agent.model = { current: ENGINE };
  assert.equal((await step(app, quiet.agent, [userMessage('timer', 'schedule')])).entered, true);
  assert.equal(view(app, 'eb2', 'devices').engineHeldDraft, null);
  assert.equal(view(app, 'eb2', 'devices').engineHeld, '');
  const code = await app.open('ec', { source: 'resume', lastTurn: 1 });
  code.agent.model = { current: ENGINE };
  assert.equal((await step(app, code.agent, [userMessage('hi')])).entered, true);
  assert.equal(view(app, 'ec', 'code').engineHeldDraft, null);
  app.stop();
});

test('engine-guard-unchanged: guardRefusesEngine answers as in stage 6a', () => {
  const base = { sealed: false, reconSpace: false, guardedBy: '', noPrograms: false, homeMode: false, unknownTop: false, space: 'code', mode: 'code' };
  assert.equal(guardRefusesEngine(base), false);
  assert.equal(guardRefusesEngine({ ...base, space: 'chat', mode: 'research' }), false, 'Chat: dsh-engines decides');
  assert.equal(guardRefusesEngine({ ...base, space: 'devices', mode: 'bench', guardedBy: 'devices', noPrograms: true, homeMode: true }), false);
  assert.equal(guardRefusesEngine({ ...base, space: 'workshop', mode: 'creator-plus', guardedBy: 'workshop', noPrograms: true, homeMode: true }), false);
  assert.equal(guardRefusesEngine({ ...base, space: 'devices', guardedBy: 'devices', noPrograms: true }), true);
  assert.equal(guardRefusesEngine({ ...base, space: 'workshop', guardedBy: 'workshop', noPrograms: true }), true);
  assert.equal(guardRefusesEngine({ ...base, space: 'recon', sealed: true, reconSpace: true, noPrograms: true }), true);
  assert.equal(guardRefusesEngine({ ...base, space: 'recon', mode: 'recon', sealed: true, reconSpace: true, homeMode: true, noPrograms: true }), true);
  assert.equal(guardRefusesEngine({ ...base, unknownTop: true }), true);
  assert.equal(guardRefusesEngine(undefined), true);
});

test('texts: the put-back lines, each saying nothing ran and what to click; English on a Chinese page too', () => {
  for (const key of ['engineHeld', 'engineHeldKept', 'engineHeldPlain']) {
    assert.match(spaceText(key, 'en'), /^Nothing was run/, key);
    assert.equal(spaceText(key, 'zh'), spaceText(key, 'en'), key);
  }
  assert.match(spaceText('engineHeld', 'en'), /Your message is back in the chat box/);
  assert.match(spaceText('engineHeldKept', 'en'), /Click Put back/);
});

test('engine-line-cleared-on-user-message (stage 7, 6b lab): the refusal line goes when the user sends again; a new refusal sets it again', async () => {
  const { app } = start();
  const { agent } = await refusedGuest(app);
  const first = view(app, 'gd', 'devices');
  assert.ok(first.engineHeld, 'the line after the refusal');
  assert.ok(first.engineHeldAt > 0, 'with when it was set (the chat box hides it at once on send)');
  // The user sends again (a model of their own now): the line goes as the message arrives, before any step.
  await app.emit('agent/inbox/claimed', { agent, message: userMessage('again'), turn: 2 });
  assert.equal(view(app, 'gd', 'devices').engineHeld, '');
  assert.equal(view(app, 'gd', 'devices').engineHeldAt, 0);
  // Still an engine: refused again, the line is back with a newer time.
  await step(app, agent, [userMessage('again')]);
  const again = view(app, 'gd', 'devices');
  assert.ok(again.engineHeld);
  assert.ok(again.engineHeldAt >= first.engineHeldAt);
  app.stop();
});
