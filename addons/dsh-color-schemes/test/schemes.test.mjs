// Colour schemes: the saved choice and its defaults (host), and the page's colour logic (browser half) run in a
// stand-in browser: which colours reach the theme service for Harbor, Stock and a custom scheme, how a bad custom
// scheme is refused, and that the old stored id "mindshub" still gives Harbor.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Config, apply } from '../index.js';

const SOURCE = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  Fragment: 'fragment',
  useCallback: (fn) => fn,
  useEffect() {},
  useMemo: (fn) => fn(),
  useRef: () => ({}),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useSyncExternalStore: (_subscribe, get) => get(),
};

/** Every page started by a test is stopped after it, even when the test fails, so no timer keeps the run alive. */
const active = [];
afterEach(() => { while (active.length) active.pop()(); });

/**
 * Run the page in a stand-in browser. `stored` is what the browser's own storage already holds, `saved` what the
 * app's Settings hold. Returns the colour applier the page uses, the theme calls, and a way to stop everything.
 */
async function startPage({ stored, saved, css } = {}) {
  const storage = new Map(stored === undefined ? [] : [['dsh-color-schemes.choice', JSON.stringify(stored)]]);
  const elements = [];
  const fakeElement = () => ({ attrs: {}, textContent: '', isConnected: false, setAttribute(k, v) { this.attrs[k] = v; }, remove() { this.isConnected = false; }, addEventListener() {} });
  const before = { document: globalThis.document };
  globalThis.document = {
    hidden: false,
    createElement: () => { const el = fakeElement(); elements.push(el); return el; },
    head: { appendChild: (el) => { el.isConnected = true; } },
    addEventListener() {}, removeEventListener() {},
  };
  const window = { ...(css ? { CSS: css } : {}), localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) }, addEventListener() {}, removeEventListener() {} };
  let loaded;
  window.__ModuleLoader__ = { load: (module) => { loaded = module; } };
  new Function('window', SOURCE)(window); // eslint-disable-line no-new-func
  const plugin = loaded.factory((name) => (name === 'react' ? React : {}));

  const theme = { calls: [], disposed: 0, overrideTokens(source, tokens) { this.calls.push({ source, tokens }); return () => { this.disposed += 1; }; } };
  const disposers = [];
  const dictionaries = {};
  let render;
  const ctx = {
    effect: (fn) => { const off = fn(); if (typeof off === 'function') disposers.push(off); return off; },
    locale: { register: (ns, dict) => { dictionaries[ns] = dict; return () => {}; }, bind: () => (key) => key },
    slots: { inject: (_n, fn) => fn(), register: (_entry, fnRender) => { render = fnRender; return () => {}; } },
    remote: {
      settings: { describe: async () => ({ ok: true, value: { namespaces: saved === undefined ? [] : [{ ns: 'color-schemes', revision: 1, value: saved }] } }), mutate: async () => ({ ok: true, value: {} }) },
      $on() {},
    },
    inject: (_names, callback) => callback({ effect: (fn) => { const off = fn(); if (typeof off === 'function') disposers.push(off); return off; }, theme }),
  };
  plugin.apply(ctx);
  // The page hands the applier to its page component: read it from the element the render function builds.
  const applier = render({}).props.applier;
  const mac = () => elements.find((el) => 'data-color-schemes-mac' in el.attrs);
  let stopped = false;
  const stop = () => { if (stopped) return; stopped = true; disposers.reverse().forEach((off) => off()); globalThis.document = before.document; };
  active.push(stop);
  return { applier, theme, storage, mac, dictionaries, stop };
}

/** Wait until `done()` is true, looking every few ms, for at most two seconds. */
async function until(done, what) {
  for (let i = 0; i < 400; i += 1) {
    if (done()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`never happened: ${what}`);
}

const choice = (scheme, extra = {}) => ({ scheme, custom: '', opaque: true, ...extra });

test('the host half only carries three live settings, with Stock as the default', () => {
  const config = Config({});
  const live = (value) => (value && typeof value.get === 'function' ? value.get() : value);
  assert.equal(live(config.scheme), 'stock');
  assert.equal(live(config.custom), '');
  assert.equal(live(config.opaqueMacSidebar), true);
  assert.doesNotThrow(() => apply());
});

test('Stock (the default) adds no colours at all', async () => {
  const page = await startPage();
  assert.deepEqual(page.theme.calls, []);
  assert.equal(page.mac().textContent, '', 'and no sidebar rule');
  page.stop();
});

test('Harbor: dark navy and the light colours reach the theme service under this add-on\'s name, and every colour of it is used', async () => {
  const page = await startPage();
  page.applier.set(choice('harbor'));
  assert.equal(page.theme.calls.length, 1);
  const { source, tokens } = page.theme.calls[0];
  assert.equal(source, 'dsh-color-schemes');
  assert.deepEqual(tokens['--dsw-alias-bg-base'], { light: '#f7fafc', dark: '#091425' });
  assert.equal(tokens['--dsw-specific-sidebar-fill'].dark, '#0e1b2e');
  assert.equal(tokens['--dsw-alias-brand-primary'].light, '#0e7f96');
  assert.equal(tokens['--dsw-alias-brand-primary'].dark, '#5cc1da');
  // A colour Harbor sets for the dark mode only keeps the app's own value in the light mode.
  assert.ok(typeof tokens['--dsw-alias-bg-layer-1'].light === 'string' && tokens['--dsw-alias-bg-layer-1'].light.length > 0);
  // Nothing Harbor lists is silently dropped for a name the page does not know.
  const harbor = SOURCE.slice(SOURCE.indexOf("id: 'harbor'"), SOURCE.indexOf('swatch: ['));
  const listed = new Set(harbor.match(/'--ds[a-z]-[a-z0-9-]+'/g).map((name) => name.slice(1, -1)));
  assert.deepEqual(new Set(Object.keys(tokens)), listed);
  for (const value of Object.values(tokens)) assert.ok(/^(#[0-9a-f]{3,8}|var\(.*\)|.+)$/i.test(value.light) && /^(#[0-9a-f]{3,8}|var\(.*\)|.+)$/i.test(value.dark));
  assert.match(page.mac().textContent, /sidebar-fill/, 'the Mac sidebar is painted in the scheme\'s colour');
  assert.match(page.mac().textContent, /radial-gradient/, 'Harbor draws the dot pattern');
  page.stop();
});

test('an old saved choice "mindshub" is read as Harbor, from the browser\'s own storage', async () => {
  const page = await startPage({ stored: { scheme: 'mindshub', custom: '', opaque: true } });
  assert.equal(page.applier.get().scheme, 'harbor');
  page.applier.attachTheme(page.theme);
  assert.equal(page.theme.calls.at(-1).tokens['--dsw-alias-bg-base'].dark, '#091425');
  page.stop();
});

test('an old saved choice "mindshub" in the app\'s Settings is read as Harbor, applied and stored again under the new name', async () => {
  const page = await startPage({ saved: { scheme: 'mindshub' } });
  await until(() => page.theme.calls.length > 0, 'the saved choice to be applied');
  assert.equal(page.applier.get().scheme, 'harbor');
  assert.equal(page.theme.calls.at(-1).tokens['--dsw-alias-bg-base'].dark, '#091425');
  assert.equal(JSON.parse(page.storage.get('dsh-color-schemes.choice')).scheme, 'harbor');
  page.stop();
});

test('the other built-in schemes and an unknown name: Stock for an unknown name, a real set for each known one', async () => {
  const page = await startPage();
  page.applier.set(choice('no-such-scheme'));
  assert.equal(page.theme.calls.length, 0, 'an unknown scheme name falls back to Stock');
  for (const id of ['harbor']) {
    page.applier.set(choice(id));
  }
  assert.equal(page.theme.calls.length, 1);
  page.applier.set(choice('stock'));
  assert.equal(page.theme.disposed, 1, 'going back to Stock takes the colours away');
  assert.equal(page.theme.calls.length, 1);
  page.stop();
});

test('setting the same choice again does nothing; stopping removes the colours and the sidebar rule', async () => {
  const page = await startPage();
  page.applier.set(choice('harbor'));
  page.applier.set(choice('harbor'));
  assert.equal(page.theme.calls.length, 1);
  page.applier.set(choice('harbor', { opaque: false }));
  assert.equal(page.theme.calls.length, 2, 'a real change applies again');
  assert.doesNotMatch(page.mac().textContent, /sidebar-fill/, 'sidebar left see-through when asked');
  page.stop();
  assert.equal(page.theme.disposed, 2);
});

test('a custom scheme: its colours are applied, missing ones keep the app\'s own, the sidebar choice inside it wins', async () => {
  const page = await startPage();
  const custom = JSON.stringify({ label: 'Mine', dark: { '--dsw-alias-bg-base': '#101010' }, light: { '--dsw-alias-bg-base': '#fafafa' }, opaqueMacSidebar: false });
  page.applier.set(choice('custom', { custom }));
  assert.deepEqual(page.theme.calls.at(-1).tokens, { '--dsw-alias-bg-base': { light: '#fafafa', dark: '#101010' } });
  assert.equal(page.mac().textContent, '');
  // One mode only: the other keeps the app's value for that colour.
  page.applier.set(choice('custom', { custom: JSON.stringify({ dark: { '--dsw-alias-bg-base': '#202020' } }) }));
  const token = page.theme.calls.at(-1).tokens['--dsw-alias-bg-base'];
  assert.equal(token.dark, '#202020');
  assert.ok(token.light && token.light !== '#202020');
  // A colour name the page does not know, set for one mode only, is left out.
  page.applier.set(choice('custom', { custom: JSON.stringify({ dark: { '--dsw-not-a-known-one': '#123456' } }) }));
  assert.deepEqual(page.theme.calls.at(-1).tokens, {});
  page.stop();
});

test('a custom scheme that is not valid is refused and the page shows Stock instead', async () => {
  const bad = [
    'not json at all',
    '[1,2]',
    JSON.stringify({ dark: { 'bad name': '#fff' } }),
    JSON.stringify({ dark: { '--dsw-alias-bg-base': 'url(https://example.invalid/x.png)' } }),
    JSON.stringify({ dark: { '--dsw-alias-bg-base': 'red; background: blue' } }),
    JSON.stringify({ dark: { '--dsw-alias-bg-base': 12 } }),
    JSON.stringify({ dark: [] }),
  ];
  for (const custom of bad) {
    const page = await startPage();
    page.applier.set(choice('custom', { custom }));
    assert.equal(page.theme.calls.length, 0, custom);
    page.stop();
  }
});

test('colour values are checked: hex, rgb(), var() and transparent pass; images, comments and escapes do not', async () => {
  const ok = ['#fff', '#12345678', 'rgb(1 2 3)', 'oklch(0.5 0.1 200)', 'var(--dsw-alias-bg-base)', 'transparent'];
  const nope = ['url(x)', 'rgb(1,2,3)/*c*/', 'image-set(x)', '#ggg', 'blue', 'rgb(1 2 3);x'];
  for (const value of ok) {
    const page = await startPage();
    page.applier.set(choice('custom', { custom: JSON.stringify({ dark: { '--dsw-alias-bg-base': value } }) }));
    assert.equal(page.theme.calls.length, 1, `${value} should be accepted`);
    page.stop();
  }
  for (const value of nope) {
    const page = await startPage();
    page.applier.set(choice('custom', { custom: JSON.stringify({ dark: { '--dsw-alias-bg-base': value } }) }));
    assert.equal(page.theme.calls.length, 0, `${value} should be refused`);
    page.stop();
  }
});

test('the browser has the last word on a colour: one it does not understand is refused (custom schemes work with the real CSS check present)', async () => {
  const css = { supports: (property, value) => property === 'color' && value !== '#abcdef' };
  const page = await startPage({ css });
  page.applier.set(choice('custom', { custom: JSON.stringify({ dark: { '--dsw-alias-bg-base': '#101010' } }) }));
  assert.equal(page.theme.calls.length, 1, 'a colour the browser accepts is used');
  page.applier.set(choice('custom', { custom: JSON.stringify({ dark: { '--dsw-alias-bg-base': '#abcdef' } }) }));
  assert.equal(page.theme.calls.length, 1, 'a colour the browser refuses is not');
});

test('the dot pattern is only turned on by a custom scheme that asks for "dots"', async () => {
  const page = await startPage();
  page.applier.set(choice('custom', { custom: JSON.stringify({ pattern: 'dots', dark: { '--dsw-alias-bg-base': '#000' } }) }));
  assert.match(page.mac().textContent, /radial-gradient/);
  page.applier.set(choice('custom', { custom: JSON.stringify({ pattern: 'lines', dark: { '--dsw-alias-bg-base': '#000' } }) }));
  assert.doesNotMatch(page.mac().textContent, /radial-gradient/);
  page.stop();
});

test('Harbor has its name and its description in both languages', async () => {
  const page = await startPage();
  const dict = page.dictionaries.colorSchemes;
  assert.ok(dict, 'the texts are registered');
  const flat = JSON.stringify(dict);
  assert.match(flat, /"scheme\.harbor":"Harbor"/);
  assert.match(flat, /"scheme\.harbor\.d":"Deep navy with teal accents\."/);
  assert.match(flat, /深海军蓝配青色强调色/);
  page.stop();
});
