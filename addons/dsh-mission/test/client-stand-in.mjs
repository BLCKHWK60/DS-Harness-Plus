// Point 17 (owner, 20 November 2026): the small stand-in for React and the page that the client tests draw with, the same as
// in test/questions-client.test.mjs (copied there too; that file keeps its own copy). Not a test file itself.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

export const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

/** A small React stand-in: function components with useState, useRef, useEffect (run after each pass). */
export function makeReact() {
  const stores = new Map();
  let current = null;
  let dirty = false;
  let effects = [];
  const slot = (make) => { const c = current; const i = c.i++; if (!(i in c.hooks)) c.hooks[i] = make(); return c.hooks[i]; };
  const effect = (fn, deps) => {
    const s = slot(() => ({ deps: undefined, cleanup: undefined, first: true }));
    if (s.first || !deps || deps.length !== s.deps.length || deps.some((d, k) => !Object.is(d, s.deps[k]))) {
      s.first = false; s.deps = deps;
      effects.push(() => { if (typeof s.cleanup === 'function') s.cleanup(); s.cleanup = fn(); });
    }
  };
  const React = {
    Fragment: Symbol('Fragment'),
    createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), children: children.flat(Infinity) } }),
    useState: (init) => { const s = slot(() => ({ v: typeof init === 'function' ? init() : init })); return [s.v, (n) => { const v = typeof n === 'function' ? n(s.v) : n; if (!Object.is(v, s.v)) { s.v = v; dirty = true; } }]; },
    useRef: (init) => slot(() => ({ current: init })),
    useEffect: effect,
    useLayoutEffect: effect,
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useId: () => current.key.replace(/\W/g, ''),
  };
  let hostRef = () => ({});
  const draw = (node, path) => {
    if (node == null || node === false || node === true) return null;
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map((one, k) => draw(one, `${path}.${k}`)).filter((one) => one !== null);
    if (typeof node.type === 'function') {
      const key = `${path}>${node.type.name || 'c'}`;
      const before = current;
      current = { key, i: 0, hooks: stores.get(key) ?? [] };
      stores.set(key, current.hooks);
      const out = node.type(node.props);
      current = before;
      return draw(out, key);
    }
    if (node.type === React.Fragment) return draw(node.props.children, path);
    const host = { type: node.type, props: node.props, children: [].concat(draw(node.props.children, `${path}/${node.type}`) ?? []).flat(Infinity) };
    if (node.props.ref) node.props.ref.current = hostRef(host);
    return host;
  };
  let root = null;
  const render = (element) => {
    let tree = null;
    for (let pass = 0; pass < 30; pass += 1) {
      dirty = false;
      tree = draw(element, 'root');
      const run = effects; effects = [];
      for (const fn of run) fn();
      if (!dirty) break;
    }
    root = tree;
    return tree;
  };
  return { React, render, setHostRef: (fn) => { hostRef = fn; }, tree: () => root };
}
export const textOf = (node) => (node == null ? '' : Array.isArray(node) ? node.map(textOf).join('') : typeof node === 'string' ? node : (node.children ?? []).map(textOf).join(''));
export const findAll = (node, test, out = []) => { if (Array.isArray(node)) { for (const one of node) findAll(one, test, out); return out; } if (node && typeof node === 'object') { if (test(node)) out.push(node); for (const kid of node.children ?? []) findAll(kid, test, out); } return out; };
export const byClass = (tree, name) => findAll(tree, (node) => String(node.props?.className ?? '').split(' ').includes(name));
export const buttonsOf = (tree) => findAll(tree, (node) => node.type === 'button').map((node) => ({ node, text: textOf(node), label: node.props['aria-label'] }));
export const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

/** The page file in a stand-in page: a window, a chat box (seat) with its editor, and the route. */
/** The page file in a stand-in page: a window, a chat box (seat) with its editor, and the route. */
/** `appCtx`: more of the app's context (remote settings, get), for the Settings page. */
export function loadPage(route, store = new Map(), appCtx = {}) {
  const fake = makeReact();
  const win = new EventTarget();
  const attrs = (target) => { const map = new Map(); Object.assign(target, { getAttribute: (k) => (map.has(k) ? map.get(k) : null), setAttribute: (k, v) => map.set(k, String(v)), removeAttribute: (k) => map.delete(k), hasAttribute: (k) => map.has(k) }); return target; };
  const html = attrs({});
  html.setAttribute('data-dsh-uniform', 'true');
  html.setAttribute('data-dsh-long-run', '');
  const editor = { innerText: '', focus() {}, contains: (node) => node === editor };
  const seatEvents = new EventTarget();
  const seat = attrs({
    addEventListener: (...args) => seatEvents.addEventListener(...args),
    removeEventListener: (...args) => seatEvents.removeEventListener(...args),
    dispatch: (event) => seatEvents.dispatchEvent(event),
    querySelector: (selector) => (selector === '[data-composer-input]' ? editor : selector === '.dsh-ms-runbtn-wrap' ? {} : null),
  });
  const sendButton = { clicks: 0, disabled: false, getAttribute: () => 'false', querySelector: () => null, closest: () => null, click() { this.clicks += 1; } };
  fake.setHostRef(() => ({ closest: (selector) => (selector === '[data-composer-seat]' ? seat : null), parentElement: { querySelectorAll: () => [sendButton], querySelector: () => ({ textContent: editor.innerText }), parentElement: null } }));
  const calls = [];
  const asked = [];
  // The confirmation box (dshKit.ask) is drawn into this stand-in page; it is answered yes and recorded.
  const element = () => {
    const el = { attrs: {}, kids: [], on: {}, style: {}, className: '', textContent: '' };
    Object.assign(el, {
      setAttribute: (k, v) => { el.attrs[k] = String(v); },
      appendChild: (kid) => { el.kids.push(kid); return kid; },
      addEventListener: (type, fn) => { (el.on[type] ??= []).push(fn); },
      remove() {}, focus() {}, select() {}, querySelectorAll: () => [],
    });
    return el;
  };
  const findOk = (el) => (el?.attrs?.['data-main'] === 'true' ? el : (el?.kids ?? []).map(findOk).find(Boolean));
  const textsOf = (el) => [el?.textContent ?? '', ...(el?.kids ?? []).flatMap(textsOf)].filter(Boolean);
  const body = {
    appendChild: (veil) => {
      asked.push(textsOf(veil).join('\n'));
      const ok = findOk(veil);
      setTimeout(() => { for (const fn of ok?.on?.click ?? []) fn(); }, 0);
      return veil;
    },
  };
  const document = {
    documentElement: html, baseURI: 'http://dsh.local/', hidden: false, body, head: { appendChild() {} },
    getElementById: () => null, createElement: element,
    addEventListener() {}, removeEventListener() {},
    querySelector: (selector) => (selector === '[data-trigger-menu]' && page.popup ? {} : null),
    execCommand: (command) => { if (command === 'delete') editor.innerText = ''; return true; },
  };
  const fetch = async (url, options = {}) => {
    const method = options.method ?? 'GET';
    const body = method === 'POST' ? JSON.parse(options.body) : Object.fromEntries(new URL(url).searchParams);
    calls.push({ method, body });
    const { status = 200, json } = route(method, body) ?? {};
    return { ok: status < 400, status, json: async () => json };
  };
  let loaded;
  Object.assign(win, { __ModuleLoader__: { load: (module) => { loaded = module; } }, localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) } });
  // The page's polling loops keep looking; their timers must not keep the test run alive.
  const loose = (make) => (fn, ms) => { const timer = make(fn, ms); timer?.unref?.(); return timer; };
  vm.runInNewContext(client, { window: win, document, fetch, URL, setTimeout: loose(setTimeout), clearTimeout, setInterval: loose(setInterval), clearInterval, CustomEvent, Event, EventTarget, console, Promise });
  const plugin = loaded.factory((name) => (name === 'react' ? fake.React : {}));
  const parts = {};
  const ctx = {
    effect: (fn) => fn(),
    locale: { register() {}, bind: () => (key) => key },
    slots: { inject: (_name, fn) => fn(), register: (spec, component) => { parts[spec.id] = component; return () => {}; } },
    get: () => undefined,
    ...appCtx,
  };
  plugin.apply(ctx);
  // The confirmation box (dshKit.ask) is drawn in the page; here it is answered yes and recorded.
  const page = { fake, win, html, seat, editor, sendButton, calls, asked, parts, popup: false, store };
  return page;
}

/** The text between two markers of the page file (a tested pure block). */
export const between = (from, to) => { const a = client.indexOf(from); const b = client.indexOf(to, a + from.length); if (!(a >= 0 && b > a)) throw new Error(`${from} … ${to}`); return client.slice(a, b); };
/** Runs a pure block on its own and returns the names asked for. */
export const pureBlock = (name, names) => new Function(`${between(`// ---- ${name}:begin`, `// ---- ${name}:end`)}\nreturn { ${names.join(', ')} };`)();
export const posts = (page) => page.calls.filter((c) => c.method === 'POST').map((c) => c.body);
/** A strip as the route sends it (stage E fields included: `assistant` '' and `carryOn` null are what an older card means). */
export const stripOf = (state, extra = {}) => ({ state, main: { running: 'note', waiting: 'answer', paused: 'resume', problem: 'resume' }[state] ?? 'send', questions: [], late: [], timeQuestion: null, canContinue: false, canFinishLap: false, problem: null, pausedBy: '', retryAt: 0, noTimeLimit: false, down: null, repair: null, repairs: [], carriedOn: 0, assistant: '', carryOn: null, ...extra });
export const runAt = (now, extra = {}) => ({ id: 'r1', kind: 'long', status: 'running', steps: 4, stepsAbout: 20, items: [{ id: '3', title: 'Format the files', status: 'verified' }], deadline: now + 3600000, pausedAt: 0, endedAt: 0, continues: 0, showFrom: 0, phase: 'work', ...extra });
export const cardWith = (state, run, strip = {}, extra = {}) => ({ at: Date.now(), stamp: `q.${Math.random()}`, run, runButton: true, armed: false, busy: false, startError: null, hasThread: true, preflight: { ok: true, ticks: [] }, saved: { minutes: 60, laps: 0, steps: 0, tools: { files: true, web: false } }, strip: stripOf(state, strip), ...extra });
/** Draws one part (by its slot id) twice, so its effects ran and its first look came back. */
export async function drawPart(page, id, props = { sessionId: 's1' }) {
  const element = page.fake.React.createElement(page.parts[id], props);
  page.fake.render(element);
  await tick();
  return page.fake.render(element);
}
export const redrawPart = (page, id, props = { sessionId: 's1' }) => page.fake.render(page.fake.React.createElement(page.parts[id], props));
export const buttonText = (tree, text) => buttonsOf(tree).find((b) => b.text === text);
export const clockOf = (ms) => { const at = new Date(ms); return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`; };
