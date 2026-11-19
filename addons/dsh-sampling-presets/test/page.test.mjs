/**
 * Sampling presets' page in a stand-in app: it is a tab of the Model Tiers page when that page exists,
 * its own page when it does not, and its style names cannot collide with other add-ons' pages.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CLIENT = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

function loadClient(window) {
  let loaded;
  window.__ModuleLoader__ = { load: (module) => { loaded = module; } };
  new Function('window', CLIENT)(window); // eslint-disable-line no-new-func
  const React = {
    createElement: () => null,
    Fragment: 'fragment',
    useCallback: (fn) => fn,
    useEffect() {},
    useMemo: (fn) => fn(),
    useRef: () => ({}),
    useState: (value) => [value, () => {}],
  };
  return { loaded, plugin: loaded.factory((name) => (name === 'react' ? React : {})) };
}

function pageContext() {
  const pages = [];
  return {
    pages,
    ctx: {
      effect: (fn) => { const off = fn(); return typeof off === 'function' ? off : () => {}; },
      locale: { register: () => () => {}, bind: () => (key) => key },
      slots: {
        inject: (_name, fn) => fn(),
        register: (entry) => { pages.push(entry.id); return () => { pages.splice(pages.indexOf(entry.id), 1); }; },
      },
    },
  };
}

test('alone it keeps its own Sampling page; beside Model Tiers it is a tab and the page goes away', () => {
  const window = {};
  const { loaded, plugin } = loadClient(window);
  assert.equal(loaded.id, '@local/dsh-sampling-presets');
  const { ctx, pages } = pageContext();
  plugin.apply(ctx);
  assert.deepEqual(pages, ['sampling-presets']);
  const merge = window.__dshMerge;
  assert.equal(merge.parts['model-tiers']['sampling-presets'].order, 300);
  merge.hosts['model-tiers'] = 1;
  merge.subs.forEach((fn) => fn());
  assert.deepEqual(pages, []);
  delete merge.hosts['model-tiers'];
  merge.subs.forEach((fn) => fn());
  assert.deepEqual(pages, ['sampling-presets']);
});

test('the page styles use their own prefix, so Split Plus and Settings search styles cannot reach them', () => {
  const names = new Set([...CLIENT.matchAll(/\.dsh-([a-z]+)-/g)].map((match) => match[1]));
  assert.ok(names.has('smp'));
  assert.ok(!names.has('sp'), 'the old shared prefix is gone');
  for (const name of names) assert.ok(['smp', 'kit'].includes(name), `unexpected prefix dsh-${name}-`);
});
