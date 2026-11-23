// Item 4A, fix round (22 November 2026): with spaces there is no Automations tab. The same switch (field `tab`) is shown
// on Settings → Alerts as "Offer the Automations mode", the Ask button's off note names it (English only, decision 28), and the
// Automations page's filter never shows a raw mode id or says "tabs" under spaces.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

test('Settings → Alerts: with spaces the row is "Offer the Automations mode", same field; without, the tab row as before', () => {
  assert.match(source, /spacesShown\(\)\s*\? h\(Row, \{ title: askWords\(pageLangOf\(\)\)\.row\.title, hint: data\.tabProblem \|\| askWords\(pageLangOf\(\)\)\.row\.hint \}, h\(Switch, \{ on: data\.settings\?\.tab !== false, label: askWords\(pageLangOf\(\)\)\.row\.title, onChange: \(on\) => saveOwn\(\{ tab: on \}\) \}\)\)/);
  assert.match(source, /: h\(Row, \{ title: 'The Automations mode'/, 'the old layout keeps its row');
  assert.match(source, /row: \{ title: 'Offer the Automations mode', hint: 'Offers the Automations mode in Chat\\'s Mode list under the chat box; "Ask about automations" on the Automations page opens a new thread in it\. Off takes the mode away\.' \},/);
  assert.doesNotMatch(source, /row: \{ title: '[^']*[\u4e00-\u9fff]/, 'no Chinese row');
});

test('the Ask button\'s off note names the new row; there is no Chinese note', () => {
  assert.match(source, /off: 'The Automations mode is switched off, so this button cannot open it\. Switch on "Offer the Automations mode" on Settings → Alerts\.',/);
  assert.equal((source.match(/^\s*off: '/gm) ?? []).length, 1, 'one off note, in English');
  assert.doesNotMatch(source, /“The Automations tab”/);
});

test('the filter names modes, never raw ids, and says "All modes" under spaces', () => {
  const names = new Function(`${source.match(/^\s*const MODE_NAMES = .*;$/m)[0]}\n${source.match(/^\s*const tabName = .*;$/m)[0]}\nreturn tabName;`)();
  assert.equal(names('creator-plus'), 'Creator Plus');
  assert.equal(names('bench'), 'Devices');
  assert.equal(names('plain'), 'Plain chat');
  assert.equal(names('my-own-mode'), 'My Own Mode');
  assert.equal(names(''), '');
  assert.match(source, /'aria-pressed': String\(!tab\), onClick: \(\) => setTab\(''\) \}, 'All modes'\)/);
});

// Item 4A, round 2 (UI and text): the Alerts row for where an automation's new threads open says mode and thread.
test('Settings → Alerts: "New threads use the automation\'s mode", same setting, in English also for a page that reports Chinese', () => {
  const words = new Function(`${source.slice(source.indexOf('function ownModeWords('), source.indexOf('function openAlertsRow('))}\nreturn ownModeWords;`)();
  assert.equal(words('en').title, 'New threads use the automation\'s mode');
  assert.equal(words('zh').title, 'New threads use the automation\'s mode');
  for (const lang of ['en', 'zh']) for (const part of ['what', 'change']) assert.ok(words(lang)[part], `${lang} ${part}`);
  assert.match(source, /h\(ui\.Switch, \{ on: data\.settings\?\.runsInTheirTab !== false, label: ownModeWords\(pageLangOf\(\)\)\.title, onChange: \(on\) => saveOwn\(\{ runsInTheirTab: on \}\) \}\)/);
  assert.doesNotMatch(source, /New chats open in the automation\\'s tab/);
  assert.match(source, /openAlertsRow\(appCtx, ownModeWords\(pageLangOf\(\)\)\.title\)/, 'the link finds the renamed row');
});
