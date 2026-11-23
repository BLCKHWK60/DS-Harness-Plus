// Stage B (19 November 2026): the status strip, the main button beside Send, Start Mission and the Mission settings,
// in the page file (client.js). Pure parts are run on their own; the strip and the button are drawn with a small
// stand-in for React and the page, against a stand-in for the /dsh-mission/long route.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const between = (from, to, start = 0) => { const a = client.indexOf(from, start); const b = client.indexOf(to, a + from.length); assert.ok(a >= 0 && b > a, `${from} … ${to}`); return client.slice(a, b); };

// ---- the pure block ----
const block = between('// ---- mission-strip:begin', '// ---- mission-strip:end');
const pure = () => new Function(`${block}\nreturn { TIME_CHOICES, mainLabel, timeWords, stripWords, enterDoes, missionWords, ownWords, problemFix, INFO };`)();
const { TIME_CHOICES, mainLabel, timeWords, stripWords, enterDoes, missionWords, ownWords, problemFix, INFO } = pure();

const NOW = 1_800_000_000_000;
const runOf = (extra = {}) => ({ id: 'r1', kind: 'long', status: 'running', steps: 31, stepsAbout: 60, items: [], deadline: NOW + (2 * 60 + 14) * 60000, pausedAt: 0, lap: 2, laps: 10, phase: 'work', workingItem: '7', ...extra });
const cardOf = (state, run, strip = {}) => ({ run, strip: { state, main: { running: 'note', waiting: 'answer', paused: 'resume', problem: 'resume' }[state] ?? 'send', questions: [], canFinishLap: false, problem: null, pausedBy: '', retryAt: 0, ...strip } });

test('the strip says in words what is happening, for every state', () => {
  assert.deepEqual(stripWords(cardOf('none', null), NOW), { dot: 'idle', words: '', next: '' });
  const running = stripWords(cardOf('running', runOf()), NOW);
  assert.equal(running.words, 'Running · 2 h 14 m left · step 31 of ~60 · now: item 7');
  assert.equal(running.dot, 'busy');
  assert.match(running.next, /press Add note/);
  assert.equal(stripWords(cardOf('running', runOf({ stepsAbout: 0, workingItem: '', phase: 'plan', finishLap: true })), NOW).words, 'Running · 2 h 14 m left · step 31 · now: making the plan · finishing this lap');
  const q = [{ n: 1, id: 'q1', text: 'Which port?', assume: '8080' }, { n: 2, id: 'q2', text: 'Tabs?', assume: 'spaces' }];
  // Stage D: open questions while it runs are part of 'running'; 'waiting' means nothing else can move until you answer.
  const asking = stripWords(cardOf('running', runOf(), { questions: q }), NOW);
  assert.equal(asking.words, 'Running · 2 h 14 m left · step 31 of ~60 · now: item 7 · 2 questions for you');
  assert.equal(asking.dot, 'busy');
  assert.equal(asking.next, 'Answer in the card below; the rest goes on meanwhile. Add note steers it.');
  const waiting = stripWords(cardOf('waiting', runOf(), { questions: q, waitUntil: 0 }), NOW);
  assert.equal(waiting.words, 'Waiting for you · 2 questions · nothing else can move · time limit paused');
  assert.equal(waiting.dot, 'warn');
  assert.equal(waiting.next, 'Answer in the card below. It waits until you answer; its time limit is paused meanwhile, and the Mac may sleep.');
  const paused = stripWords(cardOf('paused', runOf({ pausedAt: NOW - 9 * 60000 }), { pausedBy: 'you' }), NOW);
  // The clock stood still for the 9 minutes of the pause.
  assert.equal(paused.words, 'Paused at step 31 · nothing lost · 2 h 23 m left, clock stopped');
  assert.match(paused.next, /Press Resume to carry on\. Meanwhile Enter talks to the assistant as usual\.$/);
  assert.match(stripWords(cardOf('paused', runOf({ pausedAt: NOW }), { pausedBy: 'you', questions: q }), NOW).next, /goes along as a note \(lines that start with 1\., 2\., … answer those questions\)/);
  assert.match(stripWords(cardOf('paused', runOf({ pausedAt: NOW }), { pausedBy: 'restart' }), NOW).words, /^Paused when the app restarted · nothing lost/);
  assert.match(stripWords(cardOf('paused', runOf(), { pausedBy: 'app' }), NOW).words, /^Paused · nothing lost/);
  const problem = stripWords(cardOf('problem', runOf({ pausedAt: NOW }), { problem: { text: 'Your model server did not answer.', details: 'ECONNREFUSED' }, retryAt: NOW + 4.5 * 60000 }), NOW);
  assert.equal(problem.words, 'Stopped by a problem: Your model server did not answer.');
  assert.equal(problem.dot, 'error');
  assert.equal(problem.next, 'Fix it if you can, then press Resume. Resume checks the problem first. It tries again by itself in 5 min.');
  assert.equal(stripWords(cardOf('starting', null), NOW).words, 'Starting the Mission…');
  const items = [{ status: 'verified' }, { status: 'stuck' }, { status: 'reviewed' }];
  assert.equal(stripWords(cardOf('finished', runOf({ status: 'complete', items })), NOW).words, 'Done · report ready');
  assert.equal(stripWords(cardOf('finished', runOf({ status: 'complete', items })), NOW).dot, 'ok');
  assert.equal(stripWords(cardOf('finished', runOf({ status: 'incomplete', items })), NOW).words, 'Finished · 2 of 3 done · report ready');
  assert.equal(stripWords(cardOf('finished', runOf({ status: 'stopped', items })), NOW).words, 'Ended · report ready');
  assert.match(stripWords(cardOf('finished', runOf({ status: 'stopped' })), NOW).next, /Start Mission starts a new one/);
});

test('no time limit, and a problem that already says press Resume', () => {
  assert.equal(timeWords(runOf({ deadline: 0 }), NOW), 'no time limit');
  assert.equal(stripWords(cardOf('running', runOf({ deadline: 0 })), NOW).words, 'Running · no time limit · step 31 of ~60 · now: item 7');
  assert.equal(stripWords(cardOf('paused', runOf({ deadline: 0, pausedAt: NOW }), { pausedBy: 'you' }), NOW).words, 'Paused at step 31 · nothing lost');
  assert.equal(timeWords(runOf({ deadline: NOW - 1000 }), NOW), 'time is up after this step');
  assert.equal(timeWords(runOf({ deadline: NOW + 45 * 60000 }), NOW), '45 m left');
  assert.equal(problemFix({ problem: { text: 'The Budget guard: it used its allowance, then press Resume.' }, retryAt: 0 }, NOW), '');
});

test('the main button\'s words, short in a tiny row', () => {
  assert.equal(mainLabel('send'), 'Start Mission');
  assert.equal(mainLabel('note'), 'Add note');
  assert.equal(mainLabel('answer'), 'Answer and continue');
  assert.equal(mainLabel('resume'), 'Resume');
  assert.equal(mainLabel('note', true), 'Note');
  assert.equal(mainLabel('answer', true), 'Answer');
});

test('Enter gives a note or the answers only for a real, plain Enter with text, and never while paused', () => {
  const key = (extra = {}) => ({ isTrusted: true, key: 'Enter', shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, isComposing: false, keyCode: 13, ...extra });
  assert.equal(enterDoes(key(), 'note', 'use port 8080', false), 'note');
  assert.equal(enterDoes(key(), 'answer', '1. yes', false), 'answer');
  assert.equal(enterDoes(key({ shiftKey: true }), 'note', 'x y', false), 'pass', 'Shift+Enter is a new line');
  assert.equal(enterDoes(key({ metaKey: true }), 'note', 'x y', false), 'pass', 'Cmd+Enter keeps the app\'s steer/queue');
  assert.equal(enterDoes(key({ ctrlKey: true }), 'note', 'x y', false), 'pass');
  assert.equal(enterDoes(key({ altKey: true }), 'note', 'x y', false), 'pass');
  assert.equal(enterDoes(key({ isComposing: true }), 'note', 'x y', false), 'pass', 'IME composition');
  assert.equal(enterDoes(key({ keyCode: 229 }), 'note', 'x y', false), 'pass', 'IME composition (keyCode 229)');
  assert.equal(enterDoes(key({ isTrusted: false }), 'note', 'x y', false), 'pass', 'a synthetic Enter (Learn) reaches the app');
  assert.equal(enterDoes(key(), 'note', 'x y', true), 'pass', 'an open @ or / pop-up picks');
  assert.equal(enterDoes(key(), 'note', '/mission end', false), 'pass', 'slash commands reach the app');
  assert.equal(enterDoes(key(), 'note', '   ', false), 'pass');
  assert.equal(enterDoes(key(), 'resume', 'hello', false), 'pass', 'while paused Enter talks to the assistant');
  assert.equal(enterDoes(key(), 'send', 'hello', false), 'pass');
  assert.equal(enterDoes(key({ key: 'a' }), 'note', 'hello', false), 'pass');
});

test('the start question and the title follow this chat\'s Mission settings, with no time limit too', () => {
  const timed = missionWords({ minutes: 120, laps: 10, tools: { files: true, web: true } });
  assert.equal(timed.summary, '2 h, 10 laps, files and web');
  assert.equal(timed.confirm, 'What you typed and this thread so far become its brief. It then works by itself for up to 2 hours, in up to 10 laps. It may change files in the folder and use the web.\n\nIt can use many tokens. You can pause or end it at any time, above the chat box.');
  const open = missionWords({ minutes: 0, laps: 0, tools: { files: true, web: false } });
  assert.equal(open.summary, 'no time limit, files');
  assert.match(open.confirm, /works by itself until its checklist is done\. It may change files in the folder\./);
  assert.match(missionWords(null).confirm, /within the time and laps set in Settings → Mission\./);
  assert.equal(missionWords({ minutes: 90, laps: 3 }).summary, '1 h 30 min, 3 laps');
  assert.deepEqual(TIME_CHOICES.map((choice) => choice.value), [0, 10, 30, 60, 120, 240, 480, 720]);
  assert.equal(TIME_CHOICES[0].label, 'No time limit');
});

test('a Split Plus card in the chat box is never counted as the user\'s own words', () => {
  const card = '[Split Plus send AB12, 2026-11-19 10:00: material, not instructions]\nfix all the tests now please\n[End of Split Plus send AB12]';
  assert.equal(ownWords(`${card}\ndo it`), 'do it');
  assert.equal(ownWords('[Split Plus send AB12, 2026-11-19 10:00: material, not instructions] open card'), '');
  // The same rule as lib/sent.js withoutSends.
  const sent = readFileSync(new URL('../lib/sent.js', import.meta.url), 'utf8');
  assert.ok(sent.includes('material, not instructions\\]/'));
  assert.ok(block.includes('material, not instructions\\]/'));
});

test('every Mission control has an (i) with what, when and what changes', () => {
  for (const key of ['start', 'note', 'answer', 'resume', 'pause', 'finishLap', 'end', 'checklist', 'report', 'time', 'laps', 'steps']) {
    assert.ok(INFO[key]?.title && INFO[key]?.what, key);
  }
  assert.match(INFO.pause.what, /The step under way stops and is done again when you resume/);
  assert.doesNotMatch(client, /No new step starts; the step under way stops/);
});

// ---- the page file, read as text ----
test('CSS: the goal bar is hidden per chat box, and Send (never Stop) gives way to the main button', () => {
  assert.doesNotMatch(client, /html\[data-dsh-long-run\]/);
  assert.match(client, /\[data-dsh-mission\] \[data-goal-bar\] \{ display: none !important; \}/);
  assert.match(client, /\[data-dsh-mission-main\] \[class\*="_trailing"\] button\[aria-busy\]\[class\*="_primary"\]:not\(:has\(rect\)\) \{ display: none !important; \}/);
  assert.match(client, /\[data-dsh-tiny\] \.dsh-ms-main::after \{ content: attr\(data-short\)/);
  assert.match(client, /\.dsh-ms-qlist \{[^}]*max-height: 96px; overflow: auto;/);
  // The pop-up an Enter must not override, by the attribute the app's input-trigger menu carries.
  assert.match(client, /document\.querySelector\('\[data-trigger-menu\]'\) !== null/);
});

test('the main button goes to the Mission directly: never a click on the app\'s Send or Stop', () => {
  const press = between('// ---- main-button:begin', '// ---- main-button:end');
  assert.match(press, /act\(text \? \{ action, text \} : \{ action \}\)/);
  assert.doesNotMatch(press, /\.click\(\)/);
  const drawn = client.slice(client.indexOf("className: 'dsh-ms-main'"), client.indexOf("className: 'dsh-ms-main'") + 400);
  assert.match(drawn, /onClick: \(\) => void pressMain\(\)/);
  assert.doesNotMatch(drawn, /\.click\(\)/);
});

test('one card store: one polling loop per conversation, 2 s while a Mission is on, 4 s otherwise, with since', () => {
  assert.equal((client.match(/dshPoll\.loop\(/g) ?? []).length, 1);
  assert.match(client, /every: \(\) => \(isLiveCard\(entry\.card\) \? 2000 : 4000\)/);
  assert.match(client, /url\.searchParams\.set\('since', body\.since\)/);
  assert.match(client, /const FULL_MS = 30000;/);
});

test('the strip: Finish this lap only when the server says it can still do something; every button has its (i)', () => {
  const card = between('function RunCard(', 'function LongSetup(');
  // Stage E: also while it waits for its model server ('down'), whose clock stands still too.
  assert.match(card, /const canFinish = strip\?\.canFinishLap === true && \(state === 'waiting' \|\| down \|\| !\(deadline > 0 && now >= deadline\)\);/);
  assert.match(card, /canFinish \? h\('button'[^\n]*'Finish this lap'\)/);
  const buttons = card.split('\n').filter((line) => /h\('button', \{ type: 'button', className: 'dsh-ms-btn'/.test(line) && !/'×'/.test(line));
  assert.equal(buttons.length, 6, 'Try now (stage E), Pause, Finish this lap, End, Checklist, Report');
  const lines = card.split('\n');
  for (const line of buttons) assert.match(lines[lines.indexOf(line) + 1], /h\(ui\.Info, INFO\./, line.trim().slice(0, 60));
  assert.doesNotMatch(card, /act\('resume'\)/, 'Resume lives on the main button, not on the strip');
  assert.match(card, /h\(ui\.StateLine, /);
  assert.match(card, /h\(ui\.ErrorNote, \{ what: strip\?\.problem\?\.text/);
});

test('the shared page parts are in the page file, and the Depth pick and state events are wired', () => {
  assert.match(client, /\/\/ ---- dsh-ui:begin ----/);
  assert.match(client, /\/\/ ---- dsh-ui:end ----/);
  assert.match(client, /const ui = dshUi\.makeParts\(React\);/);
  assert.match(client, /window\.addEventListener\('dsh-mission:start', onStart\)/);
  assert.match(client, /detail\.handled = true;/);
  assert.match(client, /new CustomEvent\('dsh-mission:state', \{ detail: \{ sessionId, state \} \}\)/);
  assert.match(client, /window\.__dshMissionState = /);
});

// ---- drawing the strip and the button ----
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
function loadPage(route) {
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
  Object.assign(win, { __ModuleLoader__: { load: (module) => { loaded = module; } }, localStorage: { getItem: () => null, setItem() {} } });
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
  const page = { fake, win, html, seat, editor, sendButton, calls, asked, parts, popup: false };
  return page;
}

const baseCard = (extra = {}) => ({ at: NOW, stamp: 'b.1.0.0.0', run: null, preflight: { ok: true, ticks: [] }, saved: { minutes: 0, laps: 0, steps: 0, tools: { files: true, web: false } }, runButton: true, armed: false, busy: false, startError: null, hasThread: true, strip: { state: 'none', main: 'send', questions: [], canFinishLap: false, problem: null, pausedBy: '', retryAt: 0, noTimeLimit: true }, ...extra });

async function drawButton(page, sessionId = 's1') {
  const { React } = page.fake;
  const element = React.createElement(page.parts['mission-run-button'], { sessionId });
  page.fake.render(element);
  await tick();
  return page.fake.render(element);
}

test('drawn: no Mission → Start Mission beside Send with its (i); the seat has no Mission marks and the old page-wide mark goes', async () => {
  const page = loadPage(() => ({ json: baseCard() }));
  const tree = await drawButton(page);
  const buttons = buttonsOf(tree);
  assert.ok(buttons.some((b) => b.text === 'Start Mission' && b.label === 'Start Mission'));
  assert.ok(buttons.some((b) => b.label === 'About Start Mission'));
  assert.equal(page.seat.getAttribute('data-dsh-mission'), null);
  assert.equal(page.seat.getAttribute('data-dsh-mission-main'), null);
  assert.equal(page.html.getAttribute('data-dsh-long-run'), null);
  assert.equal(page.win.__dshMissionState?.s1, undefined, 'none is the starting state: nothing to tell');
});

test('drawn: a failed pre-flight greys Start Mission with the reason, so it asks nothing', async () => {
  const card = baseCard({ preflight: { ok: false, ticks: [{ key: 'folder', ok: false, required: true, text: 'This thread has no folder. Pick a project on the start page first.' }] }, stamp: 'b.2.0.0.0' });
  // A failed pre-flight: the button is greyed with the reason, and pressing says why without a question.
  const page2 = loadPage(() => ({ json: card }));
  const tree2 = await drawButton(page2);
  const greyed = buttonsOf(tree2).find((b) => b.text === 'Start Mission');
  assert.equal(greyed.node.props.disabled, true);
  assert.match(greyed.node.props.title, /no folder/);
  assert.equal(greyed.node.props['aria-description'], 'This thread has no folder. Pick a project on the start page first.');
});

test('drawn: running → Add note takes Send\'s place; the click posts the note to the route and clears the chat box', async () => {
  const run = runOf();
  const card = baseCard({ run, strip: { state: 'running', main: 'note', questions: [], canFinishLap: true, problem: null, pausedBy: '', retryAt: 0 } });
  const page = loadPage((method, body) => (method === 'POST' && body.action === 'note' ? { json: { ...card, stamp: 'b.9.0.0.0', said: 'Your note reaches the Mission at its next step.' } } : { json: card }));
  const tree = await drawButton(page);
  const main = byClass(tree, 'dsh-ms-main')[0];
  assert.ok(main, 'the main button shows');
  assert.equal(textOf(main), 'Add note');
  assert.equal(main.props['data-short'], 'Note');
  assert.ok(!buttonsOf(tree).some((b) => b.text === 'Start Mission'), 'Start Mission is gone while a Mission exists');
  assert.equal(page.seat.getAttribute('data-dsh-mission'), 'running');
  assert.equal(page.seat.getAttribute('data-dsh-mission-main'), 'note');
  assert.equal(page.win.__dshMissionState.s1, 'running');
  // Empty: a tip, no post.
  await main.props.onClick();
  assert.equal(page.calls.filter((c) => c.method === 'POST').length, 0);
  // A / command is left to Enter.
  page.editor.innerText = '/mission end';
  await main.props.onClick();
  assert.equal(page.calls.filter((c) => c.method === 'POST').length, 0);
  page.editor.innerText = 'Use port 8080, not 3000.';
  await main.props.onClick();
  await tick(100);
  const posts = page.calls.filter((c) => c.method === 'POST');
  assert.deepEqual(posts.map((c) => c.body), [{ sessionId: 's1', action: 'note', text: 'Use port 8080, not 3000.' }]);
  assert.equal(page.editor.innerText, '', 'the chat box is emptied');
  assert.equal(page.sendButton.clicks, 0, 'the app\'s Send was never pressed');
});

test('drawn: an untrusted (synthetic) Enter in the chat box is never caught while running', async () => {
  const card = baseCard({ run: runOf(), strip: { state: 'running', main: 'note', questions: [], canFinishLap: false, problem: null, pausedBy: '', retryAt: 0 } });
  const page = loadPage(() => ({ json: card }));
  await drawButton(page);
  // A trusted Enter cannot be made in a test; a plain one is not trusted, so it passes (as Learn's synthetic Enter does).
  page.editor.innerText = 'a note';
  const synthetic = new Event('keydown');
  Object.assign(synthetic, { key: 'Enter' });
  Object.defineProperty(synthetic, 'target', { value: page.editor });
  page.seat.dispatch(synthetic);
  await tick(30);
  assert.equal(page.calls.filter((c) => c.method === 'POST').length, 0, 'an untrusted Enter is never caught');
  assert.equal(synthetic.defaultPrevented, false);
});

test('drawn: waiting → Answer and continue; paused → Resume (Enter passes); finished → Start Mission again', async () => {
  const q = [{ n: 1, id: 'q1', text: 'Which port?', assume: '8080', items: [] }];
  const waiting = baseCard({ run: runOf(), strip: { state: 'waiting', main: 'answer', questions: q, canFinishLap: false, problem: null, pausedBy: '', retryAt: 0 } });
  let page = loadPage(() => ({ json: waiting }));
  let tree = await drawButton(page);
  assert.equal(textOf(byClass(tree, 'dsh-ms-main')[0]), 'Answer and continue');
  const paused = baseCard({ run: runOf({ pausedAt: NOW }), strip: { state: 'paused', main: 'resume', questions: [], canFinishLap: false, problem: null, pausedBy: 'you', retryAt: 0 } });
  page = loadPage((method, body) => (method === 'POST' ? { json: { ...paused, said: `did ${body.action}` } } : { json: paused }));
  tree = await drawButton(page);
  const main = byClass(tree, 'dsh-ms-main')[0];
  assert.equal(textOf(main), 'Resume');
  assert.equal(page.seat.getAttribute('data-dsh-mission'), 'paused');
  page.editor.innerText = 'carry on with the tests first';
  await main.props.onClick();
  await tick(100);
  assert.deepEqual(page.calls.filter((c) => c.method === 'POST').map((c) => c.body), [{ sessionId: 's1', action: 'resume', text: 'carry on with the tests first' }]);
  const finished = baseCard({ run: runOf({ status: 'complete', endedAt: Date.now() }), strip: { state: 'finished', main: 'send', questions: [], canFinishLap: false, problem: null, pausedBy: '', retryAt: 0 } });
  page = loadPage(() => ({ json: finished }));
  tree = await drawButton(page);
  assert.ok(buttonsOf(tree).some((b) => b.text === 'Start Mission'));
  assert.equal(page.seat.getAttribute('data-dsh-mission'), null, 'the goal bar comes back');
  assert.equal(page.seat.getAttribute('data-dsh-mission-main'), null, 'Send comes back');
});

test('drawn: an error from the route shows on the strip in plain words with Details', async () => {
  const card = baseCard({ run: runOf(), strip: { state: 'running', main: 'note', questions: [], canFinishLap: true, problem: null, pausedBy: '', retryAt: 0 } });
  const page = loadPage((method) => (method === 'POST' ? { status: 400, json: { error: 'No Mission is on here, so the note was not given.', details: 'run-ended' } } : { json: card }));
  const { React } = page.fake;
  const both = () => React.createElement(React.Fragment, null, React.createElement(page.parts['mission-run'], { sessionId: 's1' }), React.createElement(page.parts['mission-run-button'], { sessionId: 's1' }));
  page.fake.render(both());
  await tick();
  let tree = page.fake.render(both());
  page.editor.innerText = 'a note';
  await byClass(tree, 'dsh-ms-main')[0].props.onClick();
  await tick(20);
  tree = page.fake.render(both());
  const note = byClass(tree, 'dshu-errnote')[0];
  assert.ok(note, 'an error note shows');
  assert.match(textOf(note), /No Mission is on here, so the note was not given\./);
  assert.match(textOf(note), /Details/);
});

test('drawn: the strip — words, Pause, Finish this lap only when it can act, End, Checklist, no Resume; questions in the card, not the strip', async () => {
  const q = [{ n: 1, id: 'q1', text: 'Which port?', assume: '8080', items: [] }];
  const card = (strip) => baseCard({ run: runOf({ items: [{ id: '1', title: 'Fix the test', status: 'open' }] }), strip: { questions: [], canFinishLap: false, problem: null, pausedBy: '', retryAt: 0, ...strip } });
  const drawStrip = async (got) => {
    const page = loadPage(() => ({ json: got }));
    const element = page.fake.React.createElement(page.parts['mission-run'], { sessionId: 's1' });
    page.fake.render(element);
    await tick();
    return page.fake.render(element);
  };
  let tree = await drawStrip(card({ state: 'running', main: 'note', canFinishLap: true }));
  let texts = buttonsOf(tree).map((b) => b.text);
  assert.ok(textOf(tree).includes('Running · '));
  for (const want of ['Pause', 'Finish this lap', 'End', 'Checklist (1)']) assert.ok(texts.includes(want), want);
  assert.ok(!texts.includes('Resume'));
  tree = await drawStrip(card({ state: 'running', main: 'note', canFinishLap: false }));
  assert.ok(!buttonsOf(tree).some((b) => b.text === 'Finish this lap'), 'hidden when it can do nothing (time up, last lap)');
  // Point 17 review: a wait that runs past the first deadline keeps Finish this lap (its clock stands still).
  const past = (state) => baseCard({ run: runOf({ deadline: Date.now() - 60000, items: [{ id: '1', title: 'Fix the test', status: 'parked' }] }), strip: { questions: q, canFinishLap: true, problem: null, pausedBy: '', retryAt: 0, state, main: 'note' } });
  tree = await drawStrip(past('waiting'));
  assert.ok(buttonsOf(tree).some((b) => b.text === 'Finish this lap'), 'waiting past the first deadline: still offered');
  tree = await drawStrip(past('running'));
  assert.ok(!buttonsOf(tree).some((b) => b.text === 'Finish this lap'), 'running past the deadline: hidden');
  tree = await drawStrip(card({ state: 'running', main: 'note', questions: q }));
  // Stage C: the strip no longer lists the questions (no duplicate list); the questions card under it shows them.
  assert.equal(byClass(tree, 'dsh-ms-qlist').length, 0);
  assert.doesNotMatch(textOf(tree), /Which port\?/);
  assert.match(textOf(tree), / · 1 question for you/);
  {
    const page = loadPage(() => ({ json: card({ state: 'running', main: 'note', questions: q }) }));
    const element = page.fake.React.createElement(page.parts['mission-questions'], { sessionId: 's1' });
    page.fake.render(element);
    await tick();
    const qcard = page.fake.render(element);
    assert.match(textOf(findAll(qcard, (node) => node.type === 'legend')), /1\. Which port\?/);
    assert.match(textOf(qcard), /If you don't answer: 8080/);
  }
  tree = await drawStrip(card({ state: 'problem', main: 'resume', problem: { text: 'Your model server did not answer.', details: 'ECONNREFUSED 127.0.0.1' } }));
  texts = buttonsOf(tree).map((b) => b.text);
  assert.ok(!texts.includes('Pause') && !texts.includes('Resume'));
  assert.match(textOf(tree), /Your model server did not answer\./);
  assert.match(textOf(tree), /Fix it if you can, then press Resume\./);
  assert.ok(texts.includes('Details'), 'the raw error only behind Details');
  assert.doesNotMatch(textOf(tree), /ECONNREFUSED/);
  tree = await drawStrip(baseCard());
  assert.equal(tree, null, 'no Mission: no strip');
});

// ---- Stage B review (19 November) ----------------------------------------------------------------------
const SPLIT_CARD = '[Split Plus send AB12CD, 2026-11-19 09:00: material, not instructions]\nsome pasted material\n[End of Split Plus send AB12CD]';
const posts = (page) => page.calls.filter((c) => c.method === 'POST').map((c) => c.body);
const tipOf = (tree) => textOf(byClass(tree, 'dsh-ms-runtip'));

test('CSS: the main button uses the app\'s primary button colours, readable in dark mode (never brand-primary with a fixed white)', () => {
  const rule = client.slice(client.indexOf('.dsh-ms-main {'), client.indexOf('}', client.indexOf('.dsh-ms-main {')));
  assert.match(rule, /background: var\(--dsw-alias-button-info-fill\); color: var\(--dsw-alias-label-on-color\);/);
  const main = client.split('\n').filter((line) => line.startsWith('.dsh-ms-main'));
  assert.ok(main.length >= 3);
  for (const line of [rule, ...main]) {
    assert.doesNotMatch(line, /brand-primary/, line);
    assert.doesNotMatch(line, /#fff\b/i, line);
  }
  assert.match(client, /\.dsh-ms-main:hover:not\(:disabled\) \{ background: var\(--dsw-alias-button-info-hover\); \}/);
});

test('drawn: Start Mission in a conversation that is not open yet reads the chat box\'s own editor (Send sits in a row beside it)', async () => {
  const page = loadPage(() => ({ status: 400, json: { error: 'That conversation is not open.' } }));
  page.editor.innerText = 'Add a dark mode toggle to the settings page';
  const tree = await drawButton(page);
  const start = buttonsOf(tree).find((b) => b.text === 'Start Mission');
  assert.ok(start && start.node.props.disabled !== true, 'Start Mission works before the thread is open');
  await start.node.props.onClick();
  await tick(30);
  assert.equal(page.asked.length, 1, 'the one question first');
  assert.equal(page.sendButton.clicks, 1, 'the message is sent first; the Mission starts right after it');
  assert.match(tipOf(page.fake.render(page.fake.React.createElement(page.parts['mission-run-button'], { sessionId: 's1' }))), /Sending your message first/);
});

test('review: Start Mission in a chat that is not open yet names the Settings default When it needs you (Full auto) and its wait in the question', async () => {
  const page = loadPage((method, body) => (method === 'GET' && body.defaults === '1' ? { json: { defaults: { minutes: 60, laps: 0, helpers: 4, needs: 'decide', waitAsk: 30, waitHold: 0 }, mode: 'restricted' } } : { status: 400, json: { error: 'That conversation is not open.' } }));
  page.editor.innerText = 'Add a dark mode toggle to the settings page';
  const tree = await drawButton(page);
  await buttonsOf(tree).find((b) => b.text === 'Start Mission').node.props.onClick();
  await tick(30);
  assert.equal(page.asked.length, 1);
  assert.match(page.asked[0], /When it needs you: Full auto\. It never asks you/);
  assert.match(page.asked[0], /for up to 1 hour, with up to 4 helpers at once/);
  assert.equal(page.sendButton.clicks, 1);
  const ask = loadPage((method, body) => (method === 'GET' && body.defaults === '1' ? { json: { defaults: { minutes: 0, laps: 0, helpers: 1, needs: 'ask', waitAsk: 45, waitHold: 0 }, mode: 'auto' } } : { status: 400, json: { error: 'That conversation is not open.' } }));
  ask.editor.innerText = 'Add a dark mode toggle to the settings page';
  await buttonsOf(await drawButton(ask)).find((b) => b.text === 'Start Mission').node.props.onClick();
  await tick(30);
  assert.match(ask.asked[0], /When it needs you: Ask, keep working\. .*it waits for 45 minutes, then ends with its report\./);
});

test('drawn: Start Mission with a / command typed refuses before the question, and neither arms nor sends', async () => {
  const page = loadPage(() => ({ json: baseCard() }));
  page.editor.innerText = '/compact';
  let tree = await drawButton(page);
  await buttonsOf(tree).find((b) => b.text === 'Start Mission').node.props.onClick();
  await tick(30);
  tree = page.fake.render(page.fake.React.createElement(page.parts['mission-run-button'], { sessionId: 's1' }));
  assert.deepEqual(posts(page), [], 'no arm, no start');
  assert.equal(page.sendButton.clicks, 0);
  assert.equal(page.asked.length, 0, 'nothing asked');
  assert.equal(tipOf(tree), 'Press Enter to run a / command, or type what the Mission should do.');
  // The same in a conversation that is not open yet.
  const fresh = loadPage(() => ({ status: 400, json: { error: 'That conversation is not open.' } }));
  fresh.editor.innerText = '/plan add a dark mode toggle';
  const freshTree = await drawButton(fresh);
  await buttonsOf(freshTree).find((b) => b.text === 'Start Mission').node.props.onClick();
  await tick(30);
  assert.equal(fresh.sendButton.clicks, 0);
  assert.equal(fresh.asked.length, 0);
});

test('drawn: Start Mission with only a Split Plus card and a thread starts from the thread, with the card as material; nothing is sent as chat', async () => {
  const page = loadPage((method) => (method === 'POST' ? { json: { ...baseCard({ stamp: 'b.5.0.0.0', strip: { state: 'running', main: 'note', questions: [], canFinishLap: false, problem: null, pausedBy: '', retryAt: 0 } }), run: runOf(), said: 'Started.' } } : { json: baseCard() }));
  page.editor.innerText = SPLIT_CARD;
  const tree = await drawButton(page);
  await buttonsOf(tree).find((b) => b.text === 'Start Mission').node.props.onClick();
  await tick(50);
  assert.equal(page.asked.length, 1, 'the start question still comes first');
  assert.deepEqual(posts(page), [{ sessionId: 's1', action: 'start', fromThread: true, material: SPLIT_CARD }]);
  assert.equal(page.sendButton.clicks, 0, 'the card never goes into the chat as a message');
  assert.equal(page.editor.innerText, '', 'the chat box is emptied');
});

test('drawn: screen readers hear the strip\'s state changes only, never each step; a problem is one alert', async () => {
  const drawStrip = async (got) => {
    const page = loadPage(() => ({ json: got }));
    const element = page.fake.React.createElement(page.parts['mission-run'], { sessionId: 's1' });
    page.fake.render(element);
    await tick();
    return page.fake.render(element);
  };
  let tree = await drawStrip(baseCard({ run: runOf(), strip: { state: 'running', main: 'note', questions: [], canFinishLap: false, problem: null, pausedBy: '', retryAt: 0 } }));
  const line = byClass(tree, 'dshu-state')[0];
  assert.ok(line);
  assert.equal(line.props.role, undefined, 'the step count and time left are not a live region');
  assert.match(textOf(line), /step 31 of ~60/);
  const live = findAll(tree, (node) => node.props?.role === 'status' || node.props?.role === 'alert');
  assert.deepEqual(live.map((node) => textOf(node)), ['Mission running.']);
  tree = await drawStrip(baseCard({ run: runOf(), strip: { state: 'problem', main: 'resume', questions: [], canFinishLap: false, problem: { text: 'Your model server did not answer.', details: 'x' }, pausedBy: 'problem', retryAt: 0 } }));
  assert.equal(findAll(tree, (node) => node.props?.role === 'alert').length, 1, 'one alert, from the error note');
  assert.equal(findAll(tree, (node) => node.props?.role === 'status').length, 0);
});

test('drawn: Finish this lap is hidden once the deadline has passed, even before a new card comes', async () => {
  const page = loadPage(() => ({ json: baseCard({ run: runOf({ deadline: Date.now() - 1000 }), strip: { state: 'running', main: 'note', questions: [], canFinishLap: true, problem: null, pausedBy: '', retryAt: 0 } }) }));
  const element = page.fake.React.createElement(page.parts['mission-run'], { sessionId: 's1' });
  page.fake.render(element);
  await tick();
  const tree = page.fake.render(element);
  assert.ok(buttonsOf(tree).some((b) => b.text === 'Pause'));
  assert.ok(!buttonsOf(tree).some((b) => b.text === 'Finish this lap'));
});

test('drawn: a press that never reaches the Mission says so in plain words, with what to click; the raw text only behind Details', async () => {
  const card = baseCard({ run: runOf(), strip: { state: 'running', main: 'note', questions: [], canFinishLap: false, problem: null, pausedBy: '', retryAt: 0 } });
  const page = loadPage((method) => { if (method === 'POST') throw new TypeError('Failed to fetch'); return { json: card }; });
  const { React } = page.fake;
  const both = () => React.createElement(React.Fragment, null, React.createElement(page.parts['mission-run'], { sessionId: 's1' }), React.createElement(page.parts['mission-run-button'], { sessionId: 's1' }));
  page.fake.render(both());
  await tick();
  let tree = page.fake.render(both());
  page.editor.innerText = 'a note';
  await byClass(tree, 'dsh-ms-main')[0].props.onClick();
  await tick(20);
  tree = page.fake.render(both());
  const note = byClass(tree, 'dshu-errnote')[0];
  assert.ok(note);
  assert.match(textOf(note), /^The Mission could not be reached\.Check that the app is still running, then press the button again\./);
  assert.doesNotMatch(textOf(note), /Failed to fetch/, 'the raw text only behind Details');
  assert.match(textOf(note), /Details/);
});

test('drawn: one failed look keeps the Mission\'s strip and main button (no flash of Send, the goal bar or Start Mission)', async () => {
  const card = baseCard({ run: runOf(), strip: { state: 'running', main: 'note', questions: [], canFinishLap: false, problem: null, pausedBy: '', retryAt: 0 } });
  let fail = false;
  const page = loadPage(() => (fail ? { status: 500, json: { error: 'HTTP 500' } } : { json: card }));
  const { React } = page.fake;
  const both = () => React.createElement(React.Fragment, null, React.createElement(page.parts['mission-run'], { sessionId: 's1' }), React.createElement(page.parts['mission-run-button'], { sessionId: 's1' }));
  page.fake.render(both());
  await tick();
  page.fake.render(both());
  fail = true;
  page.win.dispatchEvent(new CustomEvent('dsh-mission:changed', { detail: { sessionId: 's1' } }));
  await tick(30);
  const tree = page.fake.render(both());
  assert.ok(page.calls.filter((c) => c.method === 'GET').length >= 2, 'it looked again');
  assert.equal(textOf(byClass(tree, 'dsh-ms-main')[0]), 'Add note', 'the main button stays');
  assert.equal(page.seat.getAttribute('data-dsh-mission'), 'running', 'the goal bar stays hidden');
  assert.match(textOf(tree), /Can't reach the Mission right now\./);
});

// Stage E (point 12, 20 November): a typed /mission works in Data, Research and Recon too; only the /mission modes are refused there.
test('Settings → Mission says where a Mission works: typed or Start Mission in Data and Research, Recon by its settings', () => {
  assert.doesNotMatch(client, /Mission is not available in Data and Research/);
  assert.doesNotMatch(client, /Mission is not available in an isolated thread \(Recon\)/);
  assert.doesNotMatch(client, /typed \/mission and the \/mission access levels are refused/);
  assert.match(client, /In Data and Research, which run Read Only by your choice, the \/mission access levels are refused\. A Mission works there, typed \(\/mission and what it should do\) or with Start Mission: it warns first/);
  assert.match(client, /In Recon a Mission works only where Recon\\'s settings allow it, typed or with Start Mission, inside Recon\\'s rules/);
  assert.match(client, /'A Mission works on a goal until its checklist is done or a limit is reached: start one with Start Mission beside Send/);
});

// ---- Stage B lab pass (20 November) --------------------------------------------------------------------
test('drawn: a button\'s message goes once the Mission moves on (Pause\'s message is gone after Resume)', async () => {
  const running = baseCard({ run: runOf(), strip: { state: 'running', main: 'note', questions: [], canFinishLap: true, problem: null, pausedBy: '', retryAt: 0 } });
  const paused = baseCard({ stamp: 'b.2', run: runOf({ status: 'paused', pausedAt: NOW }), strip: { state: 'paused', main: 'resume', questions: [], canFinishLap: false, problem: null, pausedBy: 'you', retryAt: 0 } });
  let now = running;
  const page = loadPage((method, body) => {
    if (method === 'POST' && body.action === 'pause') { now = paused; return { json: { ...paused, said: 'Mission paused after step 31. Press Resume beside the chat box to carry on.' } }; }
    return { json: now };
  });
  const element = page.fake.React.createElement(page.parts['mission-run'], { sessionId: 's1' });
  page.fake.render(element);
  await tick();
  let tree = page.fake.render(element);
  await buttonsOf(tree).find((b) => b.text === 'Pause').node.props.onClick();
  await tick();
  tree = page.fake.render(element);
  assert.match(textOf(tree), /Mission paused after step 31\./, 'shown while it is paused');
  now = { ...running, stamp: 'b.3' };
  page.win.dispatchEvent(new CustomEvent('dsh-mission:changed', { detail: { sessionId: 's1' } }));
  await tick(40);
  tree = page.fake.render(element);
  assert.ok(textOf(tree).includes('Running · '), 'the strip is running again');
  assert.doesNotMatch(textOf(tree), /Mission paused after step 31\./, 'the old message is gone');
});

test('Mission settings close with Escape, unless an (i) pop-up inside took the Escape first', () => {
  const setup = client.slice(client.indexOf('function LongSetup('), client.indexOf('function LongSetup(') + 3000);
  assert.match(setup, /event\.key === 'Escape' && !event\.defaultPrevented\) onClose\(\)/);
  assert.match(setup, /window\.removeEventListener\('keydown', onKey\)/);
});
