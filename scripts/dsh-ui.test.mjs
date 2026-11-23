import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'docs/shared/dsh-ui.js'), 'utf8');
// The master is a script block that declares `dshUi`; run it with no document, as the pages do before they draw.
const dshUi = new Function(`${source}\nreturn dshUi;`)();
const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }), useState: (v) => [v, () => {}], useRef: () => ({ current: 0 }), useEffect: () => {} };
const ui = dshUi.makeParts(React);
const text = (node) => (node == null || node === false ? '' : typeof node === 'string' ? node : [].concat(node.children ?? []).map(text).join(''));

test('the shared parts draw the classes the style guide describes', () => {
  const row = ui.Row({ title: 'Use it', desc: 'Why' }, ui.Switch({ on: true, label: 'Use it', onChange() {} }));
  assert.equal(row.props.className, 'dshu-row');
  assert.equal(text(row), 'Use itWhy');
  const sw = ui.Switch({ on: true, label: 'Use it', onChange() {}, danger: true });
  assert.equal(sw.props.role, 'switch');
  assert.equal(sw.props['aria-checked'], true);
  assert.equal(sw.props['aria-label'], 'Use it', 'a switch always has a name');
  assert.equal(sw.props['data-danger'], 'true');
  let seen = null;
  ui.Switch({ on: false, label: 'x', onChange: (v) => { seen = v; } }).props.onClick();
  assert.equal(seen, true);
  assert.equal(ui.Button({ main: true, children: 'Go' }).props['data-main'], 'true');
  assert.equal(ui.Page({ title: 'T', desc: 'D' }).children[0].type, 'h2');
});

test('an empty state says what the list is for and offers starter chips', () => {
  const picked = [];
  const empty = ui.Empty({ title: 'Nothing yet', text: 'Do this first', chips: ['One', { label: 'Two', value: '2' }], onPick: (v) => picked.push(v) });
  assert.equal(empty.props.role, 'status');
  const part = empty.children.find((c) => c && typeof c.type === 'function');
  const chips = part.type(part.props);
  assert.equal(chips.props.className, 'dshu-chips');
  assert.equal(chips.children.length, 2);
  chips.children[1].props.onClick();
  chips.children[0].props.onClick();
  assert.deepEqual(picked, ['2', 'One']);
});

test('the shared CSS uses the app\'s colour variables only and keeps a keyboard focus ring', () => {
  const css = /const CSS = `([\s\S]*?)`;/.exec(source)[1];
  const withoutShadows = css.replace(/color-mix\(in srgb, #000[^)]*\)/g, '');
  assert.doesNotMatch(withoutShadows, /#[0-9a-f]{3,8}\b|\brgba?\(|:\s*(?:white|black)\b/i, 'no fixed colours');
  for (const cls of ['dshu-btn', 'dshu-switch', 'dshu-chip']) assert.match(css, new RegExp(`\\.${cls}:focus-visible`), `${cls} has a focus ring`);
  assert.match(css, /prefers-reduced-motion/, 'the switch only animates when motion is allowed');
  for (const name of css.matchAll(/\.([a-z][\w-]*)/g)) assert.match(name[1], /^dshu-/, `${name[1]} starts with dshu-`);
});

test('copying text works without a document (and reports it)', async () => {
  assert.equal(await dshUi.copyText('x'), false);
});

test('every page that uses the parts carries an up to date copy', () => {
  let users = 0;
  for (const name of readdirSync(join(root, 'addons'))) {
    const file = join(root, 'addons', name, 'client.js');
    if (!existsSync(file)) continue;
    const page = readFileSync(file, 'utf8');
    if (!page.includes('// ---- dsh-ui:begin')) { assert.doesNotMatch(page, /\bdshUi\./, `${name} calls dshUi without the block`); continue; }
    users += 1;
    assert.ok(page.includes(source.trimEnd()) || page.replace(/^ +/gm, '').includes(source.trimEnd().replace(/^ +/gm, '')), `${name} copy matches the master`);
  }
  assert.ok(users >= 10, `${users} pages use the shared parts`);
});

// ---- the (i) pop-up, the state line and the error note ----

/** A React stand-in that keeps hook state between calls and holds effects until `flush()`, so a part can be "drawn" twice. */
const hooks = (start = {}) => {
  const state = []; const refs = []; let effects = []; let s = 0; let r = 0;
  const api = {
    createElement: React.createElement,
    useState: (v) => { const i = s++; if (!(i in state)) state[i] = i in (start.state ?? {}) ? start.state[i] : v; return [state[i], (next) => { state[i] = next; }]; },
    useRef: (v) => { const i = r++; if (!(i in refs)) refs[i] = { current: v }; return refs[i]; },
    useEffect: (fn) => { effects.push(fn); },
    useId: () => ':r1:',
    begin() { s = 0; r = 0; effects = []; },
    flush() { const cleanups = effects.map((fn) => fn()).filter((c) => typeof c === 'function'); effects = []; return () => cleanups.forEach((c) => c()); },
    state, refs,
  };
  return api;
};
const draw = (React2, part, props) => { React2.begin(); const node = dshUi.makeParts(React2)[part](props); return node; };
const find = (node, test) => {
  if (node == null || typeof node !== 'object') return null;
  if (test(node)) return node;
  for (const child of [].concat(node.children ?? [])) { const hit = find(child, test); if (hit) return hit; }
  return null;
};

test('the (i) pop-up keeps only the lines it is given, in a fixed order', () => {
  assert.deepEqual(dshUi.infoLines({ title: 'Pause', what: 'Stops for now.', change: 'x' }), {
    title: 'Pause', lines: [{ key: 'what', head: 'What it does', text: 'Stops for now.' }, { key: 'change', head: 'If you change it', text: 'x' }],
  });
  assert.deepEqual(dshUi.infoLines({ label: 'End', what: 'a', when: '  ', changes: 'c' }).lines.map((l) => l.head), ['What it does', 'If you change it'], 'blank lines are left out; `changes` is the same as `change`');
  assert.equal(dshUi.infoLines({ label: 'End', what: 'a' }).title, 'End', 'with no title the label is the bold line');
});

test('the (i) pop-up is English even when the page says it is Chinese (Plus is English only)', () => {
  assert.deepEqual(dshUi.infoLines({ title: 'Preset', what: 'a', when: 'b', change: 'c', lang: 'zh' }).lines.map((l) => l.head), ['What it does', 'When to use it', 'If you change it']);
  assert.deepEqual(dshUi.infoLines({ title: 'x', what: 'a', lang: 'zh-CN' }).lines[0].head, 'What it does');
  assert.equal(dshUi.infoLines({ title: 'x', what: 'a', lang: 'fr' }).lines[0].head, 'What it does', 'anything else: English');
  const R = hooks();
  const button = find(dshUi.makeParts(R).Info({ title: 'Preset', what: 'a', lang: 'zh' }), (node) => node.props?.className === 'dshu-info');
  assert.equal(button.props['aria-label'], 'About Preset');
});

test('the (i) button is closed at first, has a name and toggles', () => {
  const R = hooks();
  const node = draw(R, 'Info', { title: 'Pause', what: 'Stops for now.' });
  assert.equal(node.props.className, 'dshu-infowrap');
  const button = node.children[0];
  assert.equal(button.type, 'button');
  assert.equal(button.props.className, 'dshu-info');
  assert.equal(button.props['aria-label'], 'About Pause');
  assert.equal(button.props['aria-expanded'], false);
  assert.equal(button.props['aria-haspopup'], 'dialog');
  assert.equal(node.children[1], null, 'no pop-up until clicked');
  assert.equal(find(button, (n) => n.type === 'svg').props['aria-hidden'], 'true');
  assert.equal(draw(hooks(), 'Info', { label: 'Long run', title: 'Long run, explained', what: 'x' }).children[0].props['aria-label'], 'About Long run', 'label names it');
  button.props.onClick();
  assert.equal(R.state[0], true, 'a click opens it (Enter and Space click a button too)');
});

test('the open pop-up shows a bold title and the plain lines, labelled for screen readers', () => {
  const R = hooks({ state: { 0: true } });
  const node = draw(R, 'Info', { title: 'End', what: 'Stops now and writes the report.', when: 'When you are done.', change: 'Cannot be continued.', more: 'See the report.' });
  const pop = node.children[1];
  assert.equal(pop.props.role, 'dialog');
  assert.equal(pop.props.className, 'dshu-pop');
  assert.equal(pop.props.tabIndex, -1);
  assert.equal(node.children[0].props['aria-expanded'], true);
  assert.equal(node.children[0].props['aria-controls'], pop.props.id);
  const title = pop.children[0];
  assert.equal(title.props.className, 'dshu-pop-title');
  assert.equal(pop.props['aria-labelledby'], title.props.id);
  assert.equal(text(title), 'End');
  const lines = pop.children.slice(1, 4);
  assert.deepEqual(lines.map((l) => text(l.children[0])), ['What it does', 'When to use it', 'If you change it']);
  assert.equal(text(lines[0]), 'What it doesStops now and writes the report.');
  assert.equal(text(pop.children[4]), 'See the report.');
  assert.equal(pop.props.style.visibility, 'hidden', 'hidden until it has been placed');
});

test('a pop-up stays on screen: below its button, flipped above near the bottom, pulled in from the right edge', () => {
  const view = { width: 1000, height: 800 };
  const pop = { width: 320, height: 150 };
  assert.deepEqual(dshUi.placePop({ anchor: { top: 100, bottom: 116, left: 50 }, pop, view }), { top: 122, left: 50, side: 'below', maxHeight: 670 });
  const low = dshUi.placePop({ anchor: { top: 740, bottom: 756, left: 50 }, pop, view });
  assert.equal(low.side, 'above');
  assert.equal(low.top, 740 - 6 - 150);
  assert.equal(dshUi.placePop({ anchor: { top: 100, bottom: 116, left: 900 }, pop, view }).left, 1000 - 8 - 320);
  assert.equal(dshUi.placePop({ anchor: { top: 100, bottom: 116, left: -20 }, pop, view }).left, 8);
  const tall = dshUi.placePop({ anchor: { top: 300, bottom: 316, left: 0 }, pop: { width: 320, height: 2000 }, view });
  assert.equal(tall.side, 'below', 'the bigger side wins when neither fits');
  assert.ok(tall.top + tall.maxHeight <= 800 - 8, 'and it scrolls inside');
});

test('Esc closes the pop-up and puts the focus back on the (i); a click outside closes it; a click inside does not', () => {
  const listeners = {};
  const onWindow = {};
  const saved = { document: globalThis.document, window: globalThis.window };
  const inside = {};
  globalThis.document = { activeElement: inside, addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener: (type) => { delete listeners[type]; }, getElementById: () => ({}) };
  globalThis.window = { innerWidth: 1000, innerHeight: 800, addEventListener: (type, fn, capture) => { onWindow[type] = { fn, capture }; }, removeEventListener: (type) => { delete onWindow[type]; } };
  try {
    const R = hooks({ state: { 0: true } });
    draw(R, 'Info', { title: 'Pause', what: 'Stops.' });
    let focused = null;
    R.refs[0].current = { contains: (target) => target === inside };
    R.refs[1].current = { focus: () => { focused = 'button'; }, getBoundingClientRect: () => ({ top: 100, bottom: 116, left: 40, right: 56 }) };
    R.refs[2].current = { offsetWidth: 300, scrollHeight: 120, focus: () => { focused = 'pop'; } };
    const cleanup = R.flush();
    assert.equal(focused, 'pop', 'opening moves the focus into the pop-up');
    assert.deepEqual(R.state[1], { top: 122, left: 40, side: 'below', maxHeight: 670 }, 'placed under the (i)');
    listeners.pointerdown({ target: inside });
    assert.equal(R.state[0], true, 'a click inside keeps it open');
    // Esc is heard on the window, first in the capture phase: before the Esc listeners that panels put on the document.
    assert.equal(listeners.keydown, undefined, 'not on the document, where a panel\'s own Esc listener would run first');
    assert.equal(onWindow.keydown?.capture, true);
    // A panel around it that closes on Esc, the way Plus panels do (a document listener); the browser's order:
    // window capture first, then the document, unless a listener stopped it.
    let panelClosed = false;
    const press = () => {
      let halted = false;
      const event = { key: 'Escape', preventDefault() {}, stopPropagation() { halted = true; }, stopImmediatePropagation() { halted = true; } };
      onWindow.keydown.fn(event);
      if (!halted) panelClosed = true;
    };
    press();
    assert.equal(R.state[0], false);
    assert.equal(focused, 'button', 'focus goes back to the (i)');
    assert.equal(panelClosed, false, 'Esc does not also close the dialog or panel around it');
    // With the focus elsewhere, Esc is not taken from the page.
    R.state[0] = true;
    globalThis.document.activeElement = {};
    press();
    assert.equal(panelClosed, true);
    globalThis.document.activeElement = inside;
    R.state[0] = true;
    listeners.pointerdown({ target: {} });
    assert.equal(R.state[0], false, 'a click outside closes it');
    cleanup();
    assert.equal(onWindow.keydown, undefined, 'its listeners go when it closes');
  } finally {
    globalThis.document = saved.document;
    globalThis.window = saved.window;
  }
});

test('`more` may be a list of lines; empty ones are left out', () => {
  const R = hooks({ state: { 0: true } });
  const pop = draw(R, 'Info', { title: 'Preset', what: 'x', more: ['One.', '', null, 'Two.'] }).children[1];
  assert.deepEqual(pop.children.slice(2).map(text), ['One.', 'Two.']);
  assert.equal(draw(hooks({ state: { 0: true } }), 'Info', { title: 'x', what: 'y', more: '' }).children[1].children.length, 2, 'an empty line adds nothing');
});

test('`portal: true` draws the pop-up in the page body (with ReactDOM); a click or focus in it is not outside', () => {
  const listeners = {};
  const saved = { document: globalThis.document, window: globalThis.window };
  const body = { tag: 'body' };
  globalThis.document = { body, activeElement: null, addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener: (type) => { delete listeners[type]; }, getElementById: () => ({}) };
  globalThis.window = { innerWidth: 1000, innerHeight: 800, addEventListener() {}, removeEventListener() {} };
  try {
    const portals = [];
    const ReactDOM = { createPortal: (node, target) => { portals.push(target); return { portal: true, target, children: [node] }; } };
    const R = hooks({ state: { 0: true } });
    R.begin();
    const node = dshUi.makeParts(R, ReactDOM).Info({ title: 'Preset', what: 'x', portal: true });
    assert.equal(node.children[1].portal, true, 'the pop-up is portalled');
    assert.equal(portals[0], body, 'into the page body');
    assert.equal(node.children[1].children[0].props.className, 'dshu-pop');
    // Without ReactDOM (older pages), the same props keep the pop-up beside the (i).
    R.begin();
    assert.equal(dshUi.makeParts(R).Info({ title: 'Preset', what: 'x', portal: true }).children[1].props.className, 'dshu-pop');
    // Not portalled unless asked.
    R.begin();
    assert.equal(dshUi.makeParts(R, ReactDOM).Info({ title: 'Preset', what: 'x' }).children[1].props.className, 'dshu-pop');
    // A click in the body-level pop-up keeps it open; Esc with the focus in it closes it.
    const inPop = {};
    R.refs[0].current = { contains: () => false };
    R.refs[1].current = { focus() {}, getBoundingClientRect: () => ({ top: 10, bottom: 26, left: 10, right: 26 }) };
    R.refs[2].current = { offsetWidth: 300, scrollHeight: 100, focus() {}, contains: (target) => target === inPop };
    R.begin();
    dshUi.makeParts(R, ReactDOM).Info({ title: 'Preset', what: 'x', portal: true });
    const cleanup = R.flush();
    listeners.pointerdown({ target: inPop });
    assert.equal(R.state[0], true, 'a click in the portalled pop-up is inside');
    // Tab from the (i) into the pop-up does not close it.
    R.begin();
    const wrap = dshUi.makeParts(R, ReactDOM).Info({ title: 'Preset', what: 'x', portal: true });
    wrap.props.onBlur({ relatedTarget: inPop });
    assert.equal(R.state[0], true, 'focus moving into the pop-up keeps it open');
    listeners.pointerdown({ target: {} });
    assert.equal(R.state[0], false, 'a click elsewhere closes it');
    cleanup();
  } finally {
    globalThis.document = saved.document;
    globalThis.window = saved.window;
  }
});

test('clicks on the (i) never reach the row or menu item around it', () => {
  const node = draw(hooks(), 'Info', { title: 'x', what: 'y' });
  let stopped = 0;
  node.props.onClick({ stopPropagation: () => { stopped += 1; } });
  node.props.onPointerDown({ stopPropagation: () => { stopped += 1; } });
  assert.equal(stopped, 2);
  // Enter or Space on the (i) opens it, and does not also run the row's or menu item's own action.
  for (const key of ['Enter', ' ', 'ArrowDown']) node.props.onKeyDown({ key, stopPropagation: () => { stopped += 1; } });
  assert.equal(stopped, 5);
  node.props.onKeyDown({ key: 'a', stopPropagation: () => { stopped += 1; } });
  assert.equal(stopped, 5, 'other keys pass');
});

test('the pop-up shows the keyboard focus ring: no later rule takes it away', () => {
  const css = /const CSS = `([\s\S]*?)`;/.exec(source)[1];
  assert.match(css, /\.dshu-pop:focus-visible[^{]*\{[^}]*outline: 2px/);
  assert.doesNotMatch(css, /\.dshu-pop:focus\s*\{[^}]*outline:\s*none/, 'a plain :focus rule after it would hide the ring');
});

test('a row whose title is not plain text still names its (i)', () => {
  const badge = React.createElement('span', { className: 'badge' }, 'New');
  const row = ui.Row({ title: React.createElement('span', null, 'Keep awake', badge), info: { what: 'Keeps the Mac awake.' } });
  const info = find(row, (n) => typeof n.type === 'function' && n.props.what);
  assert.equal(info.props.title, 'Keep awake', 'the text written in the title, without the badge');
  const own = find(ui.Row({ title: React.createElement('span', null, badge), info: { what: 'x', label: 'Keep awake' } }), (n) => typeof n.type === 'function' && n.props.what);
  assert.equal(own.props.label, 'Keep awake', 'info.label names it when the title has no text of its own');
});

test('a row can carry an (i) after its title', () => {
  const row = ui.Row({ title: 'Keep awake', desc: 'd', info: { what: 'Keeps the Mac awake.' } });
  const info = find(row, (n) => typeof n.type === 'function' && n.props.what);
  assert.ok(info, 'the (i) part is in the title');
  assert.equal(info.props.title, 'Keep awake');
  assert.equal(find(ui.Row({ title: 'x' }), (n) => typeof n.type === 'function'), null, 'no (i) when none is given');
});

test('a state line says what is happening and what to do next', () => {
  const line = ui.StateLine({ state: 'busy', words: 'Running · 2 h left', next: 'Main button: adds a note' });
  assert.equal(line.props.className, 'dshu-state');
  assert.equal(line.props['data-state'], 'busy');
  assert.equal(line.props.role, 'status');
  assert.equal(text(line), 'Running · 2 h leftMain button: adds a note');
  assert.equal(line.children[0].props['aria-hidden'], 'true', 'the dot is decoration; the words carry the meaning');
  assert.equal(ui.StateLine({ state: 'error', words: 'Stopped' }).props.role, 'alert');
  assert.equal(ui.StateLine({ state: 'nonsense', words: 'x' }).props['data-state'], 'idle');
  assert.equal(ui.StateLine({ state: 'busy', words: 'step 31', live: false }).props.role, undefined, 'live: false is not a live region');
  assert.equal(ui.StateLine({ state: 'error', words: 'Stopped', live: false }).props.role, undefined);
});

test('an error note shows the cause and the fix, and the raw text only behind Details', () => {
  const R = hooks();
  const note = draw(R, 'ErrorNote', { what: 'Your model does not take thinking level "high".', fix: 'Pick another level, then press Resume.', details: 'invalid_request: reasoning_effort' });
  assert.equal(note.props.role, 'alert');
  assert.equal(text(note.children[0]), 'Your model does not take thinking level "high".');
  assert.equal(text(note.children[1]), 'Pick another level, then press Resume.');
  assert.ok(!text(note).includes('invalid_request'), 'raw text hidden at first');
  const toggle = find(note, (n) => n.type === 'button');
  assert.equal(text(toggle), 'Details');
  assert.equal(toggle.props['aria-expanded'], false);
  toggle.props.onClick();
  const opened = draw(R, 'ErrorNote', { what: 'w', details: 'invalid_request: reasoning_effort' });
  assert.equal(text(find(opened, (n) => n.type === 'pre')), 'invalid_request: reasoning_effort');
  assert.equal(text(find(opened, (n) => n.type === 'button')), 'Hide details');
  assert.equal(find(ui.ErrorNote({ what: 'w', fix: 'f' }), (n) => n.type === 'button'), null, 'no Details button without details');
  assert.equal(ui.ErrorNote({}), null, 'nothing to say, nothing drawn');
  const objectDetails = draw(hooks({ state: { 0: true } }), 'ErrorNote', { what: 'w', details: { code: 7 } });
  assert.match(text(find(objectDetails, (n) => n.type === 'pre')), /"code": 7/);
});

test('an error note words a raw error the way the error helper does when the page has it', () => {
  const kit = readFileSync(join(root, 'docs/shared/dsh-kit.js'), 'utf8');
  const both = new Function(`${kit}\n${source}\nreturn { dshUi, dshKit };`)();
  assert.deepEqual(both.dshUi.explainError('error 404'), both.dshKit.plain('error 404'));
  const R = hooks({ state: { 0: true } });
  R.begin();
  const note = both.dshUi.makeParts(R).ErrorNote({ error: 'settings/conflict: revision 3', fix: 'Press Save again.' });
  assert.equal(text(note.children[0]), both.dshKit.plain('settings/conflict: revision 3').text);
  assert.equal(text(find(note, (n) => n.type === 'pre')), 'settings/conflict: revision 3');
  // Without the helper: a bare code gets a safe sentence, raw text behind Details; a readable sentence is shown as it is.
  assert.deepEqual(dshUi.explainError(new Error('ECONNRESET')), { text: 'Something went wrong. Try again; the Details say what the app reported.', details: 'ECONNRESET' });
  assert.deepEqual(dshUi.explainError(new Error('Your model server is not running.')), { text: 'Your model server is not running.', details: '' });
  const alone = draw(hooks(), 'ErrorNote', { error: new Error('Your model server is not running.') });
  assert.equal(text(alone.children[0]), 'Your model server is not running.');
  assert.equal(dshUi.explainError('settings/conflict: revision 3').text, 'Something went wrong. Try again; the Details say what the app reported.', 'a coded message is not shown raw');
  // Your own words win; the raw error still goes behind Details.
  const own = draw(hooks({ state: { 0: true } }), 'ErrorNote', { what: 'The save did not work.', error: 'settings/conflict: revision 3' });
  assert.equal(text(own.children[0]), 'The save did not work.');
  assert.equal(text(find(own, (n) => n.type === 'pre')), 'settings/conflict: revision 3');
});
