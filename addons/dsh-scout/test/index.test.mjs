// Scout's wiring in the app, with a stand-in for the app: the mode kept in step with the switch,
// which conversations and helpers get which tools, the guard on search-engine-only sources, the
// selection a conversation started with, and the Settings page's actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { apply } from '../index.js';
import { TOP_ONLY } from '../lib/mode.js';

/** A stand-in for the app: records what Scout registers and lets a test drive it. */
function fakeApp(home, config) {
  const disposers = [];
  const handlers = {};
  const registered = [];
  const mutations = [];
  const guards = [];
  const routes = [];
  const modeOf = {};
  const modesRow = { ns: 'modes', value: { extraModes: '{}', defaultMode: 'cowork' } };
  const services = {
    dshHomePath: (name) => join(home, name),
    settings: {
      describe: () => [modesRow],
      async mutate(ns, ops) {
        mutations.push({ ns, ops });
        for (const op of ops) {
          if (ns === 'modes') modesRow.value = { ...modesRow.value, [op.path[0]]: op.value };
          if (ns === 'scout') config[op.path[0]] = op.value;
        }
      },
    },
    tools: { register: (tool, options) => { registered.push({ tool, when: options.when }); return () => {}; } },
    modes: { get: (id) => modeOf[id] },
  };
  const ctx = {
    get: (name) => services[name],
    effect: (make) => { const dispose = make(); disposers.push(dispose); return dispose; },
    on: (event, handler) => { handlers[event] = handler; },
    tools: { guard: (check) => { guards.push(check); return () => {}; } },
    inject: (_names, use) => use({
      effect: (make) => disposers.push(make()),
      commands: { register: () => () => {} },
      webServer: { register: (route) => { routes.push(route); return () => {}; } },
      connection: { requestRejection: () => undefined },
    }),
    logger: { warn: () => {} },
  };
  const close = () => { for (const dispose of disposers) if (typeof dispose === 'function') dispose(); };
  return { ctx, handlers, registered, mutations, guards, routes, modeOf, modesRow, close };
}

/** Post one action to the Settings page's data route. */
async function post(route, body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  const res = { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(text) { this.body = text; } };
  await route.handler(req, res);
  return res;
}

test('the app wiring: mode, tools per conversation, guard, pinned selection, actions', async () => {
  const home = mkdtempSync(join(tmpdir(), 'scout-app-'));
  const config = { enabled: true, title: 'Data engineer', markets: ['Germany'], workType: 'any', folder: '', sourceState: '{}', extraSources: '[]' };
  const app = fakeApp(home, config);
  try {
    apply(app.ctx, config);
    await new Promise((done) => setImmediate(done));
    assert.ok(JSON.parse(app.modesRow.value.extraModes).scout, 'the Scout mode is added while Scout is on');

    app.modeOf.s1 = 'scout';
    app.modeOf.c1 = 'cowork';
    const scout = { id: 's1' };
    const helper = { id: 'h1', header: { parentSession: 's1' } };
    const cowork = { id: 'c1' };
    const offered = (agent) => app.registered.filter((entry) => entry.when({ agent })).map((entry) => entry.tool.name);
    assert.ok(offered(scout).includes('scout_files') && offered(scout).includes('scout_search'));
    assert.deepEqual(offered(cowork), [], 'other modes get none of Scout\'s tools');
    assert.ok(offered(helper).includes('scout_search'), 'a helper may still search');
    for (const name of TOP_ONLY) assert.ok(!offered(helper).includes(name), `a helper does not get ${name}`);

    const guard = app.guards[0];
    assert.match(guard({ name: 'web_fetch', agent: scout, arguments: { url: 'https://www.indeed.com/viewjob?jk=1' } }), /search engine results only/);
    assert.equal(guard({ name: 'web_fetch', agent: cowork, arguments: { url: 'https://www.indeed.com/viewjob?jk=1' } }), undefined, 'only in Scout');
    assert.equal(guard({ name: 'web_fetch', agent: scout, arguments: { url: 'https://www.reed.co.uk/jobs/1' } }), undefined);

    // The conversation starts with Germany; the start page then changes to France for another one.
    app.handlers['session/event']({ id: 's1', header: {} }, { type: 'turn/start' });
    config.markets = ['France'];
    const sources = app.registered.find((entry) => entry.tool.name === 'scout_sources').tool;
    assert.match((await sources.execute({}, { agent: scout })).text, /^\d+ sources for Germany/, 'the tools keep the conversation\'s own selection');
    assert.match((await sources.execute({}, { agent: helper })).text, /^\d+ sources for Germany/, 'and so do its helpers');

    const noteOf = (agent) => {
      let section;
      app.handlers['agent/created']({ agent: { ...agent, ctx: { systemPrompt: { section: (options) => { section = options; return () => {}; } }, effect: (make) => make() } } });
      return section.text();
    };
    assert.match(noteOf(scout), /Markets: Germany[\s\S]*User's files: 0 files/);
    const helperNote = noteOf(helper);
    assert.match(helperNote, /Markets: Germany/);
    assert.doesNotMatch(helperNote, /User's files|Profile:/, 'a helper is not told about the files or the profile');

    const route = app.routes[0];
    assert.equal((await post(route, { action: 'toggle', id: 'indeed', on: false })).statusCode, 200);
    assert.equal(JSON.parse(config.sourceState).indeed.on, false);
    await post(route, { action: 'hide', id: 'dice' });
    assert.equal(JSON.parse(config.sourceState).dice.hidden, true);
    await post(route, { action: 'add', source: { name: 'Niche board', url: 'https://jobs.example.org/', markets: ['Spain'], workTypes: ['freelance'], access: 'page' } });
    assert.equal(JSON.parse(config.extraSources)[0].id, 'niche-board');
    await post(route, { action: 'remove', id: 'niche-board' });
    assert.deepEqual(JSON.parse(config.extraSources), []);
    assert.equal((await post(route, { action: 'nonsense' })).statusCode, 400);

    config.enabled = false;
    app.registered.length = 0;
    await post(route, { action: 'toggle', id: 'indeed', on: true });
    await new Promise((done) => setImmediate(done));
    assert.equal(JSON.parse(app.modesRow.value.extraModes).scout, undefined, 'switched off, the mode is taken out');
  } finally {
    app.close();
    rmSync(home, { recursive: true, force: true });
  }
});
