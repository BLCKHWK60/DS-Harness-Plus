// The Notify settings part: it offers itself to the Alerts page, and shows its own page only when no Alerts page is there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const NOTIFY = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const ALERTS = readFileSync(new URL('../../dsh-automations/client.js', import.meta.url), 'utf8');

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

/** Load a client file into a shared fake window (so both add-ons see the same merge registry). */
function load(source, window) {
  let loaded;
  window.__ModuleLoader__ = { load: (module) => { loaded = module; } };
  new Function('window', source)(window); // eslint-disable-line no-new-func
  return loaded.factory(() => React);
}

/** A stand-in app: each registered page is kept until its remover runs. */
function fakeCtx() {
  const pages = new Map();
  const ctx = {
    effect: (fn) => fn(),
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: {
      inject: (_name, fn) => fn(),
      register: (entry) => { pages.set(entry.id, entry); return () => pages.delete(entry.id); },
    },
  };
  return { ctx, pages };
}

test('Notify alone: its own page is there, and it offers itself to the Alerts page', () => {
  const window = {};
  const { ctx, pages } = fakeCtx();
  load(NOTIFY, window).apply(ctx);
  assert.deepEqual([...pages.keys()], ['notify']);
  assert.equal(window.__dshMerge.parts.alerts.notify.order, 200);
  assert.match(window.__dshMerge.parts.alerts.notify.label(), /turn ends/);
});

test('Alerts first: Notify has no page of its own, only the group on the Alerts page', () => {
  const window = {};
  const alerts = fakeCtx();
  load(ALERTS, window).apply(alerts.ctx);
  assert.ok(alerts.pages.has('alerts'));
  assert.equal(window.__dshMerge.hosts.alerts, 1);
  const notify = fakeCtx();
  load(NOTIFY, window).apply(notify.ctx);
  assert.equal(notify.pages.size, 0);
  assert.ok(window.__dshMerge.parts.alerts.notify);
});

test('Notify first, Alerts later: the own page goes away; switching Alerts off brings it back', () => {
  const window = {};
  const notify = fakeCtx();
  load(NOTIFY, window).apply(notify.ctx);
  assert.deepEqual([...notify.pages.keys()], ['notify']);
  const alerts = fakeCtx();
  const removers = [];
  load(ALERTS, window).apply({ ...alerts.ctx, effect: (fn) => { const off = fn(); if (typeof off === 'function') removers.push(off); return off; } });
  assert.equal(notify.pages.size, 0);
  assert.equal(window.__dshMerge.hosts.alerts, 1);
  for (const off of removers) off(); // the Alerts add-on is switched off
  assert.equal(window.__dshMerge.hosts.alerts, undefined);
  assert.deepEqual([...notify.pages.keys()], ['notify']);
});

test('the Notify page asks nothing with window.prompt, confirm or alert, and uses no fixed colours', () => {
  const own = NOTIFY.slice(NOTIFY.indexOf('/* dsh-merge:end */'));
  assert.doesNotMatch(own, /window\.(prompt|confirm|alert)|[^.\w](prompt|confirm|alert)\(/);
  const css = NOTIFY.slice(NOTIFY.indexOf('const NS'), NOTIFY.indexOf('const REASONS'));
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,6}\b|\brgba?\(/);
});
