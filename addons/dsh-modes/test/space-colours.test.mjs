// Recon and Devices colours (owner point 20, 20 November 2026): which space a conversation is in, where the page
// marks it (the window, or a Split pane), the CSS (the app's variables only, no layout shift) and readable contrast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const cut = (name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} is in client.js`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && (depth -= 1) === 0) return source.slice(start, i + 1);
  }
  throw new Error(name);
};
const line = (name) => {
  const found = source.match(new RegExp(`^\\s*const ${name} = .*;$`, 'm'));
  assert.ok(found, `const ${name} is in client.js`);
  return found[0];
};
const block = (name) => {
  const start = source.indexOf(`const ${name} = \``);
  assert.ok(start >= 0, `const ${name} is in client.js`);
  return source.slice(start, source.indexOf('`;', start + name.length + 10) + 2);
};

const space = new Function(`
  const FALLBACK_MODES = [{ id: 'chat', label: 'Chat' }];
  const ADDED_MODES = { plain: { label: 'Plain chat' } };
  ${cut('readObject')}
  ${cut('describeModes')}
  ${line('SPACE_OF_MODE')}
  ${cut('spaceOfMode')}
  ${cut('colourOfSpace')}
  ${cut('spaceFor')}
  const windowSpaces = new Map();
  let spaceToken = 0;
  ${line('spaceColours')}
  ${cut('setSpaceMark')}
  ${cut('paintWindowSpace')}
  ${cut('spaceTarget')}
  ${cut('markSpace')}
  ${cut('showSpaceColours')}
  ${cut('setSpaceColours')}
  ${line('SPACE_WARN_ICON')}
  ${line('IN_RECON')}
  ${line('RECON_ERROR_ROW')}
  ${line('RECON_ERRORS')}
  ${line('RECON_ERRORS_INSIDE')}
  ${line('inRecon')}
  ${line('SPACE_TAB_RECON')}
  ${line('SPACE_TAB_DEVICES')}
  ${line('NEW_IN_RECON')}
  ${line('NEW_IN_DEVICES')}
  ${block('SPACE_CSS')}
  return { spaceOfMode, spaceFor, spaceTarget, markSpace, showSpaceColours, setSpaceColours, spaceColours, css: SPACE_CSS, windowSpaces, errorRow: RECON_ERROR_ROW, errors: RECON_ERRORS };
`)();

// ---- a small fake page --------------------------------------------------------------------------------------
class FakeEl {
  constructor(tag, attrs = {}, parent = null) {
    this.tagName = tag;
    this.attrs = { ...attrs };
    this.parentElement = parent;
    this.className = attrs.class ?? '';
    this.children = [];
    if (parent) parent.children.push(this);
  }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  removeAttribute(name) { delete this.attrs[name]; }
  hasAttr(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); }
  closest(selector) {
    const name = /^\[([\w-]+)\]$/.exec(selector)?.[1];
    for (let node = this; node; node = node.parentElement) if (node.hasAttr(name)) return node;
    return null;
  }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((one) => one !== this); this.parentElement = null; }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  all() { return [this, ...this.children.flatMap((one) => one.all())]; }
}
function page() {
  const html = new FakeEl('html');
  const head = new FakeEl('head', {}, html);
  const body = new FakeEl('body', {}, html);
  const doc = {
    documentElement: html, head, body,
    createElement: (tag) => new FakeEl(tag),
    querySelectorAll: (selector) => {
      assert.equal(selector, '[data-conversation-content][data-conversation-session]');
      return html.all().filter((one) => one.hasAttr('data-conversation-content') && one.hasAttr('data-conversation-session'));
    },
  };
  /** A conversation body with a chat box inside it; in a Split pane when `pane` is given. */
  const conversation = (sessionId, { pane, embedded } = {}) => {
    const holder = pane ? new FakeEl('section', { 'data-split-pane': pane }, body) : body;
    const content = new FakeEl('div', { 'data-conversation-content': '', 'data-conversation-session': sessionId, class: embedded ? 'Ab12_body Ab12_embeddedBody' : 'Ab12_body' }, holder);
    const box = new FakeEl('span', { class: 'dsh-me-tools' }, content);
    return { holder, content, box };
  };
  return { doc, html, body, conversation };
}

test('which space a mode is in: Recon is recon, Bench (Devices) is devices, every other mode none', () => {
  assert.equal(space.spaceOfMode('recon'), 'recon');
  assert.equal(space.spaceOfMode('bench'), 'devices');
  for (const other of ['chat', 'code', 'cowork', 'research', 'scout', 'content', '', undefined, null, 'constructor', 'toString']) assert.equal(space.spaceOfMode(other), '', String(other));
});

test('a conversation\'s space: its recorded mode first; a new one follows the selected tab, then the default mode', () => {
  const view = { modes: JSON.stringify({ chat: { label: 'Chat' } }), extraModes: { recon: { label: 'Recon' }, bench: { label: 'Devices' } }, sessionModes: { a: 'recon', b: 'bench', c: 'chat' }, defaultMode: 'recon' };
  assert.equal(space.spaceFor(view, 'a', 'chat'), 'recon', 'a Recon conversation stays red whichever tab is selected');
  assert.equal(space.spaceFor(view, 'b', ''), 'devices');
  assert.equal(space.spaceFor(view, 'c', 'recon'), '', 'a Chat conversation opened while Recon is selected is not red');
  assert.equal(space.spaceFor(view, 'new', 'bench'), 'devices', 'a new conversation follows the tab it is started in');
  assert.equal(space.spaceFor(view, 'new', 'chat'), '', 'not the default mode left from before');
  assert.equal(space.spaceFor(view, 'new', ''), 'recon', 'without the sidebar: the mode Modes gives it');
  assert.equal(space.spaceFor(null, 'new', 'recon'), 'recon', 'still loading: the selected tab');
  assert.equal(space.spaceFor(null, 'new', ''), '');
  assert.equal(space.spaceFor(view, undefined, ''), '');
});

test('the window\'s own conversation marks <html>; switching updates at once; leaving clears it', () => {
  const { doc, html, conversation } = page();
  const { box } = conversation('a');
  const off = space.markSpace(box, doc, 'a', { window: 'recon', pane: 'recon' });
  assert.equal(html.getAttribute('data-dsh-space'), 'recon');
  // Switching conversation: the old mark goes and the new one comes in the same step (no colour in between).
  off();
  const off2 = space.markSpace(box, doc, 'b', { window: 'devices', pane: 'devices' });
  assert.equal(html.getAttribute('data-dsh-space'), 'devices');
  off2();
  const off3 = space.markSpace(box, doc, 'c', { window: '', pane: '' });
  assert.equal(html.getAttribute('data-dsh-space'), null, 'an ordinary conversation has no mark');
  off3();
  assert.equal(space.windowSpaces.size, 0);
});

test('two chat boxes of the window for a moment: Recon wins, and the mark goes only with the last one', () => {
  const { doc, html, conversation } = page();
  const one = conversation('a').box;
  const two = conversation('b').box;
  const offA = space.markSpace(one, doc, 'a', { window: 'recon', pane: 'recon' });
  const offB = space.markSpace(two, doc, 'b', { window: 'devices', pane: 'devices' });
  assert.equal(html.getAttribute('data-dsh-space'), 'recon');
  offA();
  assert.equal(html.getAttribute('data-dsh-space'), 'devices');
  offB();
  assert.equal(html.getAttribute('data-dsh-space'), null);
});

test('Split Plus: each pane is marked on its own and never colours the window', () => {
  const { doc, html, conversation } = page();
  const recon = conversation('r', { pane: 'p1' });
  const chat = conversation('c', { pane: 'p2' });
  const offR = space.markSpace(recon.box, doc, 'r', { window: 'chat-tab-would-say-this', pane: 'recon' });
  const offC = space.markSpace(chat.box, doc, 'c', { window: '', pane: '' });
  assert.equal(recon.holder.getAttribute('data-dsh-space'), 'recon', 'the pane uses its own recorded mode, not the selected tab');
  assert.equal(chat.holder.getAttribute('data-dsh-space'), null);
  assert.equal(html.getAttribute('data-dsh-space'), null);
  offR();
  offC();
  assert.equal(recon.holder.getAttribute('data-dsh-space'), null);
});

test('a conversation the app embeds elsewhere (a helper\'s chat) marks nothing; before the chat box is drawn its conversation is found by id', () => {
  const { doc, html, conversation } = page();
  const helper = conversation('h', { embedded: true });
  space.markSpace(helper.box, doc, 'h', { window: 'recon', pane: 'recon' })();
  assert.equal(html.getAttribute('data-dsh-space'), null);
  // Not drawn yet (still loading): found by data-conversation-session; the window's copy wins over a pane's.
  conversation('x', { pane: 'p9' });
  conversation('x');
  const off = space.markSpace(null, doc, 'x', { window: 'recon', pane: 'recon' });
  assert.equal(html.getAttribute('data-dsh-space'), 'recon');
  off();
  // A conversation that is not on the page marks nothing.
  space.markSpace(null, doc, 'gone', { window: 'recon', pane: 'recon' })();
  assert.equal(html.getAttribute('data-dsh-space'), null);
});

test('the colours\' style and the window frame layer are added once and taken away again', () => {
  const { doc, html } = page();
  html.setAttribute('data-dsh-space', 'recon');
  const off = space.showSpaceColours(doc);
  const style = doc.head.children.find((one) => one.id === 'dsh-modes-space');
  const frame = doc.body.children.find((one) => one.className === 'dsh-me-frame');
  assert.ok(style && style.textContent.includes('.dsh-me-frame'));
  assert.equal(frame.getAttribute('aria-hidden'), 'true', 'screen readers skip the frame');
  off();
  assert.equal(doc.head.children.length, 0);
  assert.equal(doc.body.children.length, 0);
  assert.equal(html.getAttribute('data-dsh-space'), null);
});

test('the chat box marks its space before the screen is drawn, on every switch, and Modes adds the style', () => {
  assert.match(source, /useLayoutEffect\(\(\) => markSpace\(root\.current, document, sessionId, \{ window: windowSpace, pane: paneSpace \}\), \[windowSpace, paneSpace, sessionId, shown\]\);/);
  assert.match(source, /ctx\.effect\(\(\) => \(typeof document === 'undefined' \? \(\) => \{\} : showSpaceColours\(document\)\), 'modes: space colours'\);/);
  // The hook sits before ToggleControl's early return (React's rule of hooks).
  const at = source.indexOf('const shownTab = useCwsTab();');
  const early = source.indexOf("if (state.status !== 'ready' || !sessionId || !state.view || state.view.sessionWeb === undefined) return null;");
  assert.ok(at > 0 && early > at);
});

test('the CSS: the app\'s colour variables only, red for Recon, violet for Devices, never orange', () => {
  const css = space.css;
  const withoutIcon = css.replace(/url\("data:image\/svg\+xml,[^"]*"\)/g, '');
  assert.doesNotMatch(withoutIcon, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|:\s*(?:white|black|red|violet|purple|orange)\b/i, 'no fixed colours');
  assert.doesNotMatch(css, /warn-primary|orange|amber/i, 'orange is kept for item 4\'s overrides');
  assert.match(css, /html\[data-dsh-space="recon"\] \.dsh-me-frame\{display:block;box-shadow:inset 0 0 0 3px var\(--dsw-alias-state-error-primary\)\}/);
  assert.match(css, /html\[data-dsh-space="devices"\] \.dsh-me-frame\{display:block;box-shadow:inset 0 0 0 3px var\(--dsw-alias-state-done-primary\)\}/);
  // Item 4A, stage 3a: the selected button is the Recon space (id recon, as the old Recon tab) or the Devices space
  // (id devices; the old tab id bench too), and the New button follows the window's space (html[data-cws-space]); with
  // the old tabs (no data-cws-space) the selected tab still decides.
  assert.match(css, /\.cws-tab\[data-tab-id="recon"\]\[aria-selected="true"\]\{[^}]*--dsw-alias-state-error-primary/);
  assert.match(css, /:is\(\.cws-tab\[data-tab-id="bench"\],\.cws-tab\[data-tab-id="devices"\]\)\[aria-selected="true"\]\{[^}]*--dsw-alias-state-done-primary/);
  assert.match(css, /:is\(html\[data-cws-space="recon"\],html:not\(\[data-cws-space\]\)\[data-cws-tab="recon"\]\) \.cws-new\{[^}]*--dsw-alias-state-error-primary/);
  assert.match(css, /:is\(html\[data-cws-space="devices"\],html:not\(\[data-cws-space\]\)\[data-cws-tab="bench"\]\) \.cws-new\{[^}]*--dsw-alias-state-done-primary/);
  assert.doesNotMatch(css, /html\[data-cws-tab="(?:recon|bench)"\] \.cws-new/, 'with spaces the New button never follows the open thread\'s mode');
  // The tint is Recon's alone (none was asked for Devices).
  const tints = css.split('\n').filter((rule) => rule.includes('[data-conversation-scroll]'));
  assert.ok(tints.length === 1 && !tints[0].includes('devices') && tints[0].includes('error-primary) 5%,transparent'));
  assert.match(tints[0], /:not\(\[data-split-pane\] \*\)/, 'the window\'s tint leaves the Split panes to their own marks');
});

test('the frame moves nothing, lets clicks through, sits under menus and dialogs; no animation', () => {
  const css = space.css;
  const frame = /\.dsh-me-frame\{([^}]*)\}/.exec(css)[1];
  assert.match(frame, /position:fixed/);
  assert.match(frame, /inset:0/);
  assert.match(frame, /pointer-events:none/);
  const z = Number(/z-index:(\d+)/.exec(frame)[1]);
  assert.ok(z > 71 && z < 100, 'over the app\'s layout (up to 71), under its menus (100) and dialogs (900 and up)');
  assert.doesNotMatch(css, /\bborder(?:-width)?:\s*[1-9]/, 'no border that would resize anything');
  assert.match(css, /\[data-split-pane\]\[data-dsh-space="recon"\]\{outline:2px solid var\(--dsw-alias-state-error-primary\);outline-offset:-4px\}/);
  assert.doesNotMatch(css, /transition|animation|@keyframes/, 'nothing moves, so reduced motion is respected');
});

test('errors inside Recon: a solid red box with a warning sign; ordinary red text is not boxed', () => {
  const css = space.css;
  const boxRule = css.split('\n').find((rule) => rule.includes('background:var(--dsh-me-alarm)'));
  assert.ok(boxRule, 'there is a solid box rule');
  for (const target of ["[class*='_turnErrorRow']", "[class*='_openError']", '[role="alert"]']) assert.ok(boxRule.includes(target), target);
  assert.ok(boxRule.includes('html[data-dsh-space="recon"] [data-conversation-content]') && boxRule.includes('[data-split-pane][data-dsh-space="recon"]'), 'only inside Recon');
  assert.doesNotMatch(boxRule, /data-error|state-error-primary\)\s*\{/, 'not every red word: only real errors (the app\'s error rows and alerts)');
  assert.match(css, /--dsh-me-warn-icon:url\("data:image\/svg\+xml,/);
  assert.match(css, /_turnErrorDot'\]\{[^}]*mask:var\(--dsh-me-warn-icon\)/);
  assert.match(css, /\[role="alert"\]\)::before\{content:'';float:left;width:14px;height:14px;[^}]*mask:var\(--dsh-me-warn-icon\)/);
});

// ---- contrast (WCAG AA, 4.5:1 for text), with the app's own values (design-platform.css, app 0.2.2-rc.2) ---------
const THEMES = {
  light: { base: [255, 255, 255], sidebar: [249, 250, 251], primary: [15, 17, 21], secondary: [97, 102, 107], error: [236, 19, 19], done: [124, 58, 237] },
  dark: { base: [21, 21, 23], sidebar: [27, 27, 28], primary: [249, 250, 251], secondary: [207, 211, 214], error: [242, 90, 90], done: [167, 139, 250] },
};
const mix = (a, b, p) => a.map((v, i) => v * p + b[i] * (1 - p));
const lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const pct = (pattern) => Number(pattern.exec(space.css)[1]) / 100;

test('readable in light and dark: the tint, the error box, the selected tab and the New button (WCAG AA)', () => {
  const tint = pct(/error-primary\) (\d+)%,transparent\)\}/);
  const ink = pct(/--dsh-me-recon-ink:color-mix\(in srgb,var\(--dsw-alias-state-error-primary\) (\d+)%/);
  const violetInk = pct(/--dsh-me-devices-ink:color-mix\(in srgb,var\(--dsw-alias-state-done-primary\) (\d+)%/);
  const alarm = pct(/--dsh-me-alarm:color-mix\(in srgb,var\(--dsw-alias-state-error-primary\) (\d+)%/);
  const tabFill = pct(/\.cws-tab\[data-tab-id="recon"\]\[aria-selected="true"\]\{background:color-mix\(in srgb,var\(--dsw-alias-state-error-primary\) (\d+)%/);
  const newFill = pct(/\[data-cws-tab="recon"\]\) \.cws-new\{[^}]*background:color-mix\(in srgb,var\(--dsw-alias-state-error-primary\) (\d+)%/);
  assert.ok(tint <= 0.06, 'the tint stays faint');
  for (const [name, th] of Object.entries(THEMES)) {
    const tinted = mix(th.error, th.base, tint);
    assert.ok(contrast(th.primary, tinted) >= 7, `${name}: text on the tint`);
    assert.ok(contrast(th.secondary, tinted) >= 4.5, `${name}: secondary text on the tint`);
    const box = mix(th.error, th.primary, alarm);
    assert.ok(contrast(th.base, box) >= 4.5, `${name}: words in the red error box (${contrast(th.base, box).toFixed(2)})`);
    for (const [label, colour, fill] of [['Recon tab', th.error, tabFill], ['Recon New', th.error, newFill], ['Devices tab', th.done, tabFill], ['Devices New', th.done, newFill]]) {
      const p = label.startsWith('Recon') ? ink : violetInk;
      const words = mix(colour, th.primary, p);
      const under = mix(colour, th.sidebar, fill);
      assert.ok(contrast(words, under) >= 4.5, `${name}: ${label} (${contrast(words, under).toFixed(2)})`);
    }
  }
});

// ---- which rows count as errors: the selector run against small stand-in rows ------------------------------------
// A small matcher for the selector forms used here: [attr*='v'], [attr="v"], :has(...) and :is(a,b).
function splitTop(text, sep) {
  const parts = [];
  let depth = 0; let quote = ''; let from = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    else if (ch === sep && depth === 0) { parts.push(text.slice(from, i)); from = i + 1; }
  }
  parts.push(text.slice(from));
  return parts.map((one) => one.trim());
}
function matches(el, selector) {
  let rest = selector.trim();
  while (rest) {
    let m;
    if ((m = /^\[([\w-]+)(\*?=)(['"])(.*?)\3\]/.exec(rest))) {
      const value = el.getAttribute(m[1]);
      if (value === null || (m[2] === '=' ? value !== m[4] : !value.includes(m[4]))) return false;
    } else if ((m = /^:(has|is)\(/.exec(rest))) {
      let depth = 0; let end = -1;
      for (let i = m[0].length - 1; i < rest.length; i += 1) {
        if (rest[i] === '(') depth += 1;
        else if (rest[i] === ')' && (depth -= 1) === 0) { end = i; break; }
      }
      const inner = rest.slice(m[0].length, end);
      const ok = m[1] === 'is'
        ? splitTop(inner, ',').some((one) => matches(el, one))
        : el.all().slice(1).some((one) => matches(one, inner));
      if (!ok) return false;
      m = [rest.slice(0, end + 1)];
    } else throw new Error(`selector part not understood: ${rest}`);
    rest = rest.slice(m[0].length);
  }
  return true;
}
const row = (dotState, { title = '_turnErrorTitle_x1', code = false } = {}) => {
  const el = new FakeEl('div', { class: '_turnErrorRow_x1', role: 'status' });
  new FakeEl('span', { class: '_dot_s1 _turnErrorDot_x1', 'data-state': dotState }, el);
  const copy = new FakeEl('div', { class: '_turnErrorCopy_x1' }, el);
  new FakeEl('span', { class: title }, copy);
  if (code) new FakeEl('code', { class: '_turnErrorCode_x1' }, el);
  return el;
};

test('errors inside Recon: only real failures are boxed, not the output-limit notice or "Task stopped"', () => {
  assert.equal(matches(row('error', { code: true }), space.errors), true, 'a real error (red dot, error code) is boxed');
  assert.equal(matches(row('warning', { title: '_maxTokensTitle_x1' }), space.errors), false, 'the "reply hit the output limit" notice is not boxed');
  assert.equal(matches(row('error'), space.errors), false, '"Task stopped" (the app closed the turn; no code) is not boxed');
  assert.equal(matches(new FakeEl('div', { class: '_openError_q2' }), space.errors), true, 'an open error is boxed');
  assert.equal(matches(new FakeEl('div', { role: 'alert' }), space.errors), true, 'an alert is boxed');
  assert.equal(matches(new FakeEl('span', { class: '_turnErrorTitle_x1' }), space.errors), false, 'red title text alone is not boxed');
  // Every rule that changes a turn row (the box, its columns, the warning sign) uses the same "real failure" test.
  const css = space.css;
  const rowUses = css.split("[class*='_turnErrorRow']").length - 1;
  const guarded = css.split(space.errorRow).length - 1;
  assert.ok(rowUses > 0 && rowUses === guarded, 'no rule reaches a turn row without the red dot and the code');
});

test('Split: a coloured pane keeps Split Plus\'s focus border visible and gets a ring when focused', () => {
  const css = space.css;
  for (const name of ['recon', 'devices']) {
    const rule = new RegExp(`\\[data-split-pane\\]\\[data-dsh-space="${name}"\\]\\{outline:(\\d+)px solid [^;]+;outline-offset:-(\\d+)px\\}`).exec(css);
    assert.ok(rule, name);
    const [width, inset] = [Number(rule[1]), Number(rule[2])];
    assert.ok(inset - width >= 1, `${name}: the outline sits inside the pane's border (0.5px), so the border's focus colour still shows`);
  }
  assert.match(css, /\[data-split-pane\]\[data-dsh-space\]\[data-focused="true"\]\{box-shadow:0 0 0 2px var\(--dsw-alias-brand-primary\)\}/, 'the focused coloured pane gets a brand ring');
});

// ---- the on/off switch (owner point 21, 21 November 2026) ---------------------------------------------------------
const host = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

test('the colours switch: a setting that is on by default', () => {
  assert.match(host, /spaceColours: z\.boolean\(\)\.default\(true\)\.volatile\(\),/);
  assert.equal(space.spaceColours.on, true, 'before the settings are read, the colours show (the default)');
  // Only an explicit false turns them off; a missing value (older settings) keeps them on.
  assert.match(source, /setSpaceColours\(value\?\.spaceColours !== false\);/);
  assert.match(source, /colours: view\.spaceColours !== false/);
});

test('the colours switch on Settings → Modes: a label and a hint in English and Chinese, saved at once', () => {
  assert.match(source, /Toggle\(t\('space\.colours'\), t\('space\.colours\.hint'\), answer\.colours, \(on\) => void flipAnswer\('spaceColours', 'colours', on\)\)/);
  for (const key of ['space.group', 'space.colours', 'space.colours.hint']) {
    assert.equal(source.split(`'${key}': '`).length - 1, 1, `${key}: once, English only`);
  }
  // flipAnswer reads the settings again after the save, which turns the colours on or off in this window at once.
  assert.match(cut('refreshAnswerFlags'), /setSpaceColours\(/);
  // Other windows, or no answer on screen: read again whenever Modes' settings change.
  assert.match(source, /ctx\.effect\(\(\) => dshPoll\.onChange\(ctx, \(ns\) => \{ if \(ns === NS\) refreshFlagsOnce\(\); \}\), 'modes: colours switch'\);/);
  // One read at a time (the 21 November storm: one read per change and per listener made the page read Settings
  // 12-17 times a second): a change during a read asks for one more read after it, never a read of its own.
  assert.match(source, /if \(flagsRun\) \{ flagsAgain = true; return; \}/);
  assert.match(source, /do \{ flagsAgain = false; await refreshAnswerFlags\(ctx\); \} while \(flagsAgain\);/);
  assert.doesNotMatch(source, /onChange\([^)]*\) => \{[^}]*void refreshAnswerFlags/);
});

test('off hides every colour (frame, tabs, New button, tint, error boxes, Split outlines); on brings them back, live', () => {
  const { doc, html, conversation } = page();
  const pane = conversation('p', { pane: 'p1' });
  const off = space.showSpaceColours(doc);
  const style = doc.head.children.find((one) => one.id === 'dsh-modes-space');
  const frame = doc.body.children.find((one) => one.className === 'dsh-me-frame');
  const unmarkWin = space.markSpace(conversation('w').box, doc, 'w', { window: 'recon', pane: 'recon' });
  const unmarkPane = space.markSpace(pane.box, doc, 'p', { window: 'devices', pane: 'devices' });
  // On (the default): every coloured rule is in the page's style.
  assert.equal(style.textContent, space.css);
  assert.notEqual(frame.hidden, true);
  for (const part of ['.dsh-me-frame{display:block', '.cws-tab[data-tab-id="recon"]', '.cws-tab[data-tab-id="bench"]', '.cws-tab[data-tab-id="devices"]', 'html[data-cws-space="recon"]', '.cws-new{', '[data-conversation-scroll]', 'var(--dsh-me-alarm)', '[data-split-pane][data-dsh-space="recon"]{outline']) {
    assert.ok(style.textContent.includes(part), part);
  }
  // Off, live: the style is empty and the frame layer hidden, so nothing anywhere is coloured.
  space.setSpaceColours(false);
  assert.equal(style.textContent, '');
  assert.equal(frame.hidden, true);
  assert.equal(space.spaceColours.on, false);
  // Every colour rule of the add-on lives in this one style (none elsewhere in client.js), so emptying it is enough.
  const elsewhere = [block('SPACE_CSS'), line('IN_RECON'), line('SPACE_TAB_RECON'), line('SPACE_TAB_DEVICES'), line('NEW_IN_RECON'), line('NEW_IN_DEVICES')].reduce((text, part) => text.replace(part, ''), source);
  assert.doesNotMatch(elsewhere, /data-dsh-space="|cws-tab\[data-tab-id="(?:recon|bench|devices)"\]|data-cws-(?:tab|space)="(?:recon|bench|devices)"\]/);
  // Switching conversations while off keeps the marks right, so switching on again shows the right colour at once.
  assert.equal(html.getAttribute('data-dsh-space'), 'recon');
  // On again: everything comes back.
  space.setSpaceColours(true);
  assert.equal(style.textContent, space.css);
  assert.equal(frame.hidden, false);
  unmarkWin();
  unmarkPane();
  off();
});

test('the switch read before the page is ready: the style starts empty when the setting is already off', () => {
  const { doc } = page();
  space.setSpaceColours(false);
  const off = space.showSpaceColours(doc);
  const style = doc.head.children.find((one) => one.id === 'dsh-modes-space');
  const frame = doc.body.children.find((one) => one.className === 'dsh-me-frame');
  assert.equal(style.textContent, '');
  assert.equal(frame.hidden, true);
  off();
  // After the page is taken down, the switch still works (nothing to change) and is remembered for the next page.
  space.setSpaceColours(true);
  assert.equal(space.spaceColours.style, null);
  const again = page();
  const off2 = space.showSpaceColours(again.doc);
  assert.equal(again.doc.head.children[0].textContent, space.css);
  off2();
});

test('a conversation moved out of Recon takes its new tab\'s colour and is no longer red', () => {
  const { doc, html, conversation } = page();
  const view = { modes: JSON.stringify({ chat: { label: 'Chat' } }), extraModes: { recon: { label: 'Recon' }, bench: { label: 'Devices' } }, sessionModes: { a: 'recon' } };
  const { box } = conversation('a');
  const mark = (tab) => space.markSpace(box, doc, 'a', { window: space.spaceFor(view, 'a', tab), pane: space.spaceFor(view, 'a', '') });
  let off = mark('recon');
  assert.equal(html.getAttribute('data-dsh-space'), 'recon');
  // Moved to Chat (its recorded mode changes): the chat box marks again, with no colour.
  view.sessionModes = { a: 'chat' };
  off();
  off = mark('chat');
  assert.equal(html.getAttribute('data-dsh-space'), null, 'not red after the move');
  // Even while the Recon tab is still the selected one: the recorded mode wins.
  off();
  off = mark('recon');
  assert.equal(html.getAttribute('data-dsh-space'), null, 'not red while Recon is still selected');
  // Moved to Devices: violet.
  view.sessionModes = { a: 'bench' };
  off();
  off = mark('bench');
  assert.equal(html.getAttribute('data-dsh-space'), 'devices');
  off();
  // In a Split pane too.
  const pane = conversation('s', { pane: 'p1' });
  view.sessionModes = { s: 'recon' };
  let offPane = space.markSpace(pane.box, doc, 's', { window: '', pane: space.spaceFor(view, 's', '') });
  assert.equal(pane.holder.getAttribute('data-dsh-space'), 'recon');
  view.sessionModes = { s: 'code' };
  offPane();
  offPane = space.markSpace(pane.box, doc, 's', { window: '', pane: space.spaceFor(view, 's', '') });
  assert.equal(pane.holder.getAttribute('data-dsh-space'), null);
  offPane();
});

// ---- Item 4A, stage 3a: the colours follow the space -------------------------------------------------------------
test('with the space buttons a thread shows its space\'s colours: its recorded space, never its mode', () => {
  const view = { modes: JSON.stringify({ chat: { label: 'Chat' } }), extraModes: { recon: { label: 'Recon' }, bench: { label: 'Devices' } }, sessionModes: { a: 'recon', b: 'bench', c: 'research', d: 'chat' }, sessionSpaces: { a: 'recon', b: 'devices', c: 'code', d: 'chat' } };
  const live = (space) => ({ live: true, space });
  assert.equal(space.spaceFor(view, 'a', 'recon', live('chat')), 'recon', 'a Recon thread opened while Chat is the window\'s space stays red');
  assert.equal(space.spaceFor(view, 'b', 'bench', live('chat')), 'devices');
  assert.equal(space.spaceFor(view, 'c', 'research', live('recon')), '', 'a Research thread in Code is not red, whatever the window');
  // A recorded space wins over the mode (a mode change never moves a thread, nor its colours).
  assert.equal(space.spaceFor({ ...view, sessionModes: { e: 'recon' }, sessionSpaces: { e: 'chat' } }, 'e', 'recon', live('recon')), '');
  // A thread with no recorded space yet: its recorded mode's; a new one: the window's space.
  assert.equal(space.spaceFor({ ...view, sessionSpaces: {} }, 'b', '', live('chat')), 'devices');
  assert.equal(space.spaceFor(view, 'new', 'bench', live('devices')), 'devices', 'a new thread follows the window\'s space');
  assert.equal(space.spaceFor(view, 'new', 'recon', live('workshop')), '', 'Workshop has no colour of its own');
  assert.equal(space.spaceFor(view, 'new', '', { live: true, space: '' }), '', 'a Split pane: no window space');
  assert.equal(space.spaceFor(null, 'new', '', live('recon')), 'recon', 'still loading: the window\'s space');
  // Without the space buttons (no data-cws-space), as before.
  assert.equal(space.spaceFor(view, 'new', 'bench'), 'devices');
  assert.match(source, /const windowSpace = spaceFor\(spaceView, sessionId, shownTab, \{ live: Boolean\(shownSpace\), space: shownSpace \}\);/);
  assert.match(source, /const paneSpace = spaceFor\(spaceView, sessionId, '', \{ live: Boolean\(shownSpace\), space: '' \}\);/);
  assert.match(source, /const shownSpace = useCwsAttr\('data-cws-space'\);/);
});
