// The study bar's look after a send: Enter and a click on Send both bring the bar within about two seconds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useCallback: (fn) => fn, useEffect() {}, useMemo: (fn) => fn(), useRef: () => ({}),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
};
function bar() {
  let loaded;
  const window = { __ModuleLoader__: { load: (module) => { loaded = module; } } };
  new Function('window', SOURCE)(window); // eslint-disable-line no-new-func
  return loaded.factory((name) => (name === 'react' ? React : {})).studyBar;
}
/** A button as the page has it: closest() finds itself. */
const button = (attrs) => ({ closest: () => ({ getAttribute: (name) => attrs[name] ?? null }) });
const doc = () => {
  const listeners = [];
  return {
    listeners,
    addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
    removeEventListener: (type, fn) => { const at = listeners.findIndex((one) => one.type === type && one.fn === fn); if (at >= 0) listeners.splice(at, 1); },
    fire: (type, event) => listeners.filter((one) => one.type === type).forEach((one) => one.fn(event)),
  };
};

test('a click on the Send button counts as a send; other buttons do not', () => {
  const { isSendClick } = bar();
  assert.equal(isSendClick(button({ 'aria-label': 'Send message' })), true);
  assert.equal(isSendClick(button({ type: 'submit' })), true);
  assert.equal(isSendClick(button({ title: 'Stop' })), false);
  assert.equal(isSendClick({ closest: () => null }), false);
  assert.equal(isSendClick(null), false);
});

test('after Enter or a click on Send the bar looks within two seconds, and nothing runs between sends', () => {
  const { watchSend } = bar();
  const page = doc();
  const later = [];
  let looks = 0;
  const stop = watchSend(page, () => { looks += 1; }, (fn, ms) => later.push({ fn, ms }));
  assert.equal(later.length, 0, 'no timer without a send');
  page.fire('click', { target: button({ 'aria-label': 'Send' }) });
  assert.deepEqual(later.map((one) => one.ms), [400, 1600], 'a mouse send is followed by looks inside two seconds');
  assert.ok(Math.max(...later.map((one) => one.ms)) <= 2000);
  later.splice(0).forEach((one) => one.fn());
  assert.equal(looks, 2);
  page.fire('keydown', { key: 'Enter', shiftKey: false });
  assert.equal(later.length, 2, 'Enter works as before');
  page.fire('keydown', { key: 'Enter', shiftKey: true });
  page.fire('click', { target: button({ title: 'Copy' }) });
  assert.equal(later.length, 2, 'Shift+Enter and other buttons do nothing');
  stop();
  assert.equal(page.listeners.length, 0, 'watching stops with the bar');
});
