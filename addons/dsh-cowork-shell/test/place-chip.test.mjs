import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

test('place chip: Scratch, or the project\'s name, in a strip ABOVE the chat box at the top left; the old mark comes back with the Modes switch off', () => {
  const start = source.indexOf('function placeOf(');
  const body = source.slice(start, source.indexOf('\n    }\n', start));
  assert.match(body, /place\.scratch\.hint/, 'a Scratch conversation shows Scratch');
  assert.match(body, /rooms\.has\(roomKey\(ws\.path\)\)/, 'not in Recon\'s room');
  assert.match(body, /data-cws-plain-chat/, 'not in Chat, which has no folders');
  assert.match(source, /conversation\.input\.dock', \(\) => ctx\.slots\.register\(\{\s*name: 'conversation\.input\.dock', id: 'cowork-place-strip', order: -50/, 'above the chat box, first in the dock');
  assert.match(source, /conversation\.hero\.workspace/, 'not on the start page, where the app\'s own folder chip is');
  assert.match(source, /id: 'cowork-scratch-mark', order: -30/, 'the old mark keeps its old place');
  assert.match(source, /html\[data-dsh-uniform="true"\] \[data-slot="conversation\.input\.left"\] \.cws-scratch-mark\{display:none\}/, 'switch on: nothing about the place inside the box');
  assert.match(source, /html:not\(\[data-dsh-uniform="true"\]\) \.cws-place-strip\{display:none\}/, 'switch off: no strip');
});
