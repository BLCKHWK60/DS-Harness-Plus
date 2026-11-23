// Item 4A, stage 6a: any mode in the Recon space is a Recon thread for Recon's routes, room, cloud-model gate,
// commands, moves and exports; the Modes error value grants nothing; no Modes means as before. Stand-in services,
// the room is a throwaway folder, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { SPACE_RULES } from '../lib/mode.js';
import { loadRecon } from './fixtures/room.mjs';

const { apply, Config, ROOM, DOOR_PATH } = await loadRecon();

const LOCAL = { provider: 'mine', model: 'small' };
const CLOUD = { provider: 'deepseek', model: 'big' };
const asked = { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Look into it.' }] };
const ERROR_GUARD = { top: '', space: '', mode: '', sealed: true, sealedBy: '', reconSpace: false, guardedBy: 'unknown', noPrograms: true, homeMode: false, fresh: false, unknownTop: true };

/** An agent in a folder, on a model. */
const agentOf = (id, { cwd = ROOM, model = LOCAL, parent } = {}) => {
  const header = { cwd, ...(parent ? { parentSession: parent } : {}) };
  const sections = [];
  return {
    id, header, sections,
    session: { header, deriveMessages: () => [asked] },
    model: { current: () => model },
    ctx: { effect: (make) => make(), systemPrompt: { section: (spec) => { sections.push(spec); return () => {}; } } },
  };
};

/**
 * Recon on stand-ins. `space[id]` is the thread's space and `mode[id]` its mode; `modes` replaces the Modes service
 * (`null`: no Modes at all; `'legacy'`: an older Modes without guardOf; `'error'`: guardOf gives the error value).
 */
function start({ mode = {}, space = {}, isolated = {}, agents = {}, modes = 'v2', sessions = [], more = {} } = {}) {
  const handlers = {};
  const routes = {};
  const registered = {};
  const provided = {};
  let command;
  let modesAsked = 0;
  const guard = (id) => {
    if (modes === 'error') return ERROR_GUARD;
    const s = space[id] ?? '';
    const sealed = isolated[id] ?? s === 'recon';
    return { top: id, space: s, mode: mode[id] ?? '', sealed, sealedBy: s === 'recon' ? 'recon' : sealed ? 'mode' : '', reconSpace: s === 'recon', guardedBy: '', noPrograms: sealed, homeMode: mode[id] === 'recon', fresh: false, unknownTop: false };
  };
  const service = modes === null ? undefined : {
    get: (id) => mode[id],
    isolated: (id) => isolated[id] ?? space[id] === 'recon',
    spaces: { of: (id) => space[id] ?? '' },
    list: () => [{ id: 'cowork', label: 'Cowork' }, { id: 'recon', label: 'Recon' }],
    ...(modes === 'legacy' ? {} : { guardOf: guard }),
    ...more,
  };
  const services = {
    settings: {
      describe: () => [
        { ns: 'modes', value: { extraModes: '{}', sessionIsolated: '{}', defaultMode: 'cowork' } },
        { ns: 'llm-pi-ai', value: { providers: { mine: { baseURL: 'http://localhost:1234/v1', displayName: 'Mine' } } } },
      ],
      mutate: async () => {},
    },
    tools: { register: (tool) => { registered[tool.name] = tool; return () => {}; }, guard: () => () => {} },
    commands: { register: (spec) => { command = spec; return () => {}; } },
    webServer: { register: (spec) => { routes[spec.path] = spec.handler; return () => {}; } },
    connection: { requestRejection: () => undefined },
    sessionPersistence: { list: async () => [] },
    sessionQuery: { readSurface: async () => ({ session: {}, events: [] }), listSessions: async () => sessions.map((header) => ({ header })), readTitleSnapshots: async (ids) => ids.map((id) => ({ status: 'fulfilled', value: { title: { title: `Title of ${id}` } } })) },
    agents: { get: (id) => agents[id], list: () => Object.values(agents) },
  };
  const ctx = {
    ...services,
    logger: { warn: () => {}, info: () => {}, error: () => {} },
    effect: (fn) => { fn(); },
    get: (name) => {
      if (name === 'modes') {
        modesAsked += 1;
        return service;
      }
      return services[name];
    },
    inject: (_names, callback) => callback(ctx),
    on: (name, listener) => { (handlers[name] ??= []).push(listener); return () => {}; },
    provide: (name, value) => { provided[name] = value; return () => {}; },
  };
  apply(ctx, Config({ enabled: true }));
  const step = (agent, modelSelection) => {
    const list = handlers['agent/pre-step'] ?? [];
    const run = (at) => (at === list.length ? Promise.resolve({ kind: 'enter', messages: [] }) : list[at]({ agent, modelSelection, messages: [] }, () => run(at + 1)));
    return run(0);
  };
  const route = async (query) => {
    let out = '';
    const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text; } };
    const req = { method: 'GET', url: `${DOOR_PATH}?${new URLSearchParams(query)}`, async *[Symbol.asyncIterator]() {} };
    await routes[DOOR_PATH](req, res);
    return { status: res.statusCode, json: JSON.parse(out || '{}') };
  };
  const created = (agent) => { for (const handler of handlers['agent/created'] ?? []) handler({ agent }); };
  return { recon: provided.recon, registered, step, route, created, say: (agent, rawInput) => command.handler({ agent, rawInput }), modesAsked: () => modesAsked };
}

const guestApp = (extra = {}) => {
  const guest = agentOf('r1');
  const outside = agentOf('r2', { cwd: '/Users/someone/project' });
  const chat = agentOf('c1', { cwd: '/Users/someone/project' });
  const agents = { r1: guest, r2: outside, c1: chat };
  return { guest, outside, chat, app: start({ mode: { r1: 'research', r2: 'research', c1: 'research' }, space: { r1: 'recon', r2: 'recon', c1: 'chat' }, agents, ...extra }) };
};

test('inReconSpace: research in Recon is a Recon thread, research in Chat is not; runs and room folders follow', () => {
  const { app } = guestApp();
  assert.equal(app.recon.apiVersion, 3);
  assert.equal(app.recon.inSpace('r1'), true);
  assert.equal(app.recon.inSpace('c1'), false);
  assert.equal(app.recon.runs('r1'), true, 'a guest in the room has runs');
  assert.equal(app.recon.runs('r2'), false, 'a guest outside the room has none');
  assert.equal(app.recon.runs('c1'), false);
  assert.equal(app.recon.roomFolderOf('r1'), join(ROOM, 'run-r1'));
  assert.equal(app.recon.roomFolderOf('r2'), '', 'not in the room: nothing is saved');
  assert.equal(app.recon.roomFolderOf('c1'), '');
  assert.equal(app.recon.roomRunFolder('r1'), join(ROOM, 'run-r1'));
  assert.equal(app.recon.isRoom(join(ROOM, 'run-r1')), true);
  assert.equal(app.recon.isRoom('/Users/someone/project'), false);
});

test('roomRunFolder never asks Modes, so Modes may call it while it works out a mode', () => {
  const { app } = guestApp();
  const before = app.modesAsked();
  assert.equal(app.recon.roomRunFolder('r1'), join(ROOM, 'run-r1'));
  assert.equal(app.recon.roomRunFolder('r2'), '');
  assert.equal(app.modesAsked(), before);
});

test('an older Modes (no guardOf): the Recon space and isolated counts, as does the Recon mode', () => {
  const guest = agentOf('r1');
  const plain = agentOf('p1');
  const app = start({ modes: 'legacy', mode: { r1: 'research', p1: 'research', h1: 'recon' }, space: { r1: 'recon' }, agents: { r1: guest, p1: plain, h1: agentOf('h1') } });
  assert.equal(app.recon.inSpace('r1'), true);
  assert.equal(app.recon.inSpace('p1'), false, 'in the room but not in the Recon space or mode');
  assert.equal(app.recon.inSpace('h1'), false, 'the Recon mode needs isolated too');
});

test('recon-tools-guest: Recon\'s tools pass the space check for a guest in the room, refuse outside the room and in Chat', async () => {
  const { app, outside, chat } = guestApp();
  const tool = app.registered.recon_web_search;
  assert.ok(tool, 'recon_web_search is registered');
  const cloudGuest = agentOf('r1', { model: CLOUD });
  const inRoom = (await tool.execute({ query: 'acme' }, { agent: cloudGuest })).text;
  assert.doesNotMatch(inRoom, /works only in a thread in the Recon space/);
  assert.doesNotMatch(inRoom, /runs in a folder of the user's/);
  assert.match(inRoom, /cloud/i, 'stopped later, by the model gate (no network in a test)');
  assert.match((await tool.execute({ query: 'acme' }, { agent: outside })).text, /runs in a folder of the user's/);
  assert.match((await tool.execute({ query: 'acme' }, { agent: chat })).text, /works only in a thread in the Recon space/);
});

test('cloud-gate-guest: a guest takes no step on a cloud model, even before it read anything; Chat does', async () => {
  const { app } = guestApp();
  await assert.rejects(app.step(agentOf('r1', { model: CLOUD }), CLOUD), /holds what Recon found.*\/recon cloud/s);
  // Its helpers too.
  await assert.rejects(app.step(agentOf('r1-h', { model: CLOUD, parent: 'r1' }), CLOUD), /holds what Recon found/);
  assert.equal((await app.step(agentOf('c1', { model: CLOUD }), CLOUD)).kind, 'enter');
  assert.equal((await app.step(agentOf('r1', { model: LOCAL }), LOCAL)).kind, 'enter', 'a local model may have it');
});

test('a guest gets /recon status, log, cloud and export; Chat is told it is not a Recon thread', async () => {
  const { app, guest, chat } = guestApp();
  const status = await app.say(guest, 'status');
  assert.equal(status.kind, 'success');
  assert.match(status.text, /Mode research in Recon is sealed/);
  assert.equal((await app.say(guest, 'log')).kind, 'success');
  assert.match((await app.say(guest, 'export')).text, /nothing to export/);
  assert.match((await app.say(guest, 'end')).text, /Nothing was deleted/);
  assert.match((await app.say(chat, 'status')).text, /not a Recon thread/);
  // The Recon mode keeps its own tool line.
  const home = start({ mode: { h1: 'recon' }, space: { h1: 'recon' }, agents: { h1: agentOf('h1') } });
  assert.match((await home.say(agentOf('h1'), 'status')).text, /Tools: only recon_/);
});

test('recon:space: a guest and its helpers get Recon\'s method rules; the Recon mode and Chat do not', () => {
  const { app, guest, chat } = guestApp();
  const helper = agentOf('r1-h', { parent: 'r1' });
  for (const agent of [guest, chat, helper]) app.created(agent);
  const text = (agent) => agent.sections.find((spec) => spec.name === 'recon:space')?.text();
  assert.equal(text(guest), SPACE_RULES);
  assert.equal(text(helper), SPACE_RULES);
  assert.equal(text(chat), '');
  const own = agentOf('h1');
  const home = start({ mode: { h1: 'recon' }, space: { h1: 'recon' }, agents: { h1: own } });
  home.created(own);
  assert.equal(own.sections.find((spec) => spec.name === 'recon:space')?.text(), '');
  // The rules it owns, and none of the tool sentences (those are Modes').
  assert.match(SPACE_RULES, /hostile text/);
  assert.match(SPACE_RULES, /minors/);
  assert.doesNotMatch(SPACE_RULES, /web_search|recon_web/);
});

test('door and move: a guest may export and move; a thread in the Recon space is never an export target', async () => {
  const guest = agentOf('r1');
  const app = start({
    mode: { r1: 'research', c1: 'cowork', g2: 'cowork' },
    space: { r1: 'recon', c1: 'chat', g2: 'recon' },
    isolated: { g2: false },
    agents: { r1: guest },
    sessions: [{ id: 'c1' }, { id: 'g2' }],
  });
  // g2: not isolated but listed in the Recon space (belt): never a target.
  const preview = await app.route({ session: 'r1', what: 'report' });
  assert.equal(preview.status, 200, JSON.stringify(preview.json));
  assert.deepEqual(preview.json.targets.map((one) => one.id), ['c1']);
  assert.equal(preview.json.targets[0].space, 'chat', 'each target is labelled with its space');
  assert.equal(preview.json.targets[0].mode, 'Cowork', 'and with its mode\'s name from the Modes list, not its id');
  const move = await app.route({ session: 'r1', what: 'report', move: '1' });
  assert.doesNotMatch(String(move.json.error ?? ''), /began in Recon/);
});

test('error-value-no-permission: Modes\' error value opens nothing, and the cloud gate holds', async () => {
  const guest = agentOf('r1');
  const app = start({ modes: 'error', mode: { r1: 'research' }, space: { r1: 'recon' }, agents: { r1: guest } });
  assert.equal(app.recon.inSpace('r1'), false);
  assert.equal(app.recon.runs('r1'), false);
  assert.equal(app.recon.roomFolderOf('r1'), '');
  assert.match((await app.registered.recon_web_search.execute({ query: 'acme' }, { agent: guest })).text, /works only in a thread in the Recon space/);
  await assert.rejects(app.step(agentOf('r1', { model: CLOUD }), CLOUD), /holds what Recon found/);
});

test('recon-modes-absent: no Modes service is "not Recon", as before', async () => {
  const guest = agentOf('r1');
  const app = start({ modes: null, agents: { r1: guest } });
  assert.equal(app.recon.inSpace('r1'), false);
  assert.equal(app.recon.roomFolderOf('r1'), '');
  assert.match((await app.registered.recon_web_search.execute({ query: 'acme' }, { agent: guest })).text, /works only in a thread in the Recon space/);
  assert.equal((await app.step(agentOf('r1', { model: CLOUD }), CLOUD)).kind, 'enter');
});

test('door-names-from-modes: targets and tabs carry Modes\' English names (never Chinese); an older Modes leaves them empty', async () => {
  const { shownNames } = await import('../lib/door.js');
  // A Modes that still answers in another language when asked: Recon never asks for it (stage 7, English only).
  const zhMode = { cowork: 'Cowork', research: 'x-zh-research', content: 'x-zh-content' };
  const zhSpace = { chat: 'x-zh-chat', workshop: 'x-zh-workshop', recon: 'x-zh-recon' };
  const guest = agentOf('r1');
  const app = start({
    mode: { r1: 'research', w1: 'research' },
    space: { r1: 'recon', w1: 'workshop' },
    agents: { r1: guest },
    sessions: [{ id: 'w1' }],
    more: {
      modeName: (id, lang) => (lang === 'zh' ? zhMode[id] ?? id : { research: 'Research', cowork: 'Cowork' }[id] ?? id),
      spaces: { of: (id) => ({ r1: 'recon', w1: 'workshop' })[id] ?? '', names: (lang) => (lang === 'zh' ? zhSpace : { chat: 'Chat', workshop: 'Workshop', recon: 'Recon' }) },
    },
  });
  const preview = await app.route({ session: 'r1', what: 'report' });
  assert.equal(preview.status, 200, JSON.stringify(preview.json));
  const [target] = preview.json.targets;
  assert.equal(target.id, 'w1');
  assert.deepEqual(target.names, { en: { mode: 'Research', space: 'Workshop' } });
  assert.deepEqual(preview.json.tabs.find((one) => one.id === 'cowork').names, { en: { mode: 'Cowork', space: '' } });
  // An older Modes (no modeName, no spaces.names, a list that ignores the language): the page falls back to its own copy.
  const old = { list: () => [{ id: 'cowork', label: 'Cowork' }], spaces: { of: () => 'chat' } };
  assert.deepEqual(shownNames(old, 'cowork', 'chat'), { en: { mode: 'Cowork', space: '' } });
  assert.deepEqual(shownNames(undefined, 'cowork', 'chat'), { en: { mode: '', space: '' } });
  // A Modes whose calls throw, or that answers with the id, gives nothing rather than an id.
  const broken = { modeName: () => { throw new Error('x'); }, list: () => { throw new Error('x'); }, spaces: { names: () => { throw new Error('x'); } } };
  assert.deepEqual(shownNames(broken, 'own-x', 'workshop'), { en: { mode: '', space: '' } });
  assert.equal(shownNames({ modeName: (id) => id, list: () => [] }, 'own-x').en.mode, '');
  assert.equal(shownNames({ spaces: { names: () => ({ chat: 'Chat' }) } }, 'x', 'odd').en.space, '', 'an unknown space is not shown');
});
