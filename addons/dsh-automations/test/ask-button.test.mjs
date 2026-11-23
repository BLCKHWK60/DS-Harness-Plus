// Item 4A, stage 3b (22 November 2026): with spaces there is no Automations tab. The Automations page gets "Ask about
// automations", which opens a new thread in Chat, Automations mode, through the Cowork sidebar's start event; the tab's
// start-page tiles (with "Need you") show on the page. Never by switching off this add-on's "tab" setting: that removes
// the mode and pauses automations.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

function block(start, endMarker) {
  const at = source.indexOf(start);
  assert.ok(at >= 0, `client.js has ${start}`);
  const end = source.indexOf(endMarker, at);
  return source.slice(at, end);
}
function functionText(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `client.js has no function ${name}`);
  let depth = 0;
  for (let i = source.indexOf(') {', start) + 2; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && (depth -= 1) === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
}

/** AskButton with a stand-in React, (i), window and document. */
function load({ spaces = true, taken = true } = {}) {
  const sent = [];
  const win = {
    dispatchEvent: (event) => { sent.push(event); if (taken) event.defaultPrevented = true; return !taken; },
  };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; this.cancelable = init?.cancelable; } }
  const doc = { documentElement: { hasAttribute: (name) => spaces && name === 'data-cws-space' } };
  const h = (type, props, ...children) => ({ type, props: props ?? {}, children });
  const ui = { Info: 'Info' };
  const make = new Function('window', 'document', 'CustomEvent', 'h', 'ui', `
    ${block('const ASK_UI = {', 'function RunsPage(')}
    return { AskButton, ASK_UI };
  `);
  return { ...make(win, doc, CustomEvent, h, ui), sent };
}
const button = (tree) => tree.children.find((child) => child?.type === 'button');

test('the button opens a new thread in Chat, Automations mode, through the sidebar', () => {
  const { AskButton, sent } = load();
  const notes = [];
  const tree = AskButton({ data: { lang: 'en', settings: { tab: true } }, onNote: (n) => notes.push(n) });
  assert.equal(button(tree).children[0], 'Ask about automations');
  button(tree).props.onClick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'dsh-cowork-shell:start');
  assert.equal(sent[0].cancelable, true);
  assert.equal(sent[0].detail.space, 'chat');
  assert.equal(sent[0].detail.mode, 'automations');
  assert.deepEqual(notes, []);
  // A refusal from the sidebar (Modes' sentence) shows as a plain note with Details.
  sent[0].detail.onError('Automations is not offered in Chat.');
  assert.equal(notes[0].error, true);
  assert.equal(notes[0].details, 'Automations is not offered in Chat.');
});

test('the button has an (i), in English also when the app reports Chinese (decision 28)', () => {
  const { AskButton, ASK_UI } = load();
  assert.equal(ASK_UI.zh, undefined, 'no Chinese table');
  for (const lang of ['en', 'zh']) {
    const tree = AskButton({ data: { lang, settings: { tab: true } }, onNote: () => {} });
    const info = tree.children.find((child) => child?.type === 'Info');
    assert.ok(info, lang);
    assert.equal(info.props.title, ASK_UI.en.info.title);
    assert.ok(info.props.what && info.props.when && info.props.change, lang);
  }
  assert.equal(load().AskButton({ data: { lang: 'zh', settings: {} }, onNote: () => {} }).children[0].children[0], 'Ask about automations');
});

test('with the mode switched off the button says so and where to switch it on; nothing is changed', () => {
  const { AskButton, sent } = load();
  const notes = [];
  const tree = AskButton({ data: { lang: 'en', settings: { tab: false } }, onNote: (n) => notes.push(n) });
  assert.equal(button(tree).props['aria-disabled'], 'true');
  button(tree).props.onClick();
  assert.equal(sent.length, 0);
  assert.match(notes[0].text, /Settings → Alerts/);
});

test('without spaces (the tabs) there is no button; a sidebar that does not take it is said in words', () => {
  assert.equal(load({ spaces: false }).AskButton({ data: { lang: 'en', settings: { tab: true } }, onNote: () => {} }), null);
  const { AskButton } = load({ taken: false });
  const notes = [];
  button(AskButton({ data: { lang: 'en', settings: { tab: true } }, onNote: (n) => notes.push(n) })).props.onClick();
  assert.match(notes[0].text, /Mode list/);
});

test('the page shows the tab\'s start-page tiles, with Need you; the "tab" setting is never written by the page', () => {
  const page = functionText('RunsPage');
  assert.match(page, /tile\(num\(waiting\.length\), 'Need you', waiting\.length > 0\)/);
  assert.match(page, /h\(AskButton, \{ data, onNote: setNote \}\)/);
  assert.doesNotMatch(source, /path: \['tab'\]/);
});
