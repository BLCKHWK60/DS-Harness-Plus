// Item 4A, stage 4 (22 November 2026): the Cowork switch under the chat box of a new Chat thread (off: standalone, its own
// folder; on: a project folder, the default workspace first) and, once the thread has started, the read-only place label
// ("Standalone" or the project's name). Start places per space; deleting a standalone thread takes its folder to the trash.
//   ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test test/cowork-switch.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const host = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

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
function constLine(name) {
  const match = source.match(new RegExp(`^\\s*const ${name} = .*;$`, 'm'));
  assert.ok(match, `client.js has no const ${name}`);
  return match[0];
}

const parts = new Function(`
  ${['SPACE_IDS', 'SPACE_TAB', 'DEFAULT_START_PLACES'].map(constLine).join('\n')}
  const isSpaceId = (id) => SPACE_IDS.includes(id);
  const startPlaceTable = { value: { ...DEFAULT_START_PLACES }, newKey: true };
  ${['coworkPlace', 'startPlaceOf'].map(functionText).join('\n')}
  return { coworkPlace, startPlaceOf, SPACE_TAB };
`)();

const scratch = { scratch: true, name: 'Scratch', title: 'hint' };
const project = { scratch: false, name: 'default-workspace', title: '/x/default-workspace' };

test('a new Chat thread shows the Cowork switch: off while it is standalone (Scratch), on in a project folder', () => {
  assert.deepEqual(parts.coworkPlace({ spacesOn: true, space: 'chat', blank: true, scratchKnown: true, place: scratch }), { kind: 'switch', on: false });
  assert.deepEqual(parts.coworkPlace({ spacesOn: true, space: 'chat', blank: true, scratchKnown: true, place: project }), { kind: 'switch', on: true });
  assert.equal(parts.coworkPlace({ spacesOn: true, space: 'chat', blank: true, scratchKnown: false, place: project }), null, 'no standalone place known: no switch (as the old Scratch / Folder switch)');
});

test('a started Chat thread shows a read-only label: "Standalone" or the project\'s name', () => {
  assert.deepEqual(parts.coworkPlace({ spacesOn: true, space: 'chat', blank: false, scratchKnown: true, place: scratch }), { kind: 'label', standalone: true, name: 'Scratch', title: 'hint' });
  assert.deepEqual(parts.coworkPlace({ spacesOn: true, space: 'chat', blank: false, scratchKnown: true, place: project }), { kind: 'label', standalone: false, name: 'default-workspace', title: '/x/default-workspace' });
  assert.equal(parts.coworkPlace({ spacesOn: true, space: 'chat', blank: false, scratchKnown: true, place: null }), null);
});

test('only in the Chat space and only with spaces: other spaces and the old tabs keep what they had', () => {
  for (const space of ['code', 'devices', 'recon', 'workshop']) assert.equal(parts.coworkPlace({ spacesOn: true, space, blank: true, scratchKnown: true, place: scratch }), null, space);
  assert.equal(parts.coworkPlace({ spacesOn: false, space: 'chat', blank: true, scratchKnown: true, place: scratch }), null);
  // The start page's Scratch / Folder switch stays for the other spaces and the tabs; in Chat the Cowork switch does it.
  assert.match(functionText('PlaceSwitch'), /if \(state\.spacesOn && selected\.space === 'chat'\) return null;/);
  // The chip above the box stays for the other spaces; a Chat thread's place is the label under the box.
  assert.match(functionText('PlaceStrip'), /if \(!place \|\| start \|\| chatPlaceUnder\(props\)\)/);
  assert.match(functionText('chatPlaceUnder'), /if \(!state\.spacesOn\) return false;[\s\S]*=== 'chat'/);
});

test('start places per space: Chat standalone, Code a project folder, Recon its room, Devices and Workshop a folder as today', () => {
  const place = (space) => parts.startPlaceOf(parts.SPACE_TAB[space]);
  assert.equal(place('chat'), 'scratch', 'Chat: Cowork off (Content, a mode inside Chat, starts there too)');
  assert.equal(place('code'), 'folder');
  assert.equal(place('recon'), 'room');
  assert.equal(place('devices'), 'folder');
  assert.equal(place('workshop'), 'folder');
});

test('the switch sits in the chat box row right after the Mode list (Modes\' seat), with an (i) in the owner\'s words', () => {
  assert.match(source, /name: 'conversation\.input\.left', id: 'cowork-switch', order: -20, inject: shared,\s*\}, CoworkPlace\)/);
  const body = functionText('CoworkPlace');
  assert.match(body, /querySelector\('\[data-dsh-seat="place"\]'\)/);
  assert.match(body, /ReactDOM\.createPortal\(/);
  assert.match(body, /role: 'switch'/);
  assert.match(body, /h\(ui\.Info, \{ title: t\('cowork\.label'\), what: t\('cowork\.info\.what'\)/);
  assert.match(body, /h\(ui\.Info, \{ title: t\('place\.info\.title'\)/);
  assert.match(body, /h\(ui\.ErrorNote, /, 'an error says what went wrong and what to click; raw text only behind Details');
  // Fix round: the same words as the started thread's (i): deleting moves the files to the trash, 30 days to put back.
  assert.match(source, /'cowork\.info\.what': 'Off: this thread keeps its own files in a private folder; deleting it moves them to the trash with it \(you can put them back for 30 days\)\. On: it works in a project folder you choose\.'/);
  assert.doesNotMatch(source, /deletes everything/, 'no (i) says a standalone thread is lost for good');
  assert.match(source, /'lib\.chats': 'Chats',/, 'the Chats group');
  assert.match(source, /'lib\.chats\.info\.when': 'New chat starts where Settings → Spaces says \(standalone by default\)\. Flip the Cowork switch under the chat box/);
  assert.doesNotMatch(source, /card view of projects comes later/, 'no roadmap note in an (i)');
  assert.match(source, /'place\.standalone': 'Standalone'/);
});

test('switching: on starts a draft in the default workspace (the app\'s folder picker shows it); off a standalone one; the mode and the text go along', () => {
  const body = functionText('switchCowork');
  assert.match(body, /homeFor\(library\.get\(\), 'chat'\)/);
  assert.match(body, /startLocked\(appCtx, 'chat', home\.workspaceId\)/);
  assert.match(body, /startInScratch\(appCtx, library, undefined, 'chat'\)/);
  assert.match(body, /modeCall\(\{ action: 'start', sessionId: id, space: 'chat', tab: mode \}/);
  assert.match(body, /fillDraft\(text, \{ onlyEmpty: true \}\)/, 'only into an empty box: a draft the app reuses keeps its own text');
  // The folder picker is hidden only for a standalone thread once spaces are live.
  assert.match(source, /const plainChat = spacesOn\s*\? selected\.id === 'chat' && libSnap\.ok && \(!currentWs \|\| hidden\.has\(roomKey\(currentWs\.path\)\)\)/);
});

test('every new text is there once, in English (owner decision 28: English only)', () => {
  const keys = [...source.matchAll(/^ {8}'((?:cowork|place\.(?:standalone|info))[\w.]*)':/gm)].map((m) => m[1]);
  const count = (key) => keys.filter((k) => k === key).length;
  for (const key of ['cowork.label', 'cowork.on', 'cowork.off', 'cowork.info.what', 'cowork.info.when', 'cowork.info.change', 'cowork.busy', 'cowork.close', 'cowork.failed.on', 'cowork.failed.off', 'cowork.failed.fix', 'cowork.noproject', 'place.standalone', 'place.info.title', 'place.info.what', 'place.info.when', 'place.info.change']) {
    assert.equal(count(key), 1, `${key}: English only`);
  }
});

test('deleting a standalone thread takes its own folder to the trash with it (put back for 30 days)', () => {
  assert.match(host, /trash\.add\(\{ id, title, parts, deletedAt, tab, fallbackTab, back, folders: scratchFoldersFrom\(stored, id, parts\) \}\);/);
  // A folder another thread or an automation still uses stays (scratchFoldersFrom); the trash's own tests cover put back.
  assert.match(host, /return shared \|\| used \? \[\] : \[folder\];/);
});
