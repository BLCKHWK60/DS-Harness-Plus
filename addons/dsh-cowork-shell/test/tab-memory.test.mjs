import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The rule: a tab opens again only a conversation of its own. Tabs that start in the same place share the
// app's one empty draft, so a draft that Chat or Finance remembered could get its first message in Scout;
// clicking Chat or Finance then brought back Scout's research run (owner's report, 18 November 2026).
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

/** The text of `function name(...) { ... }` in the bundle, found by matching braces. */
function functionText(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `client.js has no function ${name}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && (depth -= 1) === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
}

const reopensIn = new Function(`${functionText('reopensIn')}\nreturn reopensIn;`)();

const tabIds = ['chat', 'cowork', 'code', 'finance', 'data', 'recon', 'scout', 'research', 'content', 'bench', 'creator-plus'];
const state = { sessionModes: { run: 'scout', old: 'chat', locked: 'isolated-locked' } };

test('a Scout conversation is reopened by Scout and by no other tab', () => {
  const run = { blank: false };
  assert.equal(reopensIn('scout', 'run', run, state, tabIds), true);
  for (const tab of tabIds.filter((id) => id !== 'scout')) assert.equal(reopensIn(tab, 'run', run, state, tabIds), false, tab);
});

test('every tab follows the same rule: its own conversations only', () => {
  for (const owner of tabIds) {
    const modes = { sessionModes: { s: owner } };
    for (const tab of tabIds) assert.equal(reopensIn(tab, 's', { blank: false }, modes, tabIds), tab === owner, `${owner} in ${tab}`);
  }
});

test('an empty draft still opens in any tab (the app shares it; the start page follows the tab)', () => {
  assert.equal(reopensIn('chat', 'run', { blank: true }, state, tabIds), true);
  assert.equal(reopensIn('finance', 'draft', { blank: true }, state, tabIds), true);
});

test('a conversation with no recorded mode, or a mode with no tab, opens as before', () => {
  assert.equal(reopensIn('cowork', 'new', { blank: false }, state, tabIds), true);
  assert.equal(reopensIn('recon', 'locked', { blank: false }, state, tabIds), true);
  assert.equal(reopensIn('chat', 'run', { blank: false }, {}, tabIds), true);
});

test('a conversation that no longer exists is never reopened', () => {
  assert.equal(reopensIn('scout', 'run', null, state, tabIds), false);
  assert.equal(reopensIn('scout', 'run', undefined, state, tabIds), false);
});

test('a tab click checks the rule, also when the remembered conversation is the open one', () => {
  const body = source.slice(source.indexOf('const switchTab = (m) => {'), source.indexOf('/** Save a new order'));
  assert.match(body, /\|\| !reopensIn\(m\.id, last, sess, model\.get\(\), usualTabsOf\(model\.get\(\)\)\.map/);
  // `gone` (which starts the tab's start page) includes the rule, so an open foreign conversation is left too.
  assert.match(body, /if \(gone\) startNew\(appCtx, library, m\.id\);/);
});

test('the tab a draft ends up in remembers it once its mode is recorded', () => {
  const start = source.indexOf('writeLast(sess.blank ? selectedRef.current : tab, id);');
  const deps = source.slice(start, source.indexOf(']);', start) + 3);
  assert.match(deps, /libSnap\.byId\[libSnap\.currentId\]\?\.blank/);
  assert.match(deps, /state\.sessionModes\?\.\[libSnap\.currentId\]/);
  // Its mode is asked for right after its first message, not at the next 10-second refresh.
  // (Item 4A: with the space buttons, until its space is recorded.)
  assert.match(deps, /if \(!sess\.blank && \(now\.spacesOn \? now\.sessionSpaces\?\.\[id\] : now\.sessionModes\?\.\[id\]\) === undefined\) \{\s*const timer = setTimeout\(\(\) => void model\.refresh\(\), 700\);/);
});

// Recon's room (18 November 2026): a conversation started from the Recon tab always lands in Recon's
// private room, never in a draft another tab's folder has, and no other tab opens a draft in the room.
function constLine(name) {
  const match = source.match(new RegExp(`^\\s*const ${name} = .*;$`, 'm'));
  assert.ok(match, `client.js has no const ${name}`);
  return match[0];
}
const room = new Function(`${constLine('DEFAULT_START_PLACES')}\n${constLine('startPlaceTable')}\n${functionText('startPlaceOf')}\n${constLine('roomKey')}\n${constLine('rooms')}\n${constLine('isolatedRooms')}\n${functionText('inIsolatedRoom')}\n${functionText('placeFits')}\nreturn { placeFits, inIsolatedRoom, isolatedRooms, rooms, roomKey };`)();

test('Recon opens only a conversation in its room; no other tab opens one there', () => {
  const inRoom = { blank: true, cwd: '/private/tmp/dsh-recon-room' };
  const codeDraft = { blank: true, cwd: '/Users/someone/Books' };
  assert.equal(room.placeFits('recon', inRoom), true);
  assert.equal(room.placeFits('recon', codeDraft), false, 'a draft of Code\'s folder is not a Recon start page');
  for (const tab of ['chat', 'cowork', 'code', 'data', 'bench', 'finance', 'scout']) {
    assert.equal(room.placeFits(tab, inRoom), false, `${tab} never opens a draft in Recon's room`);
    assert.equal(room.placeFits(tab, codeDraft), true, tab);
  }
});

test('a test copy\'s room counts once it is learnt; the Scratch place is not a Recon room', () => {
  assert.equal(room.inIsolatedRoom('/private/tmp/dsh-recon-lab'), false);
  room.isolatedRooms.add(room.roomKey('/private/tmp/dsh-recon-lab'));
  assert.equal(room.inIsolatedRoom('/tmp/dsh-recon-lab'), true);
  assert.equal(room.inIsolatedRoom('/private/tmp/dsh-recon-lab/run-1'), true);
  assert.equal(room.inIsolatedRoom('/private/tmp/dsh-recon-labs'), false);
  room.rooms.add('/Users/someone/.dsh/scratch');
  assert.equal(room.inIsolatedRoom('/Users/someone/.dsh/scratch/abc'), false);
});

test('a Recon start never falls back to another folder, and the room is learnt up front', () => {
  // Every start from the Recon tab (New, tab click, chips) goes through startRecon.
  assert.doesNotMatch(source, /startInRoom\([^)]*\)\.then\(\(done\) => \{ if \(!done\) appCtx\.uiWorkspace\.startSession\(undefined/);
  assert.match(functionText('startNew'), /if \(place === 'room'\) \{\s*startRecon\(appCtx, library, tabId\);/);
  assert.match(source, /if \(selected\.id === 'recon'\) \{\s*startRecon\(appCtx, library, selected\.id, options\);/);
  assert.doesNotMatch(functionText('startRecon'), /startSession/);
  assert.match(functionText('startInRoom'), /isolatedRooms\.add\(roomKey\(room\)\);/);
  assert.match(source, /void learnScratch\(\);\s*void learnRoom\(\);/);
  const body = source.slice(source.indexOf('const switchTab = (m) => {'), source.indexOf('/** Save a new order'));
  assert.match(body, /\|\| !placeFits\(m\.id, sess\);/);
});

// Moving a Recon conversation out (18 November 2026, the owner's choice B).
test('Move to on a conversation that began in Recon opens a new one of that tab; any other moves as before', () => {
  const fromReconRow = new Function(`${functionText('fromReconRow')}\nreturn fromReconRow;`)();
  const state = { sessionIsolated: { r: true, late: false } };
  assert.equal(fromReconRow('r', { blank: false }, state), true);
  assert.equal(fromReconRow('r', { blank: true }, state), false, 'an empty draft just moves');
  assert.equal(fromReconRow('late', { blank: false }, state), false, 'moved INTO Recon after it ran: holds nothing of Recon');
  assert.equal(fromReconRow('c', { blank: false }, state), false);
  const start = source.indexOf('const moveTo = async (ids, modeId, whole) => {');
  const moveTo = source.slice(start, source.indexOf('\n      };\n', start));
  assert.match(moveTo, /modeId === 'recon' \? \[\] : ids\.filter\(\(id\) => fromReconRow\(id, lib\.byId\[id\], state\)\)/);
  assert.match(moveTo, /if \(rest\.length > 0\) await model\.move\(rest, modeId\);/);
  assert.match(moveTo, /model\.note\(t\(done\.drafted \? \(done\.files > 0 \? 'move\.reconDraftFiles' : 'move\.reconDraft'\) : done\.files > 0 \? 'move\.reconFiles' : 'move\.recon', \{ tab: done\.label, n: done\.files \}\)\)/);
  // Both Move to menus (a conversation, a project's conversations) go through it.
  assert.equal((source.match(/onMove: \(modeId\) => void moveTo\(/g) ?? []).length, 2);
  assert.doesNotMatch(source, /onMove: \(modeId\) => void model\.move\(/);
});

test('the new conversation opens in the tab\'s usual place, never a room, and says what happened', () => {
  const body = functionText('moveOutOfRecon');
  assert.match(body, /if \(startPlaceOf\(tabId\) === 'scratch'\)/);
  assert.match(body, /const home = homeFor\(library\.get\(\), tabId\);/);
  assert.match(body, /if \(!cwd \|\| inIsolatedRoom\(cwd\)\) throw/);
  // Fix round (item 4A): made inside its project, so the app knows where it is and the chat box is not locked on
  // "Choose a workspace to start" (spaces hide the folder picker in Chat).
  assert.match(body, /if \(known\) workspaceId = String\(known\.workspaceId \?\? ''\);/);
  assert.match(body, /workspaceId = String\(made\?\.workspaceId \?\? ''\);/);
  assert.match(body, /workspaceId = cwd \? String\(home\.workspaceId \?\? ''\) : '';/);
  assert.match(body, /const where = workspaceId \? \{ workspaceId \} : \{ cwd \};/);
  assert.match(body, /await sessions\.create\(\{ \.\.\.where, agentPreset: preset \}\) : await sessions\.create\(where\)/);
  assert.match(body, /action: 'move', session: id, tab: tabId, sessionId: child, folder: scratch \? `\$\{cwd\}\/\$\{child\}` : cwd, title/);
  assert.match(body, /workspace\.openSession\(child\);/);
  assert.match(source, /'move\.recon': 'Opened as a new \{tab\} thread; the Recon original stays in Recon\.',/);
  assert.match(source, /patch\.sessionIsolated = readObject\(modesNs\.value\?\.sessionIsolated\);/);
});
