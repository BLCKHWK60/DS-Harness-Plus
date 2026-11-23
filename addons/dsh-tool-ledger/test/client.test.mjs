// The Tool use page explains itself: every control and every list heading has an (i) with what it does (docs/UI-STYLE.md, "Explaining itself").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

/** What the summary route gives, with one row in each list so every heading is drawn. */
const DATA = {
  enabled: true,
  keepDays: 365,
  tabs: [{ id: 'chat', label: 'Chat' }],
  plain: {},
  totals: { calls: 3, requests: 0, conversations: 1, tools: 1 },
  askedButOff: [{ tool: 'bash', tab: 'chat', count: 2, allowed: 0, state: 'off' }],
  loadedNeverUsed: [{ tool: 'pdf_read', tab: 'chat', conversations: 3 }],
  reserveAlwaysCalled: [{ tool: 'grep', tab: 'chat', conversations: 3, of: 3 }],
  refusedMost: [{ tool: 'bash', tab: 'chat', rule: 'not-offered', count: 2 }],
  tools: [{ tool: 'read', total: 3, outcomes: { ran: 3 }, tabs: { chat: { total: 3, outcomes: { ran: 3 } } } }],
};

/** A stand-in React: elements are plain objects; the page's first state is the loaded summary. */
const React = {
  createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), children } }),
  Fragment: 'fragment',
  useCallback: (fn) => fn,
  useEffect() {},
  useMemo: (fn) => fn(),
  useRef: () => ({ current: null }),
  useState: (value) => [value && typeof value === 'object' && 'loading' in value ? { loading: false, data: DATA, error: null } : value, () => {}],
};

/** Load the page and draw it once, every component expanded. */
function render() {
  let loaded;
  const window = { __ModuleLoader__: { load: (module) => { loaded = module; } } };
  const document = { baseURI: 'http://localhost/', getElementById: () => ({}), hidden: false };
  new Function('window', 'document', SOURCE)(window, document); // eslint-disable-line no-new-func
  const plugin = loaded.factory(() => React);
  let page;
  plugin.apply({ effect: (fn) => fn(), slots: { inject: (_name, fn) => fn(), register: (_entry, draw) => { page = draw; return () => {}; } } });
  const expand = (node) => {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') return expand(node.type({ ...node.props, children: node.props.children.length === 1 ? node.props.children[0] : node.props.children }));
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  };
  return expand(page({}));
}

/** Every element of a drawn tree, in order. */
function flat(node, out = []) {
  if (Array.isArray(node)) node.forEach((one) => flat(one, out));
  else if (node && typeof node === 'object') { out.push(node); flat(node.props.children, out); }
  return out;
}
const textOf = (node) => (Array.isArray(node) ? node.map(textOf).join('') : node && typeof node === 'object' ? textOf(node.props.children) : node == null || node === false ? '' : String(node));

test('every control and list heading on the Tool use page has an (i)', () => {
  const all = flat(render());
  const infos = all.filter((node) => node.props.className === 'dshu-info').map((node) => node.props['aria-label']);
  const want = [
    'Record tool use', 'Keep records for', 'Time range', 'Mode', 'Refresh',
    'Asked for often but off', 'Loaded but never used', 'Held in reserve but always called', 'Refused most', 'Every tool',
    'Table (CSV)', 'Data (JSON)', 'Start fresh',
  ];
  for (const name of want) assert.ok(infos.includes(`About ${name}`), `(i) for ${name}`);
  assert.ok(!infos.includes('About this'), 'every (i) names its control');
});

test('each (i) sits next to its control, and says what it does', () => {
  const all = flat(render());
  // The bar: range picker, tab filter and Refresh, each followed by its own (i).
  const bar = all.find((node) => node.props.className === 'dsh-tl-bar');
  const kids = flat(bar.props.children).filter((node) => node.props.className === 'dsh-tl-seg' || node.type === 'select' || node.props.className === 'dshu-btn' || node.props.className === 'dshu-info');
  const order = kids.map((node) => (node.props.className === 'dshu-info' ? node.props['aria-label'] : node.type === 'select' ? 'select' : node.props.className === 'dsh-tl-seg' ? 'range' : textOf(node)));
  assert.deepEqual(order.filter((one) => ['range', 'select', 'Refresh'].includes(one) || one.startsWith('About')), ['range', 'About Time range', 'select', 'About Mode', 'Refresh', 'About Refresh']);
  // The two downloads, each with its own (i).
  const links = all.filter((node) => node.type === 'a');
  assert.deepEqual(links.map(textOf), ['Table (CSV)', 'Data (JSON)']);
  // The texts: a "what" line for every (i).
  const INFO = SOURCE.slice(SOURCE.indexOf('const INFO = {'), SOURCE.indexOf('const ruleWords'));
  for (const key of ['record', 'keep', 'range', 'tab', 'refresh', 'csv', 'json', 'fresh', 'asked', 'idle', 'reserve', 'refused', 'every']) {
    assert.match(INFO, new RegExp(`\\n      ${key}: \\{\\n        what: '`), `what for ${key}`);
  }
});

test('the (i) of the two suggestion lists names exactly the tools the filter leaves out', async () => {
  const { STATE_ONLY_TOOLS } = await import('../lib/families.js');
  const INFO = SOURCE.slice(SOURCE.indexOf('const INFO = {'), SOURCE.indexOf('const ruleWords'));
  const what = (key) => INFO.match(new RegExp(`\\n      ${key}: \\{\\n        what: '((?:[^'\\\\]|\\\\.)*)'`))[1];
  // One tool is left out, Mission's step tool; the words say so, and never "Mission's own tools" or "no run or mode".
  assert.deepEqual([...STATE_ONLY_TOOLS], ['mission_step'], 'the list changed: change the (i) words of "asked" and "refused" too');
  for (const key of ['asked', 'refused']) {
    assert.match(what(key), /Mission\\'s step tool is left out when the mode did not offer it/, key);
    assert.doesNotMatch(what(key), /own tools|no Mission run or mode/, key);
  }
  assert.match(what('refused'), /When something else stopped it, it is listed\./);
  // "Loaded but never used" counts a tool whose calls were all turned down: the words say "never got to use".
  assert.match(what('idle'), /never got to use/);
  assert.doesNotMatch(SOURCE, /that the assistant never called/);
});

test('the page reads the records again when its window gets the focus back, not only when it was hidden', async () => {
  const listeners = { window: {}, document: {} };
  const on = (where) => (name, fn) => { (listeners[where][name] ??= []).push(fn); };
  const effects = [];
  const ReactLive = { ...React, useEffect: (fn) => { effects.push(fn); } };
  let loaded;
  const window = { __ModuleLoader__: { load: (module) => { loaded = module; } }, addEventListener: on('window'), removeEventListener() {} };
  const document = { baseURI: 'http://localhost/', getElementById: () => ({}), hidden: false, addEventListener: on('document'), removeEventListener() {} };
  new Function('window', 'document', SOURCE)(window, document); // eslint-disable-line no-new-func
  const plugin = loaded.factory(() => ReactLive);
  let page;
  plugin.apply({ effect: (fn) => fn(), slots: { inject: (_name, fn) => fn(), register: (_entry, draw) => { page = draw; return () => {}; } } });
  const expand = (node) => {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') return expand(node.type({ ...node.props, children: node.props.children.length === 1 ? node.props.children[0] : node.props.children }));
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  };
  const fetched = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { fetched.push(String(url)); return { ok: true, json: async () => DATA }; };
  try {
    expand(page({}));
    for (const fn of effects) {
      try { fn(); } catch { /* an effect that needs a real page */ }
    }
    const summary = () => fetched.filter((url) => url.includes('summary')).length;
    const before = summary();
    assert.ok((listeners.window.focus ?? []).length > 0, 'a focus listener on the window');
    for (const fn of listeners.window.focus) fn();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.ok(summary() > before, 'focus reads the records again');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('one name, Mission (stage B, 19 November): the (i) texts never say "Long run"', () => {
  assert.doesNotMatch(SOURCE, /Long run/);
  assert.equal(SOURCE.split('only offered while a Mission runs.').length - 1, 2);
});

test('Mission stage E: the refusals of the repair helper and of the assistant while a Mission is paused are said in plain words', () => {
  assert.match(SOURCE, /'mission-repair': \['the Mission\\'s repair helper may not ask for more access, start helpers or work in the background', '', ''\]/);
  assert.match(SOURCE, /'mission-assistant': \['a Mission is paused in this thread, and its settings let the assistant only talk or look things up', '', ''\]/);
});
