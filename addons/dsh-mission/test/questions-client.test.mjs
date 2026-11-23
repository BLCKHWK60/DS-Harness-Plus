// Stage C (20 November 2026): the questions card above the chat box, in the page file (client.js). The pure block
// (mission-questions) runs on its own; the card and the strip are drawn with the same small stand-in for React and the
// page as test/strip-client.test.mjs (copied here), against a stand-in for the /dsh-mission/long route.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const between = (from, to, start = 0) => { const a = client.indexOf(from, start); const b = client.indexOf(to, a + from.length); assert.ok(a >= 0 && b > a, `${from} … ${to}`); return client.slice(a, b); };

// ---- the pure blocks ----
const qblock = between('// ---- mission-questions:begin', '// ---- mission-questions:end');
const Q = new Function(`${qblock}\nreturn { shownFrom, dismissKey, isDismissed, finishedShown, questionsShown, questionsKey, askedWords, defaultWords, answersBody, timeChoices, extraWords, INFO_Q };`)();
const sblock = between('// ---- mission-strip:begin', '// ---- mission-strip:end');
const S = new Function(`${sblock}\nreturn { stripWords, INFO };`)();

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
  };
  plugin.apply(ctx);
  // The confirmation box (dshKit.ask) is drawn in the page; here it is answered yes and recorded.
  const page = { fake, win, html, seat, editor, sendButton, calls, asked, parts, popup: false, store };
  return page;
}

const NOW = 1_800_000_000_000;
const DAY = 24 * 3600000;
const q1 = { n: 1, id: 'q1', text: 'Which port?', assume: '8080', items: [], from: 'plan', askedBy: [] };
const q3 = { n: 2, id: 'q3', text: 'Tabs or spaces?', assume: 'spaces', items: ['3'], from: 'item', askedBy: [{ id: '3', title: 'Format the files' }] };
const tq = { id: 'q2', text: 'The plan needs about 90 minutes, but the Mission has 60 left. Give it about 40 more minutes?', assume: 'I will do the most important items and list the rest.', minutes: 60, needed: 90, left: 60, extra: 40, recommend: 100 };
const stripOf = (state, extra = {}) => ({ state, main: { running: 'note', waiting: 'answer', paused: 'resume', problem: 'resume' }[state] ?? 'send', questions: [], late: [], timeQuestion: null, canContinue: false, canFinishLap: false, problem: null, pausedBy: '', retryAt: 0, noTimeLimit: false, ...extra });
const runAt = (now, extra = {}) => ({ id: 'r1', kind: 'long', status: 'running', steps: 4, stepsAbout: 20, items: [{ id: '3', title: 'Format the files', status: 'verified' }], deadline: now + 3600000, pausedAt: 0, endedAt: 0, continues: 0, showFrom: 0, phase: 'work', ...extra });
const cardWith = (state, run, strip = {}) => ({ at: Date.now(), stamp: `q.${Math.random()}`, run, runButton: true, armed: false, busy: false, startError: null, hasThread: true, preflight: { ok: true, ticks: [] }, saved: { minutes: 60, laps: 0, steps: 0, tools: { files: true, web: false } }, strip: stripOf(state, strip) });

// ---- pure ----
test('when the questions card shows: while on with questions or the time question; after the end only when it can be continued', () => {
  const on = (state, strip) => Q.questionsShown({ run: runAt(NOW), strip: stripOf(state, strip) }, new Set(), NOW);
  assert.equal(on('waiting', { questions: [q1] }), true);
  assert.equal(on('running', { timeQuestion: tq }), true, 'the time question alone');
  assert.equal(on('running', {}), false);
  assert.equal(on('paused', { questions: [q1] }), true);
  assert.equal(on('problem', { questions: [q1] }), true);
  assert.equal(on('starting', { questions: [q1] }), false);
  assert.equal(Q.questionsShown({ run: null, strip: stripOf('none') }, new Set(), NOW), false);
  const ended = (run, strip, dismissed = new Set(), now = NOW) => Q.questionsShown({ run, strip: stripOf('finished', strip) }, dismissed, now);
  const done = runAt(NOW, { status: 'stopped', endedAt: NOW - 60000 });
  assert.equal(ended(done, { questions: [q1], canContinue: true }), true);
  assert.equal(ended(done, { questions: [q1], canContinue: false }), false, 'no continue (End with nothing open, token allowance used, record gone)');
  assert.equal(ended(done, { late: [{ id: 'q5', text: 'Name?', answer: 'Ada', items: ['2'] }], canContinue: true }), true, 'late answers alone');
  assert.equal(ended(done, { canContinue: true }), false);
  // Closed with ×: the new key, and the old id-only form (only for a run never continued).
  assert.equal(ended(done, { questions: [q1], canContinue: true }, new Set([`r1:${NOW - 60000}`])), false);
  assert.equal(ended(done, { questions: [q1], canContinue: true }, new Set(['r1'])), false, 'old id-only entry');
  const again = runAt(NOW, { status: 'incomplete', endedAt: NOW - 60000, continues: 1 });
  assert.equal(ended(again, { questions: [q1], canContinue: true }, new Set(['r1'])), true, 'a continued run that ended again is not hidden by the old id');
  assert.equal(ended(again, { questions: [q1], canContinue: true }, new Set([`r1:${NOW - 3 * 3600000}`])), true, 'closed at an earlier end: shows again');
  // A day after the end it goes, unless a typed /mission resume showed it again.
  const old = runAt(NOW, { status: 'stopped', endedAt: NOW - DAY - 1000 });
  assert.equal(ended(old, { questions: [q1], canContinue: true }), false);
  const shownAgain = { ...old, showFrom: NOW - 5000 };
  assert.equal(ended(shownAgain, { questions: [q1], canContinue: true }), true);
  assert.equal(ended(shownAgain, { questions: [q1], canContinue: true }, new Set([`r1:${old.endedAt}`, 'r1'])), true, 'shown again after ×');
  assert.equal(Q.dismissKey(shownAgain), `r1:${old.endedAt}:${NOW - 5000}`);
  assert.equal(Q.dismissKey(done), `r1:${NOW - 60000}`);
  assert.equal(Q.shownFrom(shownAgain), NOW - 5000);
});

test('who asked, and the default in words', () => {
  assert.equal(Q.askedWords(q1), 'Asked by the plan');
  assert.equal(Q.askedWords({ ...q1, from: 'review' }), 'Asked by the review');
  assert.equal(Q.askedWords(q3), 'Asked by item 3: Format the files');
  assert.equal(Q.askedWords({ ...q3, askedBy: [] }), 'Asked by item 3');
  assert.equal(Q.askedWords({ ...q1, items: ['3', '5'] }), 'Asked by items 3, 5', 'items win over from (a merged plan question)');
  assert.equal(Q.askedWords({ ...q1, from: 'plan', items: ['4'], askedBy: [{ id: '4', title: 'Docs' }] }), 'Asked by item 4: Docs');
  assert.equal(Q.defaultWords(q1), "If you don't answer: 8080");
  assert.equal(Q.defaultWords({ ...q1, assume: '' }), "If you don't answer: it decides itself.");
});

test('what the card sends: filled fields and skips in the questions\' order, skip wins, empty fields left out, the time pick last', () => {
  const body = Q.answersBody({ q1: '  3000 ', q3: 'tabs', q9: '' }, { q3: true }, { id: 'q2', time: 'more' }, ['q1', 'q3', 'q9']);
  assert.deepEqual(body, [{ id: 'q1', text: '3000' }, { id: 'q3', skip: true }, { id: 'q2', time: 'more' }]);
  assert.deepEqual(Q.answersBody({ q1: '   ' }, {}, null, ['q1']), []);
  assert.deepEqual(Q.answersBody({}, {}, { id: 'q2', time: 'later' }, []), [], 'only keep, more or none');
  assert.equal(Q.answersBody({ q1: 'x'.repeat(1500) }, {}, null, ['q1'])[0].text.length, 1000);
  assert.deepEqual(Q.timeChoices(tq).map((c) => [c.value, c.label]), [['keep', 'Keep 60 min'], ['more', 'Give it 40 more min'], ['none', 'No time limit']]);
});

test('the extra-time suggestion in words: measured, not measured, capped, raised, no limit', () => {
  const base = { run: true, minutes: 10, needed: 10, noLimit: false, perItem: 10, measured: true, units: 1, cap: 30, capped: false, stepMinutes: 3, raised: false };
  assert.equal(Q.extraWords(base), 'Suggested: 10 minutes. It took about 10 minutes per item so far, and 1 item is left or changed by your answers.');
  assert.equal(Q.extraWords({ ...base, minutes: 25, units: 3, perItem: 8.333 }), 'Suggested: 25 minutes. It took about 8.3 minutes per item so far, and 3 items are left or changed by your answers.');
  assert.equal(Q.extraWords({ ...base, measured: false, minutes: 20 }), 'Suggested: 20 minutes, 10 minutes for each item to do (its work so far was too short to measure its own pace).');
  assert.match(Q.extraWords({ ...base, minutes: 30, needed: 75, capped: true }), / That is the most it suggests; doing all of it may take about 75 minutes\.$/);
  assert.match(Q.extraWords({ ...base, minutes: 13, stepMinutes: 12, raised: true }), / Raised to 13 minutes: one step of this Mission takes about 12 minutes\.$/);
  assert.match(Q.extraWords({ ...base, noLimit: true }), /^It had no time limit, so it goes on without one unless you choose a time\. Suggested/);
});

test('every questions-card control has an (i) with what, when and what changes; the extra-time rule is said', () => {
  for (const key of ['questions', 'skip', 'late', 'send', 'continue', 'extraTime', 'timeFit', 'fold']) {
    const info = Q.INFO_Q[key];
    assert.ok(info?.title && info.what && info.when && info.change, key);
  }
  assert.match(Q.INFO_Q.extraTime.change, /1 of 10 items left after 100 minutes gives 10 minutes/);
  assert.match(Q.INFO_Q.extraTime.change, /at most a quarter of its first time limit, never more than 30 minutes/);
  assert.match(Q.INFO_Q.extraTime.change, /The time between the end and now does not count/);
});

test('the strip after the end says how many questions are left and that the card continues it; waiting points to the card', () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ id: String(i + 1), status: i < 7 ? 'verified' : 'open' }));
  const finished = (status, strip) => S.stripWords({ run: runAt(NOW, { status, items, endedAt: NOW }), strip: stripOf('finished', strip) }, NOW);
  assert.equal(finished('stopped', { questions: [q1, q3], canContinue: true }).words, 'Ended · 2 questions left for you · report ready');
  assert.equal(finished('complete', { questions: [q1, q3], canContinue: true }).words, 'Done · 2 questions left for you · report ready');
  assert.equal(finished('incomplete', { questions: [], late: [{ id: 'q5' }], canContinue: true }).words, 'Finished · 7 of 8 done · a question left for you · report ready');
  const next = finished('stopped', { questions: [q1], canContinue: true }).next;
  assert.equal(next, 'Press Finish it to answer what is left or change what it decided; the same Mission then does the rest. Send talks to the assistant again. Start Mission starts a new one.');
  // Without a continue: the stage B words.
  assert.equal(finished('stopped', { questions: [q1], canContinue: false }).words, 'Ended · report ready');
  assert.equal(finished('stopped', { questions: [q1], canContinue: false }).next, 'Send talks to the assistant again. Start Mission starts a new one.');
  // Stage D: running with questions points to the card; the rest goes on meanwhile ('waiting' now means nothing else can move).
  const asking = S.stripWords({ run: runAt(NOW), strip: stripOf('running', { questions: [q1] }) }, NOW);
  assert.equal(asking.next, 'Answer in the card below; the rest goes on meanwhile. Add note steers it.');
  assert.match(asking.words, / · 1 question for you$/);
  assert.match(S.INFO.end.change, /unless it still has questions for you: answering them in the card continues it/);
  assert.match(S.INFO.answer.change, /You can also answer in the card above the chat box\.$/);
});

// ---- the page file, read as text ----
test('CSS: the card has no position, z-index, transform, filter, contain, container-type or isolation, and no negative margin', () => {
  const rules = client.split('\n').filter((line) => /^(html\[data-cws-wide\] )?\.dsh-ms-q(card|head|meta|item|field|row|skip|chip|late|foot)/.test(line));
  assert.ok(rules.length >= 10, 'the card\'s rules are there');
  for (const rule of rules) {
    assert.doesNotMatch(rule, /(^|[;{\s])(position|z-index|transform|filter|contain|container-type|container|isolation)\s*:/, rule);
    assert.doesNotMatch(rule, /margin[^;]*:\s*[^;]*-\d/, rule);
  }
  assert.doesNotMatch(client, /@container/);
  assert.match(client, /\.dsh-ms-qcard \{[^}]*max-height: min\(45vh, 360px\); overflow: auto;/);
  assert.match(client, /html\[data-cws-wide\] \.dsh-ms-qcard \{ max-width: calc\(100% - 2 \* var\(--dsh-composer-side-clearance, 0px\) - 32px\); \}/);
  // Stage B's list rule stays (strip-client.test.mjs asserts it), though the strip no longer draws the list.
  assert.match(client, /\.dsh-ms-qlist \{/);
});

test('the card is a dock part under the strip (order 4), with no polling of its own', () => {
  assert.match(client, /register\(\{ name: 'conversation\.input\.dock', id: 'mission-questions', order: 4 \}, \(props\) => h\(QuestionsCard, \{ sessionId: props\?\.sessionId \}\)\)/);
  assert.match(client, /id: 'mission-run', order: 3 \}/);
  const card = between('function QuestionsCard(', '    return {\n      inject:');
  assert.match(card, /useMissionCard\(sessionId\)/);
  assert.doesNotMatch(card, /dshPoll|setInterval/);
  assert.equal((client.match(/dshPoll\.loop\(/g) ?? []).length, 1);
});

// ---- drawn ----
const posts = (page) => page.calls.filter((c) => c.method === 'POST').map((c) => c.body);
const element = (page, id = 'mission-questions') => page.fake.React.createElement(page.parts[id], { sessionId: 's1' });
async function drawCard(page) {
  page.fake.render(element(page));
  await tick();
  return page.fake.render(element(page));
}
const redraw = (page) => page.fake.render(element(page));
const fieldsOf = (tree) => findAll(tree, (node) => node.type === 'textarea');
const button = (tree, text) => buttonsOf(tree).find((b) => b.text === text);
const type = (field, value) => field.props.onChange({ target: { value } });

test('drawn: running with two questions and the time question — fields, who asked, defaults, Skip chips with (i), three time chips; Send answers posts only the filled ones', async () => {
  const now = Date.now();
  let card = cardWith('running', runAt(now), { questions: [q1, q3], timeQuestion: tq });
  const page = loadPage((method) => {
    if (method !== 'POST') return { json: card };
    card = cardWith('running', runAt(now), { questions: [q3] });
    return { json: { ...card, said: 'Thanks: 1 answer given. The Mission goes on with them.\nmore' } };
  });
  let tree = await drawCard(page);
  const root = byClass(tree, 'dsh-ms-qcard')[0];
  assert.ok(root, 'the card shows');
  assert.equal(root.props.role, 'region');
  assert.equal(root.props['aria-label'], 'Questions from the Mission');
  const text = textOf(tree);
  assert.match(text, /Questions for you/);
  assert.match(text, /It goes on with its defaults\. Answer what you can; empty fields keep their default\./);
  assert.match(text, /1\. Which port\?Asked by the plan/);
  assert.match(text, /2\. Tabs or spaces\?Asked by item 3: Format the files/);
  assert.match(text, /If you don't answer: 8080/);
  assert.match(text, /If you don't answer: it keeps your limit, does the most important items first and lists the rest\./);
  const fields = fieldsOf(tree);
  assert.equal(fields.length, 2);
  assert.equal(fields[0].props['aria-label'], 'Your answer to question 1');
  assert.equal(fields[0].props.maxLength, 1000);
  assert.equal(fields[0].props.placeholder, 'Your answer');
  // Each Skip chip has its (i) right after it.
  for (const row of byClass(tree, 'dsh-ms-qrow').filter((r) => byClass(r, 'dsh-ms-qskip').length > 0)) {
    assert.ok(buttonsOf(row).some((b) => b.label === 'About Skip, use your judgement'));
  }
  assert.equal(byClass(tree, 'dsh-ms-qskip').length, 2);
  const chips = byClass(tree, 'dsh-ms-qchip');
  assert.deepEqual(chips.map(textOf), ['Keep 60 min', 'Give it 40 more min', 'No time limit']);
  assert.ok(chips.every((chip) => chip.props.role === 'radio'));
  assert.ok(buttonsOf(tree).some((b) => b.label === 'About Not enough time'));
  assert.ok(buttonsOf(tree).some((b) => b.label === 'About Send answers'));
  assert.ok(buttonsOf(tree).some((b) => b.label === 'About Hide'));
  assert.equal(button(tree, 'Send answers').node.props.disabled, true, 'nothing filled yet');
  type(fields[0], '3000');
  tree = redraw(page);
  await button(tree, 'Give it 40 more min').node.props.onClick();
  tree = redraw(page);
  assert.equal(button(tree, 'Give it 40 more min').node.props['aria-checked'], true);
  assert.equal(button(tree, 'Send answers').node.props.disabled, false);
  await button(tree, 'Send answers').node.props.onClick();
  await tick(30);
  assert.deepEqual(posts(page), [{ sessionId: 's1', action: 'answer', answers: [{ id: 'q1', text: '3000' }, { id: 'q2', time: 'more' }] }]);
  tree = redraw(page);
  assert.match(textOf(tree), /Thanks: 1 answer given\. The Mission goes on with them\./);
  assert.doesNotMatch(textOf(tree), /more$/, 'only the first line of what it said');
  assert.equal(fieldsOf(tree).length, 1, 'the answered question is gone');
  assert.equal(fieldsOf(tree)[0].props.value, '', 'the sent field is cleared');
});

test('drawn: Skip disables its field and is sent as a skip; Hide folds into one line and keeps the drafts', async () => {
  const card = cardWith('running', runAt(Date.now()), { questions: [q1, q3], timeQuestion: tq });
  const page = loadPage((method) => (method === 'POST' ? { json: { ...card, said: 'Thanks: 1 question left to its judgement. The report will say what it chose.' } } : { json: card }));
  let tree = await drawCard(page);
  type(fieldsOf(tree)[0], 'port 3000');
  tree = redraw(page);
  const skip = byClass(tree, 'dsh-ms-qskip')[1];
  skip.props.onClick();
  tree = redraw(page);
  assert.equal(byClass(tree, 'dsh-ms-qskip')[1].props['aria-pressed'], true);
  assert.equal(fieldsOf(tree)[1].props.disabled, true, 'the field is greyed while Skip is on');
  assert.match(textOf(tree), /The Mission decides itself and says what it chose in the report\./);
  // Fold: one line, no fields; the drafts stay.
  await button(tree, 'Hide').node.props.onClick();
  tree = redraw(page);
  assert.equal(fieldsOf(tree).length, 0);
  assert.equal(button(tree, 'Show').node.props['aria-expanded'], false);
  assert.match(textOf(byClass(tree, 'dshu-state')[0]), /Questions for you: 3 · it goes on with its defaults/);
  await button(tree, 'Show').node.props.onClick();
  tree = redraw(page);
  assert.equal(fieldsOf(tree)[0].props.value, 'port 3000');
  await button(tree, 'Send answers').node.props.onClick();
  await tick(30);
  assert.deepEqual(posts(page)[0].answers, [{ id: 'q1', text: 'port 3000' }, { id: 'q3', skip: true }]);
});

test('drawn: a folded card unfolds by itself when a new question comes', async () => {
  let card = cardWith('running', runAt(Date.now()), { questions: [q1] });
  const page = loadPage(() => ({ json: card }));
  let tree = await drawCard(page);
  await button(tree, 'Hide').node.props.onClick();
  tree = redraw(page);
  assert.equal(fieldsOf(tree).length, 0);
  // The same question again: stays folded.
  card = { ...card, stamp: 'q.same' };
  page.win.dispatchEvent(new CustomEvent('dsh-mission:changed', { detail: { sessionId: 's1' } }));
  await tick(40);
  tree = redraw(page);
  assert.equal(fieldsOf(tree).length, 0);
  card = cardWith('running', runAt(Date.now()), { questions: [q1, { ...q3, n: 2, id: 'q4' }] });
  page.win.dispatchEvent(new CustomEvent('dsh-mission:changed', { detail: { sessionId: 's1' } }));
  await tick(40);
  page.fake.render(element(page));
  tree = redraw(page);
  assert.equal(fieldsOf(tree).length, 2, 'unfolded for the new question');
});

test('drawn: after the end — Finish it asks for a quote first, then How much more time? posts the chosen minutes', async () => {
  const now = Date.now();
  const late = [{ id: 'q5', text: 'Which name?', answer: 'Ada', items: ['2'], askedBy: [{ id: '2', title: 'Rename' }] }];
  const ended = cardWith('finished', runAt(now, { status: 'stopped', endedAt: now - 60000 }), { questions: [q1, q3], late, canContinue: true });
  const quote = { run: true, minutes: 25, needed: 60, noLimit: false, perItem: 12.5, measured: true, units: 2, cap: 25, capped: true, stepMinutes: 4, raised: false, late: 1 };
  const running = cardWith('running', runAt(now, { continues: 1 }), { questions: [q3] });
  let current = ended;
  const page = loadPage((method, body) => {
    if (method === 'POST' && body.action === 'continue' && body.minutes === undefined) return { json: { ...ended, said: '', quote } };
    if (method === 'POST' && body.action === 'continue') { current = running; return { json: { ...running, said: 'The Mission continues with your 1 answer, for up to 60 more minutes.' } }; }
    return { json: current };
  });
  let tree = await drawCard(page);
  const text = textOf(tree);
  // Point 17: the after-end card is "Finish the Mission", and its button is Finish it.
  assert.match(text, /Finish the Mission/);
  assert.match(text, /It has ended\. Answer what is still open, change what it decided if you like, or allow what it skipped\. Then press Finish it: the same Mission does the rest\./);
  assert.match(text, /Answered too late before/);
  assert.match(text, /Which name\? · your answer: Ada · done again if you continue/);
  assert.equal(byClass(tree, 'dsh-ms-qchip').length, 0, 'no time question after the end');
  assert.ok(!button(tree, 'Send answers'));
  // Finish it is always pressable (the server says when there is nothing to finish).
  assert.equal(button(tree, 'Finish it').node.props.disabled, false);
  assert.ok(buttonsOf(tree).some((b) => b.label === 'About Finish it'));
  assert.ok(buttonsOf(tree).some((b) => b.label === 'About Answered too late before'));
  type(fieldsOf(tree)[0], '3000');
  tree = redraw(page);
  await button(tree, 'Finish it').node.props.onClick();
  await tick(30);
  assert.deepEqual(posts(page), [{ sessionId: 's1', action: 'continue', answers: [{ id: 'q1', text: '3000' }] }], 'a quote: no minutes');
  tree = redraw(page);
  assert.match(textOf(tree), /How much more time\?/);
  assert.match(textOf(tree), /Suggested: 25 minutes\. It took about 12\.5 minutes per item so far, and 2 items are left or changed by your answers\. That is the most it suggests; doing all of it may take about 60 minutes\./);
  const chips = byClass(tree, 'dsh-ms-qchip');
  assert.deepEqual(chips.map(textOf), ['25 min (suggested)', '60 min (all it estimates)', 'No time limit']);
  assert.equal(chips[0].props['aria-checked'], true, 'the suggestion is picked');
  assert.ok(buttonsOf(tree).some((b) => b.label === 'About More time'));
  const other = findAll(tree, (node) => node.type === 'select')[0];
  assert.equal(other.props['aria-label'], 'Other time');
  chips[1].props.onClick();
  tree = redraw(page);
  await button(tree, 'Continue the Mission').node.props.onClick();
  await tick(30);
  assert.deepEqual(posts(page)[1], { sessionId: 's1', action: 'continue', answers: [{ id: 'q1', text: '3000' }], minutes: 60 });
  tree = redraw(page);
  assert.match(textOf(tree), /The Mission continues with your 1 answer, for up to 60 more minutes\./);
  assert.ok(button(tree, 'Send answers'), 'the continued run: the card is the running card again');
  assert.equal(fieldsOf(tree)[0].props.value, '');
});

test('drawn: after the end, Back returns to the fields; No time limit posts 0; a quote that runs nothing records at once with minutes 0', async () => {
  const now = Date.now();
  const ended = cardWith('finished', runAt(now, { status: 'stopped', endedAt: now - 60000, deadline: 0 }), { questions: [q1], canContinue: true });
  let quote = { run: true, minutes: 20, needed: 20, noLimit: true, perItem: 0, measured: false, units: 2, cap: 30, capped: false, stepMinutes: 0, raised: false, late: 0 };
  const page = loadPage((method, body) => {
    if (method === 'POST' && body.minutes === undefined) return { json: { ...ended, said: '', quote } };
    if (method === 'POST') return { json: { ...ended, said: 'Noted. Nothing needs doing again, so the Mission stays finished. The report shows what it chose.' } };
    return { json: ended };
  });
  let tree = await drawCard(page);
  byClass(tree, 'dsh-ms-qskip')[0].props.onClick();
  tree = redraw(page);
  await button(tree, 'Finish it').node.props.onClick();
  await tick(30);
  tree = redraw(page);
  assert.equal(button(tree, 'No time limit').node.props['aria-checked'], true, 'no time limit before: No time limit is picked');
  assert.match(textOf(tree), /It had no time limit, so it goes on without one unless you choose a time\./);
  assert.ok(!button(tree, '20 min (all it estimates)'), 'not capped: one suggestion');
  await button(tree, 'Back').node.props.onClick();
  tree = redraw(page);
  assert.equal(fieldsOf(tree).length, 1);
  await button(tree, 'Finish it').node.props.onClick();
  await tick(30);
  tree = redraw(page);
  await button(tree, 'Continue the Mission').node.props.onClick();
  await tick(30);
  assert.deepEqual(posts(page).at(-1), { sessionId: 's1', action: 'continue', answers: [{ id: 'q1', skip: true }], minutes: 0 });
  // Only skips that change nothing: no time question, recorded at once.
  quote = { ...quote, run: false };
  const page2 = loadPage((method, body) => {
    if (method === 'POST' && body.minutes === undefined) return { json: { ...ended, said: '', quote } };
    if (method === 'POST') return { json: { ...ended, said: 'Noted. Nothing needs doing again, so the Mission stays finished. The report shows what it chose.' } };
    return { json: ended };
  });
  tree = await drawCard(page2);
  byClass(tree, 'dsh-ms-qskip')[0].props.onClick();
  tree = redraw(page2);
  await button(tree, 'Finish it').node.props.onClick();
  await tick(40);
  assert.deepEqual(posts(page2), [
    { sessionId: 's1', action: 'continue', answers: [{ id: 'q1', skip: true }] },
    { sessionId: 's1', action: 'continue', answers: [{ id: 'q1', skip: true }], minutes: 0 },
  ]);
  tree = redraw(page2);
  assert.match(textOf(tree), /Noted\. Nothing needs doing again/);
  assert.doesNotMatch(textOf(tree), /How much more time\?/);
});

test('drawn: a refused answer shows in the card in plain words, with the raw text only behind Details, and Close', async () => {
  const card = cardWith('running', runAt(Date.now()), { questions: [q1] });
  const page = loadPage((method) => (method === 'POST' ? { status: 400, json: { error: 'Those questions were already answered or are no longer open.', details: 'stale-id-xyz' } } : { json: card }));
  let tree = await drawCard(page);
  type(fieldsOf(tree)[0], '3000');
  tree = redraw(page);
  await button(tree, 'Send answers').node.props.onClick();
  await tick(30);
  tree = redraw(page);
  const note = byClass(tree, 'dshu-errnote')[0];
  assert.ok(note, 'the error note is in the card');
  assert.match(textOf(note), /Those questions were already answered or are no longer open\./);
  assert.match(textOf(note), /Details/);
  assert.doesNotMatch(textOf(note), /stale-id-xyz/);
  assert.equal(fieldsOf(tree)[0].props.value, '3000', 'what you typed stays');
  await button(note, 'Close').node.props.onClick();
  tree = redraw(page);
  assert.equal(byClass(tree, 'dshu-errnote').length, 0);
});

test('drawn: keys — only Enter is kept in the card (Cmd+Enter sends), other keys flow on; the chat box\'s Enter handler ignores the card', async () => {
  const card = cardWith('running', runAt(Date.now()), { questions: [q1] });
  const page = loadPage((method) => (method === 'POST' ? { json: { ...card, said: 'Thanks.' } } : { json: card }));
  const { React } = page.fake;
  const both = () => React.createElement(React.Fragment, null, element(page, 'mission-questions'), element(page, 'mission-run-button'));
  page.fake.render(both());
  await tick();
  let tree = page.fake.render(both());
  const root = byClass(tree, 'dsh-ms-qcard')[0];
  const key = (extra) => { const ev = { stopped: false, prevented: false, isComposing: false, stopPropagation() { ev.stopped = true; }, preventDefault() { ev.prevented = true; }, ...extra }; root.props.onKeyDown(ev); return ev; };
  for (const other of ['a', 'Escape', 'k', 'ArrowDown']) {
    const ev = key({ key: other, metaKey: other === 'k' });
    assert.equal(ev.stopped || ev.prevented, false, `${other} reaches the app`);
  }
  const enter = key({ key: 'Enter' });
  assert.equal(enter.stopped, true);
  assert.equal(enter.prevented, false, 'a plain Enter is a new line in the field');
  await tick(20);
  assert.equal(posts(page).length, 0, 'Enter posts nothing');
  // The seat's own Enter handler (capture phase) leaves a key from the card alone: its target is not the chat box editor.
  const field = fieldsOf(tree)[0];
  const ev = new Event('keydown');
  Object.assign(ev, { key: 'Enter' });
  Object.defineProperty(ev, 'target', { value: field });
  Object.defineProperty(ev, 'isTrusted', { value: true });
  page.editor.innerText = 'a note in the chat box';
  page.seat.dispatch(ev);
  await tick(20);
  assert.equal(ev.defaultPrevented, false);
  assert.equal(posts(page).length, 0);
  // Cmd+Enter presses Send answers.
  type(field, '3000');
  tree = page.fake.render(both());
  const send = key.call(null, { key: 'Enter', metaKey: true });
  assert.equal(send.prevented, true);
  await tick(30);
  assert.deepEqual(posts(page), [{ sessionId: 's1', action: 'answer', answers: [{ id: 'q1', text: '3000' }] }]);
});

test('drawn: no card for no Mission, a start, a run without questions, an ended run that cannot continue, or one closed with ×', async () => {
  const now = Date.now();
  const cases = [
    ['none', { ...cardWith('none', null) }],
    ['starting', cardWith('starting', null)],
    ['running, no questions', cardWith('running', runAt(now))],
    ['ended, cannot continue', cardWith('finished', runAt(now, { status: 'stopped', endedAt: now - 1000 }), { questions: [q1], canContinue: false })],
    ['ended a day ago', cardWith('finished', runAt(now, { status: 'stopped', endedAt: now - DAY - 1000 }), { questions: [q1], canContinue: true })],
  ];
  for (const [name, card] of cases) {
    const page = loadPage(() => ({ json: card }));
    const tree = await drawCard(page);
    assert.equal(tree, null, name);
  }
  const ended = cardWith('finished', runAt(now, { status: 'stopped', endedAt: now - 1000 }), { questions: [q1], canContinue: true });
  const store = new Map([['dsh-mission.dismissed', JSON.stringify([`r1:${now - 1000}`])]]);
  assert.equal(await drawCard(loadPage(() => ({ json: ended }), store)), null, 'closed with × (new key)');
  const old = new Map([['dsh-mission.dismissed', JSON.stringify(['r1'])]]);
  assert.equal(await drawCard(loadPage(() => ({ json: ended }), old)), null, 'closed with × before stage C (run id)');
  const continued = { ...ended, run: { ...ended.run, continues: 1 } };
  assert.ok(await drawCard(loadPage(() => ({ json: continued }), old)), 'a continued run that ended again shows again');
  const shownAgain = { ...ended, run: { ...ended.run, showFrom: now } };
  assert.ok(await drawCard(loadPage(() => ({ json: shownAgain }), new Map([['dsh-mission.dismissed', JSON.stringify([`r1:${now - 1000}`])]]))), 'a typed /mission resume shows it again');
});

test('drawn: the strip\'s × closes the finished strip and its questions card together, by run and end', async () => {
  const now = Date.now();
  const ended = cardWith('finished', runAt(now, { status: 'stopped', endedAt: now - 1000, report: 'Mission ended.' }), { questions: [q1], canContinue: true });
  const page = loadPage(() => ({ json: ended }));
  const { React } = page.fake;
  const both = () => React.createElement(React.Fragment, null, element(page, 'mission-run'), element(page, 'mission-questions'));
  page.fake.render(both());
  await tick();
  let tree = page.fake.render(both());
  assert.match(textOf(tree), /Ended · a question left for you · report ready/);
  assert.match(textOf(tree), /Press Finish it to answer what is left or change what it decided; the same Mission then does the rest\./);
  assert.equal(byClass(tree, 'dsh-ms-qcard').length, 1);
  const close = buttonsOf(tree).find((b) => b.text === '×');
  assert.equal(close.node.props.title, 'Close this strip and its questions');
  close.node.props.onClick();
  tree = page.fake.render(both());
  assert.equal(byClass(tree, 'dsh-ms-run').length, 0);
  assert.equal(byClass(tree, 'dsh-ms-qcard').length, 0);
  assert.deepEqual(JSON.parse(page.store.get('dsh-mission.dismissed')), [`r1:${now - 1000}`]);
});

test('drawn: the End question says a Mission with open questions can still be continued; without, the stage B words', async () => {
  for (const [questions, want] of [[[q1], 'End the Mission now and write its report? Afterwards it can only be continued by answering the questions it still has.'], [[], 'End the Mission now and write its report? It cannot be continued afterwards.']]) {
    const card = cardWith('running', runAt(Date.now()), { questions });
    const page = loadPage((method) => (method === 'POST' ? { json: { ...card, said: 'Ended.' } } : { json: card }));
    page.fake.render(element(page, 'mission-run'));
    await tick();
    const tree = page.fake.render(element(page, 'mission-run'));
    buttonsOf(tree).find((b) => b.text === 'End').node.props.onClick();
    await tick(30);
    assert.equal(page.asked.length, 1);
    assert.ok(page.asked[0].includes(want), page.asked[0]);
  }
});

test('drawn: two panes on one conversation keep their own drafts', async () => {
  const card = cardWith('running', runAt(Date.now()), { questions: [q1] });
  const page = loadPage(() => ({ json: card }));
  const { React } = page.fake;
  const panes = () => React.createElement(React.Fragment, null, element(page), element(page));
  page.fake.render(panes());
  await tick();
  let tree = page.fake.render(panes());
  const [left] = fieldsOf(tree);
  type(left, 'left pane answer');
  tree = page.fake.render(panes());
  assert.deepEqual(fieldsOf(tree).map((f) => f.props.value), ['left pane answer', '']);
});

test('drawn: when the last question is answered the card goes, but what the Mission said stays a few seconds', async () => {
  let card = cardWith('running', runAt(Date.now()), { questions: [q1] });
  const page = loadPage((method) => {
    if (method !== 'POST') return { json: card };
    card = cardWith('running', runAt(Date.now()));
    return { json: { ...card, said: 'Thanks: 1 answer given. The Mission goes on with them.' } };
  });
  let tree = await drawCard(page);
  type(fieldsOf(tree)[0], '3000');
  tree = redraw(page);
  await button(tree, 'Send answers').node.props.onClick();
  await tick(30);
  tree = redraw(page);
  assert.equal(fieldsOf(tree).length, 0);
  assert.ok(!button(tree, 'Send answers'));
  const status = findAll(tree, (node) => node.props?.role === 'status');
  assert.deepEqual(status.map(textOf), ['Thanks: 1 answer given. The Mission goes on with them.']);
});

test('drawn: an estimate over 12 hours is not offered as a choice (a continue cannot take it); the suggestion, Other time and No time limit stay', async () => {
  const now = Date.now();
  const ended = cardWith('finished', runAt(now, { status: 'stopped', endedAt: now - 60000 }), { questions: [q1], canContinue: true });
  const quote = { run: true, minutes: 30, needed: 900, noLimit: false, perItem: 30, measured: true, units: 30, cap: 30, capped: true, stepMinutes: 4, raised: false, late: 0 };
  const page = loadPage((method, body) => {
    if (method === 'POST' && body.minutes === undefined) return { json: { ...ended, said: '', quote } };
    return { json: ended };
  });
  let tree = await drawCard(page);
  type(fieldsOf(tree)[0], 'Paris');
  tree = redraw(page);
  await button(tree, 'Finish it').node.props.onClick();
  await tick(30);
  tree = redraw(page);
  assert.deepEqual(byClass(tree, 'dsh-ms-qchip').map(textOf), ['30 min (suggested)', 'No time limit']);
  assert.match(textOf(tree), /doing all of it may take about 900 minutes\./);
  assert.equal(findAll(tree, (node) => node.type === 'select').length, 1);
});

// ---- Review of stage C (20 November 2026) ----

test('drawn: the End question counts answers that came too late: those can still be continued after the end', async () => {
  const late = [{ id: 'q5', text: 'Which name?', answer: 'Ada', items: ['2'] }];
  const card = cardWith('running', runAt(Date.now(), { lateAnswers: late }), { questions: [] });
  const page = loadPage((method) => (method === 'POST' ? { json: { ...card, said: 'Ended.' } } : { json: card }));
  page.fake.render(element(page, 'mission-run'));
  await tick();
  const tree = page.fake.render(element(page, 'mission-run'));
  buttonsOf(tree).find((b) => b.text === 'End').node.props.onClick();
  await tick(30);
  assert.equal(page.asked.length, 1);
  assert.ok(page.asked[0].includes('Afterwards it can only be continued by answering the questions it still has.'), page.asked[0]);
});

test('CSS: a chosen time chip and a pressed Skip are filled with the app\'s primary button colours and carry a check mark', () => {
  const chosen = client.split('\n').filter((line) => line.startsWith('.dsh-ms-qskip[aria-pressed="true"], .dsh-ms-qchip[aria-checked="true"]'));
  assert.ok(chosen.some((line) => /\{ border-color: var\(--dsw-alias-button-info-fill\); background: var\(--dsw-alias-button-info-fill\); color: var\(--dsw-alias-label-on-color\); \}/.test(line)), chosen.join('\n'));
  assert.ok(client.includes('.dsh-ms-qskip[aria-pressed="true"]::before, .dsh-ms-qchip[aria-checked="true"]::before { content: "\\\\2713";'), 'a check mark');
  assert.ok(!chosen.some((line) => /brand-primary/.test(line)), 'never brand-primary: it is the label colour in this theme');
});

test('drawn: every field has its (i) and is described by who asked and its default; Back and Other time have their (i)', async () => {
  const now = Date.now();
  const ended = cardWith('finished', runAt(now, { status: 'stopped', endedAt: now - 60000 }), { questions: [q1, q3], canContinue: true });
  const quote = { run: true, minutes: 15, needed: 15, noLimit: false, perItem: 5, measured: true, units: 3, cap: 30, capped: false, stepMinutes: 2, raised: false, late: 0 };
  const page = loadPage((method, body) => (method === 'POST' && body.action === 'continue' ? { json: { ...ended, said: '', quote } } : { json: ended }));
  let tree = await drawCard(page);
  const fields = fieldsOf(tree);
  assert.equal(buttonsOf(tree).filter((b) => b.label === 'About Your answer').length, 2);
  for (const field of fields) {
    const ids = String(field.props['aria-describedby'] ?? '').split(' ').filter(Boolean);
    assert.equal(ids.length, 2);
    const described = ids.map((id) => textOf(findAll(tree, (node) => node.props?.id === id)[0]));
    assert.match(described[0], /^Asked by /);
    assert.match(described[1], /^If you don't answer: /);
  }
  type(fields[0], '3000');
  tree = redraw(page);
  await button(tree, 'Finish it').node.props.onClick();
  await tick(30);
  tree = redraw(page);
  assert.match(textOf(tree), /How much more time\?/);
  assert.ok(buttonsOf(tree).some((b) => b.label === 'About Back'));
  assert.ok(buttonsOf(tree).some((b) => b.label === 'About Other time'));
});

test('drawn: while answers are sent the fields stay focusable (read-only, not disabled)', async () => {
  const card = cardWith('running', runAt(Date.now()), { questions: [q1, q3] });
  const page = loadPage(() => ({ json: card }));
  let tree = await drawCard(page);
  type(fieldsOf(tree)[0], '3000');
  tree = redraw(page);
  const sending = button(tree, 'Send answers').node.props.onClick();
  tree = redraw(page);
  const fields = fieldsOf(tree);
  assert.ok(fields.every((field) => field.props.disabled !== true), 'no field loses the focus');
  assert.ok(fields.every((field) => field.props.readOnly === true && field.props['aria-busy'] === true));
  await sending;
});
