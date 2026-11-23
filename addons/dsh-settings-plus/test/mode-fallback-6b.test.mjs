/**
 * Item 4A, stage 6b, Part D (STAGE6B-DESIGN.md J21): the gear beside Send finds a thread's mode. While spaces are live
 * (Modes' Mode route says `live`, or, when it was not asked, Modes' settings have `sessionSpaces`), a thread with no
 * stored mode shows the space's start mode the route gave, else Plain chat; never the stored `defaultMode`, which
 * spaces no longer use and which may still say Recon. Without spaces, as before (the default, then Cowork).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

function loadClient() {
  let loaded;
  const window = { __ModuleLoader__: { load: (module) => { loaded = module; } } };
  new Function('window', SOURCE)(window); // eslint-disable-line no-new-func
  const React = {
    createElement: () => null, Fragment: 'fragment', Component: class {},
    useCallback: (fn) => fn, useEffect() {}, useMemo: (fn) => fn(), useRef: () => ({}), useState: (value) => [value, () => {}],
  };
  return loaded.factory((name) => (name === 'react' ? React : { createPortal: () => null }));
}

const VIEW = {
  modes: JSON.stringify({ chat: { label: 'Chat' }, cowork: { label: 'Cowork' }, code: { label: 'Code' } }),
  extraModes: JSON.stringify({ research: { label: 'Research' }, recon: { label: 'Recon' } }),
  sessionModes: JSON.stringify({ kept: 'code' }),
  defaultMode: 'recon',
};

test('client-mode-fallback (settings-plus): with spaces live, the space\'s start mode or Plain chat, never defaultMode', () => {
  const plugin = loadClient();
  // The Mode route said live and gave the space's start mode.
  assert.deepEqual(plugin.modeOf(VIEW, 'new', { live: true, start: 'research' }), { id: 'research', label: 'Research' });
  // Live, nothing given: Plain chat (built in), never the stale "recon".
  assert.deepEqual(plugin.modeOf(VIEW, 'new', { live: true }), { id: 'plain', label: 'Plain chat' });
  assert.deepEqual(plugin.modeOf(VIEW, 'new', { live: true, start: 'gone' }), { id: 'plain', label: 'Plain chat' }, 'a start mode that is not there');
  assert.deepEqual(plugin.modeOf(VIEW, undefined, { live: true }), { id: 'plain', label: 'Plain chat' }, 'the start page too');
  // The route was not asked (no thread, or it failed): Modes' settings with sessionSpaces mean spaces are live.
  const spacesView = { ...VIEW, sessionSpaces: '{}' };
  assert.equal(plugin.modeOf(spacesView, 'new').id, 'plain');
  assert.equal(plugin.modeOf(spacesView, undefined).id, 'plain');
  // A thread's own stored mode still comes first.
  assert.equal(plugin.modeOf(spacesView, 'kept').id, 'code');
  assert.equal(plugin.modeOf(VIEW, 'kept', { live: true, start: 'research' }).id, 'code');
  for (const [view, sessionId, spaces] of [[VIEW, 'new', { live: true }], [spacesView, 'x'], [spacesView, undefined], [VIEW, 'y', { live: true, start: 'recon-x' }]]) {
    assert.notEqual(plugin.modeOf(view, sessionId, spaces).id, 'recon', 'never the stored defaultMode while spaces are live');
  }
});

test('client-mode-fallback (settings-plus): without spaces, as before', () => {
  const plugin = loadClient();
  assert.equal(plugin.modeOf(VIEW, 'new').id, 'recon', 'an older Modes (no sessionSpaces): the default, as today');
  assert.equal(plugin.modeOf(VIEW, 'new', { live: false }).id, 'recon', 'the route said spaces are off');
  assert.deepEqual(plugin.modeOf(undefined, 'x'), { id: 'cowork', label: 'Cowork' });
  // The route's answer wins over the settings' hint either way.
  assert.equal(plugin.modeOf({ ...VIEW, sessionSpaces: '{}' }, 'new', { live: false }).id, 'recon');
});

test('client-mode-fallback (settings-plus): the gear asks the Mode route first and hands its live and current to modeOf', () => {
  const start = SOURCE.indexOf('function ModeGear(');
  const body = SOURCE.slice(start, SOURCE.indexOf('const page = pageForMode(', start));
  const ask = body.indexOf("'dsh-modes/mode'");
  const use = body.indexOf('mode = modeOf(view, sessionId, ');
  assert.ok(ask > 0 && use > ask, 'the route is asked before the fallback is worked out');
  assert.match(body, /live: viaMode\.value\?\.live === true, start: typeof current === 'string' \? current : ''/);
  assert.match(body, /'x-dsh-locale': 'en'/, 'English only (owner decision 28): the route answers in English');
  assert.doesNotMatch(body.replace(/\/\/.*$/gm, ''), /defaultMode/, 'the gear never reads defaultMode itself (comments aside)');
});
