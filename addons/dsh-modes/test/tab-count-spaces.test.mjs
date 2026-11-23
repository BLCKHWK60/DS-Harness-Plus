// Item 4A, stage 3b (22 November 2026): with the space buttons there are no mode tabs, so Settings → Modes no longer
// shows "Tabs in the sidebar" (1 to 5) or the "has no tab" note on a mode card; shown or hidden per space replaces it
// (stage 5). Without spaces (or when Modes' route cannot be asked) the page is as before.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

test('the editor asks Modes\' route whether the space buttons show, and keeps the tabs\' page when it cannot', () => {
  assert.match(source, /shell\.spaces = \(await modeRoute\(ctx, ''\)\)\?\.shown === true;/);
  assert.match(source, /\} catch \{\s*shell\.spaces = false;\s*\}/);
});

test('with spaces the tab count and the "no tab" note are not shown', () => {
  assert.match(source, /const tabless = shell && !shell\.spaces \? withoutTab\(rows, shell\.maxTabs\) : new Set\(\);/);
  assert.match(source, /shell && !shell\.spaces \? h\('div', \{ className: 'dsh-me-group' \}, t\('tabs\.group'\)\) : null,/);
  assert.match(source, /shell && !shell\.spaces\s*\? h\('div', null,\s*Choice\(t\('tabs\.count'\)/);
});
