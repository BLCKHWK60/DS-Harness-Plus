// Stage 7 (6b lab leftover 8; 6a decision: no Recon text reaches other spaces): Recon's room and its threads are hidden
// from other spaces' Show all (the app's own list, by its data-row-key) and from the chat box's "Choose workspace" list
// (the app's own menu, by the row's name or path). In Recon, and without spaces, nothing is hidden.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
function functionText(name) {
  const start = source.search(new RegExp(`(async )?function ${name}\\(`));
  assert.ok(start >= 0, `client.js has no function ${name}`);
  let depth = 0;
  for (let i = source.indexOf(') {', source.indexOf(`function ${name}(`)) + 2; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && (depth -= 1) === 0) return source.slice(start, i + 1);
  }
  throw new Error(name);
}
const constLine = (name) => source.match(new RegExp(`^\\s*const ${name} = .*;$`, 'm'))[0];
const parts = new Function(`
  ${['roomKey', 'isolatedRooms', 'SAFE_KEY'].map(constLine).join('\n')}
  isolatedRooms.add(roomKey('/private/tmp/dsh-recon-lab-3'));
  ${['inIsolatedRoom', 'reconPlaces', 'reconHideCss', 'hideRoomMenuRows'].map(functionText).join('\n')}
  return { reconPlaces, reconHideCss, hideRoomMenuRows };
`)();

const LIB = {
  workspaces: [
    { workspaceId: 'ws-room', path: '/private/tmp/dsh-recon-lab-3', title: 'Recon room', sessionIds: ['s-r1', 's-r2'] },
    { workspaceId: 'ws-proj', path: '/Users/me/proj', title: 'proj', sessionIds: ['s-p1'] },
  ],
};
const STATE = { sessionSpaces: { 's-p1': 'code', 's-moved': 'recon' }, sessionIsolated: { 's-own': true, 's-r9': true }, sessionModes: { 's-own': 'mine' }, ownIsolatedModes: ['mine'] };

test('recon-hidden-in-show-all: the room\'s group and Recon threads are hidden outside Recon only', () => {
  const places = parts.reconPlaces(LIB, STATE);
  assert.deepEqual(places.ids, ['ws-room']);
  assert.deepEqual(places.sessions.sort(), ['s-moved', 's-r1', 's-r2', 's-r9']);
  assert.ok(!places.sessions.includes('s-own'), 'an owner\'s own isolated mode is not Recon');
  assert.deepEqual(places.labels, ['Recon room']);
  const css = parts.reconHideCss(places);
  assert.match(css, /html\[data-cws-space\]:not\(\[data-cws-space="recon"\]\) \[class\*='groupSection'\]:has\(> \[data-row-key="workspace:ws-room"\], > \* > \[data-row-key="workspace:ws-room"\]\)\{display:none !important\}/);
  assert.match(css, /\[data-row-key="session:s-r1"\]/);
  assert.doesNotMatch(css, /ws-proj|s-p1/, 'other projects stay');
  assert.equal(parts.reconHideCss(parts.reconPlaces({ workspaces: [LIB.workspaces[1]] }, {})), '', 'no room: nothing');
  // An id that is not a plain key never reaches the CSS.
  assert.deepEqual(parts.reconPlaces({ workspaces: [{ ...LIB.workspaces[0], workspaceId: 'x"]{}' }] }, {}).ids, []);
});

/** A small stand-in document with menu rows. */
function doc(space, rows) {
  const attrs = { 'data-cws-space': space };
  const made = rows.map(({ text, title }) => {
    const own = new Map();
    const style = new Map();
    return {
      textContent: text,
      hidden: false,
      style: { setProperty: (key, value, priority) => style.set(key, `${value} ${priority}`), removeProperty: (key) => style.delete(key), get: (key) => style.get(key) },
      querySelectorAll: () => (title ? [{ getAttribute: () => title }] : []),
      setAttribute: (key, value) => own.set(key, value),
      removeAttribute: (key) => own.delete(key),
      hasAttribute: (key) => own.has(key),
    };
  });
  return { rows: made, documentElement: { getAttribute: (key) => attrs[key] ?? null }, querySelectorAll: () => made, set: (value) => { attrs['data-cws-space'] = value; } };
}

test('recon-hidden-in-choose-workspace: the room\'s row in the workspace list is hidden outside Recon, shown again in Recon', () => {
  const places = parts.reconPlaces(LIB, STATE);
  const d = doc('chat', [{ text: 'proj' }, { text: ' Recon room ' }, { text: 'Recon room lab-3', title: '/private/tmp/dsh-recon-lab-3' }, { text: 'Add workspace' }]);
  parts.hideRoomMenuRows(d, places);
  assert.deepEqual(d.rows.map((row) => row.hidden), [false, true, true, false]);
  // The app's menu row CSS (`display: flex`) beats `hidden`: the row is hidden inline too.
  assert.deepEqual(d.rows.map((row) => row.style.get('display') ?? ''), ['', 'none important', 'none important', '']);
  d.set('recon');
  parts.hideRoomMenuRows(d, places);
  assert.deepEqual(d.rows.map((row) => row.hidden), [false, false, false, false], 'in Recon it is listed');
  assert.deepEqual(d.rows.map((row) => row.style.get('display') ?? ''), ['', '', '', '']);
  const none = doc(null, [{ text: 'Recon room' }]);
  parts.hideRoomMenuRows(none, places);
  assert.equal(none.rows[0].hidden, false, 'without spaces: as before');
});

test('the watcher is started with the page and stops with it', () => {
  assert.match(source, /ctx\.effect\(\(\) => watchReconElsewhere\(document, library, model\)\);/);
  const watcher = functionText('watchReconElsewhere');
  assert.match(watcher, /return \(\) => \{ offLib\?\.\(\); offModel\?\.\(\); watch\?\.disconnect\(\); style\.remove\(\); \};/);
});
