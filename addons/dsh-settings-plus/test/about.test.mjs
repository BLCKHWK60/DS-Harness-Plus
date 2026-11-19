// About Plus: the supported app range, the labels of the add-ons, and Recon left out of search when it is not installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appInRange, apply, ABOUT_PATH, buildAbout, INDEX_PATH } from '../index.js';

const RANGE = { min: '0.2.2', below: '0.3.0' };

test('the app range: from the lowest up to, not including, the next minor version', () => {
  for (const ok of ['0.2.2', '0.2.2-rc.2', '0.2.9']) assert.equal(appInRange(ok, RANGE), true, ok);
  for (const no of ['0.2.1', '0.3.0', '1.0.0', '', 'abc']) assert.equal(appInRange(no, RANGE), false, no);
});

function plusFolder({ recon = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-about-'));
  writeFileSync(join(dir, 'VERSION'), '9.9.9\n');
  const addon = (folder) => { mkdirSync(join(dir, folder)); writeFileSync(join(dir, folder, 'package.json'), '{}'); };
  addon('dsh-activity'); addon('dsh-scout');
  if (recon) addon('dsh-recon');
  writeFileSync(join(dir, 'addon-tiers.json'), JSON.stringify({
    tiers: { core: { label: 'Core' }, experimental: { label: 'Experimental' } },
    supportedApp: RANGE,
    addons: {
      'dsh-activity': { tier: 'core', label: 'Activity', reason: 'Finished.' },
      'dsh-scout': { tier: 'experimental', label: 'Scout', reason: 'Early.' },
      'dsh-not-here': { tier: 'beta', label: 'Missing', reason: 'Not installed.' },
    },
  }));
  return dir;
}

test('the page data: versions, only installed add-ons, each with its label', () => {
  const dir = plusFolder();
  try {
    const about = buildAbout({ plusDir: dir, appVersion: '0.2.2-rc.2' });
    assert.equal(about.plus, '9.9.9');
    assert.equal(about.inRange, true);
    assert.deepEqual(about.range, RANGE);
    assert.deepEqual(about.addons.map((one) => [one.name, one.tierLabel]), [['Activity', 'Core'], ['Scout', 'Experimental']]);
    assert.equal(about.recon, false);
    assert.equal(buildAbout({ plusDir: dir, appVersion: '0.3.1' }).inRange, false);
    assert.equal(buildAbout({ plusDir: dir, appVersion: '' }).inRange, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('without a list or a version nothing breaks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-about-'));
  try {
    const about = buildAbout({ plusDir: dir, appVersion: '' });
    assert.deepEqual(about.addons, []);
    assert.equal(about.range, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function serve(standIns) {
  const routes = new Map();
  const inner = {
    webServer: { register: (spec) => { routes.set(spec.path, spec); return () => {}; } },
    connection: { requestRejection: (req) => (req.headers?.authorization ? undefined : 401) },
    effect: (start) => start(),
  };
  apply({ inject: (_names, callback) => callback(inner) }, { enabled: true }, standIns);
  return (path, headers = { authorization: 't' }) => {
    const res = { statusCode: 200, body: '', setHeader() {}, end(text = '') { this.body = text; } };
    routes.get(path).handler({ headers, url: path }, res);
    return res;
  };
}

test('the about route answers a signed-in page and refuses others; the index route says whether Recon is installed', () => {
  const without = plusFolder();
  const withRecon = plusFolder({ recon: true });
  try {
    const get = serve({ plusDir: without, appVersion: '0.2.2' });
    assert.equal(get(ABOUT_PATH, {}).statusCode, 401);
    assert.equal(JSON.parse(get(ABOUT_PATH).body).app, '0.2.2');
    assert.equal(JSON.parse(get(INDEX_PATH).body).recon, false);
    assert.equal(JSON.parse(serve({ plusDir: withRecon, appVersion: '0.2.2' })(INDEX_PATH).body).recon, true);
  } finally {
    rmSync(without, { recursive: true, force: true });
    rmSync(withRecon, { recursive: true, force: true });
  }
});

// ---- the page ---------------------------------------------------------------------------------------

const SOURCE = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
function client() {
  let loaded;
  const window = { __ModuleLoader__: { load: (module) => { loaded = module; } } };
  new Function('window', SOURCE)(window); // eslint-disable-line no-new-func
  const React = { createElement: () => null, Fragment: 'fragment', Component: class {}, useCallback: (fn) => fn, useEffect() {}, useMemo: (fn) => fn(), useRef: () => ({}), useState: (value) => [value, () => {}] };
  return loaded.factory((name) => (name === 'react' ? React : { createPortal: () => null }));
}

test('search leaves Recon out while Recon is not installed, and keeps everything else', () => {
  const { visibleEntries } = client();
  const list = [{ page: 'recon', field: 'recon.enabled' }, { page: 'web-sources', field: 'recon.webOn' }, { page: 'modes', field: 'modes.x' }];
  assert.deepEqual(visibleEntries(list, false).map((one) => one.page), ['modes']);
  assert.equal(visibleEntries(list, true).length, 3);
  assert.equal(visibleEntries(list, undefined).length, 3, 'an older server that does not say: nothing is hidden');
});

test('the range sentence says plainly whether the app is supported', () => {
  const { rangeSentence } = client();
  const base = { range: RANGE };
  assert.match(rangeSentence({ ...base, app: '0.2.2-rc.2', inRange: true }).text, /0\.2\.2 up to, but not including, 0\.3\.0\. Your app is 0\.2\.2-rc\.2: that is supported/);
  assert.equal(rangeSentence({ ...base, app: '0.3.1', inRange: false }).state, 'warn');
  assert.match(rangeSentence({ ...base, app: '' }).text, /could not be read/);
  assert.match(rangeSentence({}).text, /not available/);
});

test('the About Plus page is registered, grouped, and says what happens when the app updates', () => {
  const registered = [];
  const ctx = { effect: (fn) => fn(), slots: { inject: (_name, fn) => fn(), register: (entry) => { registered.push(entry); return () => {}; } } };
  client().apply(ctx);
  assert.ok(registered.some((entry) => entry.name === 'settings.section' && entry.id === 'about-plus'));
  assert.match(SOURCE, /When the app updates: Plus does not change by itself/);
  assert.ok(client().GROUPS.some((group) => group.label === 'Add-ons and updates' && group.pages.includes('about-plus')), 'About Plus sits under Add-ons and updates');
});
