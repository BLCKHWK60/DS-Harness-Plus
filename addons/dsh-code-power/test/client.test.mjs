// Code power's page: offered to the Code tools page as a tab, and shown on its own only when that page is absent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const MAP_SOURCE = readFileSync(new URL('../../dsh-code-map/client.js', import.meta.url), 'utf8');

/** A tiny React: elements are plain objects, hooks keep their first value. */
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  Fragment: 'fragment',
  useCallback: (fn) => fn,
  useEffect() {},
  useMemo: (fn) => fn(),
  useRef: () => ({}),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
};

/** Load one add-on's client into a shared fake window (the way both pages share the browser). */
function load(source, window) {
  let loaded;
  window.__ModuleLoader__ = { load: (module) => { loaded = module; } };
  new Function('window', source)(window); // eslint-disable-line no-new-func
  return loaded.factory((name) => (name === 'react' ? React : {}));
}

/** A stand-in app: records pages, and lets a page be removed again. */
function fakeCtx() {
  const pages = new Map();
  const ctx = {
    effect: (fn) => fn(),
    locale: { register: () => () => {}, bind: () => (key) => key },
    remote: {},
    slots: {
      inject: (_name, fn) => fn(),
      register: (entry, render) => {
        pages.set(entry.id, { entry, render });
        return () => pages.delete(entry.id);
      },
    },
  };
  return { ctx, pages };
}

const find = (node, test) => {
  if (!node || typeof node !== 'object') return [];
  const here = test(node) ? [node] : [];
  return here.concat((node.children ?? []).flatMap((child) => (Array.isArray(child) ? child.flatMap((c) => find(c, test)) : find(child, test))));
};

test('alone: Code power has a page of its own', () => {
  const window = {};
  const power = load(SOURCE, window);
  const { ctx, pages } = fakeCtx();
  power.apply(ctx);
  assert.deepEqual([...pages.keys()], ['code-power']);
  assert.ok(power.inject.includes('remote.settings'));
  assert.equal(window.__dshMerge.parts['code-map']['code-power'].order, 200);
});

test('with the Code tools page: no page of its own, and the tab is offered; it comes back if that page goes', () => {
  const window = {};
  const map = load(MAP_SOURCE, window);
  const power = load(SOURCE, window);
  const a = fakeCtx();
  const b = fakeCtx();
  const stops = [];
  map.apply({ ...a.ctx, effect: (fn) => { const r = fn(); stops.push(r); return r; } });
  const stopHost = () => stops.forEach((stop) => typeof stop === 'function' && stop());
  power.apply(b.ctx);
  assert.deepEqual([...b.pages.keys()], [], 'hosted: no page of its own');
  assert.deepEqual(window.__dshMerge.parts['code-map'] && Object.keys(window.__dshMerge.parts['code-map']), ['code-power']);
  // The Code tools page shows both tabs.
  const page = a.pages.get('code-map');
  assert.equal(page.entry.label(), 'section.title');
  const shell = page.render({});
  const tree = shell.type(shell.props);
  const tabs = find(tree, (n) => n.props?.role === 'tab');
  assert.equal(tabs.length, 2);
  assert.deepEqual(tabs.map((n) => n.children[0]), ['tab.map', 'tab.title']);
  // Hosting ends (Code map switched off): the partner shows its own page again.
  stopHost();
  assert.deepEqual([...b.pages.keys()], ['code-power']);
});

test('Code map alone has no extra tabs', () => {
  const window = {};
  const map = load(MAP_SOURCE, window);
  const { ctx, pages } = fakeCtx();
  map.apply(ctx);
  assert.deepEqual([...pages.keys()], ['code-map']);
  const shell = pages.get('code-map').render({});
  const tree = shell.type(shell.props);
  assert.equal(find(tree, (n) => n.props?.role === 'tab').length, 0);
});
