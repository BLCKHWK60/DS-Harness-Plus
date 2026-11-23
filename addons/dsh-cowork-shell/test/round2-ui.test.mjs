// Item 4A, round 2 of fixes (UI and text): the start page's chips follow the mode picked for the new thread, a row's
// ⋯ menu is always whole on screen, a done move is a normal note, Recon's first message keeps its paragraphs, the Cowork
// switch's name stays readable at 1280 px, and "thread" in the sidebar's words.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DEFAULT_TABS } from '../index.js';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

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
/** The page code's DEFAULT_TABS, read as JSON. */
function clientTabs() {
  const start = source.indexOf('const DEFAULT_TABS = {') + 'const DEFAULT_TABS = '.length;
  const end = source.indexOf('\n    };', start);
  return JSON.parse(source.slice(start, end + 6).trim().replace(/;$/, ''));
}

test('starter chips follow the mode picked for the new thread; greeting and New stay the space\'s', () => {
  const heroChipsOf = new Function('DEFAULT_TABS', `${functionText('tabEntry')}\nreturn ${functionText('heroChipsOf')};`)(DEFAULT_TABS);
  const labels = (list) => list.map((chip) => chip.label);
  const chat = { id: 'chat', label: 'Chat', space: 'chat' };
  const code = { id: 'code', label: 'Code', space: 'code' };
  const on = { spacesOn: true, tabs: {} };
  assert.deepEqual(labels(heroChipsOf(on, chat, 'finance')), labels(DEFAULT_TABS.finance.chips), 'Finance shows Finance\'s chips in Chat');
  assert.deepEqual(labels(heroChipsOf(on, code, 'data')), labels(DEFAULT_TABS.data.chips), 'Data shows Data\'s chips in Code');
  const research = { spacesOn: true, tabs: { research: { chips: [{ label: 'Deep dive', prompt: 'x' }] } } };
  assert.deepEqual(labels(heroChipsOf(research, code, 'research')), ['Deep dive'], 'an add-on mode\'s own chips (Research sends its own) in any space');
  assert.deepEqual(labels(heroChipsOf(on, chat, 'plain')), labels(DEFAULT_TABS.plain.chips), 'Plain chat has chips of its own');
  assert.ok(DEFAULT_TABS.plain.chips.length >= 4, 'a useful handful');
  assert.deepEqual(labels(heroChipsOf(on, chat, '')), labels(DEFAULT_TABS.plain.chips), 'before Modes names the mode: Chat\'s start, Plain chat');
  assert.deepEqual(labels(heroChipsOf(on, code, '')), labels(DEFAULT_TABS.code.chips), 'elsewhere: the space\'s own');
  assert.deepEqual(labels(heroChipsOf({ spacesOn: false, tabs: {} }, { id: 'chat' }, 'research')), [], 'without spaces: the tab\'s chips, as before');
  const own = { spacesOn: true, tabs: { plain: { chips: [{ label: 'Mine', prompt: 'x' }] } } };
  assert.deepEqual(labels(heroChipsOf(own, chat, 'plain')), ['Mine'], 'chips you set for a mode win');
  // The page code and the setting default hold the same Plain chat chips; the chips read the mode Modes puts on the page.
  assert.deepEqual(clientTabs().plain, DEFAULT_TABS.plain);
  assert.match(functionText('HeroChips'), /useSyncExternalStore\(watchDraftMode, readDraftMode, \(\) => ''\)/);
  assert.match(source, /getAttribute\('data-dsh-draft-mode'\)/);
  // The greeting and the New label stay per space.
  assert.match(functionText('HeroGreeting'), /tabEntry\(state, selected\.id\)\.greeting/);
});

test('built-in chips show as written, in English, whatever the app\'s language (owner decision 28)', () => {
  assert.doesNotMatch(source, /CHIP_ZH|chipInLanguage/);
  assert.match(source, /const chips = heroChipsOf\(state, selected, draftMode\);/);
  for (const entry of Object.values(DEFAULT_TABS)) {
    for (const chip of entry.chips ?? []) assert.doesNotMatch(`${chip.label}${chip.prompt}`, /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/, chip.label);
  }
});

test('a row\'s ⋯ menu is drawn in the page body and placed whole on screen, flipping up near the bottom', () => {
  const menuPlace = new Function(`return ${functionText('menuPlace')};`)();
  const win = { width: 1280, height: 860 };
  const box = { top: 120, bottom: 820 };
  const pop = { width: 180, height: 200 };
  const high = menuPlace({ top: 200, bottom: 224, left: 250, right: 274 }, pop, box, win);
  assert.equal(high.up, false);
  assert.equal(high.top, 228);
  assert.equal(high.left, 94, 'right edges line up');
  const low = menuPlace({ top: 780, bottom: 804, left: 250, right: 274 }, pop, box, win);
  assert.equal(low.up, true, 'a low row: above the button');
  assert.equal(low.bottom, 860 - 780 + 4);
  assert.ok(low.maxHeight >= pop.height);
  const edge = menuPlace({ top: 300, bottom: 324, left: 0, right: 40 }, pop, box, win);
  assert.equal(edge.left, 8, 'kept inside the window');
  const tall = menuPlace({ top: 400, bottom: 424, left: 250, right: 274 }, { width: 180, height: 900 }, box, win);
  assert.ok(tall.maxHeight <= 860, 'too tall: made shorter, it scrolls inside');
  const body = functionText('MoveMenu');
  assert.match(body, /ReactDOM\.createPortal\(pop, document\.body\)/);
  assert.match(body, /closest\('\.cws-scroll'\)/);
  assert.match(body, /position: 'fixed'/);
  assert.match(source, /\.cws-movepop\{position:absolute;right:0;top:calc\(100% \+ 2px\);z-index:300;/);
});

test('a done move is a normal note, not the error red, and says thread', () => {
  assert.match(source, /state\.notice \? h\('div', \{ className: 'cws-notice', role: 'status' \}, state\.notice\) : null,/);
  assert.doesNotMatch(source, /className: 'cws-error cws-note'/);
  assert.match(source, /\.cws-notice\{margin:0 4px 8px;color:var\(--dsw-alias-label-secondary\);/);
  for (const key of ['move.recon', 'move.reconFiles', 'move.reconDraft', 'move.reconDraftFiles', 'move.reconCancelled', 'move.reconProject']) {
    const lines = source.split('\n').filter((line) => line.includes(`'${key}':`));
    assert.equal(lines.length, 1, `${key}: English only`);
    assert.doesNotMatch(lines[0], /conversation/, key);
  }
});

test('Recon\'s first message keeps its paragraph breaks: a paste first, else line by line', () => {
  const body = functionText('putText');
  assert.match(body, /new ClipboardEvent\('paste', \{ clipboardData: data, bubbles: true, cancelable: true \}\)/);
  assert.match(body, /if \(event\.defaultPrevented\) return true;/, 'never put in twice');
  assert.match(body, /document\.execCommand\('insertParagraph'\)/);
  assert.match(functionText('fillDraft'), /if \(putText\(box, text\)\) return;/);
  // Line by line on a stand-in document: the breaks become paragraphs.
  const calls = [];
  const document = { execCommand: (name, _ui, value) => { calls.push(value === undefined ? name : `${name}:${value}`); return true; } };
  const putText = new Function('document', 'DataTransfer', 'ClipboardEvent', `return ${body};`)(document, undefined, undefined);
  assert.equal(putText({ dispatchEvent: () => true }, 'One.\n\nTwo.'), true);
  assert.deepEqual(calls, ['insertText:One.', 'insertParagraph', 'insertParagraph', 'insertText:Two.']);
});

test('the Cowork switch keeps its name until the last step (1280 px with the sidebar open)', () => {
  assert.match(source, /\.dsh-me-tools\[data-f5\] \.cws-cowork-lbl\{display:none\}/);
  assert.doesNotMatch(source, /\.dsh-me-tools\[data-f3\] \.cws-cowork-lbl/);
});

test('the left panel\'s words say thread, not conversation', () => {
  const en = source.slice(source.indexOf('const DICT = {'), source.indexOf('\n    };\n', source.indexOf('const DICT = {')));
  assert.ok(en.length > 1000, 'the word list was found');
  assert.doesNotMatch(en, /\bconversations?\b/i);
});
