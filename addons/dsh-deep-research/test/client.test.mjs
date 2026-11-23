// Deep research's settings page and its merge with Research: one Research page when both add-ons are there,
// its own page when it is alone, and the same page again if Research goes away.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Config } from '../index.js';

const DEEP = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const RESEARCH = readFileSync(new URL('../../dsh-research/client.js', import.meta.url), 'utf8');

/** A stand-in for the page's React: elements are plain objects, state hooks hold their first value. */
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: 'fragment',
  useState: (value) => [value, () => {}],
  useEffect() {},
  useRef: () => ({ current: true }),
};

/** Load a client file into the shared fake `window`, start it on a stand-in app and return what it registered. */
function start(source, win) {
  let loaded;
  win.__ModuleLoader__ = { load: (module) => { loaded = module; } };
  new Function('window', source)(win); // eslint-disable-line no-new-func
  const plugin = loaded.factory((name) => (name === 'react' ? React : { createPortal: () => null }));
  const pages = new Map();
  const stops = [];
  const ctx = {
    locale: { register: () => () => {}, bind: () => (key) => (key === 'section.title' ? (loaded.id.includes('deep') ? 'Deep research' : 'Research') : key) },
    slots: {
      inject: (_name, fn) => fn(),
      register: (entry, render) => {
        pages.set(entry.id, { entry, render });
        return () => pages.delete(entry.id);
      },
    },
    remote: {},
    effect(fn) {
      const stop = fn();
      if (typeof stop === 'function') stops.push(stop);
      return stop;
    },
  };
  plugin.apply(ctx);
  return { pages, stop: () => stops.splice(0).forEach((fn) => fn()), loaded };
}

/** Every field of the Config down to its leaves, as dotted path -> schema. */
function leaves(schema, prefix = []) {
  const out = new Map();
  for (const [key, child] of Object.entries(schema.dict ?? {})) {
    if (child.dict) for (const [path, leaf] of leaves(child, [...prefix, key])) out.set(path, leaf);
    else out.set([...prefix, key].join('.'), child);
  }
  return out;
}

test('its engine settings can be changed from the page (every field the page saves is volatile; only the tool name is file-only)', () => {
  const all = leaves(Config);
  assert.ok(all.size >= 14, 'the whole Config is walked, nested fields included');
  for (const [path, schema] of all) {
    if (path === 'toolName') assert.notEqual(schema.meta?.volatile, true, 'the tool\'s name stays a file-only setting');
    else assert.equal(schema.meta?.volatile, true, `${path} is volatile`);
  }
  // Every save() the page makes points at a real, volatile field.
  const saved = [...DEEP.matchAll(/save\(\[((?:'[A-Za-z]+'(?:, )?)+)\]/g)].map((match) => match[1].replace(/'/g, '').split(', ').join('.'));
  assert.ok(saved.length >= 5, 'the page saves its fields');
  for (const path of saved) assert.equal(all.get(path)?.meta?.volatile, true, `the page saves ${path}`);
});

test('alone, Deep research shows its own page; the saved defaults are unchanged', () => {
  const win = {};
  const { pages, loaded } = start(DEEP, win);
  assert.equal(loaded.id, '@local/dsh-deep-research');
  assert.deepEqual([...pages.keys()], ['deep-research']);
  assert.equal(pages.get('deep-research').entry.label(), 'Deep research');
  assert.equal(win.__dshMerge.parts.research['deep-research'].order, 200);
  const page = pages.get('deep-research').render({});
  assert.ok(page);
  assert.equal(Config.dict.maxMinutes.meta.default, 60);
  assert.equal(Config.dict.maxSources.meta.default, 120);
  assert.equal(Config.dict.requireFetched.meta.default, false);
  assert.equal(Config.dict.roles.dict.searcher.meta.volatile, true);
  assert.equal(Config.dict.wide.dict.maxRows.meta.volatile, true);
});

test('with Research present, its own page is withdrawn and the part is offered to Research', () => {
  const win = {};
  const deep = start(DEEP, win);
  assert.equal(deep.pages.size, 1);
  const research = start(RESEARCH, win);
  assert.ok(research.pages.has('research'));
  assert.equal(deep.pages.size, 0, 'no second page in the list');
  const part = win.__dshMerge.parts.research['deep-research'];
  assert.equal(part.label(), 'Advanced: research engine');
  assert.ok(part.render({ appCtx: {} }));
  // Research is switched off again: Deep research brings its own page back.
  research.stop();
  assert.equal(deep.pages.size, 1);
});

test('Deep research loaded after Research never shows a page of its own', () => {
  const win = {};
  start(RESEARCH, win);
  const deep = start(DEEP, win);
  assert.equal(deep.pages.size, 0);
});

test('Research alone has no Advanced group', () => {
  const win = {};
  const research = start(RESEARCH, win);
  assert.ok(research.pages.has('research'));
  assert.deepEqual(Object.keys(win.__dshMerge.parts.research ?? {}), []);
});

test('no question box or raw error text in the page', () => {
  assert.ok(!/window\.(prompt|confirm|alert)\(/.test(DEEP));
  // The shared blocks (dsh-kit, dsh-ui) are checked by their own tests; their one fixed colour is the shadow's black, which UI-STYLE allows.
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(DEEP.split('dsh-ui:end')[1].split('dsh-merge:begin')[0] + DEEP.split('dsh-merge:end')[1]));
});

test('Settings search can open the Advanced group: openTab reaches the host, before or after it mounts', () => {
  const research = RESEARCH.slice(RESEARCH.indexOf('function AdvancedParts'), RESEARCH.indexOf('function ResearchPage'));
  assert.match(research, /dshMerge\.useTab\(React, 'research'\)/);
  assert.match(research, /if \(tab !== 'main'\) setOpen\(true\)/);

  // A tiny hook runtime, to run the shared useTab as the page does.
  const run = (win, before) => {
    const states = [];
    let index = 0;
    const effects = [];
    const mini = {
      useState: (first) => { const i = index++; if (!(i in states)) states[i] = first; return [states[i], (v) => { states[i] = v; }]; },
      useEffect: (fn) => effects.push(fn),
    };
    const merge = new Function('window', `${DEEP.slice(DEEP.indexOf('const dshMerge'), DEEP.indexOf('/* dsh-merge:end */'))}; return dshMerge;`)(win);
    merge.part('research', 'deep-research', { label: () => 'x', render: () => null });
    if (before) merge.openTab('research', 'deep-research');
    const render = () => { index = 0; effects.length = 0; const r = merge.useTab(mini, 'research'); return r[0]; };
    let tab = render();
    effects.splice(0).forEach((fn) => fn()); // mount effects: subscribe, read a waiting request
    tab = render();
    return { merge, render, effects, get tab() { return tab; }, set: () => { tab = render(); } };
  };
  // Asked before the page mounts.
  const early = run({}, true);
  assert.equal(early.tab, 'deep-research');
  // Asked while the page is open.
  const live = run({}, false);
  assert.equal(live.tab, 'main');
  live.merge.openTab('research', 'deep-research');
  live.set();
  assert.equal(live.tab, 'deep-research');
});
