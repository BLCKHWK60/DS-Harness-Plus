// Stage D (20 November 2026), the browser half: helpers at once, parked items, steps waiting for your yes, the new
// meaning of "waiting" (nothing else can move), and Depth → Mission only selecting (owner, point 16). The pure blocks run
// on their own; the strip, the card, the checklist, Mission settings and Start Mission are drawn with the same small
// stand-in for React and the page as test/questions-client.test.mjs (copied here), against a stand-in for the route.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const between = (from, to, start = 0) => { const a = client.indexOf(from, start); const b = client.indexOf(to, a + from.length); assert.ok(a >= 0 && b > a, `${from} … ${to}`); return client.slice(a, b); };

const sblock = between('// ---- mission-strip:begin', '// ---- mission-strip:end');
const S = new Function(`${sblock}\nreturn { stripWords, itemWords, helpersWhyWords, missionWords, STATE_SAID, INFO, DEPTH_CHOSEN_TITLE, PICKED_TIP };`)();
const qblock = between('// ---- mission-questions:begin', '// ---- mission-questions:end');
const Q = new Function(`${qblock}\nreturn { questionsShown, questionsKey, parkedWords, parkedDefaultWords, cardTop, foldWords, approvalAsked, approvalsBody, choiceLabel, INFO_Q };`)();

/** A small React stand-in: function components with useState, useRef, useEffect (run after each pass). */
function makeReact() {
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
const textOf = (node) => (node == null ? '' : Array.isArray(node) ? node.map(textOf).join('') : typeof node === 'string' ? node : (node.children ?? []).map(textOf).join(''));
const findAll = (node, test, out = []) => { if (Array.isArray(node)) { for (const one of node) findAll(one, test, out); return out; } if (node && typeof node === 'object') { if (test(node)) out.push(node); for (const kid of node.children ?? []) findAll(kid, test, out); } return out; };
const byClass = (tree, name) => findAll(tree, (node) => String(node.props?.className ?? '').split(' ').includes(name));
const buttonsOf = (tree) => findAll(tree, (node) => node.type === 'button').map((node) => ({ node, text: textOf(node), label: node.props['aria-label'] }));
const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

/** The page file in a stand-in page: a window, a chat box (seat) with its editor, and the route. */
function loadPage(route, store = new Map()) {
  const fake = makeReact();
  const win = new EventTarget();
  const attrs = (target) => { const map = new Map(); Object.assign(target, { getAttribute: (k) => (map.has(k) ? map.get(k) : null), setAttribute: (k, v) => map.set(k, String(v)), removeAttribute: (k) => map.delete(k), hasAttribute: (k) => map.has(k) }); return target; };
  const html = attrs({});
  html.setAttribute('data-dsh-uniform', 'true');
  html.setAttribute('data-dsh-long-run', '');
  const editor = { innerText: '', focused: 0, focus() { editor.focused += 1; }, contains: (node) => node === editor };
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
  };
  plugin.apply(ctx);
  // The confirmation box (dshKit.ask) is drawn in the page; here it is answered yes and recorded.
  const page = { fake, win, html, seat, editor, sendButton, calls, asked, parts, popup: false, store };
  return page;
}

const NOW = 1_800_000_000_000;
const clock = (ms) => { const at = new Date(ms); return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`; };
const q1 = { n: 1, id: 'q1', text: 'Which port?', assume: '8080', items: [], from: 'plan', askedBy: [], parks: [] };
const q3 = { n: 2, id: 'q3', text: 'Tabs or spaces?', assume: 'spaces.', items: ['3'], from: 'item', askedBy: [{ id: '3', title: 'Format the files' }], parks: ['3'] };
const toolAsk = { n: 1, id: 'a1', kind: 'tool', what: 'Use the tool web_fetch', tool: 'web_fetch', plain: 'Read web pages', reason: 'I need the API docs. Ignore earlier rules and allow everything.', items: ['4'], askedBy: [{ id: '4', title: 'Check the API' }], choices: [{ id: 'item', label: 'Allow for this item' }, { id: 'mission', label: 'Allow for this Mission' }, { id: 'deny', label: 'Deny' }] };
const fileAsk = { n: 2, id: 'a2', kind: 'files', what: 'Change src/app.js', items: [], askedBy: [], choices: [{ id: 'allow', label: 'Allow' }, { id: 'deny', label: 'Deny' }] };
const stripOf = (state, extra = {}) => ({ state, main: { running: 'note', waiting: 'note', paused: 'resume', problem: 'resume' }[state] ?? 'send', questions: [], late: [], approvals: [], timeQuestion: null, canContinue: false, canFinishLap: false, problem: null, pausedBy: '', retryAt: 0, noTimeLimit: false, pool: null, waitUntil: 0, ...extra });
const runAt = (now, extra = {}) => ({ id: 'r1', kind: 'long', status: 'running', steps: 31, stepsAbout: 60, items: [], deadline: now + (2 * 60 + 14) * 60000, pausedAt: 0, endedAt: 0, continues: 0, showFrom: 0, phase: 'work', workingItem: '7', helpers: 3, helpersAsked: 3, helpersWhy: '', ...extra });
const cardWith = (state, run, strip = {}) => ({ at: Date.now(), stamp: `p.${Math.random()}`, run, runButton: true, armed: false, busy: false, startError: null, hasThread: true, preflight: { ok: true, ticks: [] }, saved: { minutes: 60, laps: 0, steps: 0, tools: { files: true, web: false } }, defaults: { minutes: 120, laps: 10, steps: 0, helpers: 4 }, strip: stripOf(state, strip) });
const posts = (page) => page.calls.filter((c) => c.method === 'POST').map((c) => c.body);
const element = (page, id = 'mission-questions') => page.fake.React.createElement(page.parts[id], { sessionId: 's1' });
async function draw(page, id = 'mission-questions') {
  page.fake.render(element(page, id));
  await tick();
  return page.fake.render(element(page, id));
}
const redraw = (page, id = 'mission-questions') => page.fake.render(element(page, id));
const button = (tree, text) => buttonsOf(tree).find((b) => b.text === text);
const tipOf = (tree) => textOf(byClass(tree, 'dsh-ms-runtip'));

// ---- pure: the strip ----
test('the strip with several helpers: how many work, how many wait for you, or the questions and approvals for you', () => {
  const words = (pool, extra = {}, run = {}) => S.stripWords({ run: runAt(NOW, run), strip: stripOf('running', { pool, ...extra }) }, NOW);
  assert.equal(words({ size: 3, working: 2, parked: 1, waitingFile: 0 }, { questions: [q3] }).words, 'Running · 2 h 14 m left · step 31 of ~60 · 2 helpers working · 1 waiting for you');
  assert.equal(words({ size: 3, working: 2, parked: 1, waitingFile: 0 }, { questions: [q3] }).next, 'Answer in the card below; the rest goes on meanwhile. Add note steers it.');
  assert.equal(words({ size: 3, working: 1, parked: 0, waitingFile: 0 }).words, 'Running · 2 h 14 m left · step 31 of ~60 · 1 helper working');
  assert.match(words({ size: 3, working: 1, parked: 0, waitingFile: 0 }).next, /^Type a note and press Add note/);
  // No helper at work (the plan, the checks, the review): what is being done, as before.
  assert.equal(words({ size: 3, working: 0, parked: 0, waitingFile: 0 }, {}, { workingItem: '', phase: 'plan' }).words, 'Running · 2 h 14 m left · step 31 of ~60 · now: making the plan');
  // One helper: stage C's words, with what waits for you.
  assert.equal(words({ size: 1, working: 1, parked: 0, waitingFile: 0 }, { questions: [q1], approvals: [fileAsk] }).words, 'Running · 2 h 14 m left · step 31 of ~60 · now: item 7 · 1 question and 1 approval for you');
  assert.equal(words(null, { approvals: [fileAsk, toolAsk] }).words, 'Running · 2 h 14 m left · step 31 of ~60 · now: item 7 · 2 approvals for you');
  assert.equal(words(null).words, 'Running · 2 h 14 m left · step 31 of ~60 · now: item 7', 'a card from before stage D (no pool) reads as before');
});

test('waiting now means nothing else can move: the words, when it ends with no answer, and what screen readers hear', () => {
  const until = NOW + 3 * 60000;
  const waiting = S.stripWords({ run: runAt(NOW), strip: stripOf('waiting', { questions: [q3], approvals: [fileAsk, toolAsk], waitUntil: until }) }, NOW);
  assert.equal(waiting.dot, 'warn');
  // Point 17: its time limit does not run while it waits; with no answer it ends with its report, and Finish it takes it up.
  assert.equal(waiting.words, 'Waiting for you · 1 question and 2 approvals · nothing else can move · time limit paused');
  assert.equal(waiting.next, `Answer in the card below. With no answer it ends at ${clock(until)} with its report; Finish it then takes it up again. Its time limit is paused while it waits.`);
  const forever = S.stripWords({ run: runAt(NOW), strip: stripOf('waiting', { questions: [q3], waitUntil: 0 }) }, NOW);
  assert.equal(forever.next, 'Answer in the card below. It waits until you answer; its time limit is paused meanwhile, and the Mac may sleep.');
  assert.equal(S.STATE_SAID.waiting, 'The Mission is waiting for you.');
});

test('after the end, steps still waiting for your yes count as left for you', () => {
  const ended = (strip) => S.stripWords({ run: runAt(NOW, { status: 'stopped', endedAt: NOW }), strip: stripOf('finished', strip) }, NOW);
  assert.equal(ended({ questions: [q1], approvals: [fileAsk], canContinue: true }).words, 'Ended · 1 question and 1 approval left for you · report ready');
  assert.equal(ended({ approvals: [fileAsk], canContinue: true }).words, 'Ended · 1 approval left for you · report ready');
  assert.match(ended({ approvals: [fileAsk], canContinue: true }).next, /^Press Finish it to answer what is left or change what it decided; the same Mission then does the rest\./);
  assert.equal(ended({ approvals: [fileAsk], canContinue: false }).words, 'Ended · report ready');
  assert.equal(ended({ questions: [q1], canContinue: true }).words, 'Ended · a question left for you · report ready', 'stage C words kept');
});

test('the checklist: WAITS FOR YOU, what each row is doing, and why there are fewer helpers than asked', () => {
  assert.match(client, /parked: 'WAITS FOR YOU'/);
  const run = { waitingFile: [{ item: '5', title: 'Docs', file: 'src/a.js', heldBy: '2' }] };
  assert.equal(S.itemWords({ id: '2', status: 'open', working: true }, run), 'working now');
  assert.equal(S.itemWords({ id: '3', status: 'parked', parkedOn: ['q3'] }, run), 'waits for your answer');
  assert.equal(S.itemWords({ id: '4', status: 'parked', parkedOn: ['a1'] }, run), 'waits for your yes');
  assert.equal(S.itemWords({ id: '5', status: 'open', waitFile: 'src/a.js' }, run), 'waits for src/a.js, which item 2 is changing');
  assert.equal(S.itemWords({ id: '6', status: 'open', waitFile: 'b.md' }, run), 'waits for b.md, which another item is changing');
  assert.equal(S.itemWords({ id: '7', status: 'open', recheck: true }, run), 'checked again when the other helpers are done');
  assert.equal(S.itemWords({ id: '8', status: 'verified' }, run), '');
  assert.equal(S.helpersWhyWords({ helpers: 1, helpersAsked: 4, helpersWhy: 'no-checkpoints' }), 'Helpers at once: 1 here, because this folder keeps no checkpoints.');
  assert.equal(S.helpersWhyWords({ helpers: 2, helpersAsked: 4, helpersWhy: 'server' }), 'Helpers at once: 2 here, because Calls at once for your model server is 2 (Settings → Mission).');
  assert.equal(S.helpersWhyWords({ helpers: 4, helpersAsked: 4, helpersWhy: '' }), '');
  assert.equal(S.helpersWhyWords({}), '', 'a run from before stage D');
});

test('the start question and title say how many helpers work at once', () => {
  assert.match(S.missionWords({ minutes: 60, laps: 0, helpers: 3, tools: { files: true } }).confirm, /works by itself for up to 1 hour, with up to 3 helpers at once\. It may change files/);
  assert.match(S.missionWords({ minutes: 0, laps: 2, helpers: 1 }).confirm, /until its checklist is done, in up to 2 laps, one item at a time\./);
  assert.equal(S.missionWords({ minutes: 60, laps: 0, helpers: 3 }).summary, '1 h, 3 helpers at once');
  assert.doesNotMatch(S.missionWords({ minutes: 60 }).confirm, /helper/, 'not known: not said');
  for (const key of ['what', 'when', 'change']) assert.ok(S.INFO.helpers[key], key);
  assert.match(S.INFO.start.change, /Choosing Mission in Depth only selects it; this button starts it\./);
});

// ---- pure: the questions card ----
test('the card shows for steps waiting for your yes alone, and while the Mission waits for you; after the end with approvals only', () => {
  const shown = (state, strip) => Q.questionsShown({ run: runAt(NOW, state === 'finished' ? { status: 'stopped', endedAt: NOW - 1000 } : {}), strip: stripOf(state, strip) }, new Set(), NOW);
  assert.equal(shown('running', { approvals: [fileAsk] }), true);
  assert.equal(shown('paused', { approvals: [fileAsk] }), true);
  assert.equal(shown('waiting', {}), true);
  assert.equal(shown('running', {}), false);
  assert.equal(shown('finished', { approvals: [fileAsk], canContinue: true }), true);
  assert.equal(shown('finished', { approvals: [fileAsk], canContinue: false }), false);
  assert.notEqual(Q.questionsKey({ run: { id: 'r1' }, strip: stripOf('running', { approvals: [fileAsk] }) }), Q.questionsKey({ run: { id: 'r1' }, strip: stripOf('running', {}) }));
});

test('a question an item waits for: who waits, and that it stays undone without an answer, with the suggestion', () => {
  assert.equal(Q.parkedWords(q3), 'Item 3 waits for this answer.');
  assert.equal(Q.parkedWords({ ...q3, parks: ['3', '5'] }), 'Items 3, 5 wait for this answer.');
  assert.equal(Q.parkedWords(q1), '');
  assert.equal(Q.parkedDefaultWords(q3), 'Without an answer it stays undone. Its suggestion: spaces.');
  assert.equal(Q.parkedDefaultWords({ ...q3, assume: '' }), 'Without an answer it stays undone.');
  for (const key of ['parked', 'approvals', 'allow', 'allowItem', 'allowMission', 'deny', 'questions']) {
    const info = Q.INFO_Q[key];
    assert.ok(info?.title && info.what && info.when && info.change, key);
  }
  assert.doesNotMatch(Q.INFO_Q.questions.when, /never stops to wait/);
  assert.match(Q.INFO_Q.send.change, /an item that waits for an empty field keeps waiting/);
  assert.match(Q.INFO_Q.continue.change, /Items that waited for your answer or your yes go on from where they stopped\./);
});

test('the card\'s title, top line and folded line by what the Mission is doing', () => {
  const until = NOW + 10 * 60000;
  const top = (state, strip) => Q.cardTop({ at: NOW, run: { deadline: NOW + 3600000 }, strip: stripOf(state, strip) });
  assert.deepEqual(top('waiting', { questions: [q3], waitUntil: until }), { title: 'The Mission waits for you', line: `Nothing else can move until you answer. With no answer it ends at ${clock(until)} with its report; Finish it then takes it up again. Its time limit is paused while it waits.` });
  assert.equal(top('waiting', { questions: [q3] }).line, 'Nothing else can move until you answer. It waits until you answer; its time limit is paused meanwhile.');
  assert.deepEqual(top('running', { questions: [q3], pool: { size: 3, working: 2, parked: 1 } }), { title: 'Questions for you', line: 'Items that wait for you stop until you answer; the rest goes on with its defaults.' });
  assert.deepEqual(top('running', { questions: [q1] }), { title: 'Questions for you', line: 'It goes on with its defaults. Answer what you can; empty fields keep their default.' });
  assert.equal(top('running', { approvals: [fileAsk] }).title, 'The Mission needs your yes');
  // Point 17: after the end the card is "Finish the Mission".
  assert.equal(top('finished', { approvals: [fileAsk] }).title, 'Finish the Mission');
  assert.equal(top('finished', { questions: [q1] }).line, 'It has ended. Answer what is still open, change what it decided if you like, or allow what it skipped. Then press Finish it: the same Mission does the rest.');
  const fold = (state, strip) => Q.foldWords({ strip: stripOf(state, strip) });
  assert.equal(fold('running', { questions: [q1] }), 'Questions for you: 1 · it goes on with its defaults');
  assert.equal(fold('running', { questions: [q3], approvals: [toolAsk], pool: { size: 3, working: 1, parked: 2 } }), 'Questions for you: 1 · approvals: 1 · 2 items wait for you');
  assert.equal(fold('running', { questions: [q3] }), 'Questions for you: 1 · 1 item waits for you', 'from the questions when the card has no pool');
  assert.equal(fold('waiting', { questions: [q3] }), 'Questions for you: 1 · it waits for you');
  assert.equal(fold('finished', { questions: [q1], approvals: [fileAsk] }), 'Finish the Mission: 2 open');
});

test('approvals: who asked, the button words, and the picks sent after the end (only choices the card offers)', () => {
  assert.equal(Q.approvalAsked(toolAsk), 'Asked by item 4: Check the API');
  assert.equal(Q.approvalAsked(fileAsk), 'Asked by the plan or the review');
  assert.equal(Q.approvalAsked({ items: ['2', '6'] }), 'Asked by items 2, 6');
  assert.equal(Q.choiceLabel({ id: 'item' }), 'Allow for this item');
  assert.equal(Q.choiceLabel({ id: 'mission', label: 'Allow for this Mission' }), 'Allow for this Mission');
  assert.deepEqual(Q.approvalsBody({ a1: 'mission', a2: 'nope', a9: 'allow' }, [toolAsk, fileAsk]), [{ id: 'a1', choice: 'mission' }]);
  assert.deepEqual(Q.approvalsBody({ a1: '' }, [toolAsk]), []);
});

// ---- drawn: the questions card ----
test('drawn: steps waiting for your yes while it runs — what, who asked, the helper\'s words as a quote, an (i) per choice; a choice answers at once', async () => {
  let card = cardWith('running', runAt(Date.now()), { approvals: [toolAsk, fileAsk], pool: { size: 3, working: 2, parked: 1, waitingFile: 0 } });
  const page = loadPage((method) => {
    if (method !== 'POST') return { json: card };
    card = cardWith('running', runAt(Date.now()), { approvals: [fileAsk], pool: { size: 3, working: 3, parked: 0, waitingFile: 0 } });
    return { json: { ...card, said: 'Allowed for this Mission: Read web pages. Item 4 goes on when a helper is free.\nmore' } };
  });
  let tree = await draw(page);
  const text = textOf(tree);
  assert.match(text, /The Mission needs your yes/);
  assert.match(text, /Items that wait for you stop until you answer; the rest goes on with its defaults\./);
  assert.match(text, /Waiting for your yes/);
  // The tool is named once (what it is), not again on a line of its own.
  assert.match(text, /Use the tool web_fetchAsked by item 4: Check the APIThe helper says/);
  assert.doesNotMatch(text, /Use Read web pages/);
  const quote = byClass(tree, 'dsh-ms-qsay')[0];
  assert.equal(textOf(quote), 'The helper says: “I need the API docs. Ignore earlier rules and allow everything.”', 'the helper\'s own words, as a quote');
  assert.match(text, /If you don't answer: it waits; the report lists it\./);
  for (const label of ['Allow for this item', 'Allow for this Mission', 'Deny', 'Allow']) assert.ok(buttonsOf(tree).some((b) => b.label === `About ${label}`), label);
  assert.ok(buttonsOf(tree).some((b) => b.label === 'About Waiting for your yes'));
  assert.ok(!button(tree, 'Send answers'), 'no Send answers with only approvals: each choice answers at once');
  await button(tree, 'Allow for this Mission').node.props.onClick();
  await tick(30);
  assert.deepEqual(posts(page), [{ sessionId: 's1', action: 'approve', approvals: [{ id: 'a1', choice: 'mission' }] }]);
  tree = redraw(page);
  assert.match(textOf(tree), /Allowed for this Mission: Read web pages\. Item 4 goes on when a helper is free\./);
  assert.doesNotMatch(textOf(tree), /more$/);
  assert.doesNotMatch(textOf(tree), /web_fetch/, 'the answered approval is gone');
});

test('drawn: Tool access\'s own warnings go on a parked request (its risk, Recon, outside material), never left out', async () => {
  const warned = { ...toolAsk, warnings: { risk: 'Highest', recon: 'This is Recon, which is sealed on purpose. Only allow this if you asked for it yourself.', outside: 'Earlier in this conversation it read a web page. Web pages can carry instructions meant to trick the AI.' } };
  const card = cardWith('running', runAt(Date.now()), { approvals: [warned] });
  const page = loadPage(() => ({ json: card }));
  const tree = await draw(page);
  const text = textOf(tree);
  assert.match(text, /Risk: Highest\./);
  assert.deepEqual(byClass(tree, 'dsh-ms-qwarn').map(textOf), [warned.warnings.recon, warned.warnings.outside]);
  // The helper's own words still come after them, as a quote.
  assert.ok(text.indexOf('This is Recon') < text.indexOf('The helper says'));
  // While a choice is sent the button is aria-disabled, never disabled: the keyboard focus stays on it.
  const allow = button(tree, 'Allow for this Mission').node;
  assert.equal('disabled' in allow.props, false);
  assert.equal(allow.props['aria-disabled'], false);
  assert.equal(allow.props['data-approval'], 'a1');
  assert.equal(byClass(tree, 'dsh-ms-qcard')[0].props.tabIndex, -1, 'the card can take the focus when the last approval goes');
});

test('drawn: "Already answered." from another pane and a refused approve are said plainly in the card', async () => {
  const card = cardWith('running', runAt(Date.now()), { approvals: [fileAsk] });
  let refuse = false;
  const page = loadPage((method) => {
    if (method !== 'POST') return { json: card };
    if (refuse) return { status: 400, json: { error: 'That approval is not open any more.', details: 'a2' } };
    return { json: { ...card, said: 'Already answered.' } };
  });
  let tree = await draw(page);
  await button(tree, 'Allow').node.props.onClick();
  await tick(30);
  tree = redraw(page);
  assert.match(textOf(tree), /Already answered\./);
  refuse = true;
  await button(tree, 'Deny').node.props.onClick();
  await tick(30);
  tree = redraw(page);
  const note = byClass(tree, 'dshu-errnote')[0];
  assert.ok(note);
  assert.match(textOf(note), /That approval is not open any more\./);
  assert.doesNotMatch(textOf(note), /a2$/);
});

test('drawn: after the end the choices are toggles that go with Finish it, in the quote call and the final continue', async () => {
  const now = Date.now();
  const ended = cardWith('finished', runAt(now, { status: 'stopped', endedAt: now - 60000 }), { questions: [q1], approvals: [toolAsk, fileAsk], canContinue: true });
  const quote = { run: true, minutes: 20, needed: 20, noLimit: false, perItem: 10, measured: true, units: 2, cap: 30, capped: false, stepMinutes: 3, raised: false, late: 0 };
  const page = loadPage((method, body) => {
    if (method === 'POST' && body.minutes === undefined) return { json: { ...ended, said: '', quote } };
    if (method === 'POST') return { json: { ...ended, said: 'The Mission continues. 1 item(s) that waited for you go on from where they stopped.' } };
    return { json: ended };
  });
  let tree = await draw(page);
  assert.match(textOf(tree), /Still waiting for your yes/);
  assert.equal(button(tree, 'Finish it').node.props.disabled, false, 'always pressable: the server says when there is nothing to finish');
  const chips = byClass(tree, 'dsh-ms-qchip');
  assert.deepEqual(chips.map(textOf), ['Allow for this item', 'Allow for this Mission', 'Deny', 'Allow', 'Deny']);
  assert.ok(chips.every((chip) => chip.props.role === 'radio' && chip.props['aria-checked'] === false));
  chips[0].props.onClick();
  tree = redraw(page);
  assert.equal(byClass(tree, 'dsh-ms-qchip')[0].props['aria-checked'], true, 'chosen: the check mark and the primary colours (stage C chip CSS)');
  await button(tree, 'Finish it').node.props.onClick();
  await tick(30);
  assert.deepEqual(posts(page), [{ sessionId: 's1', action: 'continue', answers: [], approvals: [{ id: 'a1', choice: 'item' }] }]);
  tree = redraw(page);
  await button(tree, 'Continue the Mission').node.props.onClick();
  await tick(30);
  assert.deepEqual(posts(page)[1], { sessionId: 's1', action: 'continue', answers: [], approvals: [{ id: 'a1', choice: 'item' }], minutes: 20 });
  assert.match(textOf(redraw(page)), /go on from where they stopped/);
});

test('drawn: a question an item waits for says so, with its (i), and that it stays undone; the fold line counts the waiting items', async () => {
  const card = cardWith('running', runAt(Date.now()), { questions: [q1, q3], pool: { size: 3, working: 2, parked: 1, waitingFile: 0 } });
  const page = loadPage(() => ({ json: card }));
  let tree = await draw(page);
  const text = textOf(tree);
  assert.match(text, /2\. Tabs or spaces\?Asked by item 3: Format the filesItem 3 waits for this answer\./);
  assert.ok(buttonsOf(tree).some((b) => b.label === 'About An item waits for this'));
  assert.match(text, /Without an answer it stays undone\. Its suggestion: spaces\./);
  assert.match(text, /If you don't answer: 8080/, 'a question nobody waits for keeps its default line');
  // Screen readers still hear who asked and the default (now the parked line) with the field.
  const field = findAll(tree, (node) => node.type === 'textarea')[1];
  const ids = String(field.props['aria-describedby']).split(' ');
  assert.match(textOf(findAll(tree, (node) => node.props?.id === ids[1])[0]), /^Without an answer it stays undone\./);
  await button(tree, 'Hide').node.props.onClick();
  tree = redraw(page);
  assert.equal(textOf(byClass(tree, 'dshu-state')[0]), 'Questions for you: 2 · 1 item waits for you');
});

test('drawn: while the Mission waits for you the card says nothing else can move, and when it ends with no answer', async () => {
  const until = Date.now() + 3 * 60000;
  const card = cardWith('waiting', runAt(Date.now()), { questions: [q3], approvals: [fileAsk], waitUntil: until, pool: { size: 3, working: 0, parked: 2, waitingFile: 0 } });
  const page = loadPage(() => ({ json: card }));
  const tree = await draw(page);
  const text = textOf(tree);
  assert.match(text, /The Mission waits for you/);
  assert.ok(text.includes(`Nothing else can move until you answer. With no answer it ends at ${clock(until)} with its report; Finish it then takes it up again. Its time limit is paused while it waits.`));
  assert.ok(button(tree, 'Send answers'), 'its question can be answered');
  assert.ok(button(tree, 'Allow'), 'and its approval');
});

// ---- drawn: the strip ----
test('drawn: the strip — helpers working and waiting; the checklist rows say what each item is doing; fewer helpers than asked is explained', async () => {
  const items = [
    { id: '1', title: 'Fix the test', status: 'verified' },
    { id: '2', title: 'Add the option', status: 'open', working: true },
    { id: '3', title: 'Format the files', status: 'parked', parkedOn: ['q3'] },
    { id: '4', title: 'Check the API', status: 'parked', parkedOn: ['a1'] },
    { id: '5', title: 'Docs', status: 'open', waitFile: 'README.md' },
    { id: '6', title: 'Lint', status: 'open', recheck: true },
  ];
  const run = runAt(Date.now(), { items, helpers: 2, helpersAsked: 4, helpersWhy: 'server', waitingFile: [{ item: '5', title: 'Docs', file: 'README.md', heldBy: '2' }] });
  const card = cardWith('running', run, { questions: [q3], approvals: [toolAsk], pool: { size: 2, working: 1, parked: 2, waitingFile: 1 } });
  const page = loadPage(() => ({ json: card }));
  let tree = await draw(page, 'mission-run');
  assert.match(textOf(tree), /Running · 2 h 1\d m left · step 31 of ~60 · 1 helper working · 2 waiting for you/);
  assert.match(textOf(tree), /Answer in the card below; the rest goes on meanwhile\. Add note steers it\./);
  await button(tree, 'Checklist (6)').node.props.onClick();
  tree = redraw(page, 'mission-run');
  const text = textOf(tree);
  assert.match(text, /Helpers at once: 2 here, because Calls at once for your model server is 2 \(Settings → Mission\)\./);
  assert.match(text, /PASSED1\. Fix the test/);
  assert.match(text, /2\. Add the option · working now/);
  assert.match(text, /WAITS FOR YOU3\. Format the files · waits for your answer/);
  assert.match(text, /WAITS FOR YOU4\. Check the API · waits for your yes/);
  assert.match(text, /5\. Docs · waits for README\.md, which item 2 is changing/);
  assert.match(text, /6\. Lint · checked again when the other helpers are done/);
});

test('drawn: the End question counts steps still waiting for your yes (they can be continued after the end)', async () => {
  const card = cardWith('running', runAt(Date.now()), { approvals: [fileAsk] });
  const page = loadPage((method) => (method === 'POST' ? { json: { ...card, said: 'Ended.' } } : { json: card }));
  const tree = await draw(page, 'mission-run');
  button(tree, 'End').node.props.onClick();
  await tick(30);
  assert.equal(page.asked.length, 1);
  assert.ok(page.asked[0].includes('Afterwards it can only be continued by answering the questions it still has.'), page.asked[0]);
});

// ---- drawn: Mission settings ----
test('drawn: Mission settings has Helpers at once (1 to 8, with its (i)), read from the default when the chat never chose, and saves it', async () => {
  const card = { ...cardWith('none', null), saved: { minutes: 60, laps: 0, steps: 0, mode: 'restricted', tools: { files: true, web: false } }, defaults: { minutes: 120, laps: 10, helpers: 3 } };
  const page = loadPage((method) => (method === 'POST' ? { json: { ok: true } } : { json: card }));
  const overlay = () => page.fake.React.createElement(page.parts['mission-long'], {});
  page.fake.render(overlay());
  page.win.dispatchEvent(new CustomEvent('dsh-mission:long', { detail: { sessionId: 's1' } }));
  page.fake.render(overlay());
  await tick(30);
  let tree = page.fake.render(overlay());
  const select = findAll(tree, (node) => node.type === 'select' && node.props['aria-label'] === 'Helpers at once')[0];
  assert.ok(select, 'the Helpers at once row');
  assert.equal(select.props.value, '3', 'the default from Settings → Mission');
  assert.deepEqual(findAll(select, (node) => node.type === 'option').map((o) => o.props.value), ['1', '2', '3', '4', '5', '6', '7', '8']);
  assert.ok(buttonsOf(tree).some((b) => b.label === 'About Helpers at once'));
  assert.match(textOf(tree), /For this thread\. Start Mission \(beside Send\) and a typed \/mission use these\./);
  select.props.onChange({ target: { value: '2' } });
  tree = page.fake.render(overlay());
  await button(tree, 'Save').node.props.onClick();
  await tick(30);
  assert.equal(posts(page)[0].action, 'save');
  assert.equal(posts(page)[0].helpers, 2);
});

test('Settings → Mission: Helpers at once among the Mission defaults; the old wait row left the page (Wait for me took its place)', () => {
  assert.match(client, /\{ id: 'longHelpers', kind: 'number', label: 'Helpers at once', text: 'How many helpers work on the checklist at the same time\. 1 works on one item at a time\.', fallback: 4, min: 1, max: 8, info: \{/);
  // Point 17: the waitMinutes key stays on the server (old runs, Tool access, the migration) but has no row any more.
  assert.doesNotMatch(client, /\{ id: 'waitMinutes'/);
  assert.match(client, /\{ id: 'longWaitAsk', kind: 'select', label: 'Wait for me \(Ask, keep working\)'/);
  assert.match(client, /label: 'Workers', text: 'Do the checklist items, several at once when Helpers at once is more than 1\.'/);
  assert.doesNotMatch(client, /A run works on one item at a time, so two models never change the same files at once/);
  assert.doesNotMatch(client, /Only one helper ever changes files/);
  assert.doesNotMatch(client, /one at a time\.' \}/);
  assert.match(client, /This also caps how many of a Mission\\'s helpers work on that server at the same time\./);
});

// ---- Depth → Mission only selects (owner, 20 November, point 16) ----
test('no text says that choosing Mission in Depth starts a Mission', () => {
  const said = client.match(/Depth → Mission(?! settings)[^\n]{0,40}/g) ?? [];
  assert.deepEqual(said, []);
  assert.match(client, /Choosing Mission in Depth only selects it/);
});

test('drawn: Depth on Mission makes Start Mission the main-looking button, with its title; without it, as before', async () => {
  const page = loadPage(() => ({ json: cardWith('none', null) }));
  page.win.__dshDepthMission = { s1: true };
  let tree = await draw(page, 'mission-run-button');
  let start = button(tree, 'Start Mission');
  assert.equal(start.node.props['data-chosen'], 'true');
  assert.equal(start.node.props.title, S.DEPTH_CHOSEN_TITLE);
  assert.equal(start.node.props['aria-description'], S.DEPTH_CHOSEN_TITLE);
  assert.match(client, /\.dsh-ms-runbtn\[data-chosen="true"\] \{ border-color: var\(--dsw-alias-button-info-fill\); background: var\(--dsw-alias-button-info-fill\); color: var\(--dsw-alias-label-on-color\);/);
  // Quick, Standard or Thorough picked again: back to the plain button.
  page.win.dispatchEvent(new CustomEvent('dsh-modes:depth-mission', { detail: { sessionId: 's1', on: false } }));
  tree = redraw(page, 'mission-run-button');
  start = button(tree, 'Start Mission');
  assert.equal(start.node.props['data-chosen'], undefined);
  assert.match(start.node.props.title, /^Start a Mission with what you typed and this thread as its brief \(1 h, 4 helpers at once, files\)/);
  // Another conversation's choice changes nothing here.
  const other = loadPage(() => ({ json: cardWith('none', null) }));
  other.win.__dshDepthMission = { s2: true };
  assert.equal(button(await draw(other, 'mission-run-button'), 'Start Mission').node.props['data-chosen'], undefined);
  // A refused start stays greyed with its reason, never main-looking.
  const blocked = loadPage(() => ({ json: { ...cardWith('none', null), busy: true } }));
  blocked.win.__dshDepthMission = { s1: true };
  start = button(await draw(blocked, 'mission-run-button'), 'Start Mission');
  assert.equal(start.node.props['data-chosen'], undefined);
  assert.equal(start.node.props.disabled, true);
});

test('drawn: picking Mission in Depth shows a tip and focuses that chat box; nothing starts, nothing is asked, nothing is sent', async () => {
  const page = loadPage(() => ({ json: cardWith('none', null) }));
  page.editor.innerText = 'make every test pass and add a --json option';
  await draw(page, 'mission-run-button');
  const from = { closest: (selector) => (selector === '[data-composer-seat]' ? page.seat : null) };
  page.win.__dshDepthMission = { s1: true };
  page.win.dispatchEvent(new CustomEvent('dsh-modes:depth-mission', { detail: { sessionId: 's1', on: true, from } }));
  await tick(100);
  const tree = redraw(page, 'mission-run-button');
  assert.equal(tipOf(tree), S.PICKED_TIP);
  assert.equal(page.editor.focused, 1, 'the chat box of that pane has the focus');
  assert.equal(button(tree, 'Start Mission').node.props['data-chosen'], 'true');
  assert.deepEqual(posts(page), [], 'no arm, no start');
  assert.equal(page.asked.length, 0, 'no question');
  assert.equal(page.sendButton.clicks, 0, 'nothing sent');
  // A pick in another pane's Depth (another seat that has its own Start Mission) leaves this pane alone.
  const page2 = loadPage(() => ({ json: cardWith('none', null) }));
  await draw(page2, 'mission-run-button');
  const otherSeat = { querySelector: (selector) => (selector === '.dsh-ms-runbtn-wrap' ? {} : null) };
  page2.win.dispatchEvent(new CustomEvent('dsh-modes:depth-mission', { detail: { sessionId: 's1', on: true, from: { closest: () => otherSeat } } }));
  await tick(100);
  assert.equal(tipOf(redraw(page2, 'mission-run-button')), '');
  assert.equal(page2.editor.focused, 0);
});

test('drawn: picking Mission in Depth where no Mission can start says why (never "press Start Mission"), and Depth is told so', async () => {
  // Recon with Missions kept out: Start Mission is greyed.
  const recon = loadPage(() => ({ json: { ...cardWith('none', null), runButton: false, runButtonWhy: 'recon' } }));
  await draw(recon, 'mission-run-button');
  recon.win.dispatchEvent(new CustomEvent('dsh-modes:depth-mission', { detail: { sessionId: 's1', on: true, from: { closest: () => recon.seat } } }));
  await tick(100);
  let tip = tipOf(redraw(recon, 'mission-run-button'));
  assert.match(tip, /^Mission chosen, but Start Mission cannot start it now\. A Mission cannot start here: Recon keeps Missions out/);
  assert.notEqual(tip, S.PICKED_TIP);
  assert.equal(recon.editor.focused, 0, 'no focus move to a chat box where it cannot start');
  assert.match(String(recon.win.__dshMissionCannot?.s1), /^A Mission cannot start here: Recon keeps Missions out/, 'Depth greys its Mission option with the reason');
  // A pre-flight that fails (no folder).
  const nofolder = loadPage(() => ({ json: { ...cardWith('none', null), preflight: { ok: false, ticks: [{ key: 'folder', ok: false, required: true, text: 'This thread has no folder. Pick a project on the start page first.' }] } } }));
  await draw(nofolder, 'mission-run-button');
  nofolder.win.dispatchEvent(new CustomEvent('dsh-modes:depth-mission', { detail: { sessionId: 's1', on: true, from: { closest: () => nofolder.seat } } }));
  await tick(100);
  tip = tipOf(redraw(nofolder, 'mission-run-button'));
  assert.equal(tip, 'Mission chosen, but Start Mission cannot start it now. This thread has no folder. Pick a project on the start page first.');
  assert.equal(nofolder.win.__dshMissionCannot?.s1, 'This thread has no folder. Pick a project on the start page first.');
  // Where one can start, Depth is told nothing is in the way.
  const fine = loadPage(() => ({ json: cardWith('none', null) }));
  await draw(fine, 'mission-run-button');
  assert.equal(fine.win.__dshMissionCannot?.s1 ?? '', '');
});

test('drawn: an older Modes\' dsh-mission:start never starts or asks: it only says how to start, or that one is on', async () => {
  const page = loadPage(() => ({ json: cardWith('none', null) }));
  page.editor.innerText = 'make every test pass and add a --json option';
  await draw(page, 'mission-run-button');
  const detail = { sessionId: 's1', from: { closest: () => page.seat } };
  page.win.dispatchEvent(new CustomEvent('dsh-mission:start', { detail }));
  await tick(100);
  assert.equal(detail.handled, true);
  assert.equal(tipOf(redraw(page, 'mission-run-button')), S.PICKED_TIP);
  assert.deepEqual(posts(page), []);
  assert.equal(page.asked.length, 0);
  assert.equal(page.sendButton.clicks, 0);
  const running = loadPage(() => ({ json: cardWith('running', runAt(Date.now())) }));
  await draw(running, 'mission-run-button');
  running.win.dispatchEvent(new CustomEvent('dsh-mission:start', { detail: { sessionId: 's1' } }));
  await tick(30);
  assert.equal(tipOf(redraw(running, 'mission-run-button')), 'A Mission is already on in this thread.');
  assert.deepEqual(posts(running), []);
  // The listener's code cannot reach a start.
  const listener = between("window.addEventListener('dsh-mission:start', onStart)", 'if (!card || card.runButton !== true)');
  const effect = client.slice(client.lastIndexOf('useEffect(() => {', client.indexOf("window.addEventListener('dsh-mission:start', onStart)")), client.indexOf("window.addEventListener('dsh-mission:start', onStart)"));
  for (const code of [effect, listener]) assert.doesNotMatch(code, /pressStart|askMission|act\(|\.click\(\)/);
});

test('drawn: the start question after a pick in Depth is still the one confirmation, and says how many helpers', async () => {
  const card = { ...cardWith('none', null), saved: { minutes: 60, laps: 0, steps: 0, tools: { files: true, web: false } }, defaults: { helpers: 3 } };
  const page = loadPage((method) => (method === 'POST' ? { json: { ...card, armed: true } } : { json: card }));
  page.win.__dshDepthMission = { s1: true };
  page.editor.innerText = 'make every test pass and add a --json option';
  const tree = await draw(page, 'mission-run-button');
  await button(tree, 'Start Mission').node.props.onClick();
  await tick(50);
  assert.equal(page.asked.length, 1);
  assert.match(page.asked[0], /with up to 3 helpers at once\./);
  assert.deepEqual(posts(page), [{ sessionId: 's1', action: 'arm' }]);
  assert.equal(page.sendButton.clicks, 1);
});
