// Item 4A, fix round after the review of stages 2 to 5 (22 November 2026): New starts a reused blank draft fresh in its
// space's start mode (`reset`), a blank draft shown in another space is claimed again for it, coming back to a space
// reopens its blank draft whatever mode it was given meanwhile, Move out of Recon is made inside its project, the
// window follows a started thread of another space at start, and the thread menu stays on screen.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

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
function constLine(name) {
  const match = source.match(new RegExp(`^\\s*const ${name} = .*;$`, 'm'));
  assert.ok(match, `client.js has no const ${name}`);
  return match[0];
}

/** claimNew on stand-ins: the library's open thread, Modes' route (modeCall) and the wait for the new blank draft. */
function claimNewWith({ on = true, opened = 'd1', fail = false } = {}) {
  const calls = [];
  const claimNew = new Function('spaceMode', 'waitForBlank', 'modeCall', `
    ${['SPACE_IDS', 'MODE_SPACE', 'isSpaceId'].map(constLine).join('\n')}
    ${['spaceOfModeId', 'spaceOfTabId'].map(functionText).join('\n')}
    // Item 4A, stage 6a: claimNew goes through startForSpace (Modes' start, plus its keptIn answer and the send wait).
    const startForSpace = (appCtx, library, id, space, extra = {}) => modeCall({ action: 'start', sessionId: id, space, ...extra });
    return async ${functionText('claimNew')};
  `)({ on }, async () => opened, async (body) => { calls.push(body); if (fail) throw new Error('offline'); return {}; });
  return { claimNew, calls };
}

test('New claims the thread it opens with reset, for the space of the tab id it was given', async () => {
  let run = claimNewWith();
  assert.equal(await run.claimNew({}, 'before', 'bench'), 'd1');
  assert.deepEqual(run.calls, [{ action: 'start', sessionId: 'd1', space: 'devices', reset: true }], "Devices' tab id is bench");
  run = claimNewWith();
  await run.claimNew({}, '', 'creator-plus');
  assert.equal(run.calls[0].space, 'workshop');
  run = claimNewWith();
  await run.claimNew({}, '', 'chat');
  assert.equal(run.calls[0].space, 'chat');
  run = claimNewWith({ on: false });
  assert.equal(await run.claimNew({}, '', 'chat'), '', 'without spaces nothing is claimed');
  assert.deepEqual(run.calls, []);
  run = claimNewWith({ opened: '' });
  assert.equal(await run.claimNew({}, '', 'chat'), '', 'no draft opened in time');
  run = claimNewWith({ fail: true });
  assert.equal(await run.claimNew({}, '', 'chat'), 'd1', 'a failed claim leaves the sidebar and the chat box to claim it');
});

test('startNew returns that claim on every path, and Ask about automations picks only after it', () => {
  const body = functionText('startNew');
  assert.match(body, /const claimed = claimNew\(library, before, tabId, appCtx\)\.catch\(\(\) => ''\);/);
  assert.equal((body.match(/return claimed;/g) ?? []).length, 3, 'the room, Scratch and folder paths');
  const inMode = functionText('startInMode');
  assert.match(inMode, /const opened = await startNew\(appCtx, library, SPACE_TAB\[space\]\);/);
  assert.ok(inMode.indexOf("action: 'pick'") > inMode.indexOf('await startNew('), 'the pick comes after the reset claim');
});

test('the open blank draft is claimed again when the window\'s space changes, after a short wait', () => {
  assert.match(source, /const CLAIM_WAIT_MS = 350;/);
  const start = source.indexOf("const openBlankId = spacesOn && libSnap.currentId");
  const effect = source.slice(start, source.indexOf('}, [openBlankId, selected.id]);', start) + 40);
  assert.match(effect, /const timer = setTimeout\(\(\) => \{/);
  // Item 4A, stage 6a: through startForSpace (a draft Modes keeps in another space opens a fresh one; a first send waits).
  assert.match(effect, /startForSpace\(appCtx, library, openBlankId, selectedRef\.current\)/);
  assert.match(effect, /return \(\) => clearTimeout\(timer\);/, 'a draft only passed through is not claimed');
  assert.match(effect, /\}, \[openBlankId, selected\.id\]\);/);
});

test('coming back to a space reopens its blank draft whatever mode it was given meanwhile', () => {
  const start = source.indexOf('const switchSpace = (m) => {');
  const body = source.slice(start, source.indexOf('const switchTab = (m) => {', start));
  assert.match(body, /\|\| \(!sess\.blank && spaceOfSession\(last, sess, ws, now\) !== m\.id\)/);
  assert.doesNotMatch(body, /claimedMode|spaceOfModeId\(/, 'a blank draft is never judged by its mode');
  assert.match(body, /\|\| !placeFits\(SPACE_TAB\[m\.id\], sess\);/, 'Recon still opens only a thread in its room');
});

test('at start, a started thread of another shown space switches the window to it, once', () => {
  const start = source.indexOf('const firstLook = useRef(false);');
  const effect = source.slice(start, source.indexOf('}, [spacesOn, libSnap.ok, libSnap.currentId, state.modesOn]);', start));
  assert.ok(start > 0 && effect.length > 0);
  assert.match(effect, /if \(!sess \|\| sess\.blank \|\| sess\.origin === 'subagent'\) return;/);
  assert.match(effect, /if \(own !== selected\.id && tabs\.some\(\(m\) => m\.id === own\)\) void model\.select\(own\);/);
  assert.match(effect, /firstLook\.current = true;/);
});

test('the thread menu moves up to stay on screen, and a project\'s Move to says space', () => {
  assert.match(source, /const keepOnScreen = \(node\) => \{/);
  assert.match(source, /if \(box\.bottom > window\.innerHeight - 8\) node\.style\.top = `\$\{Math\.max\(8, window\.innerHeight - 8 - box\.height\)\}px`;/);
  assert.match(source, /role: 'menu', style: \{ left: menu\.x, top: menu\.y \}, ref: keepOnScreen \}/);
  assert.match(source, /\.cws-ctx\{position:fixed;z-index:300;min-width:200px;max-width:280px;max-height:calc\(100vh - 16px\);overflow-y:auto;/);
  assert.match(source, /label: t\(spacesOn \? 'proj\.move\.space' : 'proj\.move', \{ title: ws\.title \|\| '' \}\)/);
  assert.match(source, /'proj\.move\.space': 'Move all threads of "\{title\}" to another space',/);
});

test('the Projects (i) says how to add, open and remove a project', () => {
  assert.match(source, /'projects\.info\.change': 'To add a project, use \+ New under Projects in the left panel\. To open one, click Open\. To remove one from the app, use ⋯ on its row; its folder and files stay on this Mac\.',/);
});
