/**
 * Artifacts, the security review's findings (browser half): how a web page is prepared for its box, the box
 * closing when a page goes elsewhere, the PDF note, and what you can do with a sealed (Recon) artifact. No
 * browser is started: the module loader, React and the page parser are stand-ins (the parser builds a small
 * tree with the few DOM methods the cleaning uses).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

class Text {
  constructor(text) { this.text = text; this.parentNode = null; }
  get outerHTML() { return this.text; }
}
class El {
  constructor(name, attrs = []) { this.localName = name.toLowerCase(); this.tagName = name.toUpperCase(); this.attrs = attrs; this.childNodes = []; this.parentNode = null; }
  get attributes() { return this.attrs.map((attr) => ({ ...attr })); }
  getAttribute(name) { return this.attrs.find((attr) => attr.name.toLowerCase() === name.toLowerCase())?.value ?? null; }
  setAttribute(name, value) { const found = this.attrs.find((attr) => attr.name === name); if (found) found.value = String(value); else this.attrs.push({ name, value: String(value) }); }
  removeAttribute(name) { this.attrs = this.attrs.filter((attr) => attr.name !== name); }
  append(node) { node.parentNode = this; this.childNodes.push(node); }
  prepend(node) { node.parentNode = this; this.childNodes.unshift(node); }
  remove() { if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter((node) => node !== this); this.parentNode = null; }
  replaceWith(...nodes) { const parent = this.parentNode; parent.childNodes.splice(parent.childNodes.indexOf(this), 1, ...nodes); for (const node of nodes) node.parentNode = parent; this.parentNode = null; }
  querySelectorAll(selector) {
    assert.equal(selector, '*');
    const out = [];
    const walk = (node) => { for (const child of node.childNodes) if (child instanceof El) { out.push(child); walk(child); } };
    walk(this);
    return out;
  }
  get outerHTML() {
    const attrs = this.attrs.map((attr) => ` ${attr.name}="${attr.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('');
    return `<${this.localName}${attrs}>${VOID.has(this.localName) ? '' : `${this.childNodes.map((child) => child.outerHTML).join('')}</${this.localName}>`}`;
  }
}
/** A small parser for the well-formed pages below. */
class DOMParser {
  parseFromString(text) {
    const root = new El('#root');
    const stack = [root];
    for (const m of text.matchAll(/<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g)) {
      if (m[1]) {
        const at = stack.map((one) => one.localName).lastIndexOf(m[1].toLowerCase());
        if (at > 0) stack.length = at;
      } else if (m[2]) {
        const attrs = [...(m[3] ?? '').matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map((a) => ({ name: a[1].toLowerCase(), value: a[2] ?? a[3] ?? a[4] ?? '' }));
        const element = new El(m[2], attrs);
        stack.at(-1).append(element);
        if (!VOID.has(element.localName) && !m[4]) stack.push(element);
      } else stack.at(-1).append(new Text(m[5]));
    }
    const html = root.childNodes.find((node) => node.localName === 'html');
    return { documentElement: html, head: html.childNodes.find((node) => node.localName === 'head'), querySelectorAll: (selector) => root.querySelectorAll(selector), createElement: (name) => new El(name) };
  }
}

const h = (type, props, ...children) => ({ type, props: { ...(props ?? {}), children } });
const React = { createElement: h, useState: (value) => [value, () => {}], useEffect() {}, useMemo: (fn) => fn(), useRef: (value) => ({ current: value }), useCallback: (fn) => fn, useSyncExternalStore: (_subscribe, get) => get() };

function load() {
  let loaded;
  vm.runInNewContext(SOURCE, { window: { __ModuleLoader__: { load: (module) => { loaded = module; } } }, DOMParser, URL, Blob, console });
  return loaded.factory((name) => (name === 'react' ? React : { createPortal: () => null }));
}
const plugin = load();
const { testing } = plugin;

/** Every element in a rendered tree (components are not expanded), and its words. */
const elements = (node) => (Array.isArray(node) ? node.flatMap(elements) : node && typeof node === 'object' ? [node, ...elements(node.props?.children ?? [])] : []);
const words = (node) => (Array.isArray(node) ? node.map(words).join('') : node && typeof node === 'object' ? words(node.props?.children ?? []) : node === null || node === undefined || node === false ? '' : String(node));
const buttons = (tree) => Array.from(elements(tree).filter((one) => one.type === 'button'), words); // an array of this realm (the page code runs in its own)

const PAGE = '<html><head><meta http-equiv="refresh" content="0;url=https://example.org/"><base href="https://example.org/"><link rel="stylesheet" href="https://example.org/a.css"><script>steal()</script><title>T</title></head>'
  + '<body onload="go()"><a href="https://example.org/" target="_top" ping="https://example.org/p">read more</a><img src="https://example.org/p.png" srcset="https://example.org/p2.png 2x"><img src="data:image/png;base64,AAAA" alt="kept">'
  + '<form action="https://example.org/f"><input name="q" value="typed"><button formaction="https://example.org/b">Go</button></form><iframe src="https://example.org/"></iframe>'
  + '<svg><a xlink:href="https://example.org/"><animate attributeName="href" to="https://example.org/"/><text>svg link</text></a></svg><template shadowrootmode="open"><a href="https://example.org/">hidden</a></template><p style="color:red">Hello</p></body></html>';

test('the browser half loads and keeps its test parts out of the app\'s sight', () => {
  assert.equal(typeof plugin.apply, 'function');
  assert.ok(!Object.keys(plugin).includes('testing'));
  assert.equal(typeof testing?.preparePage, 'function');
});

test('6: a page shown safely is cleaned: nothing that runs, loads or leads anywhere is left, and the box\'s rules come first', () => {
  const doc = testing.preparePage(PAGE, 'safe');
  assert.ok(doc.startsWith(`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${testing.SAFE_POLICY}">`), doc.slice(0, 200));
  assert.match(testing.SAFE_POLICY, /base-uri 'none'/);
  assert.match(testing.SAFE_POLICY, /script-src 'none'/);
  assert.doesNotMatch(doc, /example\.org/, 'no address of any kind is left');
  for (const gone of ['<script', 'onload', '<iframe', '<form', '<template', '<animate', '<base', 'refresh', '<link', 'srcset', 'formaction', 'target=', 'ping=']) assert.ok(!doc.includes(gone), gone);
  for (const kept of ['read more', 'Hello', 'value="typed"', 'data:image/png;base64,AAAA', 'svg link', 'style="color:red"']) assert.ok(doc.includes(kept), kept);
});

test('5: a page set running keeps its scripts but nothing that sends it elsewhere by itself; the button says it may reach the internet; a page that goes elsewhere is closed', () => {
  const doc = testing.preparePage(PAGE, 'run');
  assert.ok(doc.startsWith(`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${testing.RUN_POLICY}">`));
  assert.match(testing.RUN_POLICY, /base-uri 'none'/);
  assert.ok(doc.includes('<script>steal()</script>'), 'its scripts run (that is what Run means)');
  for (const gone of ['refresh', '<base', 'target=', 'ping=']) assert.ok(!doc.includes(gone), gone);
  assert.equal(testing.preparePage(PAGE, 'internet'), PAGE, 'with the internet allowed, as it is');
  const view = testing.HtmlView({ text: PAGE, artifactId: 'a:1', start: 'safe' });
  assert.deepEqual(buttons(view), ['Run page (it may reach the internet)', 'Allow internet for this file']);
  const frame = elements(view).find((one) => one.type === testing.PageFrame);
  assert.equal(frame.props.doc, testing.preparePage(PAGE, 'safe'));
  // The box: its first load is its own page; a second one means it went elsewhere.
  let left = 0;
  const box = testing.PageFrame({ doc: frame.props.doc, step: 'run', onLeft: () => { left += 1; } });
  assert.equal(box.props.sandbox, 'allow-scripts');
  box.props.onLoad();
  assert.equal(left, 0);
  box.props.onLoad();
  assert.equal(left, 1, 'closed');
  assert.equal(testing.PageFrame({ doc: '', step: 'safe', onLeft() {} }).props.sandbox, '');
  assert.match(words(testing.HtmlView({ text: PAGE, artifactId: 'a:1', start: 'internet' })), /local network/);
});

test('16: a PDF says what to do if it stays blank, with App preview at hand', () => {
  let asked = 0;
  const view = testing.BlobView({ blob: {}, kind: 'pdf', name: 'a.pdf', onAppPreview: () => { asked += 1; } });
  assert.match(words(view), /If this stays blank, use App preview/);
  elements(view).find((one) => one.type === 'button').props.onClick();
  assert.equal(asked, 1);
  assert.match(words(testing.BlobView({ blob: {}, kind: 'pdf', name: 'a.pdf', onAppPreview: null })), /open it in its own app/);
});

test('8 and 4: a sealed (Recon) artifact offers nothing that takes it out of Recon; Open in its app only where it may, Show in Finder for any other', () => {
  const props = (item) => ({ item: { id: 'x', name: 'notes.md', kind: 'markdown', path: '/w/notes.md', star: false, ...item }, shown: { text: 'secret' }, sessionId: 'r1', version: 1, act() {}, appPreview() {}, setNote() {}, setItem() {} });
  const sealed = buttons(testing.ViewerActions(props({ sealed: true })));
  assert.deepEqual(sealed, ['☆ Keep']);
  assert.match(words(testing.ViewerActions(props({ sealed: true }))), /Export… button/);
  assert.deepEqual(buttons(testing.ViewerActions(props({}))), ['App preview', 'Open in its app', 'Show in Finder', 'Save to folder', 'Copy', 'Send to…', '☆ Keep']);
  for (const [name, kind] of [['page.html', 'html'], ['pic.svg', 'image'], ['run.sh', 'code'], ['Makefile', 'code']]) {
    const shown = buttons(testing.ViewerActions(props({ name, kind })));
    assert.ok(!shown.includes('Open in its app') && shown.includes('Show in Finder'), name);
  }
  assert.deepEqual(buttons(testing.ViewerActions(props({ noRender: true }))), ['Copy', 'Send to…', '☆ Keep'], 'a Bench backup: nothing that shows it');
});
