/**
 * The page code: it parses, it registers Settings → Creator Plus and the bar in the chat box, and it asks
 * for every service it uses. No browser is started: the module loader and React are stand-ins.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

test('the page code registers its page and its bar, and asks for the services it uses', () => {
  let loaded;
  const window = { __ModuleLoader__: { load: (module) => { loaded = module; } } };
  new Function('window', SOURCE)(window); // eslint-disable-line no-new-func
  assert.equal(loaded.id, '@local/dsh-creator-plus');
  const React = { createElement: () => null, Fragment: 'fragment', useEffect() {}, useLayoutEffect() {}, useRef: () => ({}), useState: (value) => [value, () => {}] };
  const plugin = loaded.factory((name) => (name === 'react' ? React : { createPortal: () => null }));
  const registered = [];
  const ctx = {
    effect: (fn) => fn(),
    locale: { register() {}, bind: () => (key) => key },
    slots: { inject: (_name, fn) => fn(), register: (entry) => { registered.push(entry); return () => {}; } },
  };
  plugin.apply(ctx);
  assert.deepEqual(registered.map((entry) => `${entry.name}#${entry.id}`), ['settings.section#creator-plus', 'conversation.input.left#creator-plus-bar', 'conversation.hero.options#creator-plus-options', 'conversation.input.dock#creator-plus-strip']);
  // Under the chat box in the one options area every mode shares (18 November 2026): start page and started conversation.
  assert.match(SOURCE, /strip: 'start' \}/);
  assert.match(SOURCE, /strip: 'chat' \}/);
  assert.match(SOURCE, /h\(Area, \{ mode: 'creator-plus', place: strip === 'start' \? 'start' : 'chat'/);
  // It never lingers on another tab: forgotten when the conversation changes, hidden on another sidebar tab.
  assert.match(SOURCE, /setView\(null\);\s*setState\(null\);\s*setOpen\(false\);/);
  assert.match(SOURCE, /if \(otherTab\('creator-plus'\)\) return null;/);
  for (const service of ['remote.session', 'remote.settings']) if (SOURCE.includes(`'${service}'`) || SOURCE.includes(`.${service.split('.')[1]}.`)) assert.ok(plugin.inject.includes(service), service);
});

test('no personal value is in the add-on\'s files', () => {
  for (const file of ['index.js', 'client.js', 'cordis.patch.yml', 'README.md', 'lib/mode.js', 'lib/rules.js', 'lib/sandbox.js']) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /\/Users\/(?!you\/|someone\b)[a-z]/, file);
    assert.doesNotMatch(text, /\b(?:192\.168|10\.\d+\.\d+)\.\d+\b/, file);
  }
  assert.match(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8'), /enabled: false/);
});

test('review of Mission stage E: the eight tests row says Mission, as the tests themselves do (no "Long run" left on the page)', () => {
  assert.match(SOURCE, /Collision, Change, Update, Mission, Scope and part of Improve/);
  assert.doesNotMatch(SOURCE, /Long run/);
});
