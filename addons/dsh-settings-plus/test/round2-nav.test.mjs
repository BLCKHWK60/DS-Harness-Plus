// Item 4A, round 2 (UI and text), English only since stage 7: the Settings list's group headings and Settings Plus's own page names, the
// Workshop group (Creator Plus, Tuner Plus, Benchmark) right after Spaces and modes (mock-up e), and the settings search's
// "Offer the … mode" entries describing modes, not tabs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const INDEX = JSON.parse(readFileSync(new URL('../settings-index.json', import.meta.url), 'utf8'));

function client() {
  let loaded;
  const window = { __ModuleLoader__: { load: (module) => { loaded = module; } } };
  new Function('window', SOURCE)(window); // eslint-disable-line no-new-func
  const React = { createElement: () => null, Fragment: 'fragment', Component: class {}, useCallback: (fn) => fn, useEffect() {}, useMemo: (fn) => fn(), useRef: () => ({}), useState: (value) => [value, () => {}] };
  return loaded.factory((name) => (name === 'react' ? React : { createPortal: () => null }));
}
const plugin = client();

test('a Workshop group with Creator Plus, Tuner Plus and Benchmark, right after Spaces and modes', () => {
  const labels = plugin.GROUPS.map((group) => group.label);
  assert.equal(labels[labels.indexOf('Spaces and modes') + 1], 'Workshop');
  assert.deepEqual(plugin.GROUPS.find((group) => group.label === 'Workshop').pages, ['creator-plus', 'tuning', 'benchmark']);
  assert.ok(!plugin.GROUPS.find((group) => group.label === 'Models and spending').pages.includes('benchmark'));
});

test('group headings and Settings Plus\'s own page names stay English, also when the app reports Chinese (owner decision 28)', () => {
  for (const group of plugin.GROUPS) {
    assert.equal(Object.hasOwn(group, 'zh'), false, group.label);
    assert.doesNotMatch(group.label, /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/, group.label);
  }
  assert.doesNotMatch(SOURCE, /NAV_DICT = \{[^]*?\bzh: \{/, 'no Chinese word list');
  assert.doesNotMatch(SOURCE, /ctx\.locale\.register\(NAV_NS/);
  assert.match(SOURCE, /head = navWords\(appCtx\)\(`group\.\$\{group\.label\}`\)/);
  for (const page of ['start-here', 'about-plus', 'more-settings']) assert.match(SOURCE, new RegExp(`label: \\(\\) => navWords\\(ctx\\)\\('page\\.${page}'\\)`), page);
  const navWords = new Function('NAV_DICT', `return ${SOURCE.slice(SOURCE.indexOf('function navWords('), SOURCE.indexOf('\n    }', SOURCE.indexOf('function navWords(')) + 6)};`)({ en: { 'page.start-here': 'Start here' } });
  assert.equal(navWords({})('page.start-here'), 'Start here');
  // An app set to Chinese (its locale service answers in Chinese): the words stay English.
  assert.equal(navWords({ locale: { bind: () => () => '\u4ece\u8fd9\u91cc\u5f00\u59cb' } })('page.start-here'), 'Start here');
});

test('the settings search: the "Offer the … mode" switches describe the mode; old names still find them; no Chinese search words (point 29)', () => {
  const fields = ['finance.enabled', 'data.enabled', 'research.enabled', 'scout.enabled', 'recon.enabled', 'content.enabled', 'bench.enabled', 'creator-plus.enabled', 'automations.tab'];
  for (const field of fields) {
    const entries = INDEX.filter((entry) => entry.field === field && /^Offer the /.test(entry.label));
    assert.ok(entries.length > 0, field);
    for (const entry of entries) {
      assert.doesNotMatch(`${entry.label} ${entry.description} ${entry.heading}`, /\btabs?\b/i, field);
      assert.ok(!entry.keywords.some((word) => /[\u3400-\u9fff]/.test(word)), `${field}: no Chinese words`);
      assert.ok(entry.keywords.some((word) => /\btab\b/.test(word)), `${field}: the old name stays findable`);
    }
  }
  assert.ok(!INDEX.some((entry) => entry.label === 'The tab'), 'no "The tab" heading left');
  const own = INDEX.find((entry) => entry.field === 'automations.runsInTheirTab');
  assert.equal(own.label, 'New threads use the automation\'s mode');
});
