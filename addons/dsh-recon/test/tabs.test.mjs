// The Recon tab's start page in the Cowork sidebar: a greeting and starter chips, the same in the
// sidebar's browser half and its host half, and chips that start in Recon's own folder. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const shell = (file) => fileURLToPath(new URL(`../../dsh-cowork-shell/${file}`, import.meta.url));

/** The DEFAULT_TABS object as written in the browser half (plain JSON between the braces). */
function clientTabs() {
  const source = readFileSync(shell('client.js'), 'utf8');
  const start = source.indexOf('const DEFAULT_TABS = {');
  const end = source.indexOf('\n    };\n', start);
  assert.ok(start > 0 && end > start, 'DEFAULT_TABS is in the browser half');
  return { tabs: JSON.parse(source.slice(source.indexOf('{', start), end + '\n    }'.length)), source };
}

test('the Recon tab has a greeting and starter chips, the same on both halves', async () => {
  const { tabs, source } = clientTabs();
  const { DEFAULT_TABS } = await import(shell('index.js'));
  const recon = tabs.recon;
  assert.ok(recon, 'the browser half has a Recon entry');
  assert.deepEqual(DEFAULT_TABS.recon, recon, 'the host half has the same entry');
  assert.ok(recon.greeting && recon.greeting.length <= 120, recon.greeting);
  assert.ok(recon.chips.length >= 3 && recon.chips.length <= 12);
  const icons = JSON.parse(/const CHIP_ICONS = (\{.*\});/.exec(source)[1]);
  for (const chip of recon.chips) {
    assert.ok(chip.label && chip.prompt, JSON.stringify(chip));
    assert.ok(Object.hasOwn(icons, chip.icon), `${chip.icon} is a known chip icon`);
    // Agreeing to a cloud model stays something the user types on purpose.
    assert.doesNotMatch(chip.prompt, /\/recon/);
  }
  // The other tabs are as they were.
  for (const id of ['chat', 'cowork', 'code', 'data', 'finance']) assert.deepEqual(DEFAULT_TABS[id], tabs[id], id);
});

test('Recon\'s chips start a conversation in Recon\'s own folder, like its New button', () => {
  const { source } = clientTabs();
  const chips = source.slice(source.indexOf('function HeroChips('), source.indexOf('const CHIP_ICONS'));
  // Through startRecon (18 November 2026): the room only, never the app's own choice of folder.
  assert.match(chips, /if \(selected\.id === 'recon'\) \{\s*startRecon\(appCtx, library, selected\.id, options\)/);
});
