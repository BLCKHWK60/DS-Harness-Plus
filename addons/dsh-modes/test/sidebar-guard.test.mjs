import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const piece = source.slice(source.indexOf('// ---- sidebar guard (1.0 review H2) ----'), source.indexOf('/** Watches the two rows'));
const sidebarFix = new Function(`${piece}\nreturn sidebarFix;`)();

test('exactly one of the app\'s sidebar and the Cowork sidebar is on (review H2: none left the owner without a sidebar)', () => {
  assert.equal(sidebarFix(false, false), 'stock-on');   // the Cowork row switched off alone: the app's own sidebar comes back
  assert.equal(sidebarFix(true, true), 'stock-off');    // the Cowork row switched on with the app's sidebar on: two sidebars would not load
  assert.equal(sidebarFix(true, false), null);          // the normal state with Cowork off
  assert.equal(sidebarFix(false, true), null);          // the normal state with Cowork on
});

test('the guard acts only on a wrong state seen twice, and does nothing without the Cowork sidebar installed', () => {
  assert.match(source, /wrongTimes >= 2/);
  assert.match(source, /stock && cowork \? sidebarFix/);
  assert.match(source, /manager\.setPluginEnabled\(stock\.entryId, fix === 'stock-on'\)/);
});
