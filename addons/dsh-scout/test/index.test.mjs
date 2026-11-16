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

    // No search from a Scout conversation, or its helpers, carries an email address or a phone number.
    const contact = app.guards[1];
    const refused = contact({ name: 'scout_search', agent: scout, arguments: { source: 'ba', what: 'jane.doe@example.org data engineer' } });
    assert.match(refused, /does not search with contact details: this scout_search call holds an email address \(j…@example\.org\)/);
    assert.ok(!refused.includes('jane.doe@example.org'), 'the refusal does not repeat the address');
    assert.match(contact({ name: 'web_search', agent: scout, arguments: { queries: ['data engineer', '"+49 151 23456789"'] } }), /a phone number/);
    assert.match(contact({ name: 'deep_research', agent: helper, arguments: { question: 'Who would hire jane.doe@example.org?' } }), /an email address/, 'helpers too');
    assert.match(contact({ name: 'web_fetch', agent: scout, arguments: { url: 'https://example.org/find?q=jane%40example.org' } }), /an email address/);
    assert.equal(contact({ name: 'web_fetch', agent: scout, arguments: { url: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/10000-1201234567-S' } }), undefined, 'a posting\'s reference number is not a phone number');
    assert.equal(contact({ name: 'scout_search', agent: scout, arguments: { source: 'ba', what: 'Data Engineer', where: 'Berlin', days: 14 } }), undefined);
    assert.equal(contact({ name: 'web_search', agent: scout, arguments: { queries: ['Data Engineer Gehalt 70.000-90.000 München', 'Data Engineer 45.000-55.000€ 01.10.2026-31.03.2027'] } }), undefined, 'pay and date ranges are not phone numbers');
    assert.match(contact({ name: 'web_search', agent: scout, arguments: { queries: ['data engineer Juan 612 34 56 78'] } }), /a phone number \(…678\)/);
    assert.equal(contact({ name: 'scout_files', agent: scout, arguments: { name: 'cv-jane.doe@example.org.pdf' } }), undefined, 'reading the user\'s own files is not a search');
    assert.equal(contact({ name: 'web_search', agent: cowork, arguments: { queries: ['jane.doe@example.org'] } }), undefined, 'only in Scout');

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
    assert.match(noteOf(scout), /Markets: Germany[\s\S]*User's files: 0 files[\s\S]*Earlier reports: none yet/);
    const helperNote = noteOf(helper);
    assert.match(helperNote, /Markets: Germany/);
    assert.doesNotMatch(helperNote, /User's files|Profile:|Earlier reports/, 'a helper is not told about the files, the profile or the reports');

    const route = app.routes[0];
    const shown = JSON.parse((await post(route, { action: 'toggle', id: 'indeed', on: false })).body);
    assert.deepEqual(shown.reports, [], 'the page lists saved reports (none yet)');
    assert.equal(shown.reportsFolder, join(home, 'scout', 'files', 'reports'));
    assert.ok(shown.sources.some((source) => source.id === 'sam' && source.key === 'required' && source.keySet === false), 'SAM.gov waits for its key');
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

test('Scratch: a Scratch conversation\'s selection and postings go when it is deleted for good; other conversations keep theirs', async () => {
  const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
  const home = mkdtempSync(join(tmpdir(), 'scout-scratch-'));
  const config = { enabled: true, title: 'Data engineer', markets: ['Germany'], workType: 'any', folder: '', sourceState: '{}', extraSources: '[]' };
  const app = fakeApp(home, config);
  const erasedListeners = [];
  const services = app.ctx.get;
  app.ctx.get = (name) => {
    if (name === 'agents') return { get: (id) => ({ id }), list: () => [] };
    if (name === 'coworkScratch') return { folderOf: (agent) => (agent.id === 'scratch-1' ? '/x/scratch/scratch-1' : '') };
    return services(name);
  };
  const inject = app.ctx.inject;
  app.ctx.inject = (names, use) => (names.includes('coworkTrash')
    ? use({ effect: (make) => make(), coworkTrash: { onErased: (fn) => { erasedListeners.push(fn); return () => {}; } } })
    : inject(names, use));
  try {
    apply(app.ctx, config);
    await new Promise((done) => setImmediate(done));
    app.modeOf['scratch-1'] = 'scout';
    app.modeOf['plain-1'] = 'scout';
    for (const id of ['scratch-1', 'plain-1']) app.handlers['session/event']({ id, header: {} }, { type: 'turn/start' });
    const pinsFile = join(home, 'scout', 'conversations.json');
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(pinsFile, 'utf8'))).sort(), ['plain-1', 'scratch-1']);
    // Its postings file (the save tool's report files are removed by the same list; see the owned-files test).
    const marks = JSON.parse(readFileSync(join(home, 'scout', 'scratch.json'), 'utf8'));
    const postingsFile = marks.find((entry) => entry.id === 'scratch-1').file;
    mkdirSync(join(home, 'scout', 'postings'), { recursive: true });
    writeFileSync(postingsFile, '{"list":[]}');
    assert.equal(marks.some((entry) => entry.id === 'plain-1'), false, 'only Scratch conversations are noted');
    assert.equal(erasedListeners.length, 1);
    await erasedListeners[0](['plain-1']);
    assert.ok(JSON.parse(readFileSync(pinsFile, 'utf8'))['plain-1'], 'a conversation outside Scratch keeps everything');
    await erasedListeners[0](['scratch-1']);
    assert.equal(JSON.parse(readFileSync(pinsFile, 'utf8'))['scratch-1'], undefined, 'its selection is gone');
    assert.equal(existsSync(postingsFile), false, 'its postings are gone');
  } finally {
    app.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test('Scratch: Scout removes only its own report files, inside its own reports folder', async () => {
  const { insideFolder } = await import('../lib/owned.js');
  assert.equal(insideFolder('/h/scout/files/reports/a.md', '/h/scout/files/reports'), true);
  assert.equal(insideFolder('/h/scout/files/reports', '/h/scout/files/reports'), false);
  assert.equal(insideFolder('/h/scout/files/reports/../x.md', '/h/scout/files/reports'), false);
  assert.equal(insideFolder('relative.md', '/h/scout/files/reports'), false);
});

test('Scratch: the report files Scout noted for a Scratch conversation (.md, .csv, .seen.json) go, and nothing outside its reports folder', async () => {
  const { existsSync, writeFileSync, mkdirSync } = await import('node:fs');
  const home = mkdtempSync(join(tmpdir(), 'scout-scratch-reports-'));
  const config = { enabled: true, title: 'Data engineer', markets: ['Germany'], workType: 'any', folder: '', sourceState: '{}', extraSources: '[]' };
  const app = fakeApp(home, config);
  const erased = [];
  const base = app.ctx.get;
  app.ctx.get = (name) => (name === 'agents' ? { get: (id) => ({ id }), list: () => [] } : name === 'coworkScratch' ? { folderOf: () => '/x/scratch/s' } : base(name));
  const inject = app.ctx.inject;
  app.ctx.inject = (names, use) => (names.includes('coworkTrash') ? use({ effect: (make) => make(), coworkTrash: { onErased: (fn) => { erased.push(fn); return () => {}; } } }) : inject(names, use));
  try {
    apply(app.ctx, config);
    const reports = join(home, 'scout', 'files', 'reports');
    mkdirSync(reports, { recursive: true });
    for (const ext of ['.md', '.csv', '.seen.json']) writeFileSync(join(reports, `run-1${ext}`), 'x');
    writeFileSync(join(home, 'outside.md'), 'mine');
    // What Scout's save tool records for a Scratch conversation, plus an entry that points outside.
    writeFileSync(join(home, 'scout', 'scratch.json'), JSON.stringify([{ id: 's', file: join(reports, 'run-1.md') }, { id: 's', file: join(home, 'outside.md') }]));
    await erased[0](['s']);
    for (const ext of ['.md', '.csv', '.seen.json']) assert.equal(existsSync(join(reports, `run-1${ext}`)), false, ext);
    assert.equal(existsSync(join(home, 'outside.md')), true, 'nothing outside its reports folder');
  } finally {
    app.close();
    rmSync(home, { recursive: true, force: true });
  }
});
