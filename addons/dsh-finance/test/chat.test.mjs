/**
 * The selection in the chat box of a Finance conversation (client.js), rendered without a browser:
 * the module is loaded in a sandbox, a small stand-in for React runs its hooks, and fetch answers
 * as the add-on's route does. It checks what is shown and what is sent; it is not a test of React.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { setImmediate as tick } from 'node:timers/promises';
import vm from 'node:vm';

// ---- a small stand-in for React: hooks are kept per place in the tree -------------------------

const states = new Map();
let current = null;
const React = {
  Fragment: 'fragment',
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, key: props?.key, children: children.flat(Infinity) };
  },
  useState(initial) {
    const index = current.index++;
    const slot = current.hooks[index] ?? (current.hooks[index] = { value: typeof initial === 'function' ? initial() : initial });
    return [slot.value, (next) => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
  },
  useEffect(effect, deps) {
    const index = current.index++;
    const slot = current.hooks[index] ?? (current.hooks[index] = {});
    const changed = !('deps' in slot) || deps.length !== slot.deps.length || deps.some((one, n) => !Object.is(one, slot.deps[n]));
    if (!changed) return;
    slot.cleanup?.();
    slot.deps = deps;
    const cleanup = effect();
    slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
  },
  useRef(initial) {
    const index = current.index++;
    if (!(index in current.hooks)) current.hooks[index] = { current: initial };
    return current.hooks[index];
  },
};

const walk = (node, path = 'root') => {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap((child, n) => walk(child, `${path}.${n}`));
  if (typeof node === 'string' || typeof node === 'number') return [{ text: String(node) }];
  if (typeof node.type === 'function') {
    const place = `${path}/${node.type.name}|${node.key ?? ''}`;
    if (!states.has(place)) states.set(place, []);
    const outer = current;
    current = { hooks: states.get(place), index: 0 };
    const out = walk(node.type(node.props), place);
    current = outer;
    return out;
  }
  return [{ element: node, children: node.children.flatMap((child, n) => walk(child, `${path}.${node.key ?? n}`)) }];
};
const elements = (nodes) => nodes.flatMap((node) => (node.element ? [node.element, ...elements(node.children)] : []));
const text = (nodes) => nodes.flatMap((node) => (node.text !== undefined ? [node.text] : node.children ? [text(node.children)] : [])).join(' ');

// ---- the module in a sandbox, with the route's answers ----------------------------------------

const VIEW = (selection, shown = true) => ({
  enabled: true,
  kinds: [{ id: 'company', label: 'Company' }, { id: 'sector', label: 'Sector' }, { id: 'economy', label: 'Economy' }, { id: 'market', label: 'Whole market' }],
  markets: ['Global', 'United States', 'Europe'],
  focuses: [{ id: 'full', label: 'Full picture', about: 'the full picture' }, { id: 'news', label: 'News', about: 'what the news is reporting' }],
  periods: [{ id: 'quarter', label: 'Latest quarter', about: 'the latest quarter' }, { id: 'year', label: '1 year', about: 'the last year' }],
  watchlist: ['NVIDIA', 'ASML'],
  session: { id: 's1', shown, pinned: shown, selection },
});

function load() {
  const calls = [];
  let answer = VIEW({ kind: 'company', subject: 'NVIDIA', market: 'United States', focus: 'full', period: 'year' });
  const sandbox = {
    window: { __ModuleLoader__: { load: (module) => { sandbox.module = module; } }, innerWidth: 1200, innerHeight: 800 },
    document: { hidden: false, baseURI: 'http://127.0.0.1:1/', body: {}, documentElement: { style: { setProperty() {}, removeProperty() {} } }, addEventListener() {}, removeEventListener() {} },
    fetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : undefined;
      calls.push({ url: String(url), method: options.method ?? 'GET', body });
      if (body?.action === 'pin') answer = { ...answer, session: { ...answer.session, pinned: true, selection: { ...answer.session.selection, ...body.values } } };
      return { ok: true, json: async () => answer };
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
    URL,
  };
  vm.runInNewContext(readFileSync(join(import.meta.dirname, '..', 'client.js'), 'utf8'), sandbox);
  const slots = new Map();
  sandbox.module.factory((name) => {
    if (name === 'react') return React;
    if (name === 'react-dom') return { createPortal: (node) => node };
    throw new Error(`unexpected require(${name})`);
  }).apply({
    effect: (start) => start(),
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: { inject: (_name, use) => use(), register: (decl, component) => slots.set(decl.name, { decl, component }) },
    remote: { settings: {} },
  });
  return { slots, calls, set: (next) => { answer = next; } };
}

const find = (tree, test) => elements(tree).find(test);
const settle = async () => { for (let i = 0; i < 5; i += 1) await tick(); };

test('the chat box shows the selection of a started Finance conversation, and nothing elsewhere', async () => {
  states.clear();
  const app = load();
  const slot = app.slots.get('conversation.input.left');
  assert.equal(slot.decl.id, 'finance-selection');
  const draw = () => walk(React.createElement(slot.component, { sessionId: 's1' }));
  assert.deepEqual(draw(), []);
  await settle();
  const tree = draw();
  assert.equal(app.calls[0].url, 'http://127.0.0.1:1/dsh-finance/data?session=s1');
  const group = find(tree, (el) => el.props.role === 'group');
  assert.equal(group.props['aria-label'], 'What this Finance conversation is about');
  assert.match(text(tree), /Company .*United States .*Full picture .*1 year/);
  assert.equal(find(tree, (el) => el.type === 'input').props.value, 'NVIDIA');
  assert.deepEqual(find(tree, (el) => el.type === 'datalist').children.map((option) => option.props.value), ['NVIDIA', 'ASML']);
  // Before the first message, or in another mode's conversation, the route says not to show it.
  states.clear();
  const other = load();
  other.set(VIEW({ kind: 'company', subject: '', market: 'Global', focus: 'full', period: 'year' }, false));
  const hidden = other.slots.get('conversation.input.left');
  walk(React.createElement(hidden.component, { sessionId: 's1' }));
  await settle();
  assert.deepEqual(walk(React.createElement(hidden.component, { sessionId: 's1' })), []);
});

test('a pick in the chat box is sent as this conversation\'s selection and shown at once', async () => {
  states.clear();
  const app = load();
  const slot = app.slots.get('conversation.input.left');
  const draw = () => walk(React.createElement(slot.component, { sessionId: 's1' }));
  draw();
  await settle();
  // Open the Market list and choose Europe.
  find(draw(), (el) => el.props['aria-label'] === 'Market: United States').props.onClick();
  const list = draw();
  // The note is read again before every step, so a change reaches a reply that is still running.
  assert.match(text(list), /For this conversation only, from the assistant's next step\./);
  assert.ok(!/next message/.test(text(list)), text(list));
  // The subject box's tooltip carries the same note.
  assert.match(find(list, (el) => el.type === 'input').props.title, /from the assistant's next step/);
  find(list, (el) => el.props.role === 'option' && text([{ children: walk(el.children) }]).includes('Europe')).props.onClick();
  // Shown at once, before the answer comes back.
  assert.ok(find(draw(), (el) => el.props['aria-label'] === 'Market: Europe'));
  await settle();
  const sent = app.calls.filter((call) => call.method === 'POST');
  assert.deepEqual(sent.map((call) => call.body), [{ action: 'pin', sessionId: 's1', values: { market: 'Europe' } }]);
  assert.ok(find(draw(), (el) => el.props['aria-label'] === 'Market: Europe'));
  // The subject: typed, then saved when the box is left.
  let input = find(draw(), (el) => el.type === 'input');
  input.props.onChange({ target: { value: '  ASML ' } });
  input = find(draw(), (el) => el.type === 'input');
  assert.equal(input.props.value, '  ASML ');
  input.props.onBlur();
  await settle();
  assert.deepEqual(app.calls.filter((call) => call.method === 'POST').at(-1).body, { action: 'pin', sessionId: 's1', values: { subject: 'ASML' } });
  assert.equal(find(draw(), (el) => el.type === 'input').props.value, 'ASML');
  // Escape leaves the box without saving what was typed. The browser's blur reaches the handler
  // of the drawing that was on screen, which still holds the typed text.
  input = find(draw(), (el) => el.type === 'input');
  input.props.onChange({ target: { value: 'Something else' } });
  const typed = find(draw(), (el) => el.type === 'input');
  typed.props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {}, target: { blur: () => typed.props.onBlur() } });
  await settle();
  assert.equal(app.calls.filter((call) => call.method === 'POST').length, 2);
  assert.equal(find(draw(), (el) => el.type === 'input').props.value, 'ASML');
});

test('the Settings page and the settings index say what the notes say', () => {
  const client = readFileSync(join(import.meta.dirname, '..', 'client.js'), 'utf8');
  // Good to know, on Tools off: the period of a remembered figure, never a source or an "as of" date.
  assert.match(client, /to say which period it is for when it knows, and never to give it a source or an "as of" date\./);
  const row = client.match(/'Selection in the chat box'\),\s*h\('div', \{ className: 'dsh-fn-rowdesc' \}, '((?:[^'\\]|\\.)*)'/);
  assert.ok(row, 'the Settings row is there');
  assert.match(row[1], /applies from the assistant\\'s next step/);
  assert.ok(!/next message/.test(row[1]), row[1]);
  const index = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'dsh-settings-plus', 'settings-index.json'), 'utf8'));
  const entry = index.find((one) => one.page === 'finance' && one.label === 'Selection in the chat box');
  assert.match(entry.description, /from the assistant's next step/);
  assert.ok(!/next message/.test(entry.description), entry.description);
});

test('a conversation opened by a scheduled brief keeps that kind on offer', async () => {
  states.clear();
  const app = load();
  app.set(VIEW({ kind: 'brief', subject: 'ASML', market: 'Europe', focus: 'full', period: 'year' }));
  const slot = app.slots.get('conversation.input.left');
  const draw = () => walk(React.createElement(slot.component, { sessionId: 's1' }));
  draw();
  await settle();
  find(draw(), (el) => el.props['aria-label'] === 'Kind of subject: Scheduled brief').props.onClick();
  assert.match(text(draw()), /Company .*Sector .*Economy .*Whole market .*Scheduled brief/);
});
