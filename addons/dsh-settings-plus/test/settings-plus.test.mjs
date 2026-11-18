// The Settings helper's index: read safely, and the shipped index is well formed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readIndex } from '../index.js';

test('reading the index', () => {
  assert.deepEqual(readIndex('not json'), []);
  assert.deepEqual(readIndex('{"a":1}'), []);
  const list = readIndex(JSON.stringify([{ page: 'modes', pageLabel: 'Modes', label: ' Load tools as needed ', keywords: ['trim'] }, { page: 'x' }, { label: 'no page' }]));
  assert.equal(list.length, 1);
  assert.equal(list[0].label, 'Load tools as needed');
  assert.equal(list[0].configOnly, false);
});

test('the shipped index is well formed', () => {
  const list = readIndex(readFileSync(fileURLToPath(new URL('../settings-index.json', import.meta.url)), 'utf8'));
  for (const entry of list) {
    assert.ok(entry.page && entry.label, JSON.stringify(entry));
    assert.ok(entry.label.length <= 160, entry.label);
  }
  const keys = new Set();
  for (const entry of list) keys.add(`${entry.page}|${entry.heading}|${entry.label}`);
  assert.ok(keys.size >= list.length * 0.95, 'few duplicates');
});

test('the route answers with the list, and refuses a request the app does not let in', async () => {
  const { apply, INDEX_PATH } = await import('../index.js');
  let route;
  const inner = {
    webServer: { register: (spec) => { if (spec.path === INDEX_PATH) route = spec; return () => {}; } },
    connection: { requestRejection: (req) => (req.headers?.authorization ? undefined : 401) },
    effect: (start) => start(),
  };
  apply({ inject: (_names, callback) => callback(inner) }, { enabled: true });
  assert.equal(route.path, INDEX_PATH);
  const answer = (req) => {
    const res = { statusCode: 200, headers: {}, body: '', setHeader(name, value) { this.headers[name] = value; }, end(text = '') { this.body = text; } };
    route.handler(req, res);
    return res;
  };
  const refused = answer({ headers: {} });
  assert.equal(refused.statusCode, 401);
  assert.equal(refused.body, '');
  const ok = answer({ headers: { authorization: 'token' } });
  const data = JSON.parse(ok.body);
  assert.equal(data.enabled, true);
  assert.ok(data.entries.length > 800);
  assert.ok(data.entries.some((entry) => entry.label === 'Finance (add-on): load tools as needed'));
});

// ---- the gear beside Send -------------------------------------------------------------------------

const SOURCE = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

function loadClient() {
  let loaded;
  const window = { __ModuleLoader__: { load: (module) => { loaded = module; } } };
  new Function('window', SOURCE)(window); // eslint-disable-line no-new-func
  const React = {
    createElement: () => null,
    Fragment: 'fragment',
    Component: class {},
    useCallback: (fn) => fn,
    useEffect() {},
    useMemo: (fn) => fn(),
    useRef: () => ({}),
    useState: (value) => [value, () => {}],
  };
  return { loaded, plugin: loaded.factory((name) => (name === 'react' ? React : { createPortal: () => null })) };
}

test('the gear is registered beside Send, and the search field and icons still are', () => {
  const { loaded, plugin } = loadClient();
  assert.equal(loaded.id, '@local/dsh-settings-plus');
  const registered = [];
  const ctx = { effect: (fn) => fn(), slots: { inject: (_name, fn) => fn(), register: (entry) => { registered.push(entry); return () => {}; } } };
  plugin.apply(ctx);
  const names = registered.map((entry) => `${entry.name}#${entry.id}`);
  assert.ok(names.includes('conversation.input.right#plus-mode-gear'));
  assert.ok(names.includes('conversation.input.right#plus-export'), 'the Export button, beside the gear');
  assert.ok(names.includes('settings.action#plus-settings-search'));
  assert.ok(names.includes('settings.section.icon#modes'));
  assert.ok(plugin.inject.includes('remote'));
  // The gear reads Modes' settings through the settings channel, so it must ask for it.
  assert.ok(plugin.inject.includes('remote.settings'));
});

test('the gear finds the conversation\'s mode, and the page that holds its settings', () => {
  const { plugin } = loadClient();
  const view = {
    modes: JSON.stringify({ chat: { label: 'Chat' }, cowork: { label: 'Cowork' }, code: { label: 'Code' }, mine: { label: 'My mode' } }),
    extraModes: JSON.stringify({ data: { label: 'Data' }, recon: { label: 'Recon' } }),
    sessionModes: JSON.stringify({ s1: 'data', s2: 'mine', s3: 'gone' }),
    defaultMode: 'chat',
  };
  assert.deepEqual(plugin.modeOf(view, 's1'), { id: 'data', label: 'Data' });
  assert.deepEqual(plugin.modeOf(view, 's2'), { id: 'mine', label: 'My mode' });
  // A conversation that is gone, a conversation that has not started, and the start page all follow the default.
  assert.equal(plugin.modeOf(view, 's3').id, 'chat');
  assert.equal(plugin.modeOf(view, 'new').id, 'chat');
  assert.equal(plugin.modeOf(view, undefined).id, 'chat');
  // Nothing readable: Cowork, the built-in default.
  assert.deepEqual(plugin.modeOf(undefined, 'x'), { id: 'cowork', label: 'Cowork' });
  assert.deepEqual(plugin.modeOf({ modes: 'not json', defaultMode: 'nope' }, 'x'), { id: 'cowork', label: 'Cowork' });

  // The Modes add-on reports a conversation's mode by name: that name finds the mode, a stranger does not.
  assert.deepEqual(plugin.modeNamed(view, 'Data'), { id: 'data', label: 'Data' });
  assert.deepEqual(plugin.modeNamed(view, 'My mode'), { id: 'mine', label: 'My mode' });
  assert.deepEqual(plugin.modeNamed(undefined, 'Code'), { id: 'code', label: 'Code' });
  assert.equal(plugin.modeNamed(view, 'Nothing'), undefined);
  assert.equal(plugin.modeNamed(view, ''), undefined);

  const pages = ['modes', 'data', 'recon', 'alerts', 'research'];
  assert.equal(plugin.pageForMode('data', pages), 'data');
  assert.equal(plugin.pageForMode('automations', pages), 'alerts');
  assert.equal(plugin.pageForMode('cowork', pages), 'modes');
  assert.equal(plugin.pageForMode('mine', pages), 'modes');
  // A mode whose add-on page is not there (the add-on is off), and no Modes page at all.
  assert.equal(plugin.pageForMode('scout', pages), 'modes');
  assert.equal(plugin.pageForMode('data', ['research']), undefined);
});

test('the gear has its own switch, on by default, answered by the route', async () => {
  const { Config, apply } = await import('../index.js');
  assert.equal(Config({}).modeGear.get(), true);
  assert.equal(Config({ modeGear: false }).modeGear.get(), false);
  assert.match(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8'), /modeGear: true/);
  let route;
  const inner = { webServer: { register: (spec) => { if (spec.path === '/dsh-settings-plus/index') route = spec; return () => {}; } }, connection: { requestRejection: () => undefined }, effect: (start) => start() };
  const answer = (config) => {
    apply({ inject: (_names, callback) => callback(inner) }, config);
    const res = { setHeader() {}, end(text) { this.body = text; } };
    route.handler({ headers: {} }, res);
    return JSON.parse(res.body);
  };
  assert.equal(answer({ enabled: true, modeGear: true }).modeGear, true);
  assert.equal(answer({ enabled: true, modeGear: false }).modeGear, false);
  assert.equal(answer({}).modeGear, true);
  assert.equal(answer({}).exportButton, true);
  assert.equal(answer({}).extrasInGear, true);
  assert.equal(answer({ extrasInGear: false }).extrasInGear, false);
  const list = readIndex(readFileSync(fileURLToPath(new URL('../settings-index.json', import.meta.url)), 'utf8'));
  assert.ok(list.some((entry) => entry.field === 'settings-plus.modeGear'));
});

test('no personal value is in the gear\'s code', () => {
  assert.doesNotMatch(SOURCE, /\/Users\/(?!you\/|someone\b)[a-z]/);
  assert.doesNotMatch(SOURCE, /\b(?:192\.168|10\.\d+\.\d+)\.\d+\b/);
});
