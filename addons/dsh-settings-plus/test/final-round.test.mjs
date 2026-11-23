// Item 4A, final fix round (Chinese lab: low): search results named sections the page no longer has ("Modes › Built-in
// working methods" for the Plain chat folder row, "New conversations" for the New threads rows), and the new per-add-on
// carry marker (modes.plainCarriedIn) is in the index as internal, like plainCarried.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const INDEX = JSON.parse(readFileSync(new URL('../settings-index.json', import.meta.url), 'utf8'));

test('search paths match the Modes page headings', () => {
  assert.equal(INDEX.find((entry) => entry.field === 'modes.plainFence')?.heading, "Plain chat's folder");
  assert.deepEqual(INDEX.filter((entry) => entry.page === 'modes' && /conversations/i.test(entry.heading)).map((entry) => entry.field), []);
  assert.equal(INDEX.find((entry) => entry.field === 'modes.searchDepth')?.heading, 'New threads');
});

test('the per-add-on carry marker is listed as internal', () => {
  const entry = INDEX.find((one) => one.field === 'modes.plainCarriedIn');
  assert.ok(entry);
  assert.equal(entry.internal, true);
  assert.equal(entry.configOnly, true);
});
